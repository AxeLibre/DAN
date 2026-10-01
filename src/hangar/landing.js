import * as THREE from 'three';
import { BLOOM_LAYER } from '../core/bloom.js';

// ===================================================================
// BALISE D'ATTERRISSAGE + PILOTE AUTOMATIQUE (entrée / sortie du hangar)
// ===================================================================
// 3 cadres holographiques devant le hangar. En entrant dans la zone en volant
// vers le vaisseau, le pilote automatique fait entrer le TIE dans le hangar.
// À la sortie du hangar, il fait traverser le tunnel de la tourelle.
const HANGAR_OUTSIDE = new THREE.Vector3(0, 3.5, -250);   // point de sortie, derrière la tourelle (z ≈ -170)
const HANGAR_INSIDE  = new THREE.Vector3(0, 3.5, -62);    // dans le hangar, juste passé le détecteur
const LANDING_ZONE   = new THREE.Box3(new THREE.Vector3(-70, -35, -345), new THREE.Vector3(70, 45, -185));

export function initLanding(ctx) {
    const { scene, camera, state } = ctx;

    const landingBeacon = new THREE.Group();
    {
        const shape = new THREE.Shape();
        shape.moveTo(-32, -18); shape.lineTo(32, -18); shape.lineTo(32, 18); shape.lineTo(-32, 18); shape.lineTo(-32, -18);
        const hole = new THREE.Path();
        hole.moveTo(-29, -15); hole.lineTo(-29, 15); hole.lineTo(29, 15); hole.lineTo(29, -15); hole.lineTo(-29, -15);
        shape.holes.push(hole);
        const frameGeo = new THREE.ShapeGeometry(shape);
        const fillGeo = new THREE.PlaneGeometry(58, 30);
        [-200, -260, -320].forEach((z, i) => {
            const mat = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
            const fill = new THREE.MeshBasicMaterial({ color: 0x3388ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
            const frame = new THREE.Mesh(frameGeo, mat);
            frame.add(new THREE.Mesh(fillGeo, fill));
            frame.position.set(0, 3.5, z);
            frame.userData.index = i;
            landingBeacon.add(frame);
        });
        landingBeacon.visible = false;
        scene.add(landingBeacon);
    }
    landingBeacon.traverse(o => o.layers.enable(BLOOM_LAYER));   // cadres lumineux

    const autopilot = { active: false, t: 0, duration: 2, curve: null, yawFrom: 0, yawTo: 0 };

    function startAutopilot(points, yawTo, duration) {
        autopilot.active = true;
        autopilot.t = 0;
        autopilot.duration = duration;
        autopilot.curve = new THREE.CatmullRomCurve3(points);
        autopilot.yawFrom = ctx.player.rotation.y;
        // chemin angulaire le plus court
        let d = (yawTo - autopilot.yawFrom) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        autopilot.yawTo = autopilot.yawFrom + d;
        state.fireHeldSpace = false;
        state.fireHeldMouse = false;
    }

    function updateAutopilot(dt) {
        const player = ctx.player;
        autopilot.t = Math.min(1, autopilot.t + dt / autopilot.duration);
        const e = autopilot.t * autopilot.t * (3 - 2 * autopilot.t);          // départ et arrivée en douceur
        player.position.copy(autopilot.curve.getPoint(e));
        player.rotation.y = autopilot.yawFrom + (autopilot.yawTo - autopilot.yawFrom) * Math.min(1, e * 1.6);
        // remise à plat du TIE
        const k = 1 - Math.exp(-5 * dt);
        state.flightPitch += (0 - state.flightPitch) * k;
        state.flightRoll += (0 - state.flightRoll) * k;
        state.rotationVelocity = 0;
        camera.rotation.x = state.flightPitch;
        camera.rotation.z = state.flightRoll;
        if (autopilot.t >= 1) autopilot.active = false;
    }

    function updateLanding(dt) {
        // balise visible seulement en vol, lumières qui défilent vers le hangar
        landingBeacon.visible = !state.isInsideShip;
        if (landingBeacon.visible) {
            const t = performance.now() * 0.001;
            landingBeacon.children.forEach(f => {
                const phase = (t * 1.5 - (2 - f.userData.index) * 0.33) % 1;
                f.material.opacity = 0.25 + 0.75 * Math.pow(Math.max(0, Math.cos(phase * Math.PI * 2)), 4);
            });
        }
        if (autopilot.active || state.isInsideShip) return;

        // dans la zone ET en direction du vaisseau → atterrissage automatique
        const player = ctx.player;
        const fwd = camera.getWorldDirection(new THREE.Vector3());
        if (LANDING_ZONE.containsPoint(player.position) && fwd.z > 0.3) {
            startAutopilot([player.position.clone(), new THREE.Vector3(0, 3.5, -200), HANGAR_INSIDE.clone()], Math.PI, 2.6);
        }
    }

    // pilote automatique : traversée du tunnel de la tourelle jusqu'à l'extérieur
    function leaveHangar() {
        startAutopilot([ctx.player.position.clone(), new THREE.Vector3(0, 3.5, -130), HANGAR_OUTSIDE.clone()], 0, 2.2);
    }

    return {
        autopilotActive: () => autopilot.active,
        updateAutopilot,
        update: updateLanding,
        leaveHangar,
        // vol automatique depuis la position actuelle, en passant par des points (missions)
        flyTo: (points, yawTo, duration) => startAutopilot([ctx.player.position.clone(), ...points], yawTo, duration),
        cancel: () => { autopilot.active = false; }
    };
}
