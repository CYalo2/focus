import { LEVELS } from "../data/Levels.js";
import { getBestTime, isLevelComplete } from "../save/SaveManager.js";
import { formatTime } from "../data/TimeUtils.js";
import { initAudioManager } from "../save/AudioManager.js";

const COLS = 3;
const ROWS = 2;
const PAGE_SIZE = COLS * ROWS;
const TILE_SIZE = 180;
const TILE_GAP = 40;
const GRID_TOP_Y = 220; // top edge of the grid, below the "SELECT LEVEL" title

export class LevelSelectScene extends Phaser.Scene {

    constructor() {
        super("LevelSelectScene");
    }

    async create(data) {

        const { width } = this.scale;

        // No-op if MenuScene already ran it (the normal path) -- kept here too in
        // case this scene is ever reached first, so volume/mute are still correct.
        await initAudioManager(this.game);

        this.page = 0;
        this.totalPages = Math.max(1, Math.ceil(LEVELS.length / PAGE_SIZE));
        this.modalContainer = null;

        // Starts fresh each time this scene is entered, and is stopped below as soon
        // as the scene shuts down (i.e. scene.start() moves us to GameScene or back
        // to MenuScene) -- so it never keeps playing past this screen, and never
        // double-plays if the player returns here later. Volume here is this track's
        // own level *relative to* the shared master volume AudioManager controls.
        this.music = this.sound.add("level_select", { loop: true, volume: 0.5 });
        this.music.play();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.music.stop());

        // Set once the player uses the arrows -- refreshProgress() only jumps to the
        // "furthest unlocked level" page while this is still false, so it doesn't yank
        // the player back to that page if they've already navigated away from it
        // (e.g. paged forward while the initial completion data was still loading).
        this.hasNavigated = false;

        // Arriving here via "back to level select" (PauseMenu / EndScreen) passes the
        // level to land on, so the player is dropped back on the page they came from
        // instead of wherever refreshProgress() would otherwise send them. Clamped to
        // a valid level index (in case that level was the last one, e.g. exactly 12
        // levels filling out the final page evenly) and marked as "navigated" so
        // refreshProgress() -- which only jumps to the furthest-unlocked page while
        // hasNavigated is still false -- doesn't overwrite it once completion data
        // finishes loading.
        if (Number.isInteger(data?.focusLevelIndex)) {
            const focusIndex = Phaser.Math.Clamp(data.focusLevelIndex, 0, LEVELS.length - 1);
            this.page = Phaser.Math.Clamp(Math.floor(focusIndex / PAGE_SIZE), 0, this.totalPages - 1);
            this.hasNavigated = true;
        }

        // Unlock state per level, indexed the same as LEVELS. Starts all-locked
        // (except level 0, handled by isLevelUnlocked) so buildPage() has something
        // sane to render immediately; refreshProgress() fills in the real values
        // from save data right after and rebuilds the page once they're known.
        this.completed = new Array(LEVELS.length).fill(false);

        this.add.text(
            width / 2,
            80,
            "SELECT LEVEL",
            {
                fontSize: "40px",
                color: "#ffffff"
            }
        ).setOrigin(0.5);

        // Holds the current page's tiles -- destroyed and rebuilt wholesale on every
        // page change instead of manually tracking/destroying each tile individually.
        this.gridContainer = this.add.container(0, 0);

        const gridH = ROWS * TILE_SIZE + (ROWS - 1) * TILE_GAP;
        const arrowY = GRID_TOP_Y + gridH + 50;

        this.leftArrow = this.add.text(width / 2 - 280, arrowY, "<", { fontSize: "32px", color: "#3aa0ff" })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });
        this.rightArrow = this.add.text(width / 2 + 280, arrowY, ">", { fontSize: "32px", color: "#3aa0ff" })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        this.leftArrow.on("pointerover", () => this.leftArrow.setColor("#ffffff"));
        this.leftArrow.on("pointerout", () => this.leftArrow.setColor("#3aa0ff"));
        this.rightArrow.on("pointerover", () => this.rightArrow.setColor("#ffffff"));
        this.rightArrow.on("pointerout", () => this.rightArrow.setColor("#3aa0ff"));

        this.leftArrow.on("pointerdown", () => this.changePage(-1));
        this.rightArrow.on("pointerdown", () => this.changePage(1));

        const back = this.add.text(
            60,
            40,
            "< back",
            {
                fontSize: "18px",
                color: "#888888"
            }
        ).setInteractive({
            useHandCursor: true
        });

        back.on("pointerdown", () => {
            this.scene.start("MenuScene");
        });

        // Space bar acts as the modal's PLAY button -- only does anything while a level's
        // details are actually open, since there's no "current level" to start otherwise.
        // Registered once here (not per-modal in showLevelDetailsModal) since the modal is
        // torn down and rebuilt every time it opens/closes, but this scene instance and its
        // keyboard plugin persist for as long as the player stays on this screen.
        this.input.keyboard.on("keydown-SPACE", () => {
            if (this.modalContainer) this.scene.start("GameScene", { levelIndex: this.modalLevelIndex });
        });

        this.buildPage();
        this.refreshProgress();

        // Works around a known Phaser gotcha: pointer hit-testing is mapped through
        // the canvas's cached on-page bounding rect, and that cache is only ever
        // recalculated automatically on a genuine browser resize/orientationchange
        // event -- nothing else. If the page's layout shifts for any other reason
        // after boot (a web font finishing load, anything else on the page
        // reflowing, etc.), clicks silently stop lining up with what's rendered,
        // with no error, until an actual resize fires. That's consistent with tiles
        // being unresponsive only on the very first visit -- refresh() forces the
        // same recalculation a real resize would, without needing to wait for one.
        this.scale.refresh();
    }

    changePage(delta) {
        const newPage = this.page + delta;
        if (newPage < 0 || newPage >= this.totalPages) return;
        this.page = newPage;
        this.hasNavigated = true;
        this.buildPage();
    }

    // Loads completion status for every level (not just the current page, since
    // paging doesn't reload data) and rebuilds the grid once it's known. Runs
    // once on scene create; nothing else changes it while this scene is open, since
    // the only way to complete a level is to leave for GameScene and come back,
    // which re-runs create() from scratch anyway.
    async refreshProgress() {
        try {
            this.completed = await Promise.all(
                LEVELS.map((_, i) => isLevelComplete(i))
            );
        } catch (err) {
            // Leave the all-locked-but-first fallback from create() in place --
            // better than the grid staying stuck on stale/undefined data.
            console.error("Failed to load level completion progress:", err);
            return;
        }

        // Scene may have been left while this was loading.
        if (!this.scene.isActive()) return;

        // Land on the page holding the furthest unlocked level (e.g. beat 6 levels ->
        // land on level 7's page) instead of always starting on page 0 -- but only if
        // the player hasn't already paged somewhere themselves in the meantime.
        if (!this.hasNavigated) {
            this.page = Math.floor(this.furthestUnlockedLevelIndex() / PAGE_SIZE);
        }

        this.buildPage();
    }

    // Levels unlock sequentially from level 0, so the furthest unlocked level is just
    // the last one in that unbroken unlocked run from the start.
    furthestUnlockedLevelIndex() {
        let furthest = 0;
        for (let i = 0; i < LEVELS.length; i++) {
            if (!this.isLevelUnlocked(i)) break;
            furthest = i;
        }
        return furthest;
    }

    // Level 0 is always playable; every other level requires the one immediately
    // before it to be completed.
    isLevelUnlocked(levelIndex) {
        return levelIndex === 0 || !!this.completed[levelIndex - 1];
    }

    // Draws a simple padlock (a shackle arc over a rounded body) centered at (x, y),
    // for locked tiles -- drawn instead of using a 🔒 glyph since emoji rendering
    // (or lack of it) varies across browsers/OSes/fonts.
    drawLockIcon(x, y, color = 0x555555) {
        const g = this.add.graphics();

        const bodyW = 40;
        const bodyH = 32;
        const bodyX = x - bodyW / 2;
        const bodyY = y - 4;

        const shackleRadius = 14;
        const shackleThickness = 6;

        g.lineStyle(shackleThickness, color, 1);
        g.beginPath();
        g.arc(x, bodyY, shackleRadius, Math.PI, 0, false); // top half-circle, open end down into the body
        g.strokePath();

        g.fillStyle(color, 1);
        g.fillRoundedRect(bodyX, bodyY, bodyW, bodyH, 6);

        return g;
    }

    buildPage() {
        this.gridContainer.removeAll(true); // destroys the previous page's tiles

        const { width } = this.scale;
        const gridW = COLS * TILE_SIZE + (COLS - 1) * TILE_GAP;
        const startX = width / 2 - gridW / 2 + TILE_SIZE / 2;
        const startY = GRID_TOP_Y + TILE_SIZE / 2;

        const startIndex = this.page * PAGE_SIZE;
        const endIndex = Math.min(startIndex + PAGE_SIZE, LEVELS.length);

        for (let i = startIndex; i < endIndex; i++) {
            const slot = i - startIndex;
            const col = slot % COLS;
            const row = Math.floor(slot / COLS);
            const x = startX + col * (TILE_SIZE + TILE_GAP);
            const y = startY + row * (TILE_SIZE + TILE_GAP);

            const unlocked = this.isLevelUnlocked(i);

            const card = this.add.rectangle(x, y, TILE_SIZE, TILE_SIZE, unlocked ? 0x222222 : 0x151515)
                .setStrokeStyle(2, unlocked ? 0x555555 : 0x333333);

            // Locked tiles show a drawn lock icon instead of the level number, and
            // stay non-interactive -- no hover/click handlers at all, rather than
            // handlers that just no-op, so there's no misleading hand cursor over a
            // tile you can't actually open yet.
            const content = unlocked
                ? this.add.text(x, y, `${i + 1}`, { fontSize: "48px", color: "#ffffff" }).setOrigin(0.5)
                : this.drawLockIcon(x, y);

            if (unlocked) {
                card.setInteractive({ useHandCursor: true });
                card.on("pointerover", () => card.setStrokeStyle(2, 0x3aa0ff));
                card.on("pointerout", () => card.setStrokeStyle(2, 0x555555));
                card.on("pointerdown", () => this.openLevelDetails(i));
            }

            this.gridContainer.add([card, content]);
        }

        // No arrow at all (rather than a disabled-looking one) when there's nothing
        // in that direction to page to.
        this.leftArrow.setVisible(this.page > 0);
        this.rightArrow.setVisible(this.page < this.totalPages - 1);
    }

    async openLevelDetails(levelIndex) {
        // Defensive: buildPage() only wires up pointerdown for unlocked tiles, so
        // this shouldn't normally be reachable for a locked level -- but guard here
        // too rather than relying solely on the UI not exposing the click.
        if (!this.isLevelUnlocked(levelIndex)) return;

        const level = LEVELS[levelIndex];

        // getBestTime/isLevelComplete can reject for a level with no save record yet
        // (nothing completed = nothing to look up) -- Promise.all would otherwise
        // reject the whole thing on that alone, leaving this an unhandled rejection
        // that silently aborts before showLevelDetailsModal ever runs. Falling back to
        // "not completed" here means a missing/failed lookup just looks like a level
        // you haven't beaten yet, instead of the tile being unresponsive.
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

        // The scene may have been left (or the player already opened another level's
        // details) while that save data was loading -- don't pop up a stale modal.
        if (!this.scene.isActive() || this.modalContainer) return;

        this.showLevelDetailsModal(level, levelIndex, bestTimeMs, completed);
    }

    showLevelDetailsModal(level, levelIndex, bestTimeMs, completed) {
        const { width, height } = this.scale;

        this.modalLevelIndex = levelIndex;

        const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7)
            .setOrigin(0)
            .setInteractive();

        // Interactive (even with no handler) so it, not the overlay behind it, is the
        // topmost hit target for clicks inside the panel -- Phaser only dispatches
        // pointerdown to the topmost interactive object under the pointer, so this is
        // what stops a click on the panel from also being seen as an overlay click.
        const panel = this.add.rectangle(width / 2, height / 2, 420, 380, 0x1a1a22)
            .setStrokeStyle(2, 0x3aa0ff)
            .setInteractive();

        const title = this.add.text(width / 2, height / 2 - 150, level.name, {
            fontSize: "28px",
            color: "#ffffff"
        }).setOrigin(0.5);

        const enemiesText = this.add.text(width / 2, height / 2 - 90, `Enemies: ${level.enemies.length}`, {
            fontSize: "18px",
            color: "#cccccc"
        }).setOrigin(0.5);

        const timeLimitLabel = level.timeLimitMs !== undefined
            ? `Time limit: ${formatTime(level.timeLimitMs)}`
            : "Time limit: none";
        const timeLimitText = this.add.text(width / 2, height / 2 - 50, timeLimitLabel, {
            fontSize: "18px",
            color: "#cccccc"
        }).setOrigin(0.5);

        const bestTimeLabel = completed ? `Best time: ${formatTime(bestTimeMs)}` : "Not completed yet";
        const bestTimeText = this.add.text(width / 2, height / 2 - 10, bestTimeLabel, {
            fontSize: "18px",
            color: completed ? "#63c722" : "#888888"
        }).setOrigin(0.5);

        const playButton = this.add.text(width / 2, height / 2 + 90, "[ PLAY ]", {
            fontSize: "26px",
            color: "#3aa0ff"
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        const closeButton = this.add.text(width / 2, height / 2 + 150, "close", {
            fontSize: "16px",
            color: "#888888"
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        this.modalContainer = this.add.container(0, 0, [
            overlay, panel, title, enemiesText, timeLimitText, bestTimeText, playButton, closeButton
        ]);

        const closeModal = () => {
            this.modalContainer.destroy(); // exclusive=true by default, so this destroys its children too
            this.modalContainer = null;
        };

        overlay.on("pointerdown", closeModal);
        closeButton.on("pointerdown", closeModal);
        playButton.on("pointerdown", () => this.scene.start("GameScene", { levelIndex }));

        playButton.on("pointerover", () => playButton.setColor("#ffffff"));
        playButton.on("pointerout", () => playButton.setColor("#3aa0ff"));
    }

}