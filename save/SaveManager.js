// Centralizes all game-progress persistence. This is the ONLY file that references
// `window.CrazyGames` anywhere in the project -- to target a different platform or
// storage backend, replace just this file (keeping the same exported function
// signatures) and nothing else needs to change.
//
// Set USE_SDK to false to force plain localStorage everywhere (handy for local
// development/testing without the CrazyGames embed). Set it to true to use the
// CrazyGames SDK when available.

const SDK_SCRIPT_URL = "https://sdk.crazygames.com/crazygames-sdk-v3.js";
const STORAGE_KEY = "levelProgress";
const SETTINGS_KEY = "gameSettings"; // separate record for player prefs (currently just music volume)
const USE_SDK = false; // flip to true to use the CrazyGames SDK instead of localStorage

let sdkReadyPromise = null;

// Loads the SDK script tag (if it isn't already on the page) and calls SDK.init()
// exactly once, caching the promise so concurrent callers all share the same result
// instead of re-loading/re-initializing.
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

// True only when USE_SDK is enabled and we're actually running inside a CrazyGames
// embed -- everywhere else (USE_SDK disabled, local dev, your own site, another
// platform, or broken connectivity) this resolves false and readProgress/writeProgress
// fall back to localStorage.
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

// Last-resort read/write against localStorage itself. Wrapped because even this can
// throw in some contexts (private browsing with storage disabled, quota exceeded,
// sandboxed iframes) -- and at this point there's nowhere further to fall back to, so
// failures are swallowed rather than left to break the caller.
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

// Generic read/write against whichever backend is active, keyed so both level
// progress and settings (or anything else added later) can share the same
// SDK-with-localStorage-fallback path instead of duplicating it per record type.
async function readStoredValue(key) {
  if (await isOnCrazyGames()) {
    try {
      const sdk = await ensureSdkReady();
      const raw = await sdk.data.getItem(key);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      // Connection was there a moment ago (isOnCrazyGames just succeeded) but dropped
      // before this call finished -- still fall back rather than losing the read.
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

// Call when the player reaches the goal. Marks the level complete and lowers its
// stored best time if this run was faster (or records one if there's no previous best
// at all). timeMs should be wall-clock time spent on the level, unaffected by bullet
// time -- GameScene tracks this with a raw-delta stopwatch for exactly that reason.
//
// Returns { bestTimeMs, isNewBest } so callers (the end screen) can tell whether this
// particular run improved on the stored best -- isNewBest is true both when this run
// beat a previous time and when there was no previous completion at all.
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

// Returns the stored best time in ms for a level, or null if it's never been completed.
export async function getBestTime(levelIndex) {
  const progress = await readStoredValue(STORAGE_KEY);
  const entry = progress[String(levelIndex)];
  return entry ? entry.bestTimeMs : null;
}

// Returns whether a level has ever been completed.
export async function isLevelComplete(levelIndex) {
  const progress = await readStoredValue(STORAGE_KEY);
  return !!progress[String(levelIndex)]?.completed;
}

// Music volume, stored as a 0-1 fraction. Defaults to full volume (1) the very first
// time the game runs, before the player has ever touched the pause menu's slider.
export async function getMusicVolume() {
  const settings = await readStoredValue(SETTINGS_KEY);
  return settings.musicVolume !== undefined ? settings.musicVolume : 1;
}

export async function setMusicVolume(volume) {
  const settings = await readStoredValue(SETTINGS_KEY);
  settings.musicVolume = volume;
  await writeStoredValue(SETTINGS_KEY, settings);
}