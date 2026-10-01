// =========================================================================================
// CHOIX DE LA MISSION (en montant dans le TIE) + BOUTON "RETOUR AU HANGAR"
// =========================================================================================
const CSS = `
#mission-select { position: fixed; left: 50%; top: 50%; z-index: 99992; transform: translate(-50%, -40%);
    opacity: 0; pointer-events: none; transition: opacity .45s ease, transform .55s cubic-bezier(.2, .9, .2, 1);
    font-family: Orbitron, 'Segoe UI', sans-serif; color: #d9f2ff; text-align: center; }
#mission-select.open { opacity: 1; transform: translate(-50%, -50%); pointer-events: auto; }
#mission-select .title { font-size: 14px; font-weight: 900; letter-spacing: .45em; color: #8fdcff;
    text-shadow: 0 0 12px rgba(60, 190, 255, .9); margin-bottom: 14px; }
#mission-select .cards { display: flex; gap: 16px; justify-content: center; }
#mission-select .card { position: relative; width: 230px; padding: 16px 16px 14px; cursor: pointer; text-align: left;
    border-radius: 12px; border: 1px solid rgba(110, 210, 255, .45);
    background: linear-gradient(160deg, rgba(8, 30, 52, .92), rgba(2, 10, 20, .94));
    box-shadow: 0 0 22px rgba(40, 160, 255, .25); transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease; }
#mission-select .card:hover { transform: translateY(-6px); border-color: #8fe6ff; box-shadow: 0 0 30px rgba(80, 210, 255, .6); }
#mission-select .key { position: absolute; top: 10px; right: 12px; font-size: 11px; font-weight: 900; opacity: .55;
    border: 1px solid currentColor; border-radius: 4px; padding: 1px 6px; }
#mission-select .icon { font-size: 30px; line-height: 1; margin-bottom: 8px; filter: drop-shadow(0 0 8px rgba(80, 200, 255, .8)); }
#mission-select .name { font-size: 15px; font-weight: 900; letter-spacing: .14em; margin-bottom: 6px; }
#mission-select .desc { font-size: 11px; line-height: 1.45; letter-spacing: .04em; opacity: .8; }
#mission-select .card.battle .name { color: #ffb4a8; }
#mission-select .card.asteroids .name { color: #ffd98a; }
@media (max-width: 560px) { #mission-select .cards { flex-direction: column; } #mission-select .card { width: 78vw; } }

#hangar-button { position: fixed; left: 18px; bottom: 18px; z-index: 99991; padding: 10px 16px; cursor: pointer;
    font-family: Orbitron, 'Segoe UI', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: .2em; color: #d9f2ff;
    background: rgba(4, 18, 30, .8); border: 1px solid rgba(110, 210, 255, .5); border-radius: 8px;
    box-shadow: 0 0 14px rgba(40, 160, 255, .3); opacity: 0; pointer-events: none; transform: translateX(-12px);
    transition: opacity .35s ease, transform .35s ease, border-color .2s ease; }
#hangar-button.on { opacity: .85; pointer-events: auto; transform: none; }
#hangar-button:hover { opacity: 1; border-color: #8fe6ff; }
#hangar-button b { opacity: .6; margin-left: 8px; }
`;

const MISSIONS = [
    { id: 'battle', key: '1', icon: '⚔', name: 'BATAILLE',
      desc: 'La flotte rebelle attaque ! Abats les X-Wing et Y-Wing, détruis les croiseurs.' },
    { id: 'asteroids', key: '2', icon: '☄', name: "CHAMP D'ASTÉROÏDES",
      desc: "L'Executor traverse un champ d'astéroïdes. Détruis-les avant qu'ils ne percutent la coque." }
];

/** onPick(id) : mission choisie ; onHangar() : bouton / touche H */
export function initMissionSelect({ onPick, onHangar }) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'mission-select';
    root.innerHTML = `<div class="title">CHOISIS TA MISSION</div><div class="cards">${MISSIONS.map(m => `
        <div class="card ${m.id}" data-id="${m.id}"><span class="key">${m.key}</span>
        <div class="icon">${m.icon}</div><div class="name">${m.name}</div><div class="desc">${m.desc}</div></div>`).join('')}</div>`;
    document.body.appendChild(root);

    const button = document.createElement('button');
    button.id = 'hangar-button';
    button.innerHTML = 'RETOUR AU HANGAR<b>H</b>';
    button.tabIndex = -1;                        // ne garde pas le clavier (les flèches pilotent)
    document.body.appendChild(button);

    let open = false;
    const pick = (id) => { if (open) onPick(id); };
    root.querySelectorAll('.card').forEach(card => card.addEventListener('click', () => pick(card.dataset.id)));
    button.addEventListener('click', () => onHangar());
    window.addEventListener('keydown', (e) => {
        const m = MISSIONS.find(x => x.key === e.key);
        if (m) pick(m.id);
        if ((e.key === 'h' || e.key === 'H') && button.classList.contains('on')) onHangar();
    });

    return {
        setOpen(v) { open = v; root.classList.toggle('open', v); },
        setHangarButton(v) { button.classList.toggle('on', v); }
    };
}
