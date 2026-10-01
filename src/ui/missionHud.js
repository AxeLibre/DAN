// =========================================================================================
// HUD DE MISSION — en haut au centre : nom, objectif, temps restant, jauges
// =========================================================================================
// Chaque mission choisit ses jauges : show(titre, objectif, [{ id, label, kind }])
//   kind 'health' : vert → orange → rouge quand elle baisse (coque, croiseur…)
//   kind 'fuel'   : bleu (chargement)
//   kind 'enemy'  : rouge (vie d'un ennemi)
const CSS = `
#mission-hud { position: fixed; left: 50%; top: 14px; transform: translate(-50%, -20px); z-index: 99991;
    width: min(460px, 70vw); pointer-events: none; opacity: 0; transition: opacity .5s ease, transform .5s ease;
    font-family: Orbitron, 'Segoe UI', sans-serif; color: #d9f2ff; text-align: center; }
#mission-hud.on { opacity: 1; transform: translate(-50%, 0); }
#mission-hud .name { font-size: 13px; font-weight: 900; letter-spacing: .4em; color: #8fdcff; text-shadow: 0 0 10px rgba(60, 190, 255, .9); }
#mission-hud .goal { font-size: 10px; letter-spacing: .2em; opacity: .75; margin: 4px 0 8px; transition: opacity .3s ease; }
#mission-hud .main { display: flex; align-items: center; gap: 10px; }
#mission-hud .bars { flex: 1; display: flex; flex-direction: column; gap: 5px; }
#mission-hud .row { display: flex; align-items: center; gap: 10px; transition: opacity .4s ease; }
#mission-hud .row.off { display: none; }
#mission-hud .label { font-size: 10px; letter-spacing: .2em; white-space: nowrap; width: 128px; text-align: right; }
#mission-hud .bar { position: relative; flex: 1; height: 10px; border-radius: 3px; overflow: hidden;
    background: rgba(4, 18, 30, .75); border: 1px solid rgba(110, 210, 255, .5); }
#mission-hud .fill { position: absolute; inset: 0; transform-origin: left; transition: transform .35s ease;
    background: linear-gradient(90deg, #1f9d55, #7dff8a); box-shadow: 0 0 12px #3dff5a; }
#mission-hud .fill.mid { background: linear-gradient(90deg, #b57a00, #ffd23a); box-shadow: 0 0 12px #ffb300; }
#mission-hud .fill.low { background: linear-gradient(90deg, #8a0f00, #ff4a2a); box-shadow: 0 0 12px #ff2a1a; }
#mission-hud .fuel .fill { background: linear-gradient(90deg, #0c5bd6, #6fe9ff); box-shadow: 0 0 12px #3ac8ff; }
#mission-hud .enemy .fill { background: linear-gradient(90deg, #7a1200, #ff6a3a); box-shadow: 0 0 12px #ff3a1a; }
#mission-hud .pct { font-size: 12px; font-weight: 700; width: 44px; text-align: right; }
#mission-hud .time { font-size: 20px; font-weight: 900; letter-spacing: .1em; width: 74px; text-align: left; }
#mission-hud .time.off { display: none; }
#mission-hud .row.hit .bar { animation: hull-hit .45s ease; }
@keyframes hull-hit { 30% { box-shadow: 0 0 22px #ff2a1a; border-color: #ff4030; } }
`;

export function initMissionHud() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    const root = document.createElement('div');
    root.id = 'mission-hud';
    root.innerHTML = `<div class="name"></div><div class="goal"></div>
        <div class="main"><span class="time">0:00</span><div class="bars"></div></div>`;
    document.body.appendChild(root);
    const $ = (s) => root.querySelector(s);
    const name = $('.name'), goal = $('.goal'), time = $('.time'), barsEl = $('.bars');
    let bars = {};
    let lastTime = -1;

    return {
        show(title, objective, list = [{ id: 'hull', label: 'EXECUTOR', kind: 'health' }]) {
            name.textContent = title;
            goal.textContent = objective;
            barsEl.innerHTML = '';
            bars = {};
            for (const b of list) {
                const row = document.createElement('div');
                row.className = `row ${b.kind || 'health'}`;
                row.innerHTML = `<span class="label">${b.label}</span><div class="bar"><div class="fill"></div></div><span class="pct">100 %</span>`;
                barsEl.appendChild(row);
                bars[b.id] = { row, kind: b.kind || 'health', fill: row.querySelector('.fill'), pct: row.querySelector('.pct') };
            }
            root.classList.add('on');
        },
        hide() { root.classList.remove('on'); },
        setObjective(text) { goal.textContent = text; },
        /** seconds = null : pas de compte à rebours */
        setTime(seconds) {
            time.classList.toggle('off', seconds === null);
            if (seconds === null) return;
            const s = Math.max(0, Math.ceil(seconds));
            if (s === lastTime) return;
            lastTime = s;
            time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        },
        setBar(id, value, hit = false) {
            const b = bars[id];
            if (!b) return;
            const v = Math.max(0, Math.min(100, value));
            b.fill.style.transform = `scaleX(${v / 100})`;
            if (b.kind === 'health') {
                b.fill.classList.toggle('mid', v <= 60 && v > 30);
                b.fill.classList.toggle('low', v <= 30);
            }
            b.pct.textContent = `${Math.round(v)} %`;
            if (hit) { b.row.classList.remove('hit'); void b.row.offsetWidth; b.row.classList.add('hit'); }
        },
        showBar(id, visible) { if (bars[id]) bars[id].row.classList.toggle('off', !visible); },
        // (mission astéroïdes)
        setHull(value, hit = false) { this.setBar('hull', value, hit); }
    };
}
