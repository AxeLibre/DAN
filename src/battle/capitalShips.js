import * as THREE from 'three';
import { RebelFleet } from '../fleet.js';
import { makeGLTFLoader } from '../core/loaders.js';

// Grands croiseurs rebelles (logique dans src/fleet.js) : renvoie la flotte
export function initCapitalShips(ctx) {
    const { scene } = ctx;
    const { pivot } = ctx.destroyers;
    const battle = ctx.battle;
    const { fx, debris, battleOn } = battle;
    const loader = makeGLTFLoader();

    // ===================================================================
    // GRANDS CROISEURS REBELLES (logique dans src/fleet.js)
    // ===================================================================

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
            battle.launchSquadron(ship);
            setTimeout(() => { if (battleOn() && ship.state === 'cruise') battle.launchSquadron(ship); }, 1800);
        },
        onPartDestroyed: () => {}   // son : la grosse explosion joue déjà un "boom" spatialisé
    });

    const capitalTemplates = [null, null, null];
    ['public/capital_part1.glb', 'public/capital_part2.glb', 'public/capital_part3.glb'].forEach((url, i) => {
        loader.load(url, (gltf) => {
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
        loader.load(t.url, (gltf) => {
            const ship = gltf.scene;
            ship.scale.setScalar(t.scale || 0.5);
            ship.rotation.y = Math.PI / 2;
            const def = { parts: [ship], hits: t.hits, radius: t.radius, speed: t.speed };
            if (t.zone) def.zone = t.zone;
            rebelFleet.addType(t.name, def);
        });
    });

    return rebelFleet;
}
