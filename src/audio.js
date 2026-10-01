import * as THREE from 'three';

// =========================================================================================
// SONS DU JEU
// =========================================================================================
// - sons "classiques" (boutons, portes, alarme, ambiance…) : sounds.xxx
// - sons spatialisés (explosions, lasers, bips du droïde) : sfx.xxx, joués avec playAt()
// Le jeu utilise depuis l'origine plusieurs "oreilles" (AudioListener) : elles sont
// gardées telles quelles, le bouton de volume les règle toutes ensemble.

// Charge un son non spatialisé
function loadSound(loader, listener, url, volume, loop = false) {
    const sound = new THREE.Audio(listener);
    loader.load(url, buffer => {
        sound.setBuffer(buffer);
        if (loop) sound.setLoop(true);
        sound.setVolume(volume);
    });
    return sound;
}

export function initAudio(scene, camera) {
    const audioLoader = new THREE.AudioLoader();

    // oreille des sons de combat, de l'alarme et des collisions : ajoutée à la caméra au clic sur PLAY
    const listener = new THREE.AudioListener();

    // AMBIANCE SOUND
    const listener2 = new THREE.AudioListener();
    camera.add(listener2);

    // Ambiance : 53 minutes de son. Avant, le fichier était entièrement téléchargé puis
    // décodé en mémoire (~1 Go de RAM !). Il est maintenant lu en streaming par le
    // navigateur. Même utilisation qu'avant : play(), stop(), isPlaying, buffer.
    const ambientEl = new Audio('public/ambient.mp3');
    ambientEl.loop = true;      // ambiance en boucle
    ambientEl.volume = 0.5;     // volume doux
    ambientEl.preload = 'none';
    const ambientSound = {
        buffer: true,
        get isPlaying() { return !ambientEl.paused; },
        play() { ambientEl.play().catch(() => {}); },
        stop() { ambientEl.pause(); }
    };
    let ambientStarted = false;

    // AUTRES SONS
    const listener3 = new THREE.AudioListener();
    camera.add(listener3);

    const sounds = {
        ambientSound,
        ambienttie:      loadSound(audioLoader, listener2, 'public/tie_int2.WAV', 0.5, true),   // ambiance du TIE, en boucle
        ctrlscreenon:    loadSound(audioLoader, listener3, 'public/sounds/holo_on.mp3', 1.5),
        ctrlscreenoff:   loadSound(audioLoader, listener3, 'public/sounds/ctrlscreenoff.mp3', 1.5),
        holoOnSound:     loadSound(audioLoader, listener3, 'public/sounds/holo_off.mp3', 0.6),
        holoOffSound2:   loadSound(audioLoader, listener3, 'public/sounds/holooff.mp3', 0.6),
        tieOn:           loadSound(audioLoader, listener3, 'public/tie_on.WAV', 0.9),
        tieOff:          loadSound(audioLoader, listener3, 'public/tie_off.mp3', 0.9),
        open:            loadSound(audioLoader, listener3, 'public/open.mp3', 0.9),
        transittionsound: loadSound(audioLoader, listener3, 'public/transition.mp3', 0.9),
        tiechange:       loadSound(audioLoader, listener3, 'public/tiechange.WAV', 1.0),
        laseron:         loadSound(audioLoader, listener3, 'public/laseron.mp3', 2.0),
        laseroff:        loadSound(audioLoader, listener3, 'public/laseroff.mp3', 2.0),
        boom:            loadSound(audioLoader, listener3, 'public/boom.mp3', 2.0),
        doorSound:       loadSound(audioLoader, listener3, 'public/door.mp3', 0.5),    // son des portes
        button1:         loadSound(audioLoader, listener3, 'public/bipbip1.WAV', 2.0),         // boutons rouges
        button2:         loadSound(audioLoader, listener3, 'public/bipbip6.WAV', 2.0),         // boutons blancs
        button3:         loadSound(audioLoader, listener3, 'public/sounds/button0.mp3', 2.0),  // boutons bleus
        metalCollisionSound: loadSound(audioLoader, listener, 'public/sounds/metal_impact.mp3', 0.8)   // collision métallique
    };

    // 🎧 Son R2
    const listener4 = new THREE.AudioListener();
    camera.add(listener4);
    sounds.R2 = loadSound(audioLoader, listener4, 'public/R2.WAV', 0.8);

    // 🔊 Son d'alarme (boucle infinie)
    sounds.alarmSound = loadSound(audioLoader, listener, 'public/alarm.mp3', 0.2, true);

    function playSoundSafe(sound) {
        if (!sound || !sound.buffer) return;

        if (sound.isPlaying) {
            sound.stop();
        }

        sound.play();
    }

    // Petits "pools" de sons : plusieurs tirs rapides peuvent se chevaucher
    function makeVoices(url, volume, count = 4) {
        const voices = [];
        for (let i = 0; i < count; i++) voices.push(new THREE.Audio(listener));
        voices.next = 0;
        audioLoader.load(url, (buffer) => voices.forEach(v => { v.setBuffer(buffer); v.setVolume(volume); }));
        return voices;
    }
    function playVoice(voices) {
        const v = voices[voices.next];
        voices.next = (voices.next + 1) % voices.length;
        if (!v.buffer) return;
        if (v.isPlaying) v.stop();
        v.play();
    }

    // 🔊 TIE LASER SOUND (canons du joueur en vol)
    sounds.tieLaserVoices = makeVoices('public/tielaser.mp3', 0.8);

    // -------------------------------------------------------------------------------------
    // SON SPATIALISÉ (explosions, lasers, bips du droïde)
    // -------------------------------------------------------------------------------------
    // Chaque son est joué à l'endroit où il se produit : plus fort quand c'est proche,
    // à gauche / à droite selon sa position. Petits groupes de "voix" réutilisées.
    // trim : retire le silence au début du fichier (le son part tout de suite)
    function makePositionalPool(urls, count, volume, refDistance, trim = false) {
        const list = Array.isArray(urls) ? urls : [urls];
        const pool = { voices: [], buffers: [], volume, next: 0, last: 0 };
        list.forEach((url, i) => audioLoader.load(url, b => { pool.buffers[i] = trim ? trimSilence(b) : b; }));
        for (let i = 0; i < count; i++) {
            const holder = new THREE.Object3D();
            const voice = new THREE.PositionalAudio(listener);
            voice.setRefDistance(refDistance);
            voice.setRolloffFactor(1);
            voice.setDistanceModel('inverse');
            holder.add(voice);
            scene.add(holder);
            pool.voices.push({ holder, voice });
        }
        return pool;
    }

    function trimSilence(buffer, threshold = 0.02) {
        const data = buffer.getChannelData(0);
        let start = 0;
        while (start < data.length && Math.abs(data[start]) < threshold) start++;
        if (start < buffer.sampleRate * 0.05 || start >= data.length) return buffer;
        const out = listener.context.createBuffer(buffer.numberOfChannels, buffer.length - start, buffer.sampleRate);
        for (let c = 0; c < buffer.numberOfChannels; c++) out.copyToChannel(buffer.getChannelData(c).subarray(start), c);
        return out;
    }

    /** Joue un son du groupe à une position (minGap : délai mini entre deux sons du groupe). */
    function playAt(pool, position, volumeMul = 1, minGap = 0.05, rate = 1) {
        const now = performance.now() * 0.001;
        const buffers = pool.buffers.filter(Boolean);
        if (!buffers.length || now - pool.last < minGap) return;
        pool.last = now;
        const v = pool.voices[pool.next];
        pool.next = (pool.next + 1) % pool.voices.length;
        if (v.voice.isPlaying) v.voice.stop();
        v.voice.setBuffer(buffers[Math.floor(Math.random() * buffers.length)]);
        v.voice.setVolume(pool.volume * volumeMul);
        v.voice.setPlaybackRate(rate);
        v.holder.position.copy(position);
        v.holder.updateMatrixWorld();
        v.voice.play();
    }

    const sfx = {
        explosion: makePositionalPool('public/explosion.mp3', 8, 1.6, 160),
        boom:      makePositionalPool('public/boom.mp3', 4, 2.2, 400),
        laser:     makePositionalPool('public/laser.mp3', 8, 0.5, 120),       // tirs rouges (canon, X-Wing)
        // charges sismiques du Slave I (deux versions du son, "cordes de guitare frappées")
        seismic:   makePositionalPool(['public/SEISMIC_CHARGE_EXPLOSION.ogg', 'public/star-wars-seismic-charge.mp3'], 3, 2.6, 700, true),
        tieLaser:  makePositionalPool('public/tielaser.mp3', 8, 0.6, 120),    // tirs verts des TIE
        r2:        makePositionalPool(['public/R2.WAV', 'public/R2 1.WAV', 'public/R2 2.WAV', 'public/R2 3.WAV',
                                       'public/R2 4.WAV', 'public/R2 5.WAV', 'public/R2 7.WAV', 'public/R2 8.WAV',
                                       'public/R2 9.WAV'], 2, 1.0, 25)
    };

    const _cameraWorld = new THREE.Vector3();

    // Toutes les explosions GLSL font du bruit, là où elles ont lieu
    function attachExplosionSounds(fx) {
        const _explosionFX = fx.explosion.bind(fx);
        fx.explosion = (pos, radius = 15, tint) => {
            _explosionFX(pos, radius, tint);
            camera.getWorldPosition(_cameraWorld);
            if (pos.distanceTo(_cameraWorld) > 5000) return;
            const vol = THREE.MathUtils.clamp(radius / 20, 0.5, 2.5);
            if (radius >= 60) playAt(sfx.boom, pos, vol / 2, 0.25, 0.9 + Math.random() * 0.2);
            else playAt(sfx.explosion, pos, vol, 0.06, 0.85 + Math.random() * 0.3);
        };
    }

    // Tirs des vaisseaux de la bataille (limités pour ne pas saturer)
    function laserSoundAt(pos, rebel) {
        camera.getWorldPosition(_cameraWorld);
        if (pos.distanceTo(_cameraWorld) > 1200) return;
        playAt(rebel ? sfx.laser : sfx.tieLaser, pos, 1, 0.12, 0.9 + Math.random() * 0.2);
    }

    // -------------------------------------------------------------------------------------
    // AMBIANCES : passerelle ↔ TIE
    // -------------------------------------------------------------------------------------

    // clic sur PLAY : débloque le contexte audio
    function unlock() {
        camera.add(listener);

        if (ambientSound && ambientSound.buffer) {
            ambientSound.play();
            ambientStarted = true;
        }
        sounds.open.play();
    }

    // 🔊 démarre ambiance au premier mouvement
    function startAmbient() {
        if (!ambientStarted && ambientSound && ambientSound.buffer) {
            ambientSound.play();
            ambientStarted = true;
        }
    }

    function switchToShipAudio() {
        const { ambienttie, tieOff } = sounds;

        if (ambienttie && ambienttie.isPlaying) {
            ambienttie.stop();
        }

        if (tieOff && tieOff.buffer) {
            tieOff.play();
        }

        setTimeout(() => {
            if (ambientSound && !ambientSound.isPlaying) {
                ambientSound.play();
            }
        }, 1000);

    }

    function switchToFlightAudio() {
        const { ambienttie, tieOn } = sounds;

        if (ambientSound && ambientSound.isPlaying) {
            ambientSound.stop();
        }

        if (tieOn && tieOn.buffer) {
            tieOn.play();
        }

        // attendre la fin du son tieOn (~1.5s par exemple)
        setTimeout(() => {
            if (ambienttie && !ambienttie.isPlaying) {
                ambienttie.play();
            }
        }, 1500);
    }

    // Réacteur du TIE : le son monte en régime avec la vitesse (0 = croisière, 1 = boost à fond)
    let engineLevel = -1;
    function setEngineThrottle(level) {
        const { ambienttie } = sounds;
        level = Math.round(THREE.MathUtils.clamp(level, 0, 1) * 50) / 50;   // pas de mise à jour inutile
        if (level === engineLevel) return;
        engineLevel = level;
        ambienttie.setPlaybackRate(1 + 0.55 * level);
        if (ambienttie.buffer) ambienttie.setVolume(0.5 + 0.35 * level);
    }

    // volume général (0 → 1) de tous les sons (les vidéos sont réglées à part)
    function setMasterVolume(v) {
        [listener, listener2, listener3, listener4].forEach(l => l.setMasterVolume(v));
        ambientEl.volume = 0.5 * v;
    }

    return {
        listener, sounds, sfx,
        playSoundSafe, playVoice, playAt, laserSoundAt, attachExplosionSounds,
        unlock, startAmbient, switchToShipAudio, switchToFlightAudio, setMasterVolume, setEngineThrottle
    };
}
