import { LEVELS } from "../data/Levels.js";
import { requestRewardedAd } from "../save/SaveManager.js";
import { GAME_WIDTH, GAME_HEIGHT } from "../data/Constants.js";
import { crispStroke } from "./PixelRect.js";

const CX = GAME_WIDTH / 2;

function formatTime(ms) {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(2).padStart(5, '0');
  return `${minutes}:${seconds}`;
}

function requestHintReplay(scene, hintButton) {
  const originalLabel = hintButton.text;
  hintButton.disableInteractive();
  hintButton.setText('[ ... ]');

  requestRewardedAd({
    onAdStart: () => { scene.sound.mute = true; },
    onAdEnd: () => { scene.sound.mute = false; },
  }).then((watched) => {
    if (watched) {
      scene.scene.restart({ levelIndex: scene.levelIndex, hintPlayback: true });
    } else {
      hintButton.setText(originalLabel);
      hintButton.setInteractive({ useHandCursor: true });
    }
  });
}

export function showEndScreen(scene, title, color, won, timeMs, isNewBest) {
  scene.tweens.pauseAll();
  scene.children.list.forEach((child) => {
    if (child.anims && child.anims.isPlaying) child.anims.pause();
  });

  const overlay = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setOrigin(0).setScrollFactor(0);
  const titleText = scene.add.text(CX, 136, title, { fontSize: '24px', color }).setOrigin(0.5).setScrollFactor(0);

  const children = [overlay, titleText];

  const showTime = won && timeMs !== undefined;
  if (showTime) {
    const timeText = scene.add.text(CX, 166, `Time: ${formatTime(timeMs)}`, { fontSize: '16px', color: '#ffffff' })
      .setOrigin(0.5).setScrollFactor(0);
    children.push(timeText);
    if (isNewBest) {
      const bestText = scene.add.text(CX, 186, 'NEW BEST!', { fontSize: '16px', color: '#ffd23a' })
        .setOrigin(0.5).setScrollFactor(0);
      children.push(bestText);
    }
  }

  const hasNext = won && scene.levelIndex < LEVELS.length - 1;
  const hasHintReplay = !!LEVELS[scene.levelIndex]?.hintReplay;
  const showHint = !won && !scene.isHintPlayback && hasHintReplay;
  const showNoHints = !won && !scene.isHintPlayback && !hasHintReplay;

  const buttonY = showTime ? (isNewBest ? 218 : 200) : 190;
  const hintY = buttonY + 24;
  const menuY = ((showHint || showNoHints) ? hintY : buttonY) + 26;

  const panelTop = 100;
  const panelBottom = menuY + 32;

  const panelWidth = hasNext ? 310 : 250;

  const panel = scene.add.rectangle(
    CX,
    (panelTop + panelBottom) / 2,
    panelWidth,
    panelBottom - panelTop,
    0x1a1a22
  ).setScrollFactor(0).setStrokeStyle(1, 0x3aa0ff);
  crispStroke(panel);

  children.splice(1, 0, panel);

  const retry = scene.add.text(CX, buttonY, '[ RETRY ]', { fontSize: '16px', color: '#ffffff' })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
  const retryAction = () => scene.scene.restart({ levelIndex: scene.levelIndex });
  retry.on('pointerdown', retryAction);
  children.push(retry);

  if (hasNext) {
    const next = scene.add.text(CX + 70, buttonY, '[ NEXT LEVEL ]', { fontSize: '16px', color: '#3aa0ff' })
      .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
    next.on('pointerdown', () => scene.scene.start('GameScene', { levelIndex: scene.levelIndex + 1 }));
    retry.setX(CX - 70);
    children.push(next);
  }

  if (showHint) {
    const hint = scene.add.text(CX, hintY, '[ HINT ]', { fontSize: '16px', color: '#ffd23a' })
      .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
    hint.on('pointerdown', () => requestHintReplay(scene, hint));
    children.push(hint);
  } else if (showNoHints) {
    const noHints = scene.add.text(CX, hintY, '| NO HINT |', { fontSize: '16px', color: '#ff4d4d' })
      .setOrigin(0.5).setScrollFactor(0);
    children.push(noHints);
  }

  const menu = scene.add.text(CX, menuY, 'back to level select', { fontSize: '8px', color: '#888888' })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
  const focusLevelIndex = hasNext ? scene.levelIndex + 1 : scene.levelIndex;
  menu.on('pointerdown', () => scene.scene.start('LevelSelectScene', { focusLevelIndex }));
  children.push(menu);

  scene.endScreenContainer = scene.add.container(0, 0, children);
  scene.endScreenContainer.setDepth(200);

  scene.input.keyboard.once('keydown-SPACE', () => {
    if (hasNext) {
      scene.scene.start('GameScene', { levelIndex: scene.levelIndex + 1 });
    } else {
      retryAction();
    }
  });

  scene.input.keyboard.once('keydown-R', retryAction);
}