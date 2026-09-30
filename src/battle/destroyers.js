import * as THREE from 'three';
import { makeGLTFLoader } from '../core/loaders.js';
import { LEGACY_TICK_RATE } from '../core/constants.js';

// ===================================================================
// DESTROYERS IMPÉRIAUX EN ORBITE autour de la passerelle
// ===================================================================
// Deux destroyers accrochés à un "plateau tournant" (pivot) centré sur (0,0,0).
export const PIVOT_OMEGA = -0.001 * LEGACY_TICK_RATE;   // rotation du pivot des destroyers (rad/s)

export function initDestroyers(ctx) {
    //plateau tournant
    // pivot autour de (0,0,0)
    const pivot = new THREE.Group();
    pivot.position.set(0,0,0); // point autour duquel tu veux tourner
    pivot.name = "pivot";
    ctx.scene.add(pivot);

    const loader3 = makeGLTFLoader();

    loader3.load('public/star_destroyer2.glb', (gltf)=>{

        const star_destroyer = gltf.scene;

        star_destroyer.position.set(0, 10, 1100);   // orbite 900 → 1100 : à 900 il frôlait/traversait le gros destroyer du décor
        star_destroyer.scale.set(30,30,30);
        star_destroyer.rotation.y = -Math.PI;

        pivot.add(star_destroyer);

        const star_destroyer2 = star_destroyer.clone();
        star_destroyer2.position.set(0, 20, -1100);
        star_destroyer2.scale.set(30,30,30);
        star_destroyer2.rotation.y = Math.PI;
        pivot.add(star_destroyer2);

    });

    return {
        pivot,
        // rotation du pivot autour de Y (k : nombre d'images de l'ancienne boucle)
        update(k) {
            pivot.rotation.y -= 0.001 * k; // vitesse de rotation
        }
    };
}
