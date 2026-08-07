import { initAudioManager } from "../save/AudioManager.js";
import { createBackground } from "../ui/PlatformBackground.js";
import { getCurrentBackground } from "../ui/BackgroundManager.js";
import { fadeIn, fadeToScene } from "../ui/SceneTransitions.js";

export class MenuScene extends Phaser.Scene {

    constructor() {
        super("MenuScene");
    }

    async create() {

        const { width, height } = this.scale;

        fadeIn(this);

        createBackground(this, await getCurrentBackground());

        // No-ops after the first call -- MenuScene is the first scene reached after
        // BootScene, so this is as good a place as any to load the saved volume and
        // hook up the CrazyGames mute listener exactly once for the whole game.
        await initAudioManager(this.game);

        // Starts fresh each time this scene is entered, and is stopped below as soon
        // as the scene shuts down (i.e. scene.start() moves us elsewhere) -- so it
        // never keeps playing into GameScene, and never double-plays on re-entry.
        // Volume here is this track's own level *relative to* the shared master
        // volume AudioManager controls -- Phaser multiplies the two together.
        this.music = this.sound.add("menu", { loop: true, volume: 0.5 });
        this.music.play();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.music.stop());

        this.add.text(
            width / 2,
            height / 2 - 80,
            "Focus",
            {
                fontSize: "64px",
                color: "#ffffff"
            }
        ).setOrigin(0.5);

        const play = this.add.text(
            width / 2,
            height / 2 + 60,
            "[ PLAY ]",
            {
                fontSize: "32px",
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