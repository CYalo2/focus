import { getMusicVolume, setMusicVolume } from "../save/SaveManager.js";

let soundManager = null;

let sdkMuted = false;

let initialized = false;

export async function initAudioManager(game) {
    if (initialized) return;
    initialized = true;

    soundManager = game.sound;
    soundManager.volume = await getMusicVolume();

    soundManager.pauseOnBlur = false;
    document.addEventListener("visibilitychange", () => {
        if (!soundManager) return;
        if (document.hidden) {
            soundManager.pauseAll();
        } else {
            soundManager.resumeAll();
        }
    });

    if (window.CrazyGames?.SDK?.game?.addSettingsChangeListener) {
        const applySdkSettings = (settings) => {
            sdkMuted = !!settings?.muteAudio;
            soundManager.mute = sdkMuted;
        };
        window.CrazyGames.SDK.game.addSettingsChangeListener(applySdkSettings);
        applySdkSettings(window.CrazyGames.SDK.game.settings);
    }
}

export function getVolume() {
    return soundManager ? soundManager.volume : 1;
}

export async function setVolume(value) {
    const clamped = Phaser.Math.Clamp(value, 0, 1);
    if (soundManager) soundManager.volume = clamped;
    await setMusicVolume(clamped);
    return clamped;
}

export function isSdkMuted() {
    return sdkMuted;
}

let bulletTimeFilter = null;

export function setBulletTimeAudioEffect(active) {
    if (!soundManager?.context || !soundManager.masterVolumeNode) return;

    const ctx = soundManager.context;
    const destination = ctx.destination;

    if (active && !bulletTimeFilter) {
        bulletTimeFilter = ctx.createBiquadFilter();
        bulletTimeFilter.type = "lowpass";
        bulletTimeFilter.frequency.value = 2000;

        soundManager.masterVolumeNode.disconnect();
        soundManager.masterVolumeNode.connect(bulletTimeFilter);
        bulletTimeFilter.connect(destination);
    } else if (!active && bulletTimeFilter) {
        soundManager.masterVolumeNode.disconnect();
        bulletTimeFilter.disconnect();
        soundManager.masterVolumeNode.connect(destination);
        bulletTimeFilter = null;
    }
}