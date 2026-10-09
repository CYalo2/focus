const SDK_SCRIPT_URL = "https://sdk.crazygames.com/crazygames-sdk-v3.js";
const STORAGE_KEY = "levelProgress";
const SETTINGS_KEY = "gameSettings";
const USE_SDK = false; // for test stuff

let sdkReadyPromise = null;

function ensureSdkReady() {
  if (!sdkReadyPromise) {
    sdkReadyPromise = (async () => {
      if (!window.CrazyGames) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = SDK_SCRIPT_URL;
          script.onload = resolve;
          script.onerror = () => reject(new Error("Failed to load the CrazyGames SDK script"));
          document.head.appendChild(script);
        });
      }
      await window.CrazyGames.SDK.init();
      return window.CrazyGames.SDK;
    })();
  }
  return sdkReadyPromise;
}

async function isOnCrazyGames() {
  if (!USE_SDK) {
    return false;
  }
  try {
    const sdk = await ensureSdkReady();
    return sdk.environment === "crazygames";
  } catch (err) {
    console.warn("CrazyGames SDK unavailable, falling back to localStorage:", err);
    return false;
  }
}

export function isAllowedDomain() {
  if (!USE_SDK) {
    return true;
  }
  const hostname = window.location.hostname;
  const parts = hostname.split(".");
  const idx = parts.indexOf("crazygames");
  return idx !== -1 && idx >= parts.length - 3;
}

function readLocalStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn("localStorage read failed:", err);
    return {};
  }
}

function writeLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("localStorage write failed:", err);
  }
}

async function readStoredValue(key) {
  if (await isOnCrazyGames()) {
    try {
      const sdk = await ensureSdkReady();
      const raw = await sdk.data.getItem(key);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.warn("CrazyGames read failed, falling back to localStorage:", err);
    }
  }
  return readLocalStorage(key);
}

async function writeStoredValue(key, value) {
  if (await isOnCrazyGames()) {
    try {
      const sdk = await ensureSdkReady();
      await sdk.data.setItem(key, JSON.stringify(value));
      return;
    } catch (err) {
      console.warn("CrazyGames write failed, falling back to localStorage:", err);
    }
  }
  writeLocalStorage(key, value);
}

export async function notifyLoadingStart() {
  if (!USE_SDK) return;
  try {
    const sdk = await ensureSdkReady();
    sdk.game.loadingStart();
  } catch (err) {
    console.warn("CrazyGames loadingStart failed:", err);
  }
}

export async function notifyLoadingStop() {
  if (!USE_SDK) return;
  try {
    const sdk = await ensureSdkReady();
    sdk.game.loadingStop();
  } catch (err) {
    console.warn("CrazyGames loadingStop failed:", err);
  }
}

export async function notifyGameplayStart() {
  if (!USE_SDK) return;
  try {
    const sdk = await ensureSdkReady();
    sdk.game.gameplayStart();
  } catch (err) {
    console.warn("CrazyGames gameplayStart failed:", err);
  }
}

export async function notifyGameplayStop() {
  if (!USE_SDK) return;
  try {
    const sdk = await ensureSdkReady();
    sdk.game.gameplayStop();
  } catch (err) {
    console.warn("CrazyGames gameplayStop failed:", err);
  }
}

export async function requestRewardedAd({ onAdStart, onAdEnd } = {}) {
  if (!USE_SDK) return true;
  try {
    const sdk = await ensureSdkReady();
    return await new Promise((resolve) => {
      sdk.ad.requestAd("rewarded", {
        adStarted: () => onAdStart?.(),
        adFinished: () => {
          onAdEnd?.();
          resolve(true);
        },
        adError: (error) => {
          console.warn("CrazyGames rewarded ad failed:", error);
          onAdEnd?.();
          resolve(false);
        },
      });
    });
  } catch (err) {
    console.warn("CrazyGames rewarded ad request failed:", err);
    onAdEnd?.();
    return false;
  }
}

export function isSdkEnabled() {
  return USE_SDK;
}

export async function showBanner(containerId) {
  if (!USE_SDK) return;
  try {
    const sdk = await ensureSdkReady();
    await sdk.banner.requestResponsiveBanner([containerId]);
  } catch (err) {
    console.warn(`CrazyGames banner request failed for "${containerId}":`, err);
  }
}

export async function hideBanner(containerId) {
  if (!USE_SDK) return;
  try {
    const sdk = await ensureSdkReady();
    sdk.banner.clearBanner(containerId);
  } catch (err) {
    console.warn(`CrazyGames clearBanner failed for "${containerId}":`, err);
  }
}

export async function recordLevelCompletion(levelIndex, timeMs) {
  const progress = await readStoredValue(STORAGE_KEY);
  const key = String(levelIndex);
  const existing = progress[key];

  const previousBestMs = existing && existing.bestTimeMs !== undefined ? existing.bestTimeMs : null;
  const isNewBest = previousBestMs === null || timeMs < previousBestMs;
  const bestTimeMs = isNewBest ? timeMs : previousBestMs;

  progress[key] = { completed: true, bestTimeMs };
  await writeStoredValue(STORAGE_KEY, progress);
  return { bestTimeMs, isNewBest };
}

export async function getBestTime(levelIndex) {
  const progress = await readStoredValue(STORAGE_KEY);
  const entry = progress[String(levelIndex)];
  return entry ? entry.bestTimeMs : null;
}

export async function isLevelComplete(levelIndex) {
  const progress = await readStoredValue(STORAGE_KEY);
  return !!progress[String(levelIndex)]?.completed;
}

export async function getMusicVolume() {
  const settings = await readStoredValue(SETTINGS_KEY);
  return settings.musicVolume !== undefined ? settings.musicVolume : 1;
}

export async function setMusicVolume(volume) {
  const settings = await readStoredValue(SETTINGS_KEY);
  settings.musicVolume = volume;
  await writeStoredValue(SETTINGS_KEY, settings);
}

let cachedAutoAim = false;
let autoAimLoaded = false;

export async function getAutoAim() {
  if (!autoAimLoaded) {
    const settings = await readStoredValue(SETTINGS_KEY);
    cachedAutoAim = settings.autoAim !== undefined ? settings.autoAim : false;
    autoAimLoaded = true;
  }
  return cachedAutoAim;
}

export async function setAutoAim(enabled) {
  cachedAutoAim = enabled;
  autoAimLoaded = true;
  const settings = await readStoredValue(SETTINGS_KEY);
  settings.autoAim = enabled;
  await writeStoredValue(SETTINGS_KEY, settings);
}

export function isAutoAimEnabled() {
  return cachedAutoAim;
}

let cachedChallengeMode = false;
let challengeModeLoaded = false;

export async function getChallengeMode() {
  if (!challengeModeLoaded) {
    const settings = await readStoredValue(SETTINGS_KEY);
    cachedChallengeMode = settings.challengeMode !== undefined ? settings.challengeMode : false;
    challengeModeLoaded = true;
  }
  return cachedChallengeMode;
}

export async function setChallengeMode(enabled) {
  cachedChallengeMode = enabled;
  challengeModeLoaded = true;
  const settings = await readStoredValue(SETTINGS_KEY);
  settings.challengeMode = enabled;
  await writeStoredValue(SETTINGS_KEY, settings);
}

export function isChallengeModeEnabled() {
  return cachedChallengeMode;
}

let cachedChargeVignette = true;
let chargeVignetteLoaded = false;

export async function getChargeVignetteEnabled() {
  if (!chargeVignetteLoaded) {
    const settings = await readStoredValue(SETTINGS_KEY);
    cachedChargeVignette = settings.chargeVignette !== undefined ? settings.chargeVignette : true;
    chargeVignetteLoaded = true;
  }
  return cachedChargeVignette;
}

export async function setChargeVignetteEnabled(enabled) {
  cachedChargeVignette = enabled;
  chargeVignetteLoaded = true;
  const settings = await readStoredValue(SETTINGS_KEY);
  settings.chargeVignette = enabled;
  await writeStoredValue(SETTINGS_KEY, settings);
}

export function isChargeVignetteEnabled() {
  return cachedChargeVignette;
}