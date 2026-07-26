import { getBestTime, isLevelComplete } from "../save/SaveManager.js";
import { formatTime } from "../data/TimeUtils.js";

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

  buildPauseModal(scene, bestTimeMs, completed);
}

function buildPauseModal(scene, bestTimeMs, completed) {
  // Once these are added to a Container below, each one's own .setDepth() only
  // controls its stacking *within that container* -- it stops mattering at all for
  // where the container (and everything inside it) sits relative to the rest of the
  // scene. That's controlled by the container's OWN depth, set once below. Array order
  // here still gives the pieces their correct order relative to each other (overlay
  // at the back, buttons at the front), so no per-child setDepth is needed at all.
  const overlay = scene.add.rectangle(0, 0, 1280, 720, 0x000000, 0.7)
    .setOrigin(0).setScrollFactor(0).setInteractive();

  const panel = scene.add.rectangle(640, 360, 420, 380, 0x1a1a22)
    .setScrollFactor(0).setStrokeStyle(2, 0x3aa0ff);

  const title = scene.add.text(640, 240, "PAUSED", { fontSize: "32px", color: "#ffffff" })
    .setOrigin(0.5).setScrollFactor(0);

  const bestTimeLabel = completed ? `Best time: ${formatTime(bestTimeMs)}` : "Not completed yet";
  const bestTimeText = scene.add.text(640, 300, bestTimeLabel, {
    fontSize: "18px",
    color: completed ? "#63c722" : "#888888"
  }).setOrigin(0.5).setScrollFactor(0);

  const resumeButton = scene.add.text(640, 380, "[ RESUME ]", { fontSize: "24px", color: "#3aa0ff" })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  const restartButton = scene.add.text(640, 430, "[ RESTART ]", { fontSize: "24px", color: "#ffffff" })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  const levelSelectButton = scene.add.text(640, 480, "back to level select", { fontSize: "16px", color: "#888888" })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  scene.pauseModalContainer = scene.add.container(0, 0, [
    overlay, panel, title, bestTimeText, resumeButton, restartButton, levelSelectButton
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
    scene.scene.start("LevelSelectScene");
  });

  resumeButton.on("pointerover", () => resumeButton.setColor("#ffffff"));
  resumeButton.on("pointerout", () => resumeButton.setColor("#3aa0ff"));
  restartButton.on("pointerover", () => restartButton.setColor("#3aa0ff"));
  restartButton.on("pointerout", () => restartButton.setColor("#ffffff"));
}