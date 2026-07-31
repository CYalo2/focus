import { getMusicVolume, setMusicVolume } from "../save/SaveManager.js";

// Centralizes runtime audio volume so every scene reads/writes it the same way,
// instead of each scene juggling this.sound.volume independently. Phaser's
// SoundManager (this.sound / game.sound) is a single shared instance across every
// scene, so setting .volume/.mute here affects whatever track is currently playing,
// whichever scene it belongs to -- no per-track bookkeeping needed.
//
// Call initAudioManager() once, early (BootScene, before any music starts). Every
// other export is safe to call from any scene after that.

let soundManager = null;

// True whenever CrazyGames' own audio setting says to mute. This always wins over
// the player's in-game slider -- CrazyGames' docs require muteAudio to "take
// priority over your in-game audio settings" -- so soundManager.mute tracks this
// directly rather than the player's own choice.
let sdkMuted = false;

let initialized = false;

export async function initAudioManager(game) {
    if (initialized) return;
    initialized = true;

    soundManager = game.sound;
    soundManager.volume = await getMusicVolume();

    // Checked directly (not via SaveManager's USE_SDK flag) -- USE_SDK only picks
    // where save data is written, but this should listen for the host's audio
    // setting any time the CrazyGames SDK is actually present, e.g. whenever the
    // game is running embedded on crazygames.com, regardless of that flag.
    //
    // NOTE: `addSettingsChangeListener` and its `muteAudio` field are documented at
    // https://docs.crazygames.com/sdk/game/ -- worth double-checking against the
    // current docs for your SDK version before shipping, since the JS-side property
    // for reading the *current* settings on load (used below) wasn't explicit in
    // what I could confirm, only the listener for *changes*.
    if (window.CrazyGames?.SDK?.game?.addSettingsChangeListener) {
        const applySdkSettings = (settings) => {
            sdkMuted = !!settings?.muteAudio;
            soundManager.mute = sdkMuted;
        };
        window.CrazyGames.SDK.game.addSettingsChangeListener(applySdkSettings);
        applySdkSettings(window.CrazyGames.SDK.game.settings);
    }
}

// Current volume as a 0-1 fraction, independent of whether the CrazyGames SDK has
// forced mute right now -- mute is a separate, higher-priority override on top of
// this, not a change to the stored preference itself.
export function getVolume() {
    return soundManager ? soundManager.volume : 1;
}

// Updates and persists the player's chosen volume. Still saved even while the SDK
// has forced mute -- it takes effect immediately once the host unmutes, since
// soundManager.mute (not .volume) is what's actually silencing things right now.
export async function setVolume(value) {
    const clamped = Phaser.Math.Clamp(value, 0, 1);
    if (soundManager) soundManager.volume = clamped;
    await setMusicVolume(clamped);
    return clamped;
}

export function isSdkMuted() {
    return sdkMuted;
}