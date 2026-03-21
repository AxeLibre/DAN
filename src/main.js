import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RGBELoader } from 'https://cdn.jsdelivr.net/npm/three@0.160/examples/jsm/loaders/RGBELoader.js';

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
    "url(/DAN/fonts/Starjedi.ttf)"
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

camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.01, 20000);
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

ambientSound = new THREE.Audio(listener2);

audioLoader2.load('public/ambient.mp3', function(buffer) {
    ambientSound.setBuffer(buffer);
    ambientSound.setLoop(true);   // ambiance en boucle
    ambientSound.setVolume(0.5);  // volume doux
});

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
    button2.setBuffer(buffer);
    button2.setLoop(false);   
    button2.setVolume(2.0);  
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
scene.background = cubeTexture;

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

const loader2 = new GLTFLoader(loadingManager);

loader2.load('public/projecteur4.glb', (gltf)=>{
    const projector = gltf.scene;
    projector.position.set(0,-12, 98.5);
    projector.scale.set(10,10,10);
    projector.rotation.y = Math.PI; // faire face à la caméra
    worldGroup.add(projector);
});


const loader3 = new GLTFLoader(loadingManager);

loader3.load('public/star_destroyer2.glb', (gltf)=>{

    const star_destroyer = gltf.scene;

    star_destroyer.position.set(0, 10, 900);
    star_destroyer.scale.set(30,30,30);
    star_destroyer.rotation.y = -Math.PI;

    pivot.add(star_destroyer);



const star_destroyer2 = star_destroyer.clone();
star_destroyer2.position.set(0, 20, -900);
star_destroyer2.scale.set(30,30,30);
star_destroyer2.rotation.y = Math.PI;
pivot.add(star_destroyer2);

});

const loader4= new GLTFLoader(loadingManager);
let star_destroyer0;

loader4.load('public/star_destroyer0.glb', (gltf)=>{

    star_destroyer0 = gltf.scene;
    star_destroyer0.position.set(0, -65, 300);
    star_destroyer0.scale.set(50,40,50);
    star_destroyer0.rotation.y = -Math.PI/2; // faire face à la caméra
    worldGroup.add(star_destroyer0);
});

const loader5 = new GLTFLoader(loadingManager);
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

const loader6 = new GLTFLoader(loadingManager);

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

const loader7 = new GLTFLoader (loadingManager);

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

const loader8 = new GLTFLoader (loadingManager);

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




const loader9 = new GLTFLoader (loadingManager);

loader9.load('public/hyperscreen.glb', (gltf) => {
    hyperscreen = gltf.scene;
    hyperscreen.position.set(0,-300,100);
    hyperscreen.scale.set(50,150,70);
    hyperscreen.rotation.y = Math.PI;

    hyperscreen.traverse(obj => {
        if(obj.isMesh){
            screenMaterial = new THREE.MeshBasicMaterial({ // ⚡ récupéré ici
                map: videoTexture,
                transparent: true,
                opacity: 0,
                side: THREE.DoubleSide
            });
            obj.material = screenMaterial;
        }
    });

    worldGroup.add(hyperscreen);
});




const loader10 = new GLTFLoader (loadingManager);
let doorleft, doorright;
let doorState = 0; // 0 = fermé, 1 = ouvert

loader10.load('public/doorleft.glb', (gltf)=>{
    doorleft = gltf.scene; //
    doorleft.position.set(-12,-12, 233);
    doorleft.scale.set(10,10,10);
    doorleft.rotation.y = Math.PI; 
    worldGroup.add(doorleft);
});

const loader11 = new GLTFLoader (loadingManager);

loader11.load('public/doorright.glb', (gltf)=>{
    doorright = gltf.scene; //
    doorright.position.set(12,-12, 233);
    doorright.scale.set(10,10,10);
    doorright.rotation.y = Math.PI; 
    worldGroup.add(doorright);
});

let detectionMesh;
const gltfLoader = new GLTFLoader(loadingManager);

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

gltfLoader.load('public/star_destroyer_tower2.glb', (gltf) => {
    sdt = gltf.scene;
    sdt.visible = false;
    scene.add(sdt);
    sdt.position.set(0,-12, 98.5);
    sdt.scale.set(10,10,10);
    sdt.rotation.y = Math.PI; 
});

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
});

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

const loader12 = new GLTFLoader (loadingManager);

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
        mixers.push(mixer1);
}

});

const loader13 = new GLTFLoader (loadingManager);

loader13.load('public/droid1.glb', (gltf) => {
    // Premier
    const droid1 = gltf.scene;
    droid1.position.set(0, -12, 98.5);
    droid1.scale.set(10,10,10);
    droid1.rotation.y = -Math.PI;
    worldGroup.add(droid1);
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

zones.forEach(zone => {
    const geo = new THREE.BoxGeometry(zone.size*2, zone.size*2, zone.size*2);
    const mat = new THREE.MeshBasicMaterial({color:0xff0000, wireframe:false});
    const cube = new THREE.Mesh(geo, mat);
    cube.position.copy(zone.pos);
    scene.add(cube);
});

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

function createCollisionSparks(position, normal) {
    const count = 20;
    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(count * 3);
    const velocities = [];
    const seeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
        positions[i*3]   = position.x;
        positions[i*3+1] = position.y;
        positions[i*3+2] = position.z;

        // Étincelles qui rebondissent le long de la surface (pas en sphère)
        // On projette dans le plan de la normale
        const tangent = new THREE.Vector3(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5
        ).projectOnPlane(normal).normalize();

        const speed = 2.0 + Math.random() * 5.0;
        const bounce = 0.5 + Math.random() * 1.5; // ← était 5-15

        velocities.push(new THREE.Vector3(
            tangent.x * speed + normal.x * bounce,
            tangent.y * speed + normal.y * bounce,
            tangent.z * speed + normal.z * bounce
        ));

        seeds[i] = Math.random();
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('seed',     new THREE.BufferAttribute(seeds, 1));

    const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uOpacity:    { value: 1.0 },
            uBrightness: { value: 15.0 },
            time:        { value: 0.0 }
        },
        vertexShader: `
            precision mediump float;
            attribute float seed;
            uniform float time;
            uniform float uOpacity;
            void main(){
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                float flicker = 0.5 + 0.5 * sin(time * 20.0 + seed * 6.28);
                gl_PointSize = clamp(15.0 * flicker, 3.0, 20.0);
            }
        `,
        fragmentShader: `
            precision mediump float;
            uniform float uOpacity;
            uniform float uBrightness;
            void main(){
                vec2 uv = gl_PointCoord - 0.5;
                float d = length(uv);
                float core = exp(-d * d * 8.0);
                // Couleur : blanc chaud → orange → rouge
                vec3 color = mix(vec3(1.0, 0.5, 0.1), vec3(1.0, 1.0, 0.8), core);
                gl_FragColor = vec4(color * uBrightness, core * uOpacity);
            }
        `
    });

    const system = new THREE.Points(geometry, material);
    system.userData = {
        life:    1.5,
        maxLife: 1.5,
        velocities,
        count,
        type: 'collision_sparks'
    };

    scene.add(system);
    explosionParticleSystems.push(system); // réutilise le système existant !
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




const video2 = document.createElement("video");
video2.src = "public/screen1.mp4";
video2.loop = false;
video2.muted = false; // important pour autoplay navigateur
video2.playsInline = true;
video2.pause(); // démarre en pause

const videoTexture2 = new THREE.VideoTexture(video2);
videoTexture2.colorSpace = THREE.SRGBColorSpace;

const screenMaterial2 = new THREE.MeshStandardMaterial({
    map: videoTexture2,
    roughness: 0.8,
    metalness: 0.01,
    side: THREE.DoubleSide
});

const screen = new THREE.Mesh(screenGeometry, screenOffMaterial1);

screen.position.set(-59, 6, -0.5); // ajuste selon ta scène
screen.rotation.y = Math.PI/2;
scene.add(screen);




// 1️⃣ élément vidéo HTML
const video3 = document.createElement("video");
video3.src = "public/screen2.mp4";
video3.loop = false;
video3.muted = false;
video3.playsInline = true;
video3.pause();

// 2️⃣ texture Three.js
const videoTexture3 = new THREE.VideoTexture(video3);
videoTexture3.colorSpace = THREE.SRGBColorSpace;

const screenMaterial3 = new THREE.MeshStandardMaterial({
    map: videoTexture3,
    roughness: 0.2,
    metalness: 0.4,
    side: THREE.DoubleSide
});

const screen2 = new THREE.Mesh(screenGeometry, screenOffMaterial2);

screen2.position.set(59, 6, -0.5); // ajuste selon ta scène
screen2.rotation.y = -Math.PI/2;
scene.add(screen2);





// 1️⃣ élément vidéo HTML
const video4 = document.createElement("video");
video4.src = "public/screen3.mp4";
video4.loop = false;
video4.muted = false;
video4.playsInline = true;
video4.pause();

// 2️⃣ texture Three.js
const videoTexture4 = new THREE.VideoTexture(video4);
videoTexture4.colorSpace = THREE.SRGBColorSpace;

const screenMaterial4 = new THREE.MeshStandardMaterial({
    map: videoTexture4,
    roughness: 0.2,
    metalness: 0.4,
    side: THREE.DoubleSide
});

const screen3 = new THREE.Mesh(screenGeometry, screenOffMaterial3);

screen3.position.set(58.35, 2.4, 40); // ajuste selon ta scène
screen3.scale.set(0.8, 1, 0.8)

scene.add(screen3);


// 1️⃣ élément vidéo HTML
const video5 = document.createElement("video");
video5.src = "public/screen4.mp4";
video5.loop = false;
video5.muted = false;
video5.playsInline = true;
video5.pause();

// 2️⃣ texture Three.js
const videoTexture5 = new THREE.VideoTexture(video5);
videoTexture5.colorSpace = THREE.SRGBColorSpace;

const screenMaterial5 = new THREE.MeshStandardMaterial({
    map: videoTexture5,
    roughness: 0.2,
    metalness: 0.4,
    side: THREE.DoubleSide
});

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
const laserLoader = new GLTFLoader(loadingManager);

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
// 🔊 LASER SOUND (utilise le listener global)

const laserSound = new THREE.Audio(listener);



audioLoader.load('public/laser.mp3', (buffer) => {
    laserSound.setBuffer(buffer);
    laserSound.setVolume(0.3);
});


// =================================================================
// Nouveau LASER 
// =================================================================

let laserCannon;

gltfLoader.load('public/laser_cannon.glb', (gltf) => {

    laserCannon = gltf.scene;
    laserCannon.visible = false;
    laserCannon.position.set(0,-20,165);
    laserCannon.rotation.y += Math.PI;



    scene.add(laserCannon);

});
//-----------------------------------

const aimPlane = new THREE.Plane(
    new THREE.Vector3(0,0,1),
    -200
);

//--------------------------------------
function shootLaser() {
    if (!laserCannon) return;

    const geometry = new THREE.CylinderGeometry(1, 1, 20);
    const material = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 5
    });
    const laser = new THREE.Mesh(geometry, material);
    // cylindre vertical par défaut → on l’aligne


    laserCannon.updateMatrixWorld();
    laser.position.setFromMatrixPosition(laserCannon.matrixWorld);
    

    // direction vers l’avant du canon
    const aimPoint = new THREE.Vector3();
    aimPoint.copy(laserCannon.position)
            .add(laserCannon.getWorldDirection(new THREE.Vector3()).multiplyScalar(1000));

    const direction = new THREE.Vector3().subVectors(aimPoint, laser.position).normalize();
    laser.userData.velocity = direction.clone().multiplyScalar(20);

    // aligner le laser sur sa trajectoire
    laser.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), direction);

    // glow
    const glowGeometry = new THREE.CylinderGeometry(2, 2, 20);

    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xff5555,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const glow = new THREE.Mesh(glowGeometry, glowMaterial);

    laser.add(glow);

    // Glow à la pointe du laser

    const spriteMaterial = new THREE.SpriteMaterial({
        color: 0xff4444,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
    });

    const glowSprite = new THREE.Sprite(spriteMaterial);
    glowSprite.scale.set(4, 4, 4);

    glowSprite.position.y = 10;

    laser.add(glowSprite);

    // sprite au centre du laser

    const coreGeometry = new THREE.CylinderGeometry(0.4,0.4,20);

    const coreMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite:false
    });

    const core = new THREE.Mesh(coreGeometry, coreMaterial);

    laser.add(core);

    scene.add(laser);
    lasers.push(laser);

    const flash = new THREE.PointLight(0xff4444, 15, 40);
    flash.position.setFromMatrixPosition(laserCannon.matrixWorld);
    scene.add(flash);

    setTimeout(()=>scene.remove(flash), 50);
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

const panelLoader = new GLTFLoader(loadingManager);

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
// TIE FIGHTER LASER    TIE    TIE   TIE   TIE
// ==========================================================

// 🔥 TIE LASER GLB
const tielaserLoader = new GLTFLoader(loadingManager);

let tielaserMixer;
let tielaserAction;

tielaserLoader.load('./public/tielaser.glb', (gltf) => {

    const tielaser = gltf.scene;
    tielaser.scale.set(0.02, 0.02, 0.01);
    tielaser.position.set(0,-0.5,-1.5)

    camera.add(tielaser);


    tielaserMixer = new THREE.AnimationMixer(tielaser);
    tielaserAction = tielaserMixer.clipAction(gltf.animations[0]);

    tielaserAction.setLoop(THREE.LoopOnce);
    tielaserAction.clampWhenFinished = true;
});

// 🔊 TIE LASER SOUND (utilise le listener global)

const tielaserSound = new THREE.Audio(listener);

const tieaudioLoader = new THREE.AudioLoader();

tieaudioLoader.load('public/tielaser.mp3', (buffer) => {
    tielaserSound.setBuffer(buffer);
    tielaserSound.setVolume(1);
});

// ACTION TIR

function handleSpaceAction() {

    console.log("SPACE pressée");

    // exemple : seulement si on est sorti du vaisseau
    if (!isInsideShip) {

        console.log("Action extérieure déclenchée");

        // 👉 Ici tu mets ton animation plus tard
        tielaserAction.reset();
        tielaserAction.play();

        if (tielaserSound.isPlaying) tielaserSound.stop();
        tielaserSound.play();
    }
}

// ===================================================================
// VAISSEAUX ENNEMIS - VERSION AMÉLIORÉE
// ===================================================================

// X-WING

const mothershipPosition = new THREE.Vector3(0,0,0);
const safeRadius = 200;

// Paramètres de mouvement améliorés
const MOVEMENT = {
    BASE_SPEED: 30,
    WANDER_STRENGTH: 0.5,
    FORMATION_STRENGTH: 0.3,
    AVOIDANCE_RADIUS: 40,
    TURN_SPEED: 2.0,
    WAVE_FREQUENCY: 0.8,
    MAX_SPEED: 100,
    MIN_SPEED: 30
};

gltfLoader.load('public/xwing.glb', (gltf) => {
    xwingModel = gltf.scene;
    xwingModel.visible = true;
    xwingModel.scale.set(5,5,5);
    xwingModel.position.set(0,0,0);
    xwingModel.rotation.y += Math.PI;

    // Créer les X-Wing mais les cacher
    for(let i=0; i<10; i++){
        spawnSquadron(5);
    }
    
    // Les cacher immédiatement après création
    enemies.forEach(enemy => {
        enemy.visible = false;
    });


    // FORCER UNE PREMIÈRE MISE À JOUR POUR LANCER L'ANIMATION
    if (enemies.length > 0) {
        // Simuler 5 secondes d'animation d'un coup
        for(let i = 0; i < 50; i++) {
            updateEnemies(0.1); // 50 * 0.1 = 5 secondes
        }
        console.log("Animation avancée de 5 secondes");
    }
});

const boxSize = 400;

function updateEnemies(dt) {
    // 1. TOUJOURS mettre à jour la physique, même si invisible
    enemies.forEach((enemy, index) => {
        if (!enemy) return;
        
        const vel = enemy.userData.velocity;
        
        // 2. FORCER LA DIRECTION VERS LE VAISSEAU MÈRE (Z négatif)
        vel.z = -35;
        
        // 3. MOUVEMENT EN BOUCLES
        const time = performance.now() * 0.001;
        const loopPhase = time * 0.5 + index;
        const radius = 120;
        
        const targetX = Math.sin(loopPhase) * radius + Math.sin(time * 0.2 + index) * 150;
        const targetY = Math.cos(loopPhase * 0.7) * radius + Math.cos(time * 0.3 + index) * 80;
        
        vel.x += (targetX - enemy.position.x) * 0.02 * dt * 30;
        vel.y += (targetY - enemy.position.y) * 0.02 * dt * 30;
        
        // 4. APPLICATION DU MOUVEMENT
        const newPosition = enemy.position.clone().addScaledVector(vel, dt);
        
        // 5. GESTION DE LA DISTANCE
        if (newPosition.z < 100) {
            newPosition.z = 900 + Math.random() * 300;
            newPosition.x = (Math.random() - 0.5) * 600;
            newPosition.y = (Math.random() - 0.5) * 200;
            
            vel.x = (Math.random() - 0.5) * 8;
            vel.y = (Math.random() - 0.5) * 4;
        }
        
        // 6. LIMITES LATÉRALES
        if (Math.abs(newPosition.x) > 700) {
            newPosition.x = Math.sign(newPosition.x) * 700;
            vel.x *= -0.3;
        }
        if (Math.abs(newPosition.y) > 250) {
            newPosition.y = Math.sign(newPosition.y) * 250;
            vel.y *= -0.3;
        }
        
        enemy.position.copy(newPosition);
        
        // 7. ORIENTATION (toujours basée sur la vélocité)
        if (vel.length() > 0.1) {
            const lookDir = vel.clone().normalize();
            
            if (!enemy.userData.targetQuat) {
                enemy.userData.targetQuat = new THREE.Quaternion();
            }
            
            const newTargetQuat = new THREE.Quaternion();
            newTargetQuat.setFromUnitVectors(
                new THREE.Vector3(0, 0, -1),
                lookDir
            );
            
            enemy.userData.targetQuat.slerp(newTargetQuat, 0.05);
            enemy.quaternion.slerp(enemy.userData.targetQuat, 0.03);
        }
    });
    
    // 8. GÉRER LA VISIBILITÉ SÉPARÉMENT
    enemies.forEach(enemy => {
        if (enemy) enemy.visible = cannonActive;
    });
}


// ===================================================================
// FONCTION DE SPAWN CORRIGÉE POUR X-WING
// ===================================================================

function spawnEnemy() {
    if(!xwingModel) return;

    let enemy = new THREE.Group();
    let model = xwingModel.clone();
    
    // Orientation initiale vers le centre
    model.rotation.y = 0;
    enemy.add(model);

    // Arrivée depuis les 4 directions (N, S, E, O)
    const directions = [
        { x: 1, z: 0 },   // Est
        { x: -1, z: 0 },  // Ouest
        { x: 0, z: 1 },   // Nord (devant)
        { x: 0, z: -1 }   // Sud (derrière)
    ];
    
    const dir = directions[Math.floor(Math.random() * directions.length)];
    
    // Position de spawn éloignée
    enemy.position.set(
        dir.x * (1000 + Math.random() * 400),
        (Math.random() - 0.5) * 300,
        dir.z * (1000 + Math.random() * 400)
    );

    // Cibler une zone autour du joueur
    const targetZone = new THREE.Vector3(
        (Math.random() - 0.5) * 400,
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 300
    );
    
    const direction = targetZone.clone().sub(enemy.position).normalize();
    const speed = 30 + Math.random() * 20;
    
    const now = performance.now() * 0.001;
    
    enemy.userData = {
        velocity: direction.multiplyScalar(speed),
        targetQuat: null,
        nextShot: now + 1 + Math.random() * 3,
        fireRate: 1.5 + Math.random() * 2.5,
        nextRandomExplosion: now + 5 + Math.random() * 10,
        lastRandomExplosion: 0,
        spawnTime: now,
        targetZone: targetZone
    };

   
    scene.add(enemy);
    enemies.push(enemy);
}


function spawnSquadron(count = 8) {
    const baseZ = 300 + Math.random() * 200;
    const baseY = (Math.random() - 0.5) * 150;
    
    for(let i = 0; i < count; i++) {
        let enemy = new THREE.Group();
        let model = xwingModel.clone();
        model.rotation.y = Math.PI;
        enemy.add(model);

        const angle = (i / count) * Math.PI * 2;
        
        enemy.position.set(
            Math.cos(angle) * 200 + (Math.random() - 0.5) * 80,
            Math.sin(angle) * 80 + baseY,
            baseZ + (Math.random() - 0.5) * 150
        );



        const vel = new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 5,
            25 + Math.random() * 18
        );

        enemy.userData = {
            velocity: vel,
            targetQuat: null
        };

        scene.add(enemy);
        enemies.push(enemy);
    }
}

function checkEnemiesPosition() {
    enemies.forEach(enemy => {
        if (enemy.position.z < 150) { // MODIFIÉ : 50 → 150
            enemy.userData.velocity.z += 3; // Poussée plus douce
        }
        if (enemy.position.z > 600) { // NOUVEAU : limite supérieure
            enemy.userData.velocity.z -= 3;
        }
    });
}

// Appeler checkEnemiesPosition toutes les 3 secondes au lieu de l'intervalle de téléportation
setInterval(checkEnemiesPosition, 3000);

// ===================================================================
// SYSTÈME D'EXPLOSIONS - TAILLE CORRIGÉE + ANNEAU PARFAIT
// ===================================================================

// -------------------------------------------------------------------
// 1. CONFIGURATION VIDÉO
// -------------------------------------------------------------------
const videoex = document.createElement("video");
videoex.src = 'public/explosion.mp4';
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

function createStandardExplosion(position, scale = 10) { // 20 → 10
    createVideoExplosion(position, scale);
    createExplosionParticles(position, { 
        count: 35, // 70 → 35
        speed: 70, // 150 → 70
        life: 1.2 
    });
    createSparkParticles(position, 12); // 25 → 12
}

function createRingExplosionComplete(position, scale = 12) { // 20 → 12
    createVideoExplosion(position, scale);
    createExplosionParticles(position, { 
        count: 25, // 50 → 25
        speed: 60,
        life: 1.2 
    });
    createRingExplosion(position);
    createSparkParticles(position, 8); // 20 → 8
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

function destroyEnemy(enemy) {
    if (!enemy || !enemy.visible) return;
    
    const pos = enemy.position.clone();
    enemy.visible = false;
    
    createStandardExplosion(pos, 15);
    
    setTimeout(() => {
        scene.remove(enemy);
        enemies = enemies.filter(e => e !== enemy);
        
        // Respawn après un délai, mais SEULEMENT si canon actif
        if (cannonActive) {
            setTimeout(() => {
                spawnEnemy(); // Le nouveau spawn aura la bonne orientation
            }, 2000);
        }
    }, 100);
}

function destroyEnemyWithRing(enemy) {
    const pos = enemy.position.clone();
    enemy.visible = false;
    
    createRingExplosionComplete(pos, 12);
    
    setTimeout(() => {
        scene.remove(enemy);
        enemies = enemies.filter(e => e !== enemy);
    }, 100);
    
    setTimeout(() => {
        spawnEnemy();
    }, 800);
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
// 3. CHARGEUR TIE
// -------------------------------------------------------------------

gltfLoader.load('public/tieinterlow.glb', (gltf) => {
    tieModel = gltf.scene;
    tieModel.scale.set(0.5,0.5,0.5);
    tieModel.rotation.y += Math.PI;

    
    console.log("✅ TIE Interceptor chargé !");
    
    // Créer les TIE mais les cacher
    for(let i = 0; i < 30; i++) {
        spawnTie();
    }
    
    // Les cacher immédiatement après création
    friendlyShips.forEach(tie => {
        tie.visible = false;
    });
// FORCER UNE PREMIÈRE MISE À JOUR POUR LES TIE
    if (friendlyShips.length > 0 && typeof updateTies === 'function') {
        for(let i = 0; i < 50; i++) {
            updateTies(0.1);
        }
    }
});

// ===================================================================
// FONCTION DE SPAWN CORRIGÉE POUR TIE
// ===================================================================

function spawnTie() {
    if(!tieModel) return;


    let tie = new THREE.Group();
    let model = tieModel.clone();
    model.rotation.y = Math.PI; // Même orientation que les X-Wing
    tie.add(model);

    // Position DEVANT le vaisseau mère (Z positif)
    tie.position.set(
        (Math.random() - 0.5) * 600,
        (Math.random() - 0.5) * 200,
        200 + Math.random() * 300
    );

    const now = performance.now() * 0.001;
    
    tie.userData = {
        velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 12,
            (Math.random() - 0.5) * 6,
            25 + Math.random() * 15       // TOUJOURS POSITIF = vers l'avant
        ),
        targetQuat: null,
        type: 'tie',
        nextShot: now + 1 + Math.random() * 3,
        fireRate: 1.5 + Math.random() * 2.5,
        nextRandomExplosion: now + 5 + Math.random() * 10
    };

    scene.add(tie);
    friendlyShips.push(tie);
}

// -------------------------------------------------------------------
// 5. MOUVEMENT DES TIE
// -------------------------------------------------------------------

function updateTies(dt) {
    if (!tieModel) return;
    
    const time = performance.now() * 0.001;

    friendlyShips.forEach((tie, index) => {
        if (!tie) return;
        
        const vel = tie.userData.velocity;
        
        // 1. FORCER LA DIRECTION VERS LE VAISSEAU MÈRE
        vel.z = -35;
        
        // 2. MOUVEMENT EN BOUCLES
        const loopPhase = time * 0.5 + index + 10;
        const radius = 120;
        
        const targetX = Math.sin(loopPhase) * radius + Math.sin(time * 0.2 + index) * 150;
        const targetY = Math.cos(loopPhase * 0.7) * radius + Math.cos(time * 0.3 + index) * 80;
        
        vel.x += (targetX - tie.position.x) * 0.02 * dt * 30;
        vel.y += (targetY - tie.position.y) * 0.02 * dt * 30;
        
        // 3. APPLICATION
        const newPosition = tie.position.clone().addScaledVector(vel, dt);
        
        // 4. GESTION DE LA DISTANCE
        if (newPosition.z < 100) {
            newPosition.z = 900 + Math.random() * 300;
            newPosition.x = (Math.random() - 0.5) * 600;
            newPosition.y = (Math.random() - 0.5) * 200;
            
            vel.x = (Math.random() - 0.5) * 8;
            vel.y = (Math.random() - 0.5) * 4;
        }
        
        // 5. LIMITES LATÉRALES
        if (Math.abs(newPosition.x) > 700) {
            newPosition.x = Math.sign(newPosition.x) * 700;
            vel.x *= -0.3;
        }
        if (Math.abs(newPosition.y) > 250) {
            newPosition.y = Math.sign(newPosition.y) * 250;
            vel.y *= -0.3;
        }
        
        tie.position.copy(newPosition);
        
        // 6. ORIENTATION
        if (vel.length() > 0.1) {
            const lookDir = vel.clone().normalize();
            
            if (!tie.userData.targetQuat) {
                tie.userData.targetQuat = new THREE.Quaternion();
            }
            
            const newTargetQuat = new THREE.Quaternion();
            newTargetQuat.setFromUnitVectors(
                new THREE.Vector3(0, 0, 1),
                lookDir
            );
            
            tie.userData.targetQuat.slerp(newTargetQuat, 0.05);
            tie.quaternion.slerp(tie.userData.targetQuat, 0.03);
        }
    });
    
    // GÉRER LA VISIBILITÉ SÉPARÉMENT
    friendlyShips.forEach(tie => {
        if (tie) tie.visible = cannonActive;
    });
}

// -------------------------------------------------------------------
// 6. SYSTÈME DE LASERS (plus grands)
// -------------------------------------------------------------------

function createLaser(position, direction, color, isEnemy) {
    const length = 60;
    const geometry = new THREE.BufferGeometry();
    
    const vertices = new Float32Array([
        0, 0, 0,
        0, 0, -length
    ]);
    
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    
    const material = new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending
    });
    
    const laser = new THREE.Line(geometry, material);
    
    laser.position.copy(position);
    laser.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        direction.clone().normalize()
    );
    
    laser.userData = {
        velocity: direction.clone().multiplyScalar(400),
        life: 1.2,
        maxLife: 1.2,
        isEnemy: isEnemy
    };
    
    scene.add(laser);
    
    if (isEnemy) {
        enemyLasers.push(laser);
    } else {
        friendlyLasers.push(laser);
    }
}

function updateLasers(dt) {
    if (!cannonActive) {
        // Nettoyer tous les lasers si canon inactif
        [...enemyLasers, ...friendlyLasers].forEach(laser => {
            if (laser) scene.remove(laser);
        });
        enemyLasers = [];
        friendlyLasers = [];
        return;
    }
    
    // Lasers rouges (X-Wing)
    enemyLasers = enemyLasers.filter(laser => {
        laser.position.addScaledVector(laser.userData.velocity, dt);
        laser.userData.life -= dt * 1.5;
        laser.material.opacity = laser.userData.life / laser.userData.maxLife;
        
        friendlyShips.forEach(tie => {
            if (tie && tie.visible && laser.position.distanceTo(tie.position) < 25) {
                destroyTie(tie);
                laser.userData.life = 0;
            }
        });
        
        if (laser.userData.life <= 0 || Math.abs(laser.position.z) > 1000) {
            scene.remove(laser);
            return false;
        }
        return true;
    });
    
    // Lasers verts (TIE)
    friendlyLasers = friendlyLasers.filter(laser => {
        laser.position.addScaledVector(laser.userData.velocity, dt);
        laser.userData.life -= dt * 1.5;
        laser.material.opacity = laser.userData.life / laser.userData.maxLife;
        
        enemies.forEach(enemy => {
            if (enemy && enemy.visible && laser.position.distanceTo(enemy.position) < 25) {
                destroyEnemy(enemy);
                laser.userData.life = 0;
            }
        });
        
        if (laser.userData.life <= 0 || Math.abs(laser.position.z) > 1000) {
            scene.remove(laser);
            return false;
        }
        return true;
    });
}

// -------------------------------------------------------------------
// 7. TIRS ASYNCHRONES (avec décalage pour éviter la同步)
// -------------------------------------------------------------------

function updateShooting(dt) {
    if (!cannonActive) return;
    
    const time = performance.now() * 0.001;
    
    // Tirs des X-Wing
    enemies.forEach(enemy => {
        if (!enemy || !enemy.visible) return;
        
        // Initialisation avec décalage aléatoire
        if (enemy.userData.nextShot === undefined) {
            enemy.userData.nextShot = time + Math.random() * 3;
            enemy.userData.fireRate = 1.5 + Math.random() * 2.5;
        }
        
        if (time > enemy.userData.nextShot && friendlyShips.length > 0) {
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
        if (!tie || !tie.visible) return;
        
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
    if (!cannonActive) return;
    
    const time = performance.now() * 0.001;
    
    // X-Wing explosent aléatoirement
    enemies.forEach(enemy => {
        if (!enemy || !enemy.visible) return;
        
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
        if (!tie || !tie.visible) return;
        
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
    if (!tie || !tie.visible) return;
    if (!cannonActive) return;
    
    const pos = tie.position.clone();
    tie.visible = false;
    
    createStandardExplosion(pos, 15);
    
    setTimeout(() => {
        scene.remove(tie);
        friendlyShips = friendlyShips.filter(t => t !== tie);
        
        if (cannonActive) {
            setTimeout(() => {
                spawnTie();
            }, 3000);
        }
    }, 100);
}
// -------------------------------------------------------------------
// 10. FONCTION DE MISE À JOUR GLOBALE
// -------------------------------------------------------------------

function updateCombat(dt) {
    if (!tieModel) return;
    
    // On enlève la condition !cannonActive ici aussi
    updateTies(dt);
    updateShooting(dt);
    updateLasers(dt);
    randomExplosions(dt);
}

//======================== OK =====================================================






// ===================================================================
// GRANDS VAISSEAUX ENNEMIS - VERSION AVEC 3 PARTIES
// ===================================================================

let capitalShipParts = {
    part1: null,
    part2: null,
    part3: null
};
let pivotRebel = new THREE.Group();
let capitalShips = [];  // Tableau des vaisseaux complets

const CAPITAL_SHIP = {
    POSITION: new THREE.Vector3(0, 0, 1500),
    ROTATION_SPEED: 0.1,
    MAX_HITS_PER_PART: 3,
    SPAWN_COUNT: 2,
    SPACING: 2000
};

// ===================================================================
// CHARGEMENT DES 3 PARTIES
// ===================================================================

let partsLoaded = 0;

// Partie 1
gltfLoader.load('public/capital_part1.glb', (gltf) => {
    capitalShipParts.part1 = gltf.scene;
    capitalShipParts.part1.scale.set(0.5,0.5,0.5);  // Ajustez l'échelle
    capitalShipParts.part1.rotation.y = Math.PI/2;
    console.log("✅ Partie 1 chargée");
    partsLoaded++;
    tryCreateCapitalShips();
});

// Partie 2
gltfLoader.load('public/capital_part2.glb', (gltf) => {
    capitalShipParts.part2 = gltf.scene;
    capitalShipParts.part2.scale.set(0.5,0.5,0.5);
    capitalShipParts.part2.rotation.y = Math.PI/2;
    console.log("✅ Partie 2 chargée");
    partsLoaded++;
    tryCreateCapitalShips();
});

// Partie 3
gltfLoader.load('public/capital_part3.glb', (gltf) => {
    capitalShipParts.part3 = gltf.scene;
    capitalShipParts.part3.scale.set(0.5,0.5,0.5);
    capitalShipParts.part3.rotation.y = Math.PI/2;
    console.log("✅ Partie 3 chargée");
    partsLoaded++;
    tryCreateCapitalShips();
});

// ===================================================================
// CRÉATION D'UN VAISSEAU COMPLET
// ===================================================================

function createCapitalShip(xOffset = 0) {
    const shipGroup = new THREE.Group();
    const parts = [];
    
    // Cloner chaque partie et l'ajouter au groupe
    // Comme elles ont la même origine, elles se placent automatiquement
    // dans la bonne position relative les unes par rapport aux autres
    
    const partTypes = ['part1', 'part2', 'part3'];
    
    partTypes.forEach((type, index) => {
        if (!capitalShipParts[type]) return;
        
        // Cloner la partie
        const part = capitalShipParts[type].clone();
        
        // Ajouter les données utilisateur
        part.userData = {
            type: type,
            hits: 0,
            maxHits: CAPITAL_SHIP.MAX_HITS_PER_PART,
            destroyed: false,
            explosionTime: 0
        };
        
        // Sauvegarder le matériau original
        part.userData.originalMaterial = [];
        part.traverse(child => {
            if (child.isMesh) {
                child.userData.originalMaterial = child.material.clone();
                child.userData.hitMaterial = child.material.clone();
                if (child.userData.hitMaterial.emissive) {
                    child.userData.hitMaterial.emissive.setHex(0xaa0000);
                }
            }
        });
        
        shipGroup.add(part);
        parts.push(part);
    });
    
    // Positionner le vaisseau
    shipGroup.position.set(xOffset, 0, CAPITAL_SHIP.POSITION.z);
    
    // Données du vaisseau
    shipGroup.userData = {
        parts: parts,
        destroyed: false
    };
    
    return { group: shipGroup, parts: parts };
}

// ===================================================================
// CRÉATION DES VAISSEAUX (QUAND TOUTES LES PARTIES SONT CHARGÉES)
// ===================================================================

function tryCreateCapitalShips() {
    // Attendre que les 3 parties soient chargées
    if (partsLoaded < 3) return;
    
    console.log("🚀 Création des vaisseaux capitaux...");
    
    // Créer le pivot
    pivotRebel.position.set(0, 0, 0);
    scene.add(pivotRebel);
    
    // Créer plusieurs vaisseaux
    for (let i = 0; i < CAPITAL_SHIP.SPAWN_COUNT; i++) {
        const xOffset = (i - (CAPITAL_SHIP.SPAWN_COUNT - 1) / 2) * CAPITAL_SHIP.SPACING;
        const { group, parts } = createCapitalShip(xOffset);
        
        pivotRebel.add(group);
        
        capitalShips.push({
            group: group,
            parts: parts,
            hitboxes: []  // Sera rempli plus tard
        });
    }
    
    console.log(`✅ ${CAPITAL_SHIP.SPAWN_COUNT} vaisseaux capitaux créés`);
}

// ===================================================================
// MISE À JOUR
// ===================================================================

function updateCapitalShips(dt) {
    // Faire tourner le pivot
    pivotRebel.rotation.y += CAPITAL_SHIP.ROTATION_SPEED * dt;
    
    // Mettre à jour les effets de hit
    capitalShips.forEach(ship => {
        ship.parts.forEach(part => {
            if (part.userData.explosionTime > 0) {
                part.userData.explosionTime -= dt;
                
                // Effet de scintillement
                if (part.userData.explosionTime > 0) {
                    const intensity = Math.sin(part.userData.explosionTime * 30) * 0.5 + 0.5;
                    part.traverse(child => {
                        if (child.isMesh && child.material.emissive) {
                            child.material.emissive.setHSL(0, 1, intensity * 0.3);
                        }
                    });
                } else {
                    // Restaurer le matériau original
                    part.traverse(child => {
                        if (child.isMesh && child.userData.originalMaterial) {
                            child.material.copy(child.userData.originalMaterial);
                        }
                    });
                }
            }
        });
    });
}

// ===================================================================
// DÉTECTION DES TIRS
// ===================================================================

function checkCapitalShipHit(laserPosition) {
    for (let ship of capitalShips) {
        for (let part of ship.parts) {
            if (part.userData.destroyed) continue;
            
            // Récupérer la position mondiale de la partie
            const worldPos = part.getWorldPosition(new THREE.Vector3());
            
            // Vérifier la distance (ajustez le rayon selon la taille)
            const distance = laserPosition.distanceTo(worldPos);
            if (distance < 150) {  // Rayon de détection
                return hitCapitalShipPart(ship, part, laserPosition);
            }
        }
    }
    return false;
}

// ===================================================================
// VERSION MODIFIÉE DE hitCapitalShipPart AVEC LOGS
// ===================================================================

// ===================================================================
// VERSION SIMPLIFIÉE POUR TEST
// ===================================================================

function hitCapitalShipPart(ship, part, hitPosition) {
    if (part.userData.destroyed) return false;
    
    part.userData.hits++;
    console.log(`🎯 Hit ${part.userData.hits}/${part.userData.maxHits}`);
    
    // Effet de hit
    part.userData.explosionTime = 0.3;
    
    // TEST : Forcer une explosion pour voir
    console.log("🔥 Tentative d'explosion...");
    createPartHitExplosion(hitPosition);
    
    if (part.userData.hits >= part.userData.maxHits) {
        console.log("💀 Destruction !");
        destroyCapitalShipPart(ship, part);
        return true;
    }
    
    return false;
}

// ===================================================================
// EXPLOSION LOCALISÉE (QUAND ON TIRE SUR UNE PARTIE)
// ===================================================================

function createPartHitExplosion(position) {
    console.log("💥 createPartHitExplosion appelée");
    
    // Utiliser DIRECTEMENT vos fonctions qui fonctionnent
    if (typeof createStandardExplosion === 'function') {
        createStandardExplosion(position, 15);
    }
    
    if (typeof createSparkParticles === 'function') {
        createSparkParticles(position, 12);
    }
}

// ===================================================================
// DESTRUCTION D'UNE PARTIE (AU BOUT DE 3 TIRS)
// ===================================================================

function destroyCapitalShipPart(ship, part) {
    console.log("💢 destroyCapitalShipPart appelée");
    part.userData.destroyed = true;
    
    // Position mondiale de la partie
    const worldPos = part.getWorldPosition(new THREE.Vector3());
    
    // 1. GROSSE EXPLOSION DIRECTEMENT
    if (typeof createRingExplosionComplete === 'function') {
        createRingExplosionComplete(worldPos, 30);
    } else if (typeof createStandardExplosion === 'function') {
        createStandardExplosion(worldPos, 30);
    }
    
    // 2. CHAÎNE D'EXPLOSIONS SIMPLE
    for (let i = 0; i < 5; i++) {
        setTimeout(() => {
            const offset = new THREE.Vector3(
                (Math.random() - 0.5) * 100,
                (Math.random() - 0.5) * 100,
                (Math.random() - 0.5) * 100
            );
            
            if (typeof createStandardExplosion === 'function') {
                createStandardExplosion(worldPos.clone().add(offset), 15);
            }
        }, i * 150);
    }
    
    // 3. CACHER LA PARTIE
    setTimeout(() => {
        part.visible = false;
    }, 200);
    
    // 4. VÉRIFIER SI TOUTES LES PARTIES SONT DÉTRUITES
    setTimeout(() => {
        const allDestroyed = ship.parts.every(p => p.userData.destroyed);
        if (allDestroyed && typeof destroyWholeCapitalShip === 'function') {
            destroyWholeCapitalShip(ship);
        }
    }, 500);
}


// ===================================================================
// DESTRUCTION COMPLÈTE
// ===================================================================

function destroyWholeCapitalShip(ship) {
    const worldPos = ship.group.getWorldPosition(new THREE.Vector3());
    
    // Explosion finale géante
    createRingExplosionComplete(worldPos, 80);
    
    // Nuage de débris
    for (let i = 0; i < 30; i++) {
        setTimeout(() => {
            const offset = new THREE.Vector3(
                (Math.random() - 0.5) * 400,
                (Math.random() - 0.5) * 400,
                (Math.random() - 0.5) * 400
            );
            createStandardExplosion(worldPos.clone().add(offset), 30);
        }, i * 30);
    }
    
    // Supprimer le vaisseau
    setTimeout(() => {
        pivotRebel.remove(ship.group);
        capitalShips = capitalShips.filter(s => s !== ship);
    }, 2000);
}

// ===================================================================
// APPEL DANS L'ANIMATE
// ===================================================================

// À AJOUTER dans votre animate()
//updateCapitalShips(dt);









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
function loadJSON(path){return fetch(path).then(r=>r.ok?r.json():Promise.reject("File not found "+path));}

// Deux JSON pour le battement
Promise.all([
    loadJSON('public/empire.json'),
    loadJSON('public/empire.json'),
    loadJSON('public/tiefighter.json'),
    loadJSON('public/tieinterceptor.json'),
    loadJSON('public/tiebomber.json'),
    loadJSON('public/atst.json'),
    loadJSON('public/atat.json'),
    loadJSON('public/stardestroyer.json'),
    loadJSON('public/deathstar.json'),
    loadJSON('public/darkmaul.json'),
    loadJSON('public/darkvador.json'),
    loadJSON('public/kylo.json'),
    loadJSON('public/galaxy.json')

]).then(datas => {

    const shapes = datas.map(d => d.positions);

    const maxCount = Math.max(...shapes.map(s => s.length));

    const formattedShapes = shapes.map(shape => {

        const arr = new Float32Array(maxCount * 3);

        for(let i=0;i<maxCount;i++){
            const p = shape[i % shape.length];
            arr[i*3+0] = p.x;
            arr[i*3+1] = p.y;
            arr[i*3+2] = p.z;
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

animate();
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
window.addEventListener('pointermove', e => {
    const x = (e.clientX/window.innerWidth)*2 - 1;
    const y = -(e.clientY/window.innerHeight)*2 + 1;
    raycaster.setFromCamera({x,y}, camera);
    const hit = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, hit);
    mouse.copy(hit);
});

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

// TIR TIE FIGHTER avec SPACE-BAR

let spacePressed = false;

window.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !spacePressed) {
        spacePressed = true;
        handleSpaceAction();
    }
});

window.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
        spacePressed = false;
    }
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

    if (cannonActive && !ignoreNextShot) {

        setTimeout(() => {

            if (!cannonActive) return; // sécurité si le canon vient d'être éteint

            laserSound.stop();
            shootLaser();
            laserSound.play();

        }, 80); // petit délai

    }

    raycaster.setFromCamera(mouse, camera);

    // =============== CAPITAL SHIPS ===============
checkCapitalShipClick(raycaster);
// =============================================

    const hits = raycaster.intersectObjects(enemies, true);

    if(hits.length > 0){

        let enemy = hits[0].object;

        while(enemy.parent && !enemies.includes(enemy)){
            enemy = enemy.parent;
        }

        destroyEnemyWithRing(enemy);
        explosion.stop()
        explosion.play()

    }



// ===================================================================
// VÉRIFICATION DES CLICS SUR LES CAPITAL SHIPS
// ===================================================================

function checkCapitalShipClick(raycaster) {
    // Récupérer toutes les parties visibles des capital ships
    const allParts = [];
    capitalShips.forEach(ship => {
        ship.parts.forEach(part => {
            if (part.visible && !part.userData.destroyed) {
                allParts.push(part);
            }
        });
    });
    
    if (allParts.length === 0) return false;
    
    // Tester les intersections
    const intersects = raycaster.intersectObjects(allParts, true); // true pour les enfants
    
    if (intersects.length > 0) {
        // Prendre la première intersection
        const hit = intersects[0];
        const hitPart = hit.object;
        
        // Remonter jusqu'à la partie parente (le groupe)
        let partGroup = hitPart;
        while (partGroup.parent && !partGroup.userData?.maxHits) {
            partGroup = partGroup.parent;
        }
        
        // Trouver à quel ship et quelle partie appartient cet objet
        for (let ship of capitalShips) {
            for (let part of ship.parts) {
                if (part === partGroup || part.children.includes(hitPart)) {
                    // Touché !
                    console.log("🎮 Clic détecté sur capital ship !");
                    hitCapitalShipPart(ship, part, hit.point);
                    return true;
                }
            }
        }
    }
    
    return false;
}


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
        holoOffSound.play();
        
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
            playSoundSafe(R2);
        }

        

// ===================================================================
// BOUTON D'ACTIVATION/DÉSACTIVATION DU CANON
// ===================================================================

if (clickedObject.name.includes("Side_Control_Panels_Button_White_0001")) {

    ignoreNextShot = true;
    cannonActive = !cannonActive;

    setTimeout(() => {
        ignoreNextShot = false;
    }, 100);

    if (cannonActive) {
        // ACTIVER LE CANON
        laserCannon.visible = true;     
        cannonTargetY = cannonVisibleY;
        laseron.play();

        cursorDiv.style.display = 'block';

        
        // RENDRE LES VAISSEAUX VISIBLES (ils existent déjà et ont bougé !)
        enemies.forEach(enemy => {
            if (enemy) enemy.visible = true;
        });
        
        friendlyShips.forEach(tie => {
            if (tie) tie.visible = true;
        });

    } else {
        // DÉSACTIVER LE CANON
        laserCannon.visible = false;
        cannonTargetY = cannonHiddenY;
        laseroff.play();

        cursorDiv.style.display = 'none';
        
        // Cacher les vaisseaux
        enemies.forEach(enemy => {
            if (enemy) enemy.visible = false;
        });
        
        friendlyShips.forEach(tie => {
            if (tie) tie.visible = false;
        });
        
        // Nettoyer les lasers
        [...enemyLasers, ...friendlyLasers].forEach(laser => {
            if (laser) scene.remove(laser);
        });
        enemyLasers = [];
        friendlyLasers = [];
    }
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
            playSoundSafe(R2);
        }

        
        const shipHit = raycaster.intersectObject(tiePlayer, true);

        if (shipHit.length > 0) {
            
            tiechange.play();
            // cacher le vaisseau actuel
            ships[shipIndex].visible = false;

            // passer au suivant
            shipIndex++;
            if (shipIndex >= ships.length) shipIndex = 0;

            // afficher le suivant
            ships[shipIndex].visible = true;

            // mettre à jour le vaisseau actif
            tiePlayer = ships[shipIndex];

            console.log("Nouveau vaisseau :", shipIndex);
        }
            
        const mouse = new THREE.Vector2();

        function onMouseClick(event) {
            // Convertir la position de la souris en coordonnées normalisées [-1,1]
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);

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

            }
});


function tryMove(moveVector) {
    if (!collisionMeshExterior || !collisionMeshInterior) return;
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
        const hits = collisionRaycaster.intersectObject(collisionMeshExterior, true);
        if (hits.length > 0 && hits[0].distance < moveDistance + margin) {

            // ✅ IMPACT — rebond + étincelles + son
            const now = clock.getElapsedTime();
            if (now - lastCollisionTime > COLLISION_COOLDOWN) {
                lastCollisionTime = now;

                // Point d'impact et normale
                const hitPoint = hits[0].point;
                const hitNormal = hits[0].face.normal.clone()
                    .transformDirection(collisionMeshExterior.matrixWorld)
                    .normalize();

                // Étincelles
                createCollisionSparks(hitPoint, hitNormal);

                // Rebond : réfléchit le vecteur de mouvement sur la normale
                const reflected = moveVector.clone().reflect(hitNormal).multiplyScalar(0.4);
                player.position.add(reflected);

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
        const hitsBack = backRay.intersectObject(collisionMeshExterior, true);
        if (hitsBack.length > 0) return;
    }

    player.position.add(moveVector);
}


function updateCamera(dt = 0.016) {

    // accélération
    if (keys.ArrowRight) rotationVelocity -= rotationAcceleration * dt;
    if (keys.ArrowLeft)  rotationVelocity += rotationAcceleration * dt;

    // clamp vitesse max
    rotationVelocity = THREE.MathUtils.clamp(rotationVelocity, -maxRotationSpeed, maxRotationSpeed);

    // appliquer rotation
    player.rotation.y += rotationVelocity;

    // friction / inertie
    rotationVelocity *= rotationDamping;

    // déplacement
    let moveVector = new THREE.Vector3();
    const currentSpeed = (playerState === "flight") ? flightSpeed : walkSpeed;
    if (keys.ArrowUp)    moveVector.z -= currentSpeed;
    if (keys.ArrowDown)  moveVector.z += currentSpeed;

    if (moveVector.length() > 0) {
        moveVector.applyQuaternion(player.quaternion);
        tryMove(moveVector);
    }
}




// ==================
// RESIZE
// ==================
window.addEventListener('resize',()=>{
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
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

function updateDoors() {

    if(!doorleft || !doorright) return;

    const speed = 0.05;
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
    tielaserAction.visible = true;
}

function enableWalkMode() {
    playerState = "walk";
    tielaserAction.visible = false;
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
    if (sdt) sdt.visible = true;
    if (cockpit) cockpit.visible = true;
    if (star_destroyer0) star_destroyer0.visible = false;

    switchToFlightAudio();

    enableFlightMode();
}

function enterShip() {

    console.log("Entrée dans le vaisseau");
    isInsideShip = true;
    playerState = "flight";

    if (tiePlayer) tiePlayer.visible = true;
    if (sdt) sdt.visible = false;
    if (cockpit) cockpit.visible = false;
    if (star_destroyer0) star_destroyer0.visible = true;

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



setInterval(() => {
    if (!cannonActive) return;
    
    // Vérifier les X-Wing
    enemies.forEach(enemy => {
        if (enemy && enemy.visible) {
            // Si un vaisseau va dans le mauvais sens, on corrige
            if (enemy.userData.velocity.z > 0) {
                enemy.userData.velocity.z = -35;
            }
        }
    });
    
    // Vérifier les TIE
    friendlyShips.forEach(tie => {
        if (tie && tie.visible) {
            if (tie.userData.velocity.z > 0) {
                tie.userData.velocity.z = -35;
            }
        }
    });
}, 3000); // Toutes les 3 secondes



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

    const dt = clock.getDelta();

    if (playerState === "flight") {
        currentFlightSpeed = THREE.MathUtils.lerp(
            currentFlightSpeed,
            maxFlightSpeed,
            acceleration
        );
        // direction de la caméra
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
    
        // ✅ avancer automatiquement via tryMove pour la collision
        const flightMove = direction.clone().multiplyScalar(currentFlightSpeed * 50 * dt);
        tryMove(flightMove);
    } else {
        currentFlightSpeed = walkSpeed;
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

    mixers.forEach(m => m.update(dt));

    // rotation du pivot autour de Y
    pivot.rotation.y -= 0.001; // vitesse de rotation
    material.uniforms.time.value += dt;
    material.uniforms.globalRotation.value += dt * 0.2;
    updateCamera();
    
    if (doorleft && doorright) {

    const distance = player.position.distanceTo(trigger.position);

    if (distance < 15) {
        doorState = 1; // ouvrir
    } else {
        doorState = 0; // fermer
    }

    if (isPlaying && screenMaterial && video) {
    if (fadeState === "fadeIn") {
        screenMaterial.opacity += fadeSpeed;
        if (screenMaterial.opacity >= 1) {
            screenMaterial.opacity = 1;
            fadeState = "playing";
        }
    }
    else if (fadeState === "playing") {
        if (video.currentTime >= video.duration - 0.1 ) fadeState = "fadeOut";
        
    }
    else if (fadeState === "fadeOut") {
        screenMaterial.opacity -= fadeSpeed;
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

    objectOpacity -= objectFadeSpeed;

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

    objectOpacity += objectFadeSpeed;

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
    updateDoors();
    

    // ===== Hologram Fade =====
    if (material) {
        hologramOpacity = THREE.MathUtils.lerp(
            hologramOpacity,
            hologramTarget,
            hologramFadeSpeed
        );

    material.uniforms.uOpacity.value = hologramOpacity;
    }
    

    // ======= Levitation TIE PLAYER =====================

    if (baseY === null) baseY = tiePlayer.position.y;

    const t = levitationClock.getElapsedTime();

    if (tiePlayer) {
        // lévitation fluide : amplitude + vitesse ajustables
        tiePlayer.position.y = baseY + Math.sin(t * 2) * 0.2;

    }


    updateinout();

   if (tielaserMixer) {
        tielaserMixer.update(dt);
    };


    if (cannonActive && laserCannon) {

    raycaster.setFromCamera(mouse, camera);

    const target = new THREE.Vector3();

    target.copy(raycaster.ray.direction)
          .multiplyScalar(500)
          .add(raycaster.ray.origin);

    laserCannon.lookAt(target);

    }

    lasers.forEach((laser, i) => {

    laser.position.add(laser.userData.velocity);

    if (laser.position.length() > 3000) {

        scene.remove(laser);
        lasers.splice(i,1);

    }

    });

    if (laserCannon) {

        if (laserCannon.position.y < cannonTargetY) {
            laserCannon.position.y += cannonSpeed;
        }

        if (laserCannon.position.y > cannonTargetY) {
            laserCannon.position.y -= cannonSpeed;
        }

        // cacher seulement quand il est complètement descendu
        if (!cannonActive && laserCannon.position.y <= cannonHiddenY + 0.1) {
            laserCannon.visible = false;
        }

    }


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

        console.log(cockpitFloatTime);
    }


    updateCtrlScreenFade(dt);


  // Mettre à jour les X-Wing seulement s'ils existent
    if (enemies.length > 0) {
        updateEnemies(dt);
    }
    
    // Mettre à jour les explosions
    updateExplosions(dt);
    
    // Mettre à jour les TIE seulement s'ils existent
    if (tieModel && friendlyShips.length > 0) {
        updateCombat(dt);
    }
    updateCapitalShips(dt);

    
    updateChaseSmooth(dt);

    updateBlueChaseSmooth(dt);

    updateWhiteButtonsNuanced(dt);

    checkZones();
    

    renderer.render(scene,camera);

}

// Démarrer l'animation
requestAnimationFrame(animate);
