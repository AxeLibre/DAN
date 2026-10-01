import * as THREE from 'three';
import { AsteroidField, TIERS } from './field.js';

// =========================================================================================
// MISSION "CHAMP D'ASTÉROÏDES" : protéger l'Executor
// =========================================================================================
// L'Executor traverse un champ d'astéroïdes. Des astéroïdes arrivent de l'avant et foncent
// vers la coque : il faut les détruire avec les canons du TIE. Les gros éclatent en moyens,
// les moyens en petits. Chaque impact abîme la coque : à 0 %, l'Executor explose.
const MISSION = {
    DURATION: 90,                       // secondes à tenir
    LAST_SPAWN: 7,                      // plus de nouvel astéroïde dans les dernières secondes
    SPAWN_EVERY: [5.5, 2.4],            // secondes entre deux astéroïdes (début → fin de mission)
    TIER_MIX: [0.15, 0.4, 0.45],        // proportion de petits / moyens / gros
    SPAWN_BOX: { x: 900, y: [120, 600], z: [2400, 3000] },   // d'où ils arrivent (devant le pont)
    AIM_BOX: { x: 600, y: [-80, 120], z: [-150, 1200] },     // où ils visent sur la coque
    BACKGROUND: 320,                    // rochers du décor
    DRIFT: -18,                         // le champ défile lentement (on avance dedans)
    START: [new THREE.Vector3(0, 200, -150), new THREE.Vector3(0, 260, 300), new THREE.Vector3(0, 230, 700)]
};

// Les rochers du décor défilent le long de l'Executor (de l'avant vers l'arrière) :
// ils restent hors du volume de la coque (≈ ±3400 en x, de -1750 à -80 en y, sur toute
// sa longueur), et hors du couloir de jeu au-dessus du pont.
const HULL = { x: 3600, yMin: -1950, yMax: 150 };
const CORRIDOR = { x: 1400, yMax: 1100, zMin: -700, zMax: 4300 };

function rand(a, b) { return a + Math.random() * (b - a); }
function pickTier() {
    const r = Math.random();
    return r < MISSION.TIER_MIX[0] ? 0 : r < MISSION.TIER_MIX[0] + MISSION.TIER_MIX[1] ? 1 : 2;
}

export function initAsteroidMission(ctx, { hud, cine, returnToHangar }) {
    const { scene, camera, state } = ctx;
    const field = new AsteroidField(scene);
    field.setVisible(false);
    const ray = new THREE.Raycaster();

    let running = false, cinematic = null, run = 0;   // run : numéro de partie (ignore les minuteurs d'avant)
    let timeLeft = 0, spawnTimer = 0, hull = 100, destroyed = 0;

    // -------------------------------------------------------------------------------------
    // Décor : rochers autour du couloir de jeu
    // -------------------------------------------------------------------------------------
    function placeBackground(p, radius, zMin = -5000, zMax = 12000) {
        for (;;) {
            p.set(rand(-7000, 7000), rand(-2600, 2600), rand(zMin, zMax));
            const inHull = Math.abs(p.x) < HULL.x + radius && p.y - radius < HULL.yMax && p.y + radius > HULL.yMin;
            const inCorridor = Math.abs(p.x) < CORRIDOR.x + radius && p.y - radius < CORRIDOR.yMax &&
                               p.z > CORRIDOR.zMin && p.z < CORRIDOR.zMax;
            if (!inHull && !inCorridor) return p;
        }
    }
    function wrapBackground(r) {
        if (r.position.z < -5500) placeBackground(r.position, r.radius, 10000, 12000);
    }

    // -------------------------------------------------------------------------------------
    // Astéroïdes menaçants
    // -------------------------------------------------------------------------------------
    // point d'impact réel sur la coque, le long d'une trajectoire (un lancer de rayon par astéroïde)
    function impactAlong(from, dir) {
        ray.set(from, dir);
        ray.far = 8000;
        const hit = ray.intersectObjects(ctx.executor.exteriorColliders, true)[0];
        return hit ? { point: hit.point, distance: hit.distance } : null;
    }

    function spawnThreat(tier, position, dir) {
        const T = TIERS[tier];
        const impact = impactAlong(position, dir);
        return field.add({
            kind: 'threat', tier,
            radius: rand(...T.radius),
            position,
            velocity: dir.clone().multiplyScalar(rand(...T.speed)),
            target: impact ? impact.point : null,
            pathLength: impact ? impact.distance : 6000
        });
    }

    function spawnWave() {
        const B = MISSION.SPAWN_BOX, A = MISSION.AIM_BOX;
        const from = new THREE.Vector3(rand(-B.x, B.x), rand(...B.y), rand(...B.z));
        const aim = new THREE.Vector3(rand(-A.x, A.x), rand(...A.y), rand(...A.z));
        spawnThreat(pickTier(), from, aim.sub(from).normalize());
    }

    // un astéroïde éclate : morceaux plus petits qui continuent leur route, un peu écartés
    function breakRock(rock) {
        const { fx, debris } = ctx.battle;
        fx.explosion(rock.position.clone(), rock.radius * 1.6, new THREE.Color(1, 0.7, 0.4));
        debris.spawn(rock.position, 4 + rock.tier * 5, { speed: [15, 60], size: [0.8, 3 + rock.tier * 2], life: [2, 4], baseVel: rock.userData.velocity, hot: 0.3 });
        const T = TIERS[rock.tier];
        if (T.children && running) {
            const dir = rock.userData.velocity.clone().normalize();
            for (let i = 0; i < T.children; i++) {
                const spread = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(0.22);
                const childDir = dir.clone().add(spread).normalize();
                const pos = rock.position.clone().addScaledVector(spread.normalize(), rock.radius * 0.5);
                spawnThreat(rock.tier - 1, pos, childDir);
            }
        }
        field.remove(rock);
        destroyed++;
        ctx.hud.setScoreLines([`astéroïdes : ${destroyed}`]);
    }

    // impact sur la coque de l'Executor
    function impact(rock) {
        const { fx, debris } = ctx.battle;
        const p = rock.target;
        fx.explosion(p, rock.radius * 2.2);
        debris.spawn(p, 6 + rock.tier * 6, { speed: [20, 80], size: [1, 4], life: [3, 6], hot: 0.8 });
        field.remove(rock);
        hull = Math.max(0, hull - TIERS[rock.tier].damage);
        hud.setHull(hull, true);
        const cam = camera.getWorldPosition(new THREE.Vector3());
        if (p.distanceTo(cam) < 700) state.cameraShake = Math.max(state.cameraShake, 0.3 + rock.tier * 0.3);
        if (hull <= 0) fail();
    }

    // -------------------------------------------------------------------------------------
    // Déroulement
    // -------------------------------------------------------------------------------------
    function start() {
        run++;
        running = true;
        cinematic = null;
        state.mission = 'asteroids';
        timeLeft = MISSION.DURATION;
        spawnTimer = 4;            // premier astéroïde après l'entrée dans le champ
        hull = 100;
        destroyed = 0;

        field.clear();
        field.drift.set(0, 0, MISSION.DRIFT);
        const p = new THREE.Vector3();
        for (let i = 0; i < MISSION.BACKGROUND; i++) {
            const big = Math.random() < 0.12;
            const radius = big ? rand(90, 240) : rand(12, 70);
            field.add({ kind: 'bg', radius, position: placeBackground(p, radius),
                        velocity: new THREE.Vector3(rand(-3, 3), rand(-2, 2), 0) });   // pas de dérive en z vers la coque
        }
        field.setVisible(true);

        hud.show("CHAMP D'ASTÉROÏDES", 'PROTÈGE L\'EXECUTOR — DÉTRUIS LES ASTÉROÏDES');
        hud.setHull(100);
        hud.setTime(timeLeft);
        ctx.hud.setScoreLines(['astéroïdes : 0']);
        ctx.battle.announce("Champ d'astéroïdes en approche !");

        // entrée : le TIE passe au-dessus de la tour et se place face au champ
        ctx.landing.flyTo(MISSION.START, Math.PI, 5);
    }

    function stop() {
        run++;
        running = false;
        cinematic = null;
        field.clear();
        field.setVisible(false);
        hud.hide();
        ctx.hud.setScoreLines(null);
        if (state.mission === 'asteroids') state.mission = null;
    }

    // -------------------------------------------------------------------------------------
    // Cinématiques
    // -------------------------------------------------------------------------------------
    function beginCinematic(kind, from, to, duration) {
        running = false;
        state.cinematic = true;
        state.fireHeldMouse = state.fireHeldSpace = false;
        ctx.landing.cancel();
        ctx.hud.show(null);
        hud.hide();
        cine.bars(true);
        cinematic = { kind, from, to, look: null, t: 0, duration };
    }

    // points au hasard sur la coque, autour de la tour (explosions en chaîne)
    function hullPoints(n) {
        const pts = [], v = new THREE.Vector3();
        const meshes = ctx.executor.exteriorColliders;
        for (let tries = 0; pts.length < n && tries < n * 30; tries++) {
            const m = meshes[Math.floor(Math.random() * meshes.length)];
            const pos = m.geometry.attributes.position;
            v.fromBufferAttribute(pos, Math.floor(Math.random() * pos.count)).applyMatrix4(m.matrixWorld);
            if (v.z > -700 && v.z < 3200 && Math.abs(v.x) < 1500) pts.push(v.clone());
        }
        return pts;
    }

    async function fail() {
        if (cinematic) return;
        const me = run;
        beginCinematic('fail', new THREE.Vector3(1500, 520, 2300), new THREE.Vector3(1150, 380, 1700), 9);
        cinematic.look = new THREE.Vector3(0, -20, 500);
        const { fx } = ctx.battle;
        const pts = hullPoints(90);
        // explosions en chaîne, de plus en plus nombreuses et grosses
        pts.forEach((p, i) => {
            const k = i / pts.length;
            setTimeout(() => { if (me === run) fx.explosion(p, rand(25, 60) * (0.6 + k * 1.4)); }, 5000 * Math.pow(k, 0.7));
        });
        await cine.wait(5.0);
        if (me !== run) return;
        cine.flash(1, 1.8);                                    // l'Executor explose
        fx.explosion(new THREE.Vector3(0, 40, 0), 420);
        fx.explosion(new THREE.Vector3(-300, -40, 900), 300);
        fx.explosion(new THREE.Vector3(350, -40, 1800), 300);
        state.cameraShake = 2.5;
        await cine.wait(0.9);
        if (me !== run) return;
        cine.title("L'Executor est détruit", 'MISSION ÉCHOUÉE', 'lose');
        await cine.wait(3.4);
        if (me === run) returnToHangar();
    }

    async function win() {
        if (cinematic) return;
        const me = run;
        // vue vers l'arrière : le champ d'astéroïdes s'éloigne derrière l'Executor
        beginCinematic('win', new THREE.Vector3(220, 330, 520), new THREE.Vector3(260, 420, 380), 7);
        cinematic.look = new THREE.Vector3(0, -60, -4000);
        cinematic.accelerate = true;
        await cine.wait(1.2);
        if (me !== run) return;
        cine.title('Mission réussie', `L'EXECUTOR A TRAVERSÉ LE CHAMP — ${destroyed} ASTÉROÏDES DÉTRUITS`, 'win');
        await cine.wait(5.0);
        if (me === run) returnToHangar();
    }

    function updateCinematic(dt) {
        const c = cinematic;
        c.t = Math.min(c.duration, c.t + dt);
        const e = c.t / c.duration, s = e * e * (3 - 2 * e);
        cine.lookAt(new THREE.Vector3().lerpVectors(c.from, c.to, s), c.look);
        if (c.accelerate) {
            // le champ file vers l'arrière de plus en plus vite
            field.drift.z = Math.max(-900, field.drift.z - 500 * dt);
            for (const r of field.rocks) if (r.kind === 'threat') r.userData.velocity.set(0, 0, field.drift.z);
        }
    }

    function update(dt) {
        if (!field.meshes[0].visible) return;
        field.update(dt, wrapBackground);
        if (cinematic) { updateCinematic(dt); return; }
        if (!running) return;

        timeLeft = Math.max(0, timeLeft - dt);
        hud.setTime(timeLeft);

        // de plus en plus d'astéroïdes au fil de la mission
        if (timeLeft > MISSION.LAST_SPAWN) {
            spawnTimer -= dt;
            if (spawnTimer <= 0) {
                const k = 1 - timeLeft / MISSION.DURATION;
                spawnTimer = MISSION.SPAWN_EVERY[0] + (MISSION.SPAWN_EVERY[1] - MISSION.SPAWN_EVERY[0]) * k;
                spawnWave();
            }
        }

        for (const r of field.threats()) {
            if (r.target && r.travelled >= r.pathLength - r.radius * 0.7) impact(r);   // contact du bord du rocher
            else if (!r.target && r.travelled >= r.pathLength) field.remove(r);   // passé à côté
        }

        // fin du compte à rebours : l'Executor est sorti du champ (les derniers rochers sont distancés)
        if (timeLeft <= 0 && hull > 0) win();
    }

    // -------------------------------------------------------------------------------------
    // Pour les tirs du joueur, l'aide à la visée, le radar et les collisions
    // -------------------------------------------------------------------------------------
    return {
        start, stop, update,
        active: () => running,
        hitTest: (p0, p1) => running ? field.hitTest(p0, p1) : null,
        hit(rock, point) {
            if (rock.dead) return;
            if (rock.kind === 'bg') {
                ctx.battle.debris.spawn(point, 2, { speed: [5, 25], size: [0.5, 1.5], life: [1.5, 3], hot: 0.4 });
                return;
            }
            rock.hits++;
            if (rock.hits >= TIERS[rock.tier].hits) breakRock(rock);
        },
        lockCandidates: () => running ? field.threats() : [],
        radarPositions: () => running ? field.threats().map(r => r.position) : [],
        collide: (pos, move, margin) => field.meshes[0].visible ? field.collide(pos, move, margin) : null
    };
}
