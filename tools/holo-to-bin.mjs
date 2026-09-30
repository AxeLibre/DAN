// ===================================================================
// Hologrammes : JSON (texte, ~200 Mo) → binaire Float32 x,y,z (~10 Mo)
// ===================================================================
//   node tools/holo-to-bin.mjs
// Source : public/*.json (export Blender : { positions: [{x,y,z,rx,...}] })
// Sortie : public/holo/<nom>.bin  → Float32Array [x0,y0,z0, x1,y1,z1, ...]
// Au-delà de MAX_POINTS, on garde un point sur n (répartition régulière) :
// le jeu étire toutes les formes au nombre de points de la plus grande,
// donc limiter la plus grande allège aussi le travail de la carte graphique.
import fs from 'node:fs';
import path from 'node:path';

const SHAPES = ['empire', 'tiefighter', 'tieinterceptor', 'tiebomber', 'atst', 'atat',
                'stardestroyer', 'deathstar', 'darkmaul', 'darkvador', 'kylo', 'galaxy'];
const MAX_POINTS = 120000;
const OUT = 'public/holo';

fs.mkdirSync(OUT, { recursive: true });
for (const name of SHAPES) {
    const src = path.join('public', name + '.json');
    const pts = JSON.parse(fs.readFileSync(src, 'utf8')).positions;
    const step = pts.length / Math.min(pts.length, MAX_POINTS);
    const n = Math.floor(pts.length / step);
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const p = pts[Math.floor(i * step)];
        out[i * 3] = p.x; out[i * 3 + 1] = p.y; out[i * 3 + 2] = p.z;
    }
    fs.writeFileSync(path.join(OUT, name + '.bin'), Buffer.from(out.buffer));
    console.log(`${name.padEnd(16)} ${String(pts.length).padStart(7)} → ${String(n).padStart(7)} points  ${(fs.statSync(src).size / 1048576).toFixed(1)} Mo → ${(out.byteLength / 1048576).toFixed(1)} Mo`);
}
