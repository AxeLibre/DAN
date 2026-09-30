import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Tous les modèles passent par ce gestionnaire : l'écran de chargement attend la fin.
export const loadingManager = new THREE.LoadingManager();

// Les modèles sont compressés (meshopt, voir tools/optimize-assets.mjs) :
// chaque chargeur doit connaître le décodeur.
export function makeGLTFLoader() {
    const loader = new GLTFLoader(loadingManager);
    loader.setMeshoptDecoder(MeshoptDecoder);
    return loader;
}

/**
 * Écran de chargement puis bouton PLAY.
 * onPlay : appelé au clic sur PLAY (c'est ce clic qui débloque le son du navigateur).
 */
export function initLoadingScreen(onPlay) {
    loadingManager.onLoad = function() {

        const loadingScreen = document.getElementById("loadingScreen");

        loadingScreen.style.opacity = 0;

        setTimeout(() => {
            loadingScreen.style.display = "none";
            document.getElementById("playButton").style.display = "block";
        }, 1000);
    };

    const playButton = document.getElementById("playButton");

    playButton.addEventListener("click", () => {
        onPlay();
        playButton.style.display = "none";
    });
}
