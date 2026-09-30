import * as THREE from 'three';
import { segmentSphere } from '../weapons.js';

// Combat entre IA : tirs des X-Wing et des TIE, touches, explosions au hasard,
// et le joueur touché quand il vole
export function initDogfight(ctx) {
    const { camera, state, hud } = ctx;
    const { laserSoundAt, sounds } = ctx.audio;
    const battle = ctx.battle;
    const { bolts, enemies, friendlyShips, battleOn, hitShipList } = battle;

    // ===================================================================
    // SYSTÈME DE COMBAT SPATIAL - VERSION CORRIGÉE
    // ===================================================================

    // -------------------------------------------------------------------
    // 1. DÉCLARATION DES VARIABLES GLOBALES
    // -------------------------------------------------------------------


    // Couleurs des lasers
    const laserRed = new THREE.Color(1, 0.2, 0.1);
    const laserGreen = new THREE.Color(0.2, 1, 0.3);

    // -------------------------------------------------------------------
    // 2. FONCTION D'EXPLOSION RAPIDE (si elle n'existe pas)
    // -------------------------------------------------------------------

    // petite explosion (même taille qu'avant : createStandardExplosion × 1.1)
    function createQuickExplosion(position, scale = 8) {
        battle.fx.explosion(position, scale * 1.1);
    }

    // -------------------------------------------------------------------
    // 6. SYSTÈME DE LASERS (plus grands)
    // -------------------------------------------------------------------

    function createLaser(position, direction, color, isEnemy, range = 420) {
        bolts.fire({
            from: position, dir: direction,
            speed: 400, length: 24, width: 1.6, color, range,
            team: isEnemy ? 'rebel' : 'empire',
            hitTest: isEnemy ? rebelBoltHitTest : empireBoltHitTest,
            onHit: isEnemy ? onRebelBoltHit : onEmpireBoltHit
        });
        laserSoundAt(position, isEnemy);
    }

    // tirs verts des TIE alliés → X-Wing
    function empireBoltHitTest(bolt, p0, p1) {
        return hitShipList(enemies, p0, p1, 25);
    }
    function onEmpireBoltHit(bolt, hit) {
        battle.destroyEnemy(hit.target);
    }

    // tirs rouges des X-Wing → TIE alliés, ou le joueur quand il vole
    function rebelBoltHitTest(bolt, p0, p1) {
        const t = hitShipList(friendlyShips, p0, p1, 25);
        if (t) return { kind: 'tie', ...t };
        if (!state.isInsideShip) {
            const cam = camera.getWorldPosition(new THREE.Vector3());
            const tt = segmentSphere(p0, p1, cam, 6);
            if (tt >= 0) return { kind: 'player', t: tt, point: new THREE.Vector3().lerpVectors(p0, p1, tt) };
        }
        return null;
    }
    function onRebelBoltHit(bolt, hit) {
        if (hit.kind === 'tie') battle.destroyTie(hit.target);
        else playerHit();
    }

    // le joueur est touché : pas de "game over", juste un flash et une secousse
    function playerHit() {
        hud.flashHurt();
        state.cameraShake = 1.2;
        if (sounds.metalCollisionSound && sounds.metalCollisionSound.buffer) {
            if (sounds.metalCollisionSound.isPlaying) sounds.metalCollisionSound.stop();
            sounds.metalCollisionSound.play();
        }
    }

    function updateLasers(dt) {
        // bataille cachée → on retire les tirs des IA (les tirs du joueur finissent leur course)
        if (!battleOn()) bolts.clear(b => b.team === 'rebel' || b.team === 'empire');
    }

    // -------------------------------------------------------------------
    // 7. TIRS ASYNCHRONES (avec décalage pour éviter la同步)
    // -------------------------------------------------------------------

    function updateShooting(dt) {
        if (!battleOn()) return;

        const time = performance.now() * 0.001;

        // Tirs des X-Wing
        enemies.forEach(enemy => {
            if (!enemy || !enemy.visible || enemy.userData.phase !== 'battle') return;

            // Initialisation avec décalage aléatoire
            if (enemy.userData.nextShot === undefined) {
                enemy.userData.nextShot = time + Math.random() * 3;
                enemy.userData.fireRate = 1.5 + Math.random() * 2.5;
            }

            const nearPlayer = !state.isInsideShip && enemy.position.distanceTo(ctx.player.position) < 700;
            if (time > enemy.userData.nextShot && nearPlayer && Math.random() < 0.35) {
                // En vol, certains X-Wing visent le joueur (avec une bonne marge d'erreur)
                const aimP = camera.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(
                    (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50));
                const direction = aimP.sub(enemy.position).normalize();
                createLaser(enemy.position.clone().add(direction.clone().multiplyScalar(15)), direction, laserRed, true, 800);
                enemy.userData.nextShot = time + enemy.userData.fireRate * (0.8 + Math.random() * 0.4);
            } else if (time > enemy.userData.nextShot && friendlyShips.length > 0) {
                // Choisir une cible aléatoire
                const target = friendlyShips[Math.floor(Math.random() * friendlyShips.length)];
                if (target && target.visible) {
                    const direction = target.position.clone().sub(enemy.position).normalize();
                    createLaser(
                        enemy.position.clone().add(direction.clone().multiplyScalar(15)),
                        direction,
                        laserRed,
                        true
                    );
                }
                // Prochain tir avec variation
                enemy.userData.nextShot = time + enemy.userData.fireRate * (0.8 + Math.random() * 0.4);
            }
        });

        // Tirs des TIE
        friendlyShips.forEach(tie => {
            if (!tie || !tie.visible || tie.userData.phase !== 'battle') return;

            if (tie.userData.nextShot === undefined) {
                tie.userData.nextShot = time + Math.random() * 3;
                tie.userData.fireRate = 1.5 + Math.random() * 2.5;
            }

            if (time > tie.userData.nextShot && enemies.length > 0) {
                const target = enemies[Math.floor(Math.random() * enemies.length)];
                if (target && target.visible) {
                    const direction = target.position.clone().sub(tie.position).normalize();
                    createLaser(
                        tie.position.clone().add(direction.clone().multiplyScalar(15)),
                        direction,
                        laserGreen,
                        false
                    );
                }
                tie.userData.nextShot = time + tie.userData.fireRate * (0.8 + Math.random() * 0.4);
            }
        });
    }

    // -------------------------------------------------------------------
    // 8.  ALÉATOIRES
    // -------------------------------------------------------------------

    function randomExplosions(dt) {
        if (!battleOn()) return;

        const time = performance.now() * 0.001;

        // X-Wing explosent aléatoirement
        enemies.forEach(enemy => {
            if (!enemy || !enemy.visible || enemy.userData.phase !== 'battle') return;

            if (enemy.userData.nextRandomExplosion === undefined) {
                enemy.userData.nextRandomExplosion = time + 3 + Math.random() * 8;
            }

            if (time > enemy.userData.nextRandomExplosion) {
                if (Math.random() < 0.3) {
                    battle.destroyEnemy(enemy);
                } else {
                    const nearPos = enemy.position.clone().add(
                        new THREE.Vector3(
                            (Math.random() - 0.5) * 40,
                            (Math.random() - 0.5) * 40,
                            (Math.random() - 0.5) * 40
                        )
                    );
                    createQuickExplosion(nearPos, 10);
                }
                enemy.userData.nextRandomExplosion = time + 4 + Math.random() * 8;
            }
        });

        // TIE explosent aléatoirement
        friendlyShips.forEach(tie => {
            if (!tie || !tie.visible || tie.userData.phase !== 'battle') return;

            if (tie.userData.nextRandomExplosion === undefined) {
                tie.userData.nextRandomExplosion = time + 3 + Math.random() * 8;
            }

            if (time > tie.userData.nextRandomExplosion) {
                if (Math.random() < 0.3) {
                    battle.destroyTie(tie);
                } else {
                    const nearPos = tie.position.clone().add(
                        new THREE.Vector3(
                            (Math.random() - 0.5) * 40,
                            (Math.random() - 0.5) * 40,
                            (Math.random() - 0.5) * 40
                        )
                    );
                    createQuickExplosion(nearPos, 10);
                }
                tie.userData.nextRandomExplosion = time + 4 + Math.random() * 8;
            }
        });
    }

    // -------------------------------------------------------------------
    // 10. FONCTION DE MISE À JOUR GLOBALE
    // -------------------------------------------------------------------

    function updateCombat(dt) {
        if (!battle.tiesReady()) return;

        battle.updateTieWaves(dt);
        battle.updateTies(dt);
        updateShooting(dt);
        updateLasers(dt);
        randomExplosions(dt);
    }

    return { playerHit, updateCombat };
}
