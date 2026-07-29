import { LEVELS } from "../data/Levels.js";

// Formats a millisecond duration as M:SS.mm (e.g. 83450 -> "1:23.45"). Only used for
// the completion-time display below, so it doesn't need to handle hours/negatives --
// level times in this game are always a small positive number of minutes at most.
function formatTime(ms) {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(2).padStart(5, '0');
  return `${minutes}:${seconds}`;
}

// Win/lose overlay: title, retry button, next-level button (only when won and another
// level exists), and a link back to the level select screen. Fully self-contained --
// only reads scene.levelIndex, doesn't touch any other scene state.
//
// timeMs and isNewBest are optional and only ever displayed when won is true -- callers
// on the lose path (GameScene.loseLevel) simply omit them.
export function showEndScreen(scene, title, color, won, timeMs, isNewBest) {
  // Freeze sprite animation cycles and tweens once the overlay goes up. winLevel()/
  // loseLevel() already call physics.pause() before this runs, which stops velocity-
  // driven motion, but player/enemy walk & idle anims and tweens (hit-flash, goal-
  // activation glow) are driven independently of physics and would otherwise keep
  // playing behind the overlay. Particle emitters are deliberately left alone -- bullet
  // break/bounce and enemy death bursts read fine finishing out on their own. Scoped to
  // this scene's own TweenManager and its top-level children only -- not the global
  // anim manager -- so it can't bleed into other scenes. No explicit resume is needed:
  // RETRY/NEXT LEVEL/menu all route through scene.restart() or scene.start(), which
  // tear this scene down and rebuild it from scratch.
  scene.tweens.pauseAll();
  scene.children.list.forEach((child) => {
    if (child.anims && child.anims.isPlaying) child.anims.pause();
  });

  const overlay = scene.add.rectangle(0, 0, 1280, 720, 0x000000, 0.6).setOrigin(0).setScrollFactor(0);
  const titleText = scene.add.text(640, 280, title, { fontSize: '48px', color }).setOrigin(0.5).setScrollFactor(0);

  const children = [overlay, titleText];

  const showTime = won && timeMs !== undefined;
  if (showTime) {
    const timeText = scene.add.text(640, 335, `Time: ${formatTime(timeMs)}`, { fontSize: '22px', color: '#ffffff' })
      .setOrigin(0.5).setScrollFactor(0);
    children.push(timeText);
    if (isNewBest) {
      const bestText = scene.add.text(640, 365, 'NEW BEST!', { fontSize: '20px', color: '#ffd23a' })
        .setOrigin(0.5).setScrollFactor(0);
      children.push(bestText);
    }
  }

  // Buttons sit a bit lower when the time line (and possibly the new-best line above
  // it) is showing, so they don't overlap it.
  const buttonY = showTime ? (isNewBest ? 430 : 400) : 380;
  const menuY = buttonY + 50;

  const panelTop = 200;
  const panelBottom = menuY + 80;

  const hasNext = won && scene.levelIndex < LEVELS.length - 1;
  const panelWidth = hasNext ? 580 : 500; // was 520 / 460

  const panel = scene.add.rectangle(
    640,
    (panelTop + panelBottom) / 2,
    panelWidth,
    panelBottom - panelTop,
    0x1a1a22
  ).setScrollFactor(0).setStrokeStyle(2, 0x3aa0ff);

  children.splice(1, 0, panel);

  const retry = scene.add.text(640, buttonY, '[ RETRY ]', { fontSize: '24px', color: '#ffffff' })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
  const retryAction = () => scene.scene.restart({ levelIndex: scene.levelIndex });
  retry.on('pointerdown', retryAction);
  children.push(retry);

  if (hasNext) {
    const next = scene.add.text(780, buttonY, '[ NEXT LEVEL ]', { fontSize: '24px', color: '#3aa0ff' })
      .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
    next.on('pointerdown', () => scene.scene.start('GameScene', { levelIndex: scene.levelIndex + 1 }));
    retry.setX(500);
    children.push(next);
  }

  const menu = scene.add.text(640, menuY, 'back to level select', { fontSize: '16px', color: '#888888' })
    .setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
  menu.on('pointerdown', () => scene.scene.start('LevelSelectScene'));
  children.push(menu);

  // Group everything into a single container, same approach as PauseMenu's
  // pauseModalContainer -- one setDepth() on the container instead of one per child,
  // with array order still giving the pieces their correct front-to-back order
  // (overlay/panel at the back, text/buttons at the front).
  scene.endScreenContainer = scene.add.container(0, 0, children);
  scene.endScreenContainer.setDepth(200);

  // Space bar mirrors whichever primary action button is showing: NEXT LEVEL when
  // won and another level exists, RETRY otherwise (covers both the lose screen and
  // a win on the last level, where retry is the only action button present). `once`
  // rather than a plain listener so a held/repeated space can't fire the scene
  // transition twice; the listener itself is torn down for free when this scene
  // shuts down (restart/start), same as the keydown-E pause binding in GameScene.
  scene.input.keyboard.once('keydown-SPACE', () => {
    if (hasNext) {
      scene.scene.start('GameScene', { levelIndex: scene.levelIndex + 1 });
    } else {
      retryAction();
    }
  });

  // R always mirrors the RETRY button specifically (unlike space, which prefers
  // NEXT LEVEL when available) -- retry is present on every end screen, win or
  // lose, so this binding doesn't need a hasNext check. `once` for the same
  // reason as the space listener: avoid a held/repeated key firing restart twice.
  scene.input.keyboard.once('keydown-R', retryAction);
}