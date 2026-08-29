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

    // Phaser's built-in pauseOnBlur pauses sound on its own internal BLUR event,
    // which fires on BOTH a plain window blur (alt-tab to another app/window/
    // devtools, tab still visible) AND the tab actually going hidden -- one flag,
    // two different situations. We only want the second one, and only want it to
    // happen in lockstep with whatever already pauses the game itself on a real
    // tab-out, so this turns the built-in behavior off entirely and instead listens
    // to document.visibilitychange directly -- the browser's actual "is this tab
    // currently visible" signal, which doesn't fire on a plain window blur. This
    // needs to be set/attached before any sound starts playing, hence here.
    soundManager.pauseOnBlur = false;
    document.addEventListener("visibilitychange", () => {
        if (!soundManager) return;
        if (document.hidden) {
            soundManager.pauseAll();
        } else {
            soundManager.resumeAll();
        }
    });

    // Checked directly (not via SaveManager's USE_SDK flag) -- USE_SDK only picks
    // where save data is written, but this should listen for the host's audio
    // setting any time the CrazyGames SDK is actually present, e.g. whenever the
    // game is running embedded on crazygames.com, regardless of that flag.
    //
    // `addSettingsChangeListener` and the synchronous `game.settings` property (used
    // below to read the *current* value on load, not just future changes) are both
    // confirmed current per https://docs.crazygames.com/sdk/game/ as of this check.
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

// BiquadFilterNode spliced between masterVolumeNode and destination while bullet
// time is active; null otherwise.
let bulletTimeFilter = null;

// Routes all game audio through a lowpass filter for a muffled slow-mo effect,
// inserted directly into Phaser's WebAudioSoundManager master chain -- each Sound
// connects to masterMuteNode, which feeds masterVolumeNode, which feeds destination
// (soundManager.destination, normally just ctx.destination). This splices the filter
// in at that last link only (masterVolumeNode -> filter -> destination) and never
// touches masterMuteNode -- rewiring masterMuteNode's side instead would leave its
// existing edge into masterVolumeNode intact and create a closed loop that never
// reaches the speakers at all, which is a much louder failure than "no effect."
// Same "one shared instance affects everything" principle as volume/mute above, so
// it applies to whatever's playing right now and anything that starts playing
// later, with no per-track bookkeeping. No-op if the browser fell back to Phaser's
// HTML5AudioSoundManager (no Web Audio graph to splice into) -- bullet time just
// won't have an audio effect there.
export function setBulletTimeAudioEffect(active) {
    if (!soundManager?.context || !soundManager.masterVolumeNode) return;

    const ctx = soundManager.context;
    // NOTE: soundManager.destination is NOT the final speaker output -- per Phaser's
    // own docs it's "the destination node for connecting individual sounds to," i.e.
    // it's another reference to masterMuteNode (upstream of masterVolumeNode), not
    // downstream of it. Using it here would recreate the exact masterMuteNode <->
    // masterVolumeNode loop this function exists to avoid. ctx.destination (the
    // actual AudioContext/hardware output) is the only correct node to splice in
    // front of.
    const destination = ctx.destination;

    if (active && !bulletTimeFilter) {
        bulletTimeFilter = ctx.createBiquadFilter();
        bulletTimeFilter.type = "lowpass";
        bulletTimeFilter.frequency.value = 2000; // Hz

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