import * as THREE from 'three';

// ================================
// BULLES INFO : aide affichée en bas à gauche quand le joueur approche d'une zone
// ================================

// 1️⃣ Fonction pour créer une bulle HTML
function createInfoBubble(text, imageSrc) {

    const container = document.createElement("div");

    container.style.position = "fixed";
    container.style.left = "20px";
    container.style.bottom = "20px";
    container.style.width = "350px";

    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.gap = "15px";

    container.style.padding = "15px";
    container.style.background = "rgba(0,0,0,0.75)";
    container.style.borderRadius = "12px";
    container.style.color = "#FFE81F";
    container.style.fontFamily = "StarJedi, sans-serif";
    container.style.fontSize = "22px";
    container.style.pointerEvents = "none";
    container.style.display = "hidden";

    // bordure dégradée
    container.style.boxShadow = `
    0 0 10px rgba(255,232,31,0.4),
    0 0 20px rgba(255,232,31,0.2),
    inset 0 0 20px rgba(255,232,31,0.15)
    `;

    // image
    const img = document.createElement("img");
    img.src = imageSrc;
    img.style.width = "120px";
    img.style.height = "auto";
    img.style.marginRight = "15px";

    // texte
    const txt = document.createElement("div");
    txt.innerHTML = text.replace(/\n/g, "<br>");
    txt.style.flex = "1";
    txt.style.fontFamily = "StarJedi";

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
        console.log("StarJedi chargée");
    });
}

export function initInfoBubbles(ctx) {
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

    // 4️⃣ Vérifie si le player est dans une zone
    function checkZones(playerPosition) {

        // cacher toutes les bulles
        bubble1.style.visibility = "hidden";
        bubble2.style.visibility = "hidden";
        bubble3.style.visibility = "hidden";
        bubble4.style.visibility = "hidden";

        zones.forEach(zone => {

            const distance = playerPosition.distanceTo(zone.pos);

            if (distance < zone.size) {

                zone.bubble.style.visibility = "visible";

                // position en bas gauche (fixe)
                zone.bubble.style.left = "20px";
                zone.bubble.style.bottom = "20px";
            }

        });
    }

    return { update: checkZones };
}
