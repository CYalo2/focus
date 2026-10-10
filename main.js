import { GRAVITY, BACKGROUND_COLOR, GAME_WIDTH, GAME_HEIGHT } from "./data/Constants.js";

import { BootScene } from "./scenes/BootScene.js";
import { MenuScene } from "./scenes/MenuScene.js";
import { LevelSelectScene } from "./scenes/LevelSelectScene.js";
import { GameScene } from "./scenes/GameScene.js";
import { setZoom, applyDisplayCamera } from "./ui/DisplayScale.js";
import { installPixelTextDefaults, loadPixelFonts } from "./ui/PixelText.js";
import { isAllowedDomain, notifyLoadingStart } from "./save/SaveManager.js";

if (!isAllowedDomain()) {
    const container = document.getElementById("game-container");
    container.textContent = "Available only on CrazyGames.";
    container.style.color = "#fff";
    container.style.fontSize = "20px";
} else {
    notifyLoadingStart();
    installPixelTextDefaults();
    loadPixelFonts().then(startGame);
}

function startGame() {

const initialLayout = computeLayout();
setZoom(initialLayout.zoom);

const config = {
    type: Phaser.AUTO,

    width: initialLayout.width,
    height: initialLayout.height,

    parent: "game-container",

    backgroundColor: BACKGROUND_COLOR,

    pixelArt: true,
    roundPixels: true,

    scale: {
        mode: Phaser.Scale.NONE,
        zoom: 1 / (window.devicePixelRatio || 1),
        autoCenter: Phaser.Scale.NO_CENTER
    },

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

const game = new Phaser.Game(config);

function computeLayout() {
    const dpr = window.devicePixelRatio || 1;
    const fit = Math.min(window.innerWidth * dpr / GAME_WIDTH, window.innerHeight * dpr / GAME_HEIGHT);
    const zoom = fit >= 1 ? Math.floor(fit) : fit;
    return { dpr, zoom, width: Math.round(GAME_WIDTH * zoom), height: Math.round(GAME_HEIGHT * zoom) };
}

function fitToWindow() {
    const { dpr, zoom, width, height } = computeLayout();
    setZoom(zoom);
    game.scale.resize(width, height);
    game.scale.setZoom(1 / dpr);
    game.scale.refresh();
    game.scene.getScenes(true).forEach(applyDisplayCamera);

    const container = document.getElementById("game-container");
    const offsetX = Math.max(0, Math.floor((window.innerWidth * dpr - width) / 2));
    const offsetY = Math.max(0, Math.floor((window.innerHeight * dpr - height) / 2));
    container.style.left = `${offsetX / dpr}px`;
    container.style.top = `${offsetY / dpr}px`;
}
window.addEventListener("resize", fitToWindow);
game.events.once(Phaser.Core.Events.READY, fitToWindow);

}
