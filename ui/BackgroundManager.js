import { BACKGROUND_PRESETS } from "../data/BackgroundPresets.js";
import { isLevelComplete } from "../save/SaveManager.js";

let currentIndex = null;

async function getUnlockedIndices() {
    const flags = await Promise.all(
        BACKGROUND_PRESETS.map(p =>
            p.unlockAfterLevel === undefined ? Promise.resolve(true) : isLevelComplete(p.unlockAfterLevel)
        )
    );
    const unlocked = flags.reduce((acc, ok, i) => { if (ok) acc.push(i); return acc; }, []);
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

export async function getCurrentBackground() {
    if (currentIndex === null) {
        const unlocked = await getUnlockedIndices();
        currentIndex = pickRandomFrom(unlocked);
    }
    return BACKGROUND_PRESETS[currentIndex];
}

export async function rerollBackground() {
    const unlocked = await getUnlockedIndices();
    currentIndex = pickRandomFrom(unlocked, currentIndex);
    return BACKGROUND_PRESETS[currentIndex];
}