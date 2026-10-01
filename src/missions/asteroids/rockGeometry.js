import * as THREE from 'three';

// =========================================================================================
// ROCHERS PROCÉDURAUX (géométrie)
// =========================================================================================
// Une sphère facettée déformée par un bruit fractal (bosses et creux) + quelques cratères,
// facettes plates et couleurs par sommet (creux plus sombres). Rayon ≈ 1 : on met à
// l'échelle par instance. Peu de triangles (320) : des centaines de rochers restent fluides.

// petit générateur pseudo-aléatoire reproductible (une "graine" = un rocher)
function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// bruit de valeur 3D (grille aléatoire interpolée), puis somme de plusieurs octaves
function makeNoise(rand) {
    const perm = new Uint8Array(512), vals = new Float32Array(256);
    for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = rand() * 2 - 1; }
    for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
    const v = (x, y, z) => vals[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
    const smooth = t => t * t * (3 - 2 * t);
    const lerp = (a, b, t) => a + (b - a) * t;
    const noise = (x, y, z) => {
        const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
        const u = smooth(x - xi), w = smooth(y - yi), q = smooth(z - zi);
        return lerp(
            lerp(lerp(v(xi, yi, zi), v(xi + 1, yi, zi), u), lerp(v(xi, yi + 1, zi), v(xi + 1, yi + 1, zi), u), w),
            lerp(lerp(v(xi, yi, zi + 1), v(xi + 1, yi, zi + 1), u), lerp(v(xi, yi + 1, zi + 1), v(xi + 1, yi + 1, zi + 1), u), w),
            q);
    };
    return (x, y, z) => noise(x, y, z) * 0.55 + noise(x * 2.1, y * 2.1, z * 2.1) * 0.28 + noise(x * 4.3, y * 4.3, z * 4.3) * 0.12;
}

/** Un rocher : BufferGeometry non indexée (facettes plates), couleurs par sommet. */
export function createRockGeometry(seed) {
    const rand = rng(seed * 9973 + 17);
    const noise = makeNoise(rand);
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const pos = geo.attributes.position;

    // forme générale un peu allongée / aplatie, au hasard
    const stretch = new THREE.Vector3(0.75 + rand() * 0.6, 0.65 + rand() * 0.5, 0.75 + rand() * 0.6);
    const craters = Array.from({ length: 2 + Math.floor(rand() * 4) }, () => ({
        dir: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
        size: 0.25 + rand() * 0.35,
        depth: 0.08 + rand() * 0.12
    }));

    const p = new THREE.Vector3();
    const heights = new Float32Array(pos.count);
    const offset = rand() * 50;
    for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).normalize();
        let h = 1 + noise(p.x * 1.6 + offset, p.y * 1.6 + offset, p.z * 1.6 + offset) * 0.45;
        for (const c of craters) {
            const d = p.distanceTo(c.dir) / c.size;
            if (d < 1) h -= c.depth * (1 - d * d);                      // cuvette
            else if (d < 1.3) h += c.depth * 0.35 * (1 - (d - 1) / 0.3); // rebord
        }
        heights[i] = h;
        p.multiplyScalar(h).multiply(stretch);
        pos.setXYZ(i, p.x, p.y, p.z);
    }

    // facettes plates : on "dé-indexe" puis on recalcule les normales
    const flat = geo.index ? geo.toNonIndexed() : geo;
    flat.computeVertexNormals();

    // couleur : gris-brun, plus sombre dans les creux, avec un peu de variété par rocher
    const base = new THREE.Color().setHSL(0.07 + rand() * 0.04, 0.12 + rand() * 0.1, 0.34 + rand() * 0.1);
    const fp = flat.attributes.position;
    const colors = new Float32Array(fp.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < fp.count; i++) {
        p.fromBufferAttribute(fp, i).divide(stretch);
        const shade = THREE.MathUtils.clamp(0.55 + (p.length() - 0.8) * 1.3, 0.35, 1.15);
        c.copy(base).multiplyScalar(shade * (0.92 + rand() * 0.16));
        colors.set([c.r, c.g, c.b], i * 3);
    }
    flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    flat.computeBoundingSphere();
    return flat;
}

// matériau partagé par tous les rochers (aucune texture : léger pour les petites machines)
export function createRockMaterial() {
    return new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        roughness: 0.95,
        metalness: 0.05
    });
}
