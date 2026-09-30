import * as THREE from 'three';
import { LASER_GREEN, LASER_RED } from '../weapons.js';
import { makeGLTFLoader } from '../core/loaders.js';

// Armes du joueur : canon laser de la passerelle (visé à la souris) et canons du TIE en vol
export function initPlayerWeapons(ctx) {
    const { scene, camera, mouse, raycaster, state } = ctx;
    const { playAt, sfx, playVoice, sounds } = ctx.audio;
    const battle = ctx.battle;
    const { bolts, fx, enemies, playerBoltHitTest, onPlayerBoltHit } = battle;

    // =================================================================
    // CANON LASER DE LA PASSERELLE (tourelle)
    // =================================================================
    // Le modèle est découpé en 3 étages :
    //   socle (fixe)  →  fourche (tourne gauche/droite)  →  fût (monte/descend + recul)
    const TURRET = {
        POSITION: new THREE.Vector3(0, -1, 200),  // axe du canon quand il est sorti
        HIDDEN_DROP: 45,                          // de combien il descend pour se cacher
        SPRING: 22,                               // raideur du ressort de sortie
        DAMPING: 6.5,                             // amortissement (petit rebond en haut)
        FIRE_INTERVAL: 0.15,                      // secondes entre deux tirs (clic maintenu)
        BOLT_SPEED: 1100,
        AIM_DISTANCE: 900,
        AIM_ASSIST_DEG: 4,                        // aide à la visée (angle de verrouillage)
        PITCH_MIN: THREE.MathUtils.degToRad(-18),
        PITCH_MAX: THREE.MathUtils.degToRad(40),
        YAW_MAX: THREE.MathUtils.degToRad(95),
        MUZZLE: new THREE.Vector3(0, 0, 29),      // bout du canon (repère du modèle)
        COLOR: LASER_RED,
        BASE_PARTS: ['Gear004'],
        YAW_PARTS: ['Cylindre001', 'Cylindre002']
    };

    const turret = {
        root: null, yaw: null, pitch: null, recoil: null, light: null,
        target: 0,          // 0 = rentré, 1 = sorti
        y: 0, vy: 0,        // hauteur relative (ressort)
        yawAngle: 0, pitchAngle: 0,
        cooldown: 0, recoilT: 1,
        lock: null
    };

    makeGLTFLoader().load('public/laser_cannon.glb', (gltf) => {
        const model = gltf.scene;
        const root = new THREE.Group();
        const yaw = new THREE.Group();
        const pitch = new THREE.Group();
        const recoil = new THREE.Group();
        root.add(yaw); yaw.add(pitch); pitch.add(recoil);

        // Toutes les pièces sont modélisées autour de l'axe du canon (0,0,0)
        [...model.children].forEach(part => {
            if (TURRET.BASE_PARTS.includes(part.name)) root.add(part);
            else if (TURRET.YAW_PARTS.includes(part.name)) yaw.add(part);
            else recoil.add(part);
        });

        // lumière du tir (créée dès le départ : pas de recompilation des shaders au 1er tir)
        turret.light = new THREE.PointLight(0xff5533, 0, 160, 2);
        turret.light.position.copy(TURRET.MUZZLE);
        recoil.add(turret.light);

        root.position.copy(TURRET.POSITION);
        root.position.y -= TURRET.HIDDEN_DROP;
        root.visible = false;
        scene.add(root);

        Object.assign(turret, { root, yaw, pitch, recoil });
    });

    function setTurret(on) {
        turret.target = on ? 1 : 0;
        if (turret.root && on) turret.root.visible = true;
    }

    function turretReady() {
        return !!turret.root && turret.target === 1 && turret.y > 0.9;
    }

    // Cherche l'X-Wing le plus proche de la ligne de visée
    function findLockTarget(origin, dir, maxAngleDeg, maxDist) {
        let best = null;
        let bestAngle = THREE.MathUtils.degToRad(maxAngleDeg);
        const v = new THREE.Vector3();
        for (const e of enemies) {
            if (!e || !e.visible || e.userData.dead || !battle.xwingActive(e)) continue;
            v.subVectors(e.position, origin);
            const d = v.length();
            if (d > maxDist || d < 1) continue;
            const a = v.divideScalar(d).angleTo(dir);
            if (a < bestAngle) { bestAngle = a; best = e; }
        }
        return best;
    }

    // Point de visée anticipé (le laser met du temps à arriver)
    function leadPoint(target, from, speed) {
        const p = target.position.clone();
        const vel = target.userData.velocity || new THREE.Vector3();
        for (let i = 0; i < 2; i++) {
            const t = p.distanceTo(from) / speed;
            p.copy(target.position).addScaledVector(vel, t);
        }
        return p;
    }

    function updateTurret(dt) {
        if (!turret.root) return;

        // --- sortie / rentrée : ressort amorti (petit rebond mécanique en haut)
        const acc = TURRET.SPRING * (turret.target - turret.y) - TURRET.DAMPING * turret.vy;
        turret.vy += acc * dt;
        turret.y += turret.vy * dt;
        turret.root.position.y = TURRET.POSITION.y - TURRET.HIDDEN_DROP * (1 - turret.y);

        if (turret.target === 0 && turret.y < 0.02 && Math.abs(turret.vy) < 0.05) {
            turret.root.visible = false;
            turret.y = 0; turret.vy = 0;
        }
        if (!turret.root.visible) { turret.lock = null; return; }

        // --- visée
        let desiredYaw = 0, desiredPitch = 0;
        const aim = new THREE.Vector3();
        turret.lock = null;

        if (turretReady()) {
            raycaster.setFromCamera(mouse, camera);
            const ray = raycaster.ray;
            aim.copy(ray.direction).multiplyScalar(TURRET.AIM_DISTANCE).add(ray.origin);

            const muzzle = turret.recoil.localToWorld(TURRET.MUZZLE.clone());
            turret.lock = findLockTarget(ray.origin, ray.direction, TURRET.AIM_ASSIST_DEG, 1600);
            if (turret.lock) aim.copy(leadPoint(turret.lock, muzzle, TURRET.BOLT_SPEED));

            const local = aim.clone().sub(turret.root.position);
            desiredYaw = Math.atan2(local.x, local.z);
            desiredPitch = Math.atan2(local.y, Math.hypot(local.x, local.z));
        } else {
            desiredPitch = -0.12; // position de repos, canon légèrement baissé
        }
        desiredYaw = THREE.MathUtils.clamp(desiredYaw, -TURRET.YAW_MAX, TURRET.YAW_MAX);
        desiredPitch = THREE.MathUtils.clamp(desiredPitch, TURRET.PITCH_MIN, TURRET.PITCH_MAX);

        const follow = 1 - Math.exp(-12 * dt);
        turret.yawAngle += (desiredYaw - turret.yawAngle) * follow;
        turret.pitchAngle += (desiredPitch - turret.pitchAngle) * follow;
        turret.yaw.rotation.y = turret.yawAngle;
        turret.pitch.rotation.x = -turret.pitchAngle;

        // --- recul du fût + flash lumineux
        turret.recoilT = Math.min(1, turret.recoilT + dt * 5);
        turret.recoil.position.z = -2.5 * Math.pow(1 - turret.recoilT, 2);
        turret.light.intensity *= Math.exp(-dt * 25);

        // --- tir
        turret.cooldown -= dt;
        if (turretReady() && state.fireHeldMouse && turret.cooldown <= 0) {
            turret.cooldown = TURRET.FIRE_INTERVAL;
            turret.root.updateMatrixWorld(true);
            const muzzle = turret.recoil.localToWorld(TURRET.MUZZLE.clone());
            const dir = aim.clone().sub(muzzle).normalize();

            bolts.fire({
                from: muzzle, dir,
                speed: TURRET.BOLT_SPEED, length: 26, width: 1.6,
                color: TURRET.COLOR, range: 3200, team: 'player',
                hitTest: playerBoltHitTest, onHit: onPlayerBoltHit
            });
            fx.muzzle(muzzle, TURRET.COLOR, 6);
            turret.light.intensity = 900;
            turret.recoilT = 0;
            playAt(sfx.laser, muzzle, 1.4, 0);
        }
    }

    // ==========================================================
    // TIE FIGHTER : CANONS DU JOUEUR EN VOL
    // ==========================================================
    // ESPACE (maintenu) ou clic gauche : tirs verts alternés gauche / droite.
    // Les deux canons convergent au centre du réticule ; si un X-Wing est
    // proche du réticule, les tirs visent devant lui (aide à la visée).

    const TIE_GUN = {
        FIRE_INTERVAL: 0.13,
        BOLT_SPEED: 900,
        CONVERGE: 350,                           // distance où les 2 tirs se croisent
        AIM_ASSIST_DEG: 6,
        OFFSETS: [                               // position des canons (repère caméra, sous le cockpit)
            new THREE.Vector3(-4.0, -3.2, -6),
            new THREE.Vector3( 4.0, -3.2, -6)
        ],
        COLOR: LASER_GREEN
    };
    let tieGunSide = 0;
    let tieGunCooldown = 0;
    let tieLock = null;


    function updateTieGuns(dt) {
        tieGunCooldown -= dt;
        tieLock = null;
        if (state.isInsideShip) return;

        const camPos = camera.getWorldPosition(new THREE.Vector3());
        const fwd = camera.getWorldDirection(new THREE.Vector3());
        tieLock = findLockTarget(camPos, fwd, TIE_GUN.AIM_ASSIST_DEG, 1500);

        if (!(state.fireHeldSpace || state.fireHeldMouse) || tieGunCooldown > 0) return;
        tieGunCooldown = TIE_GUN.FIRE_INTERVAL;

        const from = camera.localToWorld(TIE_GUN.OFFSETS[tieGunSide].clone());
        tieGunSide = 1 - tieGunSide;

        const aim = tieLock
            ? leadPoint(tieLock, from, TIE_GUN.BOLT_SPEED)
            : camPos.clone().addScaledVector(fwd, TIE_GUN.CONVERGE);

        bolts.fire({
            from, dir: aim.sub(from),
            speed: TIE_GUN.BOLT_SPEED + state.currentFlightSpeed,     // + vitesse du TIE : le boost ne rattrape pas ses propres tirs
            length: 90, width: 2.6,                              // vus de dos : longs et épais
            color: TIE_GUN.COLOR, range: 2600, team: 'player',
            hitTest: playerBoltHitTest, onHit: onPlayerBoltHit
        });
        fx.muzzle(from, TIE_GUN.COLOR, 1.6);
        state.cameraShake = Math.max(state.cameraShake, 0.12);
        playVoice(sounds.tieLaserVoices);
    }

    return {
        setTurret, turretReady, updateTurret, updateTieGuns,
        get turretLock() { return turret.lock; },
        get tieLock() { return tieLock; }
    };
}
