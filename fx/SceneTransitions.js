const FADE_DURATION_MS = 250;

export function fadeIn(scene) {
    scene._transitioning = false;
    if (scene.input && scene.input.keyboard) scene.input.keyboard.enabled = true;

    scene.cameras.main.fadeIn(FADE_DURATION_MS, 0, 0, 0);
}

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