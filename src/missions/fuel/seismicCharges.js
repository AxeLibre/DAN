import * as THREE from 'three';
import { BLOOM_LAYER } from '../../core/bloom.js';

// =========================================================================================
// CHARGES SISMIQUES DU SLAVE I (shaders GLSL)
// =========================================================================================
// Déroulé d'une charge (secondes après le largage) :
//   0    → ARM      petit point qui clignote, la charge dérive derrière le Slave I
//   ARM  → GROW     une boule de lumière grandit très vite + flash
//   GROW → SHRINK   elle se recontracte plus lentement en devenant plus intense…
//   SHRINK          …second flash : elle éclate en un ANNEAU de lumière qui s'élargit
//                   lentement en laissant des traînées. C'est l'anneau qui est dangereux :
//                   il ne faut pas croiser sa route (on passe au centre, ou par-dessus).
// L'anneau est un disque plat (un seul quad + shader), tourné vers celui qui suit le Slave I.
// Tout est préparé au départ (pool de charges) : aucune compilation de shader en cours de jeu.
const T = { ARM: 0.55, GROW: 0.75, SHRINK: 1.55, RING: 6.0 };   // (RING : durée de l'anneau)
// l'anneau part vite (BURST), puis continue à s'éloigner du centre à vitesse constante (DRIFT)
// en s'épaississant et en pâlissant : il se disperse lentement
const RING = { BURST: 360, DRIFT: 85, RMAX: 1000, WIDTH: [9, 60], DANGER_IN: 46, DANGER_OUT: 14, MIN_FADE: 0.25 };
const BLUE = new THREE.Color(0.45, 0.8, 1.0);

const coreVertex = /* glsl */`
    uniform float uSize;
    varying vec2 vUv;
    void main() {
        vUv = uv - 0.5;
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);     // toujours face à la caméra
        mv.xy += position.xy * uSize;
        gl_Position = projectionMatrix * mv;
    }`;
const coreFragment = /* glsl */`
    uniform float uIntensity;
    uniform float uRays;
    uniform float uTime;
    uniform vec3 uColor;
    varying vec2 vUv;
    void main() {
        float d = length(vUv) * 2.0;
        if (d > 1.0) discard;
        float core = exp(-d * d * 22.0);
        float glow = exp(-d * d * 4.5);
        float a = atan(vUv.y, vUv.x);
        float rays = pow(abs(sin(a * 4.0 + uTime * 2.0)), 18.0) + pow(abs(sin(a * 7.0 - uTime * 3.1)), 24.0);
        rays *= exp(-d * 2.5) * uRays;
        vec3 col = mix(uColor, vec3(1.0), clamp(core * 1.5, 0.0, 1.0));
        gl_FragColor = vec4(col * (core * 1.3 + glow * 0.45 + rays * 0.6) * uIntensity, 1.0);
    }`;

const ringVertex = /* glsl */`
    uniform float uRmax;
    varying vec2 vP;
    void main() {
        vP = (uv - 0.5) * 2.0 * uRmax;                            // coordonnées dans le plan (unités monde)
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
const ringFragment = /* glsl */`
    uniform float uRadius;
    uniform float uWidth;
    uniform float uFade;
    uniform float uSeed;
    uniform float uTime;
    varying vec2 vP;
    void main() {
        float d = length(vP);
        float a = atan(vP.y, vP.x);
        float x = (d - uRadius) / uWidth;                         // < 0 : derrière le front de l'anneau
        float edge = exp(-x * x * 2.5);                           // front très lumineux
        // traînées : stries qui s'étirent derrière le front
        float streak = 0.5 + 0.5 * sin(a * 83.0 + uSeed * 31.0) * sin(a * 29.0 - uSeed * 17.0 + uTime * 0.6);
        streak = pow(streak, 2.0);
        float behind = max(-x, 0.0);
        float trail = exp(-behind * 0.45) * step(x, 0.0) * (0.15 + 0.85 * streak);
        // étincelles éparses juste devant le front
        float spark = step(0.985, fract(sin(floor(a * 140.0) * 91.7 + uSeed * 13.0) * 43758.5)) * exp(-abs(x - 0.6) * 2.0);
        float I = (edge * 0.9 + trail * 0.42 + spark * 0.7) * uFade;
        if (I < 0.01) discard;
        vec3 col = mix(vec3(0.22, 0.55, 1.0), vec3(0.85, 0.95, 1.0), clamp(edge * 0.7 + spark, 0.0, 1.0));
        gl_FragColor = vec4(col * I, 1.0);
    }`;

function rand(a, b) { return a + Math.random() * (b - a); }

export class SeismicCharges {

    /** onDetonate(pos) : second flash (son) ; onHit(charge) : le joueur croise un anneau */
    constructor(scene, fx, { max = 6, onDetonate, onHit } = {}) {
        this.fx = fx;
        this.onDetonate = onDetonate;
        this.onHit = onHit;
        this.time = 0;
        this.pool = [];
        const quad = new THREE.PlaneGeometry(1, 1);
        const disc = new THREE.PlaneGeometry(2 * RING.RMAX, 2 * RING.RMAX);
        for (let i = 0; i < max; i++) {
            const coreMat = new THREE.ShaderMaterial({
                uniforms: { uSize: { value: 1 }, uIntensity: { value: 0 }, uRays: { value: 0 }, uTime: { value: 0 }, uColor: { value: BLUE.clone() } },
                vertexShader: coreVertex, fragmentShader: coreFragment,
                transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
            });
            const ringMat = new THREE.ShaderMaterial({
                uniforms: { uRmax: { value: RING.RMAX }, uRadius: { value: 0 }, uWidth: { value: RING.WIDTH[0] },
                            uFade: { value: 0 }, uSeed: { value: Math.random() }, uTime: { value: 0 } },
                vertexShader: ringVertex, fragmentShader: ringFragment,
                transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
            });
            const core = new THREE.Mesh(quad, coreMat);
            const ring = new THREE.Mesh(disc, ringMat);
            for (const m of [core, ring]) {
                m.frustumCulled = false;
                m.visible = false;
                m.renderOrder = 12;
                m.layers.enable(BLOOM_LAYER);
                scene.add(m);
            }
            this.pool.push({ core, ring, active: false, t: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
                             normal: new THREE.Vector3(), side: 0, hit: false, flashed: 0 });
        }
    }

    /** Largue une charge en pos, qui dérive à la vitesse vel ; l'anneau est perpendiculaire à normal */
    drop(pos, vel, normal) {
        const c = this.pool.find(p => !p.active);
        if (!c) return null;
        c.active = true;
        c.t = 0;
        c.hit = false;
        c.flashed = 0;
        c.side = 0;
        c.pos.copy(pos);
        c.vel.copy(vel);
        // l'anneau est un peu incliné au hasard (plus joli, et chaque charge est différente)
        c.normal.copy(normal).add(new THREE.Vector3(rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3))).normalize();
        c.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), c.normal);
        c.ring.material.uniforms.uSeed.value = Math.random();
        c.core.visible = true;
        return c;
    }

    active() { return this.pool.filter(c => c.active); }

    clear() {
        for (const c of this.pool) { c.active = false; c.core.visible = false; c.ring.visible = false; }
    }

    /** player : position du joueur (pour l'anneau dangereux) */
    update(dt, player) {
        this.time += dt;
        const rel = new THREE.Vector3();
        for (const c of this.pool) {
            if (!c.active) continue;
            c.t += dt;
            c.vel.multiplyScalar(Math.exp(-0.6 * dt));                // la charge ralentit
            c.pos.addScaledVector(c.vel, dt);
            c.core.position.copy(c.pos);
            c.ring.position.copy(c.pos);
            const cu = c.core.material.uniforms, ru = c.ring.material.uniforms;
            cu.uTime.value = this.time;
            ru.uTime.value = this.time;
            const t = c.t;

            if (t < T.ARM) {
                // armement : petit point bleu qui clignote
                cu.uSize.value = 7;
                cu.uIntensity.value = 0.6 + 0.6 * (Math.sin(t * 40) > 0 ? 1 : 0);
                cu.uRays.value = 0;
            } else if (t < T.GROW) {
                // la boule grandit très vite
                const u = (t - T.ARM) / (T.GROW - T.ARM);
                if (c.flashed === 0) { c.flashed = 1; this.fx.flash(c.pos, 45, BLUE, 0.3); }
                cu.uSize.value = 7 + 120 * Math.sqrt(u);
                cu.uIntensity.value = 1.1;
                cu.uRays.value = 0.6 * u;
            } else if (t < T.SHRINK) {
                // puis se recontracte, de plus en plus intense
                const u = (t - T.GROW) / (T.SHRINK - T.GROW);
                cu.uSize.value = 127 - 105 * u * u;
                cu.uIntensity.value = 1.0 + 1.2 * u;
                cu.uRays.value = 0.6 + 0.8 * u;
            } else {
                // second flash → anneau
                if (c.flashed === 1) {
                    c.flashed = 2;
                    this.fx.flash(c.pos, 80, BLUE, 0.35);
                    c.ring.visible = true;
                    if (this.onDetonate) this.onDetonate(c.pos);
                }
                const u = Math.min(1, (t - T.SHRINK) / T.RING);
                // le cœur s'éteint vite
                cu.uSize.value = 22 + 60 * u;
                cu.uIntensity.value = Math.max(0, 2.2 * (1 - u * 9));
                // l'anneau : éclatement rapide, puis il continue de s'éloigner du centre,
                // s'épaissit et pâlit peu à peu (il se disperse)
                const ts = t - T.SHRINK;
                const r = RING.BURST * (1 - Math.exp(-ts * 2.2)) + RING.DRIFT * ts;
                const fade = 1 - THREE.MathUtils.smoothstep(u, 0.2, 1);
                ru.uRadius.value = r;
                ru.uWidth.value = RING.WIDTH[0] + (RING.WIDTH[1] - RING.WIDTH[0]) * Math.sqrt(u);
                ru.uFade.value = fade;

                // le joueur traverse-t-il le plan de l'anneau, sur la bande lumineuse ?
                if (player && !c.hit && fade > RING.MIN_FADE) {
                    rel.subVectors(player, c.pos);
                    const h = rel.dot(c.normal);
                    const side = Math.sign(h) || 1;
                    const crossed = (c.side !== 0 && side !== c.side) || Math.abs(h) < 6;
                    c.side = side;
                    if (crossed) {
                        const radial = rel.addScaledVector(c.normal, -h).length();
                        if (radial > r - RING.DANGER_IN && radial < r + RING.DANGER_OUT) {
                            c.hit = true;
                            if (this.onHit) this.onHit(c);
                        }
                    }
                }
                if (u >= 1) { c.active = false; c.core.visible = false; c.ring.visible = false; }
            }
        }
    }
}
