import * as THREE from 'three';
import { makeGLTFLoader } from '../core/loaders.js';

// =================
// PORTES entre le hangar et la passerelle : s'ouvrent quand le joueur approche
// =================
export function initDoors(ctx) {
    const { scene, worldGroup } = ctx;

    let doorleft, doorright;
    let doorState = 0; // 0 = fermé, 1 = ouvert

    const loader10 = makeGLTFLoader();

    loader10.load('public/doorleft.glb', (gltf)=>{
        doorleft = gltf.scene; //
        doorleft.position.set(-12,-12, 233);
        doorleft.scale.set(10,10,10);
        doorleft.rotation.y = Math.PI;
        worldGroup.add(doorleft);
    });

    const loader11 = makeGLTFLoader();

    loader11.load('public/doorright.glb', (gltf)=>{
        doorright = gltf.scene; //
        doorright.position.set(12,-12, 233);
        doorright.scale.set(10,10,10);
        doorright.rotation.y = Math.PI;
        worldGroup.add(doorright);
    });

    // BOX de detection

    const trigger = new THREE.Mesh(
        new THREE.BoxGeometry(30, 20, 30),
        new THREE.MeshBasicMaterial({ visible: false }),
    );
    trigger.position.set(0,0,-35);
    scene.add(trigger);

    // Ouverture

    let previousDoorState = false;

    function updateDoors(k = 1) {

        if(!doorleft || !doorright) return;

        const speed = 1 - Math.pow(1 - 0.05, k);
        const openOffset = 12;

        const targetLeftX  = doorState ? 12 - openOffset : -12;
        const targetRightX = doorState ? -12 + openOffset : 12;

        // 🔊 Joue le son seulement si l'état change
        const { doorSound } = ctx.audio.sounds;
        if (doorState !== previousDoorState) {
            if (doorSound && doorSound.buffer) {
                doorSound.play();
            }
            previousDoorState = doorState;
        }

        doorleft.position.x  = THREE.MathUtils.lerp(
            doorleft.position.x,
            targetLeftX,
            speed
        );

        doorright.position.x = THREE.MathUtils.lerp(
            doorright.position.x,
            targetRightX,
            speed
        );
    }

    // ouvertes quand le joueur est tout près de la zone de détection
    function updateTrigger(playerPosition) {
        const distance = playerPosition.distanceTo(trigger.position);

        if (distance < 15) {
            doorState = 1; // ouvrir
        } else {
            doorState = 0; // fermer
        }
    }

    return {
        ready: () => !!(doorleft && doorright),
        updateTrigger,
        update: updateDoors
    };
}
