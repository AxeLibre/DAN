import { makeGLTFLoader } from '../core/loaders.js';

// =========================================================================================
// BOUTONS LUMINEUX DES CONSOLES
// =========================================================================================
// - table de l'hologramme : boutons rouges (chenillard quand l'hologramme est allumé)
//   et boutons bleus (chenillard quand il est éteint, allumés fixes sinon)
// - consoles du fond : boutons blancs qui clignotent au hasard
export function initConsoleButtons(ctx) {
    const { scene } = ctx;

    const loader13 = makeGLTFLoader();

    let Table_3_Button_Panel_0;
    let Table_3_Button_Red_0;
    let Table_3_Button_Blue_0;

    loader13.load('public/Table_3_Button_Panel_0.glb', (gltf) => {
        Table_3_Button_Panel_0 = gltf.scene;
        Table_3_Button_Panel_0.position.set(0, -12, 98.5);
        Table_3_Button_Panel_0.scale.set(10,10,10);
        Table_3_Button_Panel_0.rotation.y = -Math.PI;
        scene.add(Table_3_Button_Panel_0);

    });



    // Appelle initButtonColors après le chargement
    loader13.load('public/Table_3_Button_Red_0.glb', (gltf) => {
        Table_3_Button_Red_0 = gltf.scene;
        Table_3_Button_Red_0.position.set(0, -12, 98.5);
        Table_3_Button_Red_0.scale.set(10,10,10);
        Table_3_Button_Red_0.rotation.y = -Math.PI;
        scene.add(Table_3_Button_Red_0);

        // Initialise les couleurs et récupère les meshes
        initButtonColors();
    });



    // Variables pour l'animation du chenillard
    let chaseTime = 0;
    let chaseActive = false;

    // Fonction pour initialiser les couleurs des boutons
    function initButtonColors() {
        if (!Table_3_Button_Red_0) return;

        // Récupère tous les meshes du bouton
        const buttonMeshes = [];
        Table_3_Button_Red_0.traverse(child => {
            if (child.isMesh) {
                buttonMeshes.push(child);
            }
        });

        // Stocke les meshes dans userData pour y accéder facilement
        Table_3_Button_Red_0.userData.buttonMeshes = buttonMeshes;

        // Initialise tous les boutons éteints
        resetAllButtons();
    }

    // Éteindre tous les boutons
    function resetAllButtons() {
        if (!Table_3_Button_Red_0 || !Table_3_Button_Red_0.userData.buttonMeshes) return;

        Table_3_Button_Red_0.userData.buttonMeshes.forEach(mesh => {
            if (mesh.material) {
                mesh.material.emissive.setHex(0x220000); // Rouge très sombre
                mesh.material.emissiveIntensity = 0.2;
            }
        });
    }

    // Animation du chenillard

    function updateChaseSmooth(dt) {
        if (!chaseActive || !Table_3_Button_Red_0 || !Table_3_Button_Red_0.userData.buttonMeshes) return;

        const meshes = Table_3_Button_Red_0.userData.buttonMeshes;
        const buttonCount = meshes.length;

        chaseTime += dt * 2; // Vitesse du cycle

        // Calcule une valeur entre 0 et 2*PI qui avance
        const phase = chaseTime * Math.PI * 2;

        for (let i = 0; i < buttonCount; i++) {
            // Décale la phase pour chaque bouton
            const offset = (i / buttonCount) * Math.PI * 2;
            // Intensité sinusoidale (entre 0.2 et 3.0)
            const intensity = 1.5 + Math.sin(phase - offset) * 1.5;

            meshes[i].material.emissive.setHSL(0.03, 1, 0.3);
            meshes[i].material.emissiveIntensity = intensity;
        }
    }

    // Variables pour le bouton bleu
    let blueChaseActive = true;
    let blueChaseTime = 0;

    // Charge le bouton bleu
    loader13.load('public/Table_3_Button_Blue_0.glb', (gltf) => {
        Table_3_Button_Blue_0 = gltf.scene;
        Table_3_Button_Blue_0.position.set(0, -12, 98.5);
        Table_3_Button_Blue_0.scale.set(10,10,10);
        Table_3_Button_Blue_0.rotation.y = -Math.PI;
        scene.add(Table_3_Button_Blue_0);

        // Récupère tous les meshes du bouton bleu
        const blueMeshes = [];
        Table_3_Button_Blue_0.traverse(child => {
            if (child.isMesh) {
                blueMeshes.push(child);
            }
        });
        Table_3_Button_Blue_0.userData.buttonMeshes = blueMeshes;

        // Initialise l'état éteint
        setBlueButtonState(false);
    });

    // Fonction pour allumer/éteindre le bouton bleu
    function setBlueButtonState(active) {
        if (!Table_3_Button_Blue_0 || !Table_3_Button_Blue_0.userData.buttonMeshes) return;

        const meshes = Table_3_Button_Blue_0.userData.buttonMeshes;

        meshes.forEach(mesh => {
            if (active) {
                // HOLOGRAMME ACTIF : bouton allumé fixe
                mesh.material.emissive.setHSL(0.6, 1, 0.5); // Bleu vif
                mesh.material.emissiveIntensity = 2.0;
                mesh.material.color.setHSL(0.6, 1, 0.3);
            } else {
                // HOLOGRAMME ÉTEINT : bouton éteint (prêt pour le chase)
                mesh.material.emissive.setHSL(0.6, 1, 0.05); // Bleu très sombre
                mesh.material.emissiveIntensity = 0.2;
                mesh.material.color.setHSL(0.6, 1, 0.1);
            }
        });
    }

    // Animation chaseSmooth pour le bouton bleu (quand hologramme éteint)
    function updateBlueChaseSmooth(dt) {
        if (!blueChaseActive || !Table_3_Button_Blue_0 || !Table_3_Button_Blue_0.userData.buttonMeshes) return;

        const meshes = Table_3_Button_Blue_0.userData.buttonMeshes;
        const buttonCount = meshes.length; // 6 boutons

        blueChaseTime += dt * 2.5; // Vitesse du cycle (un peu plus rapide pour le bleu)

        // Calcule une valeur entre 0 et 2*PI qui avance
        const phase = blueChaseTime * Math.PI * 2;

        for (let i = 0; i < buttonCount; i++) {
            // Décale la phase pour chaque bouton
            const offset = (i / buttonCount) * Math.PI * 2;
            // Intensité sinusoidale (entre 0.2 et 2.5)
            const intensity = 1.3 + Math.sin(phase - offset) * 1.1;

            meshes[i].material.emissive.setHSL(0.6, 1, 0.3); // Bleu
            meshes[i].material.emissiveIntensity = intensity;
            // Légère variation de couleur aussi
            meshes[i].material.color.setHSL(0.6, 1, 0.1 + intensity * 0.1);
        }
    }

    // Hologramme allumé / éteint : les boutons de la table suivent
    function showHologramState(hologramActive) {
        // Active/désactive le chase du bouton rouge
        chaseActive = hologramActive;

        // Gère le bouton bleu
        blueChaseActive = !hologramActive; // Chase actif quand hologramme ÉTEINT

        if (hologramActive) {
            // Bouton bleu : allumé fixe
            setBlueButtonState(true);

            // Bouton rouge : chase actif (déjà géré par chaseActive)

        } else {
            // Bouton bleu : retour au chase
            setBlueButtonState(false);
            blueChaseTime = 0; // Reset du temps pour redémarrer le cycle

            // Bouton rouge : éteint
            resetAllButtons();
        }
    }

    // ===========================================================
    // BOUTONS BLANCS - Version avec gris foncé (pas noir complet)
    // ===========================================================

    let Back_Control_Panels_Button_White_0;
    const whiteButtons = [];
    const buttonStates = [];

    // Charge le modèle
    loader13.load('public/Back_Control_Panels_Button_White_0.glb', (gltf) => {
        Back_Control_Panels_Button_White_0 = gltf.scene;
        Back_Control_Panels_Button_White_0.position.set(0, -12, 98.5);
        Back_Control_Panels_Button_White_0.scale.set(10,10,10);
        Back_Control_Panels_Button_White_0.rotation.y = -Math.PI;
        scene.add(Back_Control_Panels_Button_White_0);

        // Récupère TOUS les boutons
        Back_Control_Panels_Button_White_0.traverse(child => {
            if (child.isMesh) {
                // Clone le matériau pour indépendance
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map(m => m.clone());
                    } else {
                        child.material = child.material.clone();
                    }
                }

                whiteButtons.push(child);

                // États avec valeurs ajustées
                buttonStates.push({
                    intensity: 0.2 + Math.random() * 0.2,     // Gris foncé au départ (0.2-0.4)
                    targetIntensity: 0.2 + Math.random() * 0.2,
                    blinkSpeed: 2 + Math.random() * 4,
                    nextChange: Math.random() * 2,
                    phase: Math.random() * Math.PI * 2,
                });

                // Initialise en gris foncé
                if (child.material.emissive) {
                    child.material.emissive.setHSL(0, 0, 0.15); // Gris foncé
                    child.material.emissiveIntensity = 0.3;
                }
                if (child.material.color) {
                    child.material.color.setHSL(0, 0, 0.2); // Gris moyen-foncé
                }
            }
        });

    });

    // Version avec plus de nuances (pour un effet encore plus réaliste)
    function updateWhiteButtonsNuanced(dt) {
        if (!whiteButtons.length) return;

        whiteButtons.forEach((button, index) => {
            const state = buttonStates[index];
            if (!state || !button.material) return;

            state.nextChange -= dt;

            if (state.nextChange <= 0) {
                // Plus de variété dans les intensités
                const rand = Math.random();
                if (rand < 0.4) {
                    state.targetIntensity = 0.3 + Math.random() * 0.3; // Gris foncé
                } else if (rand < 0.7) {
                    state.targetIntensity = 1.5 + Math.random() * 1.5; // Mi-lumineux
                } else {
                    state.targetIntensity = 4.0 + Math.random() * 2.0; // Très lumineux
                }

                state.nextChange = 0.5 + Math.random() * 3;
                state.blinkSpeed = 2 + Math.random() * 4;
            }

            // Transition en douceur
            state.intensity += (state.targetIntensity - state.intensity) * state.blinkSpeed * dt;

            // Petite fluctuation naturelle
            const breath = Math.sin(performance.now() * 0.01 + index * 10) * 0.1;
            const finalIntensity = Math.max(0.2, state.intensity + breath);

            // Applique
            if (button.material.emissive) {
                button.material.emissiveIntensity = finalIntensity;

                // Variation de couleur subtile selon l'intensité
                const hue = 0.55 + (finalIntensity * 0.01);
                const lightness = 0.15 + (finalIntensity * 0.05);
                button.material.emissive.setHSL(hue, 0.3, Math.min(0.5, lightness));
            }
        });
    }

    function update(dt) {
        updateChaseSmooth(dt);

        updateBlueChaseSmooth(dt);

        updateWhiteButtonsNuanced(dt);
    }

    return { update, showHologramState };
}
