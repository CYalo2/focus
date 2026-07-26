export class MenuScene extends Phaser.Scene {

    constructor() {
        super("MenuScene");
    }

    create() {

        const { width, height } = this.scale;

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

        const startPlay = () => this.scene.start("LevelSelectScene");
        play.on("pointerdown", startPlay);
        this.input.keyboard.on("keydown-SPACE", startPlay);

    }

}