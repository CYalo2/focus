import { GAME_WIDTH, GAME_HEIGHT, BULLET_TIME_MULTIPLIER, DEFAULT_WORLD_BOUNDS, BULLET_OFFSCREEN_MARGIN, HIT_FLASH_BRIGHTEN_AMOUNT, CHARGE_MIN_OPACITY, DEPTH, BULLET_PLAYER_TINT, BULLET_ENEMY_TINT } from "../data/Constants.js";
import { lightenColor } from "../data/ColorUtils.js";
import { LEVELS } from "../data/Levels.js";
import { WEAPONS, applyWeaponSpread } from "../data/Weapons.js";
import { Player } from "../entity/Player.js";
import { Enemy } from "../entity/Enemy.js";
import { createPlatforms, createGoal } from "../entity/Platform.js";
import { destroyOffscreenBullets, reorientBullet, redirectBullet } from "../entity/Bullet.js";
import { Hud } from "../ui/Hud.js";
import { Highlighter } from "../fx/Highlighter.js";
import { showEndScreen } from "../ui/EndScreen.js";
import { SeededRandom } from "../data/SeededRandom.js";
import { showPauseMenu } from "../ui/PauseMenu.js";
import { spawnBulletBreakParticles, spawnBulletBounceParticles, spawnEnemyDeathParticles, startGoalActivationParticles, spawnPlatformHitParticles, spawnPlatformBreakParticles } from "../fx/Particles.js";
import { recordLevelCompletion, notifyGameplayStart, notifyGameplayStop, getAutoAim, getChallengeMode, getChargeVignetteEnabled, isChallengeModeEnabled } from "../save/SaveManager.js";
import { HINT_RECORDING_ENABLED, HintRecorder, HintPlayback, fromB36 } from "../data/HintReplay.js";
import { setBulletTimeAudioEffect } from "../save/AudioManager.js";
import { applyDisplayCamera, getZoom, pointerToGame, snapToDevicePixel } from "../ui/DisplayScale.js";

const CAMERA_FOLLOW_LERP = 0.1;

const CHEAT = false; // not hit by projectiles
const AIM_RAY_LENGTH = 500;

const RETRY_FLASH_DURATION_MS = 170;
const RETRY_FLASH_ALPHA = 0.3;

let settingsPrimed = false;

const heldKeyCodes = new Set();
window.addEventListener("keydown", (e) => heldKeyCodes.add(e.keyCode));
window.addEventListener("keyup", (e) => heldKeyCodes.delete(e.keyCode));
window.addEventListener("blur", () => heldKeyCodes.clear());

function syncHeldKeys(...keys) {
  for (const key of keys) {
    if (heldKeyCodes.has(key.keyCode)) key.isDown = true;
  }
}

const FIRE_READY_INDICATOR_SIZE = 7;
const FIRE_READY_INDICATOR_COLOR = BULLET_PLAYER_TINT;
const FIRE_READY_INDICATOR_ALPHA = 0.35;
const FIRE_READY_INDICATOR_LINE_WIDTH = 2;

function drawFireReadyRing(scene, x, y) {
  const g = scene.add.graphics({ x, y }).setScrollFactor(0);
  g.lineStyle(FIRE_READY_INDICATOR_LINE_WIDTH, FIRE_READY_INDICATOR_COLOR, FIRE_READY_INDICATOR_ALPHA);
  g.beginPath();
  g.moveTo(-FIRE_READY_INDICATOR_SIZE, 0);
  g.lineTo(FIRE_READY_INDICATOR_SIZE, 0);
  g.moveTo(0, -FIRE_READY_INDICATOR_SIZE);
  g.lineTo(0, FIRE_READY_INDICATOR_SIZE);
  g.strokePath();
  g.setDepth(DEPTH.explosion);
  return g;
}

export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  init(data) {
    this.levelIndex = data.levelIndex || 0;
    this.levelData = LEVELS[this.levelIndex];
    this.isHintPlayback = data.hintPlayback === true;
    this.sceneReady = false;
  }

  async create() {
    this.sceneReady = false;
    applyDisplayCamera(this);

    const level = this.levelData;

    this.weapon = WEAPONS[level.weapon];

    if (!settingsPrimed) {
      await getAutoAim();
      await getChallengeMode();
      await getChargeVignetteEnabled();
      settingsPrimed = true;
    }
    this.challengeModeEnabled = isChallengeModeEnabled();

    this.bulletTimeActive = false;
    this.gameEnded = false;
    this.downHeld = false;
    this.bulletCleanupFrame = 0;

    this.usingChallengeTimer = this.challengeModeEnabled
      && !this.isHintPlayback
      && level.challengeTimeMs !== undefined;
    const activeTimeLimitMs = this.usingChallengeTimer ? level.challengeTimeMs : level.timeLimitMs;
    this.timeLimitMs = activeTimeLimitMs !== undefined ? activeTimeLimitMs : null;
    this.timeRemainingMs = this.timeLimitMs;

    this.elapsedMs = 0;

    this.goalActivated = false;

    if (HINT_RECORDING_ENABLED) {
      this.hintRecorder = new HintRecorder();
    }

    this.rng = new SeededRandom(this.isHintPlayback ? fromB36(level.hintReplay.seed) : Date.now());

    if (this.isHintPlayback) {
      this.hintPlayback = new HintPlayback(level.hintReplay.frames);
    }

    this.chargeReadyIndicator = null;

    this.music = null;
    if (level.music) {
      if (this.cache.audio.exists(level.music)) {
        this.music = this.sound.add(level.music, { loop: true, volume: 0.5 });
        this.music.play();
      } else {
        console.warn(`Level ${this.levelIndex} specifies music "${level.music}", but no audio was preloaded under that key.`);
      }
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.music?.stop());

    this.worldBounds = level.worldBounds || DEFAULT_WORLD_BOUNDS;
    this.physics.world.setBounds(0, 0, this.worldBounds.width, this.worldBounds.height);
    this.physics.world.setFPS(240);
    this.physics.world.OVERLAP_BIAS = 2;

    this.backgroundScrollFactor = level.open ? 0.8 : 0.6;
    this.background = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'background_tile')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.background);
    this.background.setTint(level.backgroundColor !== undefined ? level.backgroundColor : 0xffffff);
    this.background.setTileScale(1, 1);

    const platforms = createPlatforms(this, level.platforms, level.backgroundColor);
    this.platformsNormal = platforms.platformsNormal;
    this.platformsOneway = platforms.platformsOneway;
    this.platformsBreakable = platforms.platformsBreakable;
    this.platformsBounceable = platforms.platformsBounceable;
    this.platformsEnemyPassthrough = platforms.platformsEnemyPassthrough;
    this.platformsBulletPassthrough = platforms.platformsBulletPassthrough;
    this.platformsDeath = platforms.platformsDeath;
    this.platformsRedirect = platforms.platformsRedirect;

    (level.texts || []).forEach(t => {
      const style = {
        fontSize: t.fontSize !== undefined ? t.fontSize : '8px',
        color: t.color !== undefined ? t.color : '#ffffff',
      };
      this.add.text(t.x, t.y, t.text, style).setOrigin(0.5).setDepth(DEPTH.levelText);
    });

    this.player = new Player(this, level.playerSpawn.x, level.playerSpawn.y, this.weapon);

    this.goal = createGoal(this, level.goal.x, level.goal.y, level.backgroundColor);

    this.enemies = this.physics.add.group();
    level.enemies.forEach(e => {
      const enemy = new Enemy(this, e.x, e.y, e);
      this.enemies.add(enemy);
      enemy.applyBodySettings();
    });

    this.playerBullets = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();

    this.physics.add.collider(this.player, this.platformsNormal);
    this.physics.add.collider(this.player, this.platformsBreakable);
    this.physics.add.collider(this.player, this.platformsBounceable);
    this.physics.add.collider(this.player, this.platformsEnemyPassthrough);
    this.physics.add.collider(this.player, this.platformsBulletPassthrough);
    this.physics.add.collider(this.player, this.platformsOneway, null, (player, platform) => {
      if (this.downHeld) return false;
      return player.body.velocity.y >= 0 && (player.body.bottom - platform.body.top) <= 6;
    });

    this.physics.add.collider(this.enemies, this.platformsNormal);
    this.physics.add.collider(this.enemies, this.platformsBreakable);
    this.physics.add.collider(this.enemies, this.platformsBounceable);
    this.physics.add.collider(this.enemies, this.platformsEnemyPassthrough);
    this.physics.add.collider(this.enemies, this.platformsBulletPassthrough);
    this.physics.add.collider(this.enemies, this.platformsOneway);

    this.physics.add.overlap(this.playerBullets, this.platformsBreakable, (bullet, platform) => this.damagePlatform(bullet, platform, bullet.damage !== undefined ? bullet.damage : 1, BULLET_PLAYER_TINT));
    this.physics.add.collider(this.playerBullets, this.platformsNormal, (b) => {
      this.explodeBullet(b);
      spawnBulletBreakParticles(this, b.x, b.y, BULLET_PLAYER_TINT);
      b.destroy();
    });
    this.physics.add.collider(this.playerBullets, this.platformsBounceable, (bullet) => {
      reorientBullet(bullet);
      spawnBulletBounceParticles(this, bullet.x, bullet.y, BULLET_PLAYER_TINT);
    });
    this.physics.add.collider(this.playerBullets, this.platformsEnemyPassthrough, (b) => {
      this.explodeBullet(b);
      spawnBulletBreakParticles(this, b.x, b.y, BULLET_PLAYER_TINT);
      b.destroy();
    });

    this.physics.add.overlap(this.enemyBullets, this.platformsBreakable, (bullet, platform) => {
      this.damagePlatform(bullet, platform, bullet.hitsBreakable ? 1 : 0, BULLET_ENEMY_TINT);
    });
    this.physics.add.collider(this.enemyBullets, this.platformsNormal, (b) => {
      this.explodeBullet(b, null, BULLET_ENEMY_TINT);
      spawnBulletBreakParticles(this, b.x, b.y, BULLET_ENEMY_TINT);
      b.destroy();
    });
    this.physics.add.collider(this.enemyBullets, this.platformsBounceable, (bullet) => {
      reorientBullet(bullet);
      spawnBulletBounceParticles(this, bullet.x, bullet.y, BULLET_ENEMY_TINT);
    });

    this.physics.add.overlap(this.playerBullets, this.platformsRedirect, (bullet, area) => {
      redirectBullet(bullet, area);
      this.flashRedirectPlatform(area);
    });
    this.physics.add.overlap(this.enemyBullets, this.platformsRedirect, (bullet, area) => {
      redirectBullet(bullet, area);
      this.flashRedirectPlatform(area);
    });

    this.physics.add.overlap(this.playerBullets, this.enemies, (bullet, enemy) => this.hitEnemy(bullet, enemy));
    this.physics.add.overlap(this.enemyBullets, this.player, (player, bullet) => this.hitPlayer(bullet));

    this.highlighter = new Highlighter(this, {
      enemies: this.enemies,
      enemyBullets: this.enemyBullets,
      breakablePlatforms: this.platformsBreakable,
    });
    this.physics.add.overlap(this.player, this.goal, () => {
      if (this.enemies.countActive(true) === 0) {
        this.winLevel();
      }
    });
    this.physics.add.overlap(this.player, this.platformsDeath, () => this.loseLevel());

    this.snapCameraToPlayer();
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.updateCamera, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.updateCamera, this));

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE,SHIFT,Q');
    syncHeldKeys(
      this.cursors.up, this.cursors.down, this.cursors.left, this.cursors.right,
      this.keys.W, this.keys.A, this.keys.S, this.keys.D, this.keys.SPACE, this.keys.SHIFT, this.keys.Q
    );
    this.input.mouse.disableContextMenu();

    this.hud = new Hud(this, {
      hasTimer: this.timeLimitMs !== null,
      challengeMode: this.usingChallengeTimer,
      hasEnemies: level.enemies.length > 0,
      showControlButtons: !this.isHintPlayback,
    });

    this.isPaused = false;
    this.pauseModalContainer = null;
    this.pauseSettingsModalContainer = null;
    this.pauseSettingsModalOpening = false;
    this.time.paused = false;
    this.input.keyboard.on("keydown-E", (event) => {
      if (this.isHintPlayback) return;
      if (event.repeat) return;
      this.togglePause();
    });
    this.input.keyboard.on("keydown-R", (event) => {
      if (this.isHintPlayback) return;
      if (event.repeat) return;
      if (this.isPaused) {
        this.retryLevel();
      } else {
        this.retryLevelWithFlash();
      }
    });
    this.input.keyboard.on("keydown-SPACE", () => {
      if (this.isPaused) this.resumeGame();
    });
    this.input.keyboard.on("keydown-P", () => {
      if (!HINT_RECORDING_ENABLED) return;
      this.hintRecorder.copyToClipboard()
        .then(({ recordedCount, simplifiedCount }) =>
          console.log(`Hint replay copied (${recordedCount} frames recorded, ${simplifiedCount} after simplification).`))
        .catch((err) => console.error("Failed to copy hint replay:", err));
    });
    this.input.keyboard.on("keydown-O", () => {
      if (!HINT_RECORDING_ENABLED || this.isHintPlayback) return;
      if (!this.levelData.hintReplay) {
        console.warn("No hintReplay recorded for this level -- press P to copy one to the clipboard, then paste it into Levels.js first.");
        return;
      }
      this.scene.restart({ levelIndex: this.levelIndex, hintPlayback: true });
    });

    if (!this.isHintPlayback) notifyGameplayStart();

    this.sceneReady = true;
  }

  worldToScreen(x, y) {
    const cam = this.cameras.main;
    return { x: x - cam.scrollX, y: y - cam.scrollY };
  }

  updatePointerWorld() {
    const pointer = this.input.activePointer;
    const cam = this.cameras.main;
    const p = pointerToGame(pointer);
    pointer.worldX = p.x + cam.scrollX;
    pointer.worldY = p.y + cam.scrollY;
  }

  cameraTarget() {
    const viewW = GAME_WIDTH;
    const viewH = GAME_HEIGHT;
    const clamp = (value, world, view) => (world <= view ? (world - view) / 2 : Phaser.Math.Clamp(value, 0, world - view));
    return {
      x: clamp(this.player.x - viewW / 2, this.worldBounds.width, viewW),
      y: clamp(this.player.y - viewH / 2, this.worldBounds.height, viewH),
    };
  }

  snapCameraToPlayer() {
    const target = this.cameraTarget();
    this.cameras.main.setScroll(snapToDevicePixel(target.x), snapToDevicePixel(target.y));
  }

  updateCamera() {
    if (!this.player || !this.player.active) return;
    const cam = this.cameras.main;
    const target = this.cameraTarget();
    const x = cam.scrollX + (target.x - cam.scrollX) * CAMERA_FOLLOW_LERP;
    const y = cam.scrollY + (target.y - cam.scrollY) * CAMERA_FOLLOW_LERP;

    cam.setScroll(snapToDevicePixel(x), snapToDevicePixel(y));

    if (!this.isHintPlayback && this.sceneReady && !this.isPaused && !this.gameEnded) {
      this.updatePointerWorld();
      this.player.refreshWeaponAim(this.input.activePointer);
    }
  }

  togglePause() {
    if (this.gameEnded) return;
    if (this.isPaused) {
      this.resumeGame();
    } else {
      this.pauseGame();
    }
  }

  pauseGame() {
    if (this.isPaused || this.gameEnded) return;
    this.isPaused = true;
    this.physics.pause();
    this.tweens.pauseAll();
    this.time.paused = true;
    this.anims.pauseAll();
    this.player.fireInputArmed = false;
    this.music?.pause();
    notifyGameplayStop();
    showPauseMenu(this).catch((err) => console.error("Failed to show pause menu:", err));
  }

  resumeGame() {
    if (!this.isPaused) return;
    this.isPaused = false;
    if (this.pauseSettingsModalContainer) {
      this.pauseSettingsModalOpening = false;
      this.pauseSettingsModalContainer.destroy();
      this.pauseSettingsModalContainer = null;
    }
    if (this.pauseModalContainer) {
      this.pauseModalContainer.destroy();
      this.pauseModalContainer = null;
    }
    this.physics.resume();
    this.tweens.resumeAll();
    this.time.paused = false;
    this.anims.resumeAll();
    this.music?.resume();
    if (!this.isHintPlayback) notifyGameplayStart();
  }

  retryLevel() {
    if (this.gameEnded) return;
    this.resumeGame();
    this.scene.restart({ levelIndex: this.levelIndex });
  }

  retryLevelWithFlash() {
    if (this.gameEnded) return;
    this.resumeGame();
    const flash = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, this.levelData.backgroundColor, RETRY_FLASH_ALPHA)
      .setOrigin(0).setScrollFactor(0).setDepth(150);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: RETRY_FLASH_DURATION_MS,
      onComplete: () => flash.destroy(),
    });
    this.time.delayedCall(RETRY_FLASH_DURATION_MS, () => this.retryLevel());
  }

  hitEnemy(bullet, enemy) {
    const damage = bullet.damage !== undefined ? bullet.damage : 1;
    const bulletAngle = bullet.rotation;
    this.explodeBullet(bullet, enemy);
    spawnBulletBreakParticles(this, bullet.x, bullet.y, BULLET_PLAYER_TINT);
    bullet.destroy();
    enemy.applyKnockback(bulletAngle, bullet.knockbackScale !== undefined ? bullet.knockbackScale : 1);
    const dead = enemy.hit(damage);
    if (dead) {
      spawnEnemyDeathParticles(this, enemy.x, enemy.y);
      enemy.destroy();

      if (this.enemies.countActive(true) === 0 && this.physics.overlap(this.player, this.goal)) {
        this.winLevel();
      }
    }
  }

  hitEnemyWithBeam(enemy, damage, angle, knockbackScale = 1) {
    spawnBulletBreakParticles(this, enemy.x, enemy.y, BULLET_PLAYER_TINT);
    enemy.applyKnockback(angle, knockbackScale);
    const dead = enemy.hit(damage);
    if (dead) {
      spawnEnemyDeathParticles(this, enemy.x, enemy.y);
      enemy.destroy();
      if (this.enemies.countActive(true) === 0 && this.physics.overlap(this.player, this.goal)) {
        this.winLevel();
      }
    }
  }

  hitPlayer(bullet) {
    if (CHEAT) return;

    if (this.gameEnded) return;
    this.explodeBullet(bullet, this.player, BULLET_ENEMY_TINT);
    spawnBulletBreakParticles(this, bullet.x, bullet.y, BULLET_ENEMY_TINT);
    bullet.destroy();
    this.cameras.main.flash(80, 200, 40, 40);
    this.loseLevel();
  }

  explodeBullet(bullet, excludeObj = null, tint = BULLET_PLAYER_TINT) {
    if (!bullet.explodesOnHit) return;

    const { x, y, explosionRadius: radius, damage } = bullet;
    const enemy = this.enemyBullets.contains(bullet);
    this.spawnExplosionEffect(x, y, radius, enemy ? BULLET_ENEMY_TINT : undefined);

    if (!enemy || bullet.hitsBreakable) {
      const bodies = this.physics.overlapCirc(x, y, radius, true, true);
      bodies.forEach((body) => {
        const obj = body.gameObject;
        if (!obj || obj === excludeObj || !obj.active) return;

        if (this.enemies.contains(obj) && !enemy) {
          const knockbackAngle = Phaser.Math.Angle.Between(x, y, obj.x, obj.y);
          obj.applyKnockback(knockbackAngle, bullet.knockbackScale !== undefined ? bullet.knockbackScale : 1);
          if (obj.hit(damage)) {
            spawnEnemyDeathParticles(this, obj.x, obj.y);
            obj.destroy();
          }
        } else if (this.platformsBreakable.contains(obj)) {
          this.damagePlatformAtPoint(obj.x, obj.y, obj, damage, tint);
        }
      });
    }

    if (this.enemyBullets.contains(bullet) && this.player !== excludeObj
      && this.player.active && !this.gameEnded && !CHEAT) {
      const dist = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
      if (dist <= radius) {
        this.cameras.main.flash(80, 200, 40, 40);
        this.loseLevel();
      }
    }

    if (this.enemies.countActive(true) === 0 && this.physics.overlap(this.player, this.goal)) {
      this.winLevel();
    }
  }

  fireBeamWeapon(player, aimAngle, chargeRatio = 1) {
    const weapon = player.weapon;
    const damage = weapon.damage * chargeRatio;
    const originX = player.weaponSprite.x;
    const originY = player.weaponSprite.y;
    const angle = applyWeaponSpread(weapon, aimAngle);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const maxRange = weapon.beamRange || Math.hypot(this.worldBounds.width, this.worldBounds.height);

    let beamLength = maxRange;
    [this.platformsNormal, this.platformsEnemyPassthrough, this.platformsBounceable].forEach((group) => {
      group.children.iterate((platform) => {
        if (!platform || !platform.active) return;
        const t = this.raycastRect(originX, originY, dx, dy, platform.body);
        if (t !== null && t < beamLength) beamLength = t;
      });
    });

    this.platformsBreakable.getChildren().slice().forEach((platform) => {
      if (!platform || !platform.active) return;
      const t = this.raycastRect(originX, originY, dx, dy, platform.body);
      if (t !== null && t <= beamLength) {
        this.damagePlatformAtPoint(originX + dx * t, originY + dy * t, platform, damage, BULLET_PLAYER_TINT);
      }
    });

    this.enemies.getChildren().slice().forEach((enemy) => {
      if (!enemy || !enemy.active) return;
      const t = this.raycastRect(originX, originY, dx, dy, enemy.body);
      if (t !== null && t <= beamLength) {
        this.hitEnemyWithBeam(enemy, damage, angle, chargeRatio);
      }
    });

    this.spawnBeamEffect(originX, originY, angle, beamLength, weapon.beamWidth || 6, chargeRatio);

    if (weapon.recoil) {
      const recoilVec = new Phaser.Math.Vector2();
      this.physics.velocityFromRotation(angle, -weapon.recoil, recoilVec);
      player.setVelocity(player.body.velocity.x + recoilVec.x, player.body.velocity.y + recoilVec.y);
    }
  }

  raycastRect(originX, originY, dx, dy, body) {
    const invDx = 1 / dx;
    const invDy = 1 / dy;
    const left = body.x, right = body.x + body.width;
    const top = body.y, bottom = body.y + body.height;

    let t1 = (left - originX) * invDx;
    let t2 = (right - originX) * invDx;
    if (t1 > t2) [t1, t2] = [t2, t1];

    let t3 = (top - originY) * invDy;
    let t4 = (bottom - originY) * invDy;
    if (t3 > t4) [t3, t4] = [t4, t3];

    const tmin = Math.max(t1, t3, 0);
    const tmax = Math.min(t2, t4);
    if (tmax < tmin) return null;
    return tmin;
  }

  fireEnemyBeam(enemy, angle) {
    const originX = enemy.x;
    const originY = enemy.y;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const maxRange = enemy.beamRange || Math.hypot(this.worldBounds.width, this.worldBounds.height);

    let beamLength = maxRange;
    [this.platformsNormal, this.platformsBounceable].forEach((group) => {
      group.children.iterate((platform) => {
        if (!platform || !platform.active) return;
        const t = this.raycastRect(originX, originY, dx, dy, platform.body);
        if (t !== null && t < beamLength) beamLength = t;
      });
    });

    this.platformsBreakable.getChildren().slice().forEach((platform) => {
      if (!platform || !platform.active) return;
      const t = this.raycastRect(originX, originY, dx, dy, platform.body);
      if (enemy.hitsBreakable && t !== null && t <= beamLength) {
        this.damagePlatformAtPoint(originX + dx * t, originY + dy * t, platform, 1, BULLET_ENEMY_TINT);
      }
    });

    const t = this.raycastRect(originX, originY, dx, dy, this.player.body);
    if (t !== null && t <= beamLength) {
      this.hitPlayerWithBeam();
    }

    this.spawnBeamEffect(originX, originY, angle, beamLength, enemy.beamWidth || 4, 1, BULLET_ENEMY_TINT);
  }

  hitPlayerWithBeam() {
    if (CHEAT) return;
    if (this.gameEnded) return;
    this.cameras.main.flash(80, 200, 40, 40);
    this.loseLevel();
  }

  spawnBeamEffect(x, y, angle, length, width, chargeRatio = 1, color = BULLET_PLAYER_TINT) {
    const baseOpacity = 0.9;
    const opacity = baseOpacity * (CHARGE_MIN_OPACITY + (1 - CHARGE_MIN_OPACITY) * chargeRatio);
    const beam = this.add.rectangle(x, y, length, width, color, opacity);
    beam.setOrigin(0, 0.5);
    beam.setRotation(angle);
    beam.setDepth(DEPTH.bullet);
    this.tweens.add({
      targets: beam,
      alpha: 0,
      duration: 120,
      onComplete: () => beam.destroy(),
    });
  }

  spawnFireReadyIndicator(x, y) {
    const circle = drawFireReadyRing(this, x, y);
    this.tweens.add({
      targets: circle,
      alpha: 0,
      duration: 300,
      onComplete: () => circle.destroy(),
    });
  }

  spawnExplosionEffect(x, y, radius, color = 0xffaa33) {
    const circle = this.add.circle(x, y, radius, color, 0.5).setDepth(DEPTH.explosion);
    this.tweens.add({
      targets: circle,
      scale: { from: 0.2, to: 1 },
      alpha: { from: 0.5, to: 0 },
      duration: 250,
      onComplete: () => circle.destroy(),
    });
  }

  damagePlatform(bullet, platform, damage, tint) {
    this.explodeBullet(bullet, platform, tint);
    const x = bullet.x, y = bullet.y;
    bullet.destroy();
    if (damage != 0) this.damagePlatformAtPoint(x, y, platform, damage, tint);
  }

  resolveBulletSpawnInWall(bullet, tint = BULLET_PLAYER_TINT) {
    if (!bullet.active) return;

    const bodies = this.physics.overlapRect(bullet.x, bullet.y, 0.5, 0.5, false, true);
    const objects = bodies.map((body) => body.gameObject);

    const breakable = objects.find((obj) => obj && obj.active && this.platformsBreakable.contains(obj));
    if (breakable) {
      this.damagePlatform(bullet, breakable, bullet.damage !== undefined ? bullet.damage : 1, tint);
      return;
    }

    const solid = objects.find((obj) => obj && obj.active && (this.platformsNormal.contains(obj) || this.platformsEnemyPassthrough.contains(obj)));
    if (solid) {
      this.explodeBullet(bullet, solid, tint);
      spawnBulletBreakParticles(this, bullet.x, bullet.y, tint);
      bullet.destroy();
    }
  }

  damagePlatformAtPoint(x, y, platform, damage, tint) {
    spawnBulletBreakParticles(this, x, y, tint);
    platform.health -= damage;
    platform.setTintFill(lightenColor(platform.baseTint, HIT_FLASH_BRIGHTEN_AMOUNT));
    if (platform.tintClearEvent) this.time.removeEvent(platform.tintClearEvent);
    platform.tintClearEvent = this.time.delayedCall(60, () => {
      platform.tintClearEvent = null;
      if (platform.active) platform.setTint(platform.baseTint);
    });
    if (platform.health <= 0) {
      spawnPlatformBreakParticles(this, platform.x, platform.y);
      platform.destroy();
    } else {
      spawnPlatformHitParticles(this, x, y);
    }
  }

  flashRedirectPlatform(platform) {
    platform.setTintFill(lightenColor(platform.baseTint, HIT_FLASH_BRIGHTEN_AMOUNT));
    if (platform.tintClearEvent) this.time.removeEvent(platform.tintClearEvent);
    platform.tintClearEvent = this.time.delayedCall(60, () => {
      platform.tintClearEvent = null;
      if (platform.active) platform.setTint(platform.baseTint);
    });
  }

  async winLevel() {
    if (this.isHintPlayback) return;
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.physics.pause();
    this.music?.stop();
    notifyGameplayStop();
    this.bulletTimeActive = false;
    this.physics.world.timeScale = 1;
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    setBulletTimeAudioEffect(false);
    const elapsedMs = this.elapsedMs;
    let isNewBest = false;
    try {
      ({ isNewBest } = await recordLevelCompletion(this.levelIndex, elapsedMs));
    } catch (err) {
      console.error('Failed to save level completion:', err);
    }
    showEndScreen(this, 'LEVEL COMPLETE', '#63c722', true, elapsedMs, isNewBest);
  }

  loseLevel(message = 'YOU DIED') {
    if (this.isHintPlayback) return;
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.physics.pause();
    this.music?.stop();
    this.player.setTint(0x555555);
    notifyGameplayStop();
    this.bulletTimeActive = false;
    this.physics.world.timeScale = 1;
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    setBulletTimeAudioEffect(false);
    showEndScreen(this, message, '#e24b4a', false);
  }

  endHintPlayback() {
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.physics.pause();
    this.music?.stop();
    this.bulletTimeActive = false;
    this.physics.world.timeScale = 1;
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    setBulletTimeAudioEffect(false);
    showEndScreen(this, 'HINT', '#3aa0ff', false);
  }

  updateHintPlayback(time, delta) {
    this.applyBulletTimeToggle();
    const scaledDelta = delta * this.time.timeScale;

    if (this.timeLimitMs !== null) {
      this.timeRemainingMs = Math.max(0, this.timeRemainingMs - delta);
    }

    this.background.tilePositionX = this.cameras.main.scrollX * this.backgroundScrollFactor;
    this.background.tilePositionY = this.cameras.main.scrollY * this.backgroundScrollFactor;

    let remaining = scaledDelta;
    while (!this.hintPlayback.done) {
      const evt = this.hintPlayback.takePendingFireEvent();
      if (evt) {
        if (evt.fire) this.player.forceFireEvent(evt.angle, this.playerBullets);
        if (evt.dash) this.player.forceDashEvent(evt.angle);
      }

      const frameRemaining = this.hintPlayback.remainingInCurrentFrame();
      if (frameRemaining <= 0) {
        this.hintPlayback.advance(0);
        continue;
      }
      if (remaining <= 0) break;

      const stepDt = Math.min(remaining, frameRemaining);
      const f = this.hintPlayback.currentInputState();
      this.downHeld = f.down;

      const aimWorldX = this.player.x + Math.cos(f.angle) * AIM_RAY_LENGTH;
      const aimWorldY = this.player.y + Math.sin(f.angle) * AIM_RAY_LENGTH;

      this.player.update(time, stepDt, stepDt, {
        cursors: { left: { isDown: f.left }, right: { isDown: f.right }, up: { isDown: f.up } },
        keys: { A: { isDown: f.left }, D: { isDown: f.right }, W: { isDown: f.up }, SPACE: { isDown: f.fire }, Q: { isDown: f.dash } },
        pointer: {
          worldX: aimWorldX,
          worldY: aimWorldY,
          x: aimWorldX - this.cameras.main.scrollX,
          y: aimWorldY - this.cameras.main.scrollY,
          leftButtonDown: () => f.fire,
          rightButtonDown: () => f.dash,
        },
        bulletGroup: this.playerBullets,
        suppressAutoFire: true,
      });

      this.hintPlayback.advance(stepDt);
      remaining -= stepDt;
    }

    if (this.hintPlayback.done) {
      this.endHintPlayback();
      return;
    }

    this.enemies.children.iterate((enemy) => {
      if (enemy && enemy.active) enemy.update(time, delta, scaledDelta);
    });

    this.bulletCleanupFrame++;
    if (this.bulletCleanupFrame % 4 === 0) {
      destroyOffscreenBullets(this.playerBullets, this.worldBounds, BULLET_OFFSCREEN_MARGIN);
      destroyOffscreenBullets(this.enemyBullets, this.worldBounds, BULLET_OFFSCREEN_MARGIN);
    }

    this.highlighter.update(time, delta);

    this.hud.update({
      enemiesLeft: this.enemies.countActive(true),
      bulletTimeActive: true,
      timeRemainingMs: this.timeRemainingMs,
      chargeRatio: this.player.getChargeProgress(),
      delta,
    });
  }

  applyBulletTimeToggle() {
    const wantsBulletTime = this.keys.SHIFT.isDown;
    if (wantsBulletTime === this.bulletTimeActive) return;
    this.bulletTimeActive = wantsBulletTime;
    const scale = this.bulletTimeActive ? BULLET_TIME_MULTIPLIER : 1;
    this.physics.world.timeScale = 1 / scale;
    this.time.timeScale = scale;
    this.tweens.timeScale = scale;
    this.anims.globalTimeScale = scale;
    setBulletTimeAudioEffect(this.bulletTimeActive);
  }

  update(time, delta) {
    if (!this.sceneReady) return;

    if (HINT_RECORDING_ENABLED && !this.isHintPlayback && this.gameEnded) {
      this.hintRecorder.recordClosingFrameOnce(delta * this.time.timeScale);
    }

    if (this.gameEnded || this.isPaused) return;

    if (this.isHintPlayback) {
      this.updateHintPlayback(time, delta);
      return;
    }

    this.elapsedMs += delta;

    if (this.timeLimitMs !== null) {
      this.timeRemainingMs = Math.max(0, this.timeRemainingMs - delta);
    }

    this.applyBulletTimeToggle();

    const scaledDelta = delta * this.time.timeScale;

    this.background.tilePositionX = this.cameras.main.scrollX * this.backgroundScrollFactor;
    this.background.tilePositionY = this.cameras.main.scrollY * this.backgroundScrollFactor;

    this.downHeld = this.cursors.down.isDown || this.keys.S.isDown;

    this.updatePointerWorld();

    let hintInputs;
    if (HINT_RECORDING_ENABLED) {
      hintInputs = {
        left: this.cursors.left.isDown || this.keys.A.isDown,
        right: this.cursors.right.isDown || this.keys.D.isDown,
        up: this.cursors.up.isDown || this.keys.W.isDown,
        down: this.cursors.down.isDown || this.keys.S.isDown,
        fire: this.input.activePointer.leftButtonDown() || this.keys.SPACE.isDown,
        dash: this.input.activePointer.rightButtonDown() || this.keys.Q.isDown,
      };
    }

    this.player.update(time, delta, scaledDelta, {
      cursors: this.cursors,
      keys: this.keys,
      pointer: this.input.activePointer,
      bulletGroup: this.playerBullets,
    });

    if (HINT_RECORDING_ENABLED) {
      const shotFired = this.player.firedThisFrame || this.player.dashedThisFrame;
      const shotAngle = this.player.firedThisFrame ? this.player.firedAngle : this.player.dashedAngle;
      this.hintRecorder.recordFrame(scaledDelta, hintInputs, shotAngle, shotFired);
    }

    const isFullyCharged = this.player.isCharging && this.player.getChargeRatio() === 1;
    if (isFullyCharged) {
      if (!this.chargeReadyIndicator) {
        this.chargeReadyIndicator = drawFireReadyRing(this, 0, 0);
      }
      const p = pointerToGame(this.input.activePointer);
      this.chargeReadyIndicator.setPosition(p.x, p.y);
    } else if (this.chargeReadyIndicator) {
      this.chargeReadyIndicator.destroy();
      this.chargeReadyIndicator = null;
    }

    this.enemies.children.iterate((enemy) => {
      if (enemy && enemy.active) enemy.update(time, delta, scaledDelta);
    });

    this.bulletCleanupFrame++;
    if (this.bulletCleanupFrame % 4 === 0) {
      destroyOffscreenBullets(this.playerBullets, this.worldBounds, BULLET_OFFSCREEN_MARGIN);
      destroyOffscreenBullets(this.enemyBullets, this.worldBounds, BULLET_OFFSCREEN_MARGIN);
    }

    this.highlighter.update(time, delta);

    const enemiesLeft = this.enemies.countActive(true);
    this.hud.update({
      enemiesLeft,
      bulletTimeActive: this.bulletTimeActive,
      timeRemainingMs: this.timeRemainingMs,
      chargeRatio: this.player.getChargeProgress(),
      delta,
    });

    if (!this.goalActivated && enemiesLeft === 0) {
      this.goalActivated = true;
      startGoalActivationParticles(this, this.goal.x, this.goal.y);
    }

    if (this.player.y > this.worldBounds.height + 30) this.loseLevel();

    if (this.timeLimitMs !== null && this.timeRemainingMs <= 0) {
      this.loseLevel("TIME'S UP");
    }
  }
}