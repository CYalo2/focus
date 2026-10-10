import { LEVELS } from "../data/Levels.js";
import { getBestTime, isLevelComplete, isSdkEnabled, showBanner, hideBanner, getChallengeMode } from "../save/SaveManager.js";
import { formatTime } from "../data/TimeUtils.js";
import { initAudioManager } from "../save/AudioManager.js";
import { buildSettingsRows, SETTINGS_ROWS_BOTTOM_OFFSET } from "../save/SettingsPanel.js";
import { GAME_WIDTH, GAME_HEIGHT } from "../data/Constants.js";
import { crispStroke } from "../ui/PixelRect.js";
import { applyDisplayCamera } from "../ui/DisplayScale.js";
import { createBackground } from "../ui/PlatformBackground.js";
import { getCurrentBackground, rerollBackground } from "../ui/BackgroundManager.js";
import { fadeIn, fadeToScene } from "../fx/SceneTransitions.js";

const COLS = 3;
const ROWS = 2;
const PAGE_SIZE = COLS * ROWS;
const TILE_SIZE = 90;
const TILE_GAP = 20;
const TILE_BORDER_WIDTH = 1;
const MODAL_BORDER_WIDTH = 1;
const TIME_LIMIT_COLOR_CHALLENGE = "#ff9999";
const GRID_TOP_Y = 110;

const LEVEL_SELECT_BANNER_CONTAINER_ID = "level-select-banner-container";
const MIN_LEVELS_COMPLETED_FOR_BANNER = 5;

export class LevelSelectScene extends Phaser.Scene {

    constructor() {
        super("LevelSelectScene");
    }

    async create(data) {

        const width = GAME_WIDTH;
        applyDisplayCamera(this);

        fadeIn(this);

        await initAudioManager(this.game);

        this.page = 0;
        this.totalPages = Math.max(1, Math.ceil(LEVELS.length / PAGE_SIZE));
        this.modalContainer = null;

        this.music = this.sound.add("level_select", { loop: true, volume: 0.5 });
        this.music.play();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.music.stop();
            this.hideLevelSelectBanner();
        });

        this.hasNavigated = false;

        if (Number.isInteger(data?.focusLevelIndex)) {
            const focusIndex = Phaser.Math.Clamp(data.focusLevelIndex, 0, LEVELS.length - 1);
            this.page = Phaser.Math.Clamp(Math.floor(focusIndex / PAGE_SIZE), 0, this.totalPages - 1);
            this.hasNavigated = true;
        }

        const arrivingFromLevel = Number.isInteger(data?.focusLevelIndex);
        const backgroundPreset = arrivingFromLevel ? await rerollBackground() : await getCurrentBackground();
        this.updateBackground = createBackground(this, backgroundPreset, 7.5);

        this.completed = new Array(LEVELS.length).fill(false);

        this.add.text(
            width / 2,
            40,
            "SELECT LEVEL",
            {
                fontSize: "24px",
                color: "#ffffff"
            }
        ).setOrigin(0.5);

        this.gridContainer = this.add.container(0, 0);

        const gridH = ROWS * TILE_SIZE + (ROWS - 1) * TILE_GAP;
        const arrowY = GRID_TOP_Y + gridH + 25;

        this.leftArrow = this.add.text(width / 2 - 140, arrowY, "<", { fontSize: "16px", color: "#3aa0ff" })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });
        this.rightArrow = this.add.text(width / 2 + 140, arrowY, ">", { fontSize: "16px", color: "#3aa0ff" })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        this.leftArrow.on("pointerover", () => this.leftArrow.setColor("#ffffff"));
        this.leftArrow.on("pointerout", () => this.leftArrow.setColor("#3aa0ff"));
        this.rightArrow.on("pointerover", () => this.rightArrow.setColor("#ffffff"));
        this.rightArrow.on("pointerout", () => this.rightArrow.setColor("#3aa0ff"));

        this.leftArrow.on("pointerdown", () => this.changePage(-1));
        this.rightArrow.on("pointerdown", () => this.changePage(1));

        const back = this.add.text(
            30,
            20,
            "< back",
            {
                fontSize: "8px",
                color: "#888888"
            }
        ).setInteractive({
            useHandCursor: true
        });

        back.on("pointerdown", () => {
            fadeToScene(this, "MenuScene");
        });

        const settingsButton = this.add.text(
            width - 30,
            20,
            "settings",
            {
                fontSize: "8px",
                color: "#888888"
            }
        ).setOrigin(1, 0).setInteractive({ useHandCursor: true });

        settingsButton.on("pointerover", () => settingsButton.setColor("#ffffff"));
        settingsButton.on("pointerout", () => settingsButton.setColor("#888888"));
        settingsButton.on("pointerdown", () => this.openSettings());

        this.input.keyboard.on("keydown-SPACE", (event) => {
            if (event.repeat) return;
            if (this.modalContainer) this.scene.start("GameScene", { levelIndex: this.modalLevelIndex });
        });

        this.input.keyboard.on("keydown-E", (event) => {
            if (event.repeat) return;
            this.openSettings();
        });

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

        this.scale.refresh();
    }

    update(time, delta) {
        if (this.updateBackground) this.updateBackground(delta);
    }

    changePage(delta) {
        const newPage = this.page + delta;
        if (newPage < 0 || newPage >= this.totalPages) return;
        if (!this.pageHasUnlockedLevel(newPage)) return;
        this.page = newPage;
        this.hasNavigated = true;
        this.buildPage();
    }

    pageHasUnlockedLevel(pageIndex) {
        const startIndex = pageIndex * PAGE_SIZE;
        const endIndex = Math.min(startIndex + PAGE_SIZE, LEVELS.length);
        for (let i = startIndex; i < endIndex; i++) {
            if (this.isLevelUnlocked(i)) return true;
        }
        return false;
    }

    async refreshProgress() {
        try {
            this.completed = await Promise.all(
                LEVELS.map((_, i) => isLevelComplete(i))
            );
        } catch (err) {
            console.error("Failed to load level completion progress:", err);
            return;
        }

        if (!this.scene.isActive()) return;

        if (!this.hasNavigated) {
            this.page = Math.floor(this.furthestUnlockedLevelIndex() / PAGE_SIZE);
        }

        this.buildPage();
    }

    furthestUnlockedLevelIndex() {
        let furthest = 0;
        for (let i = 0; i < LEVELS.length; i++) {
            if (!this.isLevelUnlocked(i)) break;
            furthest = i;
        }
        return furthest;
    }

    isLevelUnlocked(levelIndex) {
        return levelIndex === 0 || !!this.completed[levelIndex - 1];
    }

    drawLockIcon(x, y, color = 0x555555) {
        const bodyW = 20;
        const bodyH = 16;
        const bodyY = y - 2;
        const shackleW = 10;
        const shackleH = 8;

        const g = this.add.graphics();
        g.fillStyle(color, 1);
        g.fillRect(x - shackleW / 2, bodyY - shackleH, shackleW, shackleH);
        g.fillRect(x - bodyW / 2, bodyY, bodyW, bodyH);
        return g;
    }

    buildPage() {
        this.gridContainer.removeAll(true);

        const width = GAME_WIDTH;
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

            const levelNumber = i + 1;
            const borderWidth = levelNumber % 6 === 0 ? TILE_BORDER_WIDTH * 2 : TILE_BORDER_WIDTH;

            const outerSize = TILE_SIZE + borderWidth;
            const left = Math.round(x - outerSize / 2);
            const top = Math.round(y - outerSize / 2);

            const card = this.add.rectangle(left, top, outerSize, outerSize, unlocked ? 0x222222 : 0x151515)
                .setOrigin(0, 0);

            const borders = this.add.graphics();
            const drawRing = (ringLeft, ringTop, size, color) => {
                borders.fillStyle(color, 1);
                borders.fillRect(ringLeft, ringTop, size, borderWidth);
                borders.fillRect(ringLeft, ringTop + size - borderWidth, size, borderWidth);
                borders.fillRect(ringLeft, ringTop + borderWidth, borderWidth, size - borderWidth * 2);
                borders.fillRect(ringLeft + size - borderWidth, ringTop + borderWidth, borderWidth, size - borderWidth * 2);
            };
            const drawBorders = (outerColor) => {
                borders.clear();
                drawRing(left, top, outerSize, outerColor);
                drawRing(left + borderWidth, top + borderWidth, outerSize - borderWidth * 2, unlocked ? LEVELS[i].backgroundColor : 0x222222);
            };
            drawBorders(unlocked ? 0x555555 : 0x333333);

            const content = unlocked
                ? this.add.text(x, y, `${i + 1}`, { fontSize: "24px", color: "#ffffff" }).setOrigin(0.5)
                : this.drawLockIcon(x, y);

            if (unlocked) {
                card.setInteractive({ useHandCursor: true });
                card.on("pointerover", () => drawBorders(LEVELS[i].backgroundColor));
                card.on("pointerout", () => drawBorders(0x555555));
                card.on("pointerdown", () => this.openLevelDetails(i));
            }

            this.gridContainer.add([card, borders, content]);
        }

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
        if (!this.isLevelUnlocked(levelIndex)) return;

        if (this.settingsModalContainer) return;

        const level = LEVELS[levelIndex];

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

        if (!this.scene.isActive() || this.modalContainer) return;

        this.showLevelDetailsModal(level, levelIndex, bestTimeMs, completed, challengeModeEnabled);
    }

    navigateModalLevel(delta) {
        if (!this.modalContainer) return;

        const newIndex = this.modalLevelIndex + delta;
        if (newIndex < 0 || newIndex >= LEVELS.length) return;
        if (!this.isLevelUnlocked(newIndex)) return;

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
        const width = GAME_WIDTH, height = GAME_HEIGHT;

        this.modalLevelIndex = levelIndex;

        const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7)
            .setOrigin(0)
            .setInteractive();

        const panel = this.add.rectangle(width / 2, height / 2, 210, 190, 0x1a1a22)
            .setStrokeStyle(MODAL_BORDER_WIDTH * 2, level.backgroundColor);
        crispStroke(panel).setInteractive();

        const title = this.add.text(width / 2, height / 2 - 75, level.name, {
            fontSize: "16px",
            color: "#ffffff"
        }).setOrigin(0.5);

        const enemiesText = this.add.text(width / 2, height / 2 - 45, `Enemies: ${level.enemies.length}`, {
            fontSize: "8px",
            color: "#cccccc"
        }).setOrigin(0.5);

        const usingChallengeTime = challengeModeEnabled && level.challengeTimeMs !== undefined;
        const activeTimeLimitMs = usingChallengeTime ? level.challengeTimeMs : level.timeLimitMs;
        const timeLimitLabel = activeTimeLimitMs !== undefined
            ? `${usingChallengeTime ? "Challenge time limit" : "Time limit"}: ${formatTime(activeTimeLimitMs)}`
            : "Time limit: none";
        const timeLimitText = this.add.text(width / 2, height / 2 - 25, timeLimitLabel, {
            fontSize: "8px",
            color: usingChallengeTime ? TIME_LIMIT_COLOR_CHALLENGE : "#cccccc"
        }).setOrigin(0.5);

        const bestTimeLabel = completed ? `Best time: ${formatTime(bestTimeMs)}` : "Not completed yet";
        const bestTimeText = this.add.text(width / 2, height / 2 - 5, bestTimeLabel, {
            fontSize: "8px",
            color: completed ? "#63c722" : "#888888"
        }).setOrigin(0.5);

        const playButton = this.add.text(width / 2, height / 2 + 45, "[ PLAY ]", {
            fontSize: "16px",
            color: "#3aa0ff"
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        const closeButton = this.add.text(width / 2, height / 2 + 75, "close", {
            fontSize: "8px",
            color: "#888888"
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        const hasPrevLevel = levelIndex > 0;
        const hasNextLevel = levelIndex < LEVELS.length - 1;
        const prevUnlocked = hasPrevLevel && this.isLevelUnlocked(levelIndex - 1);
        const nextUnlocked = hasNextLevel && this.isLevelUnlocked(levelIndex + 1);

        const modalLeftArrow = this.add.text(width / 2 - 130, height / 2, "<", {
            fontSize: "16px",
            color: prevUnlocked ? "#3aa0ff" : "#555555"
        }).setOrigin(0.5).setVisible(hasPrevLevel);

        const modalRightArrow = this.add.text(width / 2 + 130, height / 2, ">", {
            fontSize: "16px",
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

        const completedCount = this.completed.filter(Boolean).length;
        const eligibleForBanner = isSdkEnabled() && completedCount >= MIN_LEVELS_COMPLETED_FOR_BANNER;
        if (eligibleForBanner) this.showLevelSelectBanner();

        const closeModal = () => {
            this.modalContainer.destroy();
            this.modalContainer = null;
            if (eligibleForBanner) this.hideLevelSelectBanner();
        };

        overlay.on("pointerdown", closeModal);
        closeButton.on("pointerdown", closeModal);
        playButton.on("pointerdown", () => this.scene.start("GameScene", { levelIndex }));

        playButton.on("pointerover", () => playButton.setColor("#ffffff"));
        playButton.on("pointerout", () => playButton.setColor("#3aa0ff"));
    }

    showLevelSelectBanner() {
        const container = document.getElementById(LEVEL_SELECT_BANNER_CONTAINER_ID);
        if (!container || container.style.display === "block") return;
        container.style.display = "block";
        showBanner(LEVEL_SELECT_BANNER_CONTAINER_ID);
    }

    hideLevelSelectBanner() {
        const container = document.getElementById(LEVEL_SELECT_BANNER_CONTAINER_ID);
        if (container) container.style.display = "none";
        hideBanner(LEVEL_SELECT_BANNER_CONTAINER_ID);
    }

    openSettings() {
        if (this.modalContainer || this.settingsModalContainer) return;

        this.settingsModalOpening = true;
        this.showSettingsModal();
    }

    async showSettingsModal() {
        const width = GAME_WIDTH, height = GAME_HEIGHT;

        const TITLE_HALF_HEIGHT = 12;
        const GAP_TITLE_TO_ROWS_CENTER = 40;
        const CLOSE_GAP_AFTER_ROWS = 18;
        const CLOSE_HALF_HEIGHT = 4;

        const blockHeight = TITLE_HALF_HEIGHT
            + GAP_TITLE_TO_ROWS_CENTER
            + SETTINGS_ROWS_BOTTOM_OFFSET
            + CLOSE_GAP_AFTER_ROWS
            + CLOSE_HALF_HEIGHT;
        const blockTop = height / 2 - blockHeight / 2;
        const blockBottom = blockTop + blockHeight;

        const titleY = blockTop + TITLE_HALF_HEIGHT;
        const rowsCenterY = titleY + GAP_TITLE_TO_ROWS_CENTER;

        const rowsBottomY = rowsCenterY + SETTINGS_ROWS_BOTTOM_OFFSET;
        const closeY = rowsBottomY + CLOSE_GAP_AFTER_ROWS;

        const PANEL_MARGIN = 18;
        const PANEL_WIDTH = 190;
        const panelTop = blockTop - PANEL_MARGIN;
        const panelBottom = blockBottom + PANEL_MARGIN;
        const panelHeight = panelBottom - panelTop;
        const panelCenterY = (panelTop + panelBottom) / 2;

        const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7)
            .setOrigin(0)
            .setInteractive();

        const panel = this.add.rectangle(width / 2, panelCenterY, PANEL_WIDTH, panelHeight, 0x1a1a22)
            .setStrokeStyle(1, 0x3aa0ff);
        crispStroke(panel).setInteractive();

        const title = this.add.text(width / 2, titleY, "SETTINGS", {
            fontSize: "24px",
            color: "#ffffff"
        }).setOrigin(0.5);

        const settingsRows = await buildSettingsRows(this, width / 2, rowsCenterY);

        if (!this.settingsModalOpening || !this.scene.isActive()) {
            settingsRows.forEach((obj) => obj.destroy());
            overlay.destroy();
            panel.destroy();
            title.destroy();
            return;
        }

        const closeButton = this.add.text(width / 2, closeY, "close", {
            fontSize: "8px",
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

        const closeOnKey = (event) => {
            if (event.repeat) return;
            closeModal();
        };

        this.input.keyboard.on("keydown-SPACE", closeOnKey);
        this.input.keyboard.on("keydown-E", closeOnKey);

        overlay.on("pointerdown", closeModal);
        closeButton.on("pointerdown", closeModal);
        closeButton.on("pointerover", () => closeButton.setColor("#ffffff"));
        closeButton.on("pointerout", () => closeButton.setColor("#888888"));
    }

}