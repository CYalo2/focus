import { ENEMY_BASE_TINT, BULLET_PLAYER_TINT, BULLET_ENEMY_TINT, GOAL_BASE_TINT, PLAYER_BASE_TINT } from "../data/Constants.js";

export class BootScene extends Phaser.Scene {

    constructor() {
        super("BootScene");
    }

    create() {

        const g = this.add.graphics();

        // Player
        g.clear();
        g.fillStyle(PLAYER_BASE_TINT, 1);
        g.fillRect(0, 0, 28, 40);
        g.generateTexture("player", 28, 40);

        // Enemy
        g.clear();
        g.fillStyle(ENEMY_BASE_TINT, 1);
        g.fillRect(0, 0, 30, 40);
        g.generateTexture("enemy", 30, 40);

        // Platform
        g.clear();
        g.fillStyle(0x555550, 1);
        g.fillRect(0, 0, 32, 32);
        g.generateTexture("platform", 32, 32);

        // Player Bullet -- elongated rectangle so rotation reads clearly as a direction.
        // Drawn pointing along local +x, which lines up with rotation = 0 in Phaser's
        // angle convention (and with velocityFromRotation(0, ...) also pointing +x).
        g.clear();
        g.fillStyle(BULLET_PLAYER_TINT, 1);
        g.fillRect(0, 0, 14, 4);
        g.generateTexture("bulletPlayer", 10, 4);

        // Enemy Bullet -- same shape/orientation convention as the player bullet.
        g.clear();
        g.fillStyle(BULLET_ENEMY_TINT, 1);
        g.fillRect(0, 0, 16, 4);
        g.generateTexture("bulletEnemy", 12, 4);

        // Goal
        g.clear();
        g.fillStyle(GOAL_BASE_TINT, 1);
        g.fillRect(0, 0, 10, 60);
        g.fillRect(10, 0, 30, 20);
        g.generateTexture("goal", 40, 60);

        // Particle -- plain white so fx/Particles.js can freely tint it any color
        // (multiplying a colored tint against white gives back that exact color,
        // unlike tinting white-on-white which is the invisible no-op described
        // earlier for hit flashes).
        g.clear();
        g.fillStyle(0xffffff, 1);
        g.fillCircle(4, 4, 4);
        g.generateTexture("particle", 8, 8);

        g.destroy();

        this.scene.start("MenuScene");
    }

}