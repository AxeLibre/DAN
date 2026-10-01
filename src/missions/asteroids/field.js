import * as THREE from 'three';
import { segmentSphere } from '../../weapons.js';
import { createRockGeometry, createRockMaterial } from './rockGeometry.js';

// =========================================================================================
// CHAMP D'ASTÉROÏDES : rendu + mouvement de tous les rochers
// =========================================================================================
// 8 formes de rocher ; chaque forme est dessinée en UN appel pour toutes ses copies
// (InstancedMesh). Deux sortes de rochers :
//   - 'bg'     : décor du champ, qui défile lentement (on "traverse" le champ)
//   - 'threat' : astéroïde qui fonce vers la coque de l'Executor ; taille 2 (gros),
//                1 (moyen) ou 0 (petit) ; les gros et moyens éclatent en plus petits
const VARIANTS = 8;
const CAPACITY = 110;                 // rochers max par forme
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

export const TIERS = [
    { name: 'petit', radius: [7, 11],  hits: 1, speed: [120, 150], children: 0, damage: 4 },
    { name: 'moyen', radius: [18, 26], hits: 2, speed: [95, 120],  children: 3, damage: 10 },
    { name: 'gros',  radius: [42, 60], hits: 4, speed: [75, 95],   children: 3, damage: 22 }
];

function rand(a, b) { return a + Math.random() * (b - a); }

export class AsteroidField {

    constructor(scene) {
        const material = createRockMaterial();
        this.meshes = [];
        this.slots = [];                  // par forme : liste des rochers dans l'ordre des instances
        for (let v = 0; v < VARIANTS; v++) {
            const mesh = new THREE.InstancedMesh(createRockGeometry(v + 1), material, CAPACITY);
            mesh.count = 0;
            mesh.frustumCulled = false;   // les copies sont réparties partout
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            scene.add(mesh);
            this.meshes.push(mesh);
            this.slots.push([]);
        }
        this.rocks = [];
        this.drift = new THREE.Vector3();         // défilement du décor (le champ passe à côté de nous)
    }

    /** Ajoute un rocher. opts : { kind, tier, radius, position, velocity } */
    add(opts) {
        let v = Math.floor(Math.random() * VARIANTS);
        for (let i = 0; i < VARIANTS && this.slots[v].length >= CAPACITY; i++) v = (v + 1) % VARIANTS;
        if (this.slots[v].length >= CAPACITY) return null;
        const rock = {
            kind: opts.kind, tier: opts.tier ?? 0, radius: opts.radius,
            position: opts.position.clone(),
            userData: { velocity: opts.velocity ? opts.velocity.clone() : new THREE.Vector3() },  // (aide à la visée)
            visible: true,
            quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3))),
            spinAxis: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(),
            spin: rand(0.1, 0.6) * (opts.kind === 'bg' ? 0.4 : 1),
            hits: 0, variant: v, slot: this.slots[v].length,
            target: opts.target || null, travelled: 0, pathLength: opts.pathLength || Infinity
        };
        this.slots[v].push(rock);
        this.rocks.push(rock);
        return rock;
    }

    /** Retire un rocher (la dernière copie de sa forme prend sa place : pas de trou) */
    remove(rock) {
        const list = this.slots[rock.variant];
        const last = list.pop();
        if (last !== rock) { list[rock.slot] = last; last.slot = rock.slot; }
        rock.visible = false;
        rock.dead = true;
        const i = this.rocks.indexOf(rock);
        if (i >= 0) this.rocks.splice(i, 1);
    }

    clear() {
        for (const list of this.slots) list.length = 0;
        this.rocks.length = 0;
        this.meshes.forEach(m => { m.count = 0; });
    }

    threats() { return this.rocks.filter(r => r.kind === 'threat'); }

    update(dt, wrap = null) {
        const q = new THREE.Quaternion();
        for (const r of this.rocks) {
            const vel = r.userData.velocity;
            r.position.addScaledVector(vel, dt);
            if (r.kind === 'bg') {
                r.position.addScaledVector(this.drift, dt);
                if (wrap) wrap(r);
            } else {
                r.travelled += vel.length() * dt;
            }
            r.quaternion.multiply(q.setFromAxisAngle(r.spinAxis, r.spin * dt));
        }
        // écriture des matrices (une instance = un rocher)
        for (let v = 0; v < VARIANTS; v++) {
            const list = this.slots[v], mesh = this.meshes[v];
            for (let i = 0; i < list.length; i++) {
                const r = list[i];
                _m.compose(r.position, r.quaternion, _s.setScalar(r.radius));
                mesh.setMatrixAt(i, _m);
            }
            mesh.count = list.length;
            mesh.instanceMatrix.needsUpdate = true;
        }
    }

    /** Tir [p0,p1] → { rock, t, point } du rocher touché le plus proche, ou null */
    hitTest(p0, p1) {
        let best = null, bestT = 2;
        for (const r of this.rocks) {
            const t = segmentSphere(p0, p1, r.position, r.radius * 0.85);
            if (t >= 0 && t < bestT) { bestT = t; best = r; }
        }
        return best ? { rock: best, t: bestT, point: new THREE.Vector3().lerpVectors(p0, p1, bestT) } : null;
    }

    /** Collision du TIE du joueur → { point, normal, velocity } ou null */
    collide(pos, move, margin = 8) {
        const next = pos.clone().add(move);
        for (const r of this.rocks) {
            const R = r.radius * 0.8 + margin;
            if (next.distanceToSquared(r.position) > R * R) continue;
            const normal = next.clone().sub(r.position).normalize();
            return { point: r.position.clone().addScaledVector(normal, r.radius * 0.8), normal, velocity: r.userData.velocity.clone().add(this.drift) };
        }
        return null;
    }

    setVisible(v) { this.meshes.forEach(m => { m.visible = v; }); }
}
