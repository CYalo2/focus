import { formatTime } from "../data/TimeUtils.js";
import { GAME_WIDTH, GAME_HEIGHT } from "../data/Constants.js";
import { crispStroke } from "./PixelRect.js";
import { pointerToGame } from "./DisplayScale.js";
import { isChargeVignetteEnabled } from "../save/SaveManager.js";

const BUTTON_SIZE = 20;
const BUTTON_MARGIN = 8;
const BUTTON_GAP = 6;
const BUTTON_ICON_COLOR = 0xffffff;
const BUTTON_ICON_ALPHA_IDLE = 0.5;
const BUTTON_ICON_ALPHA_HOVER = 1;

const TIMER_COLOR_NORMAL = "#ffffff";
const TIMER_COLOR_CHALLENGE = "#ff9999";

const TIMER_BG_COLOR = 0x000000;
const TIMER_BG_ALPHA = 0.55;
const TIMER_BORDER_COLOR = 0x3aa0ff;
const TIMER_BORDER_WIDTH = 1;
const TIMER_PADDING_X = 7;
const TIMER_PADDING_Y = 3;

const CHARGE_VIGNETTE_FADE_MS = 150;

function drawPauseIcon(scene, x, y, size) {
  const g = scene.add.graphics({ x, y }).setScrollFactor(0);
  g.lineStyle(2, BUTTON_ICON_COLOR, 1);
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

const RETRY_ICON_RECTS = [
  [-5, -4, 7, 2],  // top bar
  [-5, -2, 2, 8],  // left side
  [-3, 4, 8, 2],   // bottom bar
  [3, 2, 2, 2],    // right side
  [2, -6, 1, 6],   // arrowhead, widest column
  [3, -5, 1, 4],
  [4, -4, 1, 2],   // arrowhead tip
];

function drawRetryIcon(scene, x, y) {
  const g = scene.add.graphics({ x, y }).setScrollFactor(0);
  g.fillStyle(BUTTON_ICON_COLOR, 1);
  RETRY_ICON_RECTS.forEach(([rx, ry, rw, rh]) => g.fillRect(rx, ry, rw, rh));
  return g;
}

export class Hud {
  constructor(scene, { hasTimer = false, challengeMode = false, hasEnemies = true, showControlButtons = true } = {}) {
    this.scene = scene;

    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(100);

    if (hasEnemies) {
      this.enemiesLeftText = scene.add.text(GAME_WIDTH - 20, 32, '', { fontSize: '8px', color: '#e24b4a' }).setOrigin(1, 0);
      this.container.add(this.enemiesLeftText);
    }

    if (hasTimer) {
      this.timerText = scene.add.text(GAME_WIDTH / 2, 8 + TIMER_PADDING_Y, '', {
        fontSize: '16px',
        color: challengeMode ? TIMER_COLOR_CHALLENGE : TIMER_COLOR_NORMAL
      }).setOrigin(0.5, 0);

      this.timerBg = scene.add.rectangle(
        GAME_WIDTH / 2, 8 + TIMER_PADDING_Y + this.timerText.height / 2,
        this.timerText.width + TIMER_PADDING_X * 2,
        this.timerText.height + TIMER_PADDING_Y * 2,
        TIMER_BG_COLOR, TIMER_BG_ALPHA
      ).setStrokeStyle(TIMER_BORDER_WIDTH, TIMER_BORDER_COLOR).setScrollFactor(0);
      crispStroke(this.timerBg);

      this.container.add(this.timerBg);
      this.container.add(this.timerText);
    }

    this.bulletTimeVignette = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x3aa0ff, 0).setOrigin(0).setScrollFactor(0).setDepth(99);
    this.chargeVignette = scene.add.image(0, 0, 'chargeVignette').setOrigin(0).setScrollFactor(0).setDepth(98).setAlpha(0);
    this.chargeVignetteDisplayAlpha = 0;

    if (showControlButtons) {
      const pauseBtnX = GAME_WIDTH - BUTTON_MARGIN - BUTTON_SIZE / 2;
      const pauseBtnY = BUTTON_MARGIN + BUTTON_SIZE / 2;
      const retryBtnX = pauseBtnX - BUTTON_SIZE - BUTTON_GAP;
      const retryBtnY = pauseBtnY;

      this.tooltipText = scene.add.text(0, 0, '', {
        fontSize: '8px',
        color: '#ffffff',
        backgroundColor: '#000000cc',
        padding: { x: 3, y: 2 },
      }).setOrigin(1, 0).setScrollFactor(0).setVisible(false);

      this.pauseButton = this.createIconButton(scene, pauseBtnX, pauseBtnY, drawPauseIcon, 'Press E to Pause', () => scene.togglePause());
      this.retryButton = this.createIconButton(scene, retryBtnX, retryBtnY, drawRetryIcon, 'Press R to Retry', () => scene.retryLevel());

      this.container.add(this.tooltipText);

      scene.input.on('pointermove', (pointer) => {
        if (this.tooltipText.visible) this.positionTooltip(pointer);
      });
    }
  }

  createIconButton(scene, x, y, drawIcon, tooltipLabel, onClick) {
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
    const p = pointerToGame(pointer);
    this.tooltipText.setPosition(p.x - 8, p.y + 9);
  }

  update({ enemiesLeft, bulletTimeActive, timeRemainingMs, chargeRatio = 0, delta = 16.7 }) {
    if (this.enemiesLeftText) {
      this.enemiesLeftText.setText(enemiesLeft === 0 ? 'All Enemies Defeated' : `Enemies left: ${enemiesLeft}`);
    }
    this.bulletTimeVignette.setFillStyle(0x3aa0ff, bulletTimeActive ? 0.08 : 0);

    const targetChargeAlpha = isChargeVignetteEnabled() ? Phaser.Math.Clamp(chargeRatio, 0, 1) : 0;
    if (targetChargeAlpha >= this.chargeVignetteDisplayAlpha) {
      this.chargeVignetteDisplayAlpha = targetChargeAlpha;
    } else {
      const fadeStep = delta / CHARGE_VIGNETTE_FADE_MS;
      this.chargeVignetteDisplayAlpha = Math.max(targetChargeAlpha, this.chargeVignetteDisplayAlpha - fadeStep);
    }
    this.chargeVignette.setAlpha(this.chargeVignetteDisplayAlpha);

    if (this.timerText && timeRemainingMs !== null && timeRemainingMs !== undefined) {
      this.timerText.setText(formatTime(timeRemainingMs));
      this.timerBg.setSize(
        this.timerText.width + TIMER_PADDING_X * 2,
        this.timerText.height + TIMER_PADDING_Y * 2
      );
      crispStroke(this.timerBg);
    }
  }
}