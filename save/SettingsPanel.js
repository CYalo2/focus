import { getVolume, setVolume, isSdkMuted } from "./AudioManager.js";
import { getAutoAim, setAutoAim, getChallengeMode, setChallengeMode } from "./SaveManager.js";

// --- row layout, relative to the centerY passed to buildSettingsRows() ----------
// Single source of truth for where each row sits, so adding/removing/reflowing a
// row here can't quietly drift out of sync with the exported bounds below it.
const VOLUME_LABEL_Y = -35;
const VOLUME_ROW_Y = 0;
const AUTOAIM_LABEL_Y = 45;
const AUTOAIM_TOGGLE_Y = 75;
const CHALLENGE_LABEL_Y = 120;
const CHALLENGE_TOGGLE_Y = 150;

// Rough half-heights (fontSize / 2, roughly) used only to pad the offsets above out
// to each row's actual visual top/bottom edge for the exported bounds below, rather
// than just its text-origin center.
const LABEL_FONT_HALF = 7;          // 14px labels (MUSIC VOLUME / AUTOAIM / CHALLENGE MODE)
const TOGGLE_FONT_HALF = 10;        // 20px volume value / autoaim / challenge toggles

// Public bounds of the whole row block, relative to the same centerY a caller passes
// into buildSettingsRows(). PauseMenu and LevelSelectScene use these to size their
// modal panel and position whatever they place below the rows (buttons, a close
// link) so there's always enough room for every row -- instead of hardcoding a pixel
// offset that was only ever correct for however many rows existed at the time it was
// written. Whenever a row is added, removed, or moved above, these three update
// automatically since they're derived from the same offsets, not restated.
export const SETTINGS_ROWS_TOP_OFFSET = VOLUME_LABEL_Y - LABEL_FONT_HALF;
export const SETTINGS_ROWS_BOTTOM_OFFSET = CHALLENGE_TOGGLE_Y + TOGGLE_FONT_HALF;
export const SETTINGS_ROWS_HEIGHT = SETTINGS_ROWS_BOTTOM_OFFSET - SETTINGS_ROWS_TOP_OFFSET;

// Builds the "MUSIC VOLUME", "AUTOAIM", and "CHALLENGE MODE" rows shared by
// PauseMenu's pause modal and LevelSelectScene's settings modal. Both screens show
// the exact same settings, so the row layout, labels, and click behavior live here
// once -- change a setting's UI or behavior in this file and both modals pick it up,
// instead of maintaining two copies that can quietly drift apart.
//
// Async because autoAim/challengeMode's current values have to be read from storage
// before their toggles can be drawn (mirrors why PauseMenu.showPauseMenu itself is
// async). Callers must await this BEFORE building the rest of their modal, and --
// because an await is a window where the player could resume/navigate away --
// re-check their own "is this modal still wanted" guard immediately after, same as
// they already do around their other async reads. See PauseMenu.buildPauseModal and
// LevelSelectScene.showSettingsModal for that pattern.
//
// centerX/centerY position the whole row block -- see SETTINGS_ROWS_TOP_OFFSET /
// SETTINGS_ROWS_BOTTOM_OFFSET / SETTINGS_ROWS_HEIGHT above for how far it actually
// extends from that point, which callers need for layout since it's taller than any
// single row. Returns the created display objects in back-to-front order, ready to
// spread into a container alongside the caller's own overlay/panel/title/buttons.
export async function buildSettingsRows(scene, centerX, centerY) {
  const VOLUME_STEP = 0.1;

  let autoAimEnabled = false;
  try {
    autoAimEnabled = await getAutoAim();
  } catch (err) {
    console.error("Failed to load autoaim setting:", err);
  }

  // Defaults to true (not false, unlike autoaim above) so a fresh save -- or a
  // failed read -- starts the player in challenge mode rather than quietly out of it.
  let challengeModeEnabled = true;
  try {
    challengeModeEnabled = await getChallengeMode();
  } catch (err) {
    console.error("Failed to load challenge mode setting:", err);
  }

  const volumeLabelBase = "MUSIC VOLUME";
  const volumeLabel = scene.add.text(
    centerX, centerY + VOLUME_LABEL_Y,
    isSdkMuted() ? `${volumeLabelBase} (muted by host)` : volumeLabelBase,
    { fontSize: "14px", color: "#888888" }
  ).setOrigin(0.5).setScrollFactor(0);

  // Greyed out (but not disabled -- see the pointerdown handlers below) while the
  // SDK has forced mute: soundManager.mute overrides actual playback either way, so
  // clicking these wouldn't audibly do anything right now. Greying them out signals
  // that without blocking the player from still adjusting -- and saving -- their
  // preferred volume for whenever the host unmutes.
  const volumeDown = scene.add.text(centerX - 80, centerY + VOLUME_ROW_Y, "-", { fontSize: "28px", color: isSdkMuted() ? "#555555" : "#3aa0ff" })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  const volumeText = scene.add.text(centerX, centerY + VOLUME_ROW_Y, `${Math.round(getVolume() * 100)}%`, {
    fontSize: "20px", color: "#ffffff"
  }).setOrigin(0.5).setScrollFactor(0);

  const volumeUp = scene.add.text(centerX + 80, centerY + VOLUME_ROW_Y, "+", { fontSize: "28px", color: isSdkMuted() ? "#555555" : "#3aa0ff" })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  // Autoaim toggle. Purely a stored on/off preference for now -- nothing reads it
  // during gameplay yet -- this row just persists the choice via setAutoAim, the
  // same way the volume buttons persist via setVolume.
  const autoAimLabel = scene.add.text(centerX, centerY + AUTOAIM_LABEL_Y, "AUTOAIM", {
    fontSize: "14px", color: "#888888"
  }).setOrigin(0.5).setScrollFactor(0);

  const autoAimToggle = scene.add.text(centerX, centerY + AUTOAIM_TOGGLE_Y, autoAimEnabled ? "[ ON ]" : "[ OFF ]", {
    fontSize: "20px", color: autoAimEnabled ? "#63c722" : "#ffffff"
  }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  // Challenge mode toggle. Read by GameScene at level start to decide whether a
  // level uses its challengeTimeMs field instead of its regular timeLimitMs (and to
  // color the HUD/preview timer red) -- same persisted-via-storage pattern as
  // autoaim above, just via setChallengeMode/getChallengeMode instead.
  const challengeModeLabel = scene.add.text(centerX, centerY + CHALLENGE_LABEL_Y, "CHALLENGE MODE", {
    fontSize: "14px", color: "#888888"
  }).setOrigin(0.5).setScrollFactor(0);

  const challengeModeToggle = scene.add.text(centerX, centerY + CHALLENGE_TOGGLE_Y, challengeModeEnabled ? "[ ON ]" : "[ OFF ]", {
    fontSize: "20px", color: challengeModeEnabled ? "#63c722" : "#ffffff"
  }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

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
  volumeDown.on("pointerout", () => volumeDown.setColor(isSdkMuted() ? "#555555" : "#3aa0ff"));
  volumeUp.on("pointerover", () => volumeUp.setColor("#ffffff"));
  volumeUp.on("pointerout", () => volumeUp.setColor(isSdkMuted() ? "#555555" : "#3aa0ff"));

  autoAimToggle.on("pointerdown", async () => {
    autoAimEnabled = !autoAimEnabled;
    autoAimToggle.setText(autoAimEnabled ? "[ ON ]" : "[ OFF ]");
    autoAimToggle.setColor(autoAimEnabled ? "#63c722" : "#ffffff");
    await setAutoAim(autoAimEnabled);
  });
  autoAimToggle.on("pointerover", () => autoAimToggle.setColor("#ffffff"));
  autoAimToggle.on("pointerout", () => autoAimToggle.setColor(autoAimEnabled ? "#63c722" : "#ffffff"));

  challengeModeToggle.on("pointerdown", async () => {
    challengeModeEnabled = !challengeModeEnabled;
    challengeModeToggle.setText(challengeModeEnabled ? "[ ON ]" : "[ OFF ]");
    challengeModeToggle.setColor(challengeModeEnabled ? "#63c722" : "#ffffff");
    await setChallengeMode(challengeModeEnabled);
  });
  challengeModeToggle.on("pointerover", () => challengeModeToggle.setColor("#ffffff"));
  challengeModeToggle.on("pointerout", () => challengeModeToggle.setColor(challengeModeEnabled ? "#63c722" : "#ffffff"));

  return [
    volumeLabel, volumeDown, volumeText, volumeUp,
    autoAimLabel, autoAimToggle,
    challengeModeLabel, challengeModeToggle,
  ];
}