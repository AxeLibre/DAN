import * as THREE from 'three';

// =========================================================================================
// DESTRUCTION DE L'EXECUTOR (cinématique d'échec de la mission astéroïdes)
// =========================================================================================
// Même principe que les croiseurs rebelles (voir fleet.js) : la tourelle saute, puis la
// coque se brise en morceaux qui partent à la dérive en tournant, avec explosions en chaîne
// et débris. Le modèle de l'Executor est d'un seul tenant : on le duplique, et chaque copie
// est "coupée" par des plans de découpe (clipping). Par la coupure, on voit l'intérieur
// de la coque qui rougeoie comme des braises (seulement près de la coupure : ailleurs, les
// faces arrière restent cachées comme d'habitude).
// Coût : rien tant que la cinématique ne tourne pas ; pendant, 3 copies de la coque.

// morceaux (coordonnées monde, l'Executor va de z ≈ -5900 (poupe) à z ≈ 20000 (proue))
const PIECES = [
    { zMin: -Infinity, zMax: 2600,     drift: [-60, -50, -260], spin: [0.2, 1, -0.4], w: -0.045 },   // poupe
    { zMin: 2600,      zMax: 11000,    drift: [140, -110, 30],  spin: [1, 0.15, 0.3], w: 0.04 },     // milieu
    { zMin: 11000,     zMax: Infinity, drift: [-80, -30, 280],  spin: [-0.3, 1, 0.5], w: 0.05 }      // proue
];
const CUTS = [2600, 11000];
const HULL_TOP = -150, HULL_BOTTOM = -1500;

function rand(a, b) { return a + Math.random() * (b - a); }

// demi-largeur approximative de la coque à une profondeur z (la coque est en forme de flèche)
function halfWidth(z) {
    return Math.max(150, 3300 * (20000 - z) / 25900);
}

export function createExecutorWreck(ctx) {
    const { scene, renderer } = ctx;
    const ember = { value: 0 };       // lueur de l'intérieur (0 → 1)
    let pieces = null;
    const timers = [];

    // matériau de la copie : même rendu + découpe + intérieur incandescent
    function wreckMaterial(source, piece) {
        const m = source.clone();
        const previous = source.onBeforeCompile;
        const previousKey = source.customProgramCacheKey ? source.customProgramCacheKey() : '';
        m.side = THREE.DoubleSide;
        m.clippingPlanes = piece.planes;
        m.onBeforeCompile = (shader, r) => {
            if (previous) previous.call(source, shader, r);
            // la texture projetée suit le morceau (et pas l'Executor d'origine)
            if (shader.uniforms.uTriToLocal) shader.uniforms.uTriToLocal = piece.toLocal;
            shader.uniforms.uEmber = ember;
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\nuniform float uEmber;')
                .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
                    // distance à la coupure la plus proche (repère caméra, comme le clipping de three.js)
                    float cutDist = 1e9;
                    #if NUM_CLIPPING_PLANES > 0
                        for (int i = 0; i < UNION_CLIPPING_PLANES; i++) {
                            vec4 cp = clippingPlanes[i];
                            cutDist = min(cutDist, cp.w - dot(vClipPosition, cp.xyz));
                        }
                    #endif
                    if (!gl_FrontFacing && cutDist > 1600.0) discard;`)
                .replace('#include <dithering_fragment>', `#include <dithering_fragment>
                    float flicker = 0.7 + 0.3 * sin(gl_FragCoord.x * 0.05 + gl_FragCoord.y * 0.07 + uEmber * 9.0);
                    float heat = gl_FrontFacing ? 1.0 - smoothstep(0.0, 160.0, cutDist)      // bord de la coupure
                                                : 1.0 - smoothstep(200.0, 1600.0, cutDist);  // intérieur
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.7, 0.5, 0.12) * flicker, heat * uEmber);`);
        };
        m.customProgramCacheKey = () => previousKey + '|wreck';
        return m;
    }

    function breakApart() {
        const source = ctx.executor.root;
        if (!source || pieces) return;
        renderer.localClippingEnabled = true;
        source.updateMatrixWorld(true);

        pieces = PIECES.map(def => {
            const center = new THREE.Vector3(0, -800, (Math.max(def.zMin, -5900) + Math.min(def.zMax, 20000)) / 2);
            const pivot = new THREE.Group();
            pivot.position.copy(center);
            scene.add(pivot);

            const piece = {
                pivot, center,
                velocity: new THREE.Vector3(...def.drift),
                axis: new THREE.Vector3(...def.spin).normalize(),
                w: def.w,
                localPlanes: [], planes: [],
                toLocal: { value: new THREE.Matrix4() }
            };
            // plans de découpe, exprimés dans le repère du pivot (ils suivront le morceau)
            if (def.zMin > -Infinity) piece.localPlanes.push(new THREE.Plane(new THREE.Vector3(0, 0, 1), -(def.zMin - center.z)));
            if (def.zMax < Infinity) piece.localPlanes.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), def.zMax - center.z));
            piece.planes = piece.localPlanes.map(p => p.clone());

            const copy = source.clone();
            copy.position.sub(center);
            copy.traverse(o => {
                if (o.name === 'All_Tower' || /^TowerGreebles/.test(o.name)) o.visible = false;   // la tourelle a sauté
                if (o.isMesh) o.material = wreckMaterial(o.material, piece);
            });
            copy.visible = true;
            pivot.add(copy);
            piece.copy = copy;
            return piece;
        });
        source.visible = false;
        updatePieces(0);

        // la coque se déchire : explosions le long des coupures, gros débris
        const { fx, debris } = ctx.battle;
        CUTS.forEach((z, c) => {
            for (let i = 0; i < 14; i++) {
                timers.push(setTimeout(() => {
                    const p = cutPoint(z);
                    fx.explosion(p, rand(250, 600));
                    debris.spawn(p, 7, { speed: [80, 320], size: [30, 120], life: [9, 15], hot: 0.9 });
                }, c * 250 + i * rand(90, 220)));
            }
        });
    }

    // point au hasard dans la section de la coque, à la profondeur z
    function cutPoint(z) {
        const w = halfWidth(z) * 0.8;
        return new THREE.Vector3(rand(-w, w), rand(HULL_BOTTOM, HULL_TOP), z + rand(-150, 150));
    }

    // point au hasard sur le dessus de la coque d'un morceau (suit le morceau)
    function surfacePoint() {
        if (!pieces) return new THREE.Vector3(rand(-1500, 1500), HULL_TOP, rand(-3000, 15000));
        const piece = pieces[Math.floor(Math.random() * pieces.length)];
        const def = PIECES[pieces.indexOf(piece)];
        const z = rand(Math.max(def.zMin, -5500), Math.min(def.zMax, 19000));
        const w = halfWidth(z) * 0.85;
        const local = new THREE.Vector3(rand(-w, w), rand(HULL_TOP - 250, HULL_TOP), z).sub(piece.center);
        return piece.pivot.localToWorld(local);
    }

    const _q = new THREE.Quaternion();
    function updatePieces(dt) {
        if (!pieces) return;
        ember.value = Math.min(1, ember.value + dt * 0.8);
        for (const p of pieces) {
            p.pivot.position.addScaledVector(p.velocity, dt);
            p.pivot.quaternion.premultiply(_q.setFromAxisAngle(p.axis, p.w * dt));
            p.pivot.updateMatrixWorld(true);
            p.localPlanes.forEach((lp, i) => p.planes[i].copy(lp).applyMatrix4(p.pivot.matrixWorld));
            p.toLocal.value.copy(p.copy.matrixWorld).invert();
        }
    }

    // remise en état (retour au hangar)
    function restore() {
        timers.forEach(clearTimeout);
        timers.length = 0;
        if (pieces) {
            for (const p of pieces) {
                scene.remove(p.pivot);
                p.copy.traverse(o => { if (o.isMesh) o.material.dispose(); });
            }
            pieces = null;
        }
        ember.value = 0;
        if (ctx.executor.root) ctx.executor.root.visible = true;
        ctx.executor.setTowerDestroyed(false);
    }

    return { breakApart, update: updatePieces, restore, surfacePoint, active: () => !!pieces, timers };
}
