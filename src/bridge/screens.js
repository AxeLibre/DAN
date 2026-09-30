import * as THREE from 'three';

// =========================================================================================
// ÉCRANS VIDÉO de la passerelle (extraits de films) : un clic lance / arrête la vidéo
// =========================================================================================
const SCREENS = [
    { off: 'public/screen1_off.webp', video: 'public/screen1.mp4', position: [-59, 6, -0.5],    rotationY: Math.PI/2 },
    { off: 'public/screen2_off.jpg',  video: 'public/screen2.mp4', position: [59, 6, -0.5],     rotationY: -Math.PI/2 },
    { off: 'public/screen3_off.jpeg', video: 'public/screen3.mp4', position: [58.35, 2.4, 40],  scale: [0.8, 1, 0.8] },
    { off: 'public/screen4_off.jpg',  video: 'public/screen4.mp4', position: [-58.35, 2.4, 40], scale: [0.8, 1, 0.8] }
];

// Écrans vidéo (extraits de films) : un écran ÉMET sa lumière. Avant, la vidéo était
// "peinte" sur un matériau éclairé, assombri par l'éclairage et l'exposition (0.3).
// Matériau non éclairé et sans tone mapping = vraies couleurs de la vidéo.
// (pas de bloom : ces écrans ne sont pas sur le calque BLOOM_LAYER)
const SCREEN_BRIGHTNESS = 1.0;   // 1 = luminosité d'origine de la vidéo, 1.2 = plus lumineux
function makeScreenVideoMaterial(texture) {
    return new THREE.MeshBasicMaterial({
        map: texture,
        color: new THREE.Color(SCREEN_BRIGHTNESS, SCREEN_BRIGHTNESS, SCREEN_BRIGHTNESS),
        toneMapped: false,
        side: THREE.DoubleSide
    });
}

function toggleScreen(screenObj) {

    if (!screenObj.isOn) {

        // 🔥 remplacer texture par vidéo
        screenObj.mesh.material = screenObj.videoMaterial;

        screenObj.video.play().catch(err => console.log(err));
        screenObj.isOn = true;

    } else {

        screenObj.video.pause();

        // remettre image fixe
        screenObj.mesh.material = screenObj.offMaterial;

        screenObj.isOn = false;
    }
}

export function initScreens(ctx) {
    const { scene, camera, raycaster } = ctx;
    const screenGeometry = new THREE.PlaneGeometry(16, 9); // format 16:9

    // Texture VIDEO ON / OFF : image fixe quand l'écran est éteint
    const textureLoader = new THREE.TextureLoader();
    const offMaterials = SCREENS.map(s => new THREE.MeshStandardMaterial({
        map: textureLoader.load(s.off),
        roughness: 0.2,   // plus petit = plus brillant
        metalness: 0.4    // intensité reflet
    }));

    const screens = SCREENS.map((s, i) => {
        // 1️⃣ élément vidéo HTML
        const video = document.createElement("video");
        video.src = s.video;
        video.preload = "none";   // téléchargée seulement au 1er clic sur l'écran
        video.loop = false;
        video.muted = false; // important pour autoplay navigateur
        video.playsInline = true;
        video.pause(); // démarre en pause

        // 2️⃣ texture Three.js
        const videoTexture = new THREE.VideoTexture(video);
        videoTexture.colorSpace = THREE.SRGBColorSpace;

        const mesh = new THREE.Mesh(screenGeometry, offMaterials[i]);
        mesh.position.set(...s.position);
        if (s.rotationY) mesh.rotation.y = s.rotationY;
        if (s.scale) mesh.scale.set(...s.scale);
        scene.add(mesh);

        return {
            mesh,
            video,
            videoMaterial: makeScreenVideoMaterial(videoTexture),
            offMaterial: offMaterials[i],
            isOn: false
        };
    });

    const clickableObjects = screens.map(s => s.mesh);

    // Écrans vidéo cliquables (enregistré UNE seule fois)
    function onMouseClick(event) {
        const m = new THREE.Vector2(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1
        );
        raycaster.setFromCamera(m, camera);

        const intersects = raycaster.intersectObjects(clickableObjects, true);
        if (intersects.length > 0) {
            const clickedObject = intersects[0].object;
            screens.forEach(screenObj => {
                if (clickedObject === screenObj.mesh) {
                    toggleScreen(screenObj);
                }
            });
        }
    }
    window.addEventListener("click", onMouseClick);

    return { videos: screens.map(s => s.video) };
}
