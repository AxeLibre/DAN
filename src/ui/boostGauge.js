// =========================================================================================
// JAUGE DE BOOST — en bas de l'écran, seulement en vol
// =========================================================================================
// Énergie du boost (Maj) + vitesse du TIE. Cyan au repos, orange pendant le boost,
// rouge clignotant quand la réserve est vide.
export function initBoostGauge() {
    const style = document.createElement('style');
    style.textContent = `
        #boost-gauge {
            position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%) translateY(20px);
            width: min(420px, 70vw); pointer-events: none; z-index: 99998; opacity: 0;
            transition: opacity .4s ease, transform .4s ease;
            font-family: Orbitron, 'Segoe UI', sans-serif; color: #bfe9ff;
        }
        #boost-gauge.on { opacity: 1; transform: translateX(-50%) translateY(0); }
        #boost-gauge .row { display: flex; justify-content: space-between; align-items: baseline;
            font-size: 12px; letter-spacing: .25em; margin: 0 4px 6px; text-shadow: 0 0 8px rgba(80, 200, 255, .8); }
        #boost-gauge .speed { font-size: 18px; font-weight: 700; letter-spacing: .08em; }
        #boost-gauge .speed small { font-size: 10px; letter-spacing: .2em; opacity: .7; margin-left: 4px; }
        #boost-gauge .track {
            position: relative; height: 14px; border-radius: 3px; overflow: hidden;
            background: rgba(4, 18, 30, .7); border: 1px solid rgba(110, 210, 255, .55);
            box-shadow: 0 0 14px rgba(40, 170, 255, .35), inset 0 0 10px rgba(0, 0, 0, .8);
            clip-path: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
        }
        #boost-gauge .fill {
            position: absolute; inset: 0; transform-origin: left center;
            background: linear-gradient(90deg, #1a8cff, #40d4ff 70%, #c8f6ff);
            box-shadow: 0 0 16px #3cc8ff;
        }
        #boost-gauge .ticks { position: absolute; inset: 0;
            background: repeating-linear-gradient(90deg, transparent 0 calc(10% - 2px), rgba(0, 10, 20, .75) calc(10% - 2px) 10%); }
        #boost-gauge.boosting .fill { background: linear-gradient(90deg, #ff7a00, #ffb640 70%, #fff1c2); box-shadow: 0 0 22px #ff9a1f; }
        #boost-gauge.boosting .label { color: #ffc46b; text-shadow: 0 0 10px #ff8a00; }
        #boost-gauge.empty .track { animation: boost-empty .5s steps(2) infinite; border-color: #ff4030; }
        #boost-gauge.empty .label { color: #ff6a5a; }
        @keyframes boost-empty { 50% { box-shadow: 0 0 20px #ff2a1a, inset 0 0 10px rgba(255, 0, 0, .5); } }
    `;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'boost-gauge';
    root.innerHTML = `
        <div class="row"><span class="label">BOOST</span><span class="speed">0<small>U/S</small></span></div>
        <div class="track"><div class="fill"></div><div class="ticks"></div></div>`;
    document.body.appendChild(root);
    const fill = root.querySelector('.fill');
    const speed = root.querySelector('.speed');

    let lastSpeed = -1;
    return {
        /** visible : en vol ; energy : 0 → 1 ; boosting / empty : état du boost ; flightSpeed : unités/s */
        update(visible, energy, boosting, empty, flightSpeed) {
            root.classList.toggle('on', visible);
            if (!visible) return;
            fill.style.transform = `scaleX(${energy.toFixed(3)})`;
            root.classList.toggle('boosting', boosting);
            root.classList.toggle('empty', empty);
            const s = Math.round(flightSpeed);
            if (s !== lastSpeed) {
                lastSpeed = s;
                speed.firstChild.nodeValue = String(s);
            }
        }
    };
}
