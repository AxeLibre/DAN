// ===================================================================
// Hologramme : modèle 3D (.glb) → forme de particules (.bin)
// ===================================================================
//   node tools/glb-to-holo.mjs <modèle.glb> <nom> [points] [taille]
//   ex. : node tools/glb-to-holo.mjs public/xwing.glb xwing
//
// Répartit des points au hasard sur la SURFACE du modèle (plus une face est
// grande, plus elle reçoit de points), puis centre et met à l'échelle la forme
// pour qu'elle ait la même taille que les autres hologrammes.
// Sortie : public/holo/<nom>.bin  → Float32Array [x0,y0,z0, x1,y1,z1, ...]
// Ensuite, ajouter { file: '<nom>', label: '…' } dans HOLO_SHAPES (src/bridge/hologram.js).
//
// Pas besoin de Blender ni de JSON : three.js lit le .glb directement
// (y compris les modèles compressés meshopt de public/).
globalThis.self = globalThis;   // le chargeur de three.js attend un navigateur

import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const [src, name, pointsArg, sizeArg] = process.argv.slice(2);
if (!src || !name) {
    console.log('usage : node tools/glb-to-holo.mjs <modèle.glb> <nom> [points=60000] [taille=32]');
    process.exit(1);
}
const POINTS = Number(pointsArg || 60000);
const SIZE = Number(sizeArg || 32);         // plus grande dimension (les formes actuelles font ~25 à 40)
const OUT = 'public/holo';

// les textures ne servent à rien ici : on fait taire les avertissements
const error = console.error;
console.error = (...a) => { if (!String(a[0]).includes("Couldn't load texture")) error(...a); };

const buf = fs.readFileSync(src);
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const gltf = await new Promise((resolve, reject) =>
    loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), '', resolve, reject));

// 1. tous les triangles, en coordonnées du modèle entier
gltf.scene.updateMatrixWorld(true);
const tris = [];
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
gltf.scene.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    const pos = o.geometry.attributes.position, idx = o.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
        const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, ia).applyMatrix4(o.matrixWorld);
        b.fromBufferAttribute(pos, ib).applyMatrix4(o.matrixWorld);
        c.fromBufferAttribute(pos, ic).applyMatrix4(o.matrixWorld);
        const area = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).length() / 2;
        if (area > 0) tris.push({ a: a.clone(), b: b.clone(), c: c.clone(), area });
    }
});
if (!tris.length) { console.log('aucun triangle trouvé dans ' + src); process.exit(1); }

// 2. points au hasard sur la surface (tirage proportionnel à l'aire)
const cumul = [];
let total = 0;
for (const t of tris) { total += t.area; cumul.push(total); }
const pts = new Float32Array(POINTS * 3);
const p = new THREE.Vector3();
for (let i = 0; i < POINTS; i++) {
    const r = Math.random() * total;
    let lo = 0, hi = cumul.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cumul[mid] < r) lo = mid + 1; else hi = mid; }
    const t = tris[lo];
    let u = Math.random(), v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    p.copy(t.a).addScaledVector(t.b.clone().sub(t.a), u).addScaledVector(t.c.clone().sub(t.a), v);
    pts.set([p.x, p.y, p.z], i * 3);
}

// 3. centrée sur l'origine, à la taille des autres hologrammes
const box = new THREE.Box3().setFromArray(pts);
const center = box.getCenter(new THREE.Vector3());
const dims = box.getSize(new THREE.Vector3());
const scale = SIZE / Math.max(dims.x, dims.y, dims.z);
for (let i = 0; i < pts.length; i += 3) {
    pts[i] = (pts[i] - center.x) * scale;
    pts[i + 1] = (pts[i + 1] - center.y) * scale;
    pts[i + 2] = (pts[i + 2] - center.z) * scale;
}

fs.mkdirSync(OUT, { recursive: true });
const out = path.join(OUT, name + '.bin');
fs.writeFileSync(out, Buffer.from(pts.buffer));
console.log(`${name} : ${tris.length} triangles → ${POINTS} points, ${(pts.byteLength / 1048576).toFixed(1)} Mo → ${out}`);
console.log(`À ajouter dans HOLO_SHAPES (src/bridge/hologram.js) : { file: '${name}', label: '…' }`);
