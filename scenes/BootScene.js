import { BULLET_PLAYER_TINT, BULLET_ENEMY_TINT, CHARGE_VIGNETTE_COLOR, CHARGE_VIGNETTE_MAX_ALPHA, GAME_WIDTH, GAME_HEIGHT } from "../data/Constants.js";
import { notifyLoadingStop } from "../save/SaveManager.js";

export class BootScene extends Phaser.Scene {

    constructor() {
        super("BootScene");
    }

    preload() {
        this.load.spritesheet("player", "assets/player.png", { frameWidth: 14, frameHeight: 20 });
        this.load.spritesheet("enemy", "assets/enemy.png", { frameWidth: 15, frameHeight: 20 });

        this.load.spritesheet("default_weapon", "assets/weapon/default.png", { frameWidth: 11, frameHeight: 8 });
        this.load.spritesheet("beam_weapon", "assets/weapon/beam.png", { frameWidth: 13, frameHeight: 7 });
        this.load.spritesheet("blaster_weapon", "assets/weapon/blaster.png", { frameWidth: 11, frameHeight: 8 });

        this.load.image("tile", "assets/tile/tile.png");
        this.load.image("background_tile", "assets/tile/background_tile.png");
        this.load.image("breakable_tile", "assets/tile/breakable_tile.png");
        this.load.image("bounce_tile", "assets/tile/bounce_tile.png");

        this.load.audio('menu', 'assets/music/Menu.ogg');
        this.load.audio('level_select', 'assets/music/Level Select.ogg');

        this.load.audio('uplifting', 'assets/music/Uplifting.ogg');
        this.load.audio('barrage', 'assets/music/Barrage.ogg');
        this.load.audio('rebuttal', 'assets/music/Rebuttal.ogg');
        this.load.audio('alacrity', 'assets/music/Alacrity.ogg');
        this.load.audio('mystery', 'assets/music/Mystery.ogg');
        this.load.audio('counter', 'assets/music/Counter.ogg');
        this.load.audio('countenance', 'assets/music/Countenance.ogg');
        this.load.audio('countenance2', 'assets/music/Countenance 2.ogg');
    }
    
    create() {

        const g = this.add.graphics();

        g.clear();
        g.fillStyle(0xffffff, 1);
        g.fillRect(0, 0, 32, 32);
        g.generateTexture("platform", 32, 32);

        g.clear();
        g.fillStyle(BULLET_PLAYER_TINT, 1);
        g.fillRect(0, 0, 8, 2);
        g.generateTexture("bulletPlayer", 6, 2);

        g.clear();
        g.fillStyle(BULLET_ENEMY_TINT, 1);
        g.fillRect(0, 0, 8, 2);
        g.generateTexture("bulletEnemy", 6, 2);

        g.clear();
        g.fillStyle(0xffffff, 1);
        g.fillCircle(2, 2, 2);
        g.generateTexture("particle", 4, 4);

        g.destroy();

        const vignetteWidth = GAME_WIDTH;
        const vignetteHeight = GAME_HEIGHT;
        const vignetteCanvas = this.textures.createCanvas("chargeVignette", vignetteWidth, vignetteHeight);
        const vctx = vignetteCanvas.getContext();
        const vcx = vignetteWidth / 2;
        const vcy = vignetteHeight / 2;
        const outerR = Math.hypot(vcx, vcy);
        const innerR = outerR * 0.35;
        const vr = (CHARGE_VIGNETTE_COLOR >> 16) & 0xff;
        const vg = (CHARGE_VIGNETTE_COLOR >> 8) & 0xff;
        const vb = CHARGE_VIGNETTE_COLOR & 0xff;
        const vignetteGradient = vctx.createRadialGradient(vcx, vcy, innerR, vcx, vcy, outerR);
        vignetteGradient.addColorStop(0, `rgba(${vr}, ${vg}, ${vb}, 0)`);
        vignetteGradient.addColorStop(1, `rgba(${vr}, ${vg}, ${vb}, ${CHARGE_VIGNETTE_MAX_ALPHA})`);
        vctx.fillStyle = vignetteGradient;
        vctx.fillRect(0, 0, vignetteWidth, vignetteHeight);
        vignetteCanvas.refresh();

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
            key: "default_enemy_grounded",
            frames: this.anims.generateFrameNumbers("enemy", { start: 0, end: 0 }),
        });
        this.anims.create({
            key: "default_enemy_grounded_w",
            frames: this.anims.generateFrameNumbers("enemy", { start: 1, end: 1 }),
        });
        this.anims.create({
            key: "default_enemy",
            frames: this.anims.generateFrameNumbers("enemy", { start: 2, end: 2 }),
        });
        this.anims.create({
            key: "default_enemy_w",
            frames: this.anims.generateFrameNumbers("enemy", { start: 3, end: 3 }),
        });
        this.anims.create({
            key: "turret_enemy_grounded",
            frames: this.anims.generateFrameNumbers("enemy", { start: 4, end: 4 }),
        });
        this.anims.create({
            key: "turret_enemy_grounded_w",
            frames: this.anims.generateFrameNumbers("enemy", { start: 5, end: 5 }),
        });
        this.anims.create({
            key: "turret_enemy",
            frames: this.anims.generateFrameNumbers("enemy", { start: 6, end: 6 }),
        });
        this.anims.create({
            key: "turret_enemy_w",
            frames: this.anims.generateFrameNumbers("enemy", { start: 7, end: 7 }),
        });
        this.anims.create({
            key: "beam_enemy_grounded",
            frames: this.anims.generateFrameNumbers("enemy", { start: 8, end: 8 }),
        });
        this.anims.create({
            key: "beam_enemy_grounded_w",
            frames: this.anims.generateFrameNumbers("enemy", { start: 9, end: 9 }),
        });
        this.anims.create({
            key: "beam_enemy",
            frames: this.anims.generateFrameNumbers("enemy", { start: 10, end: 10 }),
        });
        this.anims.create({
            key: "beam_enemy_w",
            frames: this.anims.generateFrameNumbers("enemy", { start: 11, end: 11 }),
        });
        this.anims.create({
            key: "blaster_enemy_grounded",
            frames: this.anims.generateFrameNumbers("enemy", { start: 12, end: 12 }),
        });
        this.anims.create({
            key: "blaster_enemy_grounded_w",
            frames: this.anims.generateFrameNumbers("enemy", { start: 13, end: 13 }),
        });
        this.anims.create({
            key: "blaster_enemy",
            frames: this.anims.generateFrameNumbers("enemy", { start: 14, end: 14 }),
        });
        this.anims.create({
            key: "blaster_enemy_w",
            frames: this.anims.generateFrameNumbers("enemy", { start: 15, end: 15 }),
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

        notifyLoadingStop();

        this.scene.start("MenuScene");
    }
}