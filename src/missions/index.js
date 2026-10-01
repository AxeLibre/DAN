import { createCinematics } from './cinematics.js';
import { initAsteroidMission } from './asteroids/mission.js';
import { initFuelMission } from './fuel/mission.js';
import { initMissionHud } from '../ui/missionHud.js';
import { initMissionSelect } from '../ui/missionSelect.js';

// =========================================================================================
// MISSIONS EN TIE
// =========================================================================================
// En montant dans le TIE (sortie du hangar), on choisit une mission :
//   - 'battle'    : la bataille contre la flotte rebelle
//   - 'asteroids' : protéger l'Executor dans un champ d'astéroïdes
//   - 'fuel'      : escorter le croiseur-citerne, puis abattre le Slave I de Boba Fett
// Tant qu'aucune mission n'est choisie, le TIE reste en vol stationnaire devant le hangar.
// Le bouton "Retour au hangar" (ou H) ramène proprement au hangar et arrête la mission.
export function initMissions(ctx) {
    const { state, player, camera } = ctx;
    const hud = initMissionHud();
    const cine = createCinematics(ctx);
    let returning = false;
    let wasInside = true;

    const asteroids = initAsteroidMission(ctx, { hud, cine, returnToHangar });
    const fuel = initFuelMission(ctx, { hud, cine, returnToHangar });
    const byId = { asteroids, fuel };
    const current = () => byId[state.mission] || null;

    // cibles de la mission en cours : tirs du joueur, aide à la visée, radar, collisions
    ctx.missionTargets = {
        active: () => !!(current() && current().active()),
        hitTest: (p0, p1) => current() ? current().hitTest(p0, p1) : null,
        hit: (target, point) => { if (current()) current().hit(target, point); },
        lockCandidates: () => current() ? current().lockCandidates() : [],
        radarPositions: () => current() ? current().radarPositions() : [],
        collide: (pos, move, margin) => current() ? current().collide(pos, move, margin) : null
    };
    const select = initMissionSelect({ onPick: pick, onHangar: returnToHangar });

    function pick(id) {
        if (state.isInsideShip || state.mission) return;
        select.setOpen(false);
        if (id === 'battle') {
            state.mission = 'battle';            // la bataille démarre (voir battleOn)
            ctx.battle.announce('La flotte rebelle attaque !');
        } else if (byId[id]) {
            byId[id].start();
        }
    }

    function stopMission() {
        asteroids.stop();
        fuel.stop();
        state.mission = null;
        select.setOpen(false);
    }

    // retour propre au hangar : fondu au noir, on replace le joueur, l'entrée dans le vaisseau
    // se fait toute seule (zone de détection), puis retour à l'image
    async function returnToHangar() {
        if (returning) return;
        returning = true;
        await cine.fade(1, 0.5);
        stopMission();
        ctx.landing.cancel();
        cine.bars(false);
        state.cinematic = false;
        state.fireHeldMouse = state.fireHeldSpace = false;
        state.flightPitch = state.flightRoll = state.rotationVelocity = 0;
        state.cameraShake = 0;
        player.position.set(0, 3.5, -60);
        player.rotation.y = Math.PI;
        camera.rotation.set(0, 0, 0);
        camera.position.set(0, 0, 0);
        ctx.battle.bolts.clear();
        await cine.wait(0.35);
        await cine.fade(0, 0.6);
        returning = false;
    }

    function update(dt) {
        const inside = state.isInsideShip;
        if (!inside && wasInside && !returning) select.setOpen(true);   // on vient de monter dans le TIE
        if (inside && !wasInside) stopMission();                          // atterrissage par la balise
        wasInside = inside;
        select.setHangarButton(!inside && !state.cinematic && !returning);
        asteroids.update(dt);
        fuel.update(dt);
    }

    return { update, returnToHangar };
}
