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

// messages qui défilent pendant le chargement
const STATUS = [
    'Allumage des réacteurs…',
    'Chargement de la passerelle…',
    'Réveil des stormtroopers…',
    'Calibrage des turbolasers…',
    'Préparation des TIE Fighters…',
    'Repérage de la flotte rebelle…',
    'Calcul du saut hyperspatial…'
];

/**
 * Écran de chargement (barre de progression réelle) puis bouton PLAY.
 * onPlay : appelé au clic sur PLAY (c'est ce clic qui débloque le son du navigateur).
 */
export function initLoadingScreen(onPlay) {
    const loadingScreen = document.getElementById("loadingScreen");
    const fill = document.getElementById("loadingFill");
    const percent = document.getElementById("loadingPercent");
    const text = document.getElementById("loadingText");
    const status = document.getElementById("loadingStatus");
    const playButton = document.getElementById("playButton");

    // progression : éléments chargés / éléments connus (la liste grandit en début de chargement,
    // on n'affiche donc jamais un pourcentage qui recule)
    let shown = 0;
    const previous = loadingManager.onProgress;
    loadingManager.onProgress = function(url, loaded, total) {
        if (previous) previous(url, loaded, total);
        shown = Math.max(shown, Math.floor(99 * loaded / Math.max(total, 1)));
        if (fill) fill.style.width = shown + '%';
        if (percent) percent.textContent = shown + ' %';
    };

    let statusIndex = 0;
    const statusTimer = setInterval(() => {
        if (!status) return;
        status.style.opacity = '0';
        setTimeout(() => {
            statusIndex = (statusIndex + 1) % STATUS.length;
            status.textContent = STATUS[statusIndex];
            status.style.opacity = '.75';
        }, 350);
    }, 1800);

    loadingManager.onLoad = function() {
        clearInterval(statusTimer);
        if (fill) fill.style.width = '100%';
        if (percent) percent.textContent = '100 %';
        if (text) text.textContent = 'PRÊT';
        if (status) status.textContent = 'Destroyer paré au combat';
        loadingScreen.classList.add('ready');

        setTimeout(() => {
            loadingScreen.classList.add('done');       // fondu + léger zoom
            setTimeout(() => {
                loadingScreen.style.display = "none";
                playButton.style.display = "block";
            }, 1000);
        }, 500);
    };

    playButton.addEventListener("click", () => {
        onPlay();
        playButton.style.display = "none";
    });
}
