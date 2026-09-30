import * as THREE from 'three';
import { makeGLTFLoader } from '../core/loaders.js';

// ===================================================================
// TIE DU HANGAR : le vaisseau du joueur (au choix parmi plusieurs), décor, cockpit
// ===================================================================
// Un seul TIE est visible à la fois dans le hangar ; la console permet d'en changer.
// En vol, on voit le cockpit (accroché à la caméra) à la place du TIE.
export function initHangarShips(ctx) {
    const { scene, camera, state } = ctx;
    const gltfLoader = makeGLTFLoader();

    const ships = [];
    let shipIndex = 0;
    let tiePlayer = null;       // TIE actuellement choisi
    let cockpit;
    let tieLoaded = false;
    let cockpitLoaded = false;
    let gameReady = false;

    function checkGameReady() {
        if (tieLoaded && cockpitLoaded) {
            gameReady = true;
            console.log("GAME READY");
        }
    }

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

    // TIE au choix : même place dans le hangar, taille propre à chaque modèle
    function loadShip(url, scale, onLoad) {
        gltfLoader.load(url, (gltf) => {
            const ship = gltf.scene;
            ship.position.set(0, -1, -70);
            ship.scale.set(scale, scale, scale);
            ship.rotation.y = Math.PI;
            scene.add(ship);
            tieLoaded = true;
            checkGameReady();
            addShip(ship);
            if (onLoad) onLoad(ship);
        });
    }

    loadShip('public/tieplayer.glb', 2);

    loadShip('public/tiefighter.glb', 0.02, (tiefighter) => {
        // 6 TIE rangés en hauteur dans le hangar (décor)
        [[12, 15, -70], [12, 15, -58], [0, 15, -70], [0, 15, -58], [-12, 15, -70], [-12, 15, -58]].forEach(p => {
            const copy = tiefighter.clone();
            copy.position.set(...p);
            scene.add(copy);
        });
    });

    loadShip('public/tieinter.glb', 2);
    loadShip('public/tiesilencer.glb', 6);

    // accessoires du hangar
    gltfLoader.load('public/hangaracc1.glb', (gltf) => {
        const hangaracc1 = gltf.scene;
        hangaracc1.position.set(20, -12, -75);
        hangaracc1.scale.set(4, 4, 4);
        hangaracc1.rotation.y = Math.PI / 1.8;
        scene.add(hangaracc1);

        const hangaracc2 = hangaracc1.clone();
        hangaracc2.position.set(20, -12, -68);
        hangaracc2.rotation.y = Math.PI / 2.1;
        scene.add(hangaracc2);
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

    // passer au TIE suivant (clic sur la console ou sur le TIE)
    function nextShip() {
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

    // ======= Levitation TIE PLAYER =====================
    const levitationClock = new THREE.Clock();
    let baseY = null; // pas encore défini

    function updateLevitation() {
        if (baseY === null && tiePlayer) baseY = tiePlayer.position.y;

        const t = levitationClock.getElapsedTime();

        if (tiePlayer) {
            // lévitation fluide : amplitude + vitesse ajustables
            tiePlayer.position.y = baseY + Math.sin(t * 2) * 0.2;

        }
    }

    // le cockpit flotte légèrement en vol
    let cockpitFloatTime = 0;
    function updateCockpit(dt) {
        if (cockpit && !state.isInsideShip) {

            cockpitFloatTime += dt;

            // Oscillation verticale douce
            cockpit.position.y = Math.sin(cockpitFloatTime * 1) * 0.02;

            // Légère rotation latérale
            cockpit.rotation.z = Math.sin(cockpitFloatTime * 2) * 0.01;

            // Micro pitch avant/arrière
            cockpit.rotation.x = Math.sin(cockpitFloatTime * 1.5) * 0.005;
        }
    }

    // à bord du TIE (en vol) : on voit le cockpit ; au hangar : on voit le TIE
    function showCockpit(inFlight) {
        if (tiePlayer) tiePlayer.visible = !inFlight;
        if (cockpit) cockpit.visible = inFlight;
    }

    return {
        get tiePlayer() { return tiePlayer; },
        get count() { return ships.length; },
        isReady: () => gameReady,
        nextShip, showCockpit, updateLevitation, updateCockpit
    };
}
