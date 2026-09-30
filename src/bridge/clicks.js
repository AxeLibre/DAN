import * as THREE from 'three';

// =====================================================================================================================
// CLICS SUR LE DÉCOR : chaque bouton de la passerelle est reconnu au NOM de son objet
// dans les modèles GLB (ne pas renommer ces objets dans Blender)
// =====================================================================================================================
export function initClicks(ctx) {
    const { camera, renderer, state, worldGroup, raycaster } = ctx;
    const { holoOnSound, holoOffSound2, open, transittionsound, button1, button2, button3, tiechange } = ctx.audio.sounds;

    camera.updateMatrixWorld(true);
    renderer.domElement.addEventListener('click', (event) => {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        raycaster.setFromCamera(mouse, camera);

        const intersects = raycaster.intersectObjects(worldGroup.children, true);
        if(intersects.length > 0){
            const clickedObject = intersects[0].object; // <-- déclaré ici

            // bouton bleu de la console : saut en hyperespace
            if (clickedObject.name.includes("Side_Control_Panels_Button_Blue_0001")) {
                ctx.hyperspace.start();
            }

            // bouton bleu de la table : hologramme ON / OFF
            if (clickedObject.name.includes("Table_3_Button_Blue_0")) {
                const hologramActive = ctx.hologram.toggle();
                ctx.consoleButtons.showHologramState(hologramActive);

                if (hologramActive) holoOnSound.play();
                else holoOffSound2.play();
            }

            if (clickedObject.name.includes("Table_2_Button_Blue_0")) {
                open.play();
            }

            if (clickedObject.name.includes("Object_8")) {
                ctx.decor.droidClicked();
            }

            // bouton blanc de la console : canon laser
            if (clickedObject.name.includes("Side_Control_Panels_Button_White_0001")) {
                ctx.battle.toggleCannon();
            }

            // bouton rouge de la console : alarme
            if (clickedObject.name.includes("Side_Control_Panels_Button_Red_0001")) {
                ctx.alarm.toggle();
            }

            // bouton rouge de la table : forme suivante de l'hologramme
            if (clickedObject.name.includes("Table_3_Button_Red_0")) {
                ctx.hologram.next(); // forme suivante
                transittionsound.stop(); // Arrêter le son s'il est en cours de lecture
                transittionsound.play();
            }

            // console : écran MAP
            if (clickedObject.name.includes("Side_Control_Panels_Control_Panels_0001")) {
                ctx.mapScreen.toggle();
            }

            // bips des autres boutons
            if (clickedObject.name.includes("Side_Control_Panels_Button_White_0")) {
                button2.play();
            }

            if (clickedObject.name.includes("Back_Control_Panels_Button_White_0")) {
                button2.play();
            }

            if (clickedObject.name.includes("Side_Control_Panels_Button_Red_0")) {
                button1.play();
            }

            if (clickedObject.name.includes("Back_Control_Panels_Button_Red_0")) {
                button1.play();
            }

            if (clickedObject.name.includes("Side_Control_Panels_Button_Blue_0")) {
                button3.play();
            }

            if (clickedObject.name.includes("Back_Control_Panels_Button_Blue_0")) {
                button3.play();
            }

            if (clickedObject.name.includes("Front_Control_Panels_Button_Blue_0")) {
                button3.play();
            }
        }

        // CHANGEMENT DE TIE : clic sur la console du hangar ("click here for change your TIE")
        // ou sur le TIE lui-même. Testé à part : avant, ce test n'était fait que si le clic
        // touchait AUSSI le décor de la passerelle, et il ignorait la console.
        if (state.isInsideShip && ctx.ships.count > 1) {
            const targets = [ctx.hangarConsole.screen, ctx.ships.tiePlayer].filter(Boolean);
            if (raycaster.intersectObjects(targets, true).length > 0) {

                tiechange.stop();
                tiechange.play();
                ctx.hangarConsole.press();   // flash + "bouton pressé" sur la console
                ctx.ships.nextShip();
            }
        }
    });
}
