import * as THREE from 'three';
import { makeGLTFLoader } from '../core/loaders.js';
import { HYPERSPACE_BG } from '../core/skybox.js';
import { LEGACY_TICK_RATE } from '../core/constants.js';

// =========================================================================================
// SAUT EN HYPERESPACE (bouton bleu de la console)
// =========================================================================================
// Un immense écran (hyperscreen) entoure tout l'Executor et diffuse la vidéo du tunnel.
// Pendant le saut, les objets autour (destroyers en orbite, TIE…) glissent vers l'arrière
// en s'estompant, restent cachés, puis reviennent à la fin.
export const HYPER_MOVE_DISTANCE = 200;
const objectFadeSpeed = 0.02;
const fadeSpeed = 0.02;

// Rendu de la vidéo du tunnel (réglages à ajuster à l'œil)
const HYPER_BRIGHTNESS = 1.8;   // 1 = luminosité d'origine de la vidéo
const HYPER_CONTRAST = 1.6;     // 1 = contraste d'origine ; plus grand = noirs plus profonds, traînées plus vives

// Lumières bleutées devant les fenêtres du pont : elles s'allument avec le saut et scintillent
const WINDOW_LIGHTS = [
    { pos: [-45, 6, 138] },    // fenêtre de gauche
    { pos: [0, 8, 146] },      // fenêtre centrale
    { pos: [45, 6, 138] }      // fenêtre de droite
];
const WINDOW_LIGHT_COLOR = 0x9cc4ff;
const WINDOW_LIGHT_INTENSITY = 5000;   // au plus fort du saut
const WINDOW_LIGHT_DISTANCE = 170;

// Départ : les étoiles s'étirent devant les fenêtres, puis la vidéo du tunnel prend le relais
const STRETCH_TIME = 0.9;       // secondes avant l'entrée dans le tunnel
const STREAKS = 600;            // nombre de traînées d'étoiles
const ARRIVAL_STREAK_TIME = 0.7;

// Traînées d'étoiles : des lignes devant la passerelle (+Z) qui s'allongent vers la caméra.
// Tout est calculé dans le shader : un seul appel de dessin. (Pas de bloom : son halo
// ignore les murs et voilait tout l'intérieur du pont.)
function createStarStreaks() {
    const pos = new Float32Array(STREAKS * 2 * 3);
    const end = new Float32Array(STREAKS * 2);
    for (let i = 0; i < STREAKS; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 350 + Math.pow(Math.random(), 0.7) * 5000;     // pas d'étoile pile dans l'axe
        const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.7, z = 2500 + Math.random() * 9000;
        for (let j = 0; j < 2; j++) {
            pos.set([x, y, z], (i * 2 + j) * 3);
            end[i * 2 + j] = j;                                   // 0 = tête, 1 = queue
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    const mat = new THREE.ShaderMaterial({
        uniforms: { uStretch: { value: 0 } },
        vertexShader: /* glsl */`
            attribute float aEnd;
            uniform float uStretch;
            varying float vEnd;
            void main() {
                vec3 p = position;
                p.z -= uStretch * uStretch * 1800.0;          // les étoiles foncent vers nous
                p.z -= aEnd * uStretch * 5200.0;              // la queue s'allonge vers la caméra
                vEnd = aEnd;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            }`,
        fragmentShader: /* glsl */`
            uniform float uStretch;
            varying float vEnd;
            void main() {
                float a = smoothstep(0.0, 0.25, uStretch) * (1.0 - vEnd * 0.85);   // tête vive, queue estompée
                gl_FragColor = vec4(vec3(0.75, 0.88, 1.0) * 2.2, a);
            }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    lines.visible = false;
    return lines;
}

// Flash blanc plein écran (sortie du tunnel)
function createFlash() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;background:radial-gradient(circle at 50% 45%, #fff 0%, #e8f2ff 45%, #9cc4ff 100%);' +
        'opacity:0;pointer-events:none;z-index:99997;';
    document.body.appendChild(el);
    return (strength = 1, duration = 0.7) => {
        el.style.transition = 'none';
        el.style.opacity = String(strength);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            el.style.transition = `opacity ${duration}s ease-out`;
            el.style.opacity = '0';
        }));
    };
}

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
                    side: THREE.DoubleSide,
                    toneMapped: false    // l'écran émet sa lumière : pas assombri par l'exposition de la scène (0.3)
                });
                // contraste puis luminosité, appliqués à la couleur de la vidéo
                screenMaterial.onBeforeCompile = (shader) => {
                    shader.uniforms.uHyperBrightness = { value: HYPER_BRIGHTNESS };
                    shader.uniforms.uHyperContrast = { value: HYPER_CONTRAST };
                    shader.fragmentShader = shader.fragmentShader
                        .replace('#include <common>', '#include <common>\nuniform float uHyperBrightness;\nuniform float uHyperContrast;')
                        .replace('#include <map_fragment>', `#include <map_fragment>
                            diffuseColor.rgb = pow(max(diffuseColor.rgb, 0.0), vec3(uHyperContrast)) * uHyperBrightness;`);
                };
                obj.material = screenMaterial;
            }
        });

        worldGroup.add(hyperscreen);
    });

    // lumières des fenêtres (créées dès le départ, éteintes : pas de recompilation des shaders au 1er saut)
    const windowLights = WINDOW_LIGHTS.map(l => {
        const light = new THREE.PointLight(WINDOW_LIGHT_COLOR, 0, WINDOW_LIGHT_DISTANCE, 2);
        light.position.set(...l.pos);
        scene.add(light);
        return light;
    });

    // scintillement des lumières : traînées du tunnel qui passent + éclairs de temps en temps
    function updateWindowLights() {
        const glow = screenMaterial ? screenMaterial.opacity : 0;   // suit le fondu de l'écran
        const t = performance.now() * 0.001;
        windowLights.forEach((light, i) => {
            if (glow <= 0) { light.intensity = 0; return; }
            const flicker = 0.7 + 0.2 * Math.sin(t * 11 + i * 2.1) * Math.sin(t * 7.3 + i)
                          + 0.25 * Math.pow(Math.max(0, Math.sin(t * 3.1 + i * 1.7)), 16);
            light.intensity = WINDOW_LIGHT_INTENSITY * glow * flicker;
        });
    }

    // objets qui glissent et s'estompent pendant le saut (position de départ mémorisée)
    const objectsToFade = [];
    function addFadingObject(obj) {
        obj.userData.originalPosition = obj.position.clone();
        objectsToFade.push(obj);
    }

    const pivot = scene.getObjectByName("pivot");   // destroyers en orbite
    if (pivot) addFadingObject(pivot);

    // traînées d'étoiles (départ) et flash blanc (sortie)
    const streaks = createStarStreaks();
    scene.add(streaks);
    const flash = createFlash();
    let stretchT = 0;          // départ : 0 → 1 pendant STRETCH_TIME
    let arrivalT = 0;          // sortie : 1 → 0 (les traînées se résorbent)

    function setStreaks(s) {
        streaks.visible = s > 0;
        streaks.material.uniforms.uStretch.value = s;
    }

    // clic sur le bouton "Hyperspace"
    function start() {
        if (!isPlaying && video) {
            isPlaying = true;
            fadeState = "stretch";   // les étoiles s'étirent d'abord, puis le tunnel apparaît
            stretchT = 0;
            fade.state = "fadeOut"; // 👈 on lance le fade objets
        }
    }

    function update(k) {
        const dt = k / LEGACY_TICK_RATE;
        const { state } = ctx;

        // départ : étoiles qui s'étirent + tremblement qui monte
        if (isPlaying && fadeState === "stretch") {
            stretchT = Math.min(1, stretchT + dt / STRETCH_TIME);
            setStreaks(stretchT);
            state.cameraShake = Math.max(state.cameraShake, 0.15 + 0.7 * stretchT);
            if (stretchT >= 1) {
                fadeState = "fadeIn";
                state.cameraShake = Math.max(state.cameraShake, 1.1);   // entrée dans le tunnel
                video.currentTime = 0;
                video.play();
            }
        }
        // les traînées s'effacent quand le tunnel est affiché, et se résorbent à la sortie
        if (fadeState === "fadeIn" || fadeState === "playing") setStreaks(screenMaterial ? 1 - screenMaterial.opacity : 0);
        if (arrivalT > 0) {
            arrivalT = Math.max(0, arrivalT - dt / ARRIVAL_STREAK_TIME);
            setStreaks(arrivalT * arrivalT);
        }

        // pendant l'hyperespace : fond bleu nuit au lieu des étoiles (rien ne dépasse de l'écran)
        if (screenMaterial) {
            const hyper = screenMaterial.opacity > 0.5;
            scene.background = hyper ? HYPERSPACE_BG : null;
            sky.mesh.visible = !hyper;
        }
        updateWindowLights();

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
                    // sortie du tunnel : flash blanc, grosse secousse, traînées qui se résorbent
                    flash(1, 0.8);
                    state.cameraShake = Math.max(state.cameraShake, 1.4);
                    arrivalT = 1;
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

    return { video, fade, addFadingObject, start, update };
}
