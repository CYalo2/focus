import { GRAVITY, BACKGROUND_COLOR } from "./data/Constants.js";

import { BootScene } from "./scenes/BootScene.js";
import { MenuScene } from "./scenes/MenuScene.js";
import { LevelSelectScene } from "./scenes/LevelSelectScene.js";
import { GameScene } from "./scenes/GameScene.js";
import { isAllowedDomain, notifyLoadingStart } from "./save/SaveManager.js";

// Sitelock check -- see SaveManager.js. A no-op locally/off-CrazyGames while
// USE_SDK is false; once USE_SDK is flipped to true this blocks the game from
// running anywhere except an official crazygames.* domain.
if (!isAllowedDomain()) {
    const container = document.getElementById("game-container");
    container.textContent = "Available only on CrazyGames.";
    container.style.color = "#fff";
    container.style.fontSize = "20px";
} else {
    // Tell CrazyGames asset loading is beginning. The matching notifyLoadingStop()
    // belongs in BootScene once its preload() finishes and the game is actually
    // playable -- not here, since Phaser.Game(config) below is just the start of
    // that process, not the end of it.
    notifyLoadingStart();
    startGame();
}

function startGame() {

const config = {
    type: Phaser.AUTO,

    width: 1280,
    height: 720,

    parent: "game-container",

    backgroundColor: BACKGROUND_COLOR,

    pixelArt: true,

    // FIT scales the canvas to the largest size that fits #game-container while
    // keeping the 1280x720 (16:9) aspect ratio intact -- no stretching/distortion --
    // and CENTER_BOTH centers the result within it. CrazyGames embeds the game in
    // iframes of varying sizes (desktop, mobile, different site layouts), and without
    // this the canvas would just render at a fixed 1280x720 regardless of how much
    // room it's actually given. See index.html for the matching #game-container CSS
    // this scales into.
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },

    // CrazyGames' own integration docs call this out explicitly: embedded in their
    // iframe, the page itself (not just the game) would otherwise scroll whenever the
    // player presses spacebar or an arrow key, since that's the browser's default
    // behavior for those keys. Capturing them here (globally, for every scene) calls
    // preventDefault() on them before that can happen. This only affects the keys
    // listed -- WASD/Q/E/R/P/O (see GameScene.js) aren't browser-scroll keys and don't
    // need it.
    input: {
        keyboard: {
            capture: [
                Phaser.Input.Keyboard.KeyCodes.SPACE,
                Phaser.Input.Keyboard.KeyCodes.LEFT,
                Phaser.Input.Keyboard.KeyCodes.RIGHT,
                Phaser.Input.Keyboard.KeyCodes.UP,
                Phaser.Input.Keyboard.KeyCodes.DOWN
            ]
        }
    },

    physics: {
        default: "arcade",
        arcade: {
            gravity: {
                y: GRAVITY
            },
            debug: false
        }
    },

    scene: [
        BootScene,
        MenuScene,
        LevelSelectScene,
        GameScene
    ]
};

new Phaser.Game(config);

}