import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { InstancedShips, LASER_GREEN, LASER_RED, segmentSphere } from '../../weapons.js';
import { SeismicCharges } from './seismicCharges.js';
import { createFuelHose } from './fuelHose.js';
import { createTargetMarker } from '../../ui/targetMarkers.js';

// =========================================================================================
// MISSION "HYPERCARBURANT" : escorter le croiseur-citerne, puis abattre le Slave I
// =========================================================================================
// 1. ESCORTE   le croiseur-citerne part de l'Executor vers la station d'hypercarburant,
//              avec des TIE Interceptor ; des TIE Fighter surveillent la station.
// 2. CHARGEMENT le croiseur s'amarre, la jauge d'hypercarburant se remplit.
// 3. À 50 %    cinématique : Boba Fett arrive à bord du Slave I et tire sur le croiseur.
// 4. POURSUITE une fois plein, le croiseur repart vers l'Executor, le Slave I à ses trousses.
//              Il faut détruire le Slave I avant qu'il n'immobilise le croiseur (jauge
//              CROISEUR à 0 : il vole l'hypercarburant). Il largue des charges sismiques :
//              ne pas croiser leurs anneaux de lumière !
// Les modèles ne sont chargés qu'au premier lancement de la mission (rien en mémoire avant).
export const FUEL = {
    TANK_SCALE: 1.4,                    // croiseur-citerne (~880 de long)
    BASE_SCALE: 3.5,                    // station (~1400 de haut)
    SLAVE_SCALE: 1.4,                   // Slave I (~35 de haut, comme un gros chasseur)
    TANK_HALF: new THREE.Vector3(241, 80, 439),
    BASE_POS: new THREE.Vector3(2400, 950, 5600),
    TANK_START: new THREE.Vector3(0, 450, 1500),
    PLAYER_START: [new THREE.Vector3(0, 200, -150), new THREE.Vector3(0, 380, 350), new THREE.Vector3(0, 520, 760)],
    ESCORT_SPEED: 160,
    CHASE_SPEED: 180,
    PLAYER_CRUISE: { escort: 175, refuel: 90, chase: 200 },
    REFUEL_TIME: 40,                    // secondes pour un plein (0 → 100 %)
    SLAVE_HITS: 45,                     // tirs pour abattre le Slave I
    TANK_DAMAGE: 1.6,                   // dégâts d'un tir du Slave I sur le croiseur
    SLAVE_FIRE: [0.7, 1.2],             // secondes entre deux tirs du Slave I
    EVADE_TIME: 1.3,                    // touché : il esquive (et ne tire plus) un instant
    CHARGE_EVERY: [4.5, 6.5],           // secondes entre deux charges sismiques
    GUARDS: 6, ESCORTS: 4
};
// point d'amarrage : le flanc du croiseur contre les quais de la station (côté -x)
const DOCK = FUEL.BASE_POS.clone().add(new THREE.Vector3(-(180 * FUEL.BASE_SCALE + FUEL.TANK_HALF.x + 40), -56, 0));
const OUT_ROUTE = [FUEL.TANK_START, new THREE.Vector3(250, 600, 2800), new THREE.Vector3(1000, 800, 4100),
                   new THREE.Vector3(DOCK.x, DOCK.y, 4900), DOCK];
const BACK_ROUTE = [DOCK, new THREE.Vector3(1300, 900, 6800), new THREE.Vector3(-200, 760, 7000),
                    new THREE.Vector3(-1300, 620, 5200), new THREE.Vector3(-1100, 520, 3200),
                    new THREE.Vector3(-300, 460, 1800), new THREE.Vector3(0, 450, 1100)];
const ESCORT_SLOTS = [new THREE.Vector3(-330, 70, -120), new THREE.Vector3(330, 70, -120),
                      new THREE.Vector3(-260, -90, 300), new THREE.Vector3(260, -90, 300)];

function rand(a, b) { return a + Math.random() * (b - a); }
const fwdOf = (obj, out = new THREE.Vector3()) => out.set(0, 0, 1).applyQuaternion(obj.quaternion);

// suit une courbe à vitesse donnée
class Route {
    constructor(points) { this.curve = new THREE.CatmullRomCurve3(points.map(p => p.clone())); this.length = this.curve.getLength(); this.s = 0; }
    advance(ds) { this.s = Math.min(this.length, this.s + ds); }
    get u() { return this.s / this.length; }
    get remaining() { return this.length - this.s; }
    point(out) { return this.curve.getPointAt(this.u, out); }
    tangent(out) { return this.curve.getTangentAt(this.u, out); }
}

export function initFuelMission(ctx, { hud, cine, returnToHangar }) {
    const { scene, camera, state } = ctx;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const load = (url) => new Promise((res, rej) => loader.load(url, g => res(g.scene), undefined, rej));

    let assets = null, loading = null;
    let running = false, run = 0, phase = 'off', phaseTime = 0, cinematic = null;
    let fuel = 0, tankHp = 100, slaveHp = FUEL.SLAVE_HITS;
    let route = null, tankSpeed = 0;
    let slaveFireTimer = 0, chargeTimer = 0, evade = 0, escortFireTimer = 0;

    const tank = new THREE.Group();
    const base = new THREE.Group();
    const slave = new THREE.Group();
    slave.userData = { velocity: new THREE.Vector3(), dead: false };
    let slaveModel = null;
    const tankVel = new THREE.Vector3();
    const tankHullPoints = [];                  // points de la coque (repère du croiseur) : impacts
    const escorts = [], guards = [];
    let escortShips = null, guardShips = null;
    const guardOrbits = [];

    const hoses = [createFuelHose(scene), createFuelHose(scene)];
    const tankMarker = createTargetMarker('CROISEUR', '#6fe0ff');
    const slaveMarker = createTargetMarker('SLAVE I', '#ff5a3a');

    const charges = new SeismicCharges(scene, ctx.battle.fx, {
        onDetonate: (pos) => ctx.audio.playAt(ctx.audio.sfx.seismic, pos, 1, 0.1, 0.95 + Math.random() * 0.1),
        onHit: () => seismicHit()
    });

    // -------------------------------------------------------------------------------------
    // Chargement des modèles (une seule fois)
    // -------------------------------------------------------------------------------------
    function loadAssets() {
        if (loading) return loading;
        loading = Promise.all([
            load('public/croiser_tank.glb'), load('public/base_hypercarburant.glb'), load('public/slave_one.glb'),
            load('public/tieinterlow.glb'), load('public/tie_fighter.glb')
        ]).then(([tankModel, baseModel, slaveM, interceptor, fighter]) => {
            tankModel.scale.setScalar(FUEL.TANK_SCALE);
            tank.add(tankModel);
            tank.updateMatrixWorld(true);
            // points de la coque pour les impacts (dans le repère du croiseur)
            const v = new THREE.Vector3();
            tankModel.traverse(o => {
                if (!o.isMesh) return;
                const pos = o.geometry.attributes.position;
                for (let i = 0; i < 60; i++) {
                    v.fromBufferAttribute(pos, Math.floor(Math.random() * pos.count)).applyMatrix4(o.matrixWorld);
                    tankHullPoints.push(v.clone());
                }
            });

            baseModel.scale.setScalar(FUEL.BASE_SCALE);
            base.add(baseModel);
            base.position.copy(FUEL.BASE_POS);

            slaveM.scale.setScalar(FUEL.SLAVE_SCALE);
            slaveM.position.set(0, 1.82, -1.86).multiplyScalar(FUEL.SLAVE_SCALE);   // centré
            slaveModel = slaveM;
            slave.add(slaveM);

            // TIE Interceptor d'escorte et TIE Fighter de garde (instanciés : 1 appel de dessin par pièce)
            interceptor.scale.setScalar(0.5);
            interceptor.rotation.y = Math.PI;            // avant → +Z
            escortShips = new InstancedShips(scene, interceptor, FUEL.ESCORTS);
            for (let i = 0; i < FUEL.ESCORTS; i++) {
                const g = new THREE.Group(); g.visible = false; escortShips.add(g); escorts.push(g);
            }
            fighter.scale.setScalar(0.016);
            guardShips = new InstancedShips(scene, fighter, FUEL.GUARDS);
            for (let i = 0; i < FUEL.GUARDS; i++) {
                const g = new THREE.Group(); g.visible = false; guardShips.add(g); guards.push(g);
                guardOrbits.push({ angle: (i % 3) * 0.32 + (i < 3 ? 0 : Math.PI), dir: i < 3 ? 1 : -1,
                                   radius: i < 3 ? 1150 : 1350, alt: i < 3 ? 420 : -260, slot: i % 3 });
            }
            assets = true;
        });
        return loading;
    }

    // -------------------------------------------------------------------------------------
    // Déroulement
    // -------------------------------------------------------------------------------------
    function setPhase(p) { phase = p; phaseTime = 0; }

    async function start() {
        const me = ++run;
        running = true;
        cinematic = null;
        state.mission = 'fuel';
        state.cruiseSpeed = FUEL.PLAYER_CRUISE.escort;
        fuel = 0; tankHp = 100; slaveHp = FUEL.SLAVE_HITS;
        evade = 0;
        hud.show('HYPERCARBURANT', "ESCORTE LE CROISEUR JUSQU'À LA STATION D'HYPERCARBURANT", [
            { id: 'fuel', label: 'HYPERCARBURANT', kind: 'fuel' },
            { id: 'tank', label: 'CROISEUR', kind: 'health' },
            { id: 'slave', label: 'SLAVE I', kind: 'enemy' }
        ]);
        hud.setTime(null);
        hud.setBar('fuel', 0);
        hud.setBar('tank', 100);
        hud.setBar('slave', 100);
        hud.showBar('slave', false);
        ctx.hud.setScoreLines([]);
        ctx.battle.announce("Escorte le croiseur-citerne !");
        ctx.landing.flyTo(FUEL.PLAYER_START, Math.PI, 5);
        setPhase('loading');

        await loadAssets();
        if (me !== run) return;
        scene.add(tank, base);
        route = new Route(OUT_ROUTE);
        tankSpeed = 0;
        placeTank(0);
        escorts.forEach(e => { e.visible = true; });
        guards.forEach(g => { g.visible = true; });
        slave.visible = false;
        slave.userData.dead = false;
        setPhase('escort');                 // le croiseur part pendant que le TIE se place derrière lui
    }

    function stop() {
        run++;
        running = false;
        cinematic = null;
        phase = 'off';
        state.cruiseSpeed = null;
        if (state.mission === 'fuel') state.mission = null;
        scene.remove(tank, base, slave);
        if (slaveModel) jump('in', 1);         // (taille normale après un saut)
        escorts.forEach(e => { e.visible = false; });
        guards.forEach(g => { g.visible = false; });
        if (escortShips) { escortShips.update(); guardShips.update(); }
        hoses.forEach(h => h.hide());
        charges.clear();
        tankMarker.update(null);
        slaveMarker.update(null);
        hud.hide();
        ctx.hud.setScoreLines(null);
    }

    // -------------------------------------------------------------------------------------
    // Croiseur-citerne
    // -------------------------------------------------------------------------------------
    const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _prev = new THREE.Vector3(), _look = new THREE.Object3D();
    function placeTank(dt) {
        const prev = _prev.copy(tank.position);
        route.point(_p);
        tank.position.copy(_p);
        route.tangent(_t);
        _look.position.copy(_p);
        _look.lookAt(_p.clone().add(_t));
        if (dt > 0) {
            tank.quaternion.slerp(_look.quaternion, 1 - Math.exp(-2 * dt));
            tankVel.subVectors(tank.position, prev).divideScalar(dt);
        } else {
            tank.quaternion.copy(_look.quaternion);
            tankVel.set(0, 0, 0);
        }
    }

    function moveTank(dt, speed) {
        // freinage en douceur à l'arrivée (amarrage)
        const target = Math.min(speed, Math.max(6, route.remaining * 0.32));
        tankSpeed += (target - tankSpeed) * (1 - Math.exp(-1.2 * dt));
        route.advance(tankSpeed * dt);
        placeTank(dt);
    }

    function tankPoint() {
        const p = tankHullPoints[Math.floor(Math.random() * tankHullPoints.length)] || new THREE.Vector3();
        return tank.localToWorld(p.clone());
    }

    function damageTank(amount, point) {
        if (phase === 'end') return;
        tankHp = Math.max(0, tankHp - amount);
        hud.setBar('tank', tankHp, true);
        ctx.battle.fx.explosion(point, rand(9, 16));
        ctx.battle.debris.spawn(point, 3, { speed: [10, 40], size: [0.8, 2.5], life: [2, 4], baseVel: tankVel, hot: 0.9 });
        if (tankHp <= 0) fail();
    }

    // escorte en formation autour du croiseur ; TIE de garde en orbite autour de la station
    function updateFlights(dt) {
        const t = performance.now() * 0.001;
        escorts.forEach((e, i) => {
            if (!e.visible) return;
            const slot = ESCORT_SLOTS[i].clone();
            slot.y += Math.sin(t * 0.9 + i) * 12;
            slot.x += Math.sin(t * 0.6 + i * 2) * 15;
            e.position.copy(tank.localToWorld(slot));
            e.quaternion.slerp(tank.quaternion, 1 - Math.exp(-3 * dt));
        });
        guards.forEach((g, i) => {
            if (!g.visible) return;
            const o = guardOrbits[i];
            o.angle += o.dir * dt * 95 / o.radius;
            const a = o.angle - o.slot * 0.05 * o.dir;
            const r = o.radius + (o.slot - 1) * 45;
            g.position.set(FUEL.BASE_POS.x + Math.cos(a) * r, FUEL.BASE_POS.y + o.alt + (o.slot - 1) * 18, FUEL.BASE_POS.z + Math.sin(a) * r);
            // regarde dans le sens de la marche (tangente du cercle)
            _look.position.copy(g.position);
            _look.lookAt(g.position.x - Math.sin(a) * o.dir, g.position.y, g.position.z + Math.cos(a) * o.dir);
            g.quaternion.copy(_look.quaternion);
        });
        if (escortShips) { escortShips.update(); guardShips.update(); }
    }

    // l'escorte et les gardes tirent sur le Slave I (pour l'ambiance : ils le ratent de peu)
    function escortsShoot(dt) {
        escortFireTimer -= dt;
        if (escortFireTimer > 0 || !slave.visible || slave.userData.dead) return;
        escortFireTimer = rand(0.6, 1.4);
        const shooters = escorts.concat(guards).filter(s => s.visible && s.position.distanceTo(slave.position) < 1400);
        if (!shooters.length) return;
        const s = shooters[Math.floor(Math.random() * shooters.length)];
        const miss = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(35, 80));
        const to = slave.position.clone().add(miss);
        ctx.battle.bolts.fire({ from: s.position.clone(), dir: to.sub(s.position), speed: 900, length: 26, width: 1.4,
                                color: LASER_GREEN, range: 1500, team: 'empire' });
        ctx.audio.laserSoundAt(s.position, false);
    }

    // -------------------------------------------------------------------------------------
    // Slave I
    // -------------------------------------------------------------------------------------
    const _q = new THREE.Quaternion(), _d = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
    function steerSlave(dt, target, maxSpeed) {
        const vel = slave.userData.velocity;
        _d.subVectors(target, slave.position);
        const want = _d.multiplyScalar(1.6).clampLength(0, maxSpeed);
        vel.lerp(want, 1 - Math.exp(-2.2 * dt));
        slave.position.addScaledVector(vel, dt);
        if (vel.lengthSq() > 25) {
            _look.position.copy(slave.position);
            _look.lookAt(slave.position.clone().add(vel));
            slave.quaternion.slerp(_look.quaternion, 1 - Math.exp(-3 * dt));
        }
    }

    function slaveFire(dt) {
        slaveFireTimer -= dt;
        if (slaveFireTimer > 0 || evade > 0) return;
        if (slave.position.distanceTo(tank.position) > 1500) return;
        slaveFireTimer = rand(...FUEL.SLAVE_FIRE);
        const target = tankPoint();
        const from = slaveModel.localToWorld(new THREE.Vector3(Math.random() < 0.5 ? -1.6 : 1.6, -11.8, 6.5));
        const dist = from.distanceTo(target);
        ctx.battle.bolts.fire({
            from, dir: target.clone().sub(from), speed: 1000, length: 34, width: 2.2,
            color: LASER_RED, range: dist + 40, team: 'slave',
            hitTest: (bolt) => bolt.travelled >= dist ? { point: target } : null,
            onHit: (bolt, hit) => damageTank(FUEL.TANK_DAMAGE, hit.point)
        });
        ctx.audio.laserSoundAt(from, true);
    }

    // une charge sismique, larguée derrière le Slave I quand on le suit de près
    function slaveDropCharge(dt) {
        chargeTimer -= dt;
        if (chargeTimer > 0 || evade > 0) return;
        const cam = camera.getWorldPosition(new THREE.Vector3());
        const fwd = fwdOf(slave);
        const rel = cam.clone().sub(slave.position);
        if (rel.length() > 1300 || rel.dot(fwd) > -80) return;      // seulement si on est derrière lui
        chargeTimer = rand(...FUEL.CHARGE_EVERY);
        const pos = slave.position.clone().addScaledVector(fwd, -22);
        charges.drop(pos, slave.userData.velocity.clone().multiplyScalar(0.25), fwd);
    }

    function seismicHit() {
        ctx.battle.playerHit();
        state.cameraShake = 2.4;
        state.currentFlightSpeed *= 0.25;          // le TIE est secoué, il perd sa vitesse
        cine.flash(0.35, 0.7);
    }

    // phase "attaque" (pendant le chargement) : tourne autour du croiseur en le mitraillant
    let orbit = 0;
    function updateSlaveAttack(dt) {
        orbit += dt * 0.32;
        const target = tank.position.clone().add(new THREE.Vector3(Math.cos(orbit) * 700, 160 + Math.sin(orbit * 1.7) * 140, Math.sin(orbit) * 700));
        if (evade > 0) target.add(_u.set(Math.sin(phaseTime * 3) * 160, 90, 0));
        steerSlave(dt, target, 210);
        slaveFire(dt);
        slaveDropCharge(dt);
    }

    // phase "poursuite" : derrière le croiseur, en zigzag
    function updateSlaveChase(dt) {
        const fwd = fwdOf(tank, _d);
        _r.set(1, 0, 0).applyQuaternion(tank.quaternion);
        _u.set(0, 1, 0).applyQuaternion(tank.quaternion);
        const k = evade > 0 ? 2.2 : 1;
        const target = tank.position.clone()
            .addScaledVector(fwd, -(FUEL.TANK_HALF.z + 260))
            .addScaledVector(_r, Math.sin(phaseTime * 0.9) * 150 * k)
            .addScaledVector(_u, 40 + Math.sin(phaseTime * 1.3) * 70 * k);
        steerSlave(dt, target, FUEL.CHASE_SPEED + 120);
        slaveFire(dt);
        slaveDropCharge(dt);
    }

    function hitSlave(point) {
        if (slave.userData.dead || !slaveVulnerable()) return;
        slaveHp--;
        evade = FUEL.EVADE_TIME;
        hud.setBar('slave', 100 * slaveHp / FUEL.SLAVE_HITS, true);
        ctx.battle.fx.explosion(point, rand(4, 7));
        if (slaveHp <= 0) win('destroyed');
    }
    const slaveVulnerable = () => running && slave.visible && (phase === 'refuel2' || phase === 'chase');

    // -------------------------------------------------------------------------------------
    // Cinématiques
    // -------------------------------------------------------------------------------------
    let saved = null;
    function beginCinematic() {
        state.cinematic = true;
        state.fireHeldMouse = state.fireHeldSpace = false;
        ctx.landing.cancel();
        ctx.hud.show(null);
        ctx.ships.showCockpit(false);
        hud.hide();
        tankMarker.update(null);
        slaveMarker.update(null);
        cine.bars(true);
        cinematic = { shot: null };
    }
    function endCinematic() {
        state.cinematic = false;
        cinematic = null;
        cine.bars(false);
        ctx.hud.show('flight');
        ctx.ships.showCockpit(true);
        hud.show('HYPERCARBURANT', '', [
            { id: 'fuel', label: 'HYPERCARBURANT', kind: 'fuel' },
            { id: 'tank', label: 'CROISEUR', kind: 'health' },
            { id: 'slave', label: 'SLAVE I', kind: 'enemy' }
        ]);
        hud.setTime(null);
        hud.setBar('fuel', fuel);
        hud.setBar('tank', tankHp);
        hud.setBar('slave', 100 * slaveHp / FUEL.SLAVE_HITS);
    }
    // plan de caméra : from(s) / look(s) donnent la position et le point visé (s : 0 → 1)
    function shot(from, look, duration) { cinematic.shot = { from, look, t: 0, duration }; }

    function savePlayer() {
        saved = { pos: ctx.player.position.clone(), yaw: ctx.player.rotation.y, pitch: state.flightPitch, roll: state.flightRoll,
                  cam: camera.rotation.clone() };
    }
    function restorePlayer() {
        ctx.player.position.copy(saved.pos);
        ctx.player.rotation.y = saved.yaw;
        state.flightPitch = saved.pitch;
        state.flightRoll = saved.roll;
        camera.rotation.copy(saved.cam);
        camera.position.set(0, 0, 0);
    }

    // sortie / entrée d'hyperespace du Slave I (étirement + flash)
    function jump(dir, t) {
        const s = dir === 'in' ? 1 - t : t;
        slaveModel.scale.set(FUEL.SLAVE_SCALE, FUEL.SLAVE_SCALE, FUEL.SLAVE_SCALE * (1 + 30 * s * s));
    }

    // À 50 % : arrivée de Boba Fett
    async function bobaArrives() {
        const me = run;
        const alive = () => me === run;
        savePlayer();
        beginCinematic();
        const { fx, debris } = ctx.battle;
        const arrival = tank.position.clone().add(new THREE.Vector3(-950, 260, 520));
        const toTank = tank.position.clone().sub(arrival).normalize();
        scene.add(slave);
        slave.visible = false;
        slave.position.copy(arrival);
        _look.position.copy(arrival); _look.lookAt(tank.position); slave.quaternion.copy(_look.quaternion);
        slave.userData.velocity.copy(toTank).multiplyScalar(160);

        // plan 1 : depuis le pont du croiseur, on voit le Slave I sortir de l'hyperespace
        const camA = tank.position.clone().add(new THREE.Vector3(-170, 150, -260));
        const camB = tank.position.clone().add(new THREE.Vector3(-210, 140, -170));
        shot(s => camA.clone().lerp(camB, s), () => arrival, 2.8);
        cinematic.slave = 'jump';
        await cine.wait(0.6);
        if (!alive()) return;
        // sortie d'hyperespace
        slave.visible = true;
        for (let i = 0; i <= 10; i++) {
            const u = i / 10;
            setTimeout(() => {
                if (!alive()) return;
                jump('in', u);
                slave.position.copy(arrival).addScaledVector(toTank, -1400 * Math.pow(1 - u, 3));
                if (i === 10) fx.flash(arrival, 40, new THREE.Color(0.75, 0.85, 1), 0.35);
            }, u * 700);
        }
        await cine.wait(0.9);
        if (!alive()) return;
        cinematic.slave = 'approach';
        cine.title('Boba Fett', "LE CHASSEUR DE PRIMES VEUT L'HYPERCARBURANT !", 'lose');
        await cine.wait(1.2);
        if (!alive()) return;
        // plan 2 : caméra embarquée derrière le Slave I, qui fonce sur le croiseur
        const behind = new THREE.Vector3(26, 12, -80);
        shot(() => slave.localToWorld(behind.clone()), () => tank.position, 5);
        await cine.wait(0.8);
        if (!alive()) return;
        // première rafale sur le croiseur, et un TIE de garde abattu
        for (let i = 0; i < 4; i++) setTimeout(() => { if (alive()) { slaveFireTimer = 0; evade = 0; slaveFire(1); } }, i * 160);
        await cine.wait(1.0);
        if (!alive()) return;
        const victim = guards.filter(g => g.visible).sort((a, b) => a.position.distanceTo(slave.position) - b.position.distanceTo(slave.position))[0];
        if (victim) {
            victim.visible = false;
            fx.explosion(victim.position.clone(), 18);
            debris.spawn(victim.position, 8, { speed: [10, 40], size: [0.8, 2.5], life: [2, 4], hot: 0.6 });
        }
        await cine.wait(2.4);
        if (!alive()) return;
        restorePlayer();
        endCinematic();
        hud.setObjective('ABATS LE SLAVE I DE BOBA FETT !');
        hud.showBar('slave', true);
        state.cruiseSpeed = FUEL.PLAYER_CRUISE.refuel;
        chargeTimer = 3;
        setPhase('refuel2');
    }

    // Slave I détruit : réussite
    async function win(reason) {
        if (phase === 'end') return;
        const me = run;
        const alive = () => me === run;
        setPhase('end');
        running = false;
        const { fx, debris } = ctx.battle;
        const where = slave.position.clone();
        beginCinematic();
        charges.clear();
        if (reason === 'destroyed') {
            slave.userData.dead = true;
            const vel = slave.userData.velocity.clone();
            // un peu en retrait, du côté opposé à la station
            const away = where.clone().sub(FUEL.BASE_POS).setY(0).normalize();
            const camPos = where.clone().addScaledVector(away, 260).add(new THREE.Vector3(0, 110, 0)).addScaledVector(fwdOf(tank), -200);
            shot(s => camPos, s => where.clone().lerp(tank.position, Math.min(1, s * 1.6)), 6);
            fx.explosion(where, 35);
            setTimeout(() => { if (alive()) { slave.visible = false; fx.explosion(where.clone().addScaledVector(vel, 0.3), 60); cine.flash(0.4, 1); } }, 350);
            debris.spawn(where, 26, { speed: [20, 90], size: [1, 5], life: [4, 8], baseVel: vel.multiplyScalar(0.4), hot: 0.8 });
            await cine.wait(1.8);
            if (!alive()) return;
            cine.title('Mission réussie', "LE SLAVE I EST DÉTRUIT — L'HYPERCARBURANT EST LIVRÉ", 'win');
        } else {
            // le croiseur arrive à l'Executor : Boba Fett renonce et s'enfuit
            const camPos = tank.position.clone().add(new THREE.Vector3(500, 220, 200));
            shot(() => camPos, () => slave.position, 6);
            fleeT = 0;
            cinematic.slave = 'flee';
            await cine.wait(1.6);
            if (!alive()) return;
            cine.title('Mission réussie', "BOBA FETT S'EST ENFUI — L'HYPERCARBURANT EST LIVRÉ", 'win');
        }
        await cine.wait(4.6);
        if (alive()) returnToHangar();
    }

    // Croiseur à 0 % : le Slave I l'immobilise et s'enfuit avec l'hypercarburant
    async function fail() {
        if (phase === 'end') return;
        const me = run;
        const alive = () => me === run;
        setPhase('end');
        running = false;
        beginCinematic();
        charges.clear();
        const { fx } = ctx.battle;
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(tank.quaternion);
        const fwd = fwdOf(tank);
        const camA = tank.position.clone().addScaledVector(right, -820).add(new THREE.Vector3(0, 260, 0)).addScaledVector(fwd, -300);
        const camB = camA.clone().addScaledVector(fwd, 450);
        shot(s => camA.clone().lerp(camB, s), () => tank.position.clone().addScaledVector(fwd, 250), 9);
        cinematic.tankStop = true;
        cinematic.slave = 'block';
        for (let i = 0; i < 10; i++) setTimeout(() => { if (alive()) fx.explosion(tankPoint(), rand(14, 30)); }, i * 260);
        await cine.wait(3.6);
        if (!alive()) return;
        cinematic.slave = 'flee';
        await cine.wait(1.6);
        if (!alive()) return;
        cine.title("Boba Fett a volé l'hypercarburant", 'MISSION ÉCHOUÉE', 'lose');
        await cine.wait(4.4);
        if (alive()) returnToHangar();
    }

    const _from = new THREE.Vector3(), _to = new THREE.Vector3();
    let fleeT = 0;
    function updateCinematic(dt) {
        const c = cinematic;
        if (c.shot) {
            c.shot.t = Math.min(c.shot.duration, c.shot.t + dt);
            const e = c.shot.t / c.shot.duration, s = e * e * (3 - 2 * e);
            _from.copy(c.shot.from(s));
            _to.copy(c.shot.look(s));
            cine.lookAt(_from, _to);
        }
        // le Slave I pendant les cinématiques
        if (c.slave === 'approach') {
            steerSlave(dt, tank.position.clone().add(new THREE.Vector3(-380, 180, 160)), 220);
        } else if (c.slave === 'block') {
            // se place devant la proue du croiseur, face à lui
            const fwd = fwdOf(tank);
            steerSlave(dt, tank.position.clone().addScaledVector(fwd, FUEL.TANK_HALF.z + 160).add(new THREE.Vector3(0, 40, 0)), 320);
            fleeT = 0;
        } else if (c.slave === 'flee') {
            // demi-tour et saut dans l'hyperespace
            fleeT += dt;
            const vel = slave.userData.velocity;
            const away = fwdOf(slave).add(new THREE.Vector3(0, 0.25, 0)).normalize();
            vel.lerp(away.multiplyScalar(200 + fleeT * 900), 1 - Math.exp(-3 * dt));
            slave.position.addScaledVector(vel, dt);
            if (fleeT > 0.9 && fleeT < 1.6) jump('out', (fleeT - 0.9) / 0.7);
            if (fleeT >= 1.6 && slave.visible) {
                ctx.battle.fx.flash(slave.position, 40, new THREE.Color(0.75, 0.85, 1), 0.35);
                slave.visible = false;
                jump('in', 1);
            }
        }
        if (c.tankStop) tankSpeed *= Math.exp(-0.9 * dt);
    }

    // -------------------------------------------------------------------------------------
    // Boucle
    // -------------------------------------------------------------------------------------
    function update(dt) {
        if (phase === 'off') return;
        phaseTime += dt;
        const cam = camera.getWorldPosition(_p);
        charges.update(dt, state.cinematic ? null : cam);
        if (!assets) return;

        evade = Math.max(0, evade - dt);
        const dockFrom = (side) => FUEL.BASE_POS.clone().add(new THREE.Vector3(-180 * FUEL.BASE_SCALE + 10, -56, side * 140));
        const dockTo = (side) => tank.localToWorld(new THREE.Vector3(FUEL.TANK_HALF.x * 0.82, 0, side * 140));

        if (phase === 'escort') {
            moveTank(dt, FUEL.ESCORT_SPEED);
            if (route.remaining < 2) {
                setPhase('refuel1');
                tankSpeed = 0;
                tankVel.set(0, 0, 0);               // amarré : il ne bouge plus
                state.cruiseSpeed = FUEL.PLAYER_CRUISE.refuel;
                hud.setObjective('PROTÈGE LE CROISEUR PENDANT LE CHARGEMENT');
                ctx.battle.announce('Plein en cours !');
            }
        } else if (phase === 'refuel1' || phase === 'refuel2') {
            fuel = Math.min(100, fuel + dt * 100 / FUEL.REFUEL_TIME);
            hud.setBar('fuel', fuel);
            if (phase === 'refuel1' && fuel >= 50) {
                setPhase('boba');
                bobaArrives();
            } else if (phase === 'refuel2') {
                updateSlaveAttack(dt);
                if (fuel >= 100) {
                    setPhase('chase');
                    route = new Route(BACK_ROUTE);
                    tankSpeed = 0;
                    state.cruiseSpeed = FUEL.PLAYER_CRUISE.chase;
                    hud.setObjective("DÉTRUIS LE SLAVE I — ÉVITE LES ANNEAUX DES CHARGES SISMIQUES !");
                    ctx.battle.announce('Retour à l’Executor !');
                }
            }
        } else if (phase === 'chase') {
            moveTank(dt, FUEL.CHASE_SPEED);
            updateSlaveChase(dt);
            if (route.remaining < 30) win('arrived');
        }

        if (cinematic) updateCinematic(dt);
        if (phase === 'end' && route) {
            // le croiseur continue sur sa lancée (réussite) ou s'arrête (échec : tankStop)
            route.advance(tankSpeed * dt);
            placeTank(dt);
        }

        // tuyaux d'hypercarburant pendant le plein
        const flow = (phase === 'refuel1' || phase === 'refuel2' || phase === 'boba') ? 1 : 0;
        hoses.forEach((h, i) => h.update(dt, dockFrom(i ? 1 : -1), dockTo(i ? 1 : -1), flow));

        updateFlights(dt);
        if (phase === 'refuel2' || phase === 'chase' || phase === 'boba') escortsShoot(dt);

        // repères à l'écran
        const flying = !state.cinematic && !state.isInsideShip;
        tankMarker.update(flying ? tank.position : null, camera);
        slaveMarker.update(flying && slaveVulnerable() ? slave.position : null, camera);
    }

    // -------------------------------------------------------------------------------------
    // Pour les tirs du joueur, l'aide à la visée, le radar et les collisions
    // -------------------------------------------------------------------------------------
    const _local = new THREE.Vector3(), _iq = new THREE.Quaternion();
    // collision avec un ellipsoïde (croiseur, station)
    function ellipsoid(obj, center, radii, pos, move, margin, velocity) {
        _iq.copy(obj.quaternion).invert();
        _local.copy(pos).add(move).sub(center).applyQuaternion(_iq);
        const x = _local.x / (radii.x + margin), y = _local.y / (radii.y + margin), z = _local.z / (radii.z + margin);
        const d = Math.sqrt(x * x + y * y + z * z);
        if (d >= 1) return null;
        const normal = new THREE.Vector3(x / (radii.x + margin), y / (radii.y + margin), z / (radii.z + margin))
            .normalize().applyQuaternion(obj.quaternion);
        const point = _local.divideScalar(Math.max(d, 1e-3)).applyQuaternion(obj.quaternion).add(center);
        return { point, normal, velocity: velocity.clone() };
    }
    const BASE_RADII = new THREE.Vector3(560, 640, 420);
    const _zero = new THREE.Vector3();

    return {
        start, stop, update,
        active: () => running && !!assets,
        hitTest(p0, p1) {
            if (!slaveVulnerable()) return null;
            const t = segmentSphere(p0, p1, slave.position, 24);
            return t >= 0 ? { target: slave, t, point: new THREE.Vector3().lerpVectors(p0, p1, t) } : null;
        },
        hit(target, point) { if (target === slave) hitSlave(point); },
        lockCandidates: () => slaveVulnerable() ? [slave] : [],
        radarPositions: () => slaveVulnerable() ? [slave.position] : [],
        collide(pos, move, margin) {
            if (!assets || phase === 'off' || phase === 'loading') return null;
            return ellipsoid(tank, tank.position, FUEL.TANK_HALF, pos, move, margin, tankVel)
                || ellipsoid(base, FUEL.BASE_POS.clone().add(new THREE.Vector3(0, 88, 0)), BASE_RADII, pos, move, margin, _zero)
                || (slave.visible && !slave.userData.dead ? ellipsoid(slave, slave.position, new THREE.Vector3(16, 18, 10), pos, move, margin, slave.userData.velocity) : null);
        }
    };
}
