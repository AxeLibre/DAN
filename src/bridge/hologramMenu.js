import * as THREE from 'three';
import { HOLO_SHAPES } from './hologram.js';

// =========================================================================================
// MENU DE L'HOLOGRAMME : choisir la forme affichée
// =========================================================================================
// Quand l'hologramme s'allume, le premier modèle apparaît d'abord, puis ce panneau
// glisse depuis le bas de l'écran. Chaque vignette est dessinée avec les points de la
// forme elle-même (même lumière bleue que l'hologramme). Visible seulement près de la table.
const OPEN_DELAY = 1.2;                               // secondes après l'allumage
const TABLE = new THREE.Vector3(0, -6, -5);           // table de l'hologramme
const NEAR = 70;                                      // distance à laquelle le menu reste ouvert
const THUMB = 144;                                    // vignettes dessinées en 144 px (affichées en 72)

const CSS = `
#holo-menu {
    position: fixed; left: 50%; bottom: 18px; z-index: 99990;
    width: min(760px, calc(100vw - 32px)); padding: 14px 18px 16px;
    font-family: Orbitron, 'Segoe UI', sans-serif; color: #cfefff;
    background: linear-gradient(180deg, rgba(6, 22, 40, .82), rgba(2, 10, 20, .9));
    border: 1px solid rgba(90, 200, 255, .55); border-radius: 14px;
    box-shadow: 0 0 30px rgba(40, 160, 255, .35), inset 0 0 40px rgba(40, 160, 255, .12);
    backdrop-filter: blur(6px);
    transform: translate(-50%, 130%); opacity: 0; pointer-events: none;
    transition: transform .6s cubic-bezier(.2, .9, .2, 1), opacity .4s ease;
    overflow: hidden;
}
#holo-menu.open { transform: translate(-50%, 0); opacity: 1; pointer-events: auto; }
#holo-menu::before {                                   /* balayage lumineux */
    content: ''; position: absolute; left: -40%; top: 0; width: 40%; height: 100%;
    background: linear-gradient(90deg, transparent, rgba(120, 220, 255, .12), transparent);
    animation: holo-sweep 4.5s linear infinite; pointer-events: none;
}
#holo-menu::after {                                    /* lignes de balayage */
    content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .35;
    background: repeating-linear-gradient(180deg, rgba(120, 220, 255, .08) 0 1px, transparent 1px 3px);
}
@keyframes holo-sweep { to { left: 110%; } }
#holo-menu .head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
#holo-menu .title { font-size: 13px; font-weight: 700; letter-spacing: .35em; color: #8fdcff;
    text-shadow: 0 0 10px rgba(60, 190, 255, .9); }
#holo-menu .hint { font-size: 10px; letter-spacing: .2em; opacity: .6; }
#holo-menu .grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
#holo-menu .card {
    position: relative; cursor: pointer; padding: 4px 2px 6px; border-radius: 8px; text-align: center;
    background: rgba(20, 70, 110, .18); border: 1px solid rgba(90, 200, 255, .2);
    transition: transform .2s ease, background .2s ease, border-color .2s ease, box-shadow .2s ease;
    opacity: 0; transform: translateY(12px);
}
#holo-menu.open .card { animation: holo-card-in .45s cubic-bezier(.2, .9, .2, 1) forwards; }
@keyframes holo-card-in { to { opacity: 1; transform: translateY(0); } }
#holo-menu .card:hover { transform: translateY(-4px); background: rgba(40, 130, 200, .3);
    border-color: rgba(140, 225, 255, .8); box-shadow: 0 0 16px rgba(60, 190, 255, .6); }
#holo-menu .card.active { border-color: #7fe2ff; background: rgba(40, 150, 230, .32);
    box-shadow: 0 0 18px rgba(80, 210, 255, .8), inset 0 0 14px rgba(80, 210, 255, .35);
    animation: holo-card-in .45s forwards, holo-active 1.6s ease-in-out infinite .45s; }
@keyframes holo-active { 50% { box-shadow: 0 0 26px rgba(80, 210, 255, 1), inset 0 0 20px rgba(80, 210, 255, .5); } }
#holo-menu canvas { width: 72px; height: 72px; display: block; margin: 0 auto; }
#holo-menu .label { font-size: 9px; letter-spacing: .12em; text-transform: uppercase; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
@media (max-width: 640px) { #holo-menu .grid { grid-template-columns: repeat(4, 1fr); } }
`;

// Vignette : la forme vue de 3/4, en points bleus lumineux
function drawThumbnail(canvas, pts) {
    const c = canvas.getContext('2d');
    const step = Math.max(1, Math.floor(pts.length / 3 / 5000));
    const ca = Math.cos(0.55), sa = Math.sin(0.55);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const xs = [], ys = [];
    for (let i = 0; i < pts.length; i += 3 * step) {
        const x = pts[i] * ca + pts[i + 2] * sa, y = -pts[i + 1];
        xs.push(x); ys.push(y);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const s = (THUMB * 0.8) / Math.max(maxX - minX, maxY - minY);
    const ox = THUMB / 2 - (minX + maxX) / 2 * s, oy = THUMB / 2 - (minY + maxY) / 2 * s;
    c.clearRect(0, 0, THUMB, THUMB);
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = 'rgba(80, 180, 255, 0.35)';
    for (let i = 0; i < xs.length; i++) c.fillRect(xs[i] * s + ox, ys[i] * s + oy, 1.6, 1.6);
}

export function initHologramMenu(ctx) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'holo-menu';
    root.innerHTML = `<div class="head"><span class="title">HOLOGRAMME</span><span class="hint">CHOISIS UNE FORME</span></div><div class="grid"></div>`;
    document.body.appendChild(root);
    const grid = root.querySelector('.grid');
    const cards = [];

    // cartes créées dès que les formes sont chargées
    function build() {
        const raw = ctx.hologram.rawShapes();
        HOLO_SHAPES.forEach((shape, i) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.animationDelay = `${0.05 * i}s`;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = THUMB;
            drawThumbnail(canvas, raw[i]);
            const label = document.createElement('div');
            label.className = 'label';
            label.textContent = shape.label;
            card.append(canvas, label);
            card.addEventListener('click', () => {
                if (ctx.hologram.currentShape() === i) return;
                ctx.hologram.show(i);
                const { transittionsound } = ctx.audio.sounds;
                transittionsound.stop();
                transittionsound.play();
            });
            grid.appendChild(card);
            cards.push(card);
        });
    }

    let open = false;
    let activeTime = 0;
    let shownShape = -1;
    let last = performance.now();

    function update(playerPosition) {
        const now = performance.now();
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;

        if (!cards.length && ctx.hologram.rawShapes()) build();

        const active = ctx.hologram.isActive();
        activeTime = active ? activeTime + dt : 0;
        const wanted = active && activeTime > OPEN_DELAY && cards.length > 0 &&
                       ctx.state.isInsideShip && playerPosition.distanceTo(TABLE) < NEAR;
        if (wanted !== open) {
            open = wanted;
            root.classList.toggle('open', open);
        }

        const current = ctx.hologram.currentShape();
        if (current !== shownShape && cards.length) {
            if (cards[shownShape]) cards[shownShape].classList.remove('active');
            shownShape = current;
            if (cards[current]) cards[current].classList.add('active');
        }
    }

    return { update, isOpen: () => open };
}
