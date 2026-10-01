import * as THREE from 'three';
import { makeGLTFLoader } from '../core/loaders.js';

// ===================================================================
// TIE DU HANGAR : le vaisseau du joueur (au choix parmi plusieurs), décor, cockpit
// ===================================================================
// Le TIE choisi est au centre du hangar. Pour en changer (console ou clic sur le TIE),
// le suivant arrive de la gauche et pousse le précédent vers la baie de droite, où il
// reste garé ; celui qui s'y trouvait repart à droite, derrière la paroi. En boucle.
// Au début, la baie de droite est vide (on ne dévoile pas les autres TIE tout de suite).
// En vol, on voit le cockpit (accroché à la caméra) à la place du TIE.

// emplacements (repère du monde) : le TIE choisi garde la place d'origine (zone d'embarquement)
const CENTER = new THREE.Vector3(0, -1, -70);
const RIGHT_BAY = new THREE.Vector3(33, -1, -60);    // baie latérale droite (x 25 → 45, z -42 → -78)
const OFF_LEFT = new THREE.Vector3(-78, -1, -60);    // caché derrière la paroi de gauche
const OFF_RIGHT = new THREE.Vector3(78, -1, -60);    // caché derrière la paroi de droite
const SWAP_TIME = 2.2;                                // secondes pour un changement de TIE

// TIE garés au plafond du hangar, dans le caisson de rangement (x ±21, z -41 → -81, y 14 → 31)
const PARKED_SCALE = 0.018;
const PARKED = [[-13.6, 22.5, -51.5], [0, 22.5, -51.5], [13.6, 22.5, -51.5],
                [-13.6, 22.5, -71.5], [0, 22.5, -71.5], [13.6, 22.5, -71.5]];

export function initHangarShips(ctx) {
    const { scene, camera, state } = ctx;
    const gltfLoader = makeGLTFLoader();

    const ships = [];           // dans l'ordre de la liste (et non du chargement)
    let shipIndex = 0;
    let tiePlayer = null;       // TIE actuellement choisi (au centre)
    let rightShip = null;       // TIE garé dans la baie de droite
    let swap = null;            // changement de TIE en cours
    let cockpit;
    let tieLoaded = false;
    let cockpitLoaded = false;
    let gameReady = false;

    function checkGameReady() {
        if (tieLoaded && cockpitLoaded) {
            gameReady = true;
        }
    }

    // place le CENTRE du vaisseau (et non son origine) sur un emplacement de baie / caché
    function slotPosition(ship, slot) {
        if (slot === CENTER) return CENTER.clone();
        return slot.clone().sub(ship.userData.centerOffset).setY(slot.y);
    }

    // TIE au choix : même place dans le hangar, taille propre à chaque modèle
    function loadShip(url, index, scale, onLoad) {
        gltfLoader.load(url, (gltf) => {
            const ship = gltf.scene;
            ship.position.copy(CENTER);
            ship.scale.set(scale, scale, scale);
            ship.rotation.y = Math.PI;
            scene.add(ship);
            // décalage entre l'origine du modèle et le centre de sa boîte (en x / z)
            const box = new THREE.Box3().setFromObject(ship);
            ship.userData.centerOffset = box.getCenter(new THREE.Vector3()).sub(ship.position).setY(0);
            ship.visible = index === shipIndex;
            ships[index] = ship;
            if (index === shipIndex) { tiePlayer = ship; tieLoaded = true; checkGameReady(); }
            if (onLoad) onLoad(ship);
        });
    }

    loadShip('public/tieplayer.glb', 0, 2);

    loadShip('public/tiefighter.glb', 1, 0.02, (tiefighter) => {
        // 6 TIE rangés au plafond du hangar (décor)
        PARKED.forEach(p => {
            const copy = tiefighter.clone();
            copy.position.set(...p);
            copy.scale.setScalar(PARKED_SCALE);
            copy.visible = true;
            scene.add(copy);
        });
    });

    loadShip('public/tieinter.glb', 2, 2);
    loadShip('public/tiesilencer.glb', 3, 4.6);   // (6 auparavant : trop long pour la baie latérale)

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
        if (swap || !tiePlayer) return;               // un changement à la fois
        const loaded = ships.filter(Boolean);
        if (loaded.length < 2) return;
        // suivant dans la liste (en sautant les modèles pas encore chargés)
        let i = shipIndex;
        do { i = (i + 1) % ships.length; } while (!ships[i]);
        const incoming = ships[i];
        const moves = [
            { ship: incoming, from: slotPosition(incoming, OFF_LEFT), to: CENTER.clone() },
            { ship: tiePlayer, from: tiePlayer.position.clone().setY(CENTER.y), to: slotPosition(tiePlayer, RIGHT_BAY) }
        ];
        if (rightShip && rightShip !== incoming) {
            moves.push({ ship: rightShip, from: rightShip.position.clone().setY(CENTER.y), to: slotPosition(rightShip, OFF_RIGHT), leaves: true });
        }
        incoming.position.copy(moves[0].from);
        incoming.visible = true;
        swap = { t: 0, moves };
        rightShip = tiePlayer;
        tiePlayer = incoming;
        shipIndex = i;
    }

    // ======= Lévitation des TIE + glissement pendant un changement =====================
    const levitationClock = new THREE.Clock();

    function updateLevitation() {
        const dt = Math.min(levitationClock.getDelta(), 0.1);
        const t = levitationClock.elapsedTime;

        if (swap) {
            swap.t = Math.min(1, swap.t + dt / SWAP_TIME);
            const e = swap.t * swap.t * (3 - 2 * swap.t);                 // départ et arrivée en douceur
            const v = 6 * swap.t * (1 - swap.t);                          // "vitesse" (0 aux deux bouts)
            for (const m of swap.moves) {
                m.ship.position.lerpVectors(m.from, m.to, e);
                m.ship.position.y += Math.sin(swap.t * Math.PI) * 1.5;    // il se soulève un peu en glissant
                m.ship.rotation.z = -0.12 * v;                            // et s'incline dans le sens du mouvement
            }
            if (swap.t >= 1) {
                for (const m of swap.moves) {
                    m.ship.rotation.z = 0;
                    if (m.leaves) m.ship.visible = false;
                }
                swap = null;
            }
        }

        // lévitation fluide des TIE posés (centre + baie de droite)
        [tiePlayer, rightShip].forEach((ship, k) => {
            if (!ship || (swap && swap.moves.some(m => m.ship === ship))) return;
            ship.position.y = CENTER.y + Math.sin(t * 2 + k * 1.7) * 0.2;
        });
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
        get count() { return ships.filter(Boolean).length; },
        isReady: () => gameReady,
        nextShip, showCockpit, updateLevitation, updateCockpit
    };
}
