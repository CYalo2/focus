// Small shared helper so every scene fades the same way instead of each one
// re-implementing its own camera.fade calls. Quick and unobtrusive by design --
// this is a UI transition, not a scene-specific effect, so the duration/color
// are kept fixed and unconfigurable on purpose.
const FADE_DURATION_MS = 250;

// Call once near the top of a scene's create() to fade in from black on entry.
export function fadeIn(scene) {
    scene.cameras.main.fadeIn(FADE_DURATION_MS, 0, 0, 0);
}

// Drop-in replacement for `this.scene.start(key, data)` that fades to black
// first and only starts the next scene once the fade finishes -- so the swap
// itself never flashes into view mid-transition. Also disables input on this
// scene's camera-owning input plugin for the duration, so a double click/press
// during the fade can't queue up a second transition underneath this one.
export function fadeToScene(scene, key, data) {
    if (scene.input) scene.input.enabled = false;
    scene.cameras.main.fadeOut(FADE_DURATION_MS, 0, 0, 0);
    scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        scene.scene.start(key, data);
    });
}