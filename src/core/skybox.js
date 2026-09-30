import * as THREE from 'three';

const SKY_SPEED = 0.003;   // rad/s → un tour complet en ~35 min
export const HYPERSPACE_BG = new THREE.Color(0x0b2a66);   // fond pendant l'hyperespace (bleu du tunnel)

/**
 * Fond étoilé qui tourne TRÈS lentement. three.js 0.160 ne sait pas faire tourner
 * scene.background : on dessine donc un petit cube autour de la caméra, en premier,
 * avec la même image. Coût : 1 seul appel de dessin.
 */
export function createSkybox(scene) {
    const loader = new THREE.CubeTextureLoader();
    const cubeTexture = loader.load([
        './public/env8/px.jpg','./public/env8/nx.jpg',
        './public/env8/py.jpg','./public/env8/ny.jpg',
        './public/env8/pz.jpg','./public/env8/nz.jpg'
    ]);
    cubeTexture.colorSpace = THREE.SRGBColorSpace;
    scene.background = null;
    const skybox = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.ShaderMaterial({
            uniforms: { envMap: { value: cubeTexture } },
            vertexShader: /* glsl */`
                varying vec3 vDir;
                void main() {
                    vDir = position;   // direction dans le repère du ciel (qui tourne)
                    // seulement les ROTATIONS (caméra et ciel), jamais la position : le ciel est
                    // "à l'infini" et ne tremble plus quand la caméra est secouée par un tir
                    vec3 p = mat3(viewMatrix) * (mat3(modelMatrix) * position);
                    gl_Position = projectionMatrix * vec4(p, 1.0);
                }`,
            fragmentShader: /* glsl */`
                uniform samplerCube envMap;
                varying vec3 vDir;
                void main() {
                    gl_FragColor = textureCube(envMap, vec3(-vDir.x, vDir.y, vDir.z));
                    #include <colorspace_fragment>
                }`,
            side: THREE.BackSide,
            depthTest: false,
            depthWrite: false
        })
    );
    skybox.renderOrder = -1000;        // dessiné avant tout le reste
    skybox.frustumCulled = false;
    skybox.rotation.x = 0.25;          // axe de rotation légèrement incliné
    scene.add(skybox);

    return {
        mesh: skybox,
        update(dt) {
            skybox.rotation.y += SKY_SPEED * dt;
        }
    };
}
