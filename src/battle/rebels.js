import * as THREE from 'three';
import { makeGLTFLoader } from '../core/loaders.js';
import { LEGACY_TICK_RATE, BATTLE_Y, BATTLE_MIN_Z } from '../core/constants.js';

// X-Wing et Y-Wing rebelles : escadrilles qui arrivent avec les croiseurs
export function initRebels(ctx) {
    const { scene, hud } = ctx;
    const battle = ctx.battle;
    const { fx, debris, enemies, battleOn, instancerFor } = battle;
    const loader = makeGLTFLoader();

    // ===================================================================
    // X-WING — ESCADRILLES QUI ARRIVENT AVEC LES CROISEURS REBELLES
    // ===================================================================
    // Cycle de vie d'un X-Wing (userData.phase) :
    //   'pool'      : en réserve, invisible
    //   'jump'      : sortie d'hyperespace à côté d'un croiseur (étirement + flash)
    //   'formation' : vole quelques secondes en formation avec l'escadrille
    //   'battle'    : se disperse et combat (ancien comportement "en boucles")
    //   'leave'     : arrivé près du destroyer impérial, repart en hyperespace
    // Les X-Wing détruits ou partis retournent dans la réserve et reviennent
    // plus tard en renfort, toujours par escadrilles.

    const XWING = {
        POOL: 40,                 // nombre total d'X-Wing
        SQUAD: [5, 7],            // taille d'une escadrille
        JUMP_TIME: 0.9,
        JUMP_DISTANCE: 1800,
        FORMATION_TIME: 3.0,
        FORMATION_SPEED: 75,
        REINFORCE_EVERY: 6,       // secondes entre deux escadrilles de renfort
        MAX_ACTIVE: 34,
        LEAVE_Z: BATTLE_MIN_Z + 200   // en dessous : ils repartent en hyperespace
    };

    let xwingModel = null;        // Modèle X-Wing
    let xwingReinforceTimer = 0;
    let battleWasOn = false;
    const _fwdX = new THREE.Vector3(0, 0, -1);   // avant d'un X-Wing dans son repère

    loader.load('public/xwing.glb', (gltf) => {
        xwingModel = gltf.scene;
        xwingModel.visible = true;
        xwingModel.scale.set(5,5,5);
        xwingModel.position.set(0,0,0);
        xwingModel.rotation.y += Math.PI;

        for (let i = 0; i < XWING.POOL; i++) createXwing(xwingModel, 'xwing');
    });

    // Y-WING : même comportement que les X-Wing (escadrilles, formation, dispersion)
    // Le modèle d'origine est décentré, orienté nez vers +X et très grand :
    // on le recentre, on le tourne nez vers -Z (comme les X-Wing) et on le met à ~38 unités.
    const YWING_POOL = 14;
    let ywingModel = null;
    loader.load('public/y-wing.glb', (gltf) => {
        const inner = gltf.scene;
        inner.traverse(o => { if (o.isLight) o.visible = false; });   // lampes exportées de Sketchfab
        const box = new THREE.Box3().setFromObject(inner);
        const size = box.getSize(new THREE.Vector3());
        inner.position.copy(box.getCenter(new THREE.Vector3())).negate();
        const wrap = new THREE.Group();
        wrap.add(inner);
        wrap.scale.setScalar(38 / size.x);
        wrap.rotation.y = Math.PI / 2;                                  // nez +X → -Z
        ywingModel = new THREE.Group();
        ywingModel.add(wrap);
        for (let i = 0; i < YWING_POOL; i++) createXwing(ywingModel, 'ywing');
    });

    function createXwing(template = xwingModel, kind = 'xwing') {
        const enemy = new THREE.Group();
        instancerFor(kind, template, kind === 'xwing' ? XWING.POOL : YWING_POOL,
            model => { if (kind === 'xwing') model.rotation.y = 0; }).add(enemy);
        enemy.visible = false;
        enemy.userData = {
            kind,
            phase: 'pool',
            velocity: new THREE.Vector3(),
            targetQuat: null,
            dead: false,
            t: 0
        };
        scene.add(enemy);
        enemies.push(enemy);
    }

    function xwingActive(e) {
        const ph = e.userData.phase;
        return ph === 'formation' || ph === 'battle';
    }

    // Oriente un X-Wing selon une direction (son avant est -Z)
    function faceXwing(enemy, dir) {
        enemy.quaternion.setFromUnitVectors(_fwdX, dir.clone().normalize());
        enemy.userData.targetQuat = enemy.quaternion.clone();
    }

    /**
     * Lance une escadrille. Avec un croiseur : elle sort de l'hyperespace devant lui.
     * Sans croiseur : elle arrive seule, loin devant la passerelle.
     */
    function launchSquadron(ship = null, size = null) {
        // escadrille d'X-Wing, de Y-Wing ou mixte
        const pool = enemies.filter(e => e.userData.phase === 'pool');
        const r = Math.random();
        const want = r < 0.25 ? 'ywing' : r < 0.45 ? null : 'xwing';
        let reserve = want ? pool.filter(e => e.userData.kind === want) : pool.slice().sort(() => Math.random() - 0.5);
        if (reserve.length < XWING.SQUAD[0]) reserve = pool;
        const n = Math.min(reserve.length, size ?? Math.round(XWING.SQUAD[0] + Math.random() * (XWING.SQUAD[1] - XWING.SQUAD[0])));
        if (n <= 0) return;

        let anchor, fwd, quat;
        if (ship) {
            fwd = ship.heading.clone();
            quat = ship.group.quaternion.clone();
            anchor = ship.group.position.clone().addScaledVector(fwd, ship.radius + 60);
        } else {
            anchor = new THREE.Vector3((Math.random() - 0.5) * 1600, BATTLE_Y + (Math.random() - 0.3) * 300, 1800 + Math.random() * 900);
            fwd = new THREE.Vector3(0, 0, 400).sub(anchor).setY(0).normalize();
            quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), fwd);
        }

        for (let i = 0; i < n; i++) {
            const e = reserve[i];
            const ud = e.userData;
            // formation en V (repère du croiseur : x = avant, y = haut, z = côté)
            const row = Math.floor((i + 1) / 2);
            const side = i === 0 ? 0 : (i % 2 ? 1 : -1);
            ud.slot = new THREE.Vector3(-row * 55, (Math.random() - 0.5) * 30, side * row * 60).applyQuaternion(quat);
            ud.anchor = anchor;
            ud.fwd = fwd.clone();
            ud.ship = ship;
            ud.phase = 'jump';
            ud.t = -i * 0.12;                  // léger décalage : ils sortent l'un après l'autre
            ud.dead = false;
            ud.nextShot = undefined;
            ud.nextRandomExplosion = undefined;
            faceXwing(e, fwd);
        }
    }

    // Vaisseau → phase "jump" / "formation" : position de sa place dans l'escadrille
    function formationPoint(ud, extra) {
        const base = ud.ship && ud.ship.state !== 'dead'
            ? ud.ship.group.position.clone().addScaledVector(ud.fwd, ud.ship.radius + 60)
            : ud.anchor.clone();
        return base.add(ud.slot).addScaledVector(ud.fwd, extra);
    }

    function updateBattleWaves(dt) {
        const on = battleOn();
        if (on && !battleWasOn) {
            // la bataille commence : les croiseurs rebelles arrivent un par un,
            // chacun avec ses escadrilles (voir onArrive dans la section des croiseurs)
            battle.fleet.setActive(true);
            xwingReinforceTimer = XWING.REINFORCE_EVERY * 2;
        }
        if (!on && battleWasOn) {
            // fin de la bataille : les croiseurs et les X-Wing repartent en hyperespace
            battle.fleet.setActive(false);
            enemies.forEach(e => {
                const ud = e.userData;
                if (ud.phase === 'battle' || ud.phase === 'formation') {
                    if (ud.phase === 'formation') ud.velocity.copy(ud.fwd);
                    ud.phase = 'leave';
                    ud.t = 0;
                    ud.velocity.normalize().multiplyScalar(120);
                    faceXwing(e, ud.velocity);
                } else if (ud.phase !== 'leave') {
                    ud.phase = 'pool';
                    e.visible = false;
                }
            });
        }
        battleWasOn = on;

        if (on) {
            // renforts : toujours depuis un croiseur présent
            xwingReinforceTimer -= dt;
            const ship = battle.fleet.randomActiveShip();
            if (xwingReinforceTimer <= 0 && ship) {
                xwingReinforceTimer = XWING.REINFORCE_EVERY;
                const active = enemies.filter(e => e.userData.phase !== 'pool').length;
                if (active < XWING.MAX_ACTIVE) launchSquadron(ship);
            }
        }
    }

    function updateEnemies(dt) {
        const k = dt * LEGACY_TICK_RATE;
        const time = performance.now() * 0.001;

        enemies.forEach((enemy, index) => {
            const ud = enemy.userData;
            const vel = ud.velocity;

            if (ud.phase === 'pool') { enemy.visible = false; return; }

            // ---------- sortie d'hyperespace
            if (ud.phase === 'jump') {
                ud.t += dt / XWING.JUMP_TIME;
                const u = THREE.MathUtils.clamp(ud.t, 0, 1);
                const e = 1 - Math.pow(1 - u, 4);
                enemy.position.copy(formationPoint(ud, -XWING.JUMP_DISTANCE * (1 - e)));
                enemy.scale.set(1, 1, 1 + 18 * Math.pow(1 - e, 2));
                enemy.visible = ud.t > 0 && battleOn();
                if (u >= 1) {
                    enemy.scale.set(1, 1, 1);
                    fx.flash(enemy.position, 14, new THREE.Color(0.75, 0.85, 1), 0.3);
                    ud.phase = 'formation';
                    ud.t = 0;
                }
                return;
            }

            // ---------- vol en formation, puis dispersion
            if (ud.phase === 'formation') {
                ud.t += dt;
                enemy.position.copy(formationPoint(ud, ud.t * XWING.FORMATION_SPEED));
                enemy.visible = battleOn();
                if (ud.t >= XWING.FORMATION_TIME + index % 5 * 0.4) {
                    ud.phase = 'battle';
                    // départ en dispersion : chacun pique dans sa propre direction
                    vel.copy(ud.fwd).multiplyScalar(XWING.FORMATION_SPEED)
                       .add(new THREE.Vector3((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 60));
                }
                return;
            }

            // ---------- départ en hyperespace
            if (ud.phase === 'leave') {
                ud.t += dt;
                vel.multiplyScalar(1 + dt * 6);
                enemy.position.addScaledVector(vel, dt);
                enemy.scale.set(1, 1, 1 + ud.t * 40);
                if (ud.t > 0.6) { ud.phase = 'pool'; enemy.visible = false; enemy.scale.set(1, 1, 1); }
                return;
            }

            // ---------- combat (mouvement "en boucles" d'origine, adouci)
            // vers le destroyer impérial (Z négatif), sans demi-tour brutal
            vel.z += (-35 - vel.z) * (1 - Math.exp(-0.8 * dt));

            const loopPhase = time * 0.5 + index;
            const radius = 120;
            const targetX = Math.sin(loopPhase) * radius + Math.sin(time * 0.2 + index) * 150;
            const targetY = BATTLE_Y + Math.cos(loopPhase * 0.7) * radius + Math.cos(time * 0.3 + index) * 80;

            vel.x += (targetX - enemy.position.x) * 0.02 * dt * 30;
            vel.y += (targetY - enemy.position.y) * 0.02 * dt * 30;
            // amortissement : fini les glissades latérales à 250 unités/s
            const damp = Math.exp(-0.9 * dt);
            vel.x *= damp;
            vel.y *= damp;

            enemy.position.addScaledVector(vel, dt);

            // proche du destroyer : saut en hyperespace
            if (enemy.position.z < XWING.LEAVE_Z) {
                ud.phase = 'leave';
                ud.t = 0;
                vel.set(vel.x * 0.3, 60, 0).add(new THREE.Vector3(0, 0, -200)).normalize().multiplyScalar(120);
                faceXwing(enemy, vel);
                fx.flash(enemy.position, 10, new THREE.Color(0.75, 0.85, 1), 0.25);
                return;
            }

            // orientation (toujours basée sur la vélocité)
            if (vel.length() > 0.1) {
                const lookDir = vel.clone().normalize();
                if (!ud.targetQuat) ud.targetQuat = enemy.quaternion.clone();
                const newTargetQuat = new THREE.Quaternion().setFromUnitVectors(_fwdX, lookDir);
                ud.targetQuat.slerp(newTargetQuat, 1 - Math.pow(1 - 0.05, k));
                enemy.quaternion.slerp(ud.targetQuat, 1 - Math.pow(1 - 0.03, k));
            }

            enemy.visible = battleOn() && !ud.dead;
        });
    }

    // -------------------------------------------------------------------
    // 6. FONCTIONS DE DESTRUCTION
    // -------------------------------------------------------------------

    function destroyEnemy(enemy, byPlayer = false) {
        if (!enemy || enemy.userData.dead || !xwingActive(enemy)) return;
        enemy.userData.dead = true;
        enemy.visible = false;

        fx.explosion(enemy.position.clone(), byPlayer ? 20 : 15);
        debris.spawn(enemy.position, 6, { speed: [10, 40], size: [0.8, 2.5], life: [2, 4], baseVel: enemy.userData.velocity, hot: 0.6 });

        if (byPlayer) {
            battle.addKill('fighter');   // (le son de l'explosion est joué par fx.explosion, spatialisé)
        }

        // retour en réserve : il reviendra avec une escadrille de renfort
        enemy.userData.phase = 'pool';
    }

    return { xwingActive, launchSquadron, destroyEnemy, updateBattleWaves, updateEnemies };
}
