import { initLoadingScreen } from './core/loaders.js';
import { createContext } from './core/context.js';
import { handleResize } from './core/stage.js';
import { createSkybox } from './core/skybox.js';
import { createBloom } from './core/bloom.js';
import { startLoop } from './core/loop.js';
import { initAudio } from './audio.js';
import { initVolumeControl } from './ui/volume.js';
import { initExecutor } from './executor.js';
import { initDestroyers } from './battle/destroyers.js';
import { initHyperspace } from './bridge/hyperspace.js';
import { initMapScreen } from './bridge/mapScreen.js';
import { initScreens } from './bridge/screens.js';
import { initDoors } from './bridge/doors.js';
import { initDecor } from './bridge/decor.js';
import { initInfoBubbles, loadStarJediFont } from './bridge/infoBubbles.js';
import { initHologram } from './bridge/hologram.js';
import { initHologramMenu } from './bridge/hologramMenu.js';
import { initConsoleButtons } from './bridge/consoleButtons.js';
import { initAlarm } from './bridge/alarm.js';
import { initClicks } from './bridge/clicks.js';
import { initHangarShips } from './hangar/ships.js';
import { initHangarConsole } from './hangar/console.js';
import { initLanding } from './hangar/landing.js';
import { initBattle } from './battle/index.js';
import { initPlayer } from './player.js';

// =========================================================================================
// LE DESTROYER DE DAN — point d'entrée
// =========================================================================================
// Chaque domaine du jeu est un module (voir les dossiers core/, bridge/, hangar/, battle/).
// Ici, on crée le contexte partagé (ctx), on initialise les modules dans l'ordre, puis
// on lance la boucle d'animation (core/loop.js).

loadStarJediFont();   // police des bulles d'info (voir src/bridge/infoBubbles.js)

initLoadingScreen(() => ctx.audio.unlock());   // clic sur PLAY : débloque le son

// Scène, caméra, renderer et état partagé (voir src/core/context.js)
const ctx = createContext();
const { scene, camera, renderer } = ctx;

// Sons (voir src/audio.js)
ctx.audio = initAudio(scene, camera);

// Fond étoilé
ctx.sky = createSkybox(scene);

// Destroyers en orbite, Executor vu de dehors
ctx.destroyers = initDestroyers(ctx);
ctx.executor = initExecutor(ctx);

// Passerelle (voir src/bridge/)
ctx.decor = initDecor(ctx);
ctx.hyperspace = initHyperspace(ctx);
ctx.mapScreen = initMapScreen(ctx);
ctx.screens = initScreens(ctx);
ctx.doors = initDoors(ctx);
ctx.infoBubbles = initInfoBubbles(ctx);
ctx.hologram = initHologram(ctx);
ctx.hologramMenu = initHologramMenu(ctx);
ctx.consoleButtons = initConsoleButtons(ctx);
ctx.alarm = initAlarm(ctx);

// Hangar : TIE au choix, console de choix, balise + pilote automatique (voir src/hangar/)
ctx.ships = initHangarShips(ctx);
ctx.hangarConsole = initHangarConsole(ctx);
ctx.landing = initLanding(ctx);

// Bataille spatiale (voir src/battle/)
ctx.battle = initBattle(ctx);

// Joueur : clavier, souris, collisions, entrée / sortie du vaisseau (voir src/player.js)
ctx.playerControls = initPlayer(ctx);

// Clics sur les boutons de la passerelle et la console du hangar
initClicks(ctx);

// Halo lumineux + redimensionnement de la fenêtre
const bloom = createBloom(scene, camera, renderer);
handleResize(camera, renderer, (w, h) => bloom.setSize(w, h));

// Bouton de volume (voir src/ui/volume.js)
initVolumeControl(ctx.audio, [ctx.hyperspace.video, ...ctx.screens.videos, ctx.mapScreen.video]);

startLoop(ctx, bloom);
