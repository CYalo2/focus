import { getBestTime, isLevelComplete } from "../save/SaveManager.js";
import { formatTime } from "../data/TimeUtils.js";
import { buildSettingsRows, SETTINGS_ROWS_BOTTOM_OFFSET } from "../save/SettingsPanel.js";
import { GAME_WIDTH, GAME_HEIGHT } from "../data/Constants.js";
import { crispStroke } from "./PixelRect.js";

const CX = GAME_WIDTH / 2;
const CY = GAME_HEIGHT / 2;

export async function showPauseMenu(scene) {
  const levelIndex = scene.levelIndex;

  let bestTimeMs = null;
  let completed = false;
  try {
    [bestTimeMs, completed] = await Promise.all([
      getBestTime(levelIndex),
      isLevelComplete(levelIndex),
    ]);
  } catch (err) {
    console.error(`Failed to load save data for level ${levelIndex}:`, err);
  }

  if (!scene.isPaused || !scene.scene.isActive()) return;

  buildPauseModal(scene, bestTimeMs, completed);
}

function buildPauseModal(scene, bestTimeMs, completed) {
  const SCREEN_CENTER_Y = CY;

  const TITLE_HALF_HEIGHT = 12;
  const GAP_TITLE_TO_BESTTIME = 28;
  const GAP_BESTTIME_TO_RESUME = 24;
  const BUTTON_SPACING = 24;
  const GAP_SETTINGS_TO_LEVEL_SELECT = 24;
  const LEVEL_SELECT_HALF_HEIGHT = 4;

  const blockHeight = TITLE_HALF_HEIGHT
    + GAP_TITLE_TO_BESTTIME
    + GAP_BESTTIME_TO_RESUME
    + BUTTON_SPACING
    + BUTTON_SPACING
    + GAP_SETTINGS_TO_LEVEL_SELECT
    + LEVEL_SELECT_HALF_HEIGHT;
  const blockTop = SCREEN_CENTER_Y - blockHeight / 2;
  const blockBottom = blockTop + blockHeight;

  const TITLE_Y = blockTop + TITLE_HALF_HEIGHT;
  const BEST_TIME_Y = TITLE_Y + GAP_TITLE_TO_BESTTIME;
  const resumeY = BEST_TIME_Y + GAP_BESTTIME_TO_RESUME;
  const restartY = resumeY + BUTTON_SPACING;
  const settingsY = restartY + BUTTON_SPACING;
  const levelSelectY = settingsY + GAP_SETTINGS_TO_LEVEL_SELECT;

  const PANEL_MARGIN = 18;
  const PANEL_WIDTH = 210;
  const panelTop = blockTop - PANEL_MARGIN;
  const panelBottom = blockBottom + PANEL_MARGIN;
  const panelHeight = panelBottom - panelTop;
  const panelCenterY = (panelTop + panelBottom) / 2;

  const overlay = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
    .setOrigin(0).setScrollFactor(0).setInteractive();

  const panel = scene.add.rectangle(CX, panelCenterY, PANEL_WIDTH, panelHeight, 0x1a1a22)
    .setScrollFactor(0).setStrokeStyle(1, 0x3aa0ff);
  crispStroke(panel);

  const title = scene.add.text(CX, TITLE_Y, "PAUSED", { fontSize: "24px", color: "#ffffff" })
    .setOrigin(0.5).setScrollFactor(0);

  const bestTimeLabel = completed ? `Best time: ${formatTime(bestTimeMs)}` : "Not completed yet";
  const bestTimeText = scene.add.text(CX, BEST_TIME_Y, bestTimeLabel, {
    fontSize: "8px",
    color: completed ? "#63c722" : "#888888"
  }).setOrigin(0.5).setScrollFactor(0);

  const resumeButton = scene.add.text(CX, resumeY, "[ RESUME ]", { fontSize: "16px", color: "#3aa0ff" })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  const restartButton = scene.add.text(CX, restartY, "[ RESTART ]", { fontSize: "16px", color: "#ffffff" })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  const settingsButton = scene.add.text(CX, settingsY, "[ SETTINGS ]", { fontSize: "16px", color: "#ffffff" })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  const levelSelectButton = scene.add.text(CX, levelSelectY, "back to level select", { fontSize: "8px", color: "#888888" })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  scene.pauseModalContainer = scene.add.container(0, 0, [
    overlay, panel, title, bestTimeText, resumeButton, restartButton, settingsButton,
    levelSelectButton
  ]);
  scene.pauseModalContainer.setDepth(1000);

  overlay.on("pointerdown", () => scene.resumeGame());
  resumeButton.on("pointerdown", () => scene.resumeGame());
  restartButton.on("pointerdown", () => {
    scene.resumeGame();
    scene.scene.restart({ levelIndex: scene.levelIndex });
  });
  settingsButton.on("pointerdown", () => openPauseSettings(scene));
  levelSelectButton.on("pointerdown", () => {
    scene.resumeGame();
    scene.scene.start("LevelSelectScene", { focusLevelIndex: scene.levelIndex });
  });

  resumeButton.on("pointerover", () => resumeButton.setColor("#ffffff"));
  resumeButton.on("pointerout", () => resumeButton.setColor("#3aa0ff"));
  restartButton.on("pointerover", () => restartButton.setColor("#3aa0ff"));
  restartButton.on("pointerout", () => restartButton.setColor("#ffffff"));
  settingsButton.on("pointerover", () => settingsButton.setColor("#3aa0ff"));
  settingsButton.on("pointerout", () => settingsButton.setColor("#ffffff"));
}

function openPauseSettings(scene) {
  if (scene.pauseSettingsModalContainer || scene.pauseSettingsModalOpening) return;

  scene.pauseSettingsModalOpening = true;
  showPauseSettingsModal(scene).catch((err) => console.error("Failed to show settings modal:", err));
}

async function showPauseSettingsModal(scene) {
  const TITLE_HALF_HEIGHT = 12;
  const GAP_TITLE_TO_ROWS_CENTER = 40;
  const CLOSE_GAP_AFTER_ROWS = 18;
  const CLOSE_HALF_HEIGHT = 4;

  const blockHeight = TITLE_HALF_HEIGHT
    + GAP_TITLE_TO_ROWS_CENTER
    + SETTINGS_ROWS_BOTTOM_OFFSET
    + CLOSE_GAP_AFTER_ROWS
    + CLOSE_HALF_HEIGHT;
  const blockTop = CY - blockHeight / 2;
  const blockBottom = blockTop + blockHeight;

  const titleY = blockTop + TITLE_HALF_HEIGHT;
  const rowsCenterY = titleY + GAP_TITLE_TO_ROWS_CENTER;
  const rowsBottomY = rowsCenterY + SETTINGS_ROWS_BOTTOM_OFFSET;
  const closeY = rowsBottomY + CLOSE_GAP_AFTER_ROWS;

  const PANEL_MARGIN = 18;
  const PANEL_WIDTH = 190;
  const panelTop = blockTop - PANEL_MARGIN;
  const panelBottom = blockBottom + PANEL_MARGIN;
  const panelHeight = panelBottom - panelTop;
  const panelCenterY = (panelTop + panelBottom) / 2;

  const overlay = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
    .setOrigin(0).setScrollFactor(0).setInteractive();

  const panel = scene.add.rectangle(CX, panelCenterY, PANEL_WIDTH, panelHeight, 0x1a1a22)
    .setScrollFactor(0).setStrokeStyle(1, 0x3aa0ff);
  crispStroke(panel).setInteractive();

  const title = scene.add.text(CX, titleY, "SETTINGS", { fontSize: "24px", color: "#ffffff" })
    .setOrigin(0.5).setScrollFactor(0);

  const settingsRows = await buildSettingsRows(scene, CX, rowsCenterY);

  if (!scene.pauseSettingsModalOpening || !scene.isPaused || !scene.scene.isActive()) {
    settingsRows.forEach((obj) => obj.destroy());
    overlay.destroy();
    panel.destroy();
    title.destroy();
    return;
  }

  const closeButton = scene.add.text(CX, closeY, "close", { fontSize: "8px", color: "#888888" })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  scene.pauseSettingsModalContainer = scene.add.container(0, 0, [
    overlay, panel, title, ...settingsRows, closeButton
  ]);

  scene.pauseSettingsModalContainer.setDepth(1001);

  const closeModal = () => {
    scene.pauseSettingsModalOpening = false;
    scene.pauseSettingsModalContainer.destroy();
    scene.pauseSettingsModalContainer = null;
  };

  overlay.on("pointerdown", closeModal);
  closeButton.on("pointerdown", closeModal);
  closeButton.on("pointerover", () => closeButton.setColor("#ffffff"));
  closeButton.on("pointerout", () => closeButton.setColor("#888888"));
}