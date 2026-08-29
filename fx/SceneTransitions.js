// Small shared helper so every scene fades the same way instead of each one
// re-implementing its own camera.fade calls. Quick and unobtrusive by design --
// this is a UI transition, not a scene-specific effect, so the duration/color
// are kept fixed and unconfigurable on purpose.
const FADE_DURATION_MS = 250;

// Call once near the top of a scene's create() to fade in from black on entry.
//
// Also resets the bookkeeping fadeToScene sets up below. Phaser reuses scene
// instances across restarts (stop then start again re-runs create() on the
// same object), and while scene.input.enabled is reset to true by Phaser
// itself on every scene start, scene.input.keyboard.enabled is only ever
// initialized once when the plugin boots -- so without this, a scene that
// once transitioned away via fadeToScene would come back with its keyboard
// shortcuts silently dead. _transitioning is likewise per-instance state that
// needs clearing, or a scene revisited after a fadeToScene would refuse to
// ever transition again.
export function fadeIn(scene) {
    scene._transitioning = false;
    if (scene.input && scene.input.keyboard) scene.input.keyboard.enabled = true;

    scene.cameras.main.fadeIn(FADE_DURATION_MS, 0, 0, 0);
}

// Drop-in replacement for `this.scene.start(key, data)` that fades to black
// first and only starts the next scene once the fade finishes -- so the swap
// itself never flashes into view mid-transition. Also disables input on this
// scene's camera-owning input plugin for the duration, so a double click/press
// during the fade can't queue up a second transition underneath this one.
//
// scene.input.enabled only gates *pointer* input, not keyboard -- keydown
// listeners added via scene.input.keyboard keep firing independently. Since
// every scene wires its own shortcut (SPACE, etc.) straight to fadeToScene,
// spamming that key mid-fade used to call this function again on every press,
// each call stacking another fadeOut + another one-shot FADE_OUT_COMPLETE
// listener, so several scene.start() calls could end up queued back to back.
// The explicit _transitioning flag below makes fadeToScene a no-op once a
// transition is already underway, and disabling scene.input.keyboard closes
// off the keyboard side of the same hole.
export function fadeToScene(scene, key, data) {
    if (scene._transitioning) return;
    scene._transitioning = true;

    if (scene.input) {
        scene.input.enabled = false;
        if (scene.input.keyboard) scene.input.keyboard.enabled = false;
    }
    scene.cameras.main.fadeOut(FADE_DURATION_MS, 0, 0, 0);
    scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        scene.scene.start(key, data);
    });
}