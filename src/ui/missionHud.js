// =========================================================================================
// HUD DE MISSION — en haut au centre : nom, objectif, temps restant, solidité de l'Executor
// =========================================================================================
const CSS = `
#mission-hud { position: fixed; left: 50%; top: 14px; transform: translate(-50%, -20px); z-index: 99991;
    width: min(460px, 70vw); pointer-events: none; opacity: 0; transition: opacity .5s ease, transform .5s ease;
    font-family: Orbitron, 'Segoe UI', sans-serif; color: #d9f2ff; text-align: center; }
#mission-hud.on { opacity: 1; transform: translate(-50%, 0); }
#mission-hud .name { font-size: 13px; font-weight: 900; letter-spacing: .4em; color: #8fdcff; text-shadow: 0 0 10px rgba(60, 190, 255, .9); }
#mission-hud .goal { font-size: 10px; letter-spacing: .2em; opacity: .75; margin: 4px 0 8px; }
#mission-hud .row { display: flex; align-items: center; gap: 10px; }
#mission-hud .label { font-size: 10px; letter-spacing: .2em; white-space: nowrap; }
#mission-hud .bar { position: relative; flex: 1; height: 10px; border-radius: 3px; overflow: hidden;
    background: rgba(4, 18, 30, .75); border: 1px solid rgba(110, 210, 255, .5); }
#mission-hud .fill { position: absolute; inset: 0; transform-origin: left; transition: transform .35s ease;
    background: linear-gradient(90deg, #1f9d55, #7dff8a); box-shadow: 0 0 12px #3dff5a; }
#mission-hud .fill.mid { background: linear-gradient(90deg, #b57a00, #ffd23a); box-shadow: 0 0 12px #ffb300; }
#mission-hud .fill.low { background: linear-gradient(90deg, #8a0f00, #ff4a2a); box-shadow: 0 0 12px #ff2a1a; }
#mission-hud .pct { font-size: 12px; font-weight: 700; width: 44px; text-align: right; }
#mission-hud .time { font-size: 20px; font-weight: 900; letter-spacing: .1em; width: 74px; text-align: left; }
#mission-hud.hit .bar { animation: hull-hit .45s ease; }
@keyframes hull-hit { 30% { box-shadow: 0 0 22px #ff2a1a; border-color: #ff4030; } }
`;

export function initMissionHud() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    const root = document.createElement('div');
    root.id = 'mission-hud';
    root.innerHTML = `<div class="name"></div><div class="goal"></div>
        <div class="row"><span class="time">0:00</span><span class="label">EXECUTOR</span>
        <div class="bar"><div class="fill"></div></div><span class="pct">100 %</span></div>`;
    document.body.appendChild(root);
    const $ = (s) => root.querySelector(s);
    const name = $('.name'), goal = $('.goal'), time = $('.time'), fill = $('.fill'), pct = $('.pct');
    let lastTime = -1;

    return {
        show(title, objective) {
            name.textContent = title;
            goal.textContent = objective;
            root.classList.add('on');
        },
        hide() { root.classList.remove('on'); },
        setTime(seconds) {
            const s = Math.max(0, Math.ceil(seconds));
            if (s === lastTime) return;
            lastTime = s;
            time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        },
        setHull(value, hit = false) {
            const v = Math.max(0, Math.min(100, value));
            fill.style.transform = `scaleX(${v / 100})`;
            fill.classList.toggle('mid', v <= 60 && v > 30);
            fill.classList.toggle('low', v <= 30);
            pct.textContent = `${Math.round(v)} %`;
            if (hit) { root.classList.remove('hit'); void root.offsetWidth; root.classList.add('hit'); }
        }
    };
}
