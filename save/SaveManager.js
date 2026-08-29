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
const SETTINGS_KEY = "gameSettings"; // separate record for player prefs (music volume, autoaim, challenge mode)
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

// Sitelock: refuses to run unless the game is being served from an official
// crazygames.* domain, so a copy hosted elsewhere won't work. Only enforced when
// USE_SDK is true -- during local dev/testing (USE_SDK = false) this always returns
// true so nothing is ever blocked on your own machine or your own site.
export function isAllowedDomain() {
  if (!USE_SDK) {
    return true;
  }
  const hostname = window.location.hostname;
  const parts = hostname.split(".");
  const idx = parts.indexOf("crazygames");
  return idx !== -1 && idx >= parts.length - 3;
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

// --- CrazyGames session/loading lifecycle --------------------------------------
// These feed CrazyGames' own Developer Dashboard (DAU, session length, retention,
// loading time) -- see https://docs.crazygames.com/sdk/game/. They're one-way status
// reports rather than requests with a return value, so failures are logged and
// swallowed here rather than surfaced to the caller. All are no-ops when USE_SDK is
// false, same as the rest of this file, so they're safe to call unconditionally from
// anywhere in the game.

// Call once, as early as possible, when the game first starts loading assets.
export async function notifyLoadingStart() {
  if (!USE_SDK) return;
  try {
    const sdk = await ensureSdkReady();
    sdk.game.loadingStart();
  } catch (err) {
    console.warn("CrazyGames loadingStart failed:", err);
  }
}

// Call once loading has finished and the player can actually start playing.
export async function notifyLoadingStop() {
  if (!USE_SDK) return;
  try {
    const sdk = await ensureSdkReady();
    sdk.game.loadingStop();
  } catch (err) {
    console.warn("CrazyGames loadingStop failed:", err);
  }
}

// Call whenever the player starts or resumes actively playing (level start,
// unpausing). Callers should skip this during hint playback -- that's an automated
// preview, not real played time, and counting it would inflate session-length data
// on the dashboard.
export async function notifyGameplayStart() {
  if (!USE_SDK) return;
  try {
    const sdk = await ensureSdkReady();
    sdk.game.gameplayStart();
  } catch (err) {
    console.warn("CrazyGames gameplayStart failed:", err);
  }
}

// Call on every break in active play: pausing, winning, losing, or otherwise
// leaving the level. Safe to call even if a matching notifyGameplayStart() was
// skipped (e.g. hint playback) -- CrazyGames treats this as a state report, not a
// strictly balanced open/close pair.
export async function notifyGameplayStop() {
  if (!USE_SDK) return;
  try {
    const sdk = await ensureSdkReady();
    sdk.game.gameplayStop();
  } catch (err) {
    console.warn("CrazyGames gameplayStop failed:", err);
  }
}

// Requests a rewarded video ad and resolves once the player has actually earned the
// reward -- true if the ad played to completion, false if it errored, was unfilled,
// or the SDK otherwise couldn't show one. Per CrazyGames' ad guidelines, callers
// should NOT grant whatever the reward is (here, the hint replay) when this resolves
// false. When USE_SDK is false this resolves true immediately with no ad at all, so
// local dev/testing isn't gated behind anything.
//
// onAdStart/onAdEnd are optional hooks for muting audio and freezing the game for
// the ad's duration (also part of CrazyGames' requirements) -- onAdEnd fires exactly
// once, on either success or failure, so callers can use it to unconditionally
// restore state without duplicating that logic in both branches.
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

// Lets other modules gate purely presentational decisions (e.g. whether to reveal a
// banner-ad container element at all) on the same USE_SDK flag everything else in
// this file already respects, without duplicating the flag itself.
export function isSdkEnabled() {
  return USE_SDK;
}

// Requests a CrazyGames responsive banner into the given DOM container id. The
// container must already exist in the page with a real, visible size (see
// index.html's #level-select-banner-container) -- CrazyGames measures it and picks
// whichever standard banner size fits. No-op when USE_SDK is false, same as the rest
// of this file; callers are still responsible for actually showing the container
// element itself (e.g. via style.display), since this only fills it with an ad.
export async function showBanner(containerId) {
  if (!USE_SDK) return;
  try {
    const sdk = await ensureSdkReady();
    await sdk.banner.requestResponsiveBanner([containerId]);
  } catch (err) {
    console.warn(`CrazyGames banner request failed for "${containerId}":`, err);
  }
}

// Clears a previously requested banner. CrazyGames recommends calling this whenever
// a banner is hidden -- otherwise the old ad content can flash back up for a moment
// the next time a banner is requested for the same container. Safe to call even if
// no banner was ever actually requested here (e.g. USE_SDK was off at the time).
export async function hideBanner(containerId) {
  if (!USE_SDK) return;
  try {
    const sdk = await ensureSdkReady();
    sdk.banner.clearBanner(containerId);
  } catch (err) {
    console.warn(`CrazyGames clearBanner failed for "${containerId}":`, err);
  }
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

// Autoaim toggle, stored alongside musicVolume in the same settings record.
// Defaults to false (off) the very first time the game runs, before the player has
// ever touched the setting.
//
// Also cached in memory (cachedAutoAim/autoAimLoaded below) so isAutoAimEnabled()
// can read the current value synchronously every frame during gameplay -- Player's
// aim logic can't await a storage read on every tick the way getAutoAim()'s callers
// (the settings modals, which only read it once when opening) comfortably can.
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
  // Updated immediately, ahead of the write below, so isAutoAimEnabled() reflects a
  // toggle the instant it's clicked rather than only after the storage write resolves.
  cachedAutoAim = enabled;
  autoAimLoaded = true;
  const settings = await readStoredValue(SETTINGS_KEY);
  settings.autoAim = enabled;
  await writeStoredValue(SETTINGS_KEY, settings);
}

// Synchronous read of the current autoaim preference -- for per-frame gameplay code
// (Player.getAimAngle()) that can't await getAutoAim()'s storage read on every tick.
// Reflects whatever getAutoAim()/setAutoAim() most recently loaded or set; call
// getAutoAim() at least once (GameScene.create() does this) before relying on it,
// or this just reads the false default.
export function isAutoAimEnabled() {
  return cachedAutoAim;
}

// Challenge mode toggle, stored alongside musicVolume/autoAim in the same settings
// record. Unlike autoAim, this defaults to true the very first time the game runs --
// challenge mode is the intended default experience, and a fresh player (or a failed
// read) should start in it rather than quietly out of it.
//
// Same in-memory caching as autoAim above, for the same reason: GameScene reads this
// once per level via getChallengeMode() to decide which time-limit field to use, but
// anything that needs it more often (e.g. per-frame HUD logic) can read the cache
// synchronously via isChallengeModeEnabled() instead.
let cachedChallengeMode = true;
let challengeModeLoaded = false;

export async function getChallengeMode() {
  if (!challengeModeLoaded) {
    const settings = await readStoredValue(SETTINGS_KEY);
    cachedChallengeMode = settings.challengeMode !== undefined ? settings.challengeMode : true;
    challengeModeLoaded = true;
  }
  return cachedChallengeMode;
}

export async function setChallengeMode(enabled) {
  // Updated immediately, ahead of the write below, so isChallengeModeEnabled()
  // reflects a toggle the instant it's clicked rather than only after the storage
  // write resolves.
  cachedChallengeMode = enabled;
  challengeModeLoaded = true;
  const settings = await readStoredValue(SETTINGS_KEY);
  settings.challengeMode = enabled;
  await writeStoredValue(SETTINGS_KEY, settings);
}

// Synchronous read of the current challenge mode preference, mirroring
// isAutoAimEnabled() above -- reflects whatever getChallengeMode()/setChallengeMode()
// most recently loaded or set; call getChallengeMode() at least once before relying
// on it, or this just reads the true default.
export function isChallengeModeEnabled() {
  return cachedChallengeMode;
}