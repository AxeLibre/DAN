import * as THREE from 'three';
import { BLOOM_LAYER } from '../core/bloom.js';

//===================================================
// ÉCRAN MAP : écran holographique qui s'ouvre au-dessus de la console
//===================================================
const ctrlScreenFadeSpeed = 1.5;

export function initMapScreen(ctx) {
    const { scene } = ctx;

    const ctrlscreen = document.createElement("video");
    ctrlscreen.src = "public/controlscreen.mp4";
    ctrlscreen.loop = true;
    ctrlscreen.muted = true;

    const ctrlTexture = new THREE.VideoTexture(ctrlscreen);

    const ctrlMaterial = new THREE.MeshBasicMaterial({
        map: ctrlTexture,
        transparent: true,
        opacity: 0, // écran invisible au départ
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
    });

    const ctrlPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(12, 6),
        ctrlMaterial
    );

    ctrlPlane.position.set(0, 5.3, 142);
    ctrlPlane.rotation.y = Math.PI;
    ctrlPlane.rotation.x = -Math.PI / 12;
    ctrlPlane.scale.x = 0;

    scene.add(ctrlPlane);
    ctrlPlane.layers.enable(BLOOM_LAYER);   // écran MAP holographique

    let ctrlScreenVisible = false;
    let ctrlScreenFadeDirection = 0; // 1 = fade in, -1 = fade out

    function toggleCtrlScreen() {
        const { ctrlscreenon, ctrlscreenoff } = ctx.audio.sounds;

        if (ctrlScreenVisible) {
            ctrlScreenFadeDirection = -1; // fade out
            ctrlscreenoff.play()
        } else {
            ctrlScreenFadeDirection = 1; // fade in
            ctrlscreen.play(); // démarre la vidéo si on l'allume
            ctrlscreenon.play()
        }

        ctrlScreenVisible = !ctrlScreenVisible;
    }

    function updateCtrlScreenFade(dt) {

        if (ctrlScreenFadeDirection === 0) return;

        // fade
        ctrlMaterial.opacity += ctrlScreenFadeDirection * ctrlScreenFadeSpeed * dt;
        ctrlMaterial.opacity = THREE.MathUtils.clamp(ctrlMaterial.opacity, 0, 1);

        // scale TV
        ctrlPlane.scale.x += ctrlScreenFadeDirection * ctrlScreenFadeSpeed * dt;
        ctrlPlane.scale.x = THREE.MathUtils.clamp(ctrlPlane.scale.x, 0, 1);

        if (ctrlMaterial.opacity === 0) {

            ctrlScreenFadeDirection = 0;
            ctrlscreen.pause();

        }

        if (ctrlMaterial.opacity === 1) {

            ctrlScreenFadeDirection = 0;

        }
    }

    return { video: ctrlscreen, toggle: toggleCtrlScreen, update: updateCtrlScreenFade };
}
