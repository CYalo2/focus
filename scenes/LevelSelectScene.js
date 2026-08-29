import { LEVELS } from "../data/Levels.js";
import { getBestTime, isLevelComplete, isSdkEnabled, showBanner, hideBanner, getChallengeMode } from "../save/SaveManager.js";
import { formatTime } from "../data/TimeUtils.js";
import { initAudioManager } from "../save/AudioManager.js";
import { buildSettingsRows, SETTINGS_ROWS_BOTTOM_OFFSET } from "../save/SettingsPanel.js";
import { createBackground } from "../ui/PlatformBackground.js";
import { getCurrentBackground, rerollBackground } from "../ui/BackgroundManager.js";
import { fadeIn, fadeToScene } from "../fx/SceneTransitions.js";

const COLS = 3;
const ROWS = 2;
const PAGE_SIZE = COLS * ROWS;
const TILE_SIZE = 180;
const TILE_GAP = 40;
const TILE_BORDER_WIDTH = 2; // width of each of the tile card's two stroked borders (outer UI color + inner level-preview color)
const MODAL_BORDER_WIDTH = 2; // same doubled-border treatment, sized for the level-details modal panel
const TIME_LIMIT_COLOR_CHALLENGE = "#ff9999"; // matches Hud.js's TIMER_COLOR_CHALLENGE
const GRID_TOP_Y = 220; // top edge of the grid, below the "SELECT LEVEL" title

// Must match the id of the container div in index.html.
const LEVEL_SELECT_BANNER_CONTAINER_ID = "level-select-banner-container";
// Gates the level-select banner ad -- shown only once the player has some real
// progress in, rather than on their very first visit to this screen.
const MIN_LEVELS_COMPLETED_FOR_BANNER = 5;

export class LevelSelectScene extends Phaser.Scene {

    constructor() {
        super("LevelSelectScene");
    }

    async create(data) {

        const { width } = this.scale;

        fadeIn(this);

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
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.music.stop();
            // Safety net: the PLAY button (and the SPACE shortcut) leave for GameScene
            // without going through the modal's own closeModal(), which is what
            // normally hides/clears this -- without this, the banner could otherwise
            // still be showing the next time this scene starts back up.
            this.hideLevelSelectBanner();
        });

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

        // Same background preset as MenuScene shows (see BackgroundManager) unless
        // we're arriving back here from a level -- data.focusLevelIndex being set is
        // that signal (see above) -- in which case it's time to roll a new one, which
        // MenuScene will then also pick up next time it's shown.
        const arrivingFromLevel = Number.isInteger(data?.focusLevelIndex);
        const backgroundPreset = arrivingFromLevel ? await rerollBackground() : await getCurrentBackground();
        this.updateBackground = createBackground(this, backgroundPreset, 15); // straight horizontal drift

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
            fadeToScene(this, "MenuScene");
        });

        // Mirrors "< back" on the opposite corner. Right-aligned via setOrigin so it
        // stays anchored to the corner regardless of label width.
        const settingsButton = this.add.text(
            width - 60,
            40,
            "settings",
            {
                fontSize: "18px",
                color: "#888888"
            }
        ).setOrigin(1, 0).setInteractive({ useHandCursor: true });

        settingsButton.on("pointerover", () => settingsButton.setColor("#ffffff"));
        settingsButton.on("pointerout", () => settingsButton.setColor("#888888"));
        settingsButton.on("pointerdown", () => this.openSettings());

        // Space bar acts as the modal's PLAY button -- only does anything while a level's
        // details are actually open, since there's no "current level" to start otherwise.
        // Registered once here (not per-modal in showLevelDetailsModal) since the modal is
        // torn down and rebuilt every time it opens/closes, but this scene instance and its
        // keyboard plugin persist for as long as the player stays on this screen. Guarded
        // against event.repeat (the synthetic keydowns a held key fires) so holding SPACE
        // doesn't fire scene.start() repeatedly.
        this.input.keyboard.on("keydown-SPACE", (event) => {
            if (event.repeat) return;
            if (this.modalContainer) this.scene.start("GameScene", { levelIndex: this.modalLevelIndex });
        });

        // Same guard as the settings button click -- openSettings() already no-ops
        // if a level-details modal (or the settings modal itself) is already open.
        // event.repeat guard so holding E doesn't repeatedly no-op/open it either.
        this.input.keyboard.on("keydown-E", (event) => {
            if (event.repeat) return;
            this.openSettings();
        });

        // Arrow keys (and A/D) mirror the on-screen </> buttons -- changePage()
        // already has all the bounds/unlock guards, so these just forward into it.
        // event.repeat guard so holding a key pages once per press instead of
        // machine-gunning through pages at OS key-repeat rate. While the level-details
        // modal is open, these instead drive its own prev/next-level arrows -- the
        // page arrows underneath are covered by the modal overlay at that point, so
        // the keys re-target navigateModalLevel() rather than changePage().
        this.input.keyboard.on("keydown-LEFT", (event) => {
            if (event.repeat) return;
            if (this.modalContainer) { this.navigateModalLevel(-1); return; }
            this.changePage(-1);
        });
        this.input.keyboard.on("keydown-RIGHT", (event) => {
            if (event.repeat) return;
            if (this.modalContainer) { this.navigateModalLevel(1); return; }
            this.changePage(1);
        });
        this.input.keyboard.on("keydown-A", (event) => {
            if (event.repeat) return;
            if (this.modalContainer) { this.navigateModalLevel(-1); return; }
            this.changePage(-1);
        });
        this.input.keyboard.on("keydown-D", (event) => {
            if (event.repeat) return;
            if (this.modalContainer) { this.navigateModalLevel(1); return; }
            this.changePage(1);
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

    update(time, delta) {
        // create() is async and awaits initAudioManager() before reaching the
        // createBackground() call -- Phaser doesn't wait for that promise, so
        // update() can run for the first several frames before updateBackground
        // is actually assigned.
        if (this.updateBackground) this.updateBackground(delta);
    }

    changePage(delta) {
        const newPage = this.page + delta;
        if (newPage < 0 || newPage >= this.totalPages) return;
        // Nothing to do on a page that's entirely locked tiles -- there's no level
        // there the player could actually open yet.
        if (!this.pageHasUnlockedLevel(newPage)) return;
        this.page = newPage;
        this.hasNavigated = true;
        this.buildPage();
    }

    // Whether any level on pageIndex is currently unlocked. Levels unlock in one
    // unbroken run from level 0, so in practice this is only ever true for pages up
    // through the one holding furthestUnlockedLevelIndex() -- but it's written as a
    // per-page scan (rather than a single index comparison) so it stays correct even
    // if the unlock rule ever stops being "sequential from the start".
    pageHasUnlockedLevel(pageIndex) {
        const startIndex = pageIndex * PAGE_SIZE;
        const endIndex = Math.min(startIndex + PAGE_SIZE, LEVELS.length);
        for (let i = startIndex; i < endIndex; i++) {
            if (this.isLevelUnlocked(i)) return true;
        }
        return false;
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

            // Every 6th level (numbering from 1, so levels 6/12/18/...) gets a
            // thicker border on its tile as a visual milestone marker -- doubled
            // rather than some arbitrary bump so it still divides evenly for the
            // inset inner border below.
            const levelNumber = i + 1;
            const borderWidth = levelNumber % 6 === 0 ? TILE_BORDER_WIDTH * 2 : TILE_BORDER_WIDTH;

            const card = this.add.rectangle(x, y, TILE_SIZE, TILE_SIZE, unlocked ? 0x222222 : 0x151515)
                .setStrokeStyle(borderWidth, unlocked ? 0x555555 : 0x333333);

            // Sits flush against the inside edge of card's stroke (inset by exactly
            // its width, same stroke width again) so the two borders read as one
            // border twice as thick -- outer half fixed UI color, inner half a
            // preview of the color the level itself will open into. Locked tiles
            // don't get this -- their color stays a UI grey like the rest of the
            // locked card, since the level's own color is part of what you unlock.
            const innerBorder = this.add.rectangle(
                x, y,
                TILE_SIZE - borderWidth * 2,
                TILE_SIZE - borderWidth * 2
            ).setStrokeStyle(borderWidth, unlocked ? LEVELS[i].backgroundColor : 0x222222);

            // Locked tiles show a drawn lock icon instead of the level number, and
            // stay non-interactive -- no hover/click handlers at all, rather than
            // handlers that just no-op, so there's no misleading hand cursor over a
            // tile you can't actually open yet.
            const content = unlocked
                ? this.add.text(x, y, `${i + 1}`, { fontSize: "48px", color: "#ffffff" }).setOrigin(0.5)
                : this.drawLockIcon(x, y);

            if (unlocked) {
                card.setInteractive({ useHandCursor: true });
                card.on("pointerover", () => card.setStrokeStyle(borderWidth, LEVELS[i].backgroundColor));
                card.on("pointerout", () => card.setStrokeStyle(borderWidth, 0x555555));
                card.on("pointerdown", () => this.openLevelDetails(i));
            }

            this.gridContainer.add([card, innerBorder, content]);
        }

        // Hidden entirely when there's no page there at all (off the end of the
        // level list). Greyed out and non-interactive, but still visible, when a
        // page exists in that direction but every level on it is still locked --
        // that way "nothing to page to yet" reads differently from "there's simply
        // nothing more".
        const hasPageLeft = this.page > 0;
        const hasPageRight = this.page < this.totalPages - 1;
        const leftEnabled = hasPageLeft && this.pageHasUnlockedLevel(this.page - 1);
        const rightEnabled = hasPageRight && this.pageHasUnlockedLevel(this.page + 1);

        this.leftArrow.setVisible(hasPageLeft);
        this.rightArrow.setVisible(hasPageRight);

        this.leftArrow.setColor(leftEnabled ? "#3aa0ff" : "#555555");
        this.rightArrow.setColor(rightEnabled ? "#3aa0ff" : "#555555");

        if (leftEnabled) {
            this.leftArrow.setInteractive({ useHandCursor: true });
        } else {
            this.leftArrow.disableInteractive();
        }
        if (rightEnabled) {
            this.rightArrow.setInteractive({ useHandCursor: true });
        } else {
            this.rightArrow.disableInteractive();
        }
    }

    async openLevelDetails(levelIndex) {
        // Defensive: buildPage() only wires up pointerdown for unlocked tiles, so
        // this shouldn't normally be reachable for a locked level -- but guard here
        // too rather than relying solely on the UI not exposing the click.
        if (!this.isLevelUnlocked(levelIndex)) return;

        // Don't stack this modal on top of the settings modal.
        if (this.settingsModalContainer) return;

        const level = LEVELS[levelIndex];

        // getBestTime/isLevelComplete can reject for a level with no save record yet
        // (nothing completed = nothing to look up) -- Promise.all would otherwise
        // reject the whole thing on that alone, leaving this an unhandled rejection
        // that silently aborts before showLevelDetailsModal ever runs. Falling back to
        // "not completed" here means a missing/failed lookup just looks like a level
        // you haven't beaten yet, instead of the tile being unresponsive.
        let bestTimeMs = null;
        let completed = false;
        let challengeModeEnabled = false;
        try {
            [bestTimeMs, completed, challengeModeEnabled] = await Promise.all([
                getBestTime(levelIndex),
                isLevelComplete(levelIndex),
                getChallengeMode(),
            ]);
        } catch (err) {
            console.error(`Failed to load save data for level ${levelIndex}:`, err);
        }

        // The scene may have been left (or the player already opened another level's
        // details) while that save data was loading -- don't pop up a stale modal.
        if (!this.scene.isActive() || this.modalContainer) return;

        this.showLevelDetailsModal(level, levelIndex, bestTimeMs, completed, challengeModeEnabled);
    }

    // Backs the modal's own </> arrows (and the arrow-key/A-D shortcuts while the
    // modal is open). Tears down the current modal and reopens on the neighboring
    // level -- reusing openLevelDetails() rather than mutating the open modal in
    // place, so the new level's save data (best time / completed) is loaded fresh
    // instead of carried over stale from the level being left.
    navigateModalLevel(delta) {
        if (!this.modalContainer) return;

        const newIndex = this.modalLevelIndex + delta;
        if (newIndex < 0 || newIndex >= LEVELS.length) return;
        if (!this.isLevelUnlocked(newIndex)) return;

        // The grid behind the modal follows along too, e.g. arrowing from the last
        // level on a page onto the first level of the next -- rebuilt here (rather
        // than going through changePage(), which also validates the target page has
        // an unlocked level on it) since newIndex already being unlocked guarantees
        // that.
        const newPage = Math.floor(newIndex / PAGE_SIZE);
        if (newPage !== this.page) {
            this.page = newPage;
            this.hasNavigated = true;
            this.buildPage();
        }

        this.modalContainer.destroy();
        this.modalContainer = null;
        this.openLevelDetails(newIndex);
    }

    showLevelDetailsModal(level, levelIndex, bestTimeMs, completed, challengeModeEnabled) {
        const { width, height } = this.scale;

        this.modalLevelIndex = levelIndex;

        const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7)
            .setOrigin(0)
            .setInteractive();

        // Interactive (even with no handler) so it, not the overlay behind it, is the
        // topmost hit target for clicks inside the panel -- Phaser only dispatches
        // pointerdown to the topmost interactive object under the pointer, so this is
        // what stops a click on the panel from also being seen as an overlay click.
        // Border doubled in width (matching the tile cards) and tinted with this
        // level's own backgroundColor instead of a fixed blue, since with only one
        // color needed now there's no reason for a second nested rectangle.
        const panel = this.add.rectangle(width / 2, height / 2, 420, 380, 0x1a1a22)
            .setStrokeStyle(MODAL_BORDER_WIDTH * 2, level.backgroundColor)
            .setInteractive();

        const title = this.add.text(width / 2, height / 2 - 150, level.name, {
            fontSize: "28px",
            color: "#ffffff"
        }).setOrigin(0.5);

        const enemiesText = this.add.text(width / 2, height / 2 - 90, `Enemies: ${level.enemies.length}`, {
            fontSize: "18px",
            color: "#cccccc"
        }).setOrigin(0.5);

        // Mirrors GameScene's own challenge-mode fallback: prefer challengeTimeMs
        // while challenge mode is on, but fall back to the regular timeLimitMs for
        // levels that don't define a challenge-specific one, so the preview always
        // matches whatever time limit the level will actually be played with.
        const usingChallengeTime = challengeModeEnabled && level.challengeTimeMs !== undefined;
        const activeTimeLimitMs = usingChallengeTime ? level.challengeTimeMs : level.timeLimitMs;
        const timeLimitLabel = activeTimeLimitMs !== undefined
            ? `${usingChallengeTime ? "Challenge time limit" : "Time limit"}: ${formatTime(activeTimeLimitMs)}`
            : "Time limit: none";
        const timeLimitText = this.add.text(width / 2, height / 2 - 50, timeLimitLabel, {
            fontSize: "18px",
            color: usingChallengeTime ? TIME_LIMIT_COLOR_CHALLENGE : "#cccccc"
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

        // Prev/next-level arrows flanking the panel -- separate from (and in front
        // of) the page arrows underneath, which stay hidden behind the modal overlay
        // while this is open. Hidden entirely when there's no level in that
        // direction at all (levelIndex is the first/last level); shown greyed-out
        // and non-interactive, same treatment as the page arrows, when a level is
        // there but still locked.
        const hasPrevLevel = levelIndex > 0;
        const hasNextLevel = levelIndex < LEVELS.length - 1;
        const prevUnlocked = hasPrevLevel && this.isLevelUnlocked(levelIndex - 1);
        const nextUnlocked = hasNextLevel && this.isLevelUnlocked(levelIndex + 1);

        const modalLeftArrow = this.add.text(width / 2 - 260, height / 2, "<", {
            fontSize: "32px",
            color: prevUnlocked ? "#3aa0ff" : "#555555"
        }).setOrigin(0.5).setVisible(hasPrevLevel);

        const modalRightArrow = this.add.text(width / 2 + 260, height / 2, ">", {
            fontSize: "32px",
            color: nextUnlocked ? "#3aa0ff" : "#555555"
        }).setOrigin(0.5).setVisible(hasNextLevel);

        if (prevUnlocked) {
            modalLeftArrow.setInteractive({ useHandCursor: true });
            modalLeftArrow.on("pointerover", () => modalLeftArrow.setColor("#ffffff"));
            modalLeftArrow.on("pointerout", () => modalLeftArrow.setColor("#3aa0ff"));
            modalLeftArrow.on("pointerdown", () => this.navigateModalLevel(-1));
        }
        if (nextUnlocked) {
            modalRightArrow.setInteractive({ useHandCursor: true });
            modalRightArrow.on("pointerover", () => modalRightArrow.setColor("#ffffff"));
            modalRightArrow.on("pointerout", () => modalRightArrow.setColor("#3aa0ff"));
            modalRightArrow.on("pointerdown", () => this.navigateModalLevel(1));
        }

        this.modalContainer = this.add.container(0, 0, [
            overlay, panel, title, enemiesText, timeLimitText, bestTimeText, playButton, closeButton,
            modalLeftArrow, modalRightArrow
        ]);

        // Only once the player has some real progress in, and only when actually
        // running with the CrazyGames SDK -- see showLevelSelectBanner() below.
        const completedCount = this.completed.filter(Boolean).length;
        const eligibleForBanner = isSdkEnabled() && completedCount >= MIN_LEVELS_COMPLETED_FOR_BANNER;
        if (eligibleForBanner) this.showLevelSelectBanner();

        const closeModal = () => {
            this.modalContainer.destroy(); // exclusive=true by default, so this destroys its children too
            this.modalContainer = null;
            if (eligibleForBanner) this.hideLevelSelectBanner();
        };

        overlay.on("pointerdown", closeModal);
        closeButton.on("pointerdown", closeModal);
        playButton.on("pointerdown", () => this.scene.start("GameScene", { levelIndex }));

        playButton.on("pointerover", () => playButton.setColor("#ffffff"));
        playButton.on("pointerout", () => playButton.setColor("#3aa0ff"));
    }

    // Reveals the DOM banner container (see index.html) and asks CrazyGames to fill
    // it. Idempotent -- checked via the container's own display style rather than a
    // separate flag -- so reopening the modal via navigateModalLevel() (which tears
    // down and rebuilds the modal without going through closeModal()) doesn't
    // re-request a banner that's already showing. CrazyGames enforces its own
    // minimum delay between requests for the same container anyway, but avoiding the
    // redundant call here means normal prev/next browsing never comes close to it.
    showLevelSelectBanner() {
        const container = document.getElementById(LEVEL_SELECT_BANNER_CONTAINER_ID);
        if (!container || container.style.display === "block") return;
        container.style.display = "block";
        showBanner(LEVEL_SELECT_BANNER_CONTAINER_ID);
    }

    // Hides the container and tells CrazyGames to clear it -- recommended by
    // CrazyGames' own docs so stale ad content doesn't flash back up the next time a
    // banner is requested for this same container id.
    hideLevelSelectBanner() {
        const container = document.getElementById(LEVEL_SELECT_BANNER_CONTAINER_ID);
        if (container) container.style.display = "none";
        hideBanner(LEVEL_SELECT_BANNER_CONTAINER_ID);
    }

    openSettings() {
        // Don't stack this modal on top of a level-details modal (or itself, if the
        // button is somehow double-clicked before the first modal finishes opening).
        if (this.modalContainer || this.settingsModalContainer) return;

        // Flag checked by showSettingsModal after its async autoAim read resolves --
        // cleared the moment the modal actually closes, so a stale read doesn't pop
        // the modal back up after the player already dismissed it.
        this.settingsModalOpening = true;
        this.showSettingsModal();
    }

    // Same "settings" modal as PauseMenu's -- the volume and autoaim rows are built
    // by the shared buildSettingsRows (see SettingsPanel.js) so both screens' settings
    // stay identical instead of drifting as two separate copies. Async because that
    // builder itself awaits the autoAim read -- mirrors the guard in
    // PauseMenu.showPauseMenu, since the player could close this modal (or leave the
    // scene) while that read is still in flight.
    async showSettingsModal() {
        const { width, height } = this.scale;

        // --- layout ---
        // Rather than anchoring the title to a fixed offset from height/2 (which only
        // looked centered for however many settings rows existed when that number was
        // last tuned), the whole content block -- title through the close link -- is
        // measured first via these gaps and half-heights, then centered as a unit on
        // height/2. Add a row in SettingsPanel.js and the block grows, but it grows
        // evenly around the same vertical center instead of drifting off it.
        const TITLE_HALF_HEIGHT = 14; // 28px title font
        const GAP_TITLE_TO_ROWS_CENTER = 110;
        const CLOSE_GAP_AFTER_ROWS = 35;
        const CLOSE_HALF_HEIGHT = 8; // 16px close-link font

        const blockHeight = TITLE_HALF_HEIGHT
            + GAP_TITLE_TO_ROWS_CENTER
            + SETTINGS_ROWS_BOTTOM_OFFSET
            + CLOSE_GAP_AFTER_ROWS
            + CLOSE_HALF_HEIGHT;
        const blockTop = height / 2 - blockHeight / 2;
        const blockBottom = blockTop + blockHeight;

        const titleY = blockTop + TITLE_HALF_HEIGHT;
        const rowsCenterY = titleY + GAP_TITLE_TO_ROWS_CENTER;

        // Close link sits relative to the BOTTOM of the settings rows (via
        // SETTINGS_ROWS_BOTTOM_OFFSET) rather than a fixed offset, so adding/removing
        // a row in SettingsPanel.js automatically pushes it down/up instead of the
        // row block silently overlapping it.
        const rowsBottomY = rowsCenterY + SETTINGS_ROWS_BOTTOM_OFFSET;
        const closeY = rowsBottomY + CLOSE_GAP_AFTER_ROWS;

        // Panel wraps the content block with an equal margin on both top and bottom,
        // so it's centered on height/2 right along with the content it wraps --
        // asymmetric margins here would push the panel (though not the content inside
        // it) visibly off-center.
        const PANEL_MARGIN = 35;
        const PANEL_WIDTH = 380;
        const panelTop = blockTop - PANEL_MARGIN;
        const panelBottom = blockBottom + PANEL_MARGIN;
        const panelHeight = panelBottom - panelTop;
        const panelCenterY = (panelTop + panelBottom) / 2;

        const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7)
            .setOrigin(0)
            .setInteractive();

        const panel = this.add.rectangle(width / 2, panelCenterY, PANEL_WIDTH, panelHeight, 0x1a1a22)
            .setStrokeStyle(2, 0x3aa0ff)
            .setInteractive();

        const title = this.add.text(width / 2, titleY, "SETTINGS", {
            fontSize: "28px",
            color: "#ffffff"
        }).setOrigin(0.5);

        const settingsRows = await buildSettingsRows(this, width / 2, rowsCenterY);

        // The player may have closed this modal (or left the scene) while that read
        // was in flight -- don't build a settings modal nobody asked for anymore.
        if (!this.settingsModalOpening || !this.scene.isActive()) {
            settingsRows.forEach((obj) => obj.destroy());
            overlay.destroy();
            panel.destroy();
            title.destroy();
            return;
        }

        const closeButton = this.add.text(width / 2, closeY, "close", {
            fontSize: "16px",
            color: "#888888"
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        this.settingsModalContainer = this.add.container(0, 0, [
            overlay, panel, title, ...settingsRows, closeButton
        ]);
        this.settingsModalContainer.setDepth(1000);

        const closeModal = () => {
            this.settingsModalOpening = false;
            this.settingsModalContainer.destroy();
            this.settingsModalContainer = null;
            this.input.keyboard.off("keydown-SPACE", closeOnKey);
            this.input.keyboard.off("keydown-E", closeOnKey);
        };

        // Wraps closeModal so the keyboard listeners can filter out event.repeat --
        // closeModal itself stays callable directly from the click handlers below,
        // which pass no event object at all.
        const closeOnKey = (event) => {
            if (event.repeat) return;
            closeModal();
        };

        // Both keys just toggle the modal shut here -- E is the same key that opened
        // it, and SPACE is safe to repurpose since the global SPACE handler in
        // create() only acts while a level-details modal is open, not this one.
        this.input.keyboard.on("keydown-SPACE", closeOnKey);
        this.input.keyboard.on("keydown-E", closeOnKey);

        overlay.on("pointerdown", closeModal);
        closeButton.on("pointerdown", closeModal);
        closeButton.on("pointerover", () => closeButton.setColor("#ffffff"));
        closeButton.on("pointerout", () => closeButton.setColor("#888888"));
    }

}