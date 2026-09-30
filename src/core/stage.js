import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'; // même three.js que le reste (importmap en ligne, node_modules avec Vite)

/**
 * Scène, caméra, renderer, lumières et éclairages d'environnement (HDRI).
 * env.main : éclairage normal, env.alarm : éclairage rouge de l'alarme (chargés en arrière-plan).
 * lights : lumières d'ambiance de la scène.
 */
export function createStage() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // far = 50000 : l'Executor mesure ~26 000 unités, sa proue était coupée à 20 000
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 50000);
    camera.position.set(0,0,0);
    camera.rotation.order = "YXZ";

    const renderer = new THREE.WebGLRenderer({antialias:true});
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.3;
    document.body.appendChild(renderer.domElement);

    const env = { main: null, alarm: null };
    const hdrloader = new RGBELoader().setDataType(THREE.FloatType);

    hdrloader.load("studio.hdr", (texture) => {

        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        env.main = pmremGenerator.fromEquirectangular(texture).texture;

        scene.environment = env.main;

        texture.dispose();
        pmremGenerator.dispose();

    });

    hdrloader.load('public/studio2.hdr', function(texture) {

        texture.mapping = THREE.EquirectangularReflectionMapping;
        env.alarm = texture;

    });

    // Lumière (lights : réutilisées par l'hyperespace pour teinter le pont, sans lumière de plus)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.9);
    scene.add(hemiLight);

    return { scene, camera, renderer, env, lights: { ambient: ambientLight, hemi: hemiLight } };
}

// Redimensionnement de la fenêtre (onResize : pour les autres rendus, ex. le bloom)
export function handleResize(camera, renderer, onResize) {
    window.addEventListener('resize',()=>{
        camera.aspect = window.innerWidth/window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        onResize(window.innerWidth, window.innerHeight);
    });
}
