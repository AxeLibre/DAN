import * as THREE from 'three';

// Affichage de combat : réticule du canon (curseur), HUD (voir CombatHUD dans weapons.js), radar
export function initBattleHud(ctx) {
    const { camera, renderer, state, hud } = ctx;
    const battle = ctx.battle;
    const { enemies } = battle;

    const cursorDiv = document.createElement('div');
    cursorDiv.id = 'cursor-target';
    cursorDiv.innerHTML = `
        <svg width="60" height="60" viewBox="0 0 60 60">
            <!-- Cercle extérieur fin -->
            <circle cx="30" cy="30" r="14" stroke="#ff6600" stroke-width="2" fill="none" stroke-opacity="0.8"/>

            <!-- Deuxième cercle intérieur plus petit -->
            <circle cx="30" cy="30" r="6" stroke="#ff6600" stroke-width="1.5" fill="none" stroke-opacity="0.6"/>

            <!-- Grande croix (tirets) -->
            <line x1="30" y1="10" x2="30" y2="20" stroke="#ff6600" stroke-width="2" stroke-opacity="0.8"/>
            <line x1="30" y1="40" x2="30" y2="50" stroke="#ff6600" stroke-width="2" stroke-opacity="0.8"/>
            <line x1="10" y1="30" x2="20" y2="30" stroke="#ff6600" stroke-width="2" stroke-opacity="0.8"/>
            <line x1="40" y1="30" x2="50" y2="30" stroke="#ff6600" stroke-width="2" stroke-opacity="0.8"/>

            <!-- Petite croix centrale -->
            <line x1="30" y1="26" x2="30" y2="28" stroke="#ff6600" stroke-width="2.5" stroke-opacity="1"/>
            <line x1="30" y1="32" x2="30" y2="34" stroke="#ff6600" stroke-width="2.5" stroke-opacity="1"/>
            <line x1="26" y1="30" x2="28" y2="30" stroke="#ff6600" stroke-width="2.5" stroke-opacity="1"/>
            <line x1="32" y1="30" x2="34" y2="30" stroke="#ff6600" stroke-width="2.5" stroke-opacity="1"/>

            <!-- Point central -->
            <circle cx="30" cy="30" r="2" fill="#ff6600" fill-opacity="0.9"/>
        </svg>
    `;
    document.body.appendChild(cursorDiv);

    // Styles
    cursorDiv.style.position = 'fixed';
    cursorDiv.style.top = '50%';
    cursorDiv.style.left = '50%';
    cursorDiv.style.transform = 'translate(-50%, -50%)';
    cursorDiv.style.zIndex = '999999';
    cursorDiv.style.display = 'none';
    cursorDiv.style.pointerEvents = 'none';
    cursorDiv.style.backgroundColor = 'transparent';
    cursorDiv.style.filter = 'drop-shadow(0 0 8px #ff6600)';


    // Faire suivre le curseur par la souris
    document.addEventListener('mousemove', (e) => {
        if (cursorDiv.style.display === 'block') {
            cursorDiv.style.left = e.clientX + 'px';
            cursorDiv.style.top = e.clientY + 'px';
        }
    });

    // Affichage du HUD selon la situation
    function refreshHud() {
        const turretMode = state.isInsideShip && state.cannonActive;
        hud.show(!state.isInsideShip ? 'flight' : (turretMode ? 'turret' : null));
        cursorDiv.style.display = turretMode ? 'block' : 'none';
        renderer.domElement.style.cursor = turretMode || !state.isInsideShip ? 'none' : '';
    }

    let radarTimer = 0;
    const _proj = new THREE.Vector3();
    function updateCombatHud(dt) {
        if (!hud.mode) return;

        const lock = hud.mode === 'flight' ? battle.weapons.tieLock : battle.weapons.turretLock;
        if (lock) {
            _proj.copy(lock.position).project(camera);
            const onScreen = _proj.z < 1 && Math.abs(_proj.x) < 1 && Math.abs(_proj.y) < 1;
            hud.showLock((_proj.x + 1) / 2 * window.innerWidth, (1 - _proj.y) / 2 * window.innerHeight, onScreen);
        } else {
            hud.showLock(0, 0, false);
        }

        radarTimer -= dt;
        if (radarTimer <= 0) {
            radarTimer = 0.1;
            const xs = enemies.filter(e => e.visible).map(e => e.position);
            const caps = battle.fleet.positions();
            hud.drawRadar(ctx.player.position, ctx.player.rotation.y, xs, caps, hud.mode === 'flight' ? 1400 : 2200);
        }
    }

    return { refreshHud, updateCombatHud };
}
