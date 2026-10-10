import { DEPTH, BULLET_ENEMY_TINT } from "../data/Constants.js";

const GLOW_TEXTURE = "highlightGlow";
const GLOW_TEXTURE_SIZE = 64;

const FADE_MS = 150;

const BULLET_GLOW_SIZE = 40;
const BULLET_GLOW_ALPHA = 0.2;

const ENEMY_GLOW_PADDING = 4;
const ENEMY_GLOW_COLOR = 0x000000;
const ENEMY_GLOW_ALPHA = 0.25;

const PULSE_PERIOD_MS = 800;
const PULSE_MIN_ALPHA = 0.02;
const PULSE_MAX_ALPHA = 0.05;
const PULSE_COLOR = 0xffffff;

function ensureGlowTexture(scene) {
  if (scene.textures.exists(GLOW_TEXTURE)) return;
  const tex = scene.textures.createCanvas(GLOW_TEXTURE, GLOW_TEXTURE_SIZE, GLOW_TEXTURE_SIZE);
  const ctx = tex.getContext();
  const c = GLOW_TEXTURE_SIZE / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, GLOW_TEXTURE_SIZE, GLOW_TEXTURE_SIZE);
  tex.refresh();
}

export class Highlighter {
  constructor(scene, { enemies, enemyBullets, breakablePlatforms }) {
    this.scene = scene;
    this.enemies = enemies;
    this.enemyBullets = enemyBullets;
    this.breakablePlatforms = breakablePlatforms;

    this.intensity = 0;
    this.bulletGlows = [];
    this.enemyGlows = new Map();
    this.platformOverlays = new Map();

    ensureGlowTexture(scene);

    this.breakablePlatforms.getChildren().forEach((p) => this.addPlatformOverlay(p));

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  addPlatformOverlay(platform) {
    const overlay = this.scene.add.rectangle(platform.x, platform.y, platform.displayWidth, platform.displayHeight, PULSE_COLOR, 1);
    overlay.setDepth(DEPTH.platform + 0.1);
    overlay.setBlendMode(Phaser.BlendModes.ADD);
    overlay.setVisible(false);
    this.platformOverlays.set(platform, overlay);
  }

  update(time, delta) {
    const target = this.scene.bulletTimeActive ? 1 : 0;
    const step = delta / FADE_MS;
    this.intensity = target > this.intensity
      ? Math.min(target, this.intensity + step)
      : Math.max(target, this.intensity - step);

    const on = this.intensity > 0.001;
    this.updateBulletGlows(on);
    this.updateEnemyGlows(on);
    this.updatePlatformOverlays(on, time);
  }

  updateBulletGlows(on) {
    let used = 0;
    if (on) {
      this.enemyBullets.children.iterate((bullet) => {
        if (!bullet || !bullet.active) return;
        let glow = this.bulletGlows[used];
        if (!glow) {
          glow = this.scene.add.image(0, 0, GLOW_TEXTURE);
          glow.setBlendMode(Phaser.BlendModes.ADD);
          glow.setDepth(DEPTH.bullet - 0.1);
          this.bulletGlows.push(glow);
        }
        used++;
        glow.setVisible(true);
        glow.setPosition(bullet.x, bullet.y);
        glow.setTint(BULLET_ENEMY_TINT);
        glow.setAlpha(this.intensity * BULLET_GLOW_ALPHA);
        glow.setScale(BULLET_GLOW_SIZE / GLOW_TEXTURE_SIZE);
      });
    }
    for (let i = used; i < this.bulletGlows.length; i++) this.bulletGlows[i].setVisible(false);
  }

  updateEnemyGlows(on) {
    for (const [enemy, glow] of this.enemyGlows) {
      if (!enemy.active) {
        glow.destroy();
        this.enemyGlows.delete(enemy);
      }
    }
    this.enemies.children.iterate((enemy) => {
      if (!enemy || !enemy.active) return;
      let glow = this.enemyGlows.get(enemy);
      if (!glow) {
        glow = this.scene.add.image(enemy.x, enemy.y, GLOW_TEXTURE);
        glow.setTint(ENEMY_GLOW_COLOR);
        glow.setDepth(DEPTH.enemy - 0.1);
        this.enemyGlows.set(enemy, glow);
      }
      glow.setVisible(on);
      if (!on) return;
      const size = Math.max(enemy.displayWidth, enemy.displayHeight) * ENEMY_GLOW_PADDING;
      glow.setPosition(enemy.x, enemy.y);
      glow.setScale(size / GLOW_TEXTURE_SIZE);
      glow.setAlpha(this.intensity * ENEMY_GLOW_ALPHA);
    });
  }

  updatePlatformOverlays(on, time) {
    const pulse = 0.5 - 0.5 * Math.cos((time / PULSE_PERIOD_MS) * Math.PI * 2);
    const alpha = PULSE_MIN_ALPHA + (PULSE_MAX_ALPHA - PULSE_MIN_ALPHA) * pulse;
    for (const [platform, overlay] of this.platformOverlays) {
      if (!platform.active) {
        overlay.destroy();
        this.platformOverlays.delete(platform);
        continue;
      }
      overlay.setVisible(on);
      if (on) overlay.setAlpha(alpha * this.intensity);
    }
  }

  destroy() {
    this.bulletGlows.forEach((g) => g.destroy());
    this.enemyGlows.forEach((g) => g.destroy());
    this.platformOverlays.forEach((o) => o.destroy());
    this.bulletGlows = [];
    this.enemyGlows.clear();
    this.platformOverlays.clear();
  }
}