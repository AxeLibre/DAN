import * as THREE from 'three'
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
import { initConsoleButtons } from './bridge/consoleButtons.js';
import { initAlarm } from './bridge/alarm.js';
import { initHangarShips } from './hangar/ships.js';
import { initHangarConsole } from './hangar/console.js';
import { initLanding } from './hangar/landing.js';
import { initBattle } from './battle/index.js';

let mouseSmooth = new THREE.Vector3();
let plane = new THREE.Plane(new THREE.Vector3(0,0,1),0);
let clock = new THREE.Clock();
let playerBox = new THREE.Box3();
let playerState = "walk"; // "walk" | "flight"
let controls;
let flightControls;
let detectionBox = new THREE.Box3();
let sdt;
let collisionRaycaster = new THREE.Raycaster();
const walkSpeed = 0.25;
const flightSpeed = 1; // 🚀 plus rapide
const maxFlightSpeed = 1;
const acceleration = 0.05;
let poweroff;

let originalPositions = new Map();
const rotationAcceleration = 0.2;
const rotationDamping = 0.85;
const maxRotationSpeed = 0.3;      // limite max rad/frame
let lasers = [];
let cannonTargetY = -20;
let cannonHiddenY = -20;
let cannonVisibleY = 0;
let cannonSpeed = 0.5;
let ignoreNextShot = false;
let enemyLasers = [];       // Lasers rouges (X-Wing)
let friendlyLasers = [];    // Lasers verts (TIE)
let collisionMeshInterior;
let collisionMeshExterior;
let collisionShip;


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
ctx.consoleButtons = initConsoleButtons(ctx);
ctx.alarm = initAlarm(ctx);

// Hangar : TIE au choix, console de choix, balise + pilote automatique (voir src/hangar/)
ctx.ships = initHangarShips(ctx);
ctx.hangarConsole = initHangarConsole(ctx);
ctx.landing = initLanding(ctx);

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
// Bataille spatiale (voir src/battle/)
ctx.battle = initBattle(ctx);
const { bolts, fx, debris } = ctx.battle;

// =====================================================================================================================
// DEPLACEMENT                      PLAYER                                                  CLAVIER
// =====================================================================================================================

// Crée un player pour gérer la rotation globale
const player = ctx.player = new THREE.Group();
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
    audio.startAmbient();

    keys[event.key] = true;
  }

});

document.addEventListener("keyup", (event) => {
  if(keys.hasOwnProperty(event.key))

    keys[event.key] = false;
});

// TIR avec SPACE-BAR (maintenue) + BOOST avec MAJ en vol
let boostHeld = false;

window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
        event.preventDefault();
        state.fireHeldSpace = true;
    }
    if (event.key === "Shift") boostHeld = true;
});

window.addEventListener("keyup", (event) => {
    if (event.code === "Space") state.fireHeldSpace = false;
    if (event.key === "Shift") boostHeld = false;
});

window.addEventListener("blur", () => {
    state.fireHeldSpace = false;
    state.fireHeldMouse = false;
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
    ctx.consoleButtons.showHologramState(hologramActive);

    if (hologramActive) holoOnSound.play();
    else holoOffSound2.play();
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
    ctx.battle.toggleCannon();
}

        if (clickedObject.name.includes("Side_Control_Panels_Button_Red_0001")) {

            ctx.alarm.toggle();
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
    if (state.isInsideShip && ctx.ships.count > 1) {
        const targets = [ctx.hangarConsole.screen, ctx.ships.tiePlayer].filter(Boolean);
        if (raycaster.intersectObjects(targets, true).length > 0) {

            tiechange.stop();
            tiechange.play();
            ctx.hangarConsole.press();   // flash + "bouton pressé" sur la console
            ctx.ships.nextShip();
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

    if (!state.isInsideShip) { state.fireHeldMouse = true; return; }   // en vol
    if (ctx.battle.weapons.turretReady() && !isUiClick()) state.fireHeldMouse = true; // au canon
});

window.addEventListener('pointerup', () => { state.fireHeldMouse = false; });



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

                state.cameraShake = Math.max(state.cameraShake, 0.8);

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


let pitchVelocity = 0;
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
    if (!hit) hit = ctx.battle.fleet.collide(origin, moveVector, 8, lastFrameDt);
    if (!hit) return false;

    const now = performance.now() * 0.001;
    if (now - lastCollisionTime > COLLISION_COOLDOWN) {
        lastCollisionTime = now;
        createCollisionSparks(hit.point, hit.normal, moveVector);
        state.cameraShake = Math.max(state.cameraShake, 0.8);
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
    if (keys.ArrowRight) state.rotationVelocity -= rotationAcceleration * 0.016 * k;
    if (keys.ArrowLeft)  state.rotationVelocity += rotationAcceleration * 0.016 * k;
    state.rotationVelocity = THREE.MathUtils.clamp(state.rotationVelocity, -maxRotationSpeed, maxRotationSpeed);
    player.rotation.y += state.rotationVelocity * k;
    state.rotationVelocity *= Math.pow(rotationDamping, k);

    if (playerState === "flight") {
        // EN VOL : haut / bas = monter / descendre
        const input = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
        pitchVelocity += (input * FLIGHT_PITCH_SPEED - pitchVelocity) * (1 - Math.exp(-6 * dt));
        state.flightPitch = THREE.MathUtils.clamp(state.flightPitch + pitchVelocity * dt, -FLIGHT_PITCH_LIMIT, FLIGHT_PITCH_LIMIT);

        // le TIE s'incline dans les virages
        const rollTarget = THREE.MathUtils.clamp(state.rotationVelocity * 10, -0.45, 0.45);
        state.flightRoll += (rollTarget - state.flightRoll) * (1 - Math.exp(-5 * dt));
    } else {
        // À PIED : retour à l'horizontale + avancer / reculer
        const back = 1 - Math.exp(-6 * dt);
        state.flightPitch += (0 - state.flightPitch) * back;
        state.flightRoll += (0 - state.flightRoll) * back;
        pitchVelocity = 0;

        let moveVector = new THREE.Vector3();
        if (keys.ArrowUp)    moveVector.z -= walkSpeed * k;
        if (keys.ArrowDown)  moveVector.z += walkSpeed * k;

        if (moveVector.length() > 0) {
            moveVector.applyQuaternion(player.quaternion);
            tryMove(moveVector);
        }
    }

    camera.rotation.x = state.flightPitch;
    camera.rotation.z = state.flightRoll;
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
    ctx.battle.refreshHud();
}

function enableWalkMode() {
    playerState = "walk";
    ctx.battle.refreshHud();
}

// FONCTION

function exitShip() {

    console.log("Sortie du vaisseau");
    state.isInsideShip = false;

    ctx.ships.showCockpit(true);

    audio.switchToFlightAudio();

    enableFlightMode();

    // pilote automatique : traversée du tunnel de la tourelle jusqu'à l'extérieur
    ctx.landing.leaveHangar();
}

function enterShip() {

    console.log("Entrée dans le vaisseau");
    state.isInsideShip = true;
    playerState = "flight";

    ctx.ships.showCockpit(false);

    audio.switchToShipAudio();

    enableWalkMode();
}


function updateinout() {

    if (!ctx.ships.isReady() || !detectionMesh) return;

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



// =========================================================================================
// BLOOM (halo lumineux) — uniquement sur les objets "lumineux"
// =========================================================================================
// Ces objets sont aussi rendus sur le calque BLOOM_LAYER. On les dessine seuls, en
// demi-résolution, on les floute, et on ajoute ce halo par-dessus l'image normale
// (qui, elle, ne change pas).
const bloom = createBloom(scene, camera, renderer);

// objets lumineux
// (hyperespace, console du hangar, hologramme : volontairement SANS bloom)


// Bouton de volume (voir src/ui/volume.js)
initVolumeControl(audio, [ctx.hyperspace.video, ...ctx.screens.videos, ctx.mapScreen.video]);



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

    if (ctx.landing.autopilotActive()) {
        state.currentFlightSpeed = FLIGHT_CRUISE_SPEED;   // le pilote automatique gère la trajectoire
    } else if (playerState === "flight") {
        const targetSpeed = boostHeld ? FLIGHT_BOOST_SPEED : FLIGHT_CRUISE_SPEED;
        state.currentFlightSpeed += (targetSpeed - state.currentFlightSpeed) * (1 - Math.exp(-2.5 * dt));
        // direction de la caméra
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);

        // ✅ avancer automatiquement via tryMove pour la collision
        const flightMove = direction.clone().multiplyScalar(state.currentFlightSpeed * dt);
        tryMove(flightMove);
    } else {
        state.currentFlightSpeed = 12; // le TIE repart doucement à la sortie du hangar
    }

    ctx.hologram.update(dt, k);
    ctx.decor.update(dt, player.position);

    ctx.destroyers.update(k);
    if (ctx.landing.autopilotActive()) ctx.landing.updateAutopilot(dt);
    else updateCamera(dt);
    ctx.landing.update(dt);
    
    // (depuis l'origine, l'hyperespace n'est animé qu'une fois les portes chargées)
    if (ctx.doors.ready()) {
        ctx.doors.updateTrigger(player.position);
        ctx.hyperspace.update(k);
    }
    ctx.doors.update(k);
    

    // ======= Levitation TIE PLAYER =====================

    ctx.ships.updateLevitation();


    updateinout();
    ctx.executor.updateTower();

    // retour à hauteur de marche une fois rentré dans le vaisseau
    if (state.isInsideShip) {
        player.position.y += (3.5 - player.position.y) * (1 - Math.exp(-5 * dt));
    }

    // ===== ARMES & EFFETS =====
    ctx.battle.updateWeapons(dt);
    ctx.hangarConsole.update(dt);
    ctx.battle.updatePatrols(dt);
    sky.update(dt);

/*
    if (laserMixer) {
        laserMixer.update(dt);
    };

    // si tu as d'autres mixers
    if (laserMixer) laserMixer.update(dt);
*/


    ctx.alarm.update(dt);

    ctx.ships.updateCockpit(dt);


    ctx.mapScreen.update(dt);


    ctx.battle.update(dt);

    // secousse de caméra (tir / impact)
    if (state.cameraShake > 0.01) {
        camera.position.set((Math.random() - 0.5) * state.cameraShake, (Math.random() - 0.5) * state.cameraShake, 0);
        state.cameraShake *= Math.exp(-dt * 10);
    } else if (state.cameraShake > 0) {
        state.cameraShake = 0;
        camera.position.set(0, 0, 0);
    }

    
    ctx.consoleButtons.update(dt);

    ctx.infoBubbles.update(player.position);
    

    ctx.decor.updateDroidBeeps(dt);

    bloom.render();

}

// Démarrer l'animation
requestAnimationFrame(animate);
