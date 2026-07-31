import { getBestTime, isLevelComplete } from "../save/SaveManager.js";
import { formatTime } from "../data/TimeUtils.js";
import { getVolume, setVolume, isSdkMuted } from "../save/AudioManager.js";

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

  const panel = scene.add.rectangle(640, 360, 420, 460, 0x1a1a22)
    .setScrollFactor(0).setStrokeStyle(2, 0x3aa0ff);

  const title = scene.add.text(640, 210, "PAUSED", { fontSize: "32px", color: "#ffffff" })
    .setOrigin(0.5).setScrollFactor(0);

  const bestTimeLabel = completed ? `Best time: ${formatTime(bestTimeMs)}` : "Not completed yet";
  const bestTimeText = scene.add.text(640, 265, bestTimeLabel, {
    fontSize: "18px",
    color: completed ? "#63c722" : "#888888"
  }).setOrigin(0.5).setScrollFactor(0);

  // Volume row: a plain -/+ pair rather than a drag slider, since this scene has no
  // pointer-drag plumbing set up anywhere else and this matches the rest of the
  // pause menu's plain-text-button style. Steps in fixed 10% increments.
  const VOLUME_STEP = 0.1;

  const volumeLabelBase = "MUSIC VOLUME";
  const volumeLabel = scene.add.text(
    640, 320,
    isSdkMuted() ? `${volumeLabelBase} (muted by host)` : volumeLabelBase,
    { fontSize: "14px", color: "#888888" }
  ).setOrigin(0.5).setScrollFactor(0);

  const volumeDown = scene.add.text(560, 355, "-", { fontSize: "28px", color: "#3aa0ff" })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  const volumeText = scene.add.text(640, 355, `${Math.round(getVolume() * 100)}%`, {
    fontSize: "20px", color: "#ffffff"
  }).setOrigin(0.5).setScrollFactor(0);

  const volumeUp = scene.add.text(720, 355, "+", { fontSize: "28px", color: "#3aa0ff" })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  const resumeButton = scene.add.text(640, 410, "[ RESUME ]", { fontSize: "24px", color: "#3aa0ff" })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  const restartButton = scene.add.text(640, 460, "[ RESTART ]", { fontSize: "24px", color: "#ffffff" })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  const levelSelectButton = scene.add.text(640, 510, "back to level select", { fontSize: "16px", color: "#888888" })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  scene.pauseModalContainer = scene.add.container(0, 0, [
    overlay, panel, title, bestTimeText,
    volumeLabel, volumeDown, volumeText, volumeUp,
    resumeButton, restartButton, levelSelectButton
  ]);
  // Above literally everything else in the scene -- platforms/enemies/bullets/player
  // (depth 0-6), the HUD and its bullet-time vignette (depth 99-100), and the win/lose
  // end screen (depth 200-201) -- so pausing mid-action actually darkens and covers
  // enemies, in-flight projectiles, and the HUD, not just the level geometry behind
  // them. The end screen and this modal never appear at the same time in practice
  // (gameEnded blocks pausing, and pausing blocks the checks that trigger an end
  // screen), but this stays above it regardless in case that ever changes.
  scene.pauseModalContainer.setDepth(1000);

  // Still saved (and shown) even while isSdkMuted() is true -- the player's choice
  // takes effect the moment the host unmutes, since it's the SDK's own mute (not
  // this stored volume) that's actually silencing playback right now.
  volumeDown.on("pointerdown", async () => {
    const newVolume = await setVolume(getVolume() - VOLUME_STEP);
    volumeText.setText(`${Math.round(newVolume * 100)}%`);
  });
  volumeUp.on("pointerdown", async () => {
    const newVolume = await setVolume(getVolume() + VOLUME_STEP);
    volumeText.setText(`${Math.round(newVolume * 100)}%`);
  });
  volumeDown.on("pointerover", () => volumeDown.setColor("#ffffff"));
  volumeDown.on("pointerout", () => volumeDown.setColor("#3aa0ff"));
  volumeUp.on("pointerover", () => volumeUp.setColor("#ffffff"));
  volumeUp.on("pointerout", () => volumeUp.setColor("#3aa0ff"));

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