import * as THREE from 'three';
import { loadingManager } from '../core/loaders.js';

// =========================================================================================
// HOLOGRAMME EN PARTICULES (table centrale de la passerelle)
// =========================================================================================
// Une série de formes (logo de l'Empire, vaisseaux, personnages…) ; chaque particule
// glisse de sa place dans la forme actuelle à sa place dans la suivante ("morph").
// Bouton bleu : allumer / éteindre. Bouton rouge : forme suivante.

// Formes en binaire (x,y,z en Float32) : ~10 Mo au lieu de ~200 Mo de JSON.
// Générées depuis les JSON d'origine par tools/holo-to-bin.mjs
function loadShape(name) {
    return fetch('public/holo/' + name + '.bin')
        .then(r => r.ok ? r.arrayBuffer() : Promise.reject('File not found ' + name))
        .then(buf => new Float32Array(buf));
}

const HOLO_SHAPES = ['empire', 'tiefighter', 'tieinterceptor', 'tiebomber', 'atst', 'atat',
                     'stardestroyer', 'deathstar', 'darkmaul', 'darkvador', 'kylo', 'galaxy'];

const hologramFadeSpeed = 0.03;
const morphDuration = 2.0;   // durée du morph

export function initHologram(ctx) {
    const { scene } = ctx;

    let particleSystem, material;
    let shapes;
    let positionAttr;
    let targetAttr;

    let currentIndex = 0;
    let nextIndex = 1;
    let morphState = "morph"; // "morph" ou "done"

    let hologramActive = false;   // état logique ON/OFF
    let hologramOpacity = 0;     // valeur actuelle
    let hologramTarget = 0;      // 0 ou 1

    // fetch ne passe pas par les chargeurs de three.js : on prévient l'écran de chargement,
    // pour que le bouton PLAY attende aussi l'hologramme
    loadingManager.itemStart('hologram');

    Promise.all(HOLO_SHAPES.map(loadShape)).then(list => {

        // l'empire deux fois de suite pour le "battement" (comme avant)
        const shapes = [list[0], ...list];

        const maxCount = Math.max(...shapes.map(s => s.length / 3));

        const formattedShapes = shapes.map(shape => {
            const count = shape.length / 3;
            const arr = new Float32Array(maxCount * 3);
            for (let i = 0; i < maxCount; i++) {
                const j = (i % count) * 3;
                arr[i*3+0] = shape[j];
                arr[i*3+1] = shape[j + 1];
                arr[i*3+2] = shape[j + 2];
            }
            return arr;
        });

        initMorphSystem(formattedShapes, maxCount); // ✅ on passe la variable

    }).finally(() => loadingManager.itemEnd('hologram'));

    function initMorphSystem(shapesArray, count){

        shapes = shapesArray;

        currentIndex = 0;
        nextIndex = 1;

        const geometry = new THREE.BufferGeometry();

        positionAttr = new THREE.BufferAttribute(
            shapes[currentIndex].slice(), 3
        );

        targetAttr = new THREE.BufferAttribute(
            shapes[nextIndex].slice(), 3
        );

        // 🔥 seed obligatoire pour ton shader
        const seed = new Float32Array(count);
        for(let i=0;i<count;i++){
            seed[i] = Math.random();
        }

        geometry.setAttribute('position', positionAttr);
        geometry.setAttribute('target', targetAttr);
        geometry.setAttribute('seed', new THREE.BufferAttribute(seed,1));

        material = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,

            uniforms: {
                morph: { value: 0 },
                time: { value: 0 },
                globalRotation: { value: 0 },
                uOpacity: { value: 0 } // 👈 AJOUT
            },

            vertexShader: `
    precision mediump float;
    attribute vec3 target;
    attribute float seed;
    uniform float morph;
    uniform float time;
    uniform float globalRotation;

    mat3 rotationY(float angle){
        float s = sin(angle);
        float c = cos(angle);
        return mat3(
            c, 0.0, -s,
            0.0, 1.0, 0.0,
            s, 0.0,  c
        );
    }

    void main(){

        // 1️⃣ Morph
        vec3 pos = mix(position, target, morph);

        // 2️⃣ Micro vibration holographique
        float a = seed * 6.283185 + time * 1.5;
        pos += vec3(
            cos(a) * 0.03,
            sin(a * 1.3) * 0.03,
            sin(a * 0.7) * 0.03
        );

        // 3️⃣ Rotation globale Y
        pos = rotationY(globalRotation) * pos;

        // 4️⃣ Projection
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        // 5️⃣ Taille perspective
        float perspective = 1.0 / -mvPosition.z;
        gl_PointSize = clamp(18.0 * perspective, 1.5, 6.0);
    }
    `,

            fragmentShader: `
    precision mediump float;
    uniform float time;
    uniform float uOpacity;

    void main(){

        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);

        float core = exp(-d*d*70.0);
        float ring = exp(-d*d*18.0);
        float halo = exp(-d*d*4.0);

        vec3 color =
            vec3(1.4,1.8,2.6)*core +
            vec3(0.4,1.0,2.4)*ring +
            vec3(0.12,0.45,1.6)*halo;

        // scan hologramme
        float scan = sin(gl_FragCoord.y * 0.1 + time*5.0)*0.1;
        color += scan;

        color = pow(color, vec3(0.85));

        float alpha = halo * 0.65 * uOpacity;
        gl_FragColor = vec4(color, alpha);
    }
    `
        });

        particleSystem = new THREE.Points(geometry, material);
        particleSystem.scale.set(0.3,0.3,0.3);
        particleSystem.position.set(0,1,0);
        particleSystem.visible = true; // on le laisse visible, on contrôle juste l'opacité
        scene.add(particleSystem);
        // (pas de bloom sur l'hologramme : ses particules brillent déjà, c'était trop)
    }

    function update(dt, k) {
        if (!material) return;

        // le temps du shader avance deux fois par image (scintillement d'origine du jeu)
        material.uniforms.time.value += dt;

        // Si une morph est en cours, on incrémente la progression
        if (morphState === "morph") {
            material.uniforms.morph.value += dt / morphDuration;

            if (material.uniforms.morph.value >= 1) {
                material.uniforms.morph.value = 1;
                morphState = "done"; // Transition terminée
            }
        }

        material.uniforms.time.value += dt;
        material.uniforms.globalRotation.value += dt * 0.2;

        // ===== Hologram Fade =====
        hologramOpacity = THREE.MathUtils.lerp(
            hologramOpacity,
            hologramTarget,
            1 - Math.pow(1 - hologramFadeSpeed, k)
        );

        material.uniforms.uOpacity.value = hologramOpacity;
    }

    // Bouton bleu : allume / éteint (renvoie le nouvel état)
    function toggle() {
        hologramActive = !hologramActive;
        hologramTarget = hologramActive ? 1 : 0;
        return hologramActive;
    }

    // ------------------------------------------------------------
    // Bouton rouge : forme suivante
    // ------------------------------------------------------------
    function next() {
        if (!material || !positionAttr || !targetAttr) return;

        // Préparer la prochaine forme
        positionAttr.array.set(targetAttr.array);
        positionAttr.needsUpdate = true;

        currentIndex = nextIndex;
        nextIndex = (nextIndex + 1) % shapes.length;

        targetAttr.array.set(shapes[nextIndex]);
        targetAttr.needsUpdate = true;

        // Reset morph pour lancer la transition
        material.uniforms.morph.value = 0;
        morphState = "morph";
    }

    return { update, toggle, next };
}
