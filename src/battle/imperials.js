import * as THREE from 'three';
import { InstancedShips } from '../weapons.js';
import { makeGLTFLoader } from '../core/loaders.js';
import { LEGACY_TICK_RATE, BATTLE_Y } from '../core/constants.js';
import { HYPER_MOVE_DISTANCE } from '../bridge/hyperspace.js';

// TIE impériaux : chasseurs alliés qui décollent de la coque, et patrouilles autour de la tour
export function initImperials(ctx) {
    const { scene } = ctx;
    const battle = ctx.battle;
    const { fx, debris, friendlyShips, battleOn, instancerFor } = battle;

    // -------------------------------------------------------------------
    // 3. TIE ALLIÉS — décollent de la coque du destroyer
    // -------------------------------------------------------------------
    // phases : 'pool' (réserve) → 'launch' (sortent de la coque) → 'battle'
    //          → 'land' (replongent vers la coque) → 'pool'
    let tieModel = null;        // Modèle TIE
    const TIE_WING = {
        POOL: 24,
        LAUNCH_TIME: 1.6,
        REINFORCE_EVERY: 3,
        MAX_ACTIVE: 22
    };
    let tieReinforceTimer = 0;
    let tieBattleWasOn = false;
    const _fwdTie = new THREE.Vector3(0, 0, 1);

    makeGLTFLoader().load('public/tieinterlow.glb', (gltf) => {
        tieModel = gltf.scene;
        tieModel.scale.set(0.5,0.5,0.5);
        tieModel.rotation.y += Math.PI;

        for (let i = 0; i < TIE_WING.POOL; i++) createTie();
        createPatrols();
    });

    // -------------------------------------------------------------------
    // 4. PATROUILLES DE TIE INTERCEPTOR AUTOUR DE LA TOUR DU PONT
    // -------------------------------------------------------------------
    // Formations en V qui tournent autour de la tour pour surveiller la zone.
    // Rayon, altitude, vitesse et sens changent au hasard de temps en temps.
    const PATROL = {
        GROUPS: 3,
        SLOTS: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-45, 4, -40), new THREE.Vector3(45, -4, -40)], // (côté, haut, avant)
        CENTER: new THREE.Vector3(0, 0, 0),   // la tour du pont
        RADIUS: [320, 700],                   // reste loin de la tour (±185) et du canon (z 200)
        ALT: [40, 280],                       // au-dessus de la coque de l'Executor (y ≈ -80)
        SPEED: [55, 95]
    };
    const patrols = [];
    const prand = (a, b) => a + Math.random() * (b - a);

    // Les TIE des patrouilles sont instanciés (dessinés ensemble), avec leurs PROPRES
    // matériaux : on peut les estomper pendant l'hyperespace sans toucher aux TIE de la bataille.
    let patrolInstancer = null;
    let patrolFaded = false;

    function createPatrols() {
        const model = tieModel.clone();
        model.rotation.y = Math.PI;
        model.traverse(o => { if (o.isMesh) o.material = o.material.clone(); });
        patrolInstancer = new InstancedShips(scene, model, PATROL.GROUPS * PATROL.SLOTS.length);

        for (let g = 0; g < PATROL.GROUPS; g++) {
            const p = {
                angle: Math.random() * Math.PI * 2,
                dir: Math.random() < 0.5 ? 1 : -1,
                radius: prand(...PATROL.RADIUS), alt: prand(...PATROL.ALT), speed: prand(...PATROL.SPEED),
                timer: 0,
                pos: new THREE.Vector3(), prev: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1),
                members: []
            };
            p.radiusTarget = p.radius; p.altTarget = p.alt; p.speedTarget = p.speed;
            PATROL.SLOTS.forEach(() => {
                const tie = new THREE.Group();
                patrolInstancer.add(tie);
                p.members.push(tie);
            });
            patrols.push(p);
        }
    }

    function updatePatrols(dt) {
        if (!patrols.length || dt <= 0) return;
        const t = performance.now() * 0.001;
        const up = new THREE.Vector3(0, 1, 0);

        // Hyperespace : comme les autres vaisseaux autour (voir bridge/hyperspace.js), les patrouilles
        // glissent en s'estompant, restent cachées pendant le saut, puis reviennent.
        const hyperFade = ctx.hyperspace.fade;
        const hyperOffset = hyperFade.state === 'fadeOut' ? -HYPER_MOVE_DISTANCE * (1 - hyperFade.opacity)
                          : hyperFade.state === 'fadeIn'  ?  HYPER_MOVE_DISTANCE * (1 - hyperFade.opacity) : 0;
        const shown = hyperFade.state !== 'hidden';
        const fading = hyperFade.state === 'fadeOut' || hyperFade.state === 'fadeIn';

        patrols.forEach((p, gi) => {
            // nouvelle consigne de vol de temps en temps
            p.timer -= dt;
            if (p.timer <= 0) {
                p.timer = prand(5, 12);
                p.radiusTarget = prand(...PATROL.RADIUS);
                p.altTarget = prand(...PATROL.ALT);
                p.speedTarget = prand(...PATROL.SPEED);
                if (Math.random() < 0.2) p.dir *= -1;      // demi-tour de la patrouille
            }
            const k = 1 - Math.exp(-0.3 * dt);
            p.radius += (p.radiusTarget - p.radius) * k;
            p.alt += (p.altTarget - p.alt) * k;
            p.speed += (p.speedTarget - p.speed) * k;

            // le chef de patrouille tourne autour de la tour
            p.angle += p.dir * p.speed / p.radius * dt;
            p.prev.copy(p.pos);
            p.pos.set(Math.sin(p.angle) * p.radius, p.alt + Math.sin(t * 0.4 + gi * 2) * 20, Math.cos(p.angle) * p.radius).add(PATROL.CENTER);
            const step = p.pos.clone().sub(p.prev);
            if (step.lengthSq() > 1e-6) p.fwd.lerp(step.normalize(), 1 - Math.exp(-4 * dt)).normalize();

            // repère de la formation + inclinaison vers l'intérieur du virage
            const side = new THREE.Vector3().crossVectors(p.fwd, up).normalize();
            const upF = new THREE.Vector3().crossVectors(side, p.fwd).normalize();
            const roll = -p.dir * 0.35;

            p.members.forEach((tie, i) => {
                const s = PATROL.SLOTS[i];
                const target = p.pos.clone().addScaledVector(side, s.x).addScaledVector(upF, s.y).addScaledVector(p.fwd, s.z);
                if (tie.userData.placed) tie.position.lerp(target, 1 - Math.exp(-4 * dt));
                else { tie.position.copy(target); tie.userData.placed = true; }
                tie.quaternion.setFromUnitVectors(_fwdTie, p.fwd);
                tie.rotateZ(roll + Math.sin(t * 1.3 + i + gi) * 0.05);   // petit balancement

                // hyperespace
                tie.visible = shown;
                tie.position.z += hyperOffset;
            });
        });

        // fondu pendant l'hyperespace (tous les TIE de patrouille partagent ces matériaux)
        if (fading || patrolFaded) {
            for (const part of patrolInstancer.parts) {
                part.mesh.material.transparent = fading;
                part.mesh.material.opacity = fading ? hyperFade.opacity : 1;
            }
            patrolFaded = fading;
        }
        patrolInstancer.update();
    }

    function createTie() {
        const tie = new THREE.Group();
        instancerFor('tie', tieModel, TIE_WING.POOL, model => { model.rotation.y = Math.PI; }).add(tie);
        tie.visible = false;
        tie.userData = {
            phase: 'pool',
            velocity: new THREE.Vector3(),
            targetQuat: null,
            type: 'tie',
            dead: false,
            t: 0
        };
        scene.add(tie);
        friendlyShips.push(tie);
    }

    function launchTie() {
        const tie = friendlyShips.find(t => t.userData.phase === 'pool');
        if (!tie) return;
        const ud = tie.userData;
        // départ À L'INTÉRIEUR de la coque : le TIE "sort" du pont en montant
        tie.position.set((Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * 200), -190, 450 + Math.random() * 900);
        ud.velocity.set((Math.random() - 0.5) * 30, 70, 25 + Math.random() * 20);
        ud.phase = 'launch';
        ud.t = 0;
        ud.age = 0;
        ud.patrol = 1;
        ud.dead = false;
        ud.nextShot = undefined;
        ud.nextRandomExplosion = undefined;
        tie.quaternion.setFromUnitVectors(_fwdTie, ud.velocity.clone().normalize());
        ud.targetQuat = tie.quaternion.clone();
    }

    function updateTieWaves(dt) {
        const on = battleOn();
        if (on && !tieBattleWasOn) {
            for (let i = 0; i < 16; i++) setTimeout(() => { if (battleOn()) launchTie(); }, i * 250);
            tieReinforceTimer = 5;
        }
        if (!on && tieBattleWasOn) {
            // fin de la bataille : les TIE en vol rentrent vers la coque
            friendlyShips.forEach(t => {
                const ud = t.userData;
                if (ud.phase === 'battle' || ud.phase === 'launch') { ud.phase = 'land'; ud.t = 0; }
                else if (ud.phase !== 'land') { ud.phase = 'pool'; t.visible = false; }
            });
        }
        tieBattleWasOn = on;
        if (on) {
            tieReinforceTimer -= dt;
            if (tieReinforceTimer <= 0) {
                tieReinforceTimer = TIE_WING.REINFORCE_EVERY;
                const active = friendlyShips.filter(t => t.userData.phase !== 'pool').length;
                if (active < TIE_WING.MAX_ACTIVE) launchTie();
            }
        }
    }

    // -------------------------------------------------------------------
    // 5. MOUVEMENT DES TIE
    // -------------------------------------------------------------------

    function updateTies(dt) {
        if (!tieModel) return;
        const k = dt * LEGACY_TICK_RATE;
        const time = performance.now() * 0.001;

        friendlyShips.forEach((tie, index) => {
            const ud = tie.userData;
            const vel = ud.velocity;

            if (ud.phase === 'pool') { tie.visible = false; return; }

            if (ud.phase === 'launch') {
                ud.t += dt;
                if (ud.t > TIE_WING.LAUNCH_TIME) ud.phase = 'battle';
            } else if (ud.phase === 'land') {
                ud.t += dt;
                vel.y += (-80 - vel.y) * (1 - Math.exp(-2 * dt));
                if (ud.t > 2.2) { ud.phase = 'pool'; tie.visible = false; return; }
            } else {
                // combat : patrouille entre le destroyer et la flotte rebelle
                ud.age = (ud.age || 0) + dt;
                if (tie.position.z > 2000) ud.patrol = -1;
                else if (tie.position.z < 600) ud.patrol = 1;
                vel.z += (35 * ud.patrol - vel.z) * (1 - Math.exp(-0.8 * dt));
                const loopPhase = time * 0.5 + index + 10;
                const radius = 120;
                const targetX = Math.sin(loopPhase) * radius + Math.sin(time * 0.2 + index) * 150;
                const targetY = BATTLE_Y + Math.cos(loopPhase * 0.7) * radius + Math.cos(time * 0.3 + index) * 80;
                vel.x += (targetX - tie.position.x) * 0.02 * dt * 30;
                vel.y += (targetY - tie.position.y) * 0.02 * dt * 30;
                const damp = Math.exp(-0.9 * dt);
                vel.x *= damp;
                vel.y *= damp;

                // après un long combat : retour vers la coque (atterrissage)
                if (ud.age > 40 && tie.position.z < 900) { ud.phase = 'land'; ud.t = 0; }
            }

            tie.position.addScaledVector(vel, dt);

            // orientation
            if (vel.length() > 0.1) {
                if (!ud.targetQuat) ud.targetQuat = tie.quaternion.clone();
                const newTargetQuat = new THREE.Quaternion().setFromUnitVectors(_fwdTie, vel.clone().normalize());
                ud.targetQuat.slerp(newTargetQuat, 1 - Math.pow(1 - 0.05, k));
                tie.quaternion.slerp(ud.targetQuat, 1 - Math.pow(1 - 0.03, k));
            }

            tie.visible = (battleOn() || ud.phase === 'land') && !ud.dead;
        });
    }

    // -------------------------------------------------------------------
    // 9. DESTRUCTION DES TIE
    // -------------------------------------------------------------------
    function destroyTie(tie) {
        if (!tie || tie.userData.dead || tie.userData.phase !== 'battle') return;
        if (!battleOn()) return;
        tie.userData.dead = true;
        tie.visible = false;

        fx.explosion(tie.position.clone(), 15);
        debris.spawn(tie.position, 5, { speed: [10, 40], size: [0.8, 2.5], life: [2, 4], baseVel: tie.userData.velocity, hot: 0.6 });
        tie.userData.phase = 'pool';
    }

    return { tiesReady: () => !!tieModel, destroyTie, updateTieWaves, updateTies, updatePatrols };
}
