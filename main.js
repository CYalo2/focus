import { GRAVITY } from "./data/Constants.js";

import { BootScene } from "./scenes/BootScene.js";
import { MenuScene } from "./scenes/MenuScene.js";
import { LevelSelectScene } from "./scenes/LevelSelectScene.js";
import { GameScene } from "./scenes/GameScene.js";

const config = {
    type: Phaser.AUTO,

    width: 1280,
    height: 720,

    parent: "game-container",

    backgroundColor: "#1a1a22",

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