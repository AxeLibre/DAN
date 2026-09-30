import * as THREE from 'three';

// Anciennes explosions (vidéo, particules). Les explosions du jeu passent maintenant
// par ExplosionFX (weapons.js) : createStandardExplosion y renvoie.
export function initLegacyExplosions(ctx) {
    const { scene, camera } = ctx;
    const { fx } = ctx.battle;

    // Rendre les fonctions d'explosion globales
    window.createStandardExplosion = createStandardExplosion;
    window.createSparkParticles = createSparkParticles;
    window.createRingExplosionComplete = createRingExplosionComplete;
    // ===================================================================
    // SYSTÈME D'EXPLOSIONS - TAILLE CORRIGÉE + ANNEAU PARFAIT
    // ===================================================================

    // -------------------------------------------------------------------
    // 1. CONFIGURATION VIDÉO
    // -------------------------------------------------------------------
    const videoex = document.createElement("video");
    videoex.src = 'public/explosion.mp4';
    videoex.preload = 'none';   // (ancienne explosion vidéo, plus utilisée par défaut)
    videoex.loop = false;
    videoex.muted = true;
    videoex.playsInline = true;

    const videoTextureex = new THREE.VideoTexture(videoex);
    videoTextureex.minFilter = THREE.LinearFilter;
    videoTextureex.magFilter = THREE.LinearFilter;
    videoTextureex.format = THREE.RGBAFormat;

    // -------------------------------------------------------------------
    // 2. STOCKAGE DES PARTICULES D'EXPLOSION
    // -------------------------------------------------------------------
    let explosions = [];                    // Explosions vidéo
    let explosionParticleSystems = [];

    // -------------------------------------------------------------------
    // 3. FONCTIONS DE BASE
    // -------------------------------------------------------------------

    /**
     * Crée une explosion vidéo seule - TAILLE RÉDUITE
     */
    function createVideoExplosion(position, scale = 8) { // 20 → 8
        const geometry = new THREE.PlaneGeometry(scale, scale);
        const material = new THREE.MeshBasicMaterial({
            map: videoTextureex,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const plane = new THREE.Mesh(geometry, material);
        plane.position.copy(position);
        plane.scale.set(2.5, 2.5, 2.5); // 6 → 2.5

        plane.userData = { 
            life: 1.5,
            type: 'video',
            initialScale: 3.5
        };

        scene.add(plane);
        explosions.push(plane);

        videoex.currentTime = 0;
        videoex.play();

        return plane;
    }

    /**
     * Crée des particules d'explosion - TAILLE RÉDUITE
     */
    function createExplosionParticles(position, options = {}) {
        const {
            count = 100, // 60 → 40
            speed = 20, // 120 → 80
            life = 2.5 // 1.5 → 1.2
        } = options;

        const geometry = new THREE.BufferGeometry();

        const positions = new Float32Array(count * 3);
        const targets = new Float32Array(count * 3);
        const seeds = new Float32Array(count);
        const velocities = [];

        for (let i = 0; i < count; i++) {
            positions[i*3] = position.x;
            positions[i*3+1] = position.y;
            positions[i*3+2] = position.z;

            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const speed_i = speed * (0.7 + Math.random() * 0.6);

            const velocity = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta) * speed_i,
                Math.sin(phi) * Math.sin(theta) * speed_i,
                Math.cos(phi) * speed_i
            );
            velocities.push(velocity);

            targets[i*3] = position.x + velocity.x * 1.5;
            targets[i*3+1] = position.y + velocity.y * 1.5;
            targets[i*3+2] = position.z + velocity.z * 1.5;

            seeds[i] = Math.random();
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('target', new THREE.BufferAttribute(targets, 3));
        geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));

        const material = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,

            uniforms: {
                morph: { value: 0 },
                time: { value: 0 },
                globalRotation: { value: 0 },
                uOpacity: { value: 1 },
                uBrightness: { value: 5.0 }
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
                    vec3 pos = mix(position, target, morph);

                    float a = seed * 6.283185 + time * 3.0;
                    pos += vec3(
                        cos(a) * 0.05,
                        sin(a * 1.3) * 0.05,
                        sin(a * 0.7) * 0.05
                    );

                    pos = rotationY(globalRotation) * pos;

                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    gl_Position = projectionMatrix * mvPosition;

                    // Taille réduite
                    float perspective = 1.0 / max(0.1, -mvPosition.z);
                    float size = 15.0 * perspective * (1.0 - morph * 0.3); // 35 → 15
                    gl_PointSize = clamp(size, 4.0, 12.0); // 8-25 → 4-12
                }
            `,

            fragmentShader: `
                precision mediump float;
                uniform float time;
                uniform float uOpacity;
                uniform float uBrightness;

                void main(){
                    vec2 uv = gl_PointCoord - 0.5;
                    float d = length(uv);

                    float core = exp(-d*d*40.0) * 2.0;
                    float ring = exp(-d*d*12.0) * 1.5;
                    float halo = exp(-d*d*3.0) * 0.8;

                    vec3 color1 = vec3(1.5, 1.2, 0.5);
                    vec3 color2 = vec3(1.8, 0.8, 0.2);
                    vec3 color3 = vec3(2.0, 0.5, 0.1);

                    vec3 color = 
                        color1 * core +
                        color2 * ring +
                        color3 * halo;

                    float flicker = 0.8 + 0.4 * sin(uv.x * 10.0 + time * 20.0) * sin(uv.y * 10.0);
                    color *= flicker;
                    color *= uBrightness;

                    float alpha = (halo * 0.5 + core * 0.3) * uOpacity * 1.2;
                    gl_FragColor = vec4(color, alpha);
                }
            `
        });

        const particleSystem = new THREE.Points(geometry, material);
        particleSystem.position.set(0, 0, 0);

        particleSystem.userData = {
            life: life,
            maxLife: life,
            velocities: velocities,
            count: count,
            type: 'explosion'
        };

        scene.add(particleSystem);
        explosionParticleSystems.push(particleSystem);

        return particleSystem;
    }

    /**
     * Crée un anneau de particules PARFAIT (qui grandit sans se déformer)
     */
    function createRingExplosion(position) {
        const count = 100;
        const geometry = new THREE.BufferGeometry();

        const positions = new Float32Array(count * 3);
        const seeds = new Float32Array(count);
        const startRadius = 2; // Rayon de départ très petit
        const endRadius = 30;   // Rayon final

        // On ne met pas de targets car on va contrôler l'expansion manuellement
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;

            // Position initiale : petit cercle
            positions[i*3] = position.x + Math.cos(angle) * startRadius;
            positions[i*3+1] = position.y;
            positions[i*3+2] = position.z + Math.sin(angle) * startRadius;

            seeds[i] = Math.random();
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));

        const material = new THREE.ShaderMaterial({
            transparent: true,
            blending: THREE.AdditiveBlending,

            uniforms: {
                time: { value: 0 },
                uOpacity: { value: 1 },
                uBrightness: { value: 5.0 },
                uRadius: { value: startRadius },
                uCenter: { value: position }
            },

            vertexShader: `
                precision mediump float;
                attribute float seed;
                uniform float time;
                uniform float uRadius;
                uniform vec3 uCenter;

                void main(){
                    // On garde la position relative au centre
                    vec3 relativePos = position - uCenter;

                    // Normaliser pour avoir une direction parfaite
                    vec3 dir = normalize(relativePos);

                    // Nouvelle position = centre + direction * rayon
                    vec3 pos = uCenter + dir * uRadius;

                    // Micro vibrations
                    float a = seed * 6.283185 + time * 2.0;
                    pos += vec3(cos(a), sin(a), cos(a)) * 0.1;

                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    gl_Position = projectionMatrix * mvPosition;

                    float perspective = 1.0 / max(0.1, -mvPosition.z);
                    float size = 12.0 * perspective; // Taille constante
                    gl_PointSize = clamp(size, 3.0, 8.0);
                }
            `,

            fragmentShader: `
                precision mediump float;
                uniform float uOpacity;
                uniform float uBrightness;

                void main(){
                    vec2 uv = gl_PointCoord - 0.5;
                    float d = length(uv);
                    float core = exp(-d*d*25.0);
                    float glow = exp(-d*d*8.0) * 0.5;
                    vec3 color = vec3(1.0, 0.8, 0.4) * uBrightness;
                    float alpha = (core + glow) * uOpacity;
                    gl_FragColor = vec4(color, alpha);
                }
            `
        });

        const ringSystem = new THREE.Points(geometry, material);
        ringSystem.userData = {
            life: 1.0,
            maxLife: 1.0,
            startRadius: startRadius,
            endRadius: endRadius,
            type: 'ring',
            center: position.clone()
        };

        scene.add(ringSystem);
        explosionParticleSystems.push(ringSystem);
    }

    /**
     * Crée des étincelles rapides - TAILLE RÉDUITE
     */
    function createSparkParticles(position, count = 15) { // 30 → 15
        const geometry = new THREE.BufferGeometry();

        const positions = new Float32Array(count * 3);
        const targets = new Float32Array(count * 3);
        const seeds = new Float32Array(count);
        const velocities = [];

        for (let i = 0; i < count; i++) {
            positions[i*3] = position.x;
            positions[i*3+1] = position.y;
            positions[i*3+2] = position.z;

            const angle1 = Math.random() * Math.PI * 2;
            const angle2 = Math.random() * Math.PI * 2;
            const speed = 150 + Math.random() * 200; // 200-500 → 150-350

            const velocity = new THREE.Vector3(
                Math.sin(angle1) * Math.cos(angle2) * speed,
                Math.sin(angle1) * Math.sin(angle2) * speed,
                Math.cos(angle1) * speed
            );
            velocities.push(velocity);

            targets[i*3] = position.x + velocity.x;
            targets[i*3+1] = position.y + velocity.y;
            targets[i*3+2] = position.z + velocity.z;

            seeds[i] = Math.random();
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('target', new THREE.BufferAttribute(targets, 3));
        geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));

        const material = new THREE.ShaderMaterial({
            transparent: true,
            blending: THREE.AdditiveBlending,

            uniforms: {
                morph: { value: 0 },
                time: { value: 0 },
                uOpacity: { value: 1 },
                uBrightness: { value: 5 }
            },

            vertexShader: `
                precision mediump float;
                attribute vec3 target;
                attribute float seed;
                uniform float morph;
                uniform float time;

                void main(){
                    vec3 pos = mix(position, target, morph);

                    float a = seed * 6.283185 + time * 5.0;
                    pos += vec3(cos(a), sin(a), cos(a)) * 0.05;

                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    gl_Position = projectionMatrix * mvPosition;

                    float perspective = 1.0 / -mvPosition.z;
                    gl_PointSize = clamp(8.0 * perspective * (1.0 - morph), 2.0, 5.0); // 15 → 8
                }
            `,

            fragmentShader: `
                precision mediump float;
                uniform float uOpacity;
                uniform float uBrightness;

                void main(){
                    vec2 uv = gl_PointCoord - 0.5;
                    float d = length(uv);
                    float core = exp(-d*d*30.0);
                    gl_FragColor = vec4(vec3(1.0, 0.9, 0.5) * uBrightness, core * uOpacity);
                }
            `
        });

        const sparkSystem = new THREE.Points(geometry, material);
        sparkSystem.userData = {
            life: 0.5, // 0.6 → 0.5
            maxLife: 0.5,
            velocities: velocities,
            count: count,
            type: 'sparks'
        };

        scene.add(sparkSystem);
        explosionParticleSystems.push(sparkSystem);
    }

    // -------------------------------------------------------------------
    // 4. PRÉSÉLECTIONS D'
    // -------------------------------------------------------------------

    function createStandardExplosion(position, scale = 10) {
        fx.explosion(position, scale * 1.1);
    }

    function createRingExplosionComplete(position, scale = 12) {
        fx.explosion(position, scale * 1.3);
    }

    // -------------------------------------------------------------------
    // 5. MISE À JOUR DES PARTICULES
    // -------------------------------------------------------------------

    function updateExplosionParticles(dt) {
        explosionParticleSystems = explosionParticleSystems.filter(system => {
            const data = system.userData;

            if (data.type === 'ring') {
                // Anneau : expansion parfaite
                const progress = 1 - (data.life / data.maxLife);
                const currentRadius = data.startRadius + (data.endRadius - data.startRadius) * progress;

                system.material.uniforms.uRadius.value = currentRadius;
                system.material.uniforms.uOpacity.value = data.life / data.maxLife;
                system.material.uniforms.time.value += dt * 2;

            } else {
                // Autres particules
                if (system.material.uniforms.morph) {
                    const morphProgress = 1 - (data.life / data.maxLife);
                    system.material.uniforms.morph.value = morphProgress;
                }

                system.material.uniforms.uOpacity.value = data.life / data.maxLife;

                if (system.material.uniforms.time) {
                    system.material.uniforms.time.value += dt * 3;
                }

                // Animation manuelle des positions
                if (data.velocities) {
                    const positions = system.geometry.attributes.position.array;
                    for (let i = 0; i < data.count; i++) {
                        const v = data.velocities[i];
                        positions[i*3] += v.x * dt;
                        positions[i*3+1] += v.y * dt;
                        positions[i*3+2] += v.z * dt;
                        v.multiplyScalar(0.97);
                    }
                    system.geometry.attributes.position.needsUpdate = true;
                }
            }

            data.life -= dt;

            if (data.life <= 0) {
                scene.remove(system);
                return false;
            }
            return true;
        });
    }

    function updateExplosions(dt) {
        // Mise à jour des explosions vidéo
        explosions = explosions.filter(exp => {
            if (exp.userData.type === 'video') {
                exp.lookAt(camera.position);

                const progress = 1 - exp.material.opacity;
                const scale = exp.userData.initialScale * (1 + progress * 1.5); // 2.5 → 1.5
                exp.scale.set(scale, scale, scale);

                exp.material.opacity -= 1.2 * dt;

                if (exp.material.opacity <= 0) {
                    scene.remove(exp);
                    return false;
                }
            }
            return true;
        });

        updateExplosionParticles(dt);
    }

    return { createStandardExplosion, createRingExplosionComplete, createVideoExplosion, updateExplosions };
}
