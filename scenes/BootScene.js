import { ENEMY_BASE_TINT, BULLET_PLAYER_TINT, BULLET_ENEMY_TINT, GOAL_BASE_TINT } from "../data/Constants.js";

export class BootScene extends Phaser.Scene {

    constructor() {
        super("BootScene");
    }

    preload() {
        this.load.spritesheet("player", "assets/player.png", { frameWidth: 14, frameHeight: 20 });

        this.load.spritesheet("default_weapon", "assets/weapon/default.png", { frameWidth: 11, frameHeight: 8 });
        this.load.spritesheet("beam_weapon", "assets/weapon/beam.png", { frameWidth: 13, frameHeight: 7 });
        this.load.spritesheet("blaster_weapon", "assets/weapon/blaster.png", { frameWidth: 11, frameHeight: 8 });

        this.load.image("tile", "assets/tile/tile.png");
        this.load.image("background_tile", "assets/tile/background_tile.png");
        this.load.image("breakable_tile", "assets/tile/breakable_tile.png");
    }
    
    create() {

        const g = this.add.graphics();

        // Enemy
        g.clear();
        g.fillStyle(ENEMY_BASE_TINT, 1);
        g.fillRect(0, 0, 30, 40);
        g.generateTexture("enemy", 30, 40);

        // Platform
        g.clear();
        g.fillStyle(0xffffff, 1);
        g.fillRect(0, 0, 32, 32);
        g.generateTexture("platform", 32, 32);

        // Player Bullet -- elongated rectangle so rotation reads clearly as a direction.
        // Drawn pointing along local +x, which lines up with rotation = 0 in Phaser's
        // angle convention (and with velocityFromRotation(0, ...) also pointing +x).
        g.clear();
        g.fillStyle(BULLET_PLAYER_TINT, 1);
        g.fillRect(0, 0, 16, 4);
        g.generateTexture("bulletPlayer", 12, 4);

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

        this.anims.create({
            key: "player_idle",
            frames: this.anims.generateFrameNumbers("player", { start: 0, end: 0 }),
        });
        this.anims.create({
            key: "player_run",
            frames: this.anims.generateFrameNumbers("player", { start: 0, end: 1 }),
            frameRate: 6,
            repeat: -1
        });
        this.anims.create({
            key: "player_fall",
            frames: this.anims.generateFrameNumbers("player", { start: 2, end: 2 }),
        });
        this.anims.create({
            key: "player_rise",
            frames: this.anims.generateFrameNumbers("player", { start: 3, end: 3 }),
        });
        this.anims.create({
            key: "player_idle_c",
            frames: this.anims.generateFrameNumbers("player", { start: 4, end: 4 }),
        });
        this.anims.create({
            key: "player_run_c",
            frames: this.anims.generateFrameNumbers("player", { start: 4, end: 5 }),
            frameRate: 4,
            repeat: -1
        });
        this.anims.create({
            key: "player_fall_c",
            frames: this.anims.generateFrameNumbers("player", { start: 6, end: 6 }),
        });
        this.anims.create({
            key: "player_rise_c",
            frames: this.anims.generateFrameNumbers("player", { start: 7, end: 7 }),
        });

        this.anims.create({
            key: "default_weapon_idle",
            frames: this.anims.generateFrameNumbers("default_weapon", { start: 0, end: 0 }),
        });
        this.anims.create({
            key: "default_weapon_charge",
            frames: this.anims.generateFrameNumbers("default_weapon", { start: 1, end: 3 }),
            frameRate: 10,
            repeat: 0
        });
        this.anims.create({
            key: "default_weapon_ready",
            frames: this.anims.generateFrameNumbers("default_weapon", { start: 4, end: 4 }),
        });
        this.anims.create({
            key: "beam_weapon_idle",
            frames: this.anims.generateFrameNumbers("beam_weapon", { start: 0, end: 0 }),
        });
        this.anims.create({
            key: "beam_weapon_charge",
            frames: this.anims.generateFrameNumbers("beam_weapon", { start: 1, end: 5 }),
            frameRate: 10,
            repeat: 0
        });
        this.anims.create({
            key: "beam_weapon_ready",
            frames: this.anims.generateFrameNumbers("beam_weapon", { start: 6, end: 6 }),
        });
        this.anims.create({
            key: "blaster_weapon_idle",
            frames: this.anims.generateFrameNumbers("blaster_weapon", { start: 0, end: 0 }),
        });
        this.anims.create({
            key: "blaster_weapon_cooldown",
            frames: this.anims.generateFrameNumbers("blaster_weapon", { start: 1, end: 1 }),
        });

        this.scene.start("MenuScene");
    }
}