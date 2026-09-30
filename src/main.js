import * as THREE from 'three'
import { LaserBolts, ExplosionFX, CombatHUD, DebrisField, InstancedShips, segmentSphere, LASER_GREEN, LASER_RED } from './weapons.js';
import { RebelFleet } from './fleet.js';
import { LEGACY_TICK_RATE, FLIGHT_CRUISE_SPEED, FLIGHT_BOOST_SPEED, BATTLE_Y, BATTLE_MIN_Z } from './core/constants.js';
import { loadingManager, makeGLTFLoader, initLoadingScreen } from './core/loaders.js';
import { createContext } from './core/context.js';
import { handleResize } from './core/stage.js';
import { createSkybox, HYPERSPACE_BG } from './core/skybox.js';
import { createBloom, BLOOM_LAYER, enableBloom } from './core/bloom.js';
import { initAudio } from './audio.js';
import { initVolumeControl } from './ui/volume.js';
import { initExecutor } from './executor.js';
import { initDestroyers, PIVOT_OMEGA } from './battle/destroyers.js';
import { initHyperspace, HYPER_MOVE_DISTANCE } from './bridge/hyperspace.js';
import { initMapScreen } from './bridge/mapScreen.js';
import { initScreens } from './bridge/screens.js';
import { initDoors } from './bridge/doors.js';
import { initDecor } from './bridge/decor.js';
import { initInfoBubbles, loadStarJediFont } from './bridge/infoBubbles.js';
import { initHologram } from './bridge/hologram.js';

let mouseSmooth = new THREE.Vector3();
let plane = new THREE.Plane(new THREE.Vector3(0,0,1),0);
let clock = new THREE.Clock();
let playerBox = new THREE.Box3();
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
let poweroff;

let panelMesh;

let blinkTime = 0;
let panelMixer;
let panelAction;

let alarmActive = false; // état ON/OFF
let cockpitFloatTime = 0;
let originalPositions = new Map();
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
let cannonActive = false;
let lasers = [];
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
let collisionMeshInterior;
let collisionMeshExterior;
let collisionShip;
// Rendre les fonctions d'explosion globales
window.createStandardExplosion = createStandardExplosion;
window.createSparkParticles = createSparkParticles;
window.createRingExplosionComplete = createRingExplosionComplete;

loadStarJediFont();   // police des bulles d'info (voir src/bridge/infoBubbles.js)






initLoadingScreen(() => audio.unlock());



// ==================
// SCÈNE & CAMERA
// ==================
const ctx = createContext();
const { scene, camera, renderer, env, state, worldGroup, mouse, raycaster } = ctx;

// ==================
// SONS (voir src/audio.js)
// ==================
const audio = ctx.audio = initAudio(scene, camera);
const { listener, playSoundSafe, playVoice, playAt, sfx, laserSoundAt } = audio;
const { ambientSound, ambienttie, ctrlscreenon, ctrlscreenoff, holoOnSound, holoOffSound2, tieOn, tieOff, open,
        transittionsound, button1, button2, button3, tiechange, laseron, laseroff, explosion, boom, doorSound,
        metalCollisionSound, R2, alarmSound, tieLaserVoices } = audio.sounds;



// ==================
// SKYBOX
// ==================
const sky = ctx.sky = createSkybox(scene);

// ==================
// LOAD GLB MODEL
// ==================

// ==================
//Groupes d'objets
// ==================
const hologramGroup = new THREE.Group();   // HOLOGRAM

scene.add(hologramGroup);

// destroyers en orbite (voir src/battle/destroyers.js)
ctx.destroyers = initDestroyers(ctx);
const { pivot } = ctx.destroyers;
let mixer;

// Executor, vu de dehors (voir src/executor.js)
ctx.executor = initExecutor(ctx);
const { exteriorColliders, inHangarCut } = ctx.executor;

// Passerelle : hyperespace, écran MAP, écrans vidéo, portes (voir src/bridge/)
ctx.decor = initDecor(ctx);
ctx.hyperspace = initHyperspace(ctx);
ctx.mapScreen = initMapScreen(ctx);
ctx.screens = initScreens(ctx);
ctx.doors = initDoors(ctx);
ctx.infoBubbles = initInfoBubbles(ctx);
ctx.hologram = initHologram(ctx);

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
    landingBeacon.visible = !state.isInsideShip;
    if (landingBeacon.visible) {
        const t = performance.now() * 0.001;
        landingBeacon.children.forEach(f => {
            const phase = (t * 1.5 - (2 - f.userData.index) * 0.33) % 1;
            f.material.opacity = 0.25 + 0.75 * Math.pow(Math.max(0, Math.cos(phase * Math.PI * 2)), 4);
        });
    }
    if (autopilot.active || state.isInsideShip) return;

    // dans la zone ET en direction du vaisseau → atterrissage automatique
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    if (LANDING_ZONE.containsPoint(player.position) && fwd.z > 0.3) {
        startAutopilot([player.position.clone(), new THREE.Vector3(0, 3.5, -200), HANGAR_INSIDE.clone()], Math.PI, 2.6);
    }
}

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
    const near = state.isInsideShip && player.position.distanceTo(screenhangar.position) < 90;
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

const loader13 = makeGLTFLoader();

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

// 🔊 LASER SOUND (canon de la passerelle)
// (le son du canon est maintenant spatialisé : voir sfx.laser plus bas)

// La bataille (X-Wing + TIE alliés) est visible avec le canon OU en vol
function battleOn() {
    return cannonActive || !state.isInsideShip;
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

    if (env.main) {
        scene.environment = env.main;
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


function updateTieGuns(dt) {
    tieGunCooldown -= dt;
    tieLock = null;
    if (state.isInsideShip) return;

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

    // Hyperespace : comme les autres vaisseaux autour (voir bridge/hyperspace.js), les patrouilles
    // glissent en s'estompant, restent cachées pendant le saut, puis reviennent.
    const hyperFade = ctx.hyperspace.fade;
    const hyperOffset = hyperFade.state === 'fadeOut' ? -HYPER_MOVE_DISTANCE * (1 - hyperFade.opacity)
                      : hyperFade.state === 'fadeIn'  ?  HYPER_MOVE_DISTANCE * (1 - hyperFade.opacity) : 0;
    const shown = hyperFade.state !== 'hidden';
    const fading = hyperFade.state === 'fadeOut' || hyperFade.state === 'fadeIn';

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
            part.mesh.material.opacity = fading ? hyperFade.opacity : 1;
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
    if (!state.isInsideShip) {
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
        
        const nearPlayer = !state.isInsideShip && enemy.position.distanceTo(player.position) < 700;
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
    audio.startAmbient();

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

            ctx.hyperspace.start();
        }



// Dans ton click handler
if (clickedObject.name.includes("Table_3_Button_Blue_0")) {
    const hologramActive = ctx.hologram.toggle();
    
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
            ctx.decor.droidClicked();
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
            ctx.hologram.next(); // forme suivante
            transittionsound.stop(); // Arrêter le son s'il est en cours de lecture
            transittionsound.play();
        }
        

        if (clickedObject.name.includes("Side_Control_Panels_Control_Panels_0001")) {

            ctx.mapScreen.toggle();

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
            ctx.decor.droidClicked();
        }

        
            }

    // CHANGEMENT DE TIE : clic sur la console du hangar ("click here for change your TIE")
    // ou sur le TIE lui-même. Testé à part : avant, ce test n'était fait que si le clic
    // touchait AUSSI le décor de la passerelle, et il ignorait la console.
    if (state.isInsideShip && ships.length > 1) {
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

    if (!state.isInsideShip) { fireHeldMouse = true; return; }   // en vol
    if (turretReady() && !isUiClick()) fireHeldMouse = true; // au canon
});

window.addEventListener('pointerup', () => { fireHeldMouse = false; });

// Affichage du HUD selon la situation
function refreshHud() {
    const turretMode = state.isInsideShip && cannonActive;
    hud.show(!state.isInsideShip ? 'flight' : (turretMode ? 'turret' : null));
    cursorDiv.style.display = turretMode ? 'block' : 'none';
    renderer.domElement.style.cursor = turretMode || !state.isInsideShip ? 'none' : '';
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

    if (state.isInsideShip) {
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
handleResize(camera, renderer, (w, h) => bloom.setSize(w, h));

    let mouseX = 0;
    let mouseY = 0;


renderer.domElement.addEventListener("mousemove", (event) => {

    const rect = renderer.domElement.getBoundingClientRect();

    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

});


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

// FONCTION

function exitShip() {

    console.log("Sortie du vaisseau");
    state.isInsideShip = false;

    if (tiePlayer) tiePlayer.visible = false;
    if (cockpit) cockpit.visible = true;

    audio.switchToFlightAudio();

    enableFlightMode();

    // pilote automatique : traversée du tunnel de la tourelle jusqu'à l'extérieur
    startAutopilot([player.position.clone(), new THREE.Vector3(0, 3.5, -130), HANGAR_OUTSIDE.clone()], 0, 2.2);
}

function enterShip() {

    console.log("Entrée dans le vaisseau");
    state.isInsideShip = true;
    playerState = "flight";

    if (tiePlayer) tiePlayer.visible = true;
    if (cockpit) cockpit.visible = false;

    audio.switchToShipAudio();

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

        if (!state.isInsideShip) {
            enterShip();
        }

    } else {

        if (state.isInsideShip) {
            exitShip();
        }

    }
}
console.log("Player:", player.position);
console.log("Detection:", detectionBox);


// Toutes les explosions GLSL font du bruit, là où elles ont lieu (voir src/audio.js)
audio.attachExplosionSounds(fx);

// =========================================================================================
// BLOOM (halo lumineux) — uniquement sur les objets "lumineux"
// =========================================================================================
// Ces objets sont aussi rendus sur le calque BLOOM_LAYER. On les dessine seuls, en
// demi-résolution, on les floute, et on ajoute ce halo par-dessus l'image normale
// (qui, elle, ne change pas).
const bloom = createBloom(scene, camera, renderer);

// objets lumineux
bolts.mesh.layers.enable(BLOOM_LAYER);
fx.points.layers.enable(BLOOM_LAYER);
landingBeacon.traverse(o => o.layers.enable(BLOOM_LAYER));
// (hyperespace, console du hangar, hologramme : volontairement SANS bloom)


// Bouton de volume (voir src/ui/volume.js)
initVolumeControl(audio, [ctx.hyperspace.video, ...ctx.screens.videos, ctx.mapScreen.video]);


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

    ctx.hologram.update(dt, k);
    ctx.decor.update(dt, player.position);

    ctx.destroyers.update(k);
    if (autopilot.active) updateAutopilot(dt);
    else updateCamera(dt);
    updateLanding(dt);
    
    // (depuis l'origine, l'hyperespace n'est animé qu'une fois les portes chargées)
    if (ctx.doors.ready()) {
        ctx.doors.updateTrigger(player.position);
        ctx.hyperspace.update(k);
    }
    ctx.doors.update(k);
    

    // ======= Levitation TIE PLAYER =====================

    if (baseY === null && tiePlayer) baseY = tiePlayer.position.y;

    const t = levitationClock.getElapsedTime();

    if (tiePlayer) {
        // lévitation fluide : amplitude + vitesse ajustables
        tiePlayer.position.y = baseY + Math.sin(t * 2) * 0.2;

    }


    updateinout();
    ctx.executor.updateTower();

    // retour à hauteur de marche une fois rentré dans le vaisseau
    if (state.isInsideShip) {
        player.position.y += (3.5 - player.position.y) * (1 - Math.exp(-5 * dt));
    }

    // ===== ARMES & EFFETS =====
    updateTurret(dt);
    updateTieGuns(dt);
    updateHangarConsole(dt);
    updatePatrols(dt);
    sky.update(dt);

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

    scene.environment = envToggle ? env.alarm : env.main;
}}

if (!alarmActive) {

    scene.environment = env.main;
    renderer.toneMappingExposure = 0.3;
}

    if (cockpit && !state.isInsideShip) {

        cockpitFloatTime += dt;

        // Oscillation verticale douce
        cockpit.position.y = Math.sin(cockpitFloatTime * 1) * 0.02;

        // Légère rotation latérale
        cockpit.rotation.z = Math.sin(cockpitFloatTime * 2) * 0.01;

        // Micro pitch avant/arrière
        cockpit.rotation.x = Math.sin(cockpitFloatTime * 1.5) * 0.005;
    }


    ctx.mapScreen.update(dt);


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

    ctx.infoBubbles.update(player.position);
    

    ctx.decor.updateDroidBeeps(dt);

    bloom.render();

}

// Démarrer l'animation
requestAnimationFrame(animate);
