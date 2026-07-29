import { formatTime } from "../data/TimeUtils.js";

// Fixed-to-camera HUD: hint text, enemies-left counter, back-to-menu button, the
// bullet-time vignette, an optional time-limit display top-middle, and the top-right
// pause/retry icon buttons (with a follow-the-mouse tooltip). Everything here uses
// setScrollFactor(0) so it stays pinned to the screen, unlike world-space objects
// (platforms, level text, etc.) which scroll with the camera.

// --- top-right icon buttons: layout/styling constants ---
const BUTTON_SIZE = 36;
const BUTTON_MARGIN = 14; // gap from the screen edges
const BUTTON_GAP = 10;    // gap between the two buttons
const BUTTON_ICON_COLOR = 0xffffff;
const BUTTON_ICON_ALPHA_IDLE = 0.5;  // faint by default so they don't compete with gameplay
const BUTTON_ICON_ALPHA_HOVER = 1;   // full opacity once the pointer finds them

// Hamburger icon (three horizontal bars) for the pause button.
function drawPauseIcon(scene, x, y, size) {
  const g = scene.add.graphics({ x, y }).setScrollFactor(0);
  g.lineStyle(3, BUTTON_ICON_COLOR, 1);
  const barWidth = size * 0.5;
  const spacing = size * 0.22;
  [-1, 0, 1].forEach((i) => {
    g.beginPath();
    g.moveTo(-barWidth / 2, i * spacing);
    g.lineTo(barWidth / 2, i * spacing);
    g.strokePath();
  });
  return g;
}

// "Spinny arrow" refresh icon (a partial ring + arrowhead) for the retry button.
function drawRetryIcon(scene, x, y, size) {
  const g = scene.add.graphics({ x, y }).setScrollFactor(0);
  const radius = size * 0.27;
  g.lineStyle(3, BUTTON_ICON_COLOR, 1);

  // ~260-degree arc, leaving a gap where the arrowhead sits so it reads as motion
  // rather than a closed circle.
  const startAngle = -Math.PI * 0.68;
  const endAngle = Math.PI * 0.58;
  g.beginPath();
  g.arc(0, 0, radius, startAngle, endAngle, false);
  g.strokePath();

  // Arrowhead at the end of the arc: the tip is pushed outward along the tangent
  // (past the arc's own radius) so it forms a proper point rather than sitting flush
  // with the ring, and the two back corners hug the arc so the head reads as a
  // continuation of the sweep instead of a bolted-on triangle.
  const tangent = endAngle + Math.PI / 2;
  const cos = Math.cos(tangent);
  const sin = Math.sin(tangent);
  const arcTipX = radius * Math.cos(endAngle);
  const arcTipY = radius * Math.sin(endAngle);
  const headLen = size * 0.24;
  const headWidth = size * 0.16;

  const tipX = arcTipX + headLen * 0.6 * cos;
  const tipY = arcTipY + headLen * 0.6 * sin;
  const backX = arcTipX - headLen * 0.4 * cos;
  const backY = arcTipY - headLen * 0.4 * sin;

  g.fillStyle(BUTTON_ICON_COLOR, 1);
  g.beginPath();
  g.moveTo(tipX, tipY);
  g.lineTo(backX - headWidth * sin, backY + headWidth * cos);
  g.lineTo(backX + headWidth * sin, backY - headWidth * cos);
  g.closePath();
  g.fillPath();
  return g;
}

export class Hud {
  constructor(scene, { hasTimer = false, hasEnemies = true } = {}) {
    this.scene = scene;

    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(100);

    // Only created for levels that actually have enemies -- a level with none has
    // nothing meaningful to count down, so this stays hidden entirely rather than
    // sitting there permanently reading "All enemies defeated". Sits a bit lower than
    // it used to (y: 56 instead of 40) so it never crowds the pause/retry buttons
    // above it, even though their x-ranges don't actually overlap.
    if (hasEnemies) {
      this.enemiesLeftText = scene.add.text(1180, 56, '', { fontSize: '16px', color: '#e24b4a' }).setOrigin(1, 0);
      this.container.add(this.enemiesLeftText);
    }

    // Only created when the level actually has a time limit -- levels without one
    // (the default) show no timer display at all.
    if (hasTimer) {
      this.timerText = scene.add.text(640, 16, '', { fontSize: '20px', color: '#ffffff' }).setOrigin(0.5, 0);
      this.container.add(this.timerText);
    }

    this.bulletTimeVignette = scene.add.rectangle(0, 0, 1280, 720, 0x3aa0ff, 0).setOrigin(0).setScrollFactor(0).setDepth(99);

    // --- top-right icon buttons ---
    const pauseBtnX = 1280 - BUTTON_MARGIN - BUTTON_SIZE / 2;
    const pauseBtnY = BUTTON_MARGIN + BUTTON_SIZE / 2;
    const retryBtnX = pauseBtnX - BUTTON_SIZE - BUTTON_GAP;
    const retryBtnY = pauseBtnY;

    // Tooltip is created before the buttons that reference it, but added to the
    // container LAST (below) so it renders on top of everything else in the HUD --
    // container child order is what controls stacking here, same as PauseMenu's
    // overlay/panel/buttons ordering.
    this.tooltipText = scene.add.text(0, 0, '', {
      fontSize: '13px',
      color: '#ffffff',
      backgroundColor: '#000000cc',
      padding: { x: 6, y: 4 },
    }).setOrigin(1, 0).setScrollFactor(0).setVisible(false);

    this.pauseButton = this.createIconButton(scene, pauseBtnX, pauseBtnY, drawPauseIcon, 'Press E to Pause', () => scene.togglePause());
    this.retryButton = this.createIconButton(scene, retryBtnX, retryBtnY, drawRetryIcon, 'Press R to Retry', () => scene.retryLevel());

    this.container.add(this.tooltipText);

    // Keeps the tooltip glued to the pointer while it's visible. Positioned to the
    // upper-left of the cursor (anchored via origin(1,0)) rather than the more usual
    // lower-right, since both buttons sit right at the top-right corner of the screen
    // -- anchoring rightward would constantly clip the tooltip off the edge of the
    // canvas.
    scene.input.on('pointermove', (pointer) => {
      if (this.tooltipText.visible) this.positionTooltip(pointer);
    });
  }

  // Builds one square icon button: an invisible rectangle (the actual interactive
  // hit area) plus a non-interactive icon drawn on top of it, which fades between
  // idle/hover alpha in place of the old background-box hover state. Both pieces
  // share the button's center (x, y) so the icon is automatically centered.
  createIconButton(scene, x, y, drawIcon, tooltipLabel, onClick) {
    // No visible background box anymore -- this rectangle is purely an invisible hit
    // area (alpha 0) so the button still has a comfortable click/hover target and the
    // hand cursor, without drawing a panel behind the icon.
    const bg = scene.add.rectangle(x, y, BUTTON_SIZE, BUTTON_SIZE, 0x000000, 0)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    const icon = drawIcon(scene, x, y, BUTTON_SIZE).setAlpha(BUTTON_ICON_ALPHA_IDLE);

    this.container.add(bg);
    this.container.add(icon);

    bg.on('pointerover', () => {
      icon.setAlpha(BUTTON_ICON_ALPHA_HOVER);
      this.showTooltip(tooltipLabel);
    });
    bg.on('pointerout', () => {
      icon.setAlpha(BUTTON_ICON_ALPHA_IDLE);
      this.hideTooltip();
    });
    bg.on('pointerdown', onClick);

    return { bg, icon };
  }

  showTooltip(label) {
    this.tooltipText.setText(label).setVisible(true);
    this.positionTooltip(this.scene.input.activePointer);
  }

  hideTooltip() {
    this.tooltipText.setVisible(false);
  }

  positionTooltip(pointer) {
    this.tooltipText.setPosition(pointer.x - 16, pointer.y + 18);
  }

  // Called once per frame from GameScene.update() with the current state it needs to
  // display. timeRemainingMs is null for levels with no time limit.
  update({ enemiesLeft, bulletTimeActive, timeRemainingMs }) {
    if (this.enemiesLeftText) {
      this.enemiesLeftText.setText(enemiesLeft === 0 ? 'All Enemies Defeated' : `Enemies left: ${enemiesLeft}`);
    }
    this.bulletTimeVignette.setFillStyle(0x3aa0ff, bulletTimeActive ? 0.08 : 0);

    if (this.timerText && timeRemainingMs !== null && timeRemainingMs !== undefined) {
      this.timerText.setText(formatTime(timeRemainingMs));
    }
  }
}