import { BACKGROUND_PRESETS } from "../data/BackgroundPresets.js";
import { isLevelComplete } from "../save/SaveManager.js";

let currentIndex = null;

// Resolves to the indices of every preset currently unlocked. Presets with no
// unlockAfterLevel are always included; the rest need that level's completion
// flag from SaveManager. Checked fresh each call (not cached) so a preset
// unlocked mid-session (finishing the gating level, then heading back to
// LevelSelectScene) is picked up immediately rather than needing a reload.
async function getUnlockedIndices() {
    const flags = await Promise.all(
        BACKGROUND_PRESETS.map(p =>
            p.unlockAfterLevel === undefined ? Promise.resolve(true) : isLevelComplete(p.unlockAfterLevel)
        )
    );
    const unlocked = flags.reduce((acc, ok, i) => { if (ok) acc.push(i); return acc; }, []);
    // Defensive: should never happen since at least the un-gated presets always
    // qualify, but if it somehow does, fall back to the full list rather than
    // leaving nothing to pick from.
    return unlocked.length > 0 ? unlocked : BACKGROUND_PRESETS.map((_, i) => i);
}

function pickRandomFrom(indices, excludeIndex) {
    if (indices.length <= 1) return indices[0];
    let idx;
    do {
        idx = indices[Phaser.Math.Between(0, indices.length - 1)];
    } while (idx === excludeIndex);
    return idx;
}

// Returns the preset currently in use, choosing a random unlocked starting one
// the very first time this is called. Safe to call from both MenuScene and
// LevelSelectScene -- neither one rerolls here, they just read the shared choice.
export async function getCurrentBackground() {
    if (currentIndex === null) {
        const unlocked = await getUnlockedIndices();
        currentIndex = pickRandomFrom(unlocked);
    }
    return BACKGROUND_PRESETS[currentIndex];
}

// Picks a new preset (different from the current one, and respecting current
// unlocks) and makes it the shared choice. Call this only when LevelSelectScene
// is entered *from a level* -- not on a fresh visit from MenuScene.
export async function rerollBackground() {
    const unlocked = await getUnlockedIndices();
    currentIndex = pickRandomFrom(unlocked, currentIndex);
    return BACKGROUND_PRESETS[currentIndex];
}