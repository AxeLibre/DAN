// ===================================================================
// ARMES & EFFETS  —  tirs laser + explosions GLSL (GPU)
// ===================================================================
// Deux systèmes indépendants de la scène :
//   - LaserBolts   : tous les tirs laser (canon, TIE joueur, bataille)
//                    dessinés en UN SEUL draw call (géométrie instanciée).
//   - ExplosionFX  : toutes les explosions / impacts, particules animées
//                    entièrement dans le shader (le CPU ne fait qu'émettre).
// Même esprit que les shaders de l'hologramme (core / ring / halo),
// mais avec des tailles en unités du monde : une explosion garde la
// bonne taille qu'elle soit à 20 ou à 800 unités de la caméra.

import * as THREE from 'three';

const _tmp = new THREE.Vector3();

// -------------------------------------------------------------------
// Intersection segment [p0,p1] / sphere  →  distance le long du segment (0..1) ou -1
// -------------------------------------------------------------------
export function segmentSphere(p0, p1, center, radius) {
    const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
    const fx = p0.x - center.x, fy = p0.y - center.y, fz = p0.z - center.z;
    const a = dx * dx + dy * dy + dz * dz;
    const b = 2 * (fx * dx + fy * dy + fz * dz);
    const c = fx * fx + fy * fy + fz * fz - radius * radius;
    if (c <= 0) return 0;                 // départ déjà dans la sphère
    if (a === 0) return -1;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return (t >= 0 && t <= 1) ? t : -1;
}

// ===================================================================
// TIRS LASER
// ===================================================================
export const LASER_GREEN = new THREE.Color(0.25, 1.0, 0.35);
export const LASER_RED   = new THREE.Color(1.0, 0.18, 0.1);

export class LaserBolts {

    constructor(scene, max = 400) {
        this.max = max;
        this.bolts = [];

        const quad = new THREE.PlaneGeometry(1, 1);
        const geo = new THREE.InstancedBufferGeometry();
        geo.index = quad.index;
        geo.setAttribute('position', quad.getAttribute('position'));

        const mk = (n) => {
            const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n);
            a.setUsage(THREE.DynamicDrawUsage);
            return a;
        };
        this.aHead   = mk(3);
        this.aDir    = mk(3);
        this.aColor  = mk(3);
        this.aParams = mk(3);   // longueur visible, largeur, alpha
        geo.setAttribute('aHead', this.aHead);
        geo.setAttribute('aDir', this.aDir);
        geo.setAttribute('aColor', this.aColor);
        geo.setAttribute('aParams', this.aParams);
        geo.instanceCount = 0;
        this.geometry = geo;

        const material = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            vertexShader: /* glsl */`
                attribute vec3 aHead;
                attribute vec3 aDir;
                attribute vec3 aColor;
                attribute vec3 aParams;
                varying vec2 vUv;
                varying vec3 vColor;
                varying float vAlpha;

                void main(){
                    float along = position.y + 0.5;               // 0 = queue, 1 = tête
                    float w = aParams.y;

                    // billboard axial : le rayon tourne autour de son axe pour faire face à la caméra
                    vec3 toCam = normalize(cameraPosition - aHead);
                    vec3 c = cross(aDir, toCam);
                    float l = length(c);
                    vec3 side = l > 1e-4 ? c / l : normalize(cross(vec3(0.0, 1.0, 0.0), toCam) + vec3(1e-4, 0.0, 0.0));
                    vec3 up = normalize(cross(toCam, side));

                    vec3 pAxial = aHead - aDir * (1.0 - along) * aParams.x + side * position.x * w;
                    // vu pile dans l'axe (tir qui s'éloigne), le trait n'a plus de surface :
                    // on bascule alors vers un petit halo face caméra
                    vec3 pHead = aHead + side * position.x * w * 1.6 + up * (along - 0.5) * w * 3.2;
                    float headOn = smoothstep(0.9, 0.995, abs(dot(aDir, toCam)));
                    vec3 p = mix(pAxial, pHead, headOn);

                    vUv = vec2(position.x * 2.0, along);
                    vColor = aColor;
                    vAlpha = aParams.z;
                    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                varying vec2 vUv;
                varying vec3 vColor;
                varying float vAlpha;

                void main(){
                    float x = abs(vUv.x);
                    float y = vUv.y;
                    float ends = smoothstep(0.0, 0.35, y) * smoothstep(1.0, 0.8, y);
                    float core = smoothstep(0.32, 0.0, x);
                    float glow = exp(-x * x * 5.0);
                    vec3 col = mix(vColor * 1.8, vec3(1.0, 1.0, 0.95), core * 0.85);
                    float a = (glow * 0.75 + core) * ends * vAlpha;
                    gl_FragColor = vec4(col, a);
                }
            `
        });

        this.mesh = new THREE.Mesh(geo, material);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 10;
        scene.add(this.mesh);
    }

    /**
     * Tire un laser.
     * opts: { from, dir, speed, length, width, color, range, team, hitTest(bolt,p0,p1) → hit|null, onHit(bolt,hit) }
     */
    fire(opts) {
        if (this.bolts.length >= this.max) this.bolts.shift();
        const bolt = {
            pos: opts.from.clone(),
            dir: opts.dir.clone().normalize(),
            speed: opts.speed ?? 900,
            length: opts.length ?? 14,
            width: opts.width ?? 0.8,
            color: (opts.color ?? LASER_GREEN).clone(),
            range: opts.range ?? 1600,
            travelled: 0,
            team: opts.team ?? 'neutral',
            hitTest: opts.hitTest ?? null,
            onHit: opts.onHit ?? null,
            dead: false
        };
        this.bolts.push(bolt);
        return bolt;
    }

    clear(filter = null) {
        this.bolts = filter ? this.bolts.filter(b => !filter(b)) : [];
    }

    update(dt) {
        const p0 = new THREE.Vector3();
        let n = 0;
        const H = this.aHead.array, D = this.aDir.array, C = this.aColor.array, P = this.aParams.array;

        this.bolts = this.bolts.filter(b => {
            if (b.dead) return false;

            p0.copy(b.pos);
            const step = b.speed * dt;
            b.pos.addScaledVector(b.dir, step);
            b.travelled += step;

            if (b.hitTest) {
                const hit = b.hitTest(b, p0, b.pos);
                if (hit) {
                    if (hit.point) b.pos.copy(hit.point);
                    if (b.onHit) b.onHit(b, hit);
                    return false;
                }
            }
            if (b.travelled >= b.range) return false;

            // écriture GPU
            const fade = Math.min(1, (b.range - b.travelled) / (b.range * 0.2));
            const i3 = n * 3;
            H[i3] = b.pos.x; H[i3 + 1] = b.pos.y; H[i3 + 2] = b.pos.z;
            D[i3] = b.dir.x; D[i3 + 1] = b.dir.y; D[i3 + 2] = b.dir.z;
            C[i3] = b.color.r; C[i3 + 1] = b.color.g; C[i3 + 2] = b.color.b;
            P[i3] = Math.min(b.length, b.travelled);   // ne dépasse jamais derrière le canon
            P[i3 + 1] = b.width;
            P[i3 + 2] = fade;
            n++;
            return true;
        });

        this.geometry.instanceCount = n;
        if (n > 0) {
            this.aHead.needsUpdate = true;
            this.aDir.needsUpdate = true;
            this.aColor.needsUpdate = true;
            this.aParams.needsUpdate = true;
        }
    }
}

// ===================================================================
// EXPLOSIONS GLSL
// ===================================================================
// kind : 0 = boule de feu, 1 = étincelle, 2 = flash, 3 = onde de choc
export class ExplosionFX {

    constructor(scene, capacity = 8000) {
        this.capacity = capacity;
        this.head = 0;
        this.time = 0;
        this.dirty = false;

        const geo = new THREE.BufferGeometry();
        const f = (n) => new THREE.BufferAttribute(new Float32Array(capacity * n), n).setUsage(THREE.DynamicDrawUsage);
        this.aPos   = f(3);   // origine
        this.aVel   = f(3);
        this.aTime  = f(3);   // naissance, durée, traînée (drag)
        this.aSize  = f(2);   // taille début / fin (unités monde)
        this.aColor = f(3);
        this.aKind  = f(2);   // type, graine aléatoire
        // tout le monde "mort" au départ
        for (let i = 0; i < capacity; i++) this.aTime.array[i * 3 + 1] = -1;

        geo.setAttribute('position', this.aPos);
        geo.setAttribute('aVel', this.aVel);
        geo.setAttribute('aTime', this.aTime);
        geo.setAttribute('aSize', this.aSize);
        geo.setAttribute('aColor', this.aColor);
        geo.setAttribute('aKind', this.aKind);

        this.material = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            uniforms: {
                uTime:  { value: 0 },
                uScale: { value: 800 }
            },
            vertexShader: /* glsl */`
                precision highp float;
                attribute vec3 aVel;
                attribute vec3 aTime;
                attribute vec2 aSize;
                attribute vec3 aColor;
                attribute vec2 aKind;
                uniform float uTime;
                uniform float uScale;
                varying float vT;
                varying vec3 vColor;
                varying float vKind;
                varying float vSeed;

                void main(){
                    float age = uTime - aTime.x;
                    float t = age / aTime.y;
                    if (aTime.y <= 0.0 || t < 0.0 || t > 1.0) {
                        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                        gl_PointSize = 0.0;
                        return;
                    }
                    float drag = max(aTime.z, 0.001);
                    vec3 p = position + aVel * (1.0 - exp(-drag * age)) / drag;

                    vec4 mv = modelViewMatrix * vec4(p, 1.0);
                    gl_Position = projectionMatrix * mv;

                    float grow = aKind.x < 0.5 ? sqrt(t) : t;
                    float size = mix(aSize.x, aSize.y, grow);
                    gl_PointSize = clamp(size * uScale / max(0.5, -mv.z), 0.0, 512.0);

                    vT = t;
                    vColor = aColor;
                    vKind = aKind.x;
                    vSeed = aKind.y;
                }
            `,
            fragmentShader: /* glsl */`
                precision highp float;
                uniform float uTime;
                varying float vT;
                varying vec3 vColor;
                varying float vKind;
                varying float vSeed;

                void main(){
                    vec2 uv = gl_PointCoord - 0.5;
                    float d = length(uv);
                    if (d > 0.5) discard;

                    float core = exp(-d * d * 40.0);
                    float ring = exp(-d * d * 12.0);
                    float halo = exp(-d * d * 4.0);
                    vec3 col;
                    float a;

                    if (vKind < 0.5) {
                        // BOULE DE FEU : blanc -> jaune -> orange -> rouge sombre
                        float n = 0.75 + 0.25 * sin(uv.x * 14.0 + vSeed * 40.0 + uTime * 3.0)
                                              * sin(uv.y * 13.0 - vSeed * 25.0 + vT * 6.0);
                        vec3 hot  = vec3(1.6, 1.4, 1.0);
                        vec3 fire = vec3(1.9, 0.75, 0.18);
                        vec3 dark = vec3(0.55, 0.08, 0.02);
                        col = mix(hot, fire, smoothstep(0.0, 0.25, vT));
                        col = mix(col, dark, smoothstep(0.35, 1.0, vT));
                        col *= mix(vec3(1.0), vColor, 0.35);
                        a = (core * 0.8 + ring * 0.9 + halo * 0.5) * n * pow(1.0 - vT, 1.4);
                    } else if (vKind < 1.5) {
                        // ÉTINCELLE
                        col = mix(vec3(1.4, 1.3, 1.0), vColor * 1.6, vT);
                        a = (core * 1.5 + ring * 0.4) * (1.0 - vT);
                    } else if (vKind < 2.5) {
                        // FLASH
                        col = mix(vec3(1.5, 1.5, 1.4), vColor, 0.3);
                        a = (core + halo * 0.8) * pow(1.0 - vT, 2.0);
                    } else {
                        // ONDE DE CHOC
                        col = mix(vec3(1.2, 1.0, 0.8), vColor, 0.5);
                        a = (ring * 0.7 + halo * 0.3) * pow(1.0 - vT, 1.5);
                    }
                    gl_FragColor = vec4(col, a);
                }
            `
        });

        this.points = new THREE.Points(geo, this.material);
        this.points.frustumCulled = false;
        this.points.renderOrder = 11;
        scene.add(this.points);
    }

    emit(pos, vel, life, size0, size1, color, kind, drag = 2.5) {
        const i = this.head;
        this.head = (this.head + 1) % this.capacity;
        const i3 = i * 3;
        this.aPos.array[i3] = pos.x; this.aPos.array[i3 + 1] = pos.y; this.aPos.array[i3 + 2] = pos.z;
        this.aVel.array[i3] = vel.x; this.aVel.array[i3 + 1] = vel.y; this.aVel.array[i3 + 2] = vel.z;
        this.aTime.array[i3] = this.time; this.aTime.array[i3 + 1] = life; this.aTime.array[i3 + 2] = drag;
        this.aSize.array[i * 2] = size0; this.aSize.array[i * 2 + 1] = size1;
        this.aColor.array[i3] = color.r; this.aColor.array[i3 + 1] = color.g; this.aColor.array[i3 + 2] = color.b;
        this.aKind.array[i * 2] = kind; this.aKind.array[i * 2 + 1] = Math.random();
        this.dirty = true;
    }

    _randDir(out) {
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        return out.set(s * Math.cos(th), u, s * Math.sin(th));
    }

    /** Grosse explosion (vaisseau détruit). radius ≈ rayon de la boule de feu en unités monde. */
    explosion(pos, radius = 15, tint = new THREE.Color(1, 0.6, 0.3)) {
        const v = new THREE.Vector3();
        const white = new THREE.Color(1, 1, 1);

        this.emit(pos, v.set(0, 0, 0), 0.28, radius * 1.2, radius * 3.2, white, 2);

        const fire = Math.round(22 + radius * 0.4);
        for (let i = 0; i < fire; i++) {
            this._randDir(v).multiplyScalar(radius * (0.8 + Math.random() * 2.2));
            this.emit(pos, v, 0.9 + Math.random() * 0.9, radius * (0.35 + Math.random() * 0.3), radius * (0.9 + Math.random() * 0.7), tint, 0, 2.2);
        }

        for (let i = 0; i < 45; i++) {
            this._randDir(v).multiplyScalar(radius * (4 + Math.random() * 6));
            this.emit(pos, v, 0.5 + Math.random() * 0.8, radius * 0.1, radius * 0.03, tint, 1, 1.3);
        }

        // onde de choc dans un plan aléatoire
        const nrm = this._randDir(new THREE.Vector3());
        const t1 = new THREE.Vector3().crossVectors(nrm, Math.abs(nrm.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
        const t2 = new THREE.Vector3().crossVectors(nrm, t1);
        for (let i = 0; i < 60; i++) {
            const a = (i / 60) * Math.PI * 2;
            v.copy(t1).multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a)).multiplyScalar(radius * 5);
            this.emit(pos, v, 0.8, radius * 0.25, radius * 0.5, tint, 3, 1.6);
        }

        // braises lentes
        for (let i = 0; i < 14; i++) {
            this._randDir(v).multiplyScalar(radius * (0.6 + Math.random()));
            this.emit(pos, v, 1.8 + Math.random() * 1.2, radius * 0.12, radius * 0.05, tint, 1, 0.6);
        }
    }

    /** Petit impact de laser (sur une coque / un bouclier). */
    impact(pos, color = LASER_GREEN, size = 4) {
        const v = new THREE.Vector3();
        this.emit(pos, v.set(0, 0, 0), 0.18, size * 1.2, size * 2.6, color, 2);
        for (let i = 0; i < 18; i++) {
            this._randDir(v).multiplyScalar(size * (6 + Math.random() * 10));
            this.emit(pos, v, 0.35 + Math.random() * 0.4, size * 0.18, size * 0.05, color, 1, 2.0);
        }
        for (let i = 0; i < 5; i++) {
            this._randDir(v).multiplyScalar(size * (0.5 + Math.random()));
            this.emit(pos, v, 0.5 + Math.random() * 0.3, size * 0.4, size * 1.0, new THREE.Color(1, 0.7, 0.4), 0, 2.5);
        }
    }

    /** Flash de bouche de canon. */
    muzzle(pos, color = LASER_GREEN, size = 3) {
        this.emit(pos, _tmp.set(0, 0, 0), 0.08, size, size * 1.6, color, 2);
    }

    update(dt, camera, renderer) {
        this.time += dt;
        this.material.uniforms.uTime.value = this.time;

        // pixels par unité à distance 1 (taille des points en unités monde)
        const h = renderer.getDrawingBufferSize(_v2).y;
        this.material.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));

        if (this.dirty) {
            this.aPos.needsUpdate = true;
            this.aVel.needsUpdate = true;
            this.aTime.needsUpdate = true;
            this.aSize.needsUpdate = true;
            this.aColor.needsUpdate = true;
            this.aKind.needsUpdate = true;
            this.dirty = false;
        }
    }
}
const _v2 = new THREE.Vector2();

// ===================================================================
// HUD DE COMBAT (réticule TIE, score, radar, verrouillage)
// ===================================================================
export class CombatHUD {

    constructor() {
        const root = document.createElement('div');
        root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99998;display:none;font-family:StarJedi,Orbitron,sans-serif;';
        document.body.appendChild(root);
        this.root = root;

        // Réticule TIE (centre écran)
        this.reticle = document.createElement('div');
        this.reticle.innerHTML = `
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="26" fill="none" stroke="#7dff8a" stroke-width="1.5" stroke-opacity="0.7"/>
              <line x1="60" y1="18" x2="60" y2="38" stroke="#7dff8a" stroke-width="2"/>
              <line x1="60" y1="82" x2="60" y2="102" stroke="#7dff8a" stroke-width="2"/>
              <line x1="18" y1="60" x2="38" y2="60" stroke="#7dff8a" stroke-width="2"/>
              <line x1="82" y1="60" x2="102" y2="60" stroke="#7dff8a" stroke-width="2"/>
              <circle cx="60" cy="60" r="2.5" fill="#7dff8a"/>
            </svg>`;
        this.reticle.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);filter:drop-shadow(0 0 6px #3dff5a);display:none;';
        root.appendChild(this.reticle);

        // Cadre de verrouillage
        this.lock = document.createElement('div');
        this.lock.style.cssText = 'position:absolute;width:56px;height:56px;margin:-28px 0 0 -28px;border:2px solid #ff3b2f;border-radius:4px;box-shadow:0 0 10px #ff3b2f;display:none;transition:width .1s,height .1s;';
        root.appendChild(this.lock);

        // Score
        this.score = document.createElement('div');
        this.score.style.cssText = 'position:absolute;top:18px;right:24px;color:#FFE81F;font-size:22px;text-shadow:0 0 10px rgba(255,232,31,.7);';
        root.appendChild(this.score);

        // Radar
        this.radar = document.createElement('canvas');
        this.radar.width = 180; this.radar.height = 180;
        this.radar.style.cssText = 'position:absolute;right:24px;bottom:24px;width:150px;height:150px;border-radius:50%;background:rgba(0,20,0,.45);box-shadow:0 0 12px rgba(61,255,90,.5), inset 0 0 20px rgba(61,255,90,.25);';
        root.appendChild(this.radar);

        // Flash dégâts
        this.hurt = document.createElement('div');
        this.hurt.style.cssText = 'position:absolute;inset:0;background:radial-gradient(ellipse at center, rgba(255,0,0,0) 40%, rgba(255,30,0,.55) 100%);opacity:0;transition:opacity .35s;';
        root.appendChild(this.hurt);

        this.kills = 0;
        this.setScore(0);
    }

    show(mode) {        // 'flight' | 'turret' | null
        this.root.style.display = mode ? 'block' : 'none';
        this.reticle.style.display = mode === 'flight' ? 'block' : 'none';
        this.radar.style.display = mode ? 'block' : 'none';
        if (!mode) this.lock.style.display = 'none';
        this.mode = mode;
    }

    setScore(n) {
        this.kills = n;
        this.score.textContent = `x-wing : ${n}`;
    }

    showLock(x, y, visible) {
        this.lock.style.display = visible ? 'block' : 'none';
        if (visible) { this.lock.style.left = x + 'px'; this.lock.style.top = y + 'px'; }
    }

    flashHurt() {
        this.hurt.style.transition = 'none';
        this.hurt.style.opacity = '1';
        requestAnimationFrame(() => {
            this.hurt.style.transition = 'opacity .5s';
            this.hurt.style.opacity = '0';
        });
    }

    /** Radar vu de dessus, orienté comme le joueur. */
    drawRadar(origin, yaw, enemies, capital, range = 1200) {
        const c = this.radar.getContext('2d');
        const R = 90;
        c.clearRect(0, 0, 180, 180);
        c.strokeStyle = 'rgba(125,255,138,.35)';
        c.lineWidth = 1;
        c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.arc(R, R, (R - 2) / 2, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.moveTo(R, 4); c.lineTo(R, 176); c.moveTo(4, R); c.lineTo(176, R); c.stroke();

        const cos = Math.cos(yaw), sin = Math.sin(yaw);
        const plot = (p, color, size) => {
            const dx = p.x - origin.x, dz = p.z - origin.z;
            // repère du joueur : avant = -Z local
            let rx = dx * cos - dz * sin;
            let rz = dx * sin + dz * cos;
            let px = rx / range * (R - 6), py = rz / range * (R - 6);
            const l = Math.hypot(px, py);
            if (l > R - 6) { px *= (R - 6) / l; py *= (R - 6) / l; size *= 0.7; }
            c.fillStyle = color;
            c.beginPath(); c.arc(R + px, R + py, size, 0, Math.PI * 2); c.fill();
        };
        capital.forEach(p => plot(p, 'rgba(255,160,60,.9)', 6));
        enemies.forEach(p => plot(p, '#ff3b2f', 3));
        c.fillStyle = '#7dff8a';
        c.beginPath(); c.moveTo(R, R - 7); c.lineTo(R - 5, R + 5); c.lineTo(R + 5, R + 5); c.closePath(); c.fill();
    }
}
