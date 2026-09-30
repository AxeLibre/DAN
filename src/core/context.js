import * as THREE from 'three';
import { createStage } from './stage.js';

/**
 * Objet partagé par tous les modules du jeu (au lieu de variables globales).
 * - scene, camera, renderer, env, lights : voir stage.js
 * - worldGroup : décor de la passerelle (c'est lui qu'on teste au clic de souris)
 * - mouse : position de la souris à l'écran (-1 → 1), raycaster : lancer de rayon partagé
 * - state : l'état du jeu qui change en cours de partie et que plusieurs modules lisent
 * Chaque module y dépose ensuite son interface (ctx.audio, ctx.executor, …) : les modules
 * se parlent à travers ctx pendant le jeu, jamais au moment où ils sont importés.
 */
export function createContext() {
    const { scene, camera, renderer, env, lights } = createStage();

    const worldGroup = new THREE.Group();      // projecteur + décor
    scene.add(worldGroup);

    return {
        scene, camera, renderer, env, lights, worldGroup,
        mouse: new THREE.Vector3(),
        raycaster: new THREE.Raycaster(),
        state: {
            isInsideShip: true,     // à pied dans le destroyer (passerelle + hangar) / en vol dehors
            // tir maintenu (clic gauche / barre d'espace)
            fireHeldMouse: false,
            fireHeldSpace: false,
            // orientation du joueur (clavier, ou pilote automatique qui remet le TIE à plat)
            rotationVelocity: 0,    // vitesse de rotation gauche / droite
            flightPitch: 0,         // nez du TIE vers le haut / le bas
            flightRoll: 0,          // inclinaison dans les virages
            currentFlightSpeed: 1,  // vitesse du TIE en vol (accélération progressive)
            cannonActive: false,    // canon laser de la passerelle sorti
            cameraShake: 0          // secousse de la caméra (tir, impact, collision)
        }
    };
}
