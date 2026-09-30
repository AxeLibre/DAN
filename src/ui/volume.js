import * as THREE from 'three';

// =========================================================================================
// VOLUME — petit bouton discret en haut à gauche
// =========================================================================================
// Clic sur le haut-parleur : couper / remettre le son. Survol : curseur de volume.
// Règle TOUT : effets, sons spatialisés, ambiance et vidéos. Mémorisé d'une visite à l'autre.
export function initVolumeControl(audio, mediaElements) {
    let masterVolume = 1;
    function setMasterVolume(v) {
        masterVolume = THREE.MathUtils.clamp(v, 0, 1);
        audio.setMasterVolume(masterVolume);
        mediaElements.forEach(el => { el.volume = masterVolume; });
        try { localStorage.setItem('dan-volume', String(masterVolume)); } catch (e) { /* stockage indisponible */ }
        volumeIcon.textContent = masterVolume === 0 ? '🔇' : masterVolume < 0.5 ? '🔉' : '🔊';
        volumeSlider.value = String(Math.round(masterVolume * 100));
    }

    const volumeBox = document.createElement('div');
    volumeBox.style.cssText = 'position:fixed;top:12px;left:12px;z-index:99999;display:flex;align-items:center;gap:8px;' +
        'padding:4px 8px;border-radius:18px;background:rgba(0,0,0,.35);opacity:.35;transition:opacity .25s;user-select:none;';
    const volumeIcon = document.createElement('div');
    volumeIcon.style.cssText = 'font-size:18px;cursor:pointer;line-height:1;';
    volumeIcon.title = 'Son';
    const volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.min = '0'; volumeSlider.max = '100';
    volumeSlider.tabIndex = -1;
    volumeSlider.style.cssText = 'width:0;opacity:0;transition:width .25s,opacity .25s;accent-color:#FFE81F;cursor:pointer;';
    volumeBox.append(volumeIcon, volumeSlider);
    document.body.appendChild(volumeBox);

    volumeBox.addEventListener('mouseenter', () => { volumeBox.style.opacity = '1'; volumeSlider.style.width = '90px'; volumeSlider.style.opacity = '1'; });
    volumeBox.addEventListener('mouseleave', () => { volumeBox.style.opacity = '.35'; volumeSlider.style.width = '0'; volumeSlider.style.opacity = '0'; });
    let volumeBeforeMute = 1;
    volumeIcon.addEventListener('click', () => {
        if (masterVolume > 0) { volumeBeforeMute = masterVolume; setMasterVolume(0); }
        else setMasterVolume(volumeBeforeMute || 1);
    });
    volumeSlider.addEventListener('input', () => setMasterVolume(Number(volumeSlider.value) / 100));
    // ne jamais garder le clavier : les flèches servent à piloter
    volumeSlider.addEventListener('change', () => volumeSlider.blur());
    volumeSlider.addEventListener('keydown', e => e.preventDefault());

    {
        let saved = 1;
        try { const s = localStorage.getItem('dan-volume'); if (s !== null && !isNaN(Number(s))) saved = Number(s); } catch (e) { /* ignore */ }
        setMasterVolume(saved);
    }
}
