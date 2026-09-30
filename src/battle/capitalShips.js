import * as THREE from 'three';
import { RebelFleet } from '../fleet.js';
import { segmentSphere } from '../weapons.js';
import { makeGLTFLoader } from '../core/loaders.js';

// ===================================================================
// GRANDS CROISEURS REBELLES (logique dans src/fleet.js)
// ===================================================================
// Ils arrivent en sortie d'hyperespace, lâchent leurs escadrilles et
// bombardent le destroyer avec leurs turbolasers.

// Turbolasers : salves de tirs rouges vers la tourelle, la coque ou les destroyers en orbite
const TURBOLASER = {
    EVERY: [2.5, 5],          // secondes entre deux salves d'un même croiseur
    SALVO: [2, 4],            // tirs par salve
    GAP: 0.18,                // secondes entre deux tirs d'une salve
    SPEED: 650,
    LENGTH: 80,
    WIDTH: 5,
    COLOR: new THREE.Color(1, 0.25, 0.12),
    SHAKE_DISTANCE: 260       // un impact plus proche que ça secoue la caméra
};

function rand(a, b) { return a + Math.random() * (b - a); }

export function initCapitalShips(ctx) {
    const { scene, camera, state } = ctx;
    const { pivot } = ctx.destroyers;
    const battle = ctx.battle;
    const { bolts, fx, debris, battleOn } = battle;
    const loader = makeGLTFLoader();

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
        onPartDestroyed: () => {},  // son : la grosse explosion joue déjà un "boom" spatialisé
        // hors de combat : seuls les tirs du joueur touchent les croiseurs, c'est donc Dan
        onShipDisabled: (ship) => battle.capitalDestroyed(ship)
    });

    const capitalTemplates = [null, null, null];
    ['public/capital_part1.glb', 'public/capital_part2.glb', 'public/capital_part3.glb'].forEach((url, i) => {
        loader.load(url, (gltf) => {
            const part = gltf.scene;
            part.scale.set(0.5, 0.5, 0.5);
            part.rotation.y = Math.PI / 2;
            capitalTemplates[i] = part;
            // Home One (MC80) : 3 parties avant / milieu / arrière
            if (capitalTemplates.every(Boolean)) rebelFleet.addType('homeone', {
                parts: capitalTemplates, hits: 10, radius: 380, speed: 24, label: 'Home One', feminine: false
            });
        });
    });

    // Autres vaisseaux rebelles (une seule partie). Même pack que le Home One :
    // même échelle (0.5) et même orientation (réacteurs à l'arrière, avant → +X).
    //   hits : tirs pour le détruire, radius : taille (évitements, explosions, place des escadrilles)
    //   label / feminine : nom affiché quand Dan le détruit ("… détruit !" / "… détruite !")
    [
        { name: 'liberty',   url: 'public/liberty.glb',   hits: 16, radius: 380, speed: 22,     // ~700 de long
          label: 'Croiseur Liberty', feminine: false },
        { name: 'frigate',   url: 'public/frigate.glb',   hits: 10, radius: 170, speed: 28,     // Nebulon-B, ~300
          label: 'Frégate Nebulon-B', feminine: true },
        // corvette CR-90 : version allégée, agrandie ×3 (sinon on la voyait à peine) et qui
        // navigue plus près du pont pour être bien visible depuis les fenêtres
        { name: 'cr90',      url: 'public/CR90_lite.glb', hits: 8,  radius: 130, speed: 40, scale: 1.5,
          zone: { minZ: 550, maxZ: 1500, maxX: 900, minY: 150, maxY: 420 },                    // ~225 de long
          label: 'Corvette CR-90', feminine: true },
        // transport GR-75 : agrandi ×4,4 (à 45 de long, il était invisible au loin)
        { name: 'transport', url: 'public/transport.glb', hits: 6,  radius: 115, speed: 32, scale: 2.2,
          zone: { minZ: 700, maxZ: 1900, maxX: 1100, minY: 150, maxY: 450 },                   // ~195 de long
          label: 'Transport GR-75', feminine: false }
    ].forEach(t => {
        loader.load(t.url, (gltf) => {
            const ship = gltf.scene;
            ship.scale.setScalar(t.scale || 0.5);
            ship.rotation.y = Math.PI / 2;
            const def = { parts: [ship], hits: t.hits, radius: t.radius, speed: t.speed, label: t.label, feminine: t.feminine };
            if (t.zone) def.zone = t.zone;
            rebelFleet.addType(t.name, def);
        });
    });

    // -------------------------------------------------------------------
    // TURBOLASERS : les croiseurs tirent sur le destroyer
    // -------------------------------------------------------------------
    const aimRay = new THREE.Raycaster();
    const salvos = [];                    // tirs programmés { ship, target, left, wait }
    const _cam = new THREE.Vector3();

    // cible au hasard : la tourelle du pont (on voit les impacts depuis les fenêtres),
    // la coque de l'Executor, ou un destroyer en orbite
    function pickTarget(from) {
        const r = Math.random();
        let aim;
        if (r < 0.45) aim = new THREE.Vector3(rand(-120, 120), rand(0, 90), rand(-80, 170));
        else if (r < 0.8 || !pivot.children.length) aim = new THREE.Vector3(rand(-1200, 1200), -70, rand(250, 1800));
        else aim = pivot.children[Math.floor(Math.random() * pivot.children.length)].getWorldPosition(new THREE.Vector3())
                   .add(new THREE.Vector3(rand(-150, 150), rand(-30, 30), rand(-150, 150)));

        // point d'impact réel sur la coque (un seul lancer de rayon par salve)
        const dir = aim.clone().sub(from).normalize();
        aimRay.set(from, dir);
        aimRay.far = from.distanceTo(aim) + 400;
        const hit = aimRay.intersectObjects([...ctx.executor.exteriorColliders, ...pivot.children], true)[0];
        return hit ? hit.point : aim;
    }

    function fire(ship, target) {
        const from = rebelFleet.randomHullPoint(ship);
        const dist = from.distanceTo(target);
        bolts.fire({
            from, dir: target.clone().sub(from),
            speed: TURBOLASER.SPEED, length: TURBOLASER.LENGTH, width: TURBOLASER.WIDTH,
            color: TURBOLASER.COLOR, range: dist + 60, team: 'rebel',
            hitTest: (bolt, p0, p1) => {
                // le TIE du joueur se trouve sur la trajectoire
                if (!state.isInsideShip) {
                    camera.getWorldPosition(_cam);
                    const t = segmentSphere(p0, p1, _cam, 7);
                    if (t >= 0) return { kind: 'player', point: new THREE.Vector3().lerpVectors(p0, p1, t) };
                }
                return bolt.travelled >= dist ? { kind: 'hull', point: target } : null;
            },
            onHit: (bolt, hit) => {
                if (hit.kind === 'player') { battle.playerHit(); return; }
                fx.impact(hit.point, TURBOLASER.COLOR, 9);
                fx.explosion(hit.point, rand(9, 15));
                debris.spawn(hit.point, 3, { speed: [10, 35], size: [0.6, 2], life: [2, 4], hot: 1 });
                camera.getWorldPosition(_cam);
                if (hit.point.distanceTo(_cam) < TURBOLASER.SHAKE_DISTANCE) state.cameraShake = Math.max(state.cameraShake, 0.35);
            }
        });
        ctx.audio.laserSoundAt(from, true);
    }

    function updateTurbolasers(dt) {
        if (!battleOn()) { salvos.length = 0; return; }

        for (const ship of rebelFleet.ships) {
            if (ship.state !== 'cruise') continue;
            if (ship.nextSalvo === undefined) ship.nextSalvo = rand(1, TURBOLASER.EVERY[1]);
            ship.nextSalvo -= dt;
            if (ship.nextSalvo <= 0) {
                ship.nextSalvo = rand(...TURBOLASER.EVERY);
                const target = pickTarget(ship.group.position);
                salvos.push({ ship, target, left: Math.round(rand(...TURBOLASER.SALVO)), wait: 0 });
            }
        }

        for (let i = salvos.length - 1; i >= 0; i--) {
            const s = salvos[i];
            s.wait -= dt;
            if (s.wait > 0) continue;
            if (s.ship.state !== 'cruise') { salvos.splice(i, 1); continue; }
            fire(s.ship, s.target.clone().add(new THREE.Vector3(rand(-6, 6), rand(-4, 4), rand(-6, 6))));
            s.wait = TURBOLASER.GAP;
            if (--s.left <= 0) salvos.splice(i, 1);
        }
    }

    return { fleet: rebelFleet, updateTurbolasers };
}
