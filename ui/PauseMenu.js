import { getBestTime, isLevelComplete } from "../save/SaveManager.js";
import { formatTime } from "../data/TimeUtils.js";
import { buildSettingsRows, SETTINGS_ROWS_TOP_OFFSET, SETTINGS_ROWS_BOTTOM_OFFSET } from "../save/SettingsPanel.js";

// Pause overlay: title, resume/restart/level-select buttons, and the level's best time
// (if it's ever been completed). Fetching the best time is async, so this can't build
// the modal synchronously the moment ESC is pressed -- see the guard below.
export async function showPauseMenu(scene) {
  const levelIndex = scene.levelIndex;

  // Mirrors LevelSelectScene.openLevelDetails: a level with no save record yet has
  // nothing to look up, and getBestTime/isLevelComplete can reject for that -- fall
  // back to "not completed" rather than letting Promise.all reject the whole thing.
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

  // The player may have already resumed (or left the scene entirely) while that
  // lookup was in flight -- don't pop up a stale pause modal on top of live gameplay.
  if (!scene.isPaused || !scene.scene.isActive()) return;

  await buildPauseModal(scene, bestTimeMs, completed);
}

async function buildPauseModal(scene, bestTimeMs, completed) {
  // --- layout ---
  // Screen is a fixed 1280x720 canvas here (see the overlay rectangle below), so its
  // center is a constant rather than something read off scene.scale like
  // LevelSelectScene's responsive modal does.
  const SCREEN_CENTER_Y = 360;

  // Rather than anchoring the title to a fixed Y (which only looked centered for
  // however many settings rows existed when that number was last tuned), the whole
  // content block -- title through the level-select link -- is measured first via
  // these gaps and half-heights, then centered as a unit on SCREEN_CENTER_Y. Add a
  // row in SettingsPanel.js and the block grows, but it grows evenly around the same
  // vertical center instead of drifting downward off it.
  //
  // Order top-to-bottom: title, best time, RESUME, RESTART, settings rows, then the
  // level-select link -- resume/restart sit right under the best-time readout so
  // they're the first things you can act on, ahead of the settings block.
  const TITLE_HALF_HEIGHT = 16;   // 32px title font
  const GAP_TITLE_TO_BESTTIME = 55;
  const GAP_BESTTIME_TO_RESUME = 45;
  const BUTTON_SPACING = 50;      // resume -> restart
  const RESTART_HALF_HEIGHT = 12; // 24px "[ RESTART ]" font
  const GAP_RESTART_TO_ROWS = 30; // visual gap between restart's bottom edge and the rows' top edge
  const GAP_ROWS_TO_LEVEL_SELECT = 35;
  const LEVEL_SELECT_HALF_HEIGHT = 8; // 16px "back to level select" font

  // Distance from restartY (its own center) to the settings rows' center -- folds in
  // restart's own half-height, the visual gap above the rows, and the rows' own top
  // offset (SETTINGS_ROWS_TOP_OFFSET, negative) so the actual gap stays constant no
  // matter how that top offset shifts if a row is ever added/removed/reflowed.
  const GAP_RESTART_TO_ROWS_CENTER = RESTART_HALF_HEIGHT + GAP_RESTART_TO_ROWS - SETTINGS_ROWS_TOP_OFFSET;

  const blockHeight = TITLE_HALF_HEIGHT
    + GAP_TITLE_TO_BESTTIME
    + GAP_BESTTIME_TO_RESUME
    + BUTTON_SPACING
    + GAP_RESTART_TO_ROWS_CENTER
    + SETTINGS_ROWS_BOTTOM_OFFSET
    + GAP_ROWS_TO_LEVEL_SELECT
    + LEVEL_SELECT_HALF_HEIGHT;
  const blockTop = SCREEN_CENTER_Y - blockHeight / 2;
  const blockBottom = blockTop + blockHeight;

  const TITLE_Y = blockTop + TITLE_HALF_HEIGHT;
  const BEST_TIME_Y = TITLE_Y + GAP_TITLE_TO_BESTTIME;
  const resumeY = BEST_TIME_Y + GAP_BESTTIME_TO_RESUME;
  const restartY = resumeY + BUTTON_SPACING;

  // Settings rows sit relative to the BOTTOM of restart (rather than a fixed y) via
  // GAP_RESTART_TO_ROWS_CENTER, and the level-select link relative to the BOTTOM of
  // the rows via SETTINGS_ROWS_BOTTOM_OFFSET -- so adding/removing a row in
  // SettingsPanel.js pushes the link down/up automatically instead of the row block
  // silently overlapping (or leaving a gap above) it.
  const ROWS_CENTER_Y = restartY + GAP_RESTART_TO_ROWS_CENTER;
  const rowsBottomY = ROWS_CENTER_Y + SETTINGS_ROWS_BOTTOM_OFFSET;
  const levelSelectY = rowsBottomY + GAP_ROWS_TO_LEVEL_SELECT;

  // Panel wraps the content block with an equal margin on both top and bottom, so
  // it's centered on SCREEN_CENTER_Y right along with the content it wraps --
  // asymmetric margins here would push the panel (though not the content inside it)
  // visibly off-center.
  const PANEL_MARGIN = 35;
  const PANEL_WIDTH = 420;
  const panelTop = blockTop - PANEL_MARGIN;
  const panelBottom = blockBottom + PANEL_MARGIN;
  const panelHeight = panelBottom - panelTop;
  const panelCenterY = (panelTop + panelBottom) / 2;

  // Once these are added to a Container below, each one's own .setDepth() only
  // controls its stacking *within that container* -- it stops mattering at all for
  // where the container (and everything inside it) sits relative to the rest of the
  // scene. That's controlled by the container's OWN depth, set once below. Array order
  // here still gives the pieces their correct order relative to each other (overlay
  // at the back, buttons at the front), so no per-child setDepth is needed at all.
  const overlay = scene.add.rectangle(0, 0, 1280, 720, 0x000000, 0.7)
    .setOrigin(0).setScrollFactor(0).setInteractive();

  const panel = scene.add.rectangle(640, panelCenterY, PANEL_WIDTH, panelHeight, 0x1a1a22)
    .setScrollFactor(0).setStrokeStyle(2, 0x3aa0ff);

  const title = scene.add.text(640, TITLE_Y, "PAUSED", { fontSize: "32px", color: "#ffffff" })
    .setOrigin(0.5).setScrollFactor(0);

  const bestTimeLabel = completed ? `Best time: ${formatTime(bestTimeMs)}` : "Not completed yet";
  const bestTimeText = scene.add.text(640, BEST_TIME_Y, bestTimeLabel, {
    fontSize: "18px",
    color: completed ? "#63c722" : "#888888"
  }).setOrigin(0.5).setScrollFactor(0);

  const resumeButton = scene.add.text(640, resumeY, "[ RESUME ]", { fontSize: "24px", color: "#3aa0ff" })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  const restartButton = scene.add.text(640, restartY, "[ RESTART ]", { fontSize: "24px", color: "#ffffff" })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  // Volume + autoaim + challenge mode rows: shared with LevelSelectScene's settings
  // modal (see SettingsPanel.js) so both screens' settings stay in lockstep instead
  // of being maintained as two separate copies. Async, same as the
  // getBestTime/isLevelComplete read above -- so re-check the "still relevant" guard
  // again once it resolves, since this is a second window where the player could
  // have resumed/left.
  const settingsRows = await buildSettingsRows(scene, 640, ROWS_CENTER_Y);

  if (!scene.isPaused || !scene.scene.isActive()) {
    // Modal is no longer wanted -- tear down what buildSettingsRows already created
    // rather than leaving orphaned, still-interactive text objects in the scene.
    settingsRows.forEach((obj) => obj.destroy());
    return;
  }

  const levelSelectButton = scene.add.text(640, levelSelectY, "back to level select", { fontSize: "16px", color: "#888888" })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  scene.pauseModalContainer = scene.add.container(0, 0, [
    overlay, panel, title, bestTimeText, resumeButton, restartButton,
    ...settingsRows,
    levelSelectButton
  ]);
  // Above literally everything else in the scene -- platforms/enemies/bullets/player
  // (depth 0-6), the HUD and its bullet-time vignette (depth 99-100), and the win/lose
  // end screen (depth 200-201) -- so pausing mid-action actually darkens and covers
  // enemies, in-flight projectiles, and the HUD, not just the level geometry behind
  // them. The end screen and this modal never appear at the same time in practice
  // (gameEnded blocks pausing, and pausing blocks the checks that trigger an end
  // screen), but this stays above it regardless in case that ever changes.
  scene.pauseModalContainer.setDepth(1000);

  overlay.on("pointerdown", () => scene.resumeGame());
  resumeButton.on("pointerdown", () => scene.resumeGame());
  // resumeGame() first, not just scene.restart()/start() -- it's what clears
  // this.time.paused (among other pause state). Skipping it would leave this.time
  // paused, and unlike physics.world/tweens, this.time survives into the next scene
  // instance (see the comment in GameScene.loseLevel()) -- so every delayedCall the
  // new level schedules afterward (hit-flash clears, platform damage-flash clears)
  // would never fire, leaving flashes stuck on permanently.
  restartButton.on("pointerdown", () => {
    scene.resumeGame();
    scene.scene.restart({ levelIndex: scene.levelIndex });
  });
  levelSelectButton.on("pointerdown", () => {
    scene.resumeGame();
    scene.scene.start("LevelSelectScene", { focusLevelIndex: scene.levelIndex });
  });

  resumeButton.on("pointerover", () => resumeButton.setColor("#ffffff"));
  resumeButton.on("pointerout", () => resumeButton.setColor("#3aa0ff"));
  restartButton.on("pointerover", () => restartButton.setColor("#3aa0ff"));
  restartButton.on("pointerout", () => restartButton.setColor("#ffffff"));
}