import * as THREE from 'three';
import { LEGACY_TICK_RATE } from './constants.js';

// =========================================================================================
// BOUCLE D'ANIMATION : une image = chaque module avance d'un pas, puis rendu
// =========================================================================================
// L'ordre des appels est celui du jeu d'origine : ne pas le changer à la légère
// (ex. les armes après les commandes, la secousse de caméra juste avant le rendu).
export function startLoop(ctx, bloom) {
    const { player } = ctx;
    const clock = new THREE.Clock();

    function animate(){

        requestAnimationFrame(animate);

        const dt = Math.min(clock.getDelta(), 0.1);  // évite un saut énorme après un changement d'onglet
        const k = dt * LEGACY_TICK_RATE;             // équivalent "nombre d'images" de l'ancienne boucle

        ctx.playerControls.updateFlight(dt);

        ctx.hologram.update(dt, k);
        ctx.decor.update(dt, player.position);

        ctx.destroyers.update(k);
        ctx.playerControls.updateControls(dt);
        ctx.landing.update(dt);

        // (depuis l'origine, l'hyperespace n'est animé qu'une fois les portes chargées)
        if (ctx.doors.ready()) {
            ctx.doors.updateTrigger(player.position);
            ctx.hyperspace.update(k);
        }
        ctx.doors.update(k);

        ctx.ships.updateLevitation();

        ctx.playerControls.updateInOut();
        ctx.executor.updateTower();
        ctx.playerControls.keepWalkHeight(dt);

        // ===== ARMES & EFFETS =====
        ctx.battle.updateWeapons(dt);
        ctx.hangarConsole.update(dt);
        ctx.battle.updatePatrols(dt);
        ctx.sky.update(dt);

        ctx.alarm.update(dt);
        ctx.ships.updateCockpit(dt);
        ctx.mapScreen.update(dt);

        ctx.battle.update(dt);
        ctx.playerControls.updateCameraShake(dt);

        ctx.consoleButtons.update(dt);
        ctx.hologramMenu.update(player.position);
        ctx.infoBubbles.update(player.position);
        ctx.decor.updateDroidBeeps(dt);

        bloom.render();
    }

    // Démarrer l'animation
    requestAnimationFrame(animate);
}
