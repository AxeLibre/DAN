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

// Lueur bleue du tunnel sur le pont : pendant le saut, les lumières d'ambiance déjà
// présentes (ambiante + hémisphérique) se teintent de bleu et scintillent.
// (Pas de lumière en plus : chaque lumière de three.js est calculée sur chaque pixel
// éclairé, TOUT LE TEMPS — 3 lumières coûtaient ~30 % de rendu et figeaient la vidéo.)
const JUMP_LIGHT_COLOR = new THREE.Color(0x9cc4ff);
const JUMP_TINT = 0.85;          // part de bleu au plus fort du saut
const JUMP_HEMI_BOOST = 1.4;     // intensité ajoutée à la lumière hémisphérique
const JUMP_AMBIENT_BOOST = 0.5;  // intensité ajoutée à la lumière ambiante

// Sortie du tunnel : flash blanc qui se termine pile à la fin de la vidéo (la caméra tremble
// pendant tout le flash), puis les étoiles, encore étirées, se résorbent
const FLASH_TIME = 0.9;         // le flash commence 0,9 s avant la fin de la vidéo…
const FLASH_PEAK = 0.3;         // …est au plus fort 0,3 s plus tard (le tunnel disparaît dessous)
const FLASH_SHAKE = 1.2;        // tremblement pendant le flash
const STREAKS = 600;            // nombre de traînées d'étoiles
const ARRIVAL_STREAK_TIME = 1.0;

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

// Flash blanc plein écran (sortie du tunnel) : opacité réglée à chaque image,
// calée sur le temps de la vidéo
function createFlash() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;background:radial-gradient(circle at 50% 45%, #fff 0%, #e8f2ff 45%, #9cc4ff 100%);' +
        'opacity:0;pointer-events:none;z-index:99997;';
    document.body.appendChild(el);
    let current = 0;
    return (opacity) => {
        if (opacity === current) return;
        current = opacity;
        el.style.opacity = opacity.toFixed(3);
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

    // lueur du tunnel : teinte les lumières d'ambiance (valeurs normales mémorisées)
    const { ambient, hemi } = ctx.lights;
    const base = {
        ambientColor: ambient.color.clone(), ambientIntensity: ambient.intensity,
        hemiColor: hemi.color.clone(), hemiIntensity: hemi.intensity
    };
    let glowing = false;

    // scintillement : traînées du tunnel qui passent + éclairs de temps en temps
    function updateJumpLight() {
        const glow = screenMaterial ? screenMaterial.opacity : 0;   // suit le fondu de l'écran
        if (glow <= 0) {
            if (glowing) {            // retour exact à l'éclairage normal
                glowing = false;
                ambient.color.copy(base.ambientColor); ambient.intensity = base.ambientIntensity;
                hemi.color.copy(base.hemiColor); hemi.intensity = base.hemiIntensity;
            }
            return;
        }
        glowing = true;
        const t = performance.now() * 0.001;
        const flicker = 0.7 + 0.2 * Math.sin(t * 11) * Math.sin(t * 7.3)
                      + 0.25 * Math.pow(Math.max(0, Math.sin(t * 3.1)), 16);
        hemi.color.copy(base.hemiColor).lerp(JUMP_LIGHT_COLOR, JUMP_TINT * glow);
        hemi.intensity = base.hemiIntensity + JUMP_HEMI_BOOST * glow * flicker;
        ambient.color.copy(base.ambientColor).lerp(JUMP_LIGHT_COLOR, JUMP_TINT * glow);
        ambient.intensity = base.ambientIntensity + JUMP_AMBIENT_BOOST * glow * flicker;
    }

    // objets qui glissent et s'estompent pendant le saut (position de départ mémorisée)
    const objectsToFade = [];
    function addFadingObject(obj) {
        obj.userData.originalPosition = obj.position.clone();
        objectsToFade.push(obj);
    }

    const pivot = scene.getObjectByName("pivot");   // destroyers en orbite
    if (pivot) addFadingObject(pivot);

    // flash blanc et traînées d'étoiles (sortie du tunnel)
    const streaks = createStarStreaks();
    scene.add(streaks);
    const setFlash = createFlash();
    let exited = false;        // tunnel déjà caché sous le flash
    let arrivalT = 0;          // après le flash : 1 → 0 (les traînées se résorbent)

    function setStreaks(s) {
        streaks.visible = s > 0;
        streaks.material.uniforms.uStretch.value = s;
    }

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
        const dt = k / LEGACY_TICK_RATE;
        const { state } = ctx;

        // après le flash : les étoiles encore étirées se résorbent
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
        updateJumpLight();

        if (isPlaying && screenMaterial && video) {
            if (fadeState === "fadeIn") {
                screenMaterial.opacity += fadeSpeed * k;
                if (screenMaterial.opacity >= 1) {
                    screenMaterial.opacity = 1;
                    fadeState = "playing";
                }
            }
            else if (fadeState === "playing") {
                if (video.duration && video.duration - video.currentTime <= FLASH_TIME) {
                    fadeState = "flash";
                    exited = false;
                }
            }
            else if (fadeState === "flash") {
                const t = FLASH_TIME - Math.max(0, video.duration - video.currentTime);   // 0 → FLASH_TIME
                state.cameraShake = Math.max(state.cameraShake, FLASH_SHAKE);

                if (t < FLASH_PEAK) {
                    setFlash(t / FLASH_PEAK);
                } else {
                    // au plus fort du flash : le tunnel disparaît dessous, les objets reviennent
                    if (!exited) {
                        exited = true;
                        ctx.audio.sounds.boom.play();
                        screenMaterial.opacity = 0;
                        fade.state = "fadeIn"; // 👈 on relance l’apparition
                    }
                    const u = (t - FLASH_PEAK) / (FLASH_TIME - FLASH_PEAK);
                    setFlash(Math.max(0, 1 - u * u));
                }

                // fin de la vidéo = fin du flash : les étoiles étirées apparaissent
                if (video.ended || t >= FLASH_TIME - 0.02) {
                    setFlash(0);
                    arrivalT = 1;
                    video.pause();
                    video.currentTime = 0;
                    fadeState = "idle";
                    isPlaying = false;
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
