import * as THREE from 'three';
import { makeGLTFLoader } from '../core/loaders.js';

// ===================================================================
// CONSOLE DE CHOIX DU TIE : clignote, réagit au survol et au clic
// ===================================================================
export function initHangarConsole(ctx) {
    const { scene, camera, renderer, mouse, state } = ctx;
    const hangarConsole = { mats: [], light: null, hover: false, flash: 0, press: 0, t: 0 };
    const consoleRay = new THREE.Raycaster();
    let screenhangar;

    makeGLTFLoader().load('public/screenhangar.glb', (gltf) => {
        screenhangar = gltf.scene;
        screenhangar.position.set(-22, -12, -73);
        screenhangar.scale.set(6,6,6);
        screenhangar.rotation.y = Math.PI/2;
        scene.add(screenhangar);

        // matériaux propres à la console (pour les faire clignoter)
        screenhangar.traverse(o => {
            if (!o.isMesh || !o.material.emissive) return;
            o.material = o.material.clone();
            const n = o.material.name;
            hangarConsole.mats.push({
                mat: o.material,
                kind: /Red/.test(n) ? 'red' : /Blue/.test(n) ? 'blue' : 'screen',
                base: o.material.emissiveIntensity
            });
        });
        // petite lumière qui éclaire le sol autour de la console
        hangarConsole.light = new THREE.PointLight(0x66aaff, 0, 45, 2);
        hangarConsole.light.position.set(-17, -2, -73);
        scene.add(hangarConsole.light);
        // (pas de bloom sur la console : l'écran devenait illisible)
    });

    function updateHangarConsole(dt) {
        if (!screenhangar) return;
        const hc = hangarConsole;
        hc.t += dt;

        // survol (seulement à pied, à proximité)
        const near = state.isInsideShip && ctx.player.position.distanceTo(screenhangar.position) < 90;
        let hover = false;
        if (near) {
            consoleRay.setFromCamera(mouse, camera);
            hover = consoleRay.intersectObject(screenhangar, true).length > 0;
        }
        if (hover !== hc.hover) {
            hc.hover = hover;
            if (!ctx.hud.mode) renderer.domElement.style.cursor = hover ? 'pointer' : '';
        }

        hc.flash = Math.max(0, hc.flash - dt * 2.5);
        hc.press = Math.max(0, hc.press - dt * 5);

        // pulsation "regarde-moi !" + boost au survol + flash au clic
        const pulse = 0.5 + 0.5 * Math.sin(hc.t * 4);
        const blink = Math.sin(hc.t * 6) > 0;
        const boost = (hover ? 1.8 : 1) + hc.flash * 4;
        for (const m of hc.mats) {
            if (m.kind === 'screen') m.mat.emissiveIntensity = m.base * (0.55 + 0.75 * pulse) * boost;
            else if (m.kind === 'red') m.mat.emissiveIntensity = m.base * (blink ? 3 : 0.2) * boost;
            else m.mat.emissiveIntensity = m.base * (blink ? 0.2 : 3) * boost;
        }
        if (hc.light) hc.light.intensity = (150 + 250 * pulse) * boost;

        // léger grossissement au survol, "bouton pressé" au clic
        const s = 6 * (hover ? 1.04 : 1) * (1 - 0.05 * Math.sin(hc.press * Math.PI));
        screenhangar.scale.setScalar(s);
    }

    // flash + "bouton pressé" sur la console
    function press() {
        hangarConsole.flash = 1;
        hangarConsole.press = 1;
    }

    return {
        get screen() { return screenhangar; },
        update: updateHangarConsole,
        press
    };
}
