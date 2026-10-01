import * as THREE from 'three';

// =========================================================================================
// OUTILS DE CINÉMATIQUE : fondu, flash, titres, caméra braquée sur un point
// =========================================================================================
const CSS = `
#cine-overlay { position: fixed; inset: 0; z-index: 99996; pointer-events: none; background: #000; opacity: 0;
    transition: opacity .5s ease; }
#cine-flash { position: fixed; inset: 0; z-index: 99995; pointer-events: none; opacity: 0;
    background: radial-gradient(circle at 50% 50%, #fff 0%, #ffe2b0 35%, #ff7a2a 75%, #7a1a00 100%); }
#cine-bars::before, #cine-bars::after {           /* bandes noires "cinéma" */
    content: ''; position: fixed; left: 0; right: 0; height: 11vh; background: #000; z-index: 99994;
    transform: scaleY(0); transition: transform .6s ease; }
#cine-bars::before { top: 0; transform-origin: top; }
#cine-bars::after { bottom: 0; transform-origin: bottom; }
#cine-bars.on::before, #cine-bars.on::after { transform: scaleY(1); }
#cine-title { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 99997;
    text-align: center; pointer-events: none; font-family: Orbitron, 'Segoe UI', sans-serif; color: #fff; opacity: 0; }
#cine-title .big { font-size: clamp(26px, 5vw, 64px); font-weight: 900; letter-spacing: .14em; }
#cine-title .small { margin-top: 14px; font-size: clamp(12px, 1.6vw, 18px); letter-spacing: .3em; opacity: .85; }
#cine-title.win .big { text-shadow: 0 0 12px #7fe2ff, 0 0 34px #2f9bff; }
#cine-title.lose .big { text-shadow: 0 0 12px #ffb347, 0 0 34px #ff3b00; }
#cine-title.show { animation: cine-title 4.2s cubic-bezier(.2, .9, .2, 1) forwards; }
@keyframes cine-title {
    0%   { opacity: 0; transform: translate(-50%, -50%) scale(1.5); filter: blur(10px); letter-spacing: .5em; }
    15%  { opacity: 1; transform: translate(-50%, -50%) scale(1);   filter: blur(0); }
    85%  { opacity: 1; }
    100% { opacity: 0; transform: translate(-50%, -54%) scale(1.03); }
}
`;

export function createCinematics(ctx) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    const make = (id) => { const el = document.createElement('div'); el.id = id; document.body.appendChild(el); return el; };
    const overlay = make('cine-overlay');
    const flashEl = make('cine-flash');
    const bars = make('cine-bars');
    const title = make('cine-title');

    const wait = (s) => new Promise(r => setTimeout(r, s * 1000));

    return {
        wait,
        /** fondu au noir (1) ou retour à l'image (0) */
        fade(to, seconds = 0.5) {
            overlay.style.transition = `opacity ${seconds}s ease`;
            overlay.style.opacity = String(to);
            return wait(seconds);
        },
        /** flash plein écran (explosion) */
        flash(strength = 1, seconds = 1.2) {
            flashEl.style.transition = 'none';
            flashEl.style.opacity = String(strength);
            requestAnimationFrame(() => requestAnimationFrame(() => {
                flashEl.style.transition = `opacity ${seconds}s ease-out`;
                flashEl.style.opacity = '0';
            }));
        },
        bars(on) { bars.classList.toggle('on', on); },
        /** grand titre animé ; kind = 'win' | 'lose' */
        title(big, small, kind) {
            title.className = kind;
            title.innerHTML = `<div class="big">${big}</div><div class="small">${small}</div>`;
            void title.offsetWidth;
            title.classList.add('show');
        },
        /** place la caméra (le joueur) en "from" et la braque sur "to" */
        lookAt(from, to) {
            const { player, camera } = ctx;
            player.position.copy(from);
            const d = to.clone().sub(from);
            player.rotation.y = Math.atan2(-d.x, -d.z);                   // l'avant de la caméra est -Z
            camera.rotation.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), 0, 0);
            camera.position.set(0, 0, 0);
        }
    };
}

// point au hasard sur un segment (déplacement de caméra)
export function lerpVec(a, b, t) { return new THREE.Vector3().lerpVectors(a, b, t); }
