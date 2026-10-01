import * as THREE from 'three';
import { BLOOM_LAYER } from '../../core/bloom.js';

// =========================================================================================
// TUYAU D'HYPERCARBURANT : la station remplit le croiseur
// =========================================================================================
// Un simple tube lumineux (shader) : des impulsions bleues glissent de la station vers le
// croiseur, plus ou moins vite selon le débit.
const vertex = /* glsl */`
    varying vec2 vUv;
    varying float vFacing;
    void main() {
        vUv = uv;
        vec3 n = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFacing = abs(dot(n, normalize(-mv.xyz)));             // bord du tube plus lumineux
        gl_Position = projectionMatrix * mv;
    }`;
const fragment = /* glsl */`
    uniform float uTime;
    uniform float uFlow;
    uniform float uLength;
    varying vec2 vUv;
    varying float vFacing;
    void main() {
        float pulses = fract(vUv.y * uLength / 60.0 - uTime * 1.6);
        float p = smoothstep(0.0, 0.12, pulses) * smoothstep(0.55, 0.12, pulses);
        float rim = pow(1.0 - vFacing, 2.0);
        float I = (0.25 + rim * 0.9 + p * 1.4) * uFlow;
        vec3 col = mix(vec3(0.15, 0.55, 1.0), vec3(0.85, 0.97, 1.0), p * 0.7);
        gl_FragColor = vec4(col * I, 1.0);
    }`;

export function createFuelHose(scene, radius = 7) {
    const material = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uFlow: { value: 0 }, uLength: { value: 100 } },
        vertexShader: vertex, fragmentShader: fragment,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    // tube le long de +Y (de 0 à 1), retourné vers la cible à chaque image
    const geo = new THREE.CylinderGeometry(radius, radius, 1, 12, 1, true).translate(0, 0.5, 0);
    const mesh = new THREE.Mesh(geo, material);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.layers.enable(BLOOM_LAYER);
    scene.add(mesh);
    const dir = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

    return {
        /** from : station, to : croiseur ; flow 0 → 1 (0 : caché) */
        update(dt, from, to, flow) {
            mesh.visible = flow > 0.01;
            if (!mesh.visible) return;
            material.uniforms.uTime.value += dt * (0.4 + flow);
            material.uniforms.uFlow.value = flow;
            dir.subVectors(to, from);
            const len = dir.length();
            material.uniforms.uLength.value = len;
            mesh.position.copy(from);
            mesh.quaternion.setFromUnitVectors(up, dir.divideScalar(len));
            mesh.scale.set(1, len, 1);
        },
        hide() { mesh.visible = false; },
        dispose() { scene.remove(mesh); geo.dispose(); material.dispose(); }
    };
}
