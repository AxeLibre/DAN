import * as THREE from 'three';

// =========================================================================================
// REPÈRES À L'ÉCRAN : où est le croiseur à protéger, où est l'ennemi
// =========================================================================================
// Un cercle autour du vaisseau quand il est à l'écran ; une flèche au bord de l'écran
// quand il est hors champ (ou derrière). Seuls transform / opacity bougent (léger).
const CSS = `
.target-marker { position: fixed; left: 0; top: 0; z-index: 99990; pointer-events: none; opacity: 0;
    transition: opacity .3s ease; font-family: Orbitron, 'Segoe UI', sans-serif; will-change: transform; }
.target-marker.on { opacity: 1; }
.target-marker .box { position: absolute; left: -22px; top: -22px; width: 44px; height: 44px;
    border: 2px solid var(--c); border-radius: 50%; box-shadow: 0 0 10px var(--c), inset 0 0 8px var(--c); opacity: .8; }
.target-marker .arrow { position: absolute; left: -11px; top: -11px; width: 0; height: 0; display: none;
    border-left: 11px solid transparent; border-right: 11px solid transparent; border-bottom: 20px solid var(--c);
    filter: drop-shadow(0 0 6px var(--c)); }
.target-marker.out .box { display: none; }
.target-marker.out .arrow { display: block; }
.target-marker .label { position: absolute; left: 0; top: 26px; transform: translateX(-50%); white-space: nowrap;
    font-size: 10px; font-weight: 700; letter-spacing: .2em; color: var(--c); text-shadow: 0 0 6px rgba(0, 0, 0, .9); }
.target-marker .dist { opacity: .7; margin-left: 6px; }
`;
let styled = false;
const _v = new THREE.Vector3();

export function createTargetMarker(label, color) {
    if (!styled) {
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);
        styled = true;
    }
    const el = document.createElement('div');
    el.className = 'target-marker';
    el.style.setProperty('--c', color);
    el.innerHTML = `<div class="box"></div><div class="arrow"></div><div class="label">${label}<span class="dist"></span></div>`;
    document.body.appendChild(el);
    const arrow = el.querySelector('.arrow');
    const dist = el.querySelector('.dist');
    let shown = false, lastDist = -1;

    return {
        /** à appeler à chaque image ; pos = null pour cacher */
        update(pos, camera) {
            const show = !!pos;
            if (show !== shown) { el.classList.toggle('on', show); shown = show; }
            if (!show) return;
            const w = window.innerWidth, h = window.innerHeight;
            camera.getWorldPosition(_v);
            const d = Math.round(_v.distanceTo(pos) / 10) * 10;
            if (d !== lastDist) { dist.textContent = `${d}`; lastDist = d; }
            _v.copy(pos).project(camera);
            const behind = _v.z > 1;
            let x = _v.x, y = _v.y;
            if (behind) { x = -x; y = -y; }
            const inside = !behind && Math.abs(x) < 0.95 && Math.abs(y) < 0.9;
            el.classList.toggle('out', !inside);
            if (!inside) {
                // flèche au bord de l'écran, dans la direction du vaisseau
                if (behind || Math.abs(x) > 0.88 || Math.abs(y) > 0.82) {
                    const s = Math.min(0.88 / Math.abs(x || 1e-3), 0.82 / Math.abs(y || 1e-3));
                    x *= s; y *= s;
                }
                arrow.style.transform = `rotate(${Math.atan2(x, y)}rad)`;
            }
            el.style.transform = `translate(${(x * 0.5 + 0.5) * w}px, ${(-y * 0.5 + 0.5) * h}px)`;
        },
        remove() { el.remove(); }
    };
}
