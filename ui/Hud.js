import { formatTime } from "../data/TimeUtils.js";

// Fixed-to-camera HUD: hint text, enemies-left counter, back-to-menu button, the
// bullet-time vignette, and an optional time-limit display top-middle. Everything here
// uses setScrollFactor(0) so it stays pinned to the screen, unlike world-space objects
// (platforms, level text, etc.) which scroll with the camera.
export class Hud {
  constructor(scene, { hasTimer = false, hasEnemies = true } = {}) {
    this.scene = scene;

    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(100);

    // Only created for levels that actually have enemies -- a level with none has
    // nothing meaningful to count down, so this stays hidden entirely rather than
    // sitting there permanently reading "All enemies defeated".
    if (hasEnemies) {
      this.enemiesLeftText = scene.add.text(1180, 40, '', { fontSize: '16px', color: '#e24b4a' }).setOrigin(1, 0);
      this.container.add(this.enemiesLeftText);
    }

    // Only created when the level actually has a time limit -- levels without one
    // (the default) show no timer display at all.
    if (hasTimer) {
      this.timerText = scene.add.text(640, 16, '', { fontSize: '20px', color: '#ffffff' }).setOrigin(0.5, 0);
      this.container.add(this.timerText);
    }

    this.bulletTimeVignette = scene.add.rectangle(0, 0, 1280, 720, 0x3aa0ff, 0).setOrigin(0).setScrollFactor(0).setDepth(99);
  }

  // Called once per frame from GameScene.update() with the current state it needs to
  // display. timeRemainingMs is null for levels with no time limit.
  update({ enemiesLeft, bulletTimeActive, timeRemainingMs }) {
    if (this.enemiesLeftText) {
      this.enemiesLeftText.setText(enemiesLeft === 0 ? 'All enemies defeated' : `Enemies left: ${enemiesLeft}`);
    }
    this.bulletTimeVignette.setFillStyle(0x3aa0ff, bulletTimeActive ? 0.08 : 0);

    if (this.timerText && timeRemainingMs !== null && timeRemainingMs !== undefined) {
      this.timerText.setText(formatTime(timeRemainingMs));
    }
  }
}