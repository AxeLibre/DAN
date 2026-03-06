import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

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

let playerBox = new THREE.Box3();
let isInsideShip = true;
let playerState = "walk"; // "walk" | "flight"
let tiePlayer;
let gameReady;
let tieLoaded = false;
let cockpitLoaded = false;
let controls;
let flightControls;
let cockpit;
let detectionBox = new THREE.Box3();
let sdt;
let collisionRaycaster = new THREE.Raycaster();
const walkSpeed = 0.35;
const flightSpeed = 1.3; // 🚀 plus rapide
let currentFlightSpeed = 0;
const maxFlightSpeed = 2.5;
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
let video;
let videoTexture;
let hyperscreen;
let screenMaterial;
let originalPositions = new Map();
const hyperMoveDistance = 200;


video = document.createElement("video");
video.src = "public/hyperscreen.mp4";
video.loop = false;
video.muted = true; // important
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
    const listener = new THREE.AudioListener();
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

camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.01, 1000);
camera.position.set(0,0,0);
camera.rotation.order = "YXZ";

// Renderer
renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
document.body.appendChild(renderer.domElement);

// Lumière
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.9);
scene.add(hemiLight);

// AMBIANCE SOUND

const listener2 = new THREE.AudioListener();
camera.add(listener2);

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

const holoOnSound = new THREE.Audio(listener3);
const holoOffSound = new THREE.Audio(listener3);

audioLoader3.load('public/sounds/holo_on.mp3', buffer => {
    holoOnSound.setBuffer(buffer);
    holoOnSound.setVolume(1.5);
});

audioLoader3.load('public/sounds/holo_off.mp3', buffer => {
    holoOffSound.setBuffer(buffer);
    holoOffSound.setVolume(0.6);
});

const holoOff2Sound = new THREE.Audio(listener3);

audioLoader3.load('public/sounds/holooff.mp3', buffer => {
    holoOff2Sound.setBuffer(buffer);
    holoOff2Sound.setVolume(0.6);
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

    star_destroyer.position.set(0, 10, 500);
    star_destroyer.scale.set(15,15,15);
    star_destroyer.rotation.y = -Math.PI;

    pivot.add(star_destroyer);



const star_destroyer2 = star_destroyer.clone();
star_destroyer2.position.set(0, 20, -500);
star_destroyer2.scale.set(15,15,15);
star_destroyer2.rotation.y = Math.PI;
pivot.add(star_destroyer2);

});
    
const loader4= new GLTFLoader(loadingManager);

loader4.load('public/star_destroyer0.glb', (gltf)=>{


    const star_destroyer0 = gltf.scene;
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
    stormtrooper1.position.set(35, -12, 40);
    stormtrooper1.scale.set(5,5,5);
    stormtrooper1.rotation.y = -Math.PI/2;
    worldGroup.add(stormtrooper1);

    const mixer1 = new THREE.AnimationMixer(stormtrooper1);
    mixer1.clipAction(gltf.animations[0]).play();

    // Second clone ANIMABLE
    const stormtrooper2 = SkeletonUtils.clone(stormtrooper1); // ✅ clone correct pour squelette
    stormtrooper2.position.set(-35, -12, 40);
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

scene.add(ctrlPlane);




let hyperbouton;

const loader8 = new GLTFLoader (loadingManager);

loader8.load('public/hyperbouton.glb', (gltf)=>{
    hyperbouton = gltf.scene;
    hyperbouton.position.set(0,-12, 98.5);
    hyperbouton.scale.set(10,10,10);
    hyperbouton.rotation.y = Math.PI; // faire face à la caméra
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
    console.log("videoTexture dans loader:", videoTexture);
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
    doorleft.rotation.y = Math.PI; // faire face à la caméra
    worldGroup.add(doorleft);
});

const loader11 = new GLTFLoader (loadingManager);

loader11.load('public/doorright.glb', (gltf)=>{
    doorright = gltf.scene; //
    doorright.position.set(12,-12, 233);
    doorright.scale.set(10,10,10);
    doorright.rotation.y = Math.PI; // faire face à la caméra
    worldGroup.add(doorright);
});

let detectionMesh;
const gltfLoader = new GLTFLoader(loadingManager);

gltfLoader.load('public/shipDetection.glb', (gltf) => {
    detectionMesh = gltf.scene;
    detectionMesh.position.set(0,-12, 100);
    detectionMesh.scale.set(10,9,8.5);
    detectionMesh.rotation.y = Math.PI; // faire face à la caméra
    scene.add(detectionMesh);
    detectionMesh.visible = false;
});

let collisionMesh;

gltfLoader.load('public/cage.glb', (gltf) => {

    const ship = gltf.scene;
    ship.position.set(0,-12, 98.5);
    ship.scale.set(10,10,10);
    ship.rotation.y = Math.PI; // faire face à la caméra
    scene.add(ship);

    collisionMesh = ship.getObjectByName("COLLISION_MESH");

    collisionMesh.visible = false; // invisible en jeu
    collisionMesh.traverse(obj=>{
    if(obj.isMesh){
        obj.material = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            wireframe: true
        });
    }
});
});

gltfLoader.load('public/star_destroyer_tower.glb', (gltf) => {
    sdt = gltf.scene;
    sdt.visible = false;
    scene.add(sdt);
    sdt.position.set(0,-12, 98.5);
    sdt.scale.set(10,10,10);
    sdt.rotation.y = Math.PI; // faire face à la caméra
});

gltfLoader.load('public/tieplayer.glb', (gltf) => {
    tiePlayer = gltf.scene;
    tiePlayer.position.set(0, 0, -70);
    tiePlayer.scale.set(3,3,3);
    tiePlayer.rotation.y = Math.PI; // faire face à la caméra
    scene.add(tiePlayer);
    tieLoaded = true;
    checkGameReady();
});

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

const loader14 = new GLTFLoader (loadingManager);

loader14.load('public/bb9.glb', (gltf) => {
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


// Texture VIDEO ON / OFF

const textureLoader = new THREE.TextureLoader();

const screenOffTexture1 = textureLoader.load('public/screen1_off.webp');
const screenOffTexture2 = textureLoader.load('public/screen2_off.jpg');
const screenOffTexture3 = textureLoader.load('public/screen3_off.jpeg');
const screenOffTexture4 = textureLoader.load('public/screen4_off.jpg');

const screenOffMaterial1 = new THREE.MeshBasicMaterial({
    map: screenOffTexture1
});

const screenOffMaterial2 = new THREE.MeshBasicMaterial({
    map: screenOffTexture2
});

const screenOffMaterial3 = new THREE.MeshBasicMaterial({
    map: screenOffTexture3
});

const screenOffMaterial4 = new THREE.MeshBasicMaterial({
    map: screenOffTexture4
});




const video2 = document.createElement("video");
video2.src = "public/screen1.mp4";
video2.loop = false;
video2.muted = false; // important pour autoplay navigateur
video2.playsInline = true;
video2.pause(); // démarre en pause

const videoTexture2 = new THREE.VideoTexture(video2);
videoTexture2.colorSpace = THREE.SRGBColorSpace;

const screenMaterial2 = new THREE.MeshBasicMaterial({
    map: videoTexture2,
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

// 3️⃣ material
const screenMaterial3 = new THREE.MeshBasicMaterial({
    map: videoTexture3
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

// 3️⃣ material
const screenMaterial4 = new THREE.MeshBasicMaterial({
    map: videoTexture4
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

// 3️⃣ material
const screenMaterial5 = new THREE.MeshBasicMaterial({
    map: videoTexture5
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

// 🔊 LASER SOUND (utilise le listener global)
const listener = new THREE.AudioListener();
camera.add(listener);
const laserSound = new THREE.Audio(listener);

const audioLoader = new THREE.AudioLoader();

audioLoader.load('public/laser.mp3', (buffer) => {
    laserSound.setBuffer(buffer);
    laserSound.setVolume(1);
});

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

    if (alarmSound.isPlaying) {
        alarmSound.stop();
    }

    // Remise état normal
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

//===================================================
// CONTROL SCREEN
//===================================================


function toggleCtrlScreen() {

    if (ctrlScreenVisible) {
        ctrlScreenFadeDirection = -1; // fade out
    } else {
        ctrlScreenFadeDirection = 1; // fade in
        ctrlscreen.play(); // démarre la vidéo si on l'allume
    }

    ctrlScreenVisible = !ctrlScreenVisible;
}

function updateCtrlScreenFade(dt) {

    if (ctrlScreenFadeDirection === 0) return;

    ctrlMaterial.opacity += ctrlScreenFadeDirection * ctrlScreenFadeSpeed * dt;

    ctrlMaterial.opacity = THREE.MathUtils.clamp(ctrlMaterial.opacity, 0, 1);

    if (ctrlMaterial.opacity === 0) {
        ctrlScreenFadeDirection = 0;
        ctrlscreen.pause(); // pause quand écran éteint
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
    loadJSON('public/kylo.json')
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
                video.muted = false;   // 🔊 on active le son
                video.play();
            }
        }

    

        if (clickedObject.name.includes("Table_3_Button_Blue_0")) {

            hologramActive = !hologramActive;
            hologramTarget = hologramActive ? 1 : 0;

            if (hologramActive) {
                if (holoOffSound.isPlaying) holoOffSound.stop();
                holoOffSound.play();
            } else {
                if (holoOff2Sound.isPlaying) holoOff2Sound.stop();
                holoOff2Sound.play();
            }
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

        if (clickedObject.name.includes("Side_Control_Panels_Button_White_0001")) {

            if (laserAction) {

                laserAction.reset();
                laserAction.play();

                if (laserSound.isPlaying) laserSound.stop();
                laserSound.play();
            }
        }

        if (clickedObject.name.includes("Front_Control_Panels_Button_White_0")) {

            if (laserAction) {

                laserAction.reset();
                laserAction.play();

                if (laserSound.isPlaying) laserSound.stop();
                laserSound.play();
            }
        }

        if (clickedObject.name.includes("Front_Control_Panels_Button_Red_0")) {

            if (!alarmActive) {
                startAlarm();
            } else {
                stopAlarm();
            }
        }

        if (clickedObject.name.includes("Table_1_Button_Red_0")) {

            if (!alarmActive) {
                startAlarm();
            } else {
                stopAlarm();
            }
        }

            if (clickedObject.name.includes("Table_4_Button_Red_0")) {

            if (!alarmActive) {
                startAlarm();
            } else {
                stopAlarm();
            }
        }

            if (clickedObject.name.includes("Side_Control_Panels_Button_Red_0001")) {

            if (!alarmActive) {
                startAlarm();
            } else {
                stopAlarm();
            }
        }

            if (clickedObject.name.includes("Side_Control_Panels_Control_Panels_0001")) {

                toggleCtrlScreen();
               holoOnSound.play();
    
            }
        

        
                // Vérifier si c’est ton bouton rouge
        if (clickedObject.name.includes("Table_3_Button_Red_0")) {
            onButtonClick(); // Appelle la fonction de gestion du clic
            transittionsound.stop(); // Arrêter le son s'il est en cours de lecture
            transittionsound.play();
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


function tryMove(moveVector){

    if(!collisionMesh) return;

    const direction = moveVector.clone().normalize();

    collisionRaycaster.set(player.position, direction);

    const intersects = collisionRaycaster.intersectObject(collisionMesh, true);

    if (intersects.length === 0 || intersects[0].distance > moveVector.length()) {
        player.position.add(moveVector);
    }

}

function updateCamera() {

    // Rotation
    if (keys.ArrowRight) player.rotation.y -= rotationSpeed;
    if (keys.ArrowLeft)  player.rotation.y += rotationSpeed;

    let moveVector = new THREE.Vector3();

    // 👇 on choisit la vitesse selon l'état
    const currentSpeed = (playerState === "flight") 
        ? flightSpeed 
        : walkSpeed;

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

document.addEventListener('mousemove', (event) => {
  mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
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

// SON

let doorSound;
let doorSoundPlayed = false; // évite de spam le son



doorSound = new THREE.Audio(listener);

audioLoader.load('public/door.mp3', function(buffer) {
    doorSound.setBuffer(buffer);
    doorSound.setLoop(false);
    doorSound.setVolume(0.7);
});

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

    switchToFlightAudio();

    enableFlightMode();
}

function enterShip() {

    console.log("Entrée dans le vaisseau");
    isInsideShip = true;

    if (tiePlayer) tiePlayer.visible = true;
    if (sdt) sdt.visible = false;
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




// ==================
// ANIMATION
// ==================
function animate(){

    requestAnimationFrame(animate);

    const dt = clock.getDelta();

    if (playerState === "flight") {
        currentFlightSpeed = THREE.MathUtils.lerp(
            currentFlightSpeed,
            maxFlightSpeed,
            acceleration
        );
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

    updateDoors();
    }

    // ===== Hologram Fade =====
    if (material) {
        hologramOpacity = THREE.MathUtils.lerp(
            hologramOpacity,
            hologramTarget,
            hologramFadeSpeed
        );

    material.uniforms.uOpacity.value = hologramOpacity;
    }

    updateinout();


    if (laserMixer) {
        laserMixer.update(dt);
    };

    if (tielaserMixer) {
        tielaserMixer.update(dt);
    };

    // si tu as d'autres mixers
    if (laserMixer) laserMixer.update(dt);



    if (alarmActive && panelMesh) {

        blinkTime += dt * 5; // vitesse du clignotement

        const mat = panelMesh.material;

        // oscillation fluide 0 → 1
        const pulse = (Math.sin(blinkTime) + 1) / 2;

        mat.emissive.set(0xff0000);
        mat.emissiveIntensity = 1 + pulse * 4; 
        // intensité entre 1 et 5
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

    renderer.render(scene,camera);

    

}

// Démarrer l'animation
requestAnimationFrame(animate);
