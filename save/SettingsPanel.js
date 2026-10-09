import { getVolume, setVolume, isSdkMuted } from "./AudioManager.js";
import { getAutoAim, setAutoAim, getChallengeMode, setChallengeMode, getChargeVignetteEnabled, setChargeVignetteEnabled } from "./SaveManager.js";

// Text sizes stay on multiples of 8
const L = {
  VOLUME_LABEL_Y: -18, VOLUME_ROW_Y: 0, AUTOAIM_LABEL_Y: 24, AUTOAIM_TOGGLE_Y: 40,
  CHALLENGE_LABEL_Y: 64, CHALLENGE_TOGGLE_Y: 80, CHARGE_VIGNETTE_LABEL_Y: 104, CHARGE_VIGNETTE_TOGGLE_Y: 120,
  LABEL_FONT_HALF: 4, TOGGLE_FONT_HALF: 8, STEP_X: 40,
  LABEL_FONT: "8px", BUTTON_FONT: "16px", VALUE_FONT: "16px",
};

export const SETTINGS_ROWS_TOP_OFFSET = L.VOLUME_LABEL_Y - L.LABEL_FONT_HALF;
export const SETTINGS_ROWS_BOTTOM_OFFSET = L.CHARGE_VIGNETTE_TOGGLE_Y + L.TOGGLE_FONT_HALF;
export const SETTINGS_ROWS_HEIGHT = SETTINGS_ROWS_BOTTOM_OFFSET - SETTINGS_ROWS_TOP_OFFSET;

export async function buildSettingsRows(scene, centerX, centerY) {
  const VOLUME_STEP = 0.1;

  let autoAimEnabled = false;
  try {
    autoAimEnabled = await getAutoAim();
  } catch (err) {
    console.error("Failed to load autoaim setting:", err);
  }

  let challengeModeEnabled = false;
  try {
    challengeModeEnabled = await getChallengeMode();
  } catch (err) {
    console.error("Failed to load challenge mode setting:", err);
  }

  let chargeVignetteEnabled = true;
  try {
    chargeVignetteEnabled = await getChargeVignetteEnabled();
  } catch (err) {
    console.error("Failed to load charge vignette setting:", err);
  }

  const volumeLabelBase = "MUSIC VOLUME";
  const volumeLabel = scene.add.text(
    centerX, centerY + L.VOLUME_LABEL_Y,
    isSdkMuted() ? `${volumeLabelBase} (muted by host)` : volumeLabelBase,
    { fontSize: L.LABEL_FONT, color: "#888888" }
  ).setOrigin(0.5).setScrollFactor(0);

  const volumeDown = scene.add.text(centerX - L.STEP_X, centerY + L.VOLUME_ROW_Y, "-", { fontSize: L.BUTTON_FONT, color: isSdkMuted() ? "#555555" : "#3aa0ff" })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  const volumeText = scene.add.text(centerX, centerY + L.VOLUME_ROW_Y, `${Math.round(getVolume() * 100)}%`, {
    fontSize: L.VALUE_FONT, color: "#ffffff"
  }).setOrigin(0.5).setScrollFactor(0);

  const volumeUp = scene.add.text(centerX + L.STEP_X, centerY + L.VOLUME_ROW_Y, "+", { fontSize: L.BUTTON_FONT, color: isSdkMuted() ? "#555555" : "#3aa0ff" })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  const autoAimLabel = scene.add.text(centerX, centerY + L.AUTOAIM_LABEL_Y, "AUTOAIM", {
    fontSize: L.LABEL_FONT, color: "#888888"
  }).setOrigin(0.5).setScrollFactor(0);

  const autoAimToggle = scene.add.text(centerX, centerY + L.AUTOAIM_TOGGLE_Y, autoAimEnabled ? "[ ON ]" : "[ OFF ]", {
    fontSize: L.VALUE_FONT, color: autoAimEnabled ? "#63c722" : "#ffffff"
  }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  const challengeModeLabel = scene.add.text(centerX, centerY + L.CHALLENGE_LABEL_Y, "CHALLENGE MODE", {
    fontSize: L.LABEL_FONT, color: "#888888"
  }).setOrigin(0.5).setScrollFactor(0);

  const challengeModeToggle = scene.add.text(centerX, centerY + L.CHALLENGE_TOGGLE_Y, challengeModeEnabled ? "[ ON ]" : "[ OFF ]", {
    fontSize: L.VALUE_FONT, color: challengeModeEnabled ? "#63c722" : "#ffffff"
  }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

  const chargeVignetteLabel = scene.add.text(centerX, centerY + L.CHARGE_VIGNETTE_LABEL_Y, "CHARGE SCREEN GLOW", {
    fontSize: L.LABEL_FONT, color: "#888888"
  }).setOrigin(0.5).setScrollFactor(0);

  const chargeVignetteToggle = scene.add.text(centerX, centerY + L.CHARGE_VIGNETTE_TOGGLE_Y, chargeVignetteEnabled ? "[ ON ]" : "[ OFF ]", {
    fontSize: L.VALUE_FONT, color: chargeVignetteEnabled ? "#63c722" : "#ffffff"
  }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

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

  chargeVignetteToggle.on("pointerdown", async () => {
    chargeVignetteEnabled = !chargeVignetteEnabled;
    chargeVignetteToggle.setText(chargeVignetteEnabled ? "[ ON ]" : "[ OFF ]");
    chargeVignetteToggle.setColor(chargeVignetteEnabled ? "#63c722" : "#ffffff");
    await setChargeVignetteEnabled(chargeVignetteEnabled);
  });
  chargeVignetteToggle.on("pointerover", () => chargeVignetteToggle.setColor("#ffffff"));
  chargeVignetteToggle.on("pointerout", () => chargeVignetteToggle.setColor(chargeVignetteEnabled ? "#63c722" : "#ffffff"));

  return [
    volumeLabel, volumeDown, volumeText, volumeUp,
    autoAimLabel, autoAimToggle,
    challengeModeLabel, challengeModeToggle,
    chargeVignetteLabel, chargeVignetteToggle,
  ];
}