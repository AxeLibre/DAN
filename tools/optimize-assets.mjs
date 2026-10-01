// ===================================================================
// Optimisation des modèles 3D pour le web
// ===================================================================
// Source : .assets-originaux/*.glb (les fichiers d'origine, non publiés)
// Sortie : public/*.glb (versions légères chargées par le jeu)
//
//   npm run optimize                → tous les modèles
//   npm run optimize -- xwing.glb   → un seul
//
// Après un export Blender : copie le nouveau .glb dans .assets-originaux/
// puis relance la commande.
//
// Ce que fait le script (sans rien renommer : le code utilise les noms
// des objets et des matériaux pour les boutons, la tourelle, etc.) :
//  - supprime les données inutilisées, fusionne les géométries/textures en double
//    (PAS les matériaux : certains boutons s'allument chacun de leur côté)
//  - textures PNG/JPEG → WebP, 2048 px max
//  - géométrie compressée (meshopt), décodée par three.js au chargement
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress, meshopt, weld, simplify, flatten, join, palette, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';

// Modèles simplifiés (part de triangles gardée) : les vaisseaux de la bataille,
// nombreux et vus de loin. C'est ce qui pesait le plus sur la carte graphique.
const SIMPLIFY = {
    'xwing.glb': 0.3,            // 38 000 triangles × 40 X-Wing
    'y-wing.glb': 0.4,
    'liberty.glb': 0.35,
    'capital_part1.glb': 0.4,
    'capital_part2.glb': 0.4,
    'capital_part3.glb': 0.4,
    'frigate.glb': 0.5,
    'CR90_lite.glb': 0.6,
    'transport.glb': 0.5,
    'star_destroyer2.glb': 0.5,  // les deux destroyers en orbite
    'croiser_tank.glb': 0.35,    // mission hypercarburant : 147 000 triangles
    'base_hypercarburant.glb': 0.6
};

// Modèles faits de milliers de petits blocs séparés (greebles) : la simplification normale
// ne peut pas les réduire. Ici on retire aussi les blocs trop petits pour être vus
// (option "Prune" de meshoptimizer). ratio : part gardée ; error : taille des détails retirés
// (en part de la taille du morceau).
const SIMPLIFY_PRUNE = {
    'star_executor_web.glb': { ratio: 0.35, error: 0.002, minTriangles: 20000 }   // export complet : 745 000 triangles
};

// Matériaux dont la texture est projetée par le shader (triplanaire, voir src/executor.js) :
// leurs UV ne servent à rien, et leurs coutures empêchent la simplification → retirées
const NO_UV = { 'star_executor_web.glb': /ScratchedMetal/ };

// Modèles fusionnés en gardant certains objets à part (retrouvés par leur nom dans le code)
const KEEP_NAMED = {
    // Executor : la tourelle (cachée à l'intérieur), ses panneaux, la coque de collision
    'star_executor_web.glb': /^(All_Tower|TowerGreebles1|MainHull)/
};

// Modèles dont les morceaux sont fusionnés (un seul morceau par matériau) :
// moins d'appels de dessin → la bataille est beaucoup plus fluide.
// Seulement des modèles NON animés dont le code n'utilise pas les noms internes.
const MERGE = new Set([
    // (pas tieinterlow.glb : la fusion rendait son cockpit noir — normales abîmées.
    //  Inutile de toute façon : les TIE sont instanciés, tous dessinés ensemble.)
    'xwing.glb', 'y-wing.glb', 'liberty.glb', 'frigate.glb',
    'CR90_lite.glb', 'transport.glb', 'star_destroyer2.glb',
    'capital_part1.glb', 'capital_part2.glb', 'capital_part3.glb',
    'croiser_tank.glb', 'base_hypercarburant.glb'
]);
import sharp from 'sharp';

const SRC = '.assets-originaux';
const DST = 'public';

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const only = process.argv.slice(2);
const files = (only.length ? only : fs.readdirSync(SRC)).filter(f => f.toLowerCase().endsWith('.glb'));

let before = 0, after = 0;
for (const file of files) {
    const src = path.join(SRC, file);
    const dst = path.join(DST, file);
    if (!fs.existsSync(src)) { console.warn('introuvable :', src); continue; }

    const doc = await io.read(src);
    if (KEEP_NAMED[file]) {
        // fusion de tout SAUF les objets que le code retrouve par leur nom
        const keep = KEEP_NAMED[file];
        for (const node of doc.getRoot().listNodes()) {
            if (keep.test(node.getName())) { if (node.getMesh()) node.getMesh().setName(node.getName()); }
            else { node.setName(''); if (node.getMesh()) node.getMesh().setName(''); }
        }
        await doc.transform(flatten(), join({ keepNamed: true }));
    }
    if (MERGE.has(file)) {
        // palette : les matériaux de couleur unie sont regroupés en un seul
        // (couleurs rangées dans une petite texture) → encore moins de morceaux
        await doc.transform(palette({ min: 2 }), flatten(), join({ keepNamed: false }));
    }
    if (NO_UV[file]) {
        for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
            const mat = prim.getMaterial();
            if (mat && NO_UV[file].test(mat.getName())) prim.setAttribute('TEXCOORD_0', null);
        }
    }
    if (SIMPLIFY_PRUNE[file]) {
        const { ratio, error, minTriangles } = SIMPLIFY_PRUNE[file];
        await doc.transform(weld());
        for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
            const idx = prim.getIndices();
            if (!idx || idx.getCount() / 3 < minTriangles) continue;
            const indices = new Uint32Array(idx.getArray());
            const pos = prim.getAttribute('POSITION');
            const positions = new Float32Array(pos.getCount() * 3);
            for (let i = 0, v = [0, 0, 0]; i < pos.getCount(); i++) { pos.getElement(i, v); positions.set(v, i * 3); }
            const target = Math.floor(indices.length * ratio / 3) * 3;
            const [out] = MeshoptSimplifier.simplify(indices, positions, 3, target, error, ['Prune']);
            idx.setArray(out);
            compactPrimitive(prim);
        }
    }
    if (SIMPLIFY[file]) {
        await doc.transform(
            weld(),
            simplify({ simplifier: MeshoptSimplifier, ratio: SIMPLIFY[file], error: 0.01 })
        );
    }
    await doc.transform(
        prune({ keepAttributes: true }),   // garder les UV même sans texture : le code peut en plaquer une (vidéo de l'hyperespace)
        dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }),
        textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 85 }),
        meshopt({ encoder: MeshoptEncoder, level: 'medium' })
    );
    // Windows peut verrouiller un instant le fichier (serveur de test qui le lit) : on réessaie
    for (let attempt = 0; ; attempt++) {
        try { await io.write(dst, doc); break; }
        catch (e) { if (attempt >= 20) throw e; await new Promise(r => setTimeout(r, 500)); }
    }

    const a = fs.statSync(src).size, b = fs.statSync(dst).size;
    before += a; after += b;
    console.log(`${file.padEnd(40)} ${(a / 1048576).toFixed(1).padStart(6)} Mo → ${(b / 1048576).toFixed(1).padStart(6)} Mo`);
}
console.log(`TOTAL ${(before / 1048576).toFixed(0)} Mo → ${(after / 1048576).toFixed(0)} Mo`);
