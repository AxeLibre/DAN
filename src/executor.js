import * as THREE from 'three';
import { makeGLTFLoader } from './core/loaders.js';

// ===================================================================
// SUPER STAR DESTROYER (Executor) — le vaisseau du joueur, vu de dehors
// ===================================================================
// Remplace les 2 anciens décors (star_destroyer0 vu depuis la passerelle +
// star_destroyer_tower2 vu en vol). Le modèle a été aligné dans Blender sur la
// passerelle : il prend donc EXACTEMENT la même transformation que projecteur4.
// - All_Tower : la tourelle qui contient la passerelle → cachée quand on est dedans
// - MainHull  : coque simplifiée (≈700 triangles) → sert aux collisions en vol

// -------------------------------------------------------------------
// Sortie du hangar à travers l'arrière de la tourelle
// -------------------------------------------------------------------
// La tourelle se prolonge ~80 unités derrière la bouche du hangar : on y creuse
// un tunnel (dans le shader) et les collisions ignorent cette zone.
// Boîte exprimée dans le repère de l'Executor (= repère de la passerelle) :
// bouche du hangar : x ±2.67, y -0.03 → 2.32, fin à z = 19.08
const hangarCut = {
    min: new THREE.Vector3(-2.9, -0.3, 18.6),   // à peine plus grand que la bouche du hangar
    max: new THREE.Vector3(2.9, 2.6, 40),
    toLocal: { value: new THREE.Matrix4() },   // monde → repère de l'Executor
    towerMeshes: new Set()
};

// Texture "triplanaire" de la coque de l'Executor
// Le modèle décimé n'a pas d'UV dépliés : la texture de métal serait étirée n'importe
// comment. À la place, le shader la projette selon les 3 axes (dessus / côtés / avant)
// et mélange d'après l'orientation de chaque face. Pas besoin d'UV, taille constante.
const EXECUTOR_TEX_SIZE = 8;   // taille d'un carreau de texture, en unités du modèle (×10 dans la scène)

function applyTriplanar(material) {
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
    material.onBeforeCompile = (shader, renderer) => {
        if (previous) previous(shader, renderer);
        shader.uniforms.uTriToLocal = hangarCut.toLocal;          // monde → repère de l'Executor
        shader.uniforms.uTriScale = { value: 1 / EXECUTOR_TEX_SIZE };
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform mat4 uTriToLocal;\nvarying vec3 vTriPos;\nvarying vec3 vTriN;')
            .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvTriN = normalize(mat3(uTriToLocal) * mat3(modelMatrix) * objectNormal);')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTriPos = (uTriToLocal * modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform float uTriScale;\nvarying vec3 vTriPos;\nvarying vec3 vTriN;')
            .replace('#include <map_fragment>', `
                vec3 triW = pow(abs(normalize(vTriN)), vec3(4.0));
                triW /= (triW.x + triW.y + triW.z);
                vec3 triP = vTriPos * uTriScale;
                #ifdef USE_MAP
                    diffuseColor *= texture2D(map, triP.zy) * triW.x
                                  + texture2D(map, triP.xz) * triW.y
                                  + texture2D(map, triP.xy) * triW.z;
                #endif`)
            .replace('#include <roughnessmap_fragment>', `
                float roughnessFactor = roughness;
                #ifdef USE_ROUGHNESSMAP
                    roughnessFactor *= texture2D(roughnessMap, triP.zy).g * triW.x
                                     + texture2D(roughnessMap, triP.xz).g * triW.y
                                     + texture2D(roughnessMap, triP.xy).g * triW.z;
                #endif`)
            .replace('#include <metalnessmap_fragment>', `
                float metalnessFactor = metalness;
                #ifdef USE_METALNESSMAP
                    metalnessFactor *= texture2D(metalnessMap, triP.zy).b * triW.x
                                     + texture2D(metalnessMap, triP.xz).b * triW.y
                                     + texture2D(metalnessMap, triP.xy).b * triW.z;
                #endif`);
    };
    material.customProgramCacheKey = () => previousKey + '|triplanar';
    material.needsUpdate = true;
}

function carveHangarExit(mesh) {
    const mat = mesh.material.clone();
    mat.side = THREE.DoubleSide;
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uToLocal = hangarCut.toLocal;
        shader.uniforms.uCutMin = { value: hangarCut.min };
        shader.uniforms.uCutMax = { value: hangarCut.max };
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform mat4 uToLocal;\nvarying vec3 vCutPos;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCutPos = (uToLocal * modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 uCutMin;\nuniform vec3 uCutMax;\nvarying vec3 vCutPos;')
            .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
                if (all(greaterThan(vCutPos, uCutMin)) && all(lessThan(vCutPos, uCutMax))) discard;`)
            .replace('#include <dithering_fragment>', `#include <dithering_fragment>
                if (!gl_FrontFacing) gl_FragColor.rgb *= 0.25;   // intérieur de la tourelle, dans l'ombre`);
    };
    mat.customProgramCacheKey = () => 'hangar-cut';
    mesh.material = mat;
}

// un impact dans le tunnel de sortie ne compte pas comme une collision
function inHangarCut(hit) {
    if (!hangarCut.towerMeshes.has(hit.object)) return false;
    const p = hit.point.clone().applyMatrix4(hangarCut.toLocal.value);
    return p.x > hangarCut.min.x - 0.3 && p.x < hangarCut.max.x + 0.3 &&
           p.y > hangarCut.min.y - 0.3 && p.y < hangarCut.max.y + 0.3 &&
           p.z > hangarCut.min.z - 0.3;
}

// Le tunnel À L'INTÉRIEUR de la tourelle (repère de l'Executor : la tourelle finit à z = 26.9)
const towerTunnel = new THREE.Box3(new THREE.Vector3(-2.9, -0.3, 16), new THREE.Vector3(2.9, 2.6, 27.2));
const _camPos = new THREE.Vector3();
const _camLocal = new THREE.Vector3();

export function initExecutor(ctx) {
    const { scene, camera, state } = ctx;
    const loader4 = makeGLTFLoader();
    let executor = null;
    let executorTower = null;
    const towerExtras = [];
    const exteriorColliders = [];   // coque (MainHull) + tourelle : collisions en vol
    let towerDestroyed = false;     // cinématique de destruction (mission astéroïdes)

    loader4.load('public/star_executor_web.glb', (gltf) => {
        executor = gltf.scene;
        executor.position.set(0, -12, 98.5);
        executor.scale.set(10, 10, 10);
        executor.rotation.y = Math.PI;
        scene.add(executor);

        executor.traverse(o => {
            if (o.name === 'All_Tower' && !executorTower) executorTower = o;
            // panneaux lumineux collés devant les fenêtres du pont (hors du groupe All_Tower) :
            // ils se cachent / s'affichent avec la tourelle
            if (/^TowerGreebles1/.test(o.name)) towerExtras.push(o);
            if (o.isMesh && /^MainHull/.test(o.name)) exteriorColliders.push(o);
        });
        towerExtras.forEach(o => { o.visible = false; });
        executor.updateMatrixWorld(true);
        hangarCut.toLocal.value.copy(executor.matrixWorld).invert();
        if (executorTower) {
            executorTower.traverse(o => {
                if (!o.isMesh) return;
                exteriorColliders.push(o);
                hangarCut.towerMeshes.add(o);
                // on ne creuse que la coque : les lumières de l'entrée du hangar restent visibles
                if (/ScratchedMetal/.test(o.material.name)) carveHangarExit(o);
            });
            executorTower.visible = false;
        }

        // texture de coque projetée (les UV n'ont pas été dépliés après la décimation)
        const done = new Set();
        executor.traverse(o => {
            if (!o.isMesh || !/ScratchedMetal/.test(o.material.name) || done.has(o.material)) return;
            applyTriplanar(o.material);
            done.add(o.material);
        });
    });

    // Tourelle visible seulement quand la caméra est vraiment dehors
    // (en sortant du hangar, on traverse encore la tourelle sur ~80 unités)
    function updateExecutorTower() {
        if (!executorTower) return;
        camera.getWorldPosition(_camPos);
        _camLocal.copy(_camPos).applyMatrix4(hangarCut.toLocal.value);
        // même déclencheur que le cockpit (isInsideShip) ; en plus, cachée pendant
        // la courte traversée du tunnel à l'intérieur de la tourelle
        const show = !towerDestroyed && !state.isInsideShip && !towerTunnel.containsPoint(_camLocal);
        executorTower.visible = show;
        for (const o of towerExtras) o.visible = show;
    }

    return {
        exteriorColliders, inHangarCut, updateTower: updateExecutorTower,
        get root() { return executor; },
        setTowerDestroyed(v) { towerDestroyed = v; }
    };
}
