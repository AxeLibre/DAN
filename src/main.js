import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'; // même three.js que le reste (importmap en ligne, node_modules avec Vite)
import { LaserBolts, ExplosionFX, CombatHUD, DebrisField, InstancedShips, segmentSphere, LASER_GREEN, LASER_RED } from './weapons.js';
import { RebelFleet } from './fleet.js';

let scene, camera, renderer;
let particleSystem, material;
let mouse = new THREE.Vector3();
let mouseSmooth = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
let plane = new THREE.Plane(new THREE.Vector3(0,0,1),0);
let clock = new THREE.Clock();
let isPlaying = false;        // ✅ contrôle si l’animation de l’écran est en cours
let fadeState = "idle";  // "idle" | "fadeIn" | "playing" | "fadeOut"
let fadeSpeed = 0.02;
let ambientSound;
let ambientStarted = false;
let hologramActive = false;   // état logique ON/OFF
let hologramOpacity = 0;     // valeur actuelle
let hologramTarget = 0;      // 0 ou 1
const hologramFadeSpeed = 0.03;
let doorSound;
let playerBox = new THREE.Box3();
let isInsideShip = true;
let playerState = "walk"; // "walk" | "flight"
let gameReady;
let tieLoaded = false;
let cockpitLoaded = false;
let controls;
let flightControls;
let cockpit;
let detectionBox = new THREE.Box3();
let sdt;
let collisionRaycaster = new THREE.Raycaster();
const walkSpeed = 0.25;
const flightSpeed = 1; // 🚀 plus rapide
let currentFlightSpeed = 1; // pour accélération progressive
const maxFlightSpeed = 1;
const acceleration = 0.05;
let ambienttie; 
let tieOn;
let tieOff;
let objectFade = "idle"; // "fadeOut" | "hidden" | "fadeIn"
let objectOpacity = 1;
const objectFadeSpeed = 0.02;
let open;
let transittionsound;
let button1;
let button2;
let button3;
let poweroff;
let explosion;
let boom;
let ctrlScreenVisible = false;
let ctrlScreenFadeDirection = 0; // 1 = fade in, -1 = fade out
const ctrlScreenFadeSpeed = 1.5;
const screenGeometry = new THREE.PlaneGeometry(16, 9); // format 16:9
const loadingManager = new THREE.LoadingManager();

// Les modèles sont compressés (meshopt, voir tools/optimize-assets.mjs) :
// chaque chargeur doit connaître le décodeur.
function makeGLTFLoader() {
    const loader = new GLTFLoader(loadingManager);
    loader.setMeshoptDecoder(MeshoptDecoder);
    return loader;
}
let panelMesh;

let blinkTime = 0;
let panelMixer;
let panelAction;

let alarmSound;
let alarmActive = false; // état ON/OFF
let cockpitFloatTime = 0;
let videoTexture;
let hyperscreen;
let screenMaterial;
let originalPositions = new Map();
const hyperMoveDistance = 200;
let mainHDRI;
let alarmHDR;
let rotationVelocity = 0;
const rotationAcceleration = 0.2;
const rotationDamping = 0.85;
const maxRotationSpeed = 0.3;      // limite max rad/frame
let ships = [];
let shipIndex = 0;
let tiePlayer = null;
let tiePlayer1;
let tiefighter;
let tieinterceptor;
let tiesilencer;
let tiechange; 
let cannonActive = false;
let lasers = [];
let laseron;
let laseroff;
let cannonTargetY = -20;
let cannonHiddenY = -20;
let cannonVisibleY = 0;
let cannonSpeed = 0.5;
let ignoreNextShot = false;
let enemies = [];           // X-Wing (ennemis)
let friendlyShips = [];     // TIE (amis)
let tieModel = null;        // Modèle TIE
let xwingModel = null;      // Modèle X-Wing
let enemyLasers = [];       // Lasers rouges (X-Wing)
let friendlyLasers = [];    // Lasers verts (TIE)
let explosions = [];                    // Explosions vidéo
// La boucle d'animation tournait 2 fois par image (≈120 fois/s sur un écran 60 Hz).
// Les vitesses "par image" réglées à l'époque sont conservées via ce facteur.
const LEGACY_TICK_RATE = 120;
const FLIGHT_CRUISE_SPEED = 50;   // vitesse du TIE en vol (unités/s)
const FLIGHT_BOOST_SPEED = 700;   // avec MAJ (Shift) maintenue (l'Executor fait ~26 000 unités de long)
const BATTLE_Y = 250;             // altitude moyenne de la bataille (au-dessus de la coque de l'Executor, y ≈ -80)
const BATTLE_MIN_Z = 260;         // la bataille reste devant la passerelle (vitres ≈ z 150, canon z 190)
const listener = new THREE.AudioListener();
let collisionMeshInterior;
let collisionMeshExterior;
let collisionShip;
// Rendre les fonctions d'explosion globales
window.createStandardExplosion = createStandardExplosion;
window.createSparkParticles = createSparkParticles;
window.createRingExplosionComplete = createRingExplosionComplete;

const starJediFont = new FontFace(
    "StarJedi",
    "url(fonts/Starjedi.ttf)" // relatif : marche sur GitHub Pages (/DAN/) ET avec Vite
);

starJediFont.load().then(function(font){
    document.fonts.add(font);
    console.log("StarJedi chargée");
});


let video;

video = document.createElement("video");
video.src = "public/hyperscreen.mp4";
video.loop = false;
video.muted = false; // important
video.playsInline = true;
video.pause();

videoTexture = new THREE.VideoTexture(video);
videoTexture.colorSpace = THREE.SRGBColorSpace;
videoTexture.flipY = false;




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

    // débloque le contexte audio
    
    camera.add(listener);

    if (ambientSound && ambientSound.buffer) {
        ambientSound.play();
        ambientStarted = true;
    }
    open.play();
    playButton.style.display = "none";
});



// ==================
// SCÈNE & CAMERA
// ==================
scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// far = 50000 : l'Executor mesure ~26 000 unités, sa proue était coupée à 20 000
camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 50000);
camera.position.set(0,0,0);
camera.rotation.order = "YXZ";



// Renderer
renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.3;
document.body.appendChild(renderer.domElement);


const hdrloader = new RGBELoader().setDataType(THREE.FloatType);

hdrloader.load("studio.hdr", (texture) => {

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    mainHDRI = pmremGenerator.fromEquirectangular(texture).texture;

    scene.environment = mainHDRI;

    texture.dispose();
    pmremGenerator.dispose();

});

hdrloader.load('public/studio2.hdr', function(texture) {

    texture.mapping = THREE.EquirectangularReflectionMapping;
    alarmHDR = texture;

});



// Lumière
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.9);
scene.add(hemiLight);

// AMBIANCE SOUND

const listener2 = new THREE.AudioListener();
camera.add(listener2);
const audioLoader = new THREE.AudioLoader();
const audioLoader2 = new THREE.AudioLoader();

// Ambiance : 53 minutes de son. Avant, le fichier était entièrement téléchargé puis
// décodé en mémoire (~1 Go de RAM !). Il est maintenant lu en streaming par le
// navigateur. Même utilisation qu'avant : play(), stop(), isPlaying, buffer.
const ambientEl = new Audio('public/ambient.mp3');
ambientEl.loop = true;      // ambiance en boucle
ambientEl.volume = 0.5;     // volume doux
ambientEl.preload = 'none';
ambientSound = {
    buffer: true,
    get isPlaying() { return !ambientEl.paused; },
    play() { ambientEl.play().catch(() => {}); },
    stop() { ambientEl.pause(); }
};

ambienttie = new THREE.Audio(listener2);

audioLoader2.load('public/tie_int2.WAV', function(buffer) {
    ambienttie.setBuffer(buffer);
    ambienttie.setLoop(true);   // ambiance en boucle
    ambienttie.setVolume(0.5);  // volume doux
});



// AUTRES SONS

const listener3 = new THREE.AudioListener();
camera.add(listener3);

const audioLoader3 = new THREE.AudioLoader();


const ctrlscreenon = new THREE.Audio(listener3);

audioLoader3.load('public/sounds/holo_on.mp3', buffer => {
    ctrlscreenon.setBuffer(buffer);
    ctrlscreenon.setVolume(1.5);
});




const ctrlscreenoff = new THREE.Audio(listener3);

audioLoader3.load('public/sounds/ctrlscreenoff.mp3', buffer => {
    ctrlscreenoff.setBuffer(buffer);
    ctrlscreenoff.setVolume(1.5);
});

const holoOnSound = new THREE.Audio(listener3);

audioLoader3.load('public/sounds/holo_off.mp3', buffer => {
    holoOnSound.setBuffer(buffer);
    holoOnSound.setVolume(0.6);
});

const holoOffSound2 = new THREE.Audio(listener3);

audioLoader3.load('public/sounds/holooff.mp3', buffer => {
    holoOffSound2.setBuffer(buffer);
    holoOffSound2.setVolume(0.6);
});


tieOn = new THREE.Audio(listener3);

audioLoader2.load('public/tie_on.WAV', function(buffer) {
    tieOn.setBuffer(buffer);
    tieOn.setLoop(false);   // ambiance en boucle
    tieOn.setVolume(0.9);  // volume doux
});

tieOff = new THREE.Audio(listener3);

audioLoader2.load('public/tie_off.mp3', function(buffer) {
    tieOff.setBuffer(buffer);
    tieOff.setLoop(false);   // ambiance en boucle
    tieOff.setVolume(0.9);  // volume doux
});

open = new THREE.Audio(listener3);

audioLoader2.load('public/open.mp3', function(buffer) {
    open.setBuffer(buffer);
    open.setLoop(false);   // ambiance en boucle
    open.setVolume(0.9);  // volume doux
});

transittionsound = new THREE.Audio(listener3);

audioLoader2.load('public/transition.mp3', function(buffer) {
    transittionsound.setBuffer(buffer);
    transittionsound.setLoop(false);   // ambiance en boucle
    transittionsound.setVolume(0.9);  // volume doux
});

button1 = new THREE.Audio(listener3);

audioLoader2.load('public/bipbip1.WAV', function(buffer) {
    button1.setBuffer(buffer);
    button1.setLoop(false);   // ambiance en boucle
    button1.setVolume(0.9);  // volume doux
});

button2 = new THREE.Audio(listener3);

audioLoader2.load('public/bipbip2.WAV', function(buffer) {
    button2.setBuffer(buffer);
    button2.setLoop(false);   // ambiance en boucle
    button2.setVolume(0.9);  // volume doux
});

button3 = new THREE.Audio(listener3);

audioLoader2.load('public/bipbip3.mp3', function(buffer) {
    button3.setBuffer(buffer);
    button3.setLoop(false);   // ambiance en boucle
    button3.setVolume(0.9);  // volume doux
});

tiechange = new THREE.Audio(listener3);

audioLoader2.load('public/tiechange.WAV', function(buffer) {
    tiechange.setBuffer(buffer);
    tiechange.setLoop(false);   
    tiechange.setVolume(1.0);  
});

laseron = new THREE.Audio(listener3);

audioLoader2.load('public/laseron.mp3', function(buffer) {
    laseron.setBuffer(buffer);
    laseron.setLoop(false);   
    laseron.setVolume(2.0);  
});

laseroff = new THREE.Audio(listener3);

audioLoader2.load('public/laseroff.mp3', function(buffer) {
    laseroff.setBuffer(buffer);
    laseroff.setLoop(false);   
    laseroff.setVolume(2.0);  
});

explosion = new THREE.Audio(listener3);

audioLoader2.load('public/explosion.mp3', function(buffer) {
    explosion.setBuffer(buffer);
    explosion.setLoop(false);   
    explosion.setVolume(2.0);  
});

boom = new THREE.Audio(listener3);

audioLoader2.load('public/boom.mp3', function(buffer) {
    boom.setBuffer(buffer);
    boom.setLoop(false);   
    boom.setVolume(2.0);  
});

// Son des portes
doorSound = new THREE.Audio(listener3);  

audioLoader2.load('public/door.mp3', function(buffer) { 
    doorSound.setBuffer(buffer);
    doorSound.setVolume(0.5);
});

button2 = new THREE.Audio(listener3);

audioLoader2.load('public/bipbip6.WAV', function(buffer) {
    button2.setBuffer(buffer);
    button2.setLoop(false);   
    button2.setVolume(2.0);  
});

button1 = new THREE.Audio(listener3);

audioLoader2.load('public/bipbip1.WAV', function(buffer) {
    button1.setBuffer(buffer);
    button1.setLoop(false);   
    button1.setVolume(2.0);  
});

button3 = new THREE.Audio(listener3);

audioLoader2.load('public/sounds/button0.mp3', function(buffer) {
    button3.setBuffer(buffer);
    button3.setLoop(false);   
    button3.setVolume(2.0);  
});

// Son collision métallique                                    *********************
const metalCollisionSound = new THREE.Audio(listener);
audioLoader2.load('public/sounds/metal_impact.mp3', function(buffer) {
    metalCollisionSound.setBuffer(buffer);
    metalCollisionSound.setLoop(false);
    metalCollisionSound.setVolume(0.8);
});


// 🎧 Listener
const listener4 = new THREE.AudioListener();
camera.add(listener4);

// 🎧 Son R2
const R2 = new THREE.Audio(listener4);

const audioLoader4 = new THREE.AudioLoader();
audioLoader4.load('public/R2.WAV', function(buffer) {
    R2.setBuffer(buffer);
    R2.setVolume(0.8);
});

function playSoundSafe(sound) {
    if (!sound || !sound.buffer) return;

    if (sound.isPlaying) {
        sound.stop();
    }

    sound.play();
}




// ==================
// SKYBOX
// ==================
const loader = new THREE.CubeTextureLoader();
const cubeTexture = loader.load([
    './public/env8/px.jpg','./public/env8/nx.jpg',
    './public/env8/py.jpg','./public/env8/ny.jpg',
    './public/env8/pz.jpg','./public/env8/nz.jpg'
]);
cubeTexture.colorSpace = THREE.SRGBColorSpace;
// Fond étoilé qui tourne TRÈS lentement. three.js 0.160 ne sait pas faire tourner
// scene.background : on dessine donc un petit cube autour de la caméra, en premier,
// avec la même image. Coût : 1 seul appel de dessin.
scene.background = null;
const SKY_SPEED = 0.003;   // rad/s → un tour complet en ~35 min
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

function updateSkybox(dt) {
    skybox.rotation.y += SKY_SPEED * dt;
}
const HYPERSPACE_BG = new THREE.Color(0x0b2a66);   // fond pendant l'hyperespace (bleu du tunnel)

// ==================
// LOAD GLB MODEL
// ==================

// ==================
//Groupes d'objets
// ==================
const worldGroup = new THREE.Group();      // projecteur + décor
const hologramGroup = new THREE.Group();   // HOLOGRAM

scene.add(worldGroup);
scene.add(hologramGroup);

//plateau tournant
// pivot autour de (0,0,0)
const pivot = new THREE.Group();
pivot.position.set(0,0,0); // point autour duquel tu veux tourner
pivot.name = "pivot";
scene.add(pivot);
let mixer;

const loader2 = makeGLTFLoader();

loader2.load('public/projecteur4.glb', (gltf)=>{
    const projector = gltf.scene;
    projector.name = "bridge_shell";   // la coque de la passerelle + hangar (toujours affichée)
    projector.position.set(0,-12, 98.5);
    projector.scale.set(10,10,10);
    projector.rotation.y = Math.PI; // faire face à la caméra
    worldGroup.add(projector);
});


const loader3 = makeGLTFLoader();

loader3.load('public/star_destroyer2.glb', (gltf)=>{

    const star_destroyer = gltf.scene;

    star_destroyer.position.set(0, 10, 1100);   // orbite 900 → 1100 : à 900 il frôlait/traversait le gros destroyer du décor
    star_destroyer.scale.set(30,30,30);
    star_destroyer.rotation.y = -Math.PI;

    pivot.add(star_destroyer);



const star_destroyer2 = star_destroyer.clone();
star_destroyer2.position.set(0, 20, -1100);
star_destroyer2.scale.set(30,30,30);
star_destroyer2.rotation.y = Math.PI;
pivot.add(star_destroyer2);

});

// ===================================================================
// SUPER STAR DESTROYER (Executor) — le vaisseau du joueur, vu de dehors
// ===================================================================
// Remplace les 2 anciens décors (star_destroyer0 vu depuis la passerelle +
// star_destroyer_tower2 vu en vol). Le modèle a été aligné dans Blender sur la
// passerelle : il prend donc EXACTEMENT la même transformation que projecteur4.
// - All_Tower : la tourelle qui contient la passerelle → cachée quand on est dedans
// - MainHull  : coque simplifiée (≈700 triangles) → sert aux collisions en vol
const loader4 = makeGLTFLoader();
let executor = null;
let executorTower = null;
const towerExtras = [];
const exteriorColliders = [];

loader4.load('public/star_executor_web.glb', (gltf) => {
    executor = gltf.scene;
    executor.position.set(0, -12, 98.5);
    executor.scale.set(10, 10, 10);
    executor.rotation.y = Math.PI;
    scene.add(executor);

    executor.traverse(o => {
        if (o.name === 'All_Tower' && !executorTower) executorTower = o;
        // panneaux lumineux collés devant les fenêtres du pont (hors du groupe All_Tower) :
        // ils se cachent / s'affichent avec la tourelle
        if (/^TowerGreebles1/.test(o.name)) towerExtras.push(o);
        if (o.isMesh && /^MainHull/.test(o.name)) exteriorColliders.push(o);
    });
    towerExtras.forEach(o => { o.visible = false; });
    executor.updateMatrixWorld(true);
    hangarCut.toLocal.value.copy(executor.matrixWorld).invert();
    if (executorTower) {
        executorTower.traverse(o => {
            if (!o.isMesh) return;
            exteriorColliders.push(o);
            hangarCut.towerMeshes.add(o);
            // on ne creuse que la coque : les lumières de l'entrée du hangar restent visibles
            if (/ScratchedMetal/.test(o.material.name)) carveHangarExit(o);
        });
        executorTower.visible = false;
    }

    // texture de coque projetée (les UV n'ont pas été dépliés après la décimation)
    const done = new Set();
    executor.traverse(o => {
        if (!o.isMesh || !/ScratchedMetal/.test(o.material.name) || done.has(o.material)) return;
        applyTriplanar(o.material);
        done.add(o.material);
    });
});

// -------------------------------------------------------------------
// Texture "triplanaire" de la coque de l'Executor
// -------------------------------------------------------------------
// Le modèle décimé n'a pas d'UV dépliés : la texture de métal serait étirée n'importe
// comment. À la place, le shader la projette selon les 3 axes (dessus / côtés / avant)
// et mélange d'après l'orientation de chaque face. Pas besoin d'UV, taille constante.
const EXECUTOR_TEX_SIZE = 8;   // taille d'un carreau de texture, en unités du modèle (×10 dans la scène)

function applyTriplanar(material) {
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
    material.onBeforeCompile = (shader, renderer) => {
        if (previous) previous(shader, renderer);
        shader.uniforms.uTriToLocal = hangarCut.toLocal;          // monde → repère de l'Executor
        shader.uniforms.uTriScale = { value: 1 / EXECUTOR_TEX_SIZE };
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform mat4 uTriToLocal;\nvarying vec3 vTriPos;\nvarying vec3 vTriN;')
            .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvTriN = normalize(mat3(uTriToLocal) * mat3(modelMatrix) * objectNormal);')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTriPos = (uTriToLocal * modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform float uTriScale;\nvarying vec3 vTriPos;\nvarying vec3 vTriN;')
            .replace('#include <map_fragment>', `
                vec3 triW = pow(abs(normalize(vTriN)), vec3(4.0));
                triW /= (triW.x + triW.y + triW.z);
                vec3 triP = vTriPos * uTriScale;
                #ifdef USE_MAP
                    diffuseColor *= texture2D(map, triP.zy) * triW.x
                                  + texture2D(map, triP.xz) * triW.y
                                  + texture2D(map, triP.xy) * triW.z;
                #endif`)
            .replace('#include <roughnessmap_fragment>', `
                float roughnessFactor = roughness;
                #ifdef USE_ROUGHNESSMAP
                    roughnessFactor *= texture2D(roughnessMap, triP.zy).g * triW.x
                                     + texture2D(roughnessMap, triP.xz).g * triW.y
                                     + texture2D(roughnessMap, triP.xy).g * triW.z;
                #endif`)
            .replace('#include <metalnessmap_fragment>', `
                float metalnessFactor = metalness;
                #ifdef USE_METALNESSMAP
                    metalnessFactor *= texture2D(metalnessMap, triP.zy).b * triW.x
                                     + texture2D(metalnessMap, triP.xz).b * triW.y
                                     + texture2D(metalnessMap, triP.xy).b * triW.z;
                #endif`);
    };
    material.customProgramCacheKey = () => previousKey + '|triplanar';
    material.needsUpdate = true;
}

// -------------------------------------------------------------------
// Sortie du hangar à travers l'arrière de la tourelle
// -------------------------------------------------------------------
// La tourelle se prolonge ~80 unités derrière la bouche du hangar : on y creuse
// un tunnel (dans le shader) et les collisions ignorent cette zone.
// Boîte exprimée dans le repère de l'Executor (= repère de la passerelle) :
// bouche du hangar : x ±2.67, y -0.03 → 2.32, fin à z = 19.08
const hangarCut = {
    min: new THREE.Vector3(-2.9, -0.3, 18.6),   // à peine plus grand que la bouche du hangar
    max: new THREE.Vector3(2.9, 2.6, 40),
    toLocal: { value: new THREE.Matrix4() },   // monde → repère de l'Executor
    towerMeshes: new Set()
};

function carveHangarExit(mesh) {
    const mat = mesh.material.clone();
    mat.side = THREE.DoubleSide;
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uToLocal = hangarCut.toLocal;
        shader.uniforms.uCutMin = { value: hangarCut.min };
        shader.uniforms.uCutMax = { value: hangarCut.max };
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform mat4 uToLocal;\nvarying vec3 vCutPos;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCutPos = (uToLocal * modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 uCutMin;\nuniform vec3 uCutMax;\nvarying vec3 vCutPos;')
            .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
                if (all(greaterThan(vCutPos, uCutMin)) && all(lessThan(vCutPos, uCutMax))) discard;`)
            .replace('#include <dithering_fragment>', `#include <dithering_fragment>
                if (!gl_FrontFacing) gl_FragColor.rgb *= 0.25;   // intérieur de la tourelle, dans l'ombre`);
    };
    mat.customProgramCacheKey = () => 'hangar-cut';
    mesh.material = mat;
}

// un impact dans le tunnel de sortie ne compte pas comme une collision
function inHangarCut(hit) {
    if (!hangarCut.towerMeshes.has(hit.object)) return false;
    const p = hit.point.clone().applyMatrix4(hangarCut.toLocal.value);
    return p.x > hangarCut.min.x - 0.3 && p.x < hangarCut.max.x + 0.3 &&
           p.y > hangarCut.min.y - 0.3 && p.y < hangarCut.max.y + 0.3 &&
           p.z > hangarCut.min.z - 0.3;
}

// Tourelle visible seulement quand la caméra est vraiment dehors
// (en sortant du hangar, on traverse encore la tourelle sur ~80 unités)
const _camPos = new THREE.Vector3();
// Le tunnel À L'INTÉRIEUR de la tourelle (repère de l'Executor : la tourelle finit à z = 26.9)
const towerTunnel = new THREE.Box3(new THREE.Vector3(-2.9, -0.3, 16), new THREE.Vector3(2.9, 2.6, 27.2));
const _camLocal = new THREE.Vector3();

function updateExecutorTower() {
    if (!executorTower) return;
    camera.getWorldPosition(_camPos);
    _camLocal.copy(_camPos).applyMatrix4(hangarCut.toLocal.value);
    // même déclencheur que le cockpit (isInsideShip) ; en plus, cachée pendant
    // la courte traversée du tunnel à l'intérieur de la tourelle
    const show = !isInsideShip && !towerTunnel.containsPoint(_camLocal);
    executorTower.visible = show;
    for (const o of towerExtras) o.visible = show;
}

// ===================================================================
// BALISE D'ATTERRISSAGE + PILOTE AUTOMATIQUE (entrée / sortie du hangar)
// ===================================================================
// 3 cadres holographiques devant le hangar. En entrant dans la zone en volant
// vers le vaisseau, le pilote automatique fait entrer le TIE dans le hangar.
// À la sortie du hangar, il fait traverser le tunnel de la tourelle.
const HANGAR_OUTSIDE = new THREE.Vector3(0, 3.5, -250);   // point de sortie, derrière la tourelle (z ≈ -170)
const HANGAR_INSIDE  = new THREE.Vector3(0, 3.5, -62);    // dans le hangar, juste passé le détecteur
const LANDING_ZONE   = new THREE.Box3(new THREE.Vector3(-70, -35, -345), new THREE.Vector3(70, 45, -185));

const landingBeacon = new THREE.Group();
{
    const shape = new THREE.Shape();
    shape.moveTo(-32, -18); shape.lineTo(32, -18); shape.lineTo(32, 18); shape.lineTo(-32, 18); shape.lineTo(-32, -18);
    const hole = new THREE.Path();
    hole.moveTo(-29, -15); hole.lineTo(-29, 15); hole.lineTo(29, 15); hole.lineTo(29, -15); hole.lineTo(-29, -15);
    shape.holes.push(hole);
    const frameGeo = new THREE.ShapeGeometry(shape);
    const fillGeo = new THREE.PlaneGeometry(58, 30);
    [-200, -260, -320].forEach((z, i) => {
        const mat = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const fill = new THREE.MeshBasicMaterial({ color: 0x3388ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const frame = new THREE.Mesh(frameGeo, mat);
        frame.add(new THREE.Mesh(fillGeo, fill));
        frame.position.set(0, 3.5, z);
        frame.userData.index = i;
        landingBeacon.add(frame);
    });
    landingBeacon.visible = false;
    scene.add(landingBeacon);
}

const autopilot = { active: false, t: 0, duration: 2, curve: null, yawFrom: 0, yawTo: 0 };

function startAutopilot(points, yawTo, duration) {
    autopilot.active = true;
    autopilot.t = 0;
    autopilot.duration = duration;
    autopilot.curve = new THREE.CatmullRomCurve3(points);
    autopilot.yawFrom = player.rotation.y;
    // chemin angulaire le plus court
    let d = (yawTo - autopilot.yawFrom) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    autopilot.yawTo = autopilot.yawFrom + d;
    fireHeldSpace = false;
    fireHeldMouse = false;
}

function updateAutopilot(dt) {
    autopilot.t = Math.min(1, autopilot.t + dt / autopilot.duration);
    const e = autopilot.t * autopilot.t * (3 - 2 * autopilot.t);          // départ et arrivée en douceur
    player.position.copy(autopilot.curve.getPoint(e));
    player.rotation.y = autopilot.yawFrom + (autopilot.yawTo - autopilot.yawFrom) * Math.min(1, e * 1.6);
    // remise à plat du TIE
    const k = 1 - Math.exp(-5 * dt);
    flightPitch += (0 - flightPitch) * k;
    flightRoll += (0 - flightRoll) * k;
    rotationVelocity = 0;
    camera.rotation.x = flightPitch;
    camera.rotation.z = flightRoll;
    if (autopilot.t >= 1) autopilot.active = false;
}

function updateLanding(dt) {
    // balise visible seulement en vol, lumières qui défilent vers le hangar
    landingBeacon.visible = !isInsideShip;
    if (landingBeacon.visible) {
        const t = performance.now() * 0.001;
        landingBeacon.children.forEach(f => {
            const phase = (t * 1.5 - (2 - f.userData.index) * 0.33) % 1;
            f.material.opacity = 0.25 + 0.75 * Math.pow(Math.max(0, Math.cos(phase * Math.PI * 2)), 4);
        });
    }
    if (autopilot.active || isInsideShip) return;

    // dans la zone ET en direction du vaisseau → atterrissage automatique
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    if (LANDING_ZONE.containsPoint(player.position) && fwd.z > 0.3) {
        startAutopilot([player.position.clone(), new THREE.Vector3(0, 3.5, -200), HANGAR_INSIDE.clone()], Math.PI, 2.6);
    }
}

const loader5 = makeGLTFLoader();
const mixers = []; // tableau global pour stocker les mixers des deathtroopers


loader5.load('public/stormtrooper2.glb', (gltf) => {
    // Premier
    const stormtrooper1 = gltf.scene;
    stormtrooper1.position.set(35, -12, 35);
    stormtrooper1.scale.set(5,5,5);
    stormtrooper1.rotation.y = -Math.PI/2;
    worldGroup.add(stormtrooper1);

    const mixer1 = new THREE.AnimationMixer(stormtrooper1);
    mixer1.clipAction(gltf.animations[0]).play();

    // Second clone ANIMABLE
    const stormtrooper2 = SkeletonUtils.clone(stormtrooper1); // ✅ clone correct pour squelette
    stormtrooper2.position.set(-35, -12, 35);
    stormtrooper2.rotation.y = Math.PI/2;
    worldGroup.add(stormtrooper2);

    const mixer2 = new THREE.AnimationMixer(stormtrooper2);
    mixer2.clipAction(gltf.animations[0]).play();

     // 3eme clone ANIMABLE
    const stormtrooper3 = SkeletonUtils.clone(stormtrooper1); // ✅ clone correct pour squelette
    stormtrooper3.position.set(-25, -12, -30);
    stormtrooper3.rotation.y = Math.PI/8;
    worldGroup.add(stormtrooper3);

    const mixer3 = new THREE.AnimationMixer(stormtrooper3);
    mixer3.clipAction(gltf.animations[0]).play();

    // 4eme clone ANIMABLE
    const stormtrooper4 = SkeletonUtils.clone(stormtrooper1); // ✅ clone correct pour squelette
    stormtrooper4.position.set(25, -12, -30);
    stormtrooper4.rotation.y = -Math.PI/8;
    worldGroup.add(stormtrooper4);

    const mixer4 = new THREE.AnimationMixer(stormtrooper4);
    mixer4.clipAction(gltf.animations[0]).play();

    mixers.push(mixer1, mixer2,mixer3,mixer4);


});

const loader6 = makeGLTFLoader();

loader6.load('public/k2so.glb', (gltf) => {
    // Premier
    const k2so1 = gltf.scene;
    k2so1.position.set(50, -12, 15);
    k2so1.scale.set(8,8,8);
    k2so1.rotation.y = Math.PI/2;
    worldGroup.add(k2so1);

    const mixer1 = new THREE.AnimationMixer(k2so1);
    mixer1.clipAction(gltf.animations[0]).play();

    console.log(gltf.animations);



// Second clone ANIMABLE
    const k2so2 = SkeletonUtils.clone(k2so1); // ✅ clone correct pour squelette
    k2so2.position.set(-50, -12, -15);
    k2so2.rotation.y = -Math.PI/2;
    worldGroup.add(k2so2);

    const mixer2 = new THREE.AnimationMixer(k2so2);
    mixer2.clipAction(gltf.animations[0]).play();

    mixers.push(mixer1, mixer2)
});

const loader7 = makeGLTFLoader();

loader7.load('public/officer.glb', (gltf) => {
    // Premier
    const officer1 = gltf.scene;
    officer1.position.set(60, -12, 80);
    officer1.scale.set(12,12,12);
    //officer1.rotation.y = -Math.PI;
    worldGroup.add(officer1);


    const mixer1 = new THREE.AnimationMixer(officer1);
    mixer1.clipAction(gltf.animations[0]).play();

    // Second clone ANIMABLE
    const officer2 = SkeletonUtils.clone(officer1); // ✅ clone correct pour squelette
    officer2.position.set(-33, -12, 123);
    officer2.rotation.y = -Math.PI/4;
    worldGroup.add(officer2);



    const mixer2 = new THREE.AnimationMixer(officer2);
    mixer2.clipAction(gltf.animations[0]).play();

      // 3eme clone ANIMABLE
    const officer3 = SkeletonUtils.clone(officer1); // ✅ clone correct pour squelette
    officer3.position.set(-15, -30, 93);
    officer3.rotation.y = -Math.PI;
    worldGroup.add(officer3);



    const mixer3 = new THREE.AnimationMixer(officer3);
    mixer3.clipAction(gltf.animations[0]).play();

    // 4eme clone ANIMABLE
    const officer4 = SkeletonUtils.clone(officer1); // ✅ clone correct pour squelette
    officer4.position.set(-15, -30, 75);
    worldGroup.add(officer4);

    const mixer4 = new THREE.AnimationMixer(officer4);
    mixer4.clipAction(gltf.animations[0]).play();

    // 5eme clone ANIMABLE
    const officer5 = SkeletonUtils.clone(officer1); // ✅ clone correct pour squelette
    officer5.position.set(-25, -30, 70);
    officer5.rotation.y = -Math.PI/2
    worldGroup.add(officer5);

    const mixer5 = new THREE.AnimationMixer(officer5);
    mixer5.clipAction(gltf.animations[0]).play();

    // 6eme clone ANIMABLE
    const officer6 = SkeletonUtils.clone(officer1); // ✅ clone correct pour squelette
    officer6.position.set(15, -30, 93);
    officer6.rotation.y = Math.PI;
    worldGroup.add(officer6);

    const mixer6 = new THREE.AnimationMixer(officer6);
    mixer6.clipAction(gltf.animations[0]).play();

    // 7eme clone ANIMABLE
    const officer7 = SkeletonUtils.clone(officer1); // ✅ clone correct pour squelette
    officer7.position.set(15, -30, 75);
    worldGroup.add(officer7);

    const mixer7 = new THREE.AnimationMixer(officer7);
    mixer7.clipAction(gltf.animations[0]).play();

    // 8eme clone ANIMABLE
    const officer8 = SkeletonUtils.clone(officer1); // ✅ clone correct pour squelette
    officer8.position.set(25, -30, 70);
    officer8.rotation.y = Math.PI/2;
    worldGroup.add(officer8);

    const mixer8 = new THREE.AnimationMixer(officer8);
    mixer8.clipAction(gltf.animations[0]).play();

    // 9eme clone ANIMABLE
    const officer9 = SkeletonUtils.clone(officer1); // ✅ clone correct pour squelette
    officer9.position.set(-25, -30, 85);
    officer9.rotation.y = -Math.PI/2
    worldGroup.add(officer9);

    const mixer9 = new THREE.AnimationMixer(officer9);
    mixer9.clipAction(gltf.animations[0]).play();

    // 10eme clone ANIMABLE
    const officer10 = SkeletonUtils.clone(officer1); // ✅ clone correct pour squelette
    officer10.position.set(16, -28, 50);
    officer10.rotation.y = -Math.PI/2
    worldGroup.add(officer10);

    //const helper = new THREE.BoxHelper(officer10, 0xff0000);
    //worldGroup.add(helper);

    const mixer10 = new THREE.AnimationMixer(officer10);
    mixer10.clipAction(gltf.animations[0]).play();


    mixers.push(mixer1,mixer2,mixer3,mixer4,mixer5,mixer6,mixer7,mixer8,mixer9,mixer10)

});

const ctrlscreen = document.createElement("video");
ctrlscreen.src = "public/controlscreen.mp4";
ctrlscreen.loop = true;
ctrlscreen.muted = true;

const ctrlTexture = new THREE.VideoTexture(ctrlscreen);

const ctrlMaterial = new THREE.MeshBasicMaterial({
    map: ctrlTexture,
    transparent: true,
    opacity: 0, // écran invisible au départ
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
});

const ctrlPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 6),
    ctrlMaterial
);

ctrlPlane.position.set(0, 5.3, 142);
ctrlPlane.rotation.y = Math.PI;
ctrlPlane.rotation.x = -Math.PI / 12;
ctrlPlane.scale.x = 0;

scene.add(ctrlPlane);







let hyperbouton;

const loader8 = makeGLTFLoader();

loader8.load('public/hyperbouton.glb', (gltf)=>{
    hyperbouton = gltf.scene;
    hyperbouton.position.set(0,-12, 98.5);
    hyperbouton.scale.set(10,10,10);
    hyperbouton.rotation.y = Math.PI;
    hyperbouton.traverse(obj => {
    if (obj.isMesh) {
        console.log("Mesh trouvé :", obj.name);
    }
});
    worldGroup.add(hyperbouton);
});




const loader9 = makeGLTFLoader();

loader9.load('public/hyperscreen.glb', (gltf) => {
    hyperscreen = gltf.scene;
    // Écran agrandi ×21 (mêmes proportions qu'avant : 50 × 150 × 70) pour englober TOUT l'Executor :
    // l'avant du vaisseau reste visible depuis le pont, devant le tunnel d'hyperespace.
    // Hauteur et largeur augmentées pour que le bord (ouvert) de l'écran reste hors du champ de vision.
    // Boîte obtenue : x ±29 800, y -23 200 → 23 200 (centrée sur les yeux), z -19 300 → 21 200
    // (proue de l'Executor à z ≈ 20 000 ; coin le plus lointain ≈ 43 000 < far 50 000).
    hyperscreen.position.set(0, -11664, 2500);
    hyperscreen.scale.set(1700, 5437, 1470);
    hyperscreen.rotation.y = Math.PI;

    hyperscreen.traverse(obj => {
        if(obj.isMesh){
            screenMaterial = new THREE.MeshBasicMaterial({ // ⚡ récupéré ici
                map: videoTexture,
                transparent: true,
                opacity: 0,
                depthWrite: false,   // invisible la plupart du temps : ne doit rien masquer derrière lui
                side: THREE.DoubleSide
            });
            obj.material = screenMaterial;
        }
    });

    worldGroup.add(hyperscreen);
});




const loader10 = makeGLTFLoader();
let doorleft, doorright;
let doorState = 0; // 0 = fermé, 1 = ouvert

loader10.load('public/doorleft.glb', (gltf)=>{
    doorleft = gltf.scene; //
    doorleft.position.set(-12,-12, 233);
    doorleft.scale.set(10,10,10);
    doorleft.rotation.y = Math.PI; 
    worldGroup.add(doorleft);
});

const loader11 = makeGLTFLoader();

loader11.load('public/doorright.glb', (gltf)=>{
    doorright = gltf.scene; //
    doorright.position.set(12,-12, 233);
    doorright.scale.set(10,10,10);
    doorright.rotation.y = Math.PI; 
    worldGroup.add(doorright);
});

let detectionMesh;
const gltfLoader = makeGLTFLoader();

gltfLoader.load('public/shipDetection.glb', (gltf) => {
    detectionMesh = gltf.scene;
    detectionMesh.position.set(0,-12, 100);
    detectionMesh.scale.set(10,9,8.5);
    detectionMesh.rotation.y = Math.PI; 
    scene.add(detectionMesh);
    detectionMesh.visible = false;
});



gltfLoader.load('public/cage.glb', (gltf) => {
    const ship = gltf.scene;
    collisionShip = ship;
    ship.position.set(0, -12, 98.5);
    ship.scale.set(10, 10, 10);
    ship.rotation.y = Math.PI;
    scene.add(ship);
    ship.updateMatrixWorld(true);

    ship.traverse(obj => {
        if (obj.isMesh) {
            if (obj.name === "COLLISION_MESH") {
               collisionMeshInterior  = obj;
                console.log('✅ Intérieur:', obj.name);
            } else if (obj.name === "COLLISION_MESH_EXTERIOR") {
                collisionMeshExterior = obj;
                console.log('✅ Extérieur:', obj.name);
            }
            obj.material = new THREE.MeshBasicMaterial({
                visible: false,
                side: THREE.DoubleSide,
            });
        }
    });

    // ✅ TOUT le reste reste DANS le callback
    if (!collisionMeshExterior && !collisionMeshInterior) {
        console.warn('⚠️ Aucun mesh nommé trouvé');
    }

    console.log('Intérieur:', collisionMeshInterior?.name);
    console.log('Extérieur:', collisionMeshExterior?.name);

}); // ← une seule fermeture ici
    
    // Debug visuel
    [collisionMeshInterior, collisionMeshExterior].forEach((mesh, index) => {
        if (mesh) {
            const color = index === 0 ? 0xff0000 : 0x00ff00;
            mesh.visible = true;
            mesh.traverse(obj => {
                if (obj.isMesh) {
                    obj.material = new THREE.MeshBasicMaterial({
                        color: color,
                        wireframe: false,
                        transparent: true,
                        opacity: 0.3,
                        side: THREE.DoubleSide // Force la détection des deux côtés
                    });
                }
            });
        }
    });

// (l'ancienne tour extérieure star_destroyer_tower2.glb est remplacée par l'Executor)

gltfLoader.load('public/tieplayer.glb', (gltf) => {
    tiePlayer1 = gltf.scene;
    tiePlayer1.position.set(0, -1, -70);
    tiePlayer1.scale.set(2,2,2);
    tiePlayer1.rotation.y = Math.PI; 
    scene.add(tiePlayer1);
    tieLoaded = true;
    checkGameReady();
    addShip(tiePlayer1);
});

gltfLoader.load('public/tiefighter.glb', (gltf) => {
    tiefighter = gltf.scene;
    tiefighter.position.set(0, -1, -70);
    tiefighter.scale.set(0.02,0.02,0.02);
    tiefighter.rotation.y = Math.PI; 
    scene.add(tiefighter);
    tieLoaded = true;
    checkGameReady();
    addShip(tiefighter);

    const tiefighter2 = tiefighter.clone();
    tiefighter2.position.set(12, 15, -70);
    scene.add(tiefighter2);

    const tiefighter3 = tiefighter.clone();
    tiefighter3.position.set(12, 15, -58);
    scene.add(tiefighter3);

    const tiefighter4 = tiefighter.clone();
    tiefighter4.position.set(0, 15, -70);
    scene.add(tiefighter4);

    const tiefighter5 = tiefighter.clone();
    tiefighter5.position.set(0, 15, -58);
    scene.add(tiefighter5);

    const tiefighter6 = tiefighter.clone();
    tiefighter6.position.set(-12, 15, -70);
    scene.add(tiefighter6);

    const tiefighter7 = tiefighter.clone();
    tiefighter7.position.set(-12, 15, -58);
    scene.add(tiefighter7);
});


gltfLoader.load('public/tieinter.glb', (gltf) => {
    tieinterceptor = gltf.scene;
    tieinterceptor.position.set(0, -1, -70);
    tieinterceptor.scale.set(2,2,2);
    tieinterceptor.rotation.y = Math.PI; 
    scene.add(tieinterceptor);
    tieLoaded = true;
    checkGameReady();
    addShip(tieinterceptor);

});

gltfLoader.load('public/tiesilencer.glb', (gltf) => {
    tiesilencer = gltf.scene;
    tiesilencer.position.set(0, -1, -70);
    tiesilencer.scale.set(6,6,6);
    tiesilencer.rotation.y = Math.PI; 
    scene.add(tiesilencer);
    tieLoaded = true;
    checkGameReady();
    addShip(tiesilencer);
});

let screenhangar;

gltfLoader.load('public/screenhangar.glb', (gltf) => {
    screenhangar = gltf.scene;
    screenhangar.position.set(-22, -12, -73);
    screenhangar.scale.set(6,6,6);
    screenhangar.rotation.y = Math.PI/2;
    scene.add(screenhangar);
    checkGameReady();

    // matériaux propres à la console (pour les faire clignoter)
    screenhangar.traverse(o => {
        if (!o.isMesh || !o.material.emissive) return;
        o.material = o.material.clone();
        const n = o.material.name;
        hangarConsole.mats.push({
            mat: o.material,
            kind: /Red/.test(n) ? 'red' : /Blue/.test(n) ? 'blue' : 'screen',
            base: o.material.emissiveIntensity
        });
    });
    // petite lumière qui éclaire le sol autour de la console
    hangarConsole.light = new THREE.PointLight(0x66aaff, 0, 45, 2);
    hangarConsole.light.position.set(-17, -2, -73);
    scene.add(hangarConsole.light);
    // (pas de bloom sur la console : l'écran devenait illisible)
});

// ===================================================================
// CONSOLE DE CHOIX DU TIE : clignote, réagit au survol et au clic
// ===================================================================
const hangarConsole = { mats: [], light: null, hover: false, flash: 0, press: 0, t: 0 };
const consoleRay = new THREE.Raycaster();

function updateHangarConsole(dt) {
    if (!screenhangar) return;
    const hc = hangarConsole;
    hc.t += dt;

    // survol (seulement à pied, à proximité)
    const near = isInsideShip && player.position.distanceTo(screenhangar.position) < 90;
    let hover = false;
    if (near) {
        consoleRay.setFromCamera(mouse, camera);
        hover = consoleRay.intersectObject(screenhangar, true).length > 0;
    }
    if (hover !== hc.hover) {
        hc.hover = hover;
        if (!hud.mode) renderer.domElement.style.cursor = hover ? 'pointer' : '';
    }

    hc.flash = Math.max(0, hc.flash - dt * 2.5);
    hc.press = Math.max(0, hc.press - dt * 5);

    // pulsation "regarde-moi !" + boost au survol + flash au clic
    const pulse = 0.5 + 0.5 * Math.sin(hc.t * 4);
    const blink = Math.sin(hc.t * 6) > 0;
    const boost = (hover ? 1.8 : 1) + hc.flash * 4;
    for (const m of hc.mats) {
        if (m.kind === 'screen') m.mat.emissiveIntensity = m.base * (0.55 + 0.75 * pulse) * boost;
        else if (m.kind === 'red') m.mat.emissiveIntensity = m.base * (blink ? 3 : 0.2) * boost;
        else m.mat.emissiveIntensity = m.base * (blink ? 0.2 : 3) * boost;
    }
    if (hc.light) hc.light.intensity = (150 + 250 * pulse) * boost;

    // léger grossissement au survol, "bouton pressé" au clic
    const s = 6 * (hover ? 1.04 : 1) * (1 - 0.05 * Math.sin(hc.press * Math.PI));
    screenhangar.scale.setScalar(s);
}

let hangaracc1;

gltfLoader.load('public/hangaracc1.glb', (gltf) => {
    hangaracc1 = gltf.scene;
    hangaracc1.position.set(20, -12, -75);
    hangaracc1.scale.set(4, 4, 4);
    hangaracc1.rotation.y = Math.PI / 1.8;
    scene.add(hangaracc1);
    checkGameReady();


    const hangaracc2 = hangaracc1.clone();
    hangaracc2.position.set(20, -12, -68);
    hangaracc2.rotation.y = Math.PI / 2.1;
    scene.add(hangaracc2);
});


function addShip(ship) {

    ships.push(ship);
    ship.visible = false;

    // premier vaisseau
    if (ships.length === 1) {
        ship.visible = true;
        tiePlayer = ship;
        tiePlayer.userData.baseY = -1;
    }
}







gltfLoader.load('public/cockpit.glb', (gltf) => {
    cockpit = gltf.scene;
    cockpit.visible = false;
    camera.add(cockpit);
    cockpit.position.set(0, 0, -1);
    cockpit.scale.set(3,3,1);
    cockpit.rotation.y = Math.PI;
    cockpitLoaded = true;
    checkGameReady();
});

function checkGameReady() {
    if (tieLoaded && cockpitLoaded) {
        gameReady = true;
        console.log("GAME READY");
    }
}

const loader12 = makeGLTFLoader();

loader12.load('public/tie_fighter0.glb', (gltf) => {
    // Premier
    const tiefighter0 = gltf.scene;
    tiefighter0.name = "tie_fighter0";
    tiefighter0.position.set(0, -12, 98.5);
    tiefighter0.scale.set(8,8,8);
    tiefighter0.rotation.y = -Math.PI;
    worldGroup.add(tiefighter0);
    objectsToFade.push(tiefighter0);
    console.log(gltf.animations);


    const mixer1 = new THREE.AnimationMixer(tiefighter0);
    mixer1.clipAction(gltf.animations[0]).play();

    if (gltf.animations.length > 0) {
        const action = mixer1.clipAction(gltf.animations[0]);
        action.play();
        mixer1.alwaysUpdate = true;   // visible aussi de dehors
        mixers.push(mixer1);
}

});

const loader13 = makeGLTFLoader();

loader13.load('public/droid1.glb', (gltf) => {
    // Premier
    const droid1 = gltf.scene;
    droid1.position.set(0, -12, 98.5);
    droid1.scale.set(10,10,10);
    droid1.rotation.y = -Math.PI;
    worldGroup.add(droid1);
    // le droïde R5 se déplace (animation de son nœud racine) : on suit un de ses morceaux
    droidBody = droid1.getObjectByName('Object_8');
    console.log(gltf.animations);


    const mixer1 = new THREE.AnimationMixer(droid1);
    mixer1.clipAction(gltf.animations[0]).play();

    if (gltf.animations.length > 0) {
        const mixer1 = new THREE.AnimationMixer(droid1);
        const action = mixer1.clipAction(gltf.animations[0]);
        action.play();
        mixers.push(mixer1);
}

});

loader13.load('public/bb9.glb', (gltf) => {
    // Premier
    const bb9 = gltf.scene;
    bb9.position.set(0, -12, 98.5);
    bb9.scale.set(10,10,10);
    bb9.rotation.y = -Math.PI;
    worldGroup.add(bb9);
    console.log(gltf.animations);


    const mixer1 = new THREE.AnimationMixer(bb9);
    mixer1.clipAction(gltf.animations[0]).play();

    if (gltf.animations.length > 0) {
        const mixer1 = new THREE.AnimationMixer(bb9);
        const action = mixer1.clipAction(gltf.animations[0]);
        action.play();
        mixers.push(mixer1);
}

});




let Table_3_Button_Panel_0;
let Table_3_Button_Red_0;
let Table_3_Button_Blue_0;

loader13.load('public/Table_3_Button_Panel_0.glb', (gltf) => {
    Table_3_Button_Panel_0 = gltf.scene;
    Table_3_Button_Panel_0.position.set(0, -12, 98.5);
    Table_3_Button_Panel_0.scale.set(10,10,10);
    Table_3_Button_Panel_0.rotation.y = -Math.PI;
    scene.add(Table_3_Button_Panel_0);
    
});



// Appelle initButtonColors après le chargement
loader13.load('public/Table_3_Button_Red_0.glb', (gltf) => {
    Table_3_Button_Red_0 = gltf.scene;
    Table_3_Button_Red_0.position.set(0, -12, 98.5);
    Table_3_Button_Red_0.scale.set(10,10,10);
    Table_3_Button_Red_0.rotation.y = -Math.PI;
    scene.add(Table_3_Button_Red_0);
    
    // Initialise les couleurs et récupère les meshes
    initButtonColors();
});



// Variables pour l'animation du chenillard
let chaseTime = 0;
let chaseActive = false;
const chaseSpeed = 0.2; // Vitesse de changement (secondes entre chaque bouton)

// Fonction pour initialiser les couleurs des boutons
function initButtonColors() {
    if (!Table_3_Button_Red_0) return;
    
    // Récupère tous les meshes du bouton
    const buttonMeshes = [];
    Table_3_Button_Red_0.traverse(child => {
        if (child.isMesh) {
            buttonMeshes.push(child);
        }
    });
    
    // Stocke les meshes dans userData pour y accéder facilement
    Table_3_Button_Red_0.userData.buttonMeshes = buttonMeshes;
    
    // Initialise tous les boutons éteints
    resetAllButtons();
}

// Éteindre tous les boutons
function resetAllButtons() {
    if (!Table_3_Button_Red_0 || !Table_3_Button_Red_0.userData.buttonMeshes) return;
    
    Table_3_Button_Red_0.userData.buttonMeshes.forEach(mesh => {
        if (mesh.material) {
            mesh.material.emissive.setHex(0x220000); // Rouge très sombre
            mesh.material.emissiveIntensity = 0.2;
        }
    });
}

// Allumer un bouton spécifique
function lightUpButton(index, intensity = 2.0) {
    if (!Table_3_Button_Red_0 || !Table_3_Button_Red_0.userData.buttonMeshes) return;
    
    const meshes = Table_3_Button_Red_0.userData.buttonMeshes;
    if (index >= 0 && index < meshes.length) {
        meshes[index].material.emissive.setHSL(0.02, 1, 0.5); // Orange vif
        meshes[index].material.emissiveIntensity = intensity;
    }
}

// Animation du chenillard

function updateChaseSmooth(dt) {
    if (!chaseActive || !Table_3_Button_Red_0 || !Table_3_Button_Red_0.userData.buttonMeshes) return;
    
    const meshes = Table_3_Button_Red_0.userData.buttonMeshes;
    const buttonCount = meshes.length;
    
    chaseTime += dt * 2; // Vitesse du cycle
    
    // Calcule une valeur entre 0 et 2*PI qui avance
    const phase = chaseTime * Math.PI * 2;
    
    for (let i = 0; i < buttonCount; i++) {
        // Décale la phase pour chaque bouton
        const offset = (i / buttonCount) * Math.PI * 2;
        // Intensité sinusoidale (entre 0.2 et 3.0)
        const intensity = 1.5 + Math.sin(phase - offset) * 1.5;
        
        meshes[i].material.emissive.setHSL(0.03, 1, 0.3);
        meshes[i].material.emissiveIntensity = intensity;
    }
}

// Variables pour le bouton bleu
let blueChaseActive = true; 
let blueChaseTime = 0;

// Charge le bouton bleu
loader13.load('public/Table_3_Button_Blue_0.glb', (gltf) => {
    Table_3_Button_Blue_0 = gltf.scene;
    Table_3_Button_Blue_0.position.set(0, -12, 98.5);
    Table_3_Button_Blue_0.scale.set(10,10,10);
    Table_3_Button_Blue_0.rotation.y = -Math.PI;
    scene.add(Table_3_Button_Blue_0);
    
    // Récupère tous les meshes du bouton bleu
    const blueMeshes = [];
    Table_3_Button_Blue_0.traverse(child => {
        if (child.isMesh) {
            blueMeshes.push(child);
        }
    });
    Table_3_Button_Blue_0.userData.buttonMeshes = blueMeshes;
    
    // Initialise l'état éteint
    setBlueButtonState(false);
});

// Fonction pour allumer/éteindre le bouton bleu
function setBlueButtonState(active) {
    if (!Table_3_Button_Blue_0 || !Table_3_Button_Blue_0.userData.buttonMeshes) return;
    
    const meshes = Table_3_Button_Blue_0.userData.buttonMeshes;
    
    meshes.forEach(mesh => {
        if (active) {
            // HOLOGRAMME ACTIF : bouton allumé fixe
            mesh.material.emissive.setHSL(0.6, 1, 0.5); // Bleu vif
            mesh.material.emissiveIntensity = 2.0;
            mesh.material.color.setHSL(0.6, 1, 0.3);
        } else {
            // HOLOGRAMME ÉTEINT : bouton éteint (prêt pour le chase)
            mesh.material.emissive.setHSL(0.6, 1, 0.05); // Bleu très sombre
            mesh.material.emissiveIntensity = 0.2;
            mesh.material.color.setHSL(0.6, 1, 0.1);
        }
    });
}

// Animation chaseSmooth pour le bouton bleu (quand hologramme éteint)
function updateBlueChaseSmooth(dt) {
    if (!blueChaseActive || !Table_3_Button_Blue_0 || !Table_3_Button_Blue_0.userData.buttonMeshes) return;
    
    const meshes = Table_3_Button_Blue_0.userData.buttonMeshes;
    const buttonCount = meshes.length; // 6 boutons
    
    blueChaseTime += dt * 2.5; // Vitesse du cycle (un peu plus rapide pour le bleu)
    
    // Calcule une valeur entre 0 et 2*PI qui avance
    const phase = blueChaseTime * Math.PI * 2;
    
    for (let i = 0; i < buttonCount; i++) {
        // Décale la phase pour chaque bouton
        const offset = (i / buttonCount) * Math.PI * 2;
        // Intensité sinusoidale (entre 0.2 et 2.5)
        const intensity = 1.3 + Math.sin(phase - offset) * 1.1;
        
        meshes[i].material.emissive.setHSL(0.6, 1, 0.3); // Bleu
        meshes[i].material.emissiveIntensity = intensity;
        // Légère variation de couleur aussi
        meshes[i].material.color.setHSL(0.6, 1, 0.1 + intensity * 0.1);
    }
}

// ===========================================================
// BOUTONS BLANCS - Version avec gris foncé (pas noir complet)
// ===========================================================

let Back_Control_Panels_Button_White_0;
const whiteButtons = [];
const buttonStates = [];

// Charge le modèle
loader13.load('public/Back_Control_Panels_Button_White_0.glb', (gltf) => {
    Back_Control_Panels_Button_White_0 = gltf.scene;
    Back_Control_Panels_Button_White_0.position.set(0, -12, 98.5);
    Back_Control_Panels_Button_White_0.scale.set(10,10,10);
    Back_Control_Panels_Button_White_0.rotation.y = -Math.PI;
    scene.add(Back_Control_Panels_Button_White_0);
    
    // Récupère TOUS les boutons
    Back_Control_Panels_Button_White_0.traverse(child => {
        if (child.isMesh) {
            // Clone le matériau pour indépendance
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material = child.material.map(m => m.clone());
                } else {
                    child.material = child.material.clone();
                }
            }
            
            whiteButtons.push(child);
            
            // États avec valeurs ajustées
            buttonStates.push({
                intensity: 0.2 + Math.random() * 0.2,     // Gris foncé au départ (0.2-0.4)
                targetIntensity: 0.2 + Math.random() * 0.2,
                blinkSpeed: 2 + Math.random() * 4,
                nextChange: Math.random() * 2,
                phase: Math.random() * Math.PI * 2,
            });
            
            // Initialise en gris foncé
            if (child.material.emissive) {
                child.material.emissive.setHSL(0, 0, 0.15); // Gris foncé
                child.material.emissiveIntensity = 0.3;
            }
            if (child.material.color) {
                child.material.color.setHSL(0, 0, 0.2); // Gris moyen-foncé
            }
        }
    });
    
    console.log(`✨ ${whiteButtons.length} boutons blancs chargés (gris foncé)`);
});

function updateWhiteButtonsContrast(dt) {
    if (!whiteButtons.length) return;
    
    whiteButtons.forEach((button, index) => {
        const state = buttonStates[index];
        if (!state || !button.material) return;
        
        // Met à jour le minuteur
        state.nextChange -= dt;
        
        if (state.nextChange <= 0) {
            // 70% de chance de s'allumer
            if (Math.random() < 0.7) {
                state.targetIntensity = 3.0 + Math.random() * 3.0; // Lumineux (3-6)
            } else {
                state.targetIntensity = 0.25 + Math.random() * 0.3; // Gris foncé (0.25-0.55)
            }
            
            // Prochain changement
            state.nextChange = 0.4 + Math.random() * 2.6;
            state.blinkSpeed = 3 + Math.random() * 5;
        }
        
        // Transition
        state.intensity += (state.targetIntensity - state.intensity) * state.blinkSpeed * dt;
        
        // Micro-fluctuation
        const flicker = Math.sin(performance.now() * 0.02 + index) * 0.1;
        let finalIntensity = state.intensity + flicker;
        
        // Maintient dans des plages contrastées mais pas extrêmes
        if (state.targetIntensity < 0.6) {
            // Mode "éteint" : entre 0.2 et 0.6
            finalIntensity = Math.max(0.2, Math.min(0.6, finalIntensity));
        } else {
            // Mode "allumé" : entre 2.5 et 7
            finalIntensity = Math.max(2.5, Math.min(7, finalIntensity));
        }
        
        // Applique
        if (button.material.emissive) {
            button.material.emissiveIntensity = finalIntensity;
            
            // Couleur selon l'état
            if (finalIntensity > 1.5) {
                // Allumé : blanc légèrement bleuté
                button.material.emissive.setHSL(0.58, 0.4, 0.5);
            } else {
                // Éteint : gris foncé
                button.material.emissive.setHSL(0, 0, 0.15 + finalIntensity * 0.1);
            }
        }
    });
}

// Version avec plus de nuances (pour un effet encore plus réaliste)
function updateWhiteButtonsNuanced(dt) {
    if (!whiteButtons.length) return;
    
    whiteButtons.forEach((button, index) => {
        const state = buttonStates[index];
        if (!state || !button.material) return;
        
        state.nextChange -= dt;
        
        if (state.nextChange <= 0) {
            // Plus de variété dans les intensités
            const rand = Math.random();
            if (rand < 0.4) {
                state.targetIntensity = 0.3 + Math.random() * 0.3; // Gris foncé
            } else if (rand < 0.7) {
                state.targetIntensity = 1.5 + Math.random() * 1.5; // Mi-lumineux
            } else {
                state.targetIntensity = 4.0 + Math.random() * 2.0; // Très lumineux
            }
            
            state.nextChange = 0.5 + Math.random() * 3;
            state.blinkSpeed = 2 + Math.random() * 4;
        }
        
        // Transition en douceur
        state.intensity += (state.targetIntensity - state.intensity) * state.blinkSpeed * dt;
        
        // Petite fluctuation naturelle
        const breath = Math.sin(performance.now() * 0.01 + index * 10) * 0.1;
        const finalIntensity = Math.max(0.2, state.intensity + breath);
        
        // Applique
        if (button.material.emissive) {
            button.material.emissiveIntensity = finalIntensity;
            
            // Variation de couleur subtile selon l'intensité
            const hue = 0.55 + (finalIntensity * 0.01);
            const lightness = 0.15 + (finalIntensity * 0.05);
            button.material.emissive.setHSL(hue, 0.3, Math.min(0.5, lightness));
        }
    });
}
// =============================================
// BULLES INFO
// =============================================
// ================================
// BULLES INFO POUR THREE.JS
// ================================

// 1️⃣ Fonction pour créer une bulle HTML
function createInfoBubble(text, imageSrc) {

    const container = document.createElement("div");

    container.style.position = "fixed";
    container.style.left = "20px";
    container.style.bottom = "20px";
    container.style.width = "350px";

    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.gap = "15px";

    container.style.padding = "15px";
    container.style.background = "rgba(0,0,0,0.75)";
    container.style.borderRadius = "12px";
    container.style.color = "#FFE81F";
    container.style.fontFamily = "StarJedi, sans-serif";
    container.style.fontSize = "22px";
    container.style.pointerEvents = "none";
    container.style.display = "hidden";

    // bordure dégradée
    container.style.boxShadow = `
    0 0 10px rgba(255,232,31,0.4),
    0 0 20px rgba(255,232,31,0.2),
    inset 0 0 20px rgba(255,232,31,0.15)
    `;

    // image
    const img = document.createElement("img");
    img.src = imageSrc;
    img.style.width = "120px";
    img.style.height = "auto";
    img.style.marginRight = "15px";

    // texte
    const txt = document.createElement("div");
    txt.innerHTML = text.replace(/\n/g, "<br>");
    txt.style.flex = "1";
    txt.style.fontFamily = "StarJedi";

    container.appendChild(img);
    container.appendChild(txt);

    document.body.appendChild(container);

    return container;
}

// 2️⃣ Crée les bulles
const bubble1 = createInfoBubble(
`#<span style="background:rgba(255,232,31,0.3); padding:2px 4px;">HoLoGRAM</span>#
🟦 oN / oFF
🟥 NExT`,
"public/holoinfo.JPG"
);
const bubble2 = createInfoBubble(
`#<span style="background:rgba(255,232,31,0.3); padding:2px 4px;"> @</span>#
Click on 
SCREEN for 
PLAY FiLM`,
"public/screen1_off.webp"
);
const bubble3 = createInfoBubble(
`#<span style="background:rgba(255,232,31,0.3); padding:2px 4px;"> @</span>#
Click on 
SCREEN for 
PLAY FiLM`,
"public/screen3_off.jpeg"
);
const bubble4 = createInfoBubble(
`⬛ Map
⬜ Laser
🟥 ALARM
🟦 Hyperspace`,
"public/controlinfo.JPG"
);

// 3️⃣ Définit les zones 3D autour du joueur
const zones = [
    { pos: new THREE.Vector3(0, -6, -5), size: 25, bubble: bubble1 },
    { pos: new THREE.Vector3(-50, -6, 0), size: 20, bubble: bubble2 },
    { pos: new THREE.Vector3(50, -6, 0), size: 20, bubble: bubble2 },
    { pos: new THREE.Vector3(-50, -6, 60), size: 20, bubble: bubble3 },
    { pos: new THREE.Vector3(50, -6, 60), size: 20, bubble: bubble3 },
    { pos: new THREE.Vector3(0, -6, 145), size: 30, bubble: bubble4 }
];

const DEBUG_ZONES = false; // true = affiche les zones en rouge
if (DEBUG_ZONES) {
zones.forEach(zone => {
    const geo = new THREE.BoxGeometry(zone.size*2, zone.size*2, zone.size*2);
    const mat = new THREE.MeshBasicMaterial({color:0xff0000, wireframe:true});
    const cube = new THREE.Mesh(geo, mat);
    cube.position.copy(zone.pos);
    scene.add(cube);
});
}

// 4️⃣ Vérifie si le player est dans une zone
function checkZones() {

    // cacher toutes les bulles
    bubble1.style.visibility = "hidden";
    bubble2.style.visibility = "hidden";
    bubble3.style.visibility = "hidden";
    bubble4.style.visibility = "hidden";

    zones.forEach(zone => {

        const distance = player.position.distanceTo(zone.pos);

        if (distance < zone.size) {

            zone.bubble.style.visibility = "visible";

            // position en bas gauche (fixe)
            zone.bubble.style.left = "20px";
            zone.bubble.style.bottom = "20px";
        }

    });
}


//************************************************************************** */

// =====================================================
// ÉTINCELLES DE COLLISION COQUE - GPU FRIENDLY
// =====================================================

let lastCollisionTime = 0; // anti-spam
const COLLISION_COOLDOWN = 0.3; // secondes entre deux impacts

function createCollisionSparks(position, normal, moveDir = null) {
    // direction de glissement : le mouvement du TIE projeté sur la coque
    const slide = moveDir ? moveDir.clone().projectOnPlane(normal) : null;
    if (slide && slide.lengthSq() > 1e-6) slide.normalize();

    // flash + petit impact
    fx.flash(position, 3.5, new THREE.Color(1, 0.85, 0.6), 0.15);
    fx.impact(position, new THREE.Color(1, 0.6, 0.2), 2.2);

    // gerbe d'étincelles en traînées
    for (let i = 0; i < 34; i++) {
        const t = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).projectOnPlane(normal);
        if (t.lengthSq() < 1e-6) continue;
        t.normalize();
        if (slide && slide.lengthSq() > 0.5) t.lerp(slide, 0.65).normalize();
        const dir = t.addScaledVector(normal, 0.1 + Math.random() * 0.45).normalize();
        const hot = Math.random();
        bolts.fire({
            from: position, dir,
            speed: 50 + Math.random() * 170,
            length: 1.5 + Math.random() * 4.5,
            width: 0.12 + Math.random() * 0.16,
            color: new THREE.Color(1, 0.45 + hot * 0.45, 0.12 + hot * 0.3),
            range: 10 + Math.random() * 45,
            team: 'spark'
        });
    }

    // lueur de métal chauffé au point de contact + quelques éclats brûlants
    fx.emit(position, new THREE.Vector3(), 0.9, 2.5, 4.5, new THREE.Color(1, 0.5, 0.15), 0, 1);
    debris.spawn(position, 4, { dir: normal, speed: [8, 30], size: [0.25, 0.8], life: [1.2, 2.5], hot: 1 });
}



//********************************* */




// Texture VIDEO ON / OFF

const textureLoader = new THREE.TextureLoader();

const screenOffTexture1 = textureLoader.load('public/screen1_off.webp');
const screenOffTexture2 = textureLoader.load('public/screen2_off.jpg');
const screenOffTexture3 = textureLoader.load('public/screen3_off.jpeg');
const screenOffTexture4 = textureLoader.load('public/screen4_off.jpg');

const screenOffMaterial1 = new THREE.MeshStandardMaterial({
    map: screenOffTexture1,
    roughness: 0.2,   // plus petit = plus brillant
    metalness: 0.4    // intensité reflet
});

const screenOffMaterial2 = new THREE.MeshStandardMaterial({
    map: screenOffTexture2,
    roughness: 0.2,
    metalness: 0.4
});

const screenOffMaterial3 = new THREE.MeshStandardMaterial({
    map: screenOffTexture3,
    roughness: 0.2,
    metalness: 0.4
});

const screenOffMaterial4 = new THREE.MeshStandardMaterial({
    map: screenOffTexture4,
    roughness: 0.2,
    metalness: 0.4
});




// Écrans vidéo (extraits de films) : un écran ÉMET sa lumière. Avant, la vidéo était
// "peinte" sur un matériau éclairé, assombri par l'éclairage et l'exposition (0.3).
// Matériau non éclairé et sans tone mapping = vraies couleurs de la vidéo.
// (pas de bloom : ces écrans ne sont pas sur le calque BLOOM_LAYER)
const SCREEN_BRIGHTNESS = 1.0;   // 1 = luminosité d'origine de la vidéo, 1.2 = plus lumineux
function makeScreenVideoMaterial(texture) {
    return new THREE.MeshBasicMaterial({
        map: texture,
        color: new THREE.Color(SCREEN_BRIGHTNESS, SCREEN_BRIGHTNESS, SCREEN_BRIGHTNESS),
        toneMapped: false,
        side: THREE.DoubleSide
    });
}

const video2 = document.createElement("video");
video2.src = "public/screen1.mp4";
video2.preload = "none";   // téléchargée seulement au 1er clic sur l'écran
video2.loop = false;
video2.muted = false; // important pour autoplay navigateur
video2.playsInline = true;
video2.pause(); // démarre en pause

const videoTexture2 = new THREE.VideoTexture(video2);
videoTexture2.colorSpace = THREE.SRGBColorSpace;

const screenMaterial2 = makeScreenVideoMaterial(videoTexture2);

const screen = new THREE.Mesh(screenGeometry, screenOffMaterial1);

screen.position.set(-59, 6, -0.5); // ajuste selon ta scène
screen.rotation.y = Math.PI/2;
scene.add(screen);




// 1️⃣ élément vidéo HTML
const video3 = document.createElement("video");
video3.src = "public/screen2.mp4";
video3.preload = "none";   // téléchargée seulement au 1er clic sur l'écran
video3.loop = false;
video3.muted = false;
video3.playsInline = true;
video3.pause();

// 2️⃣ texture Three.js
const videoTexture3 = new THREE.VideoTexture(video3);
videoTexture3.colorSpace = THREE.SRGBColorSpace;

const screenMaterial3 = makeScreenVideoMaterial(videoTexture3);

const screen2 = new THREE.Mesh(screenGeometry, screenOffMaterial2);

screen2.position.set(59, 6, -0.5); // ajuste selon ta scène
screen2.rotation.y = -Math.PI/2;
scene.add(screen2);





// 1️⃣ élément vidéo HTML
const video4 = document.createElement("video");
video4.src = "public/screen3.mp4";
video4.preload = "none";   // téléchargée seulement au 1er clic sur l'écran
video4.loop = false;
video4.muted = false;
video4.playsInline = true;
video4.pause();

// 2️⃣ texture Three.js
const videoTexture4 = new THREE.VideoTexture(video4);
videoTexture4.colorSpace = THREE.SRGBColorSpace;

const screenMaterial4 = makeScreenVideoMaterial(videoTexture4);

const screen3 = new THREE.Mesh(screenGeometry, screenOffMaterial3);

screen3.position.set(58.35, 2.4, 40); // ajuste selon ta scène
screen3.scale.set(0.8, 1, 0.8)

scene.add(screen3);


// 1️⃣ élément vidéo HTML
const video5 = document.createElement("video");
video5.src = "public/screen4.mp4";
video5.preload = "none";   // téléchargée seulement au 1er clic sur l'écran
video5.loop = false;
video5.muted = false;
video5.playsInline = true;
video5.pause();

// 2️⃣ texture Three.js
const videoTexture5 = new THREE.VideoTexture(video5);
videoTexture5.colorSpace = THREE.SRGBColorSpace;

const screenMaterial5 = makeScreenVideoMaterial(videoTexture5);

const screen4 = new THREE.Mesh(screenGeometry, screenOffMaterial4);

screen4.position.set(-58.35, 2.4, 40); // ajuste selon ta scène
screen4.scale.set(0.8, 1, 0.8)

scene.add(screen4);




const screens = [
    {
        mesh: screen,
        video: video2,
        videoMaterial: screenMaterial2,
        offMaterial: screenOffMaterial1,
        isOn: false
    },
    {
        mesh: screen2,
        video: video3,
        videoMaterial: screenMaterial3,
        offMaterial: screenOffMaterial2,
        isOn: false
    },
     {
        mesh: screen3,
        video: video4,
        videoMaterial: screenMaterial4,
        offMaterial: screenOffMaterial3,
        isOn: false
    },
    {
        mesh: screen4,
        video: video5,
        videoMaterial: screenMaterial5,
        offMaterial: screenOffMaterial4,
        isOn: false
    }
];


const screenState1 = { isOn: false };
const screenState2 = { isOn: false };
const screenState3 = { isOn: false };
const screenState4 = { isOn: false };

function toggleScreen(screenObj) {

    if (!screenObj.isOn) {

        // 🔥 remplacer texture par vidéo
        screenObj.mesh.material = screenObj.videoMaterial;

        screenObj.video.play().catch(err => console.log(err));
        screenObj.isOn = true;

    } else {

        screenObj.video.pause();

        // remettre image fixe
        screenObj.mesh.material = screenObj.offMaterial;

        screenObj.isOn = false;
    }
}


const clickableObjects = [screen,screen2,screen3,screen4];

// ==========================================================
// LASER
// ==========================================================
/*
// 🔥 LASER GLB
const laserLoader = makeGLTFLoader();

let laserMixer;
let laserAction;

laserLoader.load('public/laser.glb', (gltf) => {

    const laser = gltf.scene;
    laser.position.set(0,-12, 98.5);
    laser.scale.set(10,10,10);
    laser.rotation.y = Math.PI; // faire face à la caméra
    scene.add(laser);

    laserMixer = new THREE.AnimationMixer(laser);
    laserAction = laserMixer.clipAction(gltf.animations[0]);

    laserAction.setLoop(THREE.LoopOnce);
    laserAction.clampWhenFinished = true;
});
*/
// ===================================================================
// SYSTÈMES D'ARMES (voir src/weapons.js)
// ===================================================================
const bolts = new LaserBolts(scene);          // tous les tirs laser
const fx = new ExplosionFX(scene, 12000);     // toutes les explosions GLSL
const hud = new CombatHUD();                  // réticule / score / radar
let playerKills = 0;
let cameraShake = 0;
let fireHeldMouse = false;
let fireHeldSpace = false;

// Petits "pools" de sons : plusieurs tirs rapides peuvent se chevaucher
function makeVoices(url, volume, count = 4) {
    const voices = [];
    for (let i = 0; i < count; i++) voices.push(new THREE.Audio(listener));
    voices.next = 0;
    audioLoader.load(url, (buffer) => voices.forEach(v => { v.setBuffer(buffer); v.setVolume(volume); }));
    return voices;
}
function playVoice(voices) {
    const v = voices[voices.next];
    voices.next = (voices.next + 1) % voices.length;
    if (!v.buffer) return;
    if (v.isPlaying) v.stop();
    v.play();
}

// 🔊 LASER SOUND (canon de la passerelle)
// (le son du canon est maintenant spatialisé : voir sfx.laser plus bas)

// La bataille (X-Wing + TIE alliés) est visible avec le canon OU en vol
function battleOn() {
    return cannonActive || !isInsideShip;
}

// =================================================================
// CANON LASER DE LA PASSERELLE (tourelle)
// =================================================================
// Le modèle est découpé en 3 étages :
//   socle (fixe)  →  fourche (tourne gauche/droite)  →  fût (monte/descend + recul)
const TURRET = {
    POSITION: new THREE.Vector3(0, -1, 200),  // axe du canon quand il est sorti
    HIDDEN_DROP: 45,                          // de combien il descend pour se cacher
    SPRING: 22,                               // raideur du ressort de sortie
    DAMPING: 6.5,                             // amortissement (petit rebond en haut)
    FIRE_INTERVAL: 0.15,                      // secondes entre deux tirs (clic maintenu)
    BOLT_SPEED: 1100,
    AIM_DISTANCE: 900,
    AIM_ASSIST_DEG: 4,                        // aide à la visée (angle de verrouillage)
    PITCH_MIN: THREE.MathUtils.degToRad(-18),
    PITCH_MAX: THREE.MathUtils.degToRad(40),
    YAW_MAX: THREE.MathUtils.degToRad(95),
    MUZZLE: new THREE.Vector3(0, 0, 29),      // bout du canon (repère du modèle)
    COLOR: LASER_RED,
    BASE_PARTS: ['Gear004'],
    YAW_PARTS: ['Cylindre001', 'Cylindre002']
};

const turret = {
    root: null, yaw: null, pitch: null, recoil: null, light: null,
    target: 0,          // 0 = rentré, 1 = sorti
    y: 0, vy: 0,        // hauteur relative (ressort)
    yawAngle: 0, pitchAngle: 0,
    cooldown: 0, recoilT: 1,
    lock: null
};
let laserCannon; // racine de la tourelle (nom gardé de l'ancienne version)

gltfLoader.load('public/laser_cannon.glb', (gltf) => {
    const model = gltf.scene;
    const root = new THREE.Group();
    const yaw = new THREE.Group();
    const pitch = new THREE.Group();
    const recoil = new THREE.Group();
    root.add(yaw); yaw.add(pitch); pitch.add(recoil);

    // Toutes les pièces sont modélisées autour de l'axe du canon (0,0,0)
    [...model.children].forEach(part => {
        if (TURRET.BASE_PARTS.includes(part.name)) root.add(part);
        else if (TURRET.YAW_PARTS.includes(part.name)) yaw.add(part);
        else recoil.add(part);
    });

    // lumière du tir (créée dès le départ : pas de recompilation des shaders au 1er tir)
    turret.light = new THREE.PointLight(0xff5533, 0, 160, 2);
    turret.light.position.copy(TURRET.MUZZLE);
    recoil.add(turret.light);

    root.position.copy(TURRET.POSITION);
    root.position.y -= TURRET.HIDDEN_DROP;
    root.visible = false;
    scene.add(root);

    Object.assign(turret, { root, yaw, pitch, recoil });
    laserCannon = root;
});

function setTurret(on) {
    turret.target = on ? 1 : 0;
    if (turret.root && on) turret.root.visible = true;
}

function turretReady() {
    return !!turret.root && turret.target === 1 && turret.y > 0.9;
}

// Cherche l'X-Wing le plus proche de la ligne de visée
function findLockTarget(origin, dir, maxAngleDeg, maxDist) {
    let best = null;
    let bestAngle = THREE.MathUtils.degToRad(maxAngleDeg);
    const v = new THREE.Vector3();
    for (const e of enemies) {
        if (!e || !e.visible || e.userData.dead || !xwingActive(e)) continue;
        v.subVectors(e.position, origin);
        const d = v.length();
        if (d > maxDist || d < 1) continue;
        const a = v.divideScalar(d).angleTo(dir);
        if (a < bestAngle) { bestAngle = a; best = e; }
    }
    return best;
}

// Point de visée anticipé (le laser met du temps à arriver)
function leadPoint(target, from, speed) {
    const p = target.position.clone();
    const vel = target.userData.velocity || new THREE.Vector3();
    for (let i = 0; i < 2; i++) {
        const t = p.distanceTo(from) / speed;
        p.copy(target.position).addScaledVector(vel, t);
    }
    return p;
}

function updateTurret(dt) {
    if (!turret.root) return;

    // --- sortie / rentrée : ressort amorti (petit rebond mécanique en haut)
    const acc = TURRET.SPRING * (turret.target - turret.y) - TURRET.DAMPING * turret.vy;
    turret.vy += acc * dt;
    turret.y += turret.vy * dt;
    turret.root.position.y = TURRET.POSITION.y - TURRET.HIDDEN_DROP * (1 - turret.y);

    if (turret.target === 0 && turret.y < 0.02 && Math.abs(turret.vy) < 0.05) {
        turret.root.visible = false;
        turret.y = 0; turret.vy = 0;
    }
    if (!turret.root.visible) { turret.lock = null; return; }

    // --- visée
    let desiredYaw = 0, desiredPitch = 0;
    const aim = new THREE.Vector3();
    turret.lock = null;

    if (turretReady()) {
        raycaster.setFromCamera(mouse, camera);
        const ray = raycaster.ray;
        aim.copy(ray.direction).multiplyScalar(TURRET.AIM_DISTANCE).add(ray.origin);

        const muzzle = turret.recoil.localToWorld(TURRET.MUZZLE.clone());
        turret.lock = findLockTarget(ray.origin, ray.direction, TURRET.AIM_ASSIST_DEG, 1600);
        if (turret.lock) aim.copy(leadPoint(turret.lock, muzzle, TURRET.BOLT_SPEED));

        const local = aim.clone().sub(turret.root.position);
        desiredYaw = Math.atan2(local.x, local.z);
        desiredPitch = Math.atan2(local.y, Math.hypot(local.x, local.z));
    } else {
        desiredPitch = -0.12; // position de repos, canon légèrement baissé
    }
    desiredYaw = THREE.MathUtils.clamp(desiredYaw, -TURRET.YAW_MAX, TURRET.YAW_MAX);
    desiredPitch = THREE.MathUtils.clamp(desiredPitch, TURRET.PITCH_MIN, TURRET.PITCH_MAX);

    const follow = 1 - Math.exp(-12 * dt);
    turret.yawAngle += (desiredYaw - turret.yawAngle) * follow;
    turret.pitchAngle += (desiredPitch - turret.pitchAngle) * follow;
    turret.yaw.rotation.y = turret.yawAngle;
    turret.pitch.rotation.x = -turret.pitchAngle;

    // --- recul du fût + flash lumineux
    turret.recoilT = Math.min(1, turret.recoilT + dt * 5);
    turret.recoil.position.z = -2.5 * Math.pow(1 - turret.recoilT, 2);
    turret.light.intensity *= Math.exp(-dt * 25);

    // --- tir
    turret.cooldown -= dt;
    if (turretReady() && fireHeldMouse && turret.cooldown <= 0) {
        turret.cooldown = TURRET.FIRE_INTERVAL;
        turret.root.updateMatrixWorld(true);
        const muzzle = turret.recoil.localToWorld(TURRET.MUZZLE.clone());
        const dir = aim.clone().sub(muzzle).normalize();

        bolts.fire({
            from: muzzle, dir,
            speed: TURRET.BOLT_SPEED, length: 26, width: 1.6,
            color: TURRET.COLOR, range: 3200, team: 'player',
            hitTest: playerBoltHitTest, onHit: onPlayerBoltHit
        });
        fx.muzzle(muzzle, TURRET.COLOR, 6);
        turret.light.intensity = 900;
        turret.recoilT = 0;
        playAt(sfx.laser, muzzle, 1.4, 0);
    }
}

// -------------------------------------------------------------------
// Collisions des tirs du joueur (canon ET TIE)
// -------------------------------------------------------------------
function hitShipList(list, p0, p1, radius) {
    let best = null, bestT = 2;
    for (const s of list) {
        if (!s || !s.visible || s.userData.dead) continue;
        const ph = s.userData.phase;
        if (ph !== undefined && ph !== 'battle' && ph !== 'formation' && ph !== 'launch') continue;
        const t = segmentSphere(p0, p1, s.position, radius);
        if (t >= 0 && t < bestT) { bestT = t; best = s; }
    }
    return best ? { target: best, t: bestT, point: new THREE.Vector3().lerpVectors(p0, p1, bestT) } : null;
}

function playerBoltHitTest(bolt, p0, p1) {
    const x = hitShipList(enemies, p0, p1, 18);
    const c = rebelFleet.hitTest(p0, p1, bolt);
    if (x && (!c || x.t <= c.t)) return { kind: 'xwing', ...x };
    if (c) return { kind: 'capital', ...c };
    return null;
}

function onPlayerBoltHit(bolt, hit) {
    fx.impact(hit.point, bolt.color, hit.kind === 'capital' ? 10 : 4);
    if (hit.kind === 'xwing') {
        destroyEnemy(hit.target, true);
    } else if (hit.kind === 'capital') {
        rebelFleet.hit(hit.ship, hit.part, hit.point, bolt.dir);
    }
}

// =========================================================
// ALARM     ALARM        ALARM
// =========================================================


// 🔊 Son d'alarme
alarmSound = new THREE.Audio(listener);

audioLoader.load('public/alarm.mp3', (buffer) => {
    alarmSound.setBuffer(buffer);
    alarmSound.setLoop(true);   // boucle infinie
    alarmSound.setVolume(0.2);
});

// Chargement du panneau GLB

const panelLoader = makeGLTFLoader();

panelLoader.load('public/alarm.glb', (gltf) => {

    const panel = gltf.scene;
    panel.position.set(0,-12, 98.5);
    panel.scale.set(10,10,10);
    panel.rotation.y = Math.PI; // faire face à la caméra
    scene.add(panel);
    console.log("Contenu du panel GLB :", panel);

     panel.traverse((child) => {
        console.log("Objet trouvé :", child.name);
    });

    panelMesh = panel.getObjectByName("Celling_Top_Light_0001");

    if (!panelMesh) {
        console.error("❌ panelMesh introuvable !");
    } else {
        console.log("✅ panelMesh trouvé :", panelMesh);
    }

    // Si animation exportée depuis Blender
    if (gltf.animations.length > 0) {
        panelMixer = new THREE.AnimationMixer(panel);
        panelAction = panelMixer.clipAction(gltf.animations[0]);

        panelAction.setLoop(THREE.LoopRepeat); // répète tant que actif
        panelAction.clampWhenFinished = false;
    }

});

function startAlarm() {
    alarmActive = true;

    if (!alarmSound.isPlaying) {
        alarmSound.play();
    }
}

function stopAlarm() {

    alarmActive = false;

    if (alarmSound && alarmSound.isPlaying) {
        alarmSound.stop();
    }

    if (mainHDRI) {
        scene.environment = mainHDRI;
    }

    if (panelMesh) {
        const mat = panelMesh.material;
        mat.emissive.set(0xffffff);
        mat.emissiveIntensity = 5.0;
    }
}





// ==========================================================
// TIE FIGHTER : CANONS DU JOUEUR EN VOL
// ==========================================================
// ESPACE (maintenu) ou clic gauche : tirs verts alternés gauche / droite.
// Les deux canons convergent au centre du réticule ; si un X-Wing est
// proche du réticule, les tirs visent devant lui (aide à la visée).

const TIE_GUN = {
    FIRE_INTERVAL: 0.13,
    BOLT_SPEED: 900,
    CONVERGE: 350,                           // distance où les 2 tirs se croisent
    AIM_ASSIST_DEG: 6,
    OFFSETS: [                               // position des canons (repère caméra, sous le cockpit)
        new THREE.Vector3(-4.0, -3.2, -6),
        new THREE.Vector3( 4.0, -3.2, -6)
    ],
    COLOR: LASER_GREEN
};
let tieGunSide = 0;
let tieGunCooldown = 0;
let tieLock = null;

// 🔊 TIE LASER SOUND
const tieLaserVoices = makeVoices('public/tielaser.mp3', 0.8);

function updateTieGuns(dt) {
    tieGunCooldown -= dt;
    tieLock = null;
    if (isInsideShip) return;

    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    tieLock = findLockTarget(camPos, fwd, TIE_GUN.AIM_ASSIST_DEG, 1500);

    if (!(fireHeldSpace || fireHeldMouse) || tieGunCooldown > 0) return;
    tieGunCooldown = TIE_GUN.FIRE_INTERVAL;

    const from = camera.localToWorld(TIE_GUN.OFFSETS[tieGunSide].clone());
    tieGunSide = 1 - tieGunSide;

    const aim = tieLock
        ? leadPoint(tieLock, from, TIE_GUN.BOLT_SPEED)
        : camPos.clone().addScaledVector(fwd, TIE_GUN.CONVERGE);

    bolts.fire({
        from, dir: aim.sub(from),
        speed: TIE_GUN.BOLT_SPEED + currentFlightSpeed,     // + vitesse du TIE : le boost ne rattrape pas ses propres tirs
        length: 90, width: 2.6,                              // vus de dos : longs et épais
        color: TIE_GUN.COLOR, range: 2600, team: 'player',
        hitTest: playerBoltHitTest, onHit: onPlayerBoltHit
    });
    fx.muzzle(from, TIE_GUN.COLOR, 1.6);
    cameraShake = Math.max(cameraShake, 0.12);
    playVoice(tieLaserVoices);
}

// ===================================================================
// X-WING — ESCADRILLES QUI ARRIVENT AVEC LES CROISEURS REBELLES
// ===================================================================
// Cycle de vie d'un X-Wing (userData.phase) :
//   'pool'      : en réserve, invisible
//   'jump'      : sortie d'hyperespace à côté d'un croiseur (étirement + flash)
//   'formation' : vole quelques secondes en formation avec l'escadrille
//   'battle'    : se disperse et combat (ancien comportement "en boucles")
//   'leave'     : arrivé près du destroyer impérial, repart en hyperespace
// Les X-Wing détruits ou partis retournent dans la réserve et reviennent
// plus tard en renfort, toujours par escadrilles.

const XWING = {
    POOL: 40,                 // nombre total d'X-Wing
    SQUAD: [5, 7],            // taille d'une escadrille
    JUMP_TIME: 0.9,
    JUMP_DISTANCE: 1800,
    FORMATION_TIME: 3.0,
    FORMATION_SPEED: 75,
    REINFORCE_EVERY: 6,       // secondes entre deux escadrilles de renfort
    MAX_ACTIVE: 34,
    LEAVE_Z: BATTLE_MIN_Z + 200   // en dessous : ils repartent en hyperespace
};

let xwingReinforceTimer = 0;
let battleWasOn = false;
const _fwdX = new THREE.Vector3(0, 0, -1);   // avant d'un X-Wing dans son repère

gltfLoader.load('public/xwing.glb', (gltf) => {
    xwingModel = gltf.scene;
    xwingModel.visible = true;
    xwingModel.scale.set(5,5,5);
    xwingModel.position.set(0,0,0);
    xwingModel.rotation.y += Math.PI;

    for (let i = 0; i < XWING.POOL; i++) createXwing(xwingModel, 'xwing');
});

// Y-WING : même comportement que les X-Wing (escadrilles, formation, dispersion)
// Le modèle d'origine est décentré, orienté nez vers +X et très grand :
// on le recentre, on le tourne nez vers -Z (comme les X-Wing) et on le met à ~38 unités.
const YWING_POOL = 14;
let ywingModel = null;
gltfLoader.load('public/y-wing.glb', (gltf) => {
    const inner = gltf.scene;
    inner.traverse(o => { if (o.isLight) o.visible = false; });   // lampes exportées de Sketchfab
    const box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    inner.position.copy(box.getCenter(new THREE.Vector3())).negate();
    const wrap = new THREE.Group();
    wrap.add(inner);
    wrap.scale.setScalar(38 / size.x);
    wrap.rotation.y = Math.PI / 2;                                  // nez +X → -Z
    ywingModel = new THREE.Group();
    ywingModel.add(wrap);
    for (let i = 0; i < YWING_POOL; i++) createXwing(ywingModel, 'ywing');
});

// Un "dessinateur" par type de chasseur : tous les vaisseaux du même modèle sont
// dessinés ensemble (voir InstancedShips dans weapons.js). Les vaisseaux eux-mêmes
// ne sont plus que des Group vides qui portent position / rotation / visible.
const shipInstancers = {};   // 'xwing' | 'ywing' | 'tie'
function instancerFor(kind, template, max, setup) {
    if (!shipInstancers[kind]) {
        const model = template.clone();
        if (setup) setup(model);
        shipInstancers[kind] = new InstancedShips(scene, model, max);
    }
    return shipInstancers[kind];
}

function createXwing(template = xwingModel, kind = 'xwing') {
    const enemy = new THREE.Group();
    instancerFor(kind, template, kind === 'xwing' ? XWING.POOL : YWING_POOL,
        model => { if (kind === 'xwing') model.rotation.y = 0; }).add(enemy);
    enemy.visible = false;
    enemy.userData = {
        kind,
        phase: 'pool',
        velocity: new THREE.Vector3(),
        targetQuat: null,
        dead: false,
        t: 0
    };
    scene.add(enemy);
    enemies.push(enemy);
}

function xwingActive(e) {
    const ph = e.userData.phase;
    return ph === 'formation' || ph === 'battle';
}

// Oriente un X-Wing selon une direction (son avant est -Z)
function faceXwing(enemy, dir) {
    enemy.quaternion.setFromUnitVectors(_fwdX, dir.clone().normalize());
    enemy.userData.targetQuat = enemy.quaternion.clone();
}

/**
 * Lance une escadrille. Avec un croiseur : elle sort de l'hyperespace devant lui.
 * Sans croiseur : elle arrive seule, loin devant la passerelle.
 */
function launchSquadron(ship = null, size = null) {
    // escadrille d'X-Wing, de Y-Wing ou mixte
    const pool = enemies.filter(e => e.userData.phase === 'pool');
    const r = Math.random();
    const want = r < 0.25 ? 'ywing' : r < 0.45 ? null : 'xwing';
    let reserve = want ? pool.filter(e => e.userData.kind === want) : pool.slice().sort(() => Math.random() - 0.5);
    if (reserve.length < XWING.SQUAD[0]) reserve = pool;
    const n = Math.min(reserve.length, size ?? Math.round(XWING.SQUAD[0] + Math.random() * (XWING.SQUAD[1] - XWING.SQUAD[0])));
    if (n <= 0) return;

    let anchor, fwd, quat;
    if (ship) {
        fwd = ship.heading.clone();
        quat = ship.group.quaternion.clone();
        anchor = ship.group.position.clone().addScaledVector(fwd, ship.radius + 60);
    } else {
        anchor = new THREE.Vector3((Math.random() - 0.5) * 1600, BATTLE_Y + (Math.random() - 0.3) * 300, 1800 + Math.random() * 900);
        fwd = new THREE.Vector3(0, 0, 400).sub(anchor).setY(0).normalize();
        quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), fwd);
    }

    for (let i = 0; i < n; i++) {
        const e = reserve[i];
        const ud = e.userData;
        // formation en V (repère du croiseur : x = avant, y = haut, z = côté)
        const row = Math.floor((i + 1) / 2);
        const side = i === 0 ? 0 : (i % 2 ? 1 : -1);
        ud.slot = new THREE.Vector3(-row * 55, (Math.random() - 0.5) * 30, side * row * 60).applyQuaternion(quat);
        ud.anchor = anchor;
        ud.fwd = fwd.clone();
        ud.ship = ship;
        ud.phase = 'jump';
        ud.t = -i * 0.12;                  // léger décalage : ils sortent l'un après l'autre
        ud.dead = false;
        ud.nextShot = undefined;
        ud.nextRandomExplosion = undefined;
        faceXwing(e, fwd);
    }
}

// Vaisseau → phase "jump" / "formation" : position de sa place dans l'escadrille
function formationPoint(ud, extra) {
    const base = ud.ship && ud.ship.state !== 'dead'
        ? ud.ship.group.position.clone().addScaledVector(ud.fwd, ud.ship.radius + 60)
        : ud.anchor.clone();
    return base.add(ud.slot).addScaledVector(ud.fwd, extra);
}

function updateBattleWaves(dt) {
    const on = battleOn();
    if (on && !battleWasOn) {
        // la bataille commence : les croiseurs rebelles arrivent un par un,
        // chacun avec ses escadrilles (voir onArrive dans la section des croiseurs)
        rebelFleet.setActive(true);
        xwingReinforceTimer = XWING.REINFORCE_EVERY * 2;
    }
    if (!on && battleWasOn) {
        // fin de la bataille : les croiseurs et les X-Wing repartent en hyperespace
        rebelFleet.setActive(false);
        enemies.forEach(e => {
            const ud = e.userData;
            if (ud.phase === 'battle' || ud.phase === 'formation') {
                if (ud.phase === 'formation') ud.velocity.copy(ud.fwd);
                ud.phase = 'leave';
                ud.t = 0;
                ud.velocity.normalize().multiplyScalar(120);
                faceXwing(e, ud.velocity);
            } else if (ud.phase !== 'leave') {
                ud.phase = 'pool';
                e.visible = false;
            }
        });
    }
    battleWasOn = on;

    if (on) {
        // renforts : toujours depuis un croiseur présent
        xwingReinforceTimer -= dt;
        const ship = rebelFleet.randomActiveShip();
        if (xwingReinforceTimer <= 0 && ship) {
            xwingReinforceTimer = XWING.REINFORCE_EVERY;
            const active = enemies.filter(e => e.userData.phase !== 'pool').length;
            if (active < XWING.MAX_ACTIVE) launchSquadron(ship);
        }
    }
}

function updateEnemies(dt) {
    const k = dt * LEGACY_TICK_RATE;
    const time = performance.now() * 0.001;

    enemies.forEach((enemy, index) => {
        const ud = enemy.userData;
        const vel = ud.velocity;

        if (ud.phase === 'pool') { enemy.visible = false; return; }

        // ---------- sortie d'hyperespace
        if (ud.phase === 'jump') {
            ud.t += dt / XWING.JUMP_TIME;
            const u = THREE.MathUtils.clamp(ud.t, 0, 1);
            const e = 1 - Math.pow(1 - u, 4);
            enemy.position.copy(formationPoint(ud, -XWING.JUMP_DISTANCE * (1 - e)));
            enemy.scale.set(1, 1, 1 + 18 * Math.pow(1 - e, 2));
            enemy.visible = ud.t > 0 && battleOn();
            if (u >= 1) {
                enemy.scale.set(1, 1, 1);
                fx.flash(enemy.position, 14, new THREE.Color(0.75, 0.85, 1), 0.3);
                ud.phase = 'formation';
                ud.t = 0;
            }
            return;
        }

        // ---------- vol en formation, puis dispersion
        if (ud.phase === 'formation') {
            ud.t += dt;
            enemy.position.copy(formationPoint(ud, ud.t * XWING.FORMATION_SPEED));
            enemy.visible = battleOn();
            if (ud.t >= XWING.FORMATION_TIME + index % 5 * 0.4) {
                ud.phase = 'battle';
                // départ en dispersion : chacun pique dans sa propre direction
                vel.copy(ud.fwd).multiplyScalar(XWING.FORMATION_SPEED)
                   .add(new THREE.Vector3((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 60));
            }
            return;
        }

        // ---------- départ en hyperespace
        if (ud.phase === 'leave') {
            ud.t += dt;
            vel.multiplyScalar(1 + dt * 6);
            enemy.position.addScaledVector(vel, dt);
            enemy.scale.set(1, 1, 1 + ud.t * 40);
            if (ud.t > 0.6) { ud.phase = 'pool'; enemy.visible = false; enemy.scale.set(1, 1, 1); }
            return;
        }

        // ---------- combat (mouvement "en boucles" d'origine, adouci)
        // vers le destroyer impérial (Z négatif), sans demi-tour brutal
        vel.z += (-35 - vel.z) * (1 - Math.exp(-0.8 * dt));

        const loopPhase = time * 0.5 + index;
        const radius = 120;
        const targetX = Math.sin(loopPhase) * radius + Math.sin(time * 0.2 + index) * 150;
        const targetY = BATTLE_Y + Math.cos(loopPhase * 0.7) * radius + Math.cos(time * 0.3 + index) * 80;

        vel.x += (targetX - enemy.position.x) * 0.02 * dt * 30;
        vel.y += (targetY - enemy.position.y) * 0.02 * dt * 30;
        // amortissement : fini les glissades latérales à 250 unités/s
        const damp = Math.exp(-0.9 * dt);
        vel.x *= damp;
        vel.y *= damp;

        enemy.position.addScaledVector(vel, dt);

        // proche du destroyer : saut en hyperespace
        if (enemy.position.z < XWING.LEAVE_Z) {
            ud.phase = 'leave';
            ud.t = 0;
            vel.set(vel.x * 0.3, 60, 0).add(new THREE.Vector3(0, 0, -200)).normalize().multiplyScalar(120);
            faceXwing(enemy, vel);
            fx.flash(enemy.position, 10, new THREE.Color(0.75, 0.85, 1), 0.25);
            return;
        }

        // orientation (toujours basée sur la vélocité)
        if (vel.length() > 0.1) {
            const lookDir = vel.clone().normalize();
            if (!ud.targetQuat) ud.targetQuat = enemy.quaternion.clone();
            const newTargetQuat = new THREE.Quaternion().setFromUnitVectors(_fwdX, lookDir);
            ud.targetQuat.slerp(newTargetQuat, 1 - Math.pow(1 - 0.05, k));
            enemy.quaternion.slerp(ud.targetQuat, 1 - Math.pow(1 - 0.03, k));
        }

        enemy.visible = battleOn() && !ud.dead;
    });
}

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

// -------------------------------------------------------------------
// 6. FONCTIONS DE DESTRUCTION
// -------------------------------------------------------------------

function destroyEnemy(enemy, byPlayer = false) {
    if (!enemy || enemy.userData.dead || !xwingActive(enemy)) return;
    enemy.userData.dead = true;
    enemy.visible = false;

    fx.explosion(enemy.position.clone(), byPlayer ? 20 : 15);
    debris.spawn(enemy.position, 6, { speed: [10, 40], size: [0.8, 2.5], life: [2, 4], baseVel: enemy.userData.velocity, hot: 0.6 });

    if (byPlayer) {
        playerKills++;
        hud.setScore(playerKills);   // (le son de l'explosion est joué par fx.explosion, spatialisé)
    }

    // retour en réserve : il reviendra avec une escadrille de renfort
    enemy.userData.phase = 'pool';
}

// ===================================================================
// SYSTÈME DE COMBAT SPATIAL - VERSION CORRIGÉE
// ===================================================================

// -------------------------------------------------------------------
// 1. DÉCLARATION DES VARIABLES GLOBALES
// -------------------------------------------------------------------


// Couleurs des lasers
const laserRed = new THREE.Color(1, 0.2, 0.1);
const laserGreen = new THREE.Color(0.2, 1, 0.3);

// -------------------------------------------------------------------
// 2. FONCTION D'EXPLOSION RAPIDE (si elle n'existe pas)
// -------------------------------------------------------------------

// Si tu n'as pas createQuickExplosion, on utilise createStandardExplosion
function createQuickExplosion(position, scale = 8) {
    // Utilise ton système d'explosion existant
    if (typeof createStandardExplosion === 'function') {
        createStandardExplosion(position, scale);
    } else if (typeof createVideoExplosion === 'function') {
        createVideoExplosion(position, scale);
    }
}

// -------------------------------------------------------------------
// 3. TIE ALLIÉS — décollent de la coque du destroyer
// -------------------------------------------------------------------
// phases : 'pool' (réserve) → 'launch' (sortent de la coque) → 'battle'
//          → 'land' (replongent vers la coque) → 'pool'
const TIE_WING = {
    POOL: 24,
    LAUNCH_TIME: 1.6,
    REINFORCE_EVERY: 3,
    MAX_ACTIVE: 22
};
let tieReinforceTimer = 0;
let tieBattleWasOn = false;
const _fwdTie = new THREE.Vector3(0, 0, 1);

gltfLoader.load('public/tieinterlow.glb', (gltf) => {
    tieModel = gltf.scene;
    tieModel.scale.set(0.5,0.5,0.5);
    tieModel.rotation.y += Math.PI;

    for (let i = 0; i < TIE_WING.POOL; i++) createTie();
    createPatrols();
});

// -------------------------------------------------------------------
// 4. PATROUILLES DE TIE INTERCEPTOR AUTOUR DE LA TOUR DU PONT
// -------------------------------------------------------------------
// Formations en V qui tournent autour de la tour pour surveiller la zone.
// Rayon, altitude, vitesse et sens changent au hasard de temps en temps.
const PATROL = {
    GROUPS: 3,
    SLOTS: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-45, 4, -40), new THREE.Vector3(45, -4, -40)], // (côté, haut, avant)
    CENTER: new THREE.Vector3(0, 0, 0),   // la tour du pont
    RADIUS: [320, 700],                   // reste loin de la tour (±185) et du canon (z 200)
    ALT: [40, 280],                       // au-dessus de la coque de l'Executor (y ≈ -80)
    SPEED: [55, 95]
};
const patrols = [];
const prand = (a, b) => a + Math.random() * (b - a);

// Les TIE des patrouilles sont instanciés (dessinés ensemble), avec leurs PROPRES
// matériaux : on peut les estomper pendant l'hyperespace sans toucher aux TIE de la bataille.
let patrolInstancer = null;
let patrolFaded = false;

function createPatrols() {
    const model = tieModel.clone();
    model.rotation.y = Math.PI;
    model.traverse(o => { if (o.isMesh) o.material = o.material.clone(); });
    patrolInstancer = new InstancedShips(scene, model, PATROL.GROUPS * PATROL.SLOTS.length);

    for (let g = 0; g < PATROL.GROUPS; g++) {
        const p = {
            angle: Math.random() * Math.PI * 2,
            dir: Math.random() < 0.5 ? 1 : -1,
            radius: prand(...PATROL.RADIUS), alt: prand(...PATROL.ALT), speed: prand(...PATROL.SPEED),
            timer: 0,
            pos: new THREE.Vector3(), prev: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1),
            members: []
        };
        p.radiusTarget = p.radius; p.altTarget = p.alt; p.speedTarget = p.speed;
        PATROL.SLOTS.forEach(() => {
            const tie = new THREE.Group();
            patrolInstancer.add(tie);
            p.members.push(tie);
        });
        patrols.push(p);
    }
}

function updatePatrols(dt) {
    if (!patrols.length || dt <= 0) return;
    const t = performance.now() * 0.001;
    const up = new THREE.Vector3(0, 1, 0);

    // Hyperespace : comme les autres vaisseaux autour (voir objectFade), les patrouilles
    // glissent en s'estompant, restent cachées pendant le saut, puis reviennent.
    const hyperOffset = objectFade === 'fadeOut' ? -hyperMoveDistance * (1 - objectOpacity)
                      : objectFade === 'fadeIn'  ?  hyperMoveDistance * (1 - objectOpacity) : 0;
    const shown = objectFade !== 'hidden';
    const fading = objectFade === 'fadeOut' || objectFade === 'fadeIn';

    patrols.forEach((p, gi) => {
        // nouvelle consigne de vol de temps en temps
        p.timer -= dt;
        if (p.timer <= 0) {
            p.timer = prand(5, 12);
            p.radiusTarget = prand(...PATROL.RADIUS);
            p.altTarget = prand(...PATROL.ALT);
            p.speedTarget = prand(...PATROL.SPEED);
            if (Math.random() < 0.2) p.dir *= -1;      // demi-tour de la patrouille
        }
        const k = 1 - Math.exp(-0.3 * dt);
        p.radius += (p.radiusTarget - p.radius) * k;
        p.alt += (p.altTarget - p.alt) * k;
        p.speed += (p.speedTarget - p.speed) * k;

        // le chef de patrouille tourne autour de la tour
        p.angle += p.dir * p.speed / p.radius * dt;
        p.prev.copy(p.pos);
        p.pos.set(Math.sin(p.angle) * p.radius, p.alt + Math.sin(t * 0.4 + gi * 2) * 20, Math.cos(p.angle) * p.radius).add(PATROL.CENTER);
        const step = p.pos.clone().sub(p.prev);
        if (step.lengthSq() > 1e-6) p.fwd.lerp(step.normalize(), 1 - Math.exp(-4 * dt)).normalize();

        // repère de la formation + inclinaison vers l'intérieur du virage
        const side = new THREE.Vector3().crossVectors(p.fwd, up).normalize();
        const upF = new THREE.Vector3().crossVectors(side, p.fwd).normalize();
        const roll = -p.dir * 0.35;

        p.members.forEach((tie, i) => {
            const s = PATROL.SLOTS[i];
            const target = p.pos.clone().addScaledVector(side, s.x).addScaledVector(upF, s.y).addScaledVector(p.fwd, s.z);
            if (tie.userData.placed) tie.position.lerp(target, 1 - Math.exp(-4 * dt));
            else { tie.position.copy(target); tie.userData.placed = true; }
            tie.quaternion.setFromUnitVectors(_fwdTie, p.fwd);
            tie.rotateZ(roll + Math.sin(t * 1.3 + i + gi) * 0.05);   // petit balancement

            // hyperespace
            tie.visible = shown;
            tie.position.z += hyperOffset;
        });
    });

    // fondu pendant l'hyperespace (tous les TIE de patrouille partagent ces matériaux)
    if (fading || patrolFaded) {
        for (const part of patrolInstancer.parts) {
            part.mesh.material.transparent = fading;
            part.mesh.material.opacity = fading ? objectOpacity : 1;
        }
        patrolFaded = fading;
    }
    patrolInstancer.update();
}

function createTie() {
    const tie = new THREE.Group();
    instancerFor('tie', tieModel, TIE_WING.POOL, model => { model.rotation.y = Math.PI; }).add(tie);
    tie.visible = false;
    tie.userData = {
        phase: 'pool',
        velocity: new THREE.Vector3(),
        targetQuat: null,
        type: 'tie',
        dead: false,
        t: 0
    };
    scene.add(tie);
    friendlyShips.push(tie);
}

function launchTie() {
    const tie = friendlyShips.find(t => t.userData.phase === 'pool');
    if (!tie) return;
    const ud = tie.userData;
    // départ À L'INTÉRIEUR de la coque : le TIE "sort" du pont en montant
    tie.position.set((Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * 200), -190, 450 + Math.random() * 900);
    ud.velocity.set((Math.random() - 0.5) * 30, 70, 25 + Math.random() * 20);
    ud.phase = 'launch';
    ud.t = 0;
    ud.age = 0;
    ud.patrol = 1;
    ud.dead = false;
    ud.nextShot = undefined;
    ud.nextRandomExplosion = undefined;
    tie.quaternion.setFromUnitVectors(_fwdTie, ud.velocity.clone().normalize());
    ud.targetQuat = tie.quaternion.clone();
}

function updateTieWaves(dt) {
    const on = battleOn();
    if (on && !tieBattleWasOn) {
        for (let i = 0; i < 16; i++) setTimeout(() => { if (battleOn()) launchTie(); }, i * 250);
        tieReinforceTimer = 5;
    }
    if (!on && tieBattleWasOn) {
        // fin de la bataille : les TIE en vol rentrent vers la coque
        friendlyShips.forEach(t => {
            const ud = t.userData;
            if (ud.phase === 'battle' || ud.phase === 'launch') { ud.phase = 'land'; ud.t = 0; }
            else if (ud.phase !== 'land') { ud.phase = 'pool'; t.visible = false; }
        });
    }
    tieBattleWasOn = on;
    if (on) {
        tieReinforceTimer -= dt;
        if (tieReinforceTimer <= 0) {
            tieReinforceTimer = TIE_WING.REINFORCE_EVERY;
            const active = friendlyShips.filter(t => t.userData.phase !== 'pool').length;
            if (active < TIE_WING.MAX_ACTIVE) launchTie();
        }
    }
}

// -------------------------------------------------------------------
// 5. MOUVEMENT DES TIE
// -------------------------------------------------------------------

function updateTies(dt) {
    if (!tieModel) return;
    const k = dt * LEGACY_TICK_RATE;
    const time = performance.now() * 0.001;

    friendlyShips.forEach((tie, index) => {
        const ud = tie.userData;
        const vel = ud.velocity;

        if (ud.phase === 'pool') { tie.visible = false; return; }

        if (ud.phase === 'launch') {
            ud.t += dt;
            if (ud.t > TIE_WING.LAUNCH_TIME) ud.phase = 'battle';
        } else if (ud.phase === 'land') {
            ud.t += dt;
            vel.y += (-80 - vel.y) * (1 - Math.exp(-2 * dt));
            if (ud.t > 2.2) { ud.phase = 'pool'; tie.visible = false; return; }
        } else {
            // combat : patrouille entre le destroyer et la flotte rebelle
            ud.age = (ud.age || 0) + dt;
            if (tie.position.z > 2000) ud.patrol = -1;
            else if (tie.position.z < 600) ud.patrol = 1;
            vel.z += (35 * ud.patrol - vel.z) * (1 - Math.exp(-0.8 * dt));
            const loopPhase = time * 0.5 + index + 10;
            const radius = 120;
            const targetX = Math.sin(loopPhase) * radius + Math.sin(time * 0.2 + index) * 150;
            const targetY = BATTLE_Y + Math.cos(loopPhase * 0.7) * radius + Math.cos(time * 0.3 + index) * 80;
            vel.x += (targetX - tie.position.x) * 0.02 * dt * 30;
            vel.y += (targetY - tie.position.y) * 0.02 * dt * 30;
            const damp = Math.exp(-0.9 * dt);
            vel.x *= damp;
            vel.y *= damp;

            // après un long combat : retour vers la coque (atterrissage)
            if (ud.age > 40 && tie.position.z < 900) { ud.phase = 'land'; ud.t = 0; }
        }

        tie.position.addScaledVector(vel, dt);

        // orientation
        if (vel.length() > 0.1) {
            if (!ud.targetQuat) ud.targetQuat = tie.quaternion.clone();
            const newTargetQuat = new THREE.Quaternion().setFromUnitVectors(_fwdTie, vel.clone().normalize());
            ud.targetQuat.slerp(newTargetQuat, 1 - Math.pow(1 - 0.05, k));
            tie.quaternion.slerp(ud.targetQuat, 1 - Math.pow(1 - 0.03, k));
        }

        tie.visible = (battleOn() || ud.phase === 'land') && !ud.dead;
    });
}

// -------------------------------------------------------------------
// 6. SYSTÈME DE LASERS (plus grands)
// -------------------------------------------------------------------

function createLaser(position, direction, color, isEnemy, range = 420) {
    bolts.fire({
        from: position, dir: direction,
        speed: 400, length: 24, width: 1.6, color, range,
        team: isEnemy ? 'rebel' : 'empire',
        hitTest: isEnemy ? rebelBoltHitTest : empireBoltHitTest,
        onHit: isEnemy ? onRebelBoltHit : onEmpireBoltHit
    });
    laserSoundAt(position, isEnemy);
}

// tirs verts des TIE alliés → X-Wing
function empireBoltHitTest(bolt, p0, p1) {
    return hitShipList(enemies, p0, p1, 25);
}
function onEmpireBoltHit(bolt, hit) {
    destroyEnemy(hit.target);
}

// tirs rouges des X-Wing → TIE alliés, ou le joueur quand il vole
function rebelBoltHitTest(bolt, p0, p1) {
    const t = hitShipList(friendlyShips, p0, p1, 25);
    if (t) return { kind: 'tie', ...t };
    if (!isInsideShip) {
        const cam = camera.getWorldPosition(new THREE.Vector3());
        const tt = segmentSphere(p0, p1, cam, 6);
        if (tt >= 0) return { kind: 'player', t: tt, point: new THREE.Vector3().lerpVectors(p0, p1, tt) };
    }
    return null;
}
function onRebelBoltHit(bolt, hit) {
    if (hit.kind === 'tie') destroyTie(hit.target);
    else playerHit();
}

// le joueur est touché : pas de "game over", juste un flash et une secousse
function playerHit() {
    hud.flashHurt();
    cameraShake = 1.2;
    if (metalCollisionSound && metalCollisionSound.buffer) {
        if (metalCollisionSound.isPlaying) metalCollisionSound.stop();
        metalCollisionSound.play();
    }
}

function updateLasers(dt) {
    // bataille cachée → on retire les tirs des IA (les tirs du joueur finissent leur course)
    if (!battleOn()) bolts.clear(b => b.team === 'rebel' || b.team === 'empire');
}

// -------------------------------------------------------------------
// 7. TIRS ASYNCHRONES (avec décalage pour éviter la同步)
// -------------------------------------------------------------------

function updateShooting(dt) {
    if (!battleOn()) return;
    
    const time = performance.now() * 0.001;
    
    // Tirs des X-Wing
    enemies.forEach(enemy => {
        if (!enemy || !enemy.visible || enemy.userData.phase !== 'battle') return;
        
        // Initialisation avec décalage aléatoire
        if (enemy.userData.nextShot === undefined) {
            enemy.userData.nextShot = time + Math.random() * 3;
            enemy.userData.fireRate = 1.5 + Math.random() * 2.5;
        }
        
        const nearPlayer = !isInsideShip && enemy.position.distanceTo(player.position) < 700;
        if (time > enemy.userData.nextShot && nearPlayer && Math.random() < 0.35) {
            // En vol, certains X-Wing visent le joueur (avec une bonne marge d'erreur)
            const aimP = camera.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(
                (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50));
            const direction = aimP.sub(enemy.position).normalize();
            createLaser(enemy.position.clone().add(direction.clone().multiplyScalar(15)), direction, laserRed, true, 800);
            enemy.userData.nextShot = time + enemy.userData.fireRate * (0.8 + Math.random() * 0.4);
        } else if (time > enemy.userData.nextShot && friendlyShips.length > 0) {
            // Choisir une cible aléatoire
            const target = friendlyShips[Math.floor(Math.random() * friendlyShips.length)];
            if (target && target.visible) {
                const direction = target.position.clone().sub(enemy.position).normalize();
                createLaser(
                    enemy.position.clone().add(direction.clone().multiplyScalar(15)),
                    direction,
                    laserRed,
                    true
                );
            }
            // Prochain tir avec variation
            enemy.userData.nextShot = time + enemy.userData.fireRate * (0.8 + Math.random() * 0.4);
        }
    });
    
    // Tirs des TIE
    friendlyShips.forEach(tie => {
        if (!tie || !tie.visible || tie.userData.phase !== 'battle') return;
        
        if (tie.userData.nextShot === undefined) {
            tie.userData.nextShot = time + Math.random() * 3;
            tie.userData.fireRate = 1.5 + Math.random() * 2.5;
        }
        
        if (time > tie.userData.nextShot && enemies.length > 0) {
            const target = enemies[Math.floor(Math.random() * enemies.length)];
            if (target && target.visible) {
                const direction = target.position.clone().sub(tie.position).normalize();
                createLaser(
                    tie.position.clone().add(direction.clone().multiplyScalar(15)),
                    direction,
                    laserGreen,
                    false
                );
            }
            tie.userData.nextShot = time + tie.userData.fireRate * (0.8 + Math.random() * 0.4);
        }
    });
}

// -------------------------------------------------------------------
// 8.  ALÉATOIRES
// -------------------------------------------------------------------

function randomExplosions(dt) {
    if (!battleOn()) return;
    
    const time = performance.now() * 0.001;
    
    // X-Wing explosent aléatoirement
    enemies.forEach(enemy => {
        if (!enemy || !enemy.visible || enemy.userData.phase !== 'battle') return;
        
        if (enemy.userData.nextRandomExplosion === undefined) {
            enemy.userData.nextRandomExplosion = time + 3 + Math.random() * 8;
        }
        
        if (time > enemy.userData.nextRandomExplosion) {
            if (Math.random() < 0.3) {
                destroyEnemy(enemy);
            } else {
                const nearPos = enemy.position.clone().add(
                    new THREE.Vector3(
                        (Math.random() - 0.5) * 40,
                        (Math.random() - 0.5) * 40,
                        (Math.random() - 0.5) * 40
                    )
                );
                createQuickExplosion(nearPos, 10);
            }
            enemy.userData.nextRandomExplosion = time + 4 + Math.random() * 8;
        }
    });
    
    // TIE explosent aléatoirement
    friendlyShips.forEach(tie => {
        if (!tie || !tie.visible || tie.userData.phase !== 'battle') return;
        
        if (tie.userData.nextRandomExplosion === undefined) {
            tie.userData.nextRandomExplosion = time + 3 + Math.random() * 8;
        }
        
        if (time > tie.userData.nextRandomExplosion) {
            if (Math.random() < 0.3) {
                destroyTie(tie);
            } else {
                const nearPos = tie.position.clone().add(
                    new THREE.Vector3(
                        (Math.random() - 0.5) * 40,
                        (Math.random() - 0.5) * 40,
                        (Math.random() - 0.5) * 40
                    )
                );
                createQuickExplosion(nearPos, 10);
            }
            tie.userData.nextRandomExplosion = time + 4 + Math.random() * 8;
        }
    });
}

// -------------------------------------------------------------------
// 9. DESTRUCTION DES TIE
// -------------------------------------------------------------------
function destroyTie(tie) {
    if (!tie || tie.userData.dead || tie.userData.phase !== 'battle') return;
    if (!battleOn()) return;
    tie.userData.dead = true;
    tie.visible = false;

    fx.explosion(tie.position.clone(), 15);
    debris.spawn(tie.position, 5, { speed: [10, 40], size: [0.8, 2.5], life: [2, 4], baseVel: tie.userData.velocity, hot: 0.6 });
    tie.userData.phase = 'pool';
}
// -------------------------------------------------------------------
// 10. FONCTION DE MISE À JOUR GLOBALE
// -------------------------------------------------------------------

function updateCombat(dt) {
    if (!tieModel) return;
    
    updateTieWaves(dt);
    updateTies(dt);
    updateShooting(dt);
    updateLasers(dt);
    randomExplosions(dt);
}

//======================== OK =====================================================






// ===================================================================
// GRANDS CROISEURS REBELLES (logique dans src/fleet.js)
// ===================================================================
const debris = new DebrisField(scene, fx);

// Destroyers impériaux que les croiseurs doivent éviter :
// la coque du destroyer du joueur (approchée par des sphères) + ceux qui tournent autour
// (la coque de l'Executor est sous la zone des croiseurs : seule la tourelle dépasse)
const HULL_SPHERES = [
    { center: new THREE.Vector3(0, -40, 0), radius: 350 }
];
function imperialObstacles() {
    const list = HULL_SPHERES.slice();
    pivot.children.forEach(sd => list.push({ center: sd.getWorldPosition(new THREE.Vector3()), radius: 380 }));
    return list;
}

const rebelFleet = new RebelFleet({
    scene, fx, debris,
    obstacles: imperialObstacles,
    // un croiseur qui arrive pendant la bataille amène son escadrille d'X-Wing
    onArrive: (ship) => {
        if (!battleOn()) return;
        launchSquadron(ship);
        setTimeout(() => { if (battleOn() && ship.state === 'cruise') launchSquadron(ship); }, 1800);
    },
    onPartDestroyed: () => {}   // son : la grosse explosion joue déjà un "boom" spatialisé
});

const capitalTemplates = [null, null, null];
['public/capital_part1.glb', 'public/capital_part2.glb', 'public/capital_part3.glb'].forEach((url, i) => {
    gltfLoader.load(url, (gltf) => {
        const part = gltf.scene;
        part.scale.set(0.5, 0.5, 0.5);
        part.rotation.y = Math.PI / 2;
        capitalTemplates[i] = part;
        // Home One (MC80) : 3 parties avant / milieu / arrière
        if (capitalTemplates.every(Boolean)) rebelFleet.addType('homeone', { parts: capitalTemplates, hits: 10, radius: 380, speed: 24 });
    });
});

// Autres vaisseaux rebelles (une seule partie). Même pack que le Home One :
// même échelle (0.5) et même orientation (réacteurs à l'arrière, avant → +X).
//   hits : tirs pour le détruire, radius : taille (évitements, explosions, place des escadrilles)
[
    { name: 'liberty',   url: 'public/liberty.glb',   hits: 16, radius: 380, speed: 22 },   // ~700 de long
    { name: 'frigate',   url: 'public/frigate.glb',   hits: 10, radius: 170, speed: 28 },   // Nebulon-B, ~300
    // corvette CR-90 : version allégée, agrandie ×3 (sinon on la voyait à peine) et qui
    // navigue plus près du pont pour être bien visible depuis les fenêtres
    { name: 'cr90',      url: 'public/CR90_lite.glb', hits: 8,  radius: 130, speed: 40, scale: 1.5,
      zone: { minZ: 550, maxZ: 1500, maxX: 900, minY: 150, maxY: 420 } },                    // ~225 de long
    // transport GR-75 : agrandi ×4,4 (à 45 de long, il était invisible au loin)
    { name: 'transport', url: 'public/transport.glb', hits: 6,  radius: 115, speed: 32, scale: 2.2,
      zone: { minZ: 700, maxZ: 1900, maxX: 1100, minY: 150, maxY: 450 } }                    // ~195 de long
].forEach(t => {
    gltfLoader.load(t.url, (gltf) => {
        const ship = gltf.scene;
        ship.scale.setScalar(t.scale || 0.5);
        ship.rotation.y = Math.PI / 2;
        const def = { parts: [ship], hits: t.hits, radius: t.radius, speed: t.speed };
        if (t.zone) def.zone = t.zone;
        rebelFleet.addType(t.name, def);
    });
});

//===================================================
// CONTROL SCREEN
//===================================================


function toggleCtrlScreen() {

    if (ctrlScreenVisible) {
        ctrlScreenFadeDirection = -1; // fade out
    } else {
        ctrlScreenFadeDirection = 1; // fade in
        ctrlscreen.play(); // démarre la vidéo si on l'allume
        ctrlscreenon.play()
    }

    ctrlScreenVisible = !ctrlScreenVisible;
    ctrlscreenoff.play()
}

function updateCtrlScreenFade(dt) {

    if (ctrlScreenFadeDirection === 0) return;

    // fade
    ctrlMaterial.opacity += ctrlScreenFadeDirection * ctrlScreenFadeSpeed * dt;
    ctrlMaterial.opacity = THREE.MathUtils.clamp(ctrlMaterial.opacity, 0, 1);

    // scale TV
    ctrlPlane.scale.x += ctrlScreenFadeDirection * ctrlScreenFadeSpeed * dt;
    ctrlPlane.scale.x = THREE.MathUtils.clamp(ctrlPlane.scale.x, 0, 1);

    if (ctrlMaterial.opacity === 0) {

        ctrlScreenFadeDirection = 0;
        ctrlscreen.pause();

    }

    if (ctrlMaterial.opacity === 1) {

        ctrlScreenFadeDirection = 0;

    }
}





// ===================================================
// LOAD JSON      JSON        JSON
// ===================================================
// Formes en binaire (x,y,z en Float32) : ~10 Mo au lieu de ~200 Mo de JSON.
// Générées depuis les JSON d'origine par tools/holo-to-bin.mjs
function loadShape(name) {
    return fetch('public/holo/' + name + '.bin')
        .then(r => r.ok ? r.arrayBuffer() : Promise.reject('File not found ' + name))
        .then(buf => new Float32Array(buf));
}

const HOLO_SHAPES = ['empire', 'tiefighter', 'tieinterceptor', 'tiebomber', 'atst', 'atat',
                     'stardestroyer', 'deathstar', 'darkmaul', 'darkvador', 'kylo', 'galaxy'];

Promise.all(HOLO_SHAPES.map(loadShape)).then(list => {

    // l'empire deux fois de suite pour le "battement" (comme avant)
    const shapes = [list[0], ...list];

    const maxCount = Math.max(...shapes.map(s => s.length / 3));

    const formattedShapes = shapes.map(shape => {
        const count = shape.length / 3;
        const arr = new Float32Array(maxCount * 3);
        for (let i = 0; i < maxCount; i++) {
            const j = (i % count) * 3;
            arr[i*3+0] = shape[j];
            arr[i*3+1] = shape[j + 1];
            arr[i*3+2] = shape[j + 2];
        }
        return arr;
    });

    initMorphSystem(formattedShapes, maxCount); // ✅ on passe la variable

});


function initMorphSystem(shapesArray, count){

    shapes = shapesArray;

    currentIndex = 0;
    nextIndex = 1;

    const geometry = new THREE.BufferGeometry();

    positionAttr = new THREE.BufferAttribute(
        shapes[currentIndex].slice(), 3
    );

    targetAttr = new THREE.BufferAttribute(
        shapes[nextIndex].slice(), 3
    );

    // 🔥 seed obligatoire pour ton shader
    const seed = new Float32Array(count);
    for(let i=0;i<count;i++){
        seed[i] = Math.random();
    }

    geometry.setAttribute('position', positionAttr);
    geometry.setAttribute('target', targetAttr);
    geometry.setAttribute('seed', new THREE.BufferAttribute(seed,1));

    material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,

    uniforms: {
        morph: { value: 0 },
        time: { value: 0 },
        globalRotation: { value: 0 },
        uOpacity: { value: 0 } // 👈 AJOUT
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

        // 1️⃣ Morph
        vec3 pos = mix(position, target, morph);

        // 2️⃣ Micro vibration holographique
        float a = seed * 6.283185 + time * 1.5;
        pos += vec3(
            cos(a) * 0.03,
            sin(a * 1.3) * 0.03,
            sin(a * 0.7) * 0.03
        );

        // 3️⃣ Rotation globale Y
        pos = rotationY(globalRotation) * pos;

        // 4️⃣ Projection
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        // 5️⃣ Taille perspective
        float perspective = 1.0 / -mvPosition.z;
        gl_PointSize = clamp(18.0 * perspective, 1.5, 6.0);
    }
    `,

    fragmentShader: `
    precision mediump float;
    uniform float time;
    uniform float uOpacity;

    void main(){

        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);

        float core = exp(-d*d*70.0);
        float ring = exp(-d*d*18.0);
        float halo = exp(-d*d*4.0);

        vec3 color =
            vec3(1.4,1.8,2.6)*core +
            vec3(0.4,1.0,2.4)*ring +
            vec3(0.12,0.45,1.6)*halo;

        // scan hologramme
        float scan = sin(gl_FragCoord.y * 0.1 + time*5.0)*0.1;
        color += scan;

        color = pow(color, vec3(0.85));

        float alpha = halo * 0.65 * uOpacity;
        gl_FragColor = vec4(color, alpha);
    }
    `
});

particleSystem = new THREE.Points(geometry, material);
particleSystem.scale.set(0.3,0.3,0.3);
particleSystem.position.set(0,1,0);
particleSystem.visible = true; // on le laisse visible, on contrôle juste l'opacité
scene.add(particleSystem);
// (pas de bloom sur l'hologramme : ses particules brillent déjà, c'était trop)
// (la boucle animate() est déjà lancée en bas du fichier : l'appeler ici
//  créait une 2e boucle et tout tournait deux fois par image)
}




function setOpacityRecursive(object, opacity) {
    object.traverse((child) => {
        if (child.isMesh) {
            child.material.transparent = true;
            child.material.opacity = opacity;
        }
    });
}

const objectsToFade = [];

const tie = scene.getObjectByName("tie_fighter0");
const pivot2 = scene.getObjectByName("pivot");

if (tie) objectsToFade.push(tie);
if (pivot2) objectsToFade.push(pivot2);

objectsToFade.forEach(obj => {
    obj.userData.originalPosition = obj.position.clone();
});



// =====================================================================================================================
// DEPLACEMENT                      PLAYER                                                  CLAVIER
// =====================================================================================================================

// Crée un player pour gérer la rotation globale
const player = new THREE.Group();
player.position.set(0,3.5,-60); // position initiale
player.rotation.y = Math.PI;

scene.add(player);
player.add(camera); // caméra dans le player


const cursorDiv = document.createElement('div');
cursorDiv.id = 'cursor-target';
cursorDiv.innerHTML = `
    <svg width="60" height="60" viewBox="0 0 60 60">
        <!-- Cercle extérieur fin -->
        <circle cx="30" cy="30" r="14" stroke="#ff6600" stroke-width="2" fill="none" stroke-opacity="0.8"/>
        
        <!-- Deuxième cercle intérieur plus petit -->
        <circle cx="30" cy="30" r="6" stroke="#ff6600" stroke-width="1.5" fill="none" stroke-opacity="0.6"/>
        
        <!-- Grande croix (tirets) -->
        <line x1="30" y1="10" x2="30" y2="20" stroke="#ff6600" stroke-width="2" stroke-opacity="0.8"/>
        <line x1="30" y1="40" x2="30" y2="50" stroke="#ff6600" stroke-width="2" stroke-opacity="0.8"/>
        <line x1="10" y1="30" x2="20" y2="30" stroke="#ff6600" stroke-width="2" stroke-opacity="0.8"/>
        <line x1="40" y1="30" x2="50" y2="30" stroke="#ff6600" stroke-width="2" stroke-opacity="0.8"/>
        
        <!-- Petite croix centrale -->
        <line x1="30" y1="26" x2="30" y2="28" stroke="#ff6600" stroke-width="2.5" stroke-opacity="1"/>
        <line x1="30" y1="32" x2="30" y2="34" stroke="#ff6600" stroke-width="2.5" stroke-opacity="1"/>
        <line x1="26" y1="30" x2="28" y2="30" stroke="#ff6600" stroke-width="2.5" stroke-opacity="1"/>
        <line x1="32" y1="30" x2="34" y2="30" stroke="#ff6600" stroke-width="2.5" stroke-opacity="1"/>
        
        <!-- Point central -->
        <circle cx="30" cy="30" r="2" fill="#ff6600" fill-opacity="0.9"/>
    </svg>
`;
document.body.appendChild(cursorDiv);

// Styles
cursorDiv.style.position = 'fixed';
cursorDiv.style.top = '50%';
cursorDiv.style.left = '50%';
cursorDiv.style.transform = 'translate(-50%, -50%)';
cursorDiv.style.zIndex = '999999';
cursorDiv.style.display = 'none';
cursorDiv.style.pointerEvents = 'none';
cursorDiv.style.backgroundColor = 'transparent';
cursorDiv.style.filter = 'drop-shadow(0 0 8px #ff6600)';


// vitesse
const moveSpeed = 0.5;
const rotationSpeed = 0.02;

const keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false
};

document.addEventListener("keydown", (event) => {

  if(keys.hasOwnProperty(event.key)) {

    // 🔊 démarre ambiance au premier mouvement
    if (!ambientStarted && ambientSound && ambientSound.buffer) {
      ambientSound.play();
      ambientStarted = true;
    }

    keys[event.key] = true;
  }

});

document.addEventListener("keyup", (event) => {
  if(keys.hasOwnProperty(event.key))

    keys[event.key] = false;
});

// Faire suivre le curseur par la souris
document.addEventListener('mousemove', (e) => {
    if (cursorDiv.style.display === 'block') {
        cursorDiv.style.left = e.clientX + 'px';
        cursorDiv.style.top = e.clientY + 'px';
    }
});

// TIR avec SPACE-BAR (maintenue) + BOOST avec MAJ en vol
let boostHeld = false;

window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
        event.preventDefault();
        fireHeldSpace = true;
    }
    if (event.key === "Shift") boostHeld = true;
});

window.addEventListener("keyup", (event) => {
    if (event.code === "Space") fireHeldSpace = false;
    if (event.key === "Shift") boostHeld = false;
});

window.addEventListener("blur", () => {
    fireHeldSpace = false;
    fireHeldMouse = false;
    boostHeld = false;
});



// =====================================================================================================================
// CLICK                           PLAYER                                   SOURIS                                CLICK
// =====================================================================================================================


camera.updateMatrixWorld(true);
renderer.domElement.addEventListener('click', (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(worldGroup.children, true);
    if(intersects.length > 0){
        const clickedObject = intersects[0].object; // <-- déclaré ici
        console.log("CLIC SUR :", clickedObject.name);

        if (clickedObject.name.includes("Side_Control_Panels_Button_Blue_0001")) {

            if (!isPlaying && video) {
                isPlaying = true;
                fadeState = "fadeIn";
                objectFade = "fadeOut"; // 👈 on lance le fade objets
                video.currentTime = 0;
                video.play();
            }
        }



// Dans ton click handler
if (clickedObject.name.includes("Table_3_Button_Blue_0")) {
    hologramActive = !hologramActive;
    hologramTarget = hologramActive ? 1 : 0;
    
    // Active/désactive le chase du bouton rouge
    chaseActive = hologramActive;
    
    // Gère le bouton bleu
    blueChaseActive = !hologramActive; // Chase actif quand hologramme ÉTEINT
    
    if (hologramActive) {
        // HOLOGRAMME ACTIF
        holoOnSound.play();
        
        // Bouton bleu : allumé fixe
        setBlueButtonState(true);
        
        // Bouton rouge : chase actif (déjà géré par chaseActive)
        
    } else {
        // HOLOGRAMME ÉTEINT
        holoOffSound2.play();
        
        // Bouton bleu : retour au chase
        setBlueButtonState(false);
        blueChaseTime = 0; // Reset du temps pour redémarrer le cycle
        
        // Bouton rouge : éteint
        resetAllButtons();
    }
}
        
        if (clickedObject.name.includes("Table_2_Button_Blue_0")) {

                open.play();
            }

        if (clickedObject.name.includes("Object_8")) {
            if (droidBody) playAt(sfx.r2, droidBody.getWorldPosition(new THREE.Vector3()), 1, 0.2); else playSoundSafe(R2);
        }

        

// ===================================================================
// BOUTON D'ACTIVATION/DÉSACTIVATION DU CANON
// ===================================================================

if (clickedObject.name.includes("Side_Control_Panels_Button_White_0001")) {

    cannonActive = !cannonActive;
    setTurret(cannonActive);
    fireHeldMouse = false;

    if (cannonActive) laseron.play();
    else laseroff.play();

    refreshHud();
}

        if (clickedObject.name.includes("Side_Control_Panels_Button_Red_0001")) {

            if (!alarmActive) {
                startAlarm();
            } else {
                stopAlarm();
            }
        }

        // Vérifier si c’est ton bouton rouge
        if (clickedObject.name.includes("Table_3_Button_Red_0")) {
            onButtonClick(); // Appelle la fonction de gestion du clic
            transittionsound.stop(); // Arrêter le son s'il est en cours de lecture
            transittionsound.play();
        }
        

        if (clickedObject.name.includes("Side_Control_Panels_Control_Panels_0001")) {

            toggleCtrlScreen();

        }

         if (clickedObject.name.includes("Table_2_Button_Blue_0")) {

                open.play();
            }

        if (clickedObject.name.includes("Side_Control_Panels_Button_White_0")) {

                button2.play();
            }

        if (clickedObject.name.includes("Back_Control_Panels_Button_White_0")) {

                button2.play();
            }

        if (clickedObject.name.includes("Side_Control_Panels_Button_Red_0")) {

                button1.play();
            }

        if (clickedObject.name.includes("Back_Control_Panels_Button_Red_0")) {

                button1.play();
            }

        if (clickedObject.name.includes("Side_Control_Panels_Button_Blue_0")) {

                button3.play();
            }

        if (clickedObject.name.includes("Back_Control_Panels_Button_Blue_0")) {

                button3.play();
            }

        if (clickedObject.name.includes("Front_Control_Panels_Button_Blue_0")) {

                button3.play();
            }

        if (clickedObject.name.includes("Object_8")) {
            if (droidBody) playAt(sfx.r2, droidBody.getWorldPosition(new THREE.Vector3()), 1, 0.2); else playSoundSafe(R2);
        }

        
            }

    // CHANGEMENT DE TIE : clic sur la console du hangar ("click here for change your TIE")
    // ou sur le TIE lui-même. Testé à part : avant, ce test n'était fait que si le clic
    // touchait AUSSI le décor de la passerelle, et il ignorait la console.
    if (isInsideShip && ships.length > 1) {
        const targets = [screenhangar, tiePlayer].filter(Boolean);
        if (raycaster.intersectObjects(targets, true).length > 0) {

            tiechange.stop();
            tiechange.play();
            hangarConsole.flash = 1;   // flash + "bouton pressé" sur la console
            hangarConsole.press = 1;
            // cacher le vaisseau actuel
            ships[shipIndex].visible = false;

            // passer au suivant
            shipIndex++;
            if (shipIndex >= ships.length) shipIndex = 0;

            // afficher le suivant
            ships[shipIndex].visible = true;

            // mettre à jour le vaisseau actif
            tiePlayer = ships[shipIndex];
        }
    }
});

// Écrans vidéo cliquables (enregistré UNE seule fois)
function onMouseClick(event) {
    const m = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(m, camera);

    const intersects = raycaster.intersectObjects(clickableObjects, true);
    if (intersects.length > 0) {
        const clickedObject = intersects[0].object;
        screens.forEach(screenObj => {
            if (clickedObject === screenObj.mesh) {
                toggleScreen(screenObj);
            }
        });
    }
}
window.addEventListener("click", onMouseClick);

// =====================================================================================================================
// TIR À LA SOURIS (maintenir le clic = tir automatique)
// =====================================================================================================================

// Un clic sur la console / un bouton ne doit pas déclencher de tir
function isUiClick() {
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObjects(worldGroup.children, true)[0];
    return !!hit && hit.distance < 45;
}

renderer.domElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    if (!isInsideShip) { fireHeldMouse = true; return; }   // en vol
    if (turretReady() && !isUiClick()) fireHeldMouse = true; // au canon
});

window.addEventListener('pointerup', () => { fireHeldMouse = false; });

// Affichage du HUD selon la situation
function refreshHud() {
    const turretMode = isInsideShip && cannonActive;
    hud.show(!isInsideShip ? 'flight' : (turretMode ? 'turret' : null));
    cursorDiv.style.display = turretMode ? 'block' : 'none';
    renderer.domElement.style.cursor = turretMode || !isInsideShip ? 'none' : '';
}

let radarTimer = 0;
const _proj = new THREE.Vector3();
function updateCombatHud(dt) {
    if (!hud.mode) return;

    const lock = hud.mode === 'flight' ? tieLock : turret.lock;
    if (lock) {
        _proj.copy(lock.position).project(camera);
        const onScreen = _proj.z < 1 && Math.abs(_proj.x) < 1 && Math.abs(_proj.y) < 1;
        hud.showLock((_proj.x + 1) / 2 * window.innerWidth, (1 - _proj.y) / 2 * window.innerHeight, onScreen);
    } else {
        hud.showLock(0, 0, false);
    }

    radarTimer -= dt;
    if (radarTimer <= 0) {
        radarTimer = 0.1;
        const xs = enemies.filter(e => e.visible).map(e => e.position);
        const caps = rebelFleet.positions();
        hud.drawRadar(player.position, player.rotation.y, xs, caps, hud.mode === 'flight' ? 1400 : 2200);
    }
}


function tryMove(moveVector) {
    if (!collisionMeshInterior || (!collisionMeshExterior && !exteriorColliders.length)) return;
    if (collisionShip) collisionShip.updateMatrixWorld(true);

    const origin = player.position.clone();
    const dir = moveVector.clone().normalize();
    const moveDistance = moveVector.length();
    const margin = Math.max(0.5, moveDistance * 0.5);

    collisionRaycaster.set(origin, dir);
    collisionRaycaster.far = moveDistance + margin;

    if (isInsideShip) {
        const hits = collisionRaycaster.intersectObject(collisionMeshInterior, true);
        if (hits.length > 0 && hits[0].distance < moveDistance + margin) return;
    } else {
        // destroyers en orbite + croiseurs rebelles (ils bougent, eux aussi)
        if (bounceOffMovingObstacles(origin, moveVector)) return;

        // coque de l'Executor (MainHull + tourelle), sauf le tunnel de sortie du hangar.
        // (l'ancienne cage extérieure était faite pour l'ancienne tour : plus utilisée dehors)
        const colliders = exteriorColliders.length ? exteriorColliders : [collisionMeshExterior];
        // on ne garde que les parois heurtées par l'EXTÉRIEUR : si on se retrouve dans une paroi,
        // on peut toujours en ressortir (avant : bloqué à l'intérieur de la tourelle)
        const facesRay = (h, d) => !h.face || h.face.normal.clone().transformDirection(h.object.matrixWorld).dot(d) < 0;
        const hits = collisionRaycaster.intersectObjects(colliders, true).filter(h => !inHangarCut(h) && facesRay(h, dir));
        if (hits.length > 0 && hits[0].distance < moveDistance + margin) {

            // ✅ IMPACT — rebond + étincelles + son
            const now = performance.now() * 0.001;
            if (now - lastCollisionTime > COLLISION_COOLDOWN) {
                lastCollisionTime = now;

                // Point d'impact et normale
                const hitPoint = hits[0].point;
                const hitNormal = hits[0].face.normal.clone()
                    .transformDirection(hits[0].object.matrixWorld)
                    .normalize();
                if (hitNormal.dot(moveVector) > 0) hitNormal.negate();   // coque double face

                // Étincelles
                createCollisionSparks(hitPoint, hitNormal, moveVector);

                // Rebond : réfléchit le vecteur de mouvement sur la normale
                const reflected = moveVector.clone().reflect(hitNormal).multiplyScalar(0.4);
                player.position.add(reflected);

                cameraShake = Math.max(cameraShake, 0.8);

                // Son
                if (metalCollisionSound && metalCollisionSound.buffer && !metalCollisionSound.isPlaying) {
                    metalCollisionSound.play();
                }
            }
            return;
        }

        const backRay = new THREE.Raycaster();
        backRay.set(origin, dir.clone().negate());
        backRay.far = margin;
        const hitsBack = backRay.intersectObjects(colliders, true).filter(h => !inHangarCut(h) && facesRay(h, dir.clone().negate()));
        if (hitsBack.length > 0) return;
    }

    player.position.add(moveVector);
}


let flightPitch = 0;
let pitchVelocity = 0;
let flightRoll = 0;
const FLIGHT_PITCH_SPEED = 1.1;   // rad/s
const FLIGHT_PITCH_LIMIT = 1.25;  // ~70°

// -------------------------------------------------------------------
// Collisions du TIE avec ce qui bouge : destroyers en orbite (vrai maillage)
// et croiseurs rebelles (ellipsoïdes) — même effet que sur la coque du décor
// -------------------------------------------------------------------
let lastFrameDt = 1 / 60;
const PIVOT_OMEGA = -0.001 * LEGACY_TICK_RATE;   // rotation du pivot des destroyers (rad/s)
const movingRay = new THREE.Raycaster();

function bounceOffMovingObstacles(origin, moveVector) {
    let hit = null;

    for (const sd of pivot.children) {
        const c = sd.getWorldPosition(new THREE.Vector3());
        if (c.distanceTo(origin) > 450) continue;
        // vitesse de la coque à cet endroit (le destroyer tourne autour du pivot)
        const r = origin.clone().sub(pivot.position);
        const vObs = new THREE.Vector3(PIVOT_OMEGA * r.z, 0, -PIVOT_OMEGA * r.x);
        const rel = moveVector.clone().addScaledVector(vObs, -lastFrameDt);
        const len = rel.length();
        if (len < 1e-4) continue;
        movingRay.set(origin, rel.clone().divideScalar(len));
        movingRay.far = len + 6;
        const h = movingRay.intersectObject(sd, true)[0];
        if (h) {
            const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : rel.clone().negate().normalize();
            if (n.dot(rel) > 0) n.negate();
            hit = { point: h.point, normal: n, velocity: vObs };
            break;
        }
    }
    if (!hit) hit = rebelFleet.collide(origin, moveVector, 8, lastFrameDt);
    if (!hit) return false;

    const now = performance.now() * 0.001;
    if (now - lastCollisionTime > COLLISION_COOLDOWN) {
        lastCollisionTime = now;
        createCollisionSparks(hit.point, hit.normal, moveVector);
        cameraShake = Math.max(cameraShake, 0.8);
        if (metalCollisionSound && metalCollisionSound.buffer && !metalCollisionSound.isPlaying) metalCollisionSound.play();
    }
    // effet repoussoir : rebond, on se dégage de la coque et on suit son mouvement
    const reflected = moveVector.clone().reflect(hit.normal).multiplyScalar(0.4);
    player.position.add(reflected).addScaledVector(hit.normal, 3).addScaledVector(hit.velocity, lastFrameDt);
    return true;
}

function updateCamera(dt = 1 / LEGACY_TICK_RATE) {
    const k = dt * LEGACY_TICK_RATE;

    // gauche / droite (même sensation qu'avant, quel que soit l'écran)
    if (keys.ArrowRight) rotationVelocity -= rotationAcceleration * 0.016 * k;
    if (keys.ArrowLeft)  rotationVelocity += rotationAcceleration * 0.016 * k;
    rotationVelocity = THREE.MathUtils.clamp(rotationVelocity, -maxRotationSpeed, maxRotationSpeed);
    player.rotation.y += rotationVelocity * k;
    rotationVelocity *= Math.pow(rotationDamping, k);

    if (playerState === "flight") {
        // EN VOL : haut / bas = monter / descendre
        const input = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
        pitchVelocity += (input * FLIGHT_PITCH_SPEED - pitchVelocity) * (1 - Math.exp(-6 * dt));
        flightPitch = THREE.MathUtils.clamp(flightPitch + pitchVelocity * dt, -FLIGHT_PITCH_LIMIT, FLIGHT_PITCH_LIMIT);

        // le TIE s'incline dans les virages
        const rollTarget = THREE.MathUtils.clamp(rotationVelocity * 10, -0.45, 0.45);
        flightRoll += (rollTarget - flightRoll) * (1 - Math.exp(-5 * dt));
    } else {
        // À PIED : retour à l'horizontale + avancer / reculer
        const back = 1 - Math.exp(-6 * dt);
        flightPitch += (0 - flightPitch) * back;
        flightRoll += (0 - flightRoll) * back;
        pitchVelocity = 0;

        let moveVector = new THREE.Vector3();
        if (keys.ArrowUp)    moveVector.z -= walkSpeed * k;
        if (keys.ArrowDown)  moveVector.z += walkSpeed * k;

        if (moveVector.length() > 0) {
            moveVector.applyQuaternion(player.quaternion);
            tryMove(moveVector);
        }
    }

    camera.rotation.x = flightPitch;
    camera.rotation.z = flightRoll;
}




// ==================
// RESIZE
// ==================
window.addEventListener('resize',()=>{
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    bloomComposer.setSize(window.innerWidth, window.innerHeight);
});


    let mouseX = 0;
    let mouseY = 0;


renderer.domElement.addEventListener("mousemove", (event) => {

    const rect = renderer.domElement.getBoundingClientRect();

    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

});


let shapes;
let positionAttr;
let targetAttr;

let currentIndex = 0;
let nextIndex = 1;
let morphSpeed = 0.4;
let morphState = "morph"; // "morph" ou "pause"
let pauseTimer = 0;

const morphDuration = 2.0;   // durée du morph
const pauseDuration = 5.0;   // durée de pause


// =================
// Fonction ouverture des portes
// =================

// BOX de detection

const trigger = new THREE.Mesh(
    new THREE.BoxGeometry(30, 20, 30),
    new THREE.MeshBasicMaterial({ visible: false }), 
);
    trigger.position.set(0,0,-35);
scene.add(trigger);



// Ouverture

let previousDoorState = false;

function updateDoors(k = 1) {

    if(!doorleft || !doorright) return;

    const speed = 1 - Math.pow(1 - 0.05, k);
    const openOffset = 12;

    const targetLeftX  = doorState ? 12 - openOffset : -12;
    const targetRightX = doorState ? -12 + openOffset : 12;

    // 🔊 Joue le son seulement si l'état change
    if (doorState !== previousDoorState) {
        if (doorSound && doorSound.buffer) {
            doorSound.play();
        }
        previousDoorState = doorState;
    }

    doorleft.position.x  = THREE.MathUtils.lerp(
        doorleft.position.x,
        targetLeftX,
        speed
    );

    doorright.position.x = THREE.MathUtils.lerp(
        doorright.position.x,
        targetRightX,
        speed
    );
}

// =======================================================================
// ENTER / EXIT SHIP
//========================================================================

// Mode

function enableFlightMode() {
    playerState = "flight";
    refreshHud();
}

function enableWalkMode() {
    playerState = "walk";
    refreshHud();
}

// SON

function switchToShipAudio() {

    if (ambienttie && ambienttie.isPlaying) {
        ambienttie.stop();
    }

    if (tieOff && tieOff.buffer) {
        tieOff.play();
    }

    setTimeout(() => {
        if (ambientSound && !ambientSound.isPlaying) {
            ambientSound.play();
        }
    }, 1000);
    
}

function switchToFlightAudio() {

    if (ambientSound && ambientSound.isPlaying) {
        ambientSound.stop();
    }

    if (tieOn && tieOn.buffer) {
        tieOn.play();
    }

    // attendre la fin du son tieOn (~1.5s par exemple)
    setTimeout(() => {
        if (ambienttie && !ambienttie.isPlaying) {
            ambienttie.play();
        }
    }, 1500);
}

// FONCTION

function exitShip() {

    console.log("Sortie du vaisseau");
    isInsideShip = false;

    if (tiePlayer) tiePlayer.visible = false;
    if (cockpit) cockpit.visible = true;

    switchToFlightAudio();

    enableFlightMode();

    // pilote automatique : traversée du tunnel de la tourelle jusqu'à l'extérieur
    startAutopilot([player.position.clone(), new THREE.Vector3(0, 3.5, -130), HANGAR_OUTSIDE.clone()], 0, 2.2);
}

function enterShip() {

    console.log("Entrée dans le vaisseau");
    isInsideShip = true;
    playerState = "flight";

    if (tiePlayer) tiePlayer.visible = true;
    if (cockpit) cockpit.visible = false;

    switchToShipAudio();

    enableWalkMode();
}


function updateinout() {

    if (!gameReady || !detectionMesh) return;

    // Met à jour la box de détection dynamiquement
    detectionMesh.updateWorldMatrix(true, true);
    detectionBox.setFromObject(detectionMesh);
    //const helper = new THREE.Box3Helper(detectionBox, 0xff0000);
    //scene.add(helper);

    // Met à jour la box du player
    playerBox.setFromObject(player);

    if (playerBox.intersectsBox(detectionBox)) {

        if (!isInsideShip) {
            enterShip();
        }

    } else {

        if (isInsideShip) {
            exitShip();
        }

    }
}
console.log("Player:", player.position);
console.log("Detection:", detectionBox);


// ------------------------------------------------------------
// Fonction morph suivant avec bouton
// ------------------------------------------------------------
function onButtonClick() {
    if (!material || !positionAttr || !targetAttr) return;

    // Préparer la prochaine forme
    positionAttr.array.set(targetAttr.array);
    positionAttr.needsUpdate = true;

    currentIndex = nextIndex;
    nextIndex = (nextIndex + 1) % shapes.length;

    targetAttr.array.set(shapes[nextIndex]);
    targetAttr.needsUpdate = true;

    // Reset morph pour lancer la transition
    material.uniforms.morph.value = 0;
    morphState = "morph";
}






// =========================================================================================
// SON SPATIALISÉ (explosions, lasers, bips du droïde)
// =========================================================================================
// Chaque son est joué à l'endroit où il se produit : plus fort quand c'est proche,
// à gauche / à droite selon sa position. Petits groupes de "voix" réutilisées.
function makePositionalPool(urls, count, volume, refDistance) {
    const list = Array.isArray(urls) ? urls : [urls];
    const pool = { voices: [], buffers: [], volume, next: 0, last: 0 };
    list.forEach((url, i) => audioLoader.load(url, b => { pool.buffers[i] = b; }));
    for (let i = 0; i < count; i++) {
        const holder = new THREE.Object3D();
        const voice = new THREE.PositionalAudio(listener);
        voice.setRefDistance(refDistance);
        voice.setRolloffFactor(1);
        voice.setDistanceModel('inverse');
        holder.add(voice);
        scene.add(holder);
        pool.voices.push({ holder, voice });
    }
    return pool;
}

/** Joue un son du groupe à une position (minGap : délai mini entre deux sons du groupe). */
function playAt(pool, position, volumeMul = 1, minGap = 0.05, rate = 1) {
    const now = performance.now() * 0.001;
    const buffers = pool.buffers.filter(Boolean);
    if (!buffers.length || now - pool.last < minGap) return;
    pool.last = now;
    const v = pool.voices[pool.next];
    pool.next = (pool.next + 1) % pool.voices.length;
    if (v.voice.isPlaying) v.voice.stop();
    v.voice.setBuffer(buffers[Math.floor(Math.random() * buffers.length)]);
    v.voice.setVolume(pool.volume * volumeMul);
    v.voice.setPlaybackRate(rate);
    v.holder.position.copy(position);
    v.holder.updateMatrixWorld();
    v.voice.play();
}

const sfx = {
    explosion: makePositionalPool('public/explosion.mp3', 8, 1.6, 160),
    boom:      makePositionalPool('public/boom.mp3', 4, 2.2, 400),
    laser:     makePositionalPool('public/laser.mp3', 8, 0.5, 120),       // tirs rouges (canon, X-Wing)
    tieLaser:  makePositionalPool('public/tielaser.mp3', 8, 0.6, 120),    // tirs verts des TIE
    r2:        makePositionalPool(['public/R2.WAV', 'public/R2 1.WAV', 'public/R2 2.WAV', 'public/R2 3.WAV',
                                   'public/R2 4.WAV', 'public/R2 5.WAV', 'public/R2 7.WAV', 'public/R2 8.WAV',
                                   'public/R2 9.WAV'], 2, 1.0, 25)
};

// Toutes les explosions GLSL font maintenant du bruit, là où elles ont lieu
const _cameraWorld = new THREE.Vector3();
const _explosionFX = fx.explosion.bind(fx);
fx.explosion = (pos, radius = 15, tint) => {
    _explosionFX(pos, radius, tint);
    camera.getWorldPosition(_cameraWorld);
    if (pos.distanceTo(_cameraWorld) > 5000) return;
    const vol = THREE.MathUtils.clamp(radius / 20, 0.5, 2.5);
    if (radius >= 60) playAt(sfx.boom, pos, vol / 2, 0.25, 0.9 + Math.random() * 0.2);
    else playAt(sfx.explosion, pos, vol, 0.06, 0.85 + Math.random() * 0.3);
};

// Tirs des vaisseaux de la bataille (limités pour ne pas saturer)
function laserSoundAt(pos, rebel) {
    camera.getWorldPosition(_cameraWorld);
    if (pos.distanceTo(_cameraWorld) > 1200) return;
    playAt(rebel ? sfx.laser : sfx.tieLaser, pos, 1, 0.12, 0.9 + Math.random() * 0.2);
}

// ---------------- Bips du droïde quand il passe près de la caméra ----------------
let droidBody = null;
let droidBeepCooldown = 0;
let droidWasNear = false;
const _droidPos = new THREE.Vector3();
const DROID_NEAR = 60;          // distance à partir de laquelle il "parle"

function updateDroidBeeps(dt) {
    if (!droidBody || !isInsideShip) return;
    droidBody.getWorldPosition(_droidPos);
    camera.getWorldPosition(_cameraWorld);
    const near = _droidPos.distanceTo(_cameraWorld) < DROID_NEAR;
    droidBeepCooldown -= dt;
    // un bip en arrivant près de nous, puis de temps en temps tant qu'il reste proche
    if (near && (!droidWasNear || droidBeepCooldown <= 0) && droidBeepCooldown <= 1.5) {
        playAt(sfx.r2, _droidPos, 1, 0.5);
        droidBeepCooldown = 4 + Math.random() * 4;
    }
    droidWasNear = near;
}

// =========================================================================================
// BLOOM (halo lumineux) — uniquement sur les objets "lumineux"
// =========================================================================================
// Ces objets sont aussi rendus sur le calque BLOOM_LAYER. On les dessine seuls, en
// demi-résolution, on les floute, et on ajoute ce halo par-dessus l'image normale
// (qui, elle, ne change pas).
const BLOOM_LAYER = 1;
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

// objets lumineux
bolts.mesh.layers.enable(BLOOM_LAYER);
fx.points.layers.enable(BLOOM_LAYER);
landingBeacon.traverse(o => o.layers.enable(BLOOM_LAYER));
ctrlPlane.layers.enable(BLOOM_LAYER);   // écran MAP holographique
// (hyperespace, console du hangar, hologramme : volontairement SANS bloom)
function enableBloom(root) { root.traverse(o => o.layers.enable(BLOOM_LAYER)); }

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

// =========================================================================================
// VOLUME — petit bouton discret en haut à gauche
// =========================================================================================
// Clic sur le haut-parleur : couper / remettre le son. Survol : curseur de volume.
// Règle TOUT : effets, sons spatialisés, ambiance et vidéos. Mémorisé d'une visite à l'autre.
let masterVolume = 1;
function setMasterVolume(v) {
    masterVolume = THREE.MathUtils.clamp(v, 0, 1);
    [listener, listener2, listener3, listener4].forEach(l => l.setMasterVolume(masterVolume));
    ambientEl.volume = 0.5 * masterVolume;
    [video, video2, video3, video4, video5, ctrlscreen].forEach(el => { el.volume = masterVolume; });
    try { localStorage.setItem('dan-volume', String(masterVolume)); } catch (e) { /* stockage indisponible */ }
    volumeIcon.textContent = masterVolume === 0 ? '🔇' : masterVolume < 0.5 ? '🔉' : '🔊';
    volumeSlider.value = String(Math.round(masterVolume * 100));
}

const volumeBox = document.createElement('div');
volumeBox.style.cssText = 'position:fixed;top:12px;left:12px;z-index:99999;display:flex;align-items:center;gap:8px;' +
    'padding:4px 8px;border-radius:18px;background:rgba(0,0,0,.35);opacity:.35;transition:opacity .25s;user-select:none;';
const volumeIcon = document.createElement('div');
volumeIcon.style.cssText = 'font-size:18px;cursor:pointer;line-height:1;';
volumeIcon.title = 'Son';
const volumeSlider = document.createElement('input');
volumeSlider.type = 'range';
volumeSlider.min = '0'; volumeSlider.max = '100';
volumeSlider.tabIndex = -1;
volumeSlider.style.cssText = 'width:0;opacity:0;transition:width .25s,opacity .25s;accent-color:#FFE81F;cursor:pointer;';
volumeBox.append(volumeIcon, volumeSlider);
document.body.appendChild(volumeBox);

volumeBox.addEventListener('mouseenter', () => { volumeBox.style.opacity = '1'; volumeSlider.style.width = '90px'; volumeSlider.style.opacity = '1'; });
volumeBox.addEventListener('mouseleave', () => { volumeBox.style.opacity = '.35'; volumeSlider.style.width = '0'; volumeSlider.style.opacity = '0'; });
let volumeBeforeMute = 1;
volumeIcon.addEventListener('click', () => {
    if (masterVolume > 0) { volumeBeforeMute = masterVolume; setMasterVolume(0); }
    else setMasterVolume(volumeBeforeMute || 1);
});
volumeSlider.addEventListener('input', () => setMasterVolume(Number(volumeSlider.value) / 100));
// ne jamais garder le clavier : les flèches servent à piloter
volumeSlider.addEventListener('change', () => volumeSlider.blur());
volumeSlider.addEventListener('keydown', e => e.preventDefault());

{
    let saved = 1;
    try { const s = localStorage.getItem('dan-volume'); if (s !== null && !isNaN(Number(s))) saved = Number(s); } catch (e) { /* ignore */ }
    setMasterVolume(saved);
}

const INTERIOR_CENTER = new THREE.Vector3(0, 0, 30);
const INTERIOR_RANGE = 450;
let interiorWasOn = true;

let envBlink = 0;
let envToggle = false;
let levitationClock = new THREE.Clock();
let baseY = null; // pas encore défini

// =========================================================================================
// =========================================================================================
// ANIMATION     ANIMATION        ANIMATION           ANIMATION           ANIMATION
// =========================================================================================
// =========================================================================================

function animate(){

    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.1);  // évite un saut énorme après un changement d'onglet
    const k = dt * LEGACY_TICK_RATE;             // équivalent "nombre d'images" de l'ancienne boucle
    lastFrameDt = dt;

    if (autopilot.active) {
        currentFlightSpeed = FLIGHT_CRUISE_SPEED;   // le pilote automatique gère la trajectoire
    } else if (playerState === "flight") {
        const targetSpeed = boostHeld ? FLIGHT_BOOST_SPEED : FLIGHT_CRUISE_SPEED;
        currentFlightSpeed += (targetSpeed - currentFlightSpeed) * (1 - Math.exp(-2.5 * dt));
        // direction de la caméra
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);

        // ✅ avancer automatiquement via tryMove pour la collision
        const flightMove = direction.clone().multiplyScalar(currentFlightSpeed * dt);
        tryMove(flightMove);
    } else {
        currentFlightSpeed = 12; // le TIE repart doucement à la sortie du hangar
    }

    if (!material) return;

    // Mettre à jour le temps pour d'autres effets éventuels
    material.uniforms.time.value += dt;

    // Si une morph est en cours, on incrémente la progression
    if (morphState === "morph") {
        material.uniforms.morph.value += dt / morphDuration;

        if (material.uniforms.morph.value >= 1) {
            material.uniforms.morph.value = 1;
            morphState = "done"; // Transition terminée
        }
    }

    // Intérieur de la passerelle (16 personnages animés, droïdes, portes…) : inutile de
    // l'animer et de le dessiner quand on vole loin de la tour, il est invisible de là.
    const interiorOn = isInsideShip || player.position.distanceToSquared(INTERIOR_CENTER) < INTERIOR_RANGE * INTERIOR_RANGE;
    if (interiorOn !== interiorWasOn) {
        interiorWasOn = interiorOn;
        for (const child of worldGroup.children) {
            if (child.name !== 'tie_fighter0' && child.name !== 'bridge_shell') child.visible = interiorOn;
        }
    }
    mixers.forEach(m => { if (interiorOn || m.alwaysUpdate) m.update(dt); });

    // rotation du pivot autour de Y
    pivot.rotation.y -= 0.001 * k; // vitesse de rotation
    material.uniforms.time.value += dt;
    material.uniforms.globalRotation.value += dt * 0.2;
    if (autopilot.active) updateAutopilot(dt);
    else updateCamera(dt);
    updateLanding(dt);
    
    if (doorleft && doorright) {

    const distance = player.position.distanceTo(trigger.position);

    if (distance < 15) {
        doorState = 1; // ouvrir
    } else {
        doorState = 0; // fermer
    }

    // pendant l'hyperespace : fond bleu nuit au lieu des étoiles (rien ne dépasse de l'écran)
    if (screenMaterial) {
        const hyper = screenMaterial.opacity > 0.5;
        scene.background = hyper ? HYPERSPACE_BG : null;
        skybox.visible = !hyper;
    }

    if (isPlaying && screenMaterial && video) {
    if (fadeState === "fadeIn") {
        screenMaterial.opacity += fadeSpeed * k;
        if (screenMaterial.opacity >= 1) {
            screenMaterial.opacity = 1;
            fadeState = "playing";
        }
    }
    else if (fadeState === "playing") {
        if (video.currentTime >= video.duration - 0.1 ) fadeState = "fadeOut";
        
    }
    else if (fadeState === "fadeOut") {
        screenMaterial.opacity -= fadeSpeed * k;
        if (screenMaterial.opacity <= 0) {
            boom.play();
            screenMaterial.opacity = 0;
            video.pause();
            video.currentTime = 0;
            fadeState = "idle";
            isPlaying = false;
            objectFade = "fadeIn"; // 👈 on relance l’apparition
        }
    }
}



// 🎬 Fade des objets 3D
if (objectFade === "fadeOut") {

    objectOpacity -= objectFadeSpeed * k;

    objectsToFade.forEach(obj => {

        const origin = obj.userData.originalPosition;
        if (!origin) return; // évite le crash

        obj.position.z = origin.z - (hyperMoveDistance * (1 - objectOpacity));

        setOpacityRecursive(obj, objectOpacity);
    });

    if (objectOpacity <= 0) {
        objectOpacity = 0;

        objectsToFade.forEach(obj => {
            obj.visible = false;
        });

        objectFade = "hidden";
    }
}

else if (objectFade === "fadeIn") {

    objectOpacity += objectFadeSpeed * k;

    objectsToFade.forEach(obj => {

        // 🔒 Si jamais la position originale n’existe pas,
        // on la recrée automatiquement
        if (!obj.userData.originalPosition) {
            obj.userData.originalPosition = obj.position.clone();
        }

        const origin = obj.userData.originalPosition;

        obj.visible = true;

        obj.position.z = origin.z + (hyperMoveDistance * (1 - objectOpacity));

        setOpacityRecursive(obj, objectOpacity);
    });

    if (objectOpacity >= 1) {

        objectOpacity = 1;

        objectsToFade.forEach(obj => {
            if (obj.userData.originalPosition) {
                obj.position.copy(obj.userData.originalPosition);
            }
        });

        objectFade = "idle";
    }
}
}
    updateDoors(k);
    

    // ===== Hologram Fade =====
    if (material) {
        hologramOpacity = THREE.MathUtils.lerp(
            hologramOpacity,
            hologramTarget,
            1 - Math.pow(1 - hologramFadeSpeed, k)
        );

    material.uniforms.uOpacity.value = hologramOpacity;
    }
    

    // ======= Levitation TIE PLAYER =====================

    if (baseY === null && tiePlayer) baseY = tiePlayer.position.y;

    const t = levitationClock.getElapsedTime();

    if (tiePlayer) {
        // lévitation fluide : amplitude + vitesse ajustables
        tiePlayer.position.y = baseY + Math.sin(t * 2) * 0.2;

    }


    updateinout();
    updateExecutorTower();

    // retour à hauteur de marche une fois rentré dans le vaisseau
    if (isInsideShip) {
        player.position.y += (3.5 - player.position.y) * (1 - Math.exp(-5 * dt));
    }

    // ===== ARMES & EFFETS =====
    updateTurret(dt);
    updateTieGuns(dt);
    updateHangarConsole(dt);
    updatePatrols(dt);
    updateSkybox(dt);

/*
    if (laserMixer) {
        laserMixer.update(dt);
    };

    // si tu as d'autres mixers
    if (laserMixer) laserMixer.update(dt);
*/


if (alarmActive && panelMesh) {

    blinkTime += dt * 2.805;
    envBlink += dt * 2.805;

    const mat = panelMesh.material;

    const pulse = (Math.sin(blinkTime) + 1) / 2;

mat.emissive.set(0xff0000);
mat.emissiveIntensity = 1 + pulse * 4;

// exposition synchronisée
renderer.toneMappingExposure = 0.3 + pulse * 0.6;


// SWITCH HDR synchronisé avec le pulse
const newToggle = pulse > 0.5;

if (newToggle !== envToggle) {

    envToggle = newToggle;

    scene.environment = envToggle ? alarmHDR : mainHDRI;
}}

if (!alarmActive) {

    scene.environment = mainHDRI;
    renderer.toneMappingExposure = 0.3;
}

    if (cockpit && !isInsideShip) {

        cockpitFloatTime += dt;

        // Oscillation verticale douce
        cockpit.position.y = Math.sin(cockpitFloatTime * 1) * 0.02;

        // Légère rotation latérale
        cockpit.rotation.z = Math.sin(cockpitFloatTime * 2) * 0.01;

        // Micro pitch avant/arrière
        cockpit.rotation.x = Math.sin(cockpitFloatTime * 1.5) * 0.005;
    }


    updateCtrlScreenFade(dt);


  // Mettre à jour les X-Wing seulement s'ils existent
    updateBattleWaves(dt);
    if (enemies.length > 0) {
        updateEnemies(dt);
    }
    
    // Mettre à jour les explosions
    updateExplosions(dt);
    
    // Mettre à jour les TIE seulement s'ils existent
    if (tieModel && friendlyShips.length > 0) {
        updateCombat(dt);
    }
    rebelFleet.update(dt);
    debris.update(dt);

    for (const kind in shipInstancers) shipInstancers[kind].update();   // chasseurs instanciés
    bolts.update(dt);
    fx.update(dt, camera, renderer);
    updateCombatHud(dt);

    // secousse de caméra (tir / impact)
    if (cameraShake > 0.01) {
        camera.position.set((Math.random() - 0.5) * cameraShake, (Math.random() - 0.5) * cameraShake, 0);
        cameraShake *= Math.exp(-dt * 10);
    } else if (cameraShake > 0) {
        cameraShake = 0;
        camera.position.set(0, 0, 0);
    }

    
    updateChaseSmooth(dt);

    updateBlueChaseSmooth(dt);

    updateWhiteButtonsNuanced(dt);

    checkZones();
    

    updateDroidBeeps(dt);

    renderWithBloom();

}

// Démarrer l'animation
requestAnimationFrame(animate);
