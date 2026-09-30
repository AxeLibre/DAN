import * as THREE from 'three';
import { makeGLTFLoader } from '../core/loaders.js';
import { HYPERSPACE_BG } from '../core/skybox.js';

// =========================================================================================
// SAUT EN HYPERESPACE (bouton bleu de la console)
// =========================================================================================
// Un immense écran (hyperscreen) entoure tout l'Executor et diffuse la vidéo du tunnel.
// Pendant le saut, les objets autour (destroyers en orbite, TIE…) glissent vers l'arrière
// en s'estompant, restent cachés, puis reviennent à la fin.
export const HYPER_MOVE_DISTANCE = 200;
const objectFadeSpeed = 0.02;
const fadeSpeed = 0.02;

function setOpacityRecursive(object, opacity) {
    object.traverse((child) => {
        if (child.isMesh) {
            child.material.transparent = true;
            child.material.opacity = opacity;
        }
    });
}

export function initHyperspace(ctx) {
    const { scene, worldGroup, sky } = ctx;

    const video = document.createElement("video");
    video.src = "public/hyperscreen.mp4";
    video.loop = false;
    video.muted = false; // important
    video.playsInline = true;
    video.pause();

    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    videoTexture.flipY = false;

    let hyperscreen;
    let screenMaterial;
    let isPlaying = false;        // ✅ contrôle si l’animation de l’écran est en cours
    let fadeState = "idle";  // "idle" | "fadeIn" | "playing" | "fadeOut"

    // fondu des objets 3D autour : state "idle" | "fadeOut" | "hidden" | "fadeIn"
    const fade = { state: "idle", opacity: 1 };

    const loader9 = makeGLTFLoader();

    loader9.load('public/hyperscreen.glb', (gltf) => {
        hyperscreen = gltf.scene;
        // Écran agrandi ×21 (mêmes proportions qu'avant : 50 × 150 × 70) pour englober TOUT l'Executor :
        // l'avant du vaisseau reste visible depuis le pont, devant le tunnel d'hyperespace.
        // Hauteur et largeur augmentées pour que le bord (ouvert) de l'écran reste hors du champ de vision.
        // Boîte obtenue : x ±29 800, y -23 200 → 23 200 (centrée sur les yeux), z -19 300 → 21 200
        // (proue de l'Executor à z ≈ 20 000 ; coin le plus lointain ≈ 43 000 < far 50 000).
        hyperscreen.position.set(0, -11664, 2500);
        hyperscreen.scale.set(1700, 5437, 1470);
        hyperscreen.rotation.y = Math.PI;

        hyperscreen.traverse(obj => {
            if(obj.isMesh){
                screenMaterial = new THREE.MeshBasicMaterial({ // ⚡ récupéré ici
                    map: videoTexture,
                    transparent: true,
                    opacity: 0,
                    depthWrite: false,   // invisible la plupart du temps : ne doit rien masquer derrière lui
                    side: THREE.DoubleSide
                });
                obj.material = screenMaterial;
            }
        });

        worldGroup.add(hyperscreen);
    });

    // objets qui glissent et s'estompent pendant le saut
    const objectsToFade = [];

    const tie = scene.getObjectByName("tie_fighter0");
    const pivot2 = scene.getObjectByName("pivot");

    if (tie) objectsToFade.push(tie);
    if (pivot2) objectsToFade.push(pivot2);

    objectsToFade.forEach(obj => {
        obj.userData.originalPosition = obj.position.clone();
    });

    // clic sur le bouton "Hyperspace"
    function start() {
        if (!isPlaying && video) {
            isPlaying = true;
            fadeState = "fadeIn";
            fade.state = "fadeOut"; // 👈 on lance le fade objets
            video.currentTime = 0;
            video.play();
        }
    }

    function update(k) {
        // pendant l'hyperespace : fond bleu nuit au lieu des étoiles (rien ne dépasse de l'écran)
        if (screenMaterial) {
            const hyper = screenMaterial.opacity > 0.5;
            scene.background = hyper ? HYPERSPACE_BG : null;
            sky.mesh.visible = !hyper;
        }

        if (isPlaying && screenMaterial && video) {
            if (fadeState === "fadeIn") {
                screenMaterial.opacity += fadeSpeed * k;
                if (screenMaterial.opacity >= 1) {
                    screenMaterial.opacity = 1;
                    fadeState = "playing";
                }
            }
            else if (fadeState === "playing") {
                if (video.currentTime >= video.duration - 0.1 ) fadeState = "fadeOut";

            }
            else if (fadeState === "fadeOut") {
                screenMaterial.opacity -= fadeSpeed * k;
                if (screenMaterial.opacity <= 0) {
                    ctx.audio.sounds.boom.play();
                    screenMaterial.opacity = 0;
                    video.pause();
                    video.currentTime = 0;
                    fadeState = "idle";
                    isPlaying = false;
                    fade.state = "fadeIn"; // 👈 on relance l’apparition
                }
            }
        }

        // 🎬 Fade des objets 3D
        if (fade.state === "fadeOut") {

            fade.opacity -= objectFadeSpeed * k;

            objectsToFade.forEach(obj => {

                const origin = obj.userData.originalPosition;
                if (!origin) return; // évite le crash

                obj.position.z = origin.z - (HYPER_MOVE_DISTANCE * (1 - fade.opacity));

                setOpacityRecursive(obj, fade.opacity);
            });

            if (fade.opacity <= 0) {
                fade.opacity = 0;

                objectsToFade.forEach(obj => {
                    obj.visible = false;
                });

                fade.state = "hidden";
            }
        }

        else if (fade.state === "fadeIn") {

            fade.opacity += objectFadeSpeed * k;

            objectsToFade.forEach(obj => {

                // 🔒 Si jamais la position originale n’existe pas,
                // on la recrée automatiquement
                if (!obj.userData.originalPosition) {
                    obj.userData.originalPosition = obj.position.clone();
                }

                const origin = obj.userData.originalPosition;

                obj.visible = true;

                obj.position.z = origin.z + (HYPER_MOVE_DISTANCE * (1 - fade.opacity));

                setOpacityRecursive(obj, fade.opacity);
            });

            if (fade.opacity >= 1) {

                fade.opacity = 1;

                objectsToFade.forEach(obj => {
                    if (obj.userData.originalPosition) {
                        obj.position.copy(obj.userData.originalPosition);
                    }
                });

                fade.state = "idle";
            }
        }
    }

    return { video, fade, objectsToFade, start, update };
}
