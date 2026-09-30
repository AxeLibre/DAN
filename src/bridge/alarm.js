import * as THREE from 'three';
import { makeGLTFLoader } from '../core/loaders.js';

// =========================================================
// ALARME : plafonnier rouge qui pulse, sirène, éclairage d'alerte
// =========================================================
export function initAlarm(ctx) {
    const { scene, renderer, env } = ctx;

    let panelMesh;
    let panelMixer;
    let panelAction;
    let alarmActive = false; // état ON/OFF
    let blinkTime = 0;
    let envBlink = 0;
    let envToggle = false;

    // Chargement du panneau GLB

    const panelLoader = makeGLTFLoader();

    panelLoader.load('public/alarm.glb', (gltf) => {

        const panel = gltf.scene;
        panel.position.set(0,-12, 98.5);
        panel.scale.set(10,10,10);
        panel.rotation.y = Math.PI; // faire face à la caméra
        scene.add(panel);
        console.log("Contenu du panel GLB :", panel);

        panel.traverse((child) => {
            console.log("Objet trouvé :", child.name);
        });

        panelMesh = panel.getObjectByName("Celling_Top_Light_0001");

        if (!panelMesh) {
            console.error("❌ panelMesh introuvable !");
        } else {
            console.log("✅ panelMesh trouvé :", panelMesh);
        }

        // Si animation exportée depuis Blender
        if (gltf.animations.length > 0) {
            panelMixer = new THREE.AnimationMixer(panel);
            panelAction = panelMixer.clipAction(gltf.animations[0]);

            panelAction.setLoop(THREE.LoopRepeat); // répète tant que actif
            panelAction.clampWhenFinished = false;
        }

    });

    function startAlarm() {
        const { alarmSound } = ctx.audio.sounds;
        alarmActive = true;

        if (!alarmSound.isPlaying) {
            alarmSound.play();
        }
    }

    function stopAlarm() {
        const { alarmSound } = ctx.audio.sounds;

        alarmActive = false;

        if (alarmSound && alarmSound.isPlaying) {
            alarmSound.stop();
        }

        if (env.main) {
            scene.environment = env.main;
        }

        if (panelMesh) {
            const mat = panelMesh.material;
            mat.emissive.set(0xffffff);
            mat.emissiveIntensity = 5.0;
        }
    }

    // clic sur le bouton rouge de la console
    function toggle() {
        if (!alarmActive) {
            startAlarm();
        } else {
            stopAlarm();
        }
    }

    function update(dt) {
        if (alarmActive && panelMesh) {

            blinkTime += dt * 2.805;
            envBlink += dt * 2.805;

            const mat = panelMesh.material;

            const pulse = (Math.sin(blinkTime) + 1) / 2;

            mat.emissive.set(0xff0000);
            mat.emissiveIntensity = 1 + pulse * 4;

            // exposition synchronisée
            renderer.toneMappingExposure = 0.3 + pulse * 0.6;

            // SWITCH HDR synchronisé avec le pulse
            const newToggle = pulse > 0.5;

            if (newToggle !== envToggle) {

                envToggle = newToggle;

                scene.environment = envToggle ? env.alarm : env.main;
            }
        }

        if (!alarmActive) {

            scene.environment = env.main;
            renderer.toneMappingExposure = 0.3;
        }
    }

    return { toggle, update };
}
