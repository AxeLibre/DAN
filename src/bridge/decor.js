import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { makeGLTFLoader } from '../core/loaders.js';

// =========================================================================================
// DÉCOR DE LA PASSERELLE : coque, console, personnages animés, droïdes, TIE en maintenance
// =========================================================================================

// Intérieur de la passerelle (16 personnages animés, droïdes, portes…) : inutile de
// l'animer et de le dessiner quand on vole loin de la tour, il est invisible de là.
const INTERIOR_CENTER = new THREE.Vector3(0, 0, 30);
const INTERIOR_RANGE = 450;

const DROID_NEAR = 60;          // distance à partir de laquelle le droïde "parle"

// Personnages : un modèle chargé une fois, puis des clones animés (SkeletonUtils.clone : squelette compris)
// position, rotation y (et échelle du premier : les clones la gardent)
const STORMTROOPERS = [
    { pos: [35, -12, 35], rotY: -Math.PI/2 },
    { pos: [-35, -12, 35], rotY: Math.PI/2 },
    { pos: [-25, -12, -30], rotY: Math.PI/8 },
    { pos: [25, -12, -30], rotY: -Math.PI/8 }
];
const K2SO = [
    { pos: [50, -12, 15], rotY: Math.PI/2 },
    { pos: [-50, -12, -15], rotY: -Math.PI/2 }
];
const OFFICERS = [
    { pos: [60, -12, 80] },
    { pos: [-33, -12, 123], rotY: -Math.PI/4 },
    { pos: [-15, -30, 93], rotY: -Math.PI },
    { pos: [-15, -30, 75] },
    { pos: [-25, -30, 70], rotY: -Math.PI/2 },
    { pos: [15, -30, 93], rotY: Math.PI },
    { pos: [15, -30, 75] },
    { pos: [25, -30, 70], rotY: Math.PI/2 },
    { pos: [-25, -30, 85], rotY: -Math.PI/2 },
    { pos: [16, -28, 50], rotY: -Math.PI/2 }
];

export function initDecor(ctx) {
    const { camera, worldGroup, state } = ctx;
    const mixers = []; // tableau global pour stocker les mixers des personnages
    let droidBody = null;

    const loader2 = makeGLTFLoader();

    loader2.load('public/projecteur4.glb', (gltf)=>{
        const projector = gltf.scene;
        projector.name = "bridge_shell";   // la coque de la passerelle + hangar (toujours affichée)
        projector.position.set(0,-12, 98.5);
        projector.scale.set(10,10,10);
        projector.rotation.y = Math.PI; // faire face à la caméra
        worldGroup.add(projector);
    });

    // Place les clones animés d'un personnage
    function placeCharacters(gltf, scale, placements) {
        const first = gltf.scene;
        first.scale.set(scale, scale, scale);
        placements.forEach((p, i) => {
            const character = i === 0 ? first : SkeletonUtils.clone(first); // ✅ clone correct pour squelette
            character.position.set(...p.pos);
            if (p.rotY !== undefined) character.rotation.y = p.rotY;
            worldGroup.add(character);

            const mixer = new THREE.AnimationMixer(character);
            mixer.clipAction(gltf.animations[0]).play();
            mixers.push(mixer);
        });
    }

    const loader5 = makeGLTFLoader();
    loader5.load('public/stormtrooper2.glb', (gltf) => placeCharacters(gltf, 5, STORMTROOPERS));

    const loader6 = makeGLTFLoader();
    loader6.load('public/k2so.glb', (gltf) => {
        placeCharacters(gltf, 8, K2SO);
    });

    const loader7 = makeGLTFLoader();
    loader7.load('public/officer.glb', (gltf) => placeCharacters(gltf, 12, OFFICERS));

    // console du pont (boutons cliquables : voir bridge/clicks)
    const loader8 = makeGLTFLoader();

    loader8.load('public/hyperbouton.glb', (gltf)=>{
        const hyperbouton = gltf.scene;
        hyperbouton.position.set(0,-12, 98.5);
        hyperbouton.scale.set(10,10,10);
        hyperbouton.rotation.y = Math.PI;
        worldGroup.add(hyperbouton);
    });

    // TIE en maintenance dans le hangar de la passerelle
    const loader12 = makeGLTFLoader();

    loader12.load('public/tie_fighter0.glb', (gltf) => {
        const tiefighter0 = gltf.scene;
        tiefighter0.name = "tie_fighter0";
        tiefighter0.position.set(0, -12, 98.5);
        tiefighter0.scale.set(8,8,8);
        tiefighter0.rotation.y = -Math.PI;
        worldGroup.add(tiefighter0);
        ctx.hyperspace.addFadingObject(tiefighter0);   // glisse et s'estompe pendant le saut

        const mixer1 = new THREE.AnimationMixer(tiefighter0);

        if (gltf.animations.length > 0) {
            const action = mixer1.clipAction(gltf.animations[0]);
            action.play();
            mixer1.alwaysUpdate = true;   // visible aussi de dehors
            mixers.push(mixer1);
        }
    });

    // Droïdes
    const loader13 = makeGLTFLoader();

    loader13.load('public/droid1.glb', (gltf) => {
        const droid1 = gltf.scene;
        droid1.position.set(0, -12, 98.5);
        droid1.scale.set(10,10,10);
        droid1.rotation.y = -Math.PI;
        worldGroup.add(droid1);
        // le droïde R5 se déplace (animation de son nœud racine) : on suit un de ses morceaux
        droidBody = droid1.getObjectByName('Object_8');

        if (gltf.animations.length > 0) {
            const mixer1 = new THREE.AnimationMixer(droid1);
            const action = mixer1.clipAction(gltf.animations[0]);
            action.play();
            mixers.push(mixer1);
        }
    });

    loader13.load('public/bb9.glb', (gltf) => {
        const bb9 = gltf.scene;
        bb9.position.set(0, -12, 98.5);
        bb9.scale.set(10,10,10);
        bb9.rotation.y = -Math.PI;
        worldGroup.add(bb9);

        if (gltf.animations.length > 0) {
            const mixer1 = new THREE.AnimationMixer(bb9);
            const action = mixer1.clipAction(gltf.animations[0]);
            action.play();
            mixers.push(mixer1);
        }
    });

    // Intérieur animé et affiché seulement quand on est dedans ou pas trop loin
    let interiorWasOn = true;
    function update(dt, playerPosition) {
        const interiorOn = state.isInsideShip || playerPosition.distanceToSquared(INTERIOR_CENTER) < INTERIOR_RANGE * INTERIOR_RANGE;
        if (interiorOn !== interiorWasOn) {
            interiorWasOn = interiorOn;
            for (const child of worldGroup.children) {
                if (child.name !== 'tie_fighter0' && child.name !== 'bridge_shell') child.visible = interiorOn;
            }
        }
        mixers.forEach(m => { if (interiorOn || m.alwaysUpdate) m.update(dt); });
    }

    // ---------------- Bips du droïde quand il passe près de la caméra ----------------
    let droidBeepCooldown = 0;
    let droidWasNear = false;
    const _droidPos = new THREE.Vector3();
    const _cameraWorld = new THREE.Vector3();

    function updateDroidBeeps(dt) {
        if (!droidBody || !state.isInsideShip) return;
        droidBody.getWorldPosition(_droidPos);
        camera.getWorldPosition(_cameraWorld);
        const near = _droidPos.distanceTo(_cameraWorld) < DROID_NEAR;
        droidBeepCooldown -= dt;
        // un bip en arrivant près de nous, puis de temps en temps tant qu'il reste proche
        if (near && (!droidWasNear || droidBeepCooldown <= 0) && droidBeepCooldown <= 1.5) {
            ctx.audio.playAt(ctx.audio.sfx.r2, _droidPos, 1, 0.5);
            droidBeepCooldown = 4 + Math.random() * 4;
        }
        droidWasNear = near;
    }

    // clic sur le droïde : il répond
    function droidClicked() {
        const { playAt, sfx, playSoundSafe, sounds } = ctx.audio;
        if (droidBody) playAt(sfx.r2, droidBody.getWorldPosition(new THREE.Vector3()), 1, 0.2); else playSoundSafe(sounds.R2);
    }

    return { update, updateDroidBeeps, droidClicked };
}
