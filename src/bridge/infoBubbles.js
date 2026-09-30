import * as THREE from 'three';

// ================================
// BULLES INFO : aide affichée en bas à gauche quand le joueur approche d'une zone
// ================================

// Style des bulles : panneau sombre, liseré doré, reflet ; apparition en glissant.
// (Pas de flou d'arrière-plan ni de bordure qui tourne : posés sur le canvas 3D, ils
// obligeaient le navigateur à tout redessiner à chaque image.)
const CSS = `
.info-bubble {
    position: fixed; left: 20px; bottom: 20px; width: 350px; z-index: 9000;
    display: flex; align-items: center; gap: 15px; padding: 14px 16px;
    color: #FFE81F; font-family: StarJedi, sans-serif; font-size: 22px; pointer-events: none;
    border-radius: 14px; overflow: hidden; isolation: isolate;
    background: linear-gradient(135deg, rgba(20, 16, 4, .9), rgba(4, 4, 8, .92));
    box-shadow: 0 10px 30px rgba(0, 0, 0, .55), 0 0 18px rgba(255, 232, 31, .25), inset 0 0 22px rgba(255, 232, 31, .1);
    opacity: 0; transform: translateX(-24px) scale(.97); filter: blur(4px);
    transition: opacity .45s ease, transform .55s cubic-bezier(.2, .9, .2, 1), filter .45s ease;
}
.info-bubble.show { opacity: 1; transform: none; filter: none; }
.info-bubble::before {                     /* liseré doré */
    content: ''; position: absolute; inset: 0; border-radius: 14px; padding: 1.5px; z-index: -1;
    background: linear-gradient(135deg, #ffe81f, rgba(255, 232, 31, .15) 35%, rgba(255, 232, 31, .15) 65%, rgba(255, 180, 0, .8));
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude;
}
.info-bubble::after {                      /* reflet qui passe à l'apparition (déplacement seul : pas de redessin) */
    content: ''; position: absolute; top: 0; bottom: 0; width: 45%; left: 0; z-index: 1;
    background: linear-gradient(100deg, transparent, rgba(255, 245, 190, .18), transparent);
    transform: translateX(-130%);
}
.info-bubble.show::after { animation: bubble-shine 1.1s .15s ease-out; }
@keyframes bubble-shine { from { transform: translateX(-130%); } to { transform: translateX(260%); } }
.info-bubble img { width: 120px; height: auto; border-radius: 8px; box-shadow: 0 0 12px rgba(255, 232, 31, .3); }
.info-bubble .txt { flex: 1; line-height: 1.25; text-shadow: 0 0 10px rgba(255, 232, 31, .45); }
`;

// 1️⃣ Fonction pour créer une bulle HTML
function createInfoBubble(text, imageSrc) {

    const container = document.createElement("div");
    container.className = "info-bubble";

    // image
    const img = document.createElement("img");
    img.src = imageSrc;

    // texte
    const txt = document.createElement("div");
    txt.className = "txt";
    txt.innerHTML = text.replace(/\n/g, "<br>");

    container.appendChild(img);
    container.appendChild(txt);

    document.body.appendChild(container);

    return container;
}

// Police Star Wars des bulles
export function loadStarJediFont() {
    const starJediFont = new FontFace(
        "StarJedi",
        "url(fonts/Starjedi.ttf)" // relatif : marche sur GitHub Pages (/DAN/) ET avec Vite
    );

    starJediFont.load().then(function(font){
        document.fonts.add(font);
    });
}

export function initInfoBubbles(ctx) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // 2️⃣ Crée les bulles
    const bubble1 = createInfoBubble(
`#<span style="background:rgba(255,232,31,0.3); padding:2px 4px;">HoLoGRAM</span>#
🟦 oN / oFF
🟥 NExT`,
"public/holoinfo.JPG"
    );
    const bubble2 = createInfoBubble(
`#<span style="background:rgba(255,232,31,0.3); padding:2px 4px;"> @</span>#
Click on 
SCREEN for 
PLAY FiLM`,
"public/screen1_off.webp"
    );
    const bubble3 = createInfoBubble(
`#<span style="background:rgba(255,232,31,0.3); padding:2px 4px;"> @</span>#
Click on 
SCREEN for 
PLAY FiLM`,
"public/screen3_off.jpeg"
    );
    const bubble4 = createInfoBubble(
`⬛ Map
⬜ Laser
🟥 ALARM
🟦 Hyperspace`,
"public/controlinfo.JPG"
    );

    // 3️⃣ Définit les zones 3D autour du joueur
    const zones = [
        { pos: new THREE.Vector3(0, -6, -5), size: 25, bubble: bubble1 },
        { pos: new THREE.Vector3(-50, -6, 0), size: 20, bubble: bubble2 },
        { pos: new THREE.Vector3(50, -6, 0), size: 20, bubble: bubble2 },
        { pos: new THREE.Vector3(-50, -6, 60), size: 20, bubble: bubble3 },
        { pos: new THREE.Vector3(50, -6, 60), size: 20, bubble: bubble3 },
        { pos: new THREE.Vector3(0, -6, 145), size: 30, bubble: bubble4 }
    ];

    const DEBUG_ZONES = false; // true = affiche les zones en rouge
    if (DEBUG_ZONES) {
        zones.forEach(zone => {
            const geo = new THREE.BoxGeometry(zone.size*2, zone.size*2, zone.size*2);
            const mat = new THREE.MeshBasicMaterial({color:0xff0000, wireframe:true});
            const cube = new THREE.Mesh(geo, mat);
            cube.position.copy(zone.pos);
            ctx.scene.add(cube);
        });
    }

    // 4️⃣ Vérifie si le player est dans une zone : une bulle apparaît / disparaît en douceur
    const bubbles = [bubble1, bubble2, bubble3, bubble4];
    function checkZones(playerPosition) {
        const visible = new Set();
        zones.forEach(zone => {
            if (playerPosition.distanceTo(zone.pos) < zone.size) visible.add(zone.bubble);
        });
        bubbles.forEach(b => {
            const show = visible.has(b);
            if (b.classList.contains('show') !== show) b.classList.toggle('show', show);
        });
    }

    return { update: checkZones };
}
