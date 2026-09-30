import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// =========================================================================================
// BLOOM (halo lumineux) — uniquement sur les objets "lumineux"
// =========================================================================================
// Ces objets sont aussi rendus sur le calque BLOOM_LAYER. On les dessine seuls, en
// demi-résolution, on les floute, et on ajoute ce halo par-dessus l'image normale
// (qui, elle, ne change pas).
export const BLOOM_LAYER = 1;

export function createBloom(scene, camera, renderer) {
    const bloomComposer = new EffectComposer(renderer);
    bloomComposer.renderToScreen = false;
    bloomComposer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * 0.5);
    bloomComposer.setSize(window.innerWidth, window.innerHeight);
    bloomComposer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.6, 0.0);
    bloomComposer.addPass(bloomPass);

    const bloomScene = new THREE.Scene();
    const bloomCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const bloomQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
        uniforms: { tBloom: { value: null } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform sampler2D tBloom; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tBloom, vUv).rgb, 1.0); }',
        blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true
    }));
    bloomQuad.frustumCulled = false;
    bloomScene.add(bloomQuad);

    function renderWithBloom() {
        renderer.render(scene, camera);

        // passe "lumineuse" : seulement le calque BLOOM, sans le fond étoilé
        const bg = scene.background, env = scene.environment;
        scene.background = null;
        scene.environment = null;          // seuls les éléments émissifs doivent briller
        // fond noir obligatoire : pendant l'hyperespace le fond est un bleu uni, et three.js
        // gardait ce bleu comme couleur d'effacement → toute l'image était voilée de bleu
        renderer.setClearColor(0x000000, 1);
        camera.layers.set(BLOOM_LAYER);
        bloomComposer.render();
        camera.layers.set(0);
        scene.background = bg;
        scene.environment = env;

        // halo seul (sans les objets eux-mêmes, déjà dessinés) ajouté par-dessus l'image
        bloomQuad.material.uniforms.tBloom.value = bloomPass.renderTargetsHorizontal[0].texture;
        renderer.autoClear = false;
        renderer.render(bloomScene, bloomCamera);
        renderer.autoClear = true;
    }

    return {
        render: renderWithBloom,
        setSize: (w, h) => bloomComposer.setSize(w, h)
    };
}
