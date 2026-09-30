import * as THREE from 'three';
import { LaserBolts, ExplosionFX, CombatHUD, DebrisField, InstancedShips, segmentSphere } from '../weapons.js';
import { BLOOM_LAYER } from '../core/bloom.js';
import { initPlayerWeapons } from './playerWeapons.js';
import { initRebels } from './rebels.js';
import { initImperials } from './imperials.js';
import { initDogfight } from './dogfight.js';
import { initCapitalShips } from './capitalShips.js';
import { initBattleHud } from './hud.js';

// ===================================================================
// BATAILLE SPATIALE : armes du joueur, chasseurs, croiseurs, HUD
// ===================================================================
// Les sous-modules partagent l'objet ctx.battle (tirs, explosions, listes de vaisseaux…)
// et s'y ajoutent les uns les autres ; ils ne s'appellent qu'en cours de partie.
export function initBattle(ctx) {
    const { scene, state } = ctx;

    // SYSTÈMES D'ARMES (voir src/weapons.js)
    const bolts = new LaserBolts(scene);          // tous les tirs laser
    const fx = new ExplosionFX(scene, 12000);     // toutes les explosions GLSL
    ctx.hud = new CombatHUD();                    // réticule / score / radar
    const debris = new DebrisField(scene, fx);

    // objets lumineux (voir core/bloom.js)
    bolts.mesh.layers.enable(BLOOM_LAYER);
    fx.points.layers.enable(BLOOM_LAYER);

    // Toutes les explosions GLSL font du bruit, là où elles ont lieu (voir src/audio.js)
    ctx.audio.attachExplosionSounds(fx);

    // La bataille (X-Wing + TIE alliés) est visible avec le canon OU en vol
    function battleOn() {
        return state.cannonActive || !state.isInsideShip;
    }

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

    const enemies = [];           // X-Wing / Y-Wing (ennemis)
    const friendlyShips = [];     // TIE (amis)
    const battle = ctx.battle = { bolts, fx, debris, enemies, friendlyShips, battleOn, instancerFor };

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
        const c = battle.fleet.hitTest(p0, p1, bolt);
        if (x && (!c || x.t <= c.t)) return { kind: 'xwing', ...x };
        if (c) return { kind: 'capital', ...c };
        return null;
    }

    function onPlayerBoltHit(bolt, hit) {
        fx.impact(hit.point, bolt.color, hit.kind === 'capital' ? 10 : 4);
        if (hit.kind === 'xwing') {
            battle.destroyEnemy(hit.target, true);
        } else if (hit.kind === 'capital') {
            battle.fleet.hit(hit.ship, hit.part, hit.point, bolt.dir);
        }
    }

    Object.assign(battle, { hitShipList, playerBoltHitTest, onPlayerBoltHit });

    battle.weapons = initPlayerWeapons(ctx);
    Object.assign(battle, initRebels(ctx));
    Object.assign(battle, initImperials(ctx));
    Object.assign(battle, initDogfight(ctx));
    const capitalShips = initCapitalShips(ctx);
    battle.fleet = capitalShips.fleet;
    battle.updateTurbolasers = capitalShips.updateTurbolasers;
    Object.assign(battle, initBattleHud(ctx));

    // Score de Dan : chasseurs abattus + croiseurs mis hors de combat
    const score = { fighters: 0, capitals: 0 };
    battle.addKill = function (kind) {
        if (kind === 'capital') score.capitals++;
        else score.fighters++;
        ctx.hud.setScore(score.fighters, score.capitals);
    };
    // un croiseur rebelle hors de combat : on compte, et on l'annonce en grand
    battle.capitalDestroyed = function (ship) {
        battle.addKill('capital');
        battle.announce(`${ship.def.label} détruit${ship.def.feminine ? 'e' : ''} !`);
    };

    // BOUTON D'ACTIVATION/DÉSACTIVATION DU CANON (bouton blanc de la console)
    battle.toggleCannon = function () {
        const { laseron, laseroff } = ctx.audio.sounds;
        state.cannonActive = !state.cannonActive;
        battle.weapons.setTurret(state.cannonActive);
        state.fireHeldMouse = false;

        if (state.cannonActive) laseron.play();
        else laseroff.play();

        battle.refreshHud();
    };

    // armes du joueur (avant le reste : même ordre qu'avant dans la boucle)
    battle.updateWeapons = function (dt) {
        battle.weapons.updateTurret(dt);
        battle.weapons.updateTieGuns(dt);
    };

    battle.update = function (dt) {
        // Mettre à jour les X-Wing seulement s'ils existent
        battle.updateBattleWaves(dt);
        if (battle.enemies.length > 0) {
            battle.updateEnemies(dt);
        }

        // Mettre à jour les TIE seulement s'ils existent
        if (battle.tiesReady() && battle.friendlyShips.length > 0) {
            battle.updateCombat(dt);
        }
        battle.fleet.update(dt);
        battle.updateTurbolasers(dt);
        debris.update(dt);

        for (const kind in shipInstancers) shipInstancers[kind].update();   // chasseurs instanciés
        bolts.update(dt);
        fx.update(dt, ctx.camera, ctx.renderer);
        battle.updateCombatHud(dt);
    };

    return battle;
}
