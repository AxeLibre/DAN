import { createStage } from './stage.js';

/**
 * Objet partagé par tous les modules du jeu (au lieu de variables globales).
 * - scene, camera, renderer, env : voir stage.js
 * - state : l'état du jeu qui change en cours de partie et que plusieurs modules lisent
 * Chaque module y dépose ensuite son interface (ctx.audio, ctx.executor, …) : les modules
 * se parlent à travers ctx pendant le jeu, jamais au moment où ils sont importés.
 */
export function createContext() {
    const { scene, camera, renderer, env } = createStage();
    return {
        scene, camera, renderer, env,
        state: {
            isInsideShip: true      // à pied dans le destroyer (passerelle + hangar) / en vol dehors
        }
    };
}
