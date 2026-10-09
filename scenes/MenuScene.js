import { initAudioManager } from "../save/AudioManager.js";
import { createBackground } from "../ui/PlatformBackground.js";
import { getCurrentBackground } from "../ui/BackgroundManager.js";
import { fadeIn, fadeToScene } from "../fx/SceneTransitions.js";
import { GAME_WIDTH, GAME_HEIGHT } from "../data/Constants.js";
import { applyDisplayCamera } from "../ui/DisplayScale.js";

export class MenuScene extends Phaser.Scene {

    constructor() {
        super("MenuScene");
    }

    async create() {

        const width = GAME_WIDTH, height = GAME_HEIGHT;
        applyDisplayCamera(this);

        fadeIn(this);

        createBackground(this, await getCurrentBackground());

        await initAudioManager(this.game);

        this.music = this.sound.add("menu", { loop: true, volume: 0.5 });
        this.music.play();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.music.stop());

        this.add.text(
            width / 2,
            height / 2 - 40,
            "Focus",
            {
                fontSize: "32px",
                color: "#ffffff"
            }
        ).setOrigin(0.5);

        const play = this.add.text(
            width / 2,
            height / 2 + 30,
            "[ PLAY ]",
            {
                fontSize: "16px",
                color: "#3aa0ff"
            }
        )
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

        play.on("pointerover", () => play.setColor("#ffffff"));
        play.on("pointerout", () => play.setColor("#3aa0ff"));

        const startPlay = () => fadeToScene(this, "LevelSelectScene");
        play.on("pointerdown", startPlay);
        this.input.keyboard.on("keydown-SPACE", startPlay);

    }

}