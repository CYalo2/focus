import { BULLET_TIME_MULTIPLIER, DEFAULT_WORLD_BOUNDS, BULLET_OFFSCREEN_MARGIN, HIT_FLASH_BRIGHTEN_AMOUNT, CHARGE_MIN_OPACITY, DEPTH, BULLET_PLAYER_TINT, BULLET_ENEMY_TINT } from "../data/Constants.js";
import { lightenColor } from "../data/ColorUtils.js";
import { LEVELS } from "../data/Levels.js";
import { WEAPONS, applyWeaponSpread } from "../data/Weapons.js";
import { Player } from "../entity/Player.js";
import { Enemy } from "../entity/Enemy.js";
import { createPlatforms } from "../entity/Platform.js";
import { destroyOffscreenBullets, reorientBullet, redirectBullet } from "../entity/Bullet.js";
import { Hud } from "../ui/Hud.js";
import { showEndScreen } from "../ui/EndScreen.js";
import { SeededRandom } from "../data/SeededRandom.js";
import { showPauseMenu } from "../ui/PauseMenu.js";
import { spawnBulletBreakParticles, spawnBulletBounceParticles, spawnEnemyDeathParticles, startGoalActivationParticles, spawnPlatformHitParticles, spawnPlatformBreakParticles } from "../fx/Particles.js";
import { recordLevelCompletion, notifyGameplayStart, notifyGameplayStop, getAutoAim, getChallengeMode } from "../save/SaveManager.js";
import { HINT_RECORDING_ENABLED, HintRecorder, HintPlayback, fromB36 } from "../data/HintReplay.js";
import { setBulletTimeAudioEffect } from "../save/AudioManager.js";

const CHEAT = false;
// Arbitrary distance used to reconstruct a fake pointer.worldX/worldY from the
// player's position + a recorded aim angle during hint playback (see
// updateHintPlayback()) -- any nonzero value works since only the direction is ever
// read, not the distance.
const AIM_RAY_LENGTH = 1000;

// Duration (ms) of the brief flash that confirms an in-game R press registered, and
// how long retryLevelWithFlash() waits before actually restarting the scene -- kept
// equal so the flash has time to fully fade out first (see below).
const RETRY_FLASH_DURATION_MS = 120;
// Peak opacity of that flash. Deliberately low -- Phaser's built-in camera.flash()
// always peaks at fully-opaque white regardless of duration, which reads as the whole
// screen changing rather than a subtle confirmation, so this draws its own overlay
// rectangle at a faint alpha and tweens that down to 0 instead.
const RETRY_FLASH_ALPHA = 0.12;

// Tracks which keys are PHYSICALLY held down right now, independent of any Phaser
// Key object. scene.restart() (used by retryLevel()) tears down and rebuilds the
// scene's input plugin, so the fresh this.cursors/this.keys objects it creates always
// start isDown=false -- even if the real key never actually came up. Without this,
// holding a movement key and tapping R to retry mid-move would silently drop that
// key's held state until you released and pressed it again. This Set lives at module
// scope (not on the scene) specifically so it survives every restart; syncHeldKeys()
// below reads from it right after the new Key objects are created in create().
const heldKeyCodes = new Set();
window.addEventListener("keydown", (e) => heldKeyCodes.add(e.keyCode));
window.addEventListener("keyup", (e) => heldKeyCodes.delete(e.keyCode));
// Also clear on blur (alt-tab, clicking outside the game) -- the keyup for a held key
// never fires if focus leaves the page before the key is released, which would
// otherwise leave it stuck "held" forever afterward.
window.addEventListener("blur", () => heldKeyCodes.clear());

function syncHeldKeys(...keys) {
  for (const key of keys) {
    if (heldKeyCodes.has(key.keyCode)) key.isDown = true;
  }
}

// Small "ready to fire" marker drawn around the mouse cursor: continuously while a
// CHARGE-mode weapon is held at full charge (see update()), or as a one-frame flash
// the instant a COOLDOWN-mode weapon fires (see spawnFireReadyIndicator(), called
// from Player.updateCooldownFire()).
const FIRE_READY_INDICATOR_SIZE = 14; // half-length of each arm, center to tip
const FIRE_READY_INDICATOR_COLOR = BULLET_PLAYER_TINT;
const FIRE_READY_INDICATOR_ALPHA = 0.35;
const FIRE_READY_INDICATOR_LINE_WIDTH = 3;

// Draws the plus/crosshair shape itself at (x, y) with the given depth -- shared by
// the persistent CHARGE-mode indicator and the one-frame COOLDOWN-mode flash below,
// so both stay visually identical. Built from a Graphics object (rather than the
// Circle game object the ring version used) since a plus shape isn't one of Phaser's
// built-in primitives.
// (x, y) here are always SCREEN coordinates (pointer.x/pointer.y), not world
// coordinates -- this marker only ever needs to sit on top of the actual cursor, so
// scrollFactor(0) pins it to the screen directly and it never has to track the
// camera or worry about stale worldX/worldY.
function drawFireReadyRing(scene, x, y) {
  const g = scene.add.graphics({ x, y }).setScrollFactor(0);
  g.lineStyle(FIRE_READY_INDICATOR_LINE_WIDTH, FIRE_READY_INDICATOR_COLOR, FIRE_READY_INDICATOR_ALPHA);
  g.beginPath();
  g.moveTo(-FIRE_READY_INDICATOR_SIZE, 0);
  g.lineTo(FIRE_READY_INDICATOR_SIZE, 0);
  g.moveTo(0, -FIRE_READY_INDICATOR_SIZE);
  g.lineTo(0, FIRE_READY_INDICATOR_SIZE);
  g.strokePath();
  g.setDepth(DEPTH.explosion);
  return g;
}

export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  init(data) {
    this.levelIndex = data.levelIndex || 0;
    this.levelData = LEVELS[this.levelIndex];
    // Hint playback: reruns this same level driven by a prerecorded input script
    // instead of live input (see updateHintPlayback()), rather than spinning up a
    // separate scene -- it needs the exact same level-build logic below (platforms,
    // enemies, goal, etc.), so reusing this scene via a restart flag avoids
    // duplicating any of that.
    this.isHintPlayback = data.hintPlayback === true;
    // Belt-and-suspenders alongside the flip in create(): guarantees update() bails
    // out for the entire init -> preload -> create window on a restart too, rather
    // than briefly running with the previous instance's now-stale sceneReady=true.
    this.sceneReady = false;
  }

  async create() {
    // create() is async (see the `await getAutoAim()` below), but Phaser never awaits
    // create() itself -- it starts calling update() every frame as soon as create()
    // is invoked, regardless of whether it's actually finished. Without this flag,
    // update() (and anything it touches, e.g. this.keys via applyBulletTimeToggle())
    // can run mid-await, before the rest of create() below has had a chance to set
    // up this.keys, this.cursors, physics groups, the HUD, etc. Set false here and
    // flipped true at the very end of create(), with a matching early-return guard at
    // the top of update().
    this.sceneReady = false;

    const level = this.levelData;

    // --- weapon ---
    this.weapon = WEAPONS[level.weapon];

    // --- autoaim ---
    // Preloads the stored autoaim preference into memory (a no-op if some other
    // scene already loaded it this session -- see getAutoAim()'s own caching) so
    // Player.getAimAngle() can read it synchronously every frame via
    // isAutoAimEnabled(), rather than awaiting a storage read on every shot. Toggling
    // it later, from PauseMenu's settings modal, updates that same cache instantly
    // (see SaveManager.setAutoAim()), so a mid-level change takes effect immediately
    // without needing this level to reload.
    await getAutoAim();

    // --- challenge mode ---
    // Same preload-then-cache pattern as getAutoAim() above: defaults to true (see
    // SaveManager.getChallengeMode()), and just needs to be resolved once before the
    // time-limit field below is picked.
    this.challengeModeEnabled = await getChallengeMode();

    // --- state ---
    this.bulletTimeActive = false;
    this.gameEnded = false;
    this.downHeld = false;
    this.bulletCleanupFrame = 0; // throttles destroyOffscreenBullets to every 4th frame

    // --- time limit (optional per-level; omit for no limit and no HUD display) ---
    // With challenge mode on, a level's challengeTimeMs takes over from its regular
    // timeLimitMs -- falling back to timeLimitMs if the level doesn't define a
    // challenge-specific one, so levels without a challengeTimeMs behave exactly as
    // they did before challenge mode existed.
    //
    // Hint playback is exempt from this: it's a preview of the recorded hint run
    // (see HintPlayback in HintReplay.js), not a real attempt, and the hint itself
    // was recorded against the level's normal timeLimitMs -- so it always plays back
    // on that same normal timer regardless of whatever the *viewer's* own challenge
    // mode setting happens to be right now.
    this.usingChallengeTimer = this.challengeModeEnabled
      && !this.isHintPlayback
      && level.challengeTimeMs !== undefined;
    const activeTimeLimitMs = this.usingChallengeTimer ? level.challengeTimeMs : level.timeLimitMs;
    this.timeLimitMs = activeTimeLimitMs !== undefined ? activeTimeLimitMs : null;
    this.timeRemainingMs = this.timeLimitMs;

    // Always-on stopwatch, unlike timeRemainingMs above -- runs for every level
    // regardless of whether it has a time limit, purely so recordLevelCompletion() has
    // a "time spent on the level" to save. Uses raw delta, not scaledDelta, so it's not
    // displayed anywhere (that would need its own formatting/HUD slot); it's only ever
    // read once, at the moment of winning.
    this.elapsedMs = 0;

    this.goalActivated = false; // guards startGoalActivationParticles firing more than once

    // --- hint recording (dev tool) ---
    if (HINT_RECORDING_ENABLED) {
      this.hintRecorder = new HintRecorder();
    }

    // --- seeded RNG, used by Enemy.shoot() for accuracy spread instead of
    // Math.random(). During hint playback this is seeded from the recorded run's
    // stored seed (base36-encoded in the level file to keep it short -- see
    // HintRecorder.copyToClipboard() -- hence the fromB36() here), so the same input
    // script always produces the same enemy shots as it did when recorded. Outside
    // of hint playback the seed doesn't matter -- Date.now() is just as good as
    // Math.random() there. ---
    this.rng = new SeededRandom(this.isHintPlayback ? fromB36(level.hintReplay.seed) : Date.now());

    // --- hint playback: paces itself off the recording's own scaledDt (not real dt)
    // so a bullet-time stretch in the original run doesn't replay in slow motion --
    // see the fuller reasoning in HintPlayback's doc comment in HintReplay.js.
    // level.hintReplay.frames is the packed "dt,bitmask[,angle]|..." string --
    // HintPlayback decodes it itself, so it's passed straight through here. ---
    if (this.isHintPlayback) {
      this.hintPlayback = new HintPlayback(level.hintReplay.frames);
    }

    // Persistent circle shown while a CHARGE-mode weapon is held at full charge --
    // created lazily the first time it's needed and destroyed when it isn't; reset
    // to null here since this scene instance is reused across levels (see winLevel()).
    this.chargeReadyIndicator = null;

    // --- background music (optional per-level) ---
    // `level.music`, if set, must already be a loaded audio key -- e.g. preloaded in
    // BootScene the same way 'menu' and 'level_select' are. No key means no music at
    // all for this level, rather than falling back to some default track. Stopped
    // below the instant the scene shuts down (scene.restart() on retry, or
    // scene.start() to level-select/menu on win/lose), so it never bleeds into
    // whatever scene/level comes next -- same pattern as MenuScene/LevelSelectScene.
    this.music = null;
    if (level.music) {
      if (this.cache.audio.exists(level.music)) {
        this.music = this.sound.add(level.music, { loop: true, volume: 0.5 });
        this.music.play();
      } else {
        console.warn(`Level ${this.levelIndex} specifies music "${level.music}", but no audio was preloaded under that key.`);
      }
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.music?.stop());

    // --- world bounds (per-level config, falls back to a default) ---
    this.worldBounds = level.worldBounds || DEFAULT_WORLD_BOUNDS;
    this.physics.world.setBounds(0, 0, this.worldBounds.width, this.worldBounds.height);
    // Arcade's default 60 physics steps/sec each move a body by velocity*delta in one
    // uncapped hop, checking collision only at the destination -- a fast enough bullet
    // can clear a thin platform's whole width in one step and never register as having
    // touched it. Raising the step rate (Phaser's fixedStep system then runs several
    // full physics steps per rendered frame to catch up, rather than one big one) keeps
    // native Arcade collision -- separation, bounce, everything -- doing the work, just
    // in smaller hops. At 240/s a bullet would need to exceed ~7200px/s before a single
    // step could clear the thinnest (30px) walls in this game; comfortably above
    // anything currently in Weapons.js/EnemyTypes.js, with headroom for faster ones later.
    this.physics.world.setFPS(240);
    this.cameras.main.setBounds(0, 0, this.worldBounds.width, this.worldBounds.height);

    // NOTE: this replaces the old setup where the background was a world-space object
    // (scrollFactor 1) sized to the full level and pinned at world (0,0), which
    // platformsNormal's tileSprites (see Platform.js) used as a phase reference to keep
    // their own tile pattern aligned with this one. Since the background no longer
    // scrolls in lockstep with the world, that alignment will drift. If you want
    // platform tiles to keep lining up with the background, Platform.js will need a
    // matching change -- happy to take a look if you share it.
    this.backgroundScrollFactor = level.open ? 0.8 : 0.6;
    this.background = this.add
      .tileSprite(0, 0, this.cameras.main.width, this.cameras.main.height, 'background_tile')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.background);
    // Per-level background tint -- falls back to no tint (0xffffff, i.e. the tile's
    // own natural colors) if a level doesn't specify one.
    this.background.setTint(level.backgroundColor !== undefined ? level.backgroundColor : 0xffffff);
    this.background.setTileScale(2, 2);

    // --- platforms (split by type) ---
    const platforms = createPlatforms(this, level.platforms, level.backgroundColor);
    this.platformsNormal = platforms.platformsNormal;
    this.platformsOneway = platforms.platformsOneway;
    this.platformsBreakable = platforms.platformsBreakable;
    this.platformsBounceable = platforms.platformsBounceable;
    this.platformsEnemyPassthrough = platforms.platformsEnemyPassthrough;
    this.platformsBulletPassthrough = platforms.platformsBulletPassthrough;
    this.platformsDeath = platforms.platformsDeath;
    this.platformsRedirect = platforms.platformsRedirect;

    // --- level text: world-space labels/signs that scroll with the camera like any
    // other level object (they use the default scrollFactor of 1, unlike the HUD text
    // below which is pinned to the screen with setScrollFactor(0)). Depth sits between
    // platforms and bullets, so they read as sitting in front of the level geometry
    // but never get covered up by a bullet passing through. ---
    (level.texts || []).forEach(t => {
      const style = {
        fontSize: t.fontSize !== undefined ? t.fontSize : '16px',
        color: t.color !== undefined ? t.color : '#ffffff',
      };
      this.add.text(t.x, t.y, t.text, style).setOrigin(0.5).setDepth(DEPTH.levelText);
    });

    // --- player ---
    this.player = new Player(this, level.playerSpawn.x, level.playerSpawn.y, this.weapon);

    // --- goal ---
    this.goal = this.physics.add.staticSprite(level.goal.x, level.goal.y, 'goal');
    this.goal.setDepth(DEPTH.goal);

    // --- enemies ---
    this.enemies = this.physics.add.group();
    level.enemies.forEach(e => {
      const enemy = new Enemy(this, e.x, e.y, e);
      this.enemies.add(enemy);
      // this.enemies.add() re-applies the physics group's own defaults to the enemy's
      // body (collideWorldBounds: false, allowGravity: true, etc.), undoing whatever
      // the Enemy constructor just set -- reapply the enemy's actual settings now that
      // it's in the group and won't get clobbered again.
      enemy.applyBodySettings();
    });

    // --- bullet groups ---
    this.playerBullets = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();
    // Bullets no longer collide with world bounds -- they fly straight past the edge
    // and get destroyed once they're BULLET_OFFSCREEN_MARGIN past it, in update()
    // below, so they don't visibly pop right at the boundary line.

    // --- collisions: player vs platforms ---
    this.physics.add.collider(this.player, this.platformsNormal);
    this.physics.add.collider(this.player, this.platformsBreakable);
    this.physics.add.collider(this.player, this.platformsBounceable);
    this.physics.add.collider(this.player, this.platformsEnemyPassthrough);
    this.physics.add.collider(this.player, this.platformsBulletPassthrough);
    this.physics.add.collider(this.player, this.platformsOneway, null, (player, platform) => {
      if (this.downHeld) return false; // holding down lets you drop through
      return player.body.velocity.y >= 0 && (player.body.bottom - platform.body.top) <= 12;
    });

    // --- collisions: enemies vs platforms (enemies always treat them as solid) ---
    this.physics.add.collider(this.enemies, this.platformsNormal);
    this.physics.add.collider(this.enemies, this.platformsBreakable);
    this.physics.add.collider(this.enemies, this.platformsBounceable);
    this.physics.add.collider(this.enemies, this.platformsEnemyPassthrough);
    this.physics.add.collider(this.enemies, this.platformsBulletPassthrough);
    this.physics.add.collider(this.enemies, this.platformsOneway);

    // --- collisions: bullets vs platforms ---
    // normal + breakable: bullets break on contact. oneway: no collider at all, so bullets
    // fly straight through in either direction. bounceable: bullets rebound instead of
    // breaking -- Arcade physics reflects them automatically off the immovable static body,
    // driven by each bullet's own body.bounce (set where the bullet is created).
    // enemyPassthrough: solid to player bullets (breaks the same as normal) but no
    // collider at all for enemy bullets, so enemy fire passes straight through it.
    // bulletPassthrough: like oneway, no collider at all for either bullet group -- solid
    // to the player and enemies (registered above) but every bullet flies straight through.
    //
    // Breakable is registered FIRST, ahead of every other bullet-consuming pair below.
    // Arcade checks registered pairs in order, and once a bullet's destroyed in one
    // pair's callback it's inactive for every pair checked afterward that same step --
    // so with breakable checked later, a bullet clipping the seam where a breakable
    // platform meets a normal/bounceable/enemyPassthrough one could get destroyed by
    // that other collider before the breakable overlap ever ran, leaving the platform
    // undamaged even though the bullet visibly broke. Checking breakable first means it
    // always gets first refusal on any bullet touching it, seam or not.
    this.physics.add.overlap(this.playerBullets, this.platformsBreakable, (bullet, platform) => this.damagePlatform(bullet, platform, bullet.damage !== undefined ? bullet.damage : 1, BULLET_PLAYER_TINT));
    this.physics.add.collider(this.playerBullets, this.platformsNormal, (b) => {
      this.explodeBullet(b);
      spawnBulletBreakParticles(this, b.x, b.y, BULLET_PLAYER_TINT);
      b.destroy();
    });
    this.physics.add.collider(this.playerBullets, this.platformsBounceable, (bullet) => {
      reorientBullet(bullet);
      spawnBulletBounceParticles(this, bullet.x, bullet.y, BULLET_PLAYER_TINT);
    });
    this.physics.add.collider(this.playerBullets, this.platformsEnemyPassthrough, (b) => {
      this.explodeBullet(b);
      spawnBulletBreakParticles(this, b.x, b.y, BULLET_PLAYER_TINT);
      b.destroy();
    });

    this.physics.add.overlap(this.enemyBullets, this.platformsBreakable, (bullet, platform) => {
      this.damagePlatform(bullet, platform, bullet.hitsBreakable ? 1 : 0, BULLET_ENEMY_TINT);
    });
    this.physics.add.collider(this.enemyBullets, this.platformsNormal, (b) => {
      this.explodeBullet(b, null, BULLET_ENEMY_TINT);
      spawnBulletBreakParticles(this, b.x, b.y, BULLET_ENEMY_TINT);
      b.destroy();
    });
    this.physics.add.collider(this.enemyBullets, this.platformsBounceable, (bullet) => {
      reorientBullet(bullet);
      spawnBulletBounceParticles(this, bullet.x, bullet.y, BULLET_ENEMY_TINT);
    });

    // Deliberately an overlap, not a collider -- redirect platforms aren't solid (see
    // the comment in createPlatforms), so bullets pass straight through visually and
    // only ever get repositioned/re-aimed by redirectBullet() itself. Registered for
    // both bullet groups; the player and enemies are never checked against this group
    // at all, so they pass through unaffected.
    this.physics.add.overlap(this.playerBullets, this.platformsRedirect, (bullet, area) => {
      redirectBullet(bullet, area);
      this.flashRedirectPlatform(area);
    });
    this.physics.add.overlap(this.enemyBullets, this.platformsRedirect, (bullet, area) => {
      redirectBullet(bullet, area);
      this.flashRedirectPlatform(area);
    });

    // --- other collisions ---
    this.physics.add.overlap(this.playerBullets, this.enemies, (bullet, enemy) => this.hitEnemy(bullet, enemy));
    this.physics.add.overlap(this.enemyBullets, this.player, (player, bullet) => this.hitPlayer(bullet));
    this.physics.add.overlap(this.player, this.goal, () => {
      if (this.enemies.countActive(true) === 0) {
        this.winLevel();
      }
    });
    // Deliberately an overlap, not a collider -- death platforms aren't solid (see the
    // comment in createPlatforms), so the player should pass straight through them
    // visually rather than standing on or bumping into one. Touching it at all is fatal,
    // same as falling off the world.
    this.physics.add.overlap(this.player, this.platformsDeath, () => this.loseLevel());

    // --- camera follow ---
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // --- input ---
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE,SHIFT,Q');
    // These are brand-new Key objects (isDown defaults to false) even if the player is
    // mid-restart with a movement key physically still held -- see heldKeyCodes above.
    syncHeldKeys(
      this.cursors.up, this.cursors.down, this.cursors.left, this.cursors.right,
      this.keys.W, this.keys.A, this.keys.S, this.keys.D, this.keys.SPACE, this.keys.SHIFT, this.keys.Q
    );
    this.input.mouse.disableContextMenu();

    // --- HUD (fixed to camera) ---
    this.hud = new Hud(this, {
      hasTimer: this.timeLimitMs !== null,
      challengeMode: this.usingChallengeTimer,
      hasEnemies: level.enemies.length > 0,
      // Hint playback is a preview, not a real attempt -- there's nothing to pause
      // or retry mid-preview (see the isHintPlayback guards on keydown-E/R below), so
      // the buttons that front those actions are hidden rather than shown non-
      // functional.
      showControlButtons: !this.isHintPlayback,
    });

    // --- pause menu ---
    this.isPaused = false;
    this.pauseModalContainer = null;
    // Defensive reset: this.time (unlike physics.world/tweens) survives a scene
    // restart/start rather than being recreated (see the comment in loseLevel()), so
    // if a previous instance of this scene ever ended while still paused, this.time
    // would otherwise carry that paused state straight into this fresh level -- and
    // every delayedCall it schedules from here on (hit-flash clears, platform
    // damage-flash clears) would silently never fire. PauseMenu's restart/level-select
    // buttons already call resumeGame() first specifically to avoid that, but this is
    // a cheap backstop against any other path that might someday skip it.
    this.time.paused = false;
    // Bound via the keyboard plugin's own event, not polled in update(), so it still
    // fires the instant E is pressed even though update() bails out early while
    // isPaused is true (which is what actually freezes gameplay). Browsers fire
    // repeated keydown events for a key held past the OS's key-repeat delay --
    // event.repeat is only true for those synthetic repeats, not the initial press --
    // so without this guard, holding E would toggle pause on and off over and over
    // instead of just once.
    this.input.keyboard.on("keydown-E", (event) => {
      if (this.isHintPlayback) return; // no pausing over a hint preview -- see the Hud showControlButtons wiring above
      if (event.repeat) return;
      this.togglePause();
    });
    // Same reasoning for R -- bound via the keyboard event rather than polled, so it
    // still fires a quick retry even while paused, not just during live gameplay.
    // During live gameplay a bare keypress has nothing visible under the cursor to
    // confirm it landed, so retryLevelWithFlash() gives it its own brief camera flash
    // first. While paused, the pause menu is already up (and its own RESTART button
    // retries instantly, no flash) -- so R mirrors that instead of adding a flash on
    // top of a screen that's already telling you the game is paused.
    this.input.keyboard.on("keydown-R", () => {
      if (this.isHintPlayback) return; // no retrying over a hint preview -- see the Hud showControlButtons wiring above
      if (this.isPaused) {
        this.retryLevel();
      } else {
        this.retryLevelWithFlash();
      }
    });
    // SPACE also closes the pause menu, same as clicking RESUME -- bound via the
    // keyboard event (not polled) for the same reason as E/R above: it needs to fire
    // even while update() is bailing out early. No effect while not paused -- SPACE's
    // jump input during live play comes from the polled this.keys.SPACE in
    // Player.update, not this event, so this doesn't double up on jumping.
    this.input.keyboard.on("keydown-SPACE", () => {
      if (this.isPaused) this.resumeGame();
    });
    // Dev tool: copies the current run's recorded input frames to the clipboard as
    // JSON, ready to paste into a level's hintReplay field. No-op unless
    // HINT_RECORDING_ENABLED is on -- doesn't fire during real play by accident.
    this.input.keyboard.on("keydown-P", () => {
      if (!HINT_RECORDING_ENABLED) return;
      this.hintRecorder.copyToClipboard()
        .then(({ recordedCount, simplifiedCount }) =>
          console.log(`Hint replay copied (${recordedCount} frames recorded, ${simplifiedCount} after simplification).`))
        .catch((err) => console.error("Failed to copy hint replay:", err));
    });
    // Dev tool: press O to immediately preview this level's recorded hint replay --
    // same scene.restart({ hintPlayback: true }) the real HINT button uses (see
    // requestHintReplay() in EndScreen.js), just without the loss requirement or the
    // rewarded-ad gate real players go through, so a hint can be sanity-checked right
    // after pasting it into Levels.js without needing to actually lose the level
    // first. No-op unless HINT_RECORDING_ENABLED is on, this level actually has a
    // hintReplay recorded yet, and this session isn't itself already a hint playback
    // (which would otherwise let O recursively restart into itself).
    this.input.keyboard.on("keydown-O", () => {
      if (!HINT_RECORDING_ENABLED || this.isHintPlayback) return;
      if (!this.levelData.hintReplay) {
        console.warn("No hintReplay recorded for this level -- press P to copy one to the clipboard, then paste it into Levels.js first.");
        return;
      }
      this.scene.restart({ levelIndex: this.levelIndex, hintPlayback: true });
    });

    // Tell CrazyGames active gameplay has begun -- covers both a fresh level start
    // and a retry (scene.restart() tears down and rebuilds the scene, running create()
    // again). Skipped during hint playback, which isn't real played time -- see the
    // comment on notifyGameplayStart() in SaveManager.js.
    if (!this.isHintPlayback) notifyGameplayStart();

    // Everything above is done -- this.keys, this.cursors, physics groups, the HUD,
    // etc. are all in place -- so it's now safe for update() to run.
    this.sceneReady = true;
  }

  togglePause() {
    if (this.gameEnded) return; // no pausing over the win/lose screen
    if (this.isPaused) {
      this.resumeGame();
    } else {
      this.pauseGame();
    }
  }

  pauseGame() {
    if (this.isPaused || this.gameEnded) return;
    this.isPaused = true;
    this.physics.pause();
    // Tweens (explosion/particle effects, etc.) and delayed calls (platform hit-flash
    // resets) both run independently of this scene's own update() loop, so they need
    // to be frozen explicitly -- otherwise they'd keep animating behind the pause menu.
    this.tweens.pauseAll();
    this.time.paused = true;
    // Sprite animations (player run/idle/rise/fall, any enemy anims) are also driven
    // independently of update() -- physics.pause() freezes movement but a still-playing
    // idle/run cycle would keep advancing frames behind the pause menu without this.
    // this.anims is the game-wide AnimationManager (shared across scenes), but that's
    // fine here since only one scene is ever actually running gameplay at a time.
    this.anims.pauseAll();
    // Re-arm the same guard Player uses against the click that started the level (see
    // fireInputArmed in Player.js) -- update() doesn't run at all while paused, so
    // without this, the very click that lands on "Resume" is still down on the first
    // post-pause frame and would otherwise read as an immediate fire input.
    this.player.fireInputArmed = false;
    this.music?.pause();
    notifyGameplayStop();
    showPauseMenu(this).catch((err) => console.error("Failed to show pause menu:", err));
  }

  resumeGame() {
    if (!this.isPaused) return;
    this.isPaused = false;
    if (this.pauseModalContainer) {
      this.pauseModalContainer.destroy(); // exclusive=true by default, so this destroys its children too
      this.pauseModalContainer = null;
    }
    this.physics.resume();
    this.tweens.resumeAll();
    this.time.paused = false;
    this.anims.resumeAll();
    this.music?.resume();
    if (!this.isHintPlayback) notifyGameplayStart();
  }

  // Quick retry, callable from anywhere (R key while paused, the HUD's retry button,
  // PauseMenu's RESTART button) without any flash of its own -- there's already
  // something on screen confirming the press landed in all three cases (the pause
  // menu, or the button itself). No retrying over the win/lose screen, same as
  // togglePause(). resumeGame() first (a no-op if we weren't paused) for the same
  // reason PauseMenu's restart button calls it before scene.restart() -- it's what
  // clears this.time.paused, which otherwise survives into the next scene instance
  // and leaves every delayedCall the new level schedules (hit-flash clears, platform
  // damage-flash clears) never firing.
  retryLevel() {
    if (this.gameEnded) return;
    this.resumeGame();
    this.scene.restart({ levelIndex: this.levelIndex });
  }

  // R-key wrapper around retryLevel() for the live-gameplay case: a bare keypress has
  // no button-press visual of its own, so this gives it one -- a faint full-screen
  // overlay that fades out -- before the scene actually restarts. Only reached while
  // not paused (see the keydown-R handler above); resumeGame() below is a no-op in
  // that case, kept only as a harmless backstop.
  retryLevelWithFlash() {
    if (this.gameEnded) return;
    this.resumeGame();
    // scrollFactor(0) + world-space (0,0) origin, same trick EndScreen/PauseMenu use
    // for their overlays, keeps this pinned to the viewport regardless of camera
    // scroll. Depth 150 sits above the HUD (99-100) but below the pause modal (1000)
    // and end screen (200) -- not that either can be showing here, since gameEnded
    // and the pause-menu path above already rule those out.
    const flash = this.add.rectangle(0, 0, 1280, 720, this.levelData.backgroundColor, RETRY_FLASH_ALPHA)
      .setOrigin(0).setScrollFactor(0).setDepth(150);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: RETRY_FLASH_DURATION_MS,
      onComplete: () => flash.destroy(),
    });
    this.time.delayedCall(RETRY_FLASH_DURATION_MS, () => this.retryLevel());
  }

  hitEnemy(bullet, enemy) {
    const damage = bullet.damage !== undefined ? bullet.damage : 1;
    const bulletAngle = bullet.rotation; // capture before bullet.destroy() below
    // Exclude the directly-hit enemy from the splash -- it's already about to take
    // `damage` from the direct hit below, so including it too would double-damage it.
    this.explodeBullet(bullet, enemy);
    spawnBulletBreakParticles(this, bullet.x, bullet.y, BULLET_PLAYER_TINT);
    bullet.destroy();
    enemy.applyKnockback(bulletAngle, bullet.knockbackScale !== undefined ? bullet.knockbackScale : 1);
    const dead = enemy.hit(damage);
    if (dead) {
      spawnEnemyDeathParticles(this, enemy.x, enemy.y);
      enemy.destroy();

      // Defensive check: Phaser's registered overlap between player and goal
      // re-evaluates every physics step regardless of enemy count, so this
      // should already fire on its own next step -- but check explicitly
      // here too in case the player is already standing on the goal the
      // instant the last enemy dies, so there's no dependency on ordering.
      if (this.enemies.countActive(true) === 0 && this.physics.overlap(this.player, this.goal)) {
        this.winLevel();
      }
    }
  }

  // Beam equivalent of hitEnemy() above -- applied once per enemy the beam pierces
  // through in a single shot. No explodesOnHit handling here since it's driven by a
  // per-bullet flag the beam doesn't have (see Weapons.js beam entry); a future
  // exploding beam could add that back in.
  //
  // knockbackScale (default 1) mirrors bullet.knockbackScale in hitEnemy() -- pass
  // the beam's charge ratio here so a barely-charged beam shoves less.
  hitEnemyWithBeam(enemy, damage, angle, knockbackScale = 1) {
    spawnBulletBreakParticles(this, enemy.x, enemy.y, BULLET_PLAYER_TINT);
    enemy.applyKnockback(angle, knockbackScale);
    const dead = enemy.hit(damage);
    if (dead) {
      spawnEnemyDeathParticles(this, enemy.x, enemy.y);
      enemy.destroy();
      if (this.enemies.countActive(true) === 0 && this.physics.overlap(this.player, this.goal)) {
        this.winLevel();
      }
    }
  }

  hitPlayer(bullet) {
    if (CHEAT) return;

    if (this.gameEnded) return;
    // isHintPlayback: loseLevel() below already no-ops during a hint preview (it's a
    // ghost run, not a real attempt -- see loseLevel()'s own guard), so this never
    // actually ends the level. The explode/particles/destroy/flash feedback used to
    // also get skipped here whenever HINT_RECORDING_ENABLED was false, on the theory
    // that a real player watching a hint preview shouldn't see it -- but that made a
    // hint replay's hits completely invisible (no flash, bullet doesn't even
    // disappear), which meant a replay-consistency bug like the corner-warp one
    // earlier could land a hit and nobody watching would ever notice. So this now
    // always shows the same feedback a live hit would, regardless of
    // HINT_RECORDING_ENABLED -- loseLevel() below is still the only thing gated on
    // isHintPlayback (via its own guard), so nothing about level-ending behavior
    // changes.
    // excludeObj = this.player: the direct hit below already handles the player's
    // death, so explodeBullet's own player-splash check (see explodeBullet) skips
    // re-triggering it -- this call is just for the splash against any enemies/
    // breakable platforms nearby, plus the expanding-circle visual. A no-op entirely
    // if this bullet's weapon/enemy type isn't explodesOnHit.
    this.explodeBullet(bullet, this.player, BULLET_ENEMY_TINT);
    spawnBulletBreakParticles(this, bullet.x, bullet.y, BULLET_ENEMY_TINT);
    bullet.destroy();
    this.cameras.main.flash(80, 200, 40, 40);
    this.loseLevel();
  }

  // If the bullet's weapon has explodesOnHit set, damages every enemy AND every
  // breakable platform within explosionRadius (except excludeObj, already handled by
  // the direct-hit path that called this) and shows a brief expanding-circle effect.
  // Called only where a bullet actually breaks -- normal/breakable platforms and enemy
  // hits -- never for a bounceable rebound or for bullets cleaned up offscreen.
  explodeBullet(bullet, excludeObj = null, tint = BULLET_PLAYER_TINT) {
    if (!bullet.explodesOnHit) return;

    const { x, y, explosionRadius: radius, damage } = bullet;
    const enemy = this.enemyBullets.contains(bullet);
    this.spawnExplosionEffect(x, y, radius, enemy ? BULLET_ENEMY_TINT : undefined);

    // includeStatic must be true here -- breakable platforms live in a static physics
    // group, and overlapCirc excludes static bodies by default, which is why the splash
    // previously only ever found (dynamic) enemies.
    if (!enemy || bullet.hitsBreakable) {
      const bodies = this.physics.overlapCirc(x, y, radius, true, true);
      bodies.forEach((body) => {
        const obj = body.gameObject;
        if (!obj || obj === excludeObj || !obj.active) return;

        if (this.enemies.contains(obj) && !enemy) {
          // Splash-caught enemies get knocked back too, same as a direct hit -- but
          // radiating outward from the explosion's center rather than along the
          // bullet's travel direction, since each enemy in the blast sits at its own
          // angle from that center. The directly-hit enemy (excludeObj) isn't touched
          // here; it already got its own knockback from the bullet's travel angle in
          // hitEnemy()/hitEnemyWithBeam() before this ever runs.
          const knockbackAngle = Phaser.Math.Angle.Between(x, y, obj.x, obj.y);
          obj.applyKnockback(knockbackAngle, bullet.knockbackScale !== undefined ? bullet.knockbackScale : 1);
          if (obj.hit(damage)) {
            spawnEnemyDeathParticles(this, obj.x, obj.y);
            obj.destroy();
          }
        } else if (this.platformsBreakable.contains(obj)) {
          this.damagePlatformAtPoint(obj.x, obj.y, obj, damage, tint);
        }
      });
    }

    // Enemy-fired explosions (blaster-type projectiles -- see EnemyTypes.js) also
    // catch the player in their blast, even on a near-miss that only directly hit a
    // platform or another enemy -- gated to this.enemyBullets specifically so the
    // player's own explosive weapons (playerBullets) never hurt the player standing
    // near their own blast. excludeObj still applies here too, so hitPlayer() below
    // (which already handles a direct hit) doesn't double up with this splash check.
    if (this.enemyBullets.contains(bullet) && this.player !== excludeObj
      && this.player.active && !this.gameEnded && !CHEAT) {
      const dist = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
      if (dist <= radius) {
        // See hitPlayer()'s comment above -- the HINT_RECORDING_ENABLED-gated flash
        // suppression that used to sit here was removed for the same reason: a
        // splash hit during hint playback needs to be just as visible as a direct
        // one, or a replay-consistency bug landing one is invisible to whoever's
        // watching.
        this.cameras.main.flash(80, 200, 40, 40);
        this.loseLevel();
      }
    }

    if (this.enemies.countActive(true) === 0 && this.physics.overlap(this.player, this.goal)) {
      this.winLevel();
    }
  }

  // Instant hitscan fire for isBeam weapons (see Weapons.js) -- called from
  // Player.fireWeapon instead of createBullet(). Unlike a travelling bullet this
  // resolves everything in one step: find how far the beam reaches before a solid
  // (normal/enemyPassthrough/bounceable) platform stops it, then damage every
  // breakable platform and every enemy it pierces through along the way, then draw
  // the beam.
  // chargeRatio (0, 1]: how charged the shot was at release -- see
  // Player.getChargeRatio(). Defaults to 1 (fully charged) same as fireWeapon().
  // aimAngle (radians): computed by the caller (Player.fireWeapon(), via
  // getAimAngle()) rather than re-derived here from a pointer -- this is what makes
  // a beam weapon subject to the same autoaim/manual-override logic as any other
  // weapon, instead of always firing straight at the mouse. Angle origin is the
  // player's own position (this.x, this.y), same as getAimAngle() and every other
  // weapon's aim -- a small, pre-existing difference from originX/originY (the
  // weapon sprite tip, used below only as the beam's actual visual/raycast origin)
  // that's negligible given how close the two points are.
  fireBeamWeapon(player, aimAngle, chargeRatio = 1) {
    const weapon = player.weapon;
    const damage = weapon.damage * chargeRatio;
    const originX = player.weaponSprite.x;
    const originY = player.weaponSprite.y;
    const angle = applyWeaponSpread(weapon, aimAngle);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const maxRange = weapon.beamRange || Math.hypot(this.worldBounds.width, this.worldBounds.height);

    // How far the beam travels before something solid stops it -- platformsNormal and
    // platformsEnemyPassthrough are the two groups a regular bullet collides-and-breaks
    // against; platformsBounceable is included too, but as a blocker rather than a
    // reflector, since an instantly-resolved beam has no travel left to bounce
    // mid-flight (same reasoning as fireEnemyBeam() below). Everything else
    // (breakable, oneway, bulletPassthrough) never blocks it, matching how bullets
    // already treat those.
    let beamLength = maxRange;
    [this.platformsNormal, this.platformsEnemyPassthrough, this.platformsBounceable].forEach((group) => {
      group.children.iterate((platform) => {
        if (!platform || !platform.active) return;
        const t = this.raycastRect(originX, originY, dx, dy, platform.body);
        if (t !== null && t < beamLength) beamLength = t;
      });
    });

    // Pierce every breakable platform up to that stopping distance, damaging each
    // one -- unlike a bullet, the beam never stops or gets consumed by breakables.
    // Snapshot first: damagePlatformAtPoint can destroy() a platform mid-loop, which
    // would otherwise mutate this same group's internal array while we're iterating it
    // and cause the next platform to be skipped.
    this.platformsBreakable.getChildren().slice().forEach((platform) => {
      if (!platform || !platform.active) return;
      const t = this.raycastRect(originX, originY, dx, dy, platform.body);
      if (t !== null && t <= beamLength) {
        this.damagePlatformAtPoint(originX + dx * t, originY + dy * t, platform, damage, BULLET_PLAYER_TINT);
      }
    });

    // Pierce every enemy up to that same stopping distance. Snapshot first, same reason
    // as above -- hitEnemyWithBeam can destroy() an enemy, which removes it from
    // this.enemies mid-loop and would skip whichever enemy shifts into its slot.
    this.enemies.getChildren().slice().forEach((enemy) => {
      if (!enemy || !enemy.active) return;
      const t = this.raycastRect(originX, originY, dx, dy, enemy.body);
      if (t !== null && t <= beamLength) {
        this.hitEnemyWithBeam(enemy, damage, angle, chargeRatio);
      }
    });

    this.spawnBeamEffect(originX, originY, angle, beamLength, weapon.beamWidth || 6, chargeRatio);

    if (weapon.recoil) {
      const recoilVec = new Phaser.Math.Vector2();
      this.physics.velocityFromRotation(angle, -weapon.recoil, recoilVec);
      player.setVelocity(player.body.velocity.x + recoilVec.x, player.body.velocity.y + recoilVec.y);
    }
  }

  // Ray-vs-AABB intersection (the standard "slab method"): given a ray starting at
  // (originX, originY) with unit direction (dx, dy), returns the distance to the
  // nearest point where it enters `body`'s rectangle, or null if it misses entirely
  // (including rectangles entirely behind the origin). Works against both static
  // platform bodies and dynamic enemy bodies -- both expose x/y (top-left) and
  // width/height the same way.
  raycastRect(originX, originY, dx, dy, body) {
    const invDx = 1 / dx;
    const invDy = 1 / dy;
    const left = body.x, right = body.x + body.width;
    const top = body.y, bottom = body.y + body.height;

    let t1 = (left - originX) * invDx;
    let t2 = (right - originX) * invDx;
    if (t1 > t2) [t1, t2] = [t2, t1];

    let t3 = (top - originY) * invDy;
    let t4 = (bottom - originY) * invDy;
    if (t3 > t4) [t3, t4] = [t4, t3];

    const tmin = Math.max(t1, t3, 0);
    const tmax = Math.min(t2, t4);
    if (tmax < tmin) return null;
    return tmin;
  }

  // Instant hitscan fire for beam-type enemies (see EnemyTypes.js's isBeam entries),
  // called from Enemy.shoot() instead of Enemy.fireBullet(). Mirrors fireBeamWeapon()
  // above but simpler in one way: there's only ever one possible target (the player,
  // not a whole pierceable group of enemies). Like fireBeamWeapon(), platformsBounceable
  // is treated as blocking rather than reflecting -- bouncing a bullet is just giving
  // its body a new velocity, but an instantly-resolved beam has no travel to bounce
  // mid-flight, so a genuine reflection would need its own effect entirely. Treating
  // it as solid instead keeps beam behavior a reasonable match for how a regular
  // bullet would have been stopped at that same platform.
  fireEnemyBeam(enemy, angle) {
    const originX = enemy.x;
    const originY = enemy.y;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const maxRange = enemy.beamRange || Math.hypot(this.worldBounds.width, this.worldBounds.height);

    // How far the beam travels before something solid stops it. platformsNormal and
    // platformsBounceable are the two groups a regular enemy bullet already collides
    // (and stops/bounces) against -- see the enemyBullets colliders in create().
    // platformsEnemyPassthrough, platformsOneway, and platformsBulletPassthrough
    // never block enemy fire (no collider is registered for enemyBullets against any
    // of them), so they're left out here too, for the same reason.
    let beamLength = maxRange;
    [this.platformsNormal, this.platformsBounceable].forEach((group) => {
      group.children.iterate((platform) => {
        if (!platform || !platform.active) return;
        const t = this.raycastRect(originX, originY, dx, dy, platform.body);
        if (t !== null && t < beamLength) beamLength = t;
      });
    });

    // Pierce every breakable platform up to that stopping distance, damaging each
    // one -- same as fireBeamWeapon(), the beam never stops or gets consumed by
    // breakables, unlike a regular enemy bullet.
    this.platformsBreakable.getChildren().slice().forEach((platform) => {
      if (!platform || !platform.active) return;
      const t = this.raycastRect(originX, originY, dx, dy, platform.body);
      if (enemy.hitsBreakable && t !== null && t <= beamLength) {
        this.damagePlatformAtPoint(originX + dx * t, originY + dy * t, platform, 1, BULLET_ENEMY_TINT);
      }
    });

    // Only the player can be hit here -- unlike fireBeamWeapon(), there's no group of
    // enemies to pierce through.
    const t = this.raycastRect(originX, originY, dx, dy, this.player.body);
    if (t !== null && t <= beamLength) {
      this.hitPlayerWithBeam();
    }

    this.spawnBeamEffect(originX, originY, angle, beamLength, enemy.beamWidth || 4, 1, BULLET_ENEMY_TINT);
  }

  // Beam equivalent of hitPlayer() above -- called from fireEnemyBeam() when its
  // raycast reaches the player. No bullet object exists here to destroy or spawn
  // break particles at, so this is just the CHEAT/gameEnded guard and the actual
  // death, shared with hitPlayer()'s tail end.
  hitPlayerWithBeam() {
    if (CHEAT) return;
    if (this.gameEnded) return;
    // See hitPlayer()'s comment above -- same reasoning, flash is no longer
    // suppressed during hint playback just because HINT_RECORDING_ENABLED is false.
    this.cameras.main.flash(80, 200, 40, 40);
    this.loseLevel();
  }

  // Brief rectangle flash along the beam's path -- fades out fast since the beam
  // itself is resolved instantly rather than travelling like a bullet.
  //
  // chargeRatio (default 1) scales the beam's base 0.9 opacity down toward
  // CHARGE_MIN_OPACITY the same way Player.fireWeapon scales a regular bullet's
  // alpha -- a barely-charged beam reads as noticeably fainter than a fully-charged
  // one, on top of dealing less damage/knockback.
  //
  // color (default BULLET_PLAYER_TINT) lets non-player callers -- currently just
  // fireEnemyBeam() -- draw their beam in a different tint (BULLET_ENEMY_TINT) so it
  // reads as hostile fire rather than the player's own weapon.
  spawnBeamEffect(x, y, angle, length, width, chargeRatio = 1, color = BULLET_PLAYER_TINT) {
    const baseOpacity = 0.9;
    const opacity = baseOpacity * (CHARGE_MIN_OPACITY + (1 - CHARGE_MIN_OPACITY) * chargeRatio);
    const beam = this.add.rectangle(x, y, length, width, color, opacity);
    beam.setOrigin(0, 0.5);
    beam.setRotation(angle);
    beam.setDepth(DEPTH.bullet);
    this.tweens.add({
      targets: beam,
      alpha: 0,
      duration: 120,
      onComplete: () => beam.destroy(),
    });
  }

  // One-frame flash of the "ready" circle at (x, y), for a COOLDOWN-mode weapon's
  // shot -- unlike CHARGE mode (which shows the same circle continuously while held
  // at full charge, see update()), a cooldown weapon fires the instant it's clicked,
  // so this just marks that instant instead of tracking a held state.
  spawnFireReadyIndicator(x, y) {
    const circle = drawFireReadyRing(this, x, y);
    this.tweens.add({
      targets: circle,
      alpha: 0,
      duration: 300,
      onComplete: () => circle.destroy(),
    });
  }

  // Brief expanding, fading circle so an explosion actually reads as one rather than
  // dealing invisible splash damage. color defaults to the player weapons' existing
  // orange -- explodeBullet() below passes BULLET_ENEMY_TINT instead for enemy-fired
  // explosions, so the two read as distinct at a glance.
  spawnExplosionEffect(x, y, radius, color = 0xffaa33) {
    const circle = this.add.circle(x, y, radius, color, 0.5).setDepth(DEPTH.explosion);
    this.tweens.add({
      targets: circle,
      scale: { from: 0.2, to: 1 },
      alpha: { from: 0.5, to: 0 },
      duration: 250,
      onComplete: () => circle.destroy(),
    });
  }

  damagePlatform(bullet, platform, damage, tint) {
    this.explodeBullet(bullet, platform, tint);
    const x = bullet.x, y = bullet.y;
    bullet.destroy();
    if (damage != 0) this.damagePlatformAtPoint(x, y, platform, damage, tint);
  }

  // Called right after a player bullet is created (see Player.fireWeapon), in case its
  // spawn point -- now the weapon sprite's tip, not the player's own center -- is
  // already inside a platform that would normally destroy it on contact. A bullet that
  // spawns fully embedded like that can't be counted on to trigger Arcade's own
  // collider/overlap the instant it appears (and if it's aimed straight into the wall,
  // it may never separate out on its own), so this checks its exact spawn point up
  // front and applies the same "hit" behavior a normal collision would have -- damaging
  // a breakable platform, or exploding/destroying against a normal/enemyPassthrough one.
  // A no-op if the spawn point isn't inside any of those (the overwhelmingly common
  // case). Bounceable is deliberately excluded -- bullets rebound off it rather than
  // being destroyed, so there's nothing to resolve early there.
  resolveBulletSpawnInWall(bullet, tint = BULLET_PLAYER_TINT) {
    if (!bullet.active) return;

    const bodies = this.physics.overlapRect(bullet.x, bullet.y, 1, 1, false, true);
    const objects = bodies.map((body) => body.gameObject);

    // Breakable checked first, same priority as the registered overlap order above --
    // a spawn point simultaneously touching a breakable and a normal/enemyPassthrough
    // platform at a seam should still damage the breakable rather than just vanish.
    const breakable = objects.find((obj) => obj && obj.active && this.platformsBreakable.contains(obj));
    if (breakable) {
      this.damagePlatform(bullet, breakable, bullet.damage !== undefined ? bullet.damage : 1, tint);
      return;
    }

    const solid = objects.find((obj) => obj && obj.active && (this.platformsNormal.contains(obj) || this.platformsEnemyPassthrough.contains(obj)));
    if (solid) {
      this.explodeBullet(bullet, solid, tint);
      spawnBulletBreakParticles(this, bullet.x, bullet.y, tint);
      bullet.destroy();
    }
  }

  // The actual "take damage, flash, break particles, maybe destroy" logic for a
  // breakable platform, split out from damagePlatform() above so the beam weapon
  // (which has no bullet object -- it's a hitscan, not a travelling projectile) can
  // apply the same damage/feedback at a point along its path.
  damagePlatformAtPoint(x, y, platform, damage, tint) {
    spawnBulletBreakParticles(this, x, y, tint);
    platform.health -= damage;
    platform.setTintFill(lightenColor(platform.baseTint, HIT_FLASH_BRIGHTEN_AMOUNT));
    // Same fix as Enemy.hit(): cancel any still-pending clear from an earlier hit on
    // this platform before scheduling a new one, so a fast-firing weapon landing two
    // hits within 60ms can't have the first hit's timer clear the flash early (or,
    // once the platform's tinted as bright as it gets, mask a later hit's flash
    // entirely).
    if (platform.tintClearEvent) this.time.removeEvent(platform.tintClearEvent);
    platform.tintClearEvent = this.time.delayedCall(60, () => {
      platform.tintClearEvent = null;
      if (platform.active) platform.setTint(platform.baseTint);
    });
    if (platform.health <= 0) {
      spawnPlatformBreakParticles(this, platform.x, platform.y);
      platform.destroy();
    } else {
      spawnPlatformHitParticles(this, x, y);
    }
  }

  // Brief brighten-flash on a redirect platform, confirming it just redirected a
  // bullet -- same setTintFill/delayedCall pattern as damagePlatformAtPoint's
  // hit-flash above, minus the damage/particles since redirect platforms are
  // indestructible and non-solid. platform.baseTint is set in createPlatforms()
  // (redirect isn't a blend-texture type, so it gets a normal PLATFORM_TINTS
  // tint + baseTint like 'normal'/'death'/etc platforms do). Reuses the same
  // tintClearEvent cancel-and-reschedule guard as the other hit-flashes, so a
  // bullet re-triggering the overlap while still passing through (or a second
  // bullet arriving moments later) just extends the flash instead of letting an
  // earlier clear cut a later one short.
  flashRedirectPlatform(platform) {
    platform.setTintFill(lightenColor(platform.baseTint, HIT_FLASH_BRIGHTEN_AMOUNT));
    if (platform.tintClearEvent) this.time.removeEvent(platform.tintClearEvent);
    platform.tintClearEvent = this.time.delayedCall(60, () => {
      platform.tintClearEvent = null;
      if (platform.active) platform.setTint(platform.baseTint);
    });
  }

  // async because we wait on recordLevelCompletion() to learn whether this run beat
  // the stored best time before showing the end screen -- the screen needs that
  // answer to decide whether to display "NEW BEST!". gameEnded is still set and
  // physics still paused synchronously above the await, so the level itself freezes
  // immediately; only the end-screen overlay itself is delayed by the save round-trip
  // (typically near-instant on localStorage, capped at SDK_TIMEOUT_MS on CrazyGames).
  async winLevel() {
    // Hint playback is a preview, not a real attempt -- it ends on its own once the
    // recorded frames run out (see updateHintPlayback()/endHintPlayback()), not
    // because the ghost happened to touch the goal. Without this guard, a hint replay
    // reaching the goal would trigger a real win: saving a completion time and
    // showing the normal win screen with a NEXT LEVEL button, which isn't what a
    // preview should do.
    if (this.isHintPlayback) return;
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.physics.pause();
    this.music?.stop();
    notifyGameplayStop();
    // Same reset as loseLevel() -- if bullet time is still active (SHIFT held) at the
    // moment of winning, this.time/tweens/physics.world timeScale would otherwise stay
    // slowed. Scene.start('GameScene', ...) for the next level reuses this same scene
    // instance rather than creating a fresh one, so this.time persists across it just
    // like it does across a restart -- without this, weapon cooldowns (and everything
    // else scaled by time.timeScale) would start the next level still in slow motion.
    this.bulletTimeActive = false;
    this.physics.world.timeScale = 1;
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    setBulletTimeAudioEffect(false);
    const elapsedMs = this.elapsedMs;
    let isNewBest = false;
    try {
      ({ isNewBest } = await recordLevelCompletion(this.levelIndex, elapsedMs));
    } catch (err) {
      console.error('Failed to save level completion:', err);
    }
    showEndScreen(this, 'LEVEL COMPLETE', '#63c722', true, elapsedMs, isNewBest);
  }

  loseLevel(message = 'YOU DIED') {
    // Same reasoning as the guard at the top of winLevel() -- a hint preview dying to
    // an enemy bullet or a death platform along the way shouldn't cut the preview
    // short with a real death screen. It plays out to the end of the recorded frames
    // regardless (endHintPlayback() handles how it actually ends).
    if (this.isHintPlayback) return;
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.physics.pause();
    this.music?.stop();
    this.player.setTint(0x555555);
    notifyGameplayStop();
    // If the player dies mid-bullet-time (SHIFT still held), update()'s toggle-off logic
    // below never runs again since it bails out on gameEnded -- reset these here instead,
    // so a retry doesn't inherit bullet time's slowdown. this.time in particular persists
    // across a scene restart, unlike physics.world/tweens, so this is the one that
    // actually causes cooldowns to stay slowed if it's skipped.
    this.bulletTimeActive = false;
    this.physics.world.timeScale = 1;
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    setBulletTimeAudioEffect(false);
    showEndScreen(this, message, '#e24b4a', false);
  }

  // Reached once the recorded hint frames run out (called from updateHintPlayback()).
  // Mirrors winLevel()/loseLevel()'s pause-and-show-screen shape, but there's no
  // completion time to save and no NEXT LEVEL button to offer -- it's a preview, not
  // an attempt. showEndScreen's own hint-button logic checks this.isHintPlayback
  // (still true at this point, never reset) to suppress showing a second HINT button
  // on this screen.
  endHintPlayback() {
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.physics.pause();
    this.music?.stop();
    // Same reset as winLevel()/loseLevel() -- the viewer may still be holding SHIFT
    // (see applyBulletTimeToggle() in updateHintPlayback()) at the exact moment the
    // recorded frames run out, which would otherwise leave this.time/tweens/
    // physics.world timeScale slowed for whatever comes next (this.time persists
    // across a scene restart, so it'd carry the slowdown into a real retry too).
    this.bulletTimeActive = false;
    this.physics.world.timeScale = 1;
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    setBulletTimeAudioEffect(false);
    showEndScreen(this, 'HINT', '#3aa0ff', false);
  }

  // Drives the player/enemies through a prerecorded input script instead of live
  // input, in place of the normal per-frame logic below -- called from update()
  // instead of the real update body whenever this.isHintPlayback is set. Frame
  // timing/lookup is delegated to this.hintPlayback (see HintPlayback in
  // HintReplay.js); this method's job is just to drive real Player.update()/
  // Enemy.update() calls with whatever input state that returns, exactly like the
  // real update() loop does with live input.
  //
  // Reads the live SHIFT key via applyBulletTimeToggle() -- the same toggle real
  // gameplay uses -- so a viewer can hold SHIFT during a hint to slow the whole
  // preview down for a closer look, independent of whatever bullet time the
  // recording itself used.
  updateHintPlayback(time, delta) {
    this.applyBulletTimeToggle();
    const scaledDelta = delta * this.time.timeScale;

    // --- time limit countdown -- same raw-delta pacing as the real update() loop,
    // so the HUD timer actually counts down during a hint instead of sitting frozen
    // at its starting value for the whole preview. ---
    if (this.timeLimitMs !== null) {
      this.timeRemainingMs = Math.max(0, this.timeRemainingMs - delta);
    }

    // --- parallax background -- see the identical lines in the normal (non-hint)
    // update() path for the full explanation. This early-returns before ever
    // reaching that code, so without this the background just sits frozen at
    // whatever tilePosition it last had for the entire hint preview. ---
    this.background.tilePositionX = this.cameras.main.scrollX * this.backgroundScrollFactor;
    this.background.tilePositionY = this.cameras.main.scrollY * this.backgroundScrollFactor;

    // --- walk the recording forward by this tick's real elapsed time, clipping to
    // each recorded frame's own boundary rather than feeding it straight through as
    // one lump -- see HintPlayback.advance()'s doc comment in HintReplay.js for the
    // full reasoning. Ordinarily this loop runs once (this tick's delta fits
    // entirely within the current frame's remaining time), but it can run several
    // times if a real tick happens to straddle one or more short recorded frames, or
    // zero times (falls through immediately) if the current frame's remaining time
    // has already been exhausted and there's nothing left to spend until the
    // recording ends.
    //
    // player.update() is called once per slice here, in the recording's own
    // temporal order -- NOT once per real tick off whichever frame occupied the
    // largest share of it (an earlier version of this method tried that, on the
    // theory that Arcade Physics only ever integrates the LAST velocity set before
    // its own automatic per-real-frame step anyway, so using the longest-duration
    // frame's input would be more representative of the tick as a whole). That
    // broke edge-triggered, one-shot actions like jumping: Player.js's jump only
    // fires on the exact instant `up` is held AND body.blocked.down is true
    // (`if (jump && this.body.blocked.down) this.setVelocityY(...)`), evaluated
    // fresh on every call. With only one call per tick, a short jump frame
    // followed by a longer non-jumping frame in the same tick meant the jump
    // frame's input was simply never seen -- the jump silently never fired.
    // Calling update() per slice, in order, avoids that for free: the frame that
    // actually triggers the jump is the one that runs `setVelocityY`, and later
    // calls that tick don't touch velocityY unless their own conditions call for
    // it, so the jump survives into whatever Arcade eventually integrates. The
    // remaining imprecision -- Arcade's own automatic stepping only ever actually
    // integrates position using whichever slice's setVelocityX/Y calls happened
    // LAST before its once-per-real-frame step runs, not each slice's individually
    // -- is a smaller, harder-to-notice cost than dropping inputs outright, and
    // matches this method's original design. ---
    let remaining = scaledDelta;
    while (!this.hintPlayback.done) {
      // Force the newly-active frame's genuine fire/dash event (if any) the INSTANT
      // it becomes active -- even before spending any of its duration below -- at
      // its exact recorded angle, BEFORE player.update() runs its own
      // cooldown/charge/dash logic off the merely-interpolated pointer. See
      // HintPlayback.takePendingFireEvent()'s doc comment for why trusting that
      // per-tick logic to independently land on the same frame (and angle) the
      // original recording did isn't reliable -- without this, a fast/held-fire
      // weapon can end up firing a step or two into the turn toward its next
      // target angle instead of right at it. Returns null every call except the
      // first one after this frame became current, so this is safe to call every
      // loop iteration (and every tick, while stuck on the same frame) without
      // double-forcing anything.
      const evt = this.hintPlayback.takePendingFireEvent();
      if (evt) {
        if (evt.fire) this.player.forceFireEvent(evt.angle, this.playerBullets);
        if (evt.dash) this.player.forceDashEvent(evt.angle);
      }

      const frameRemaining = this.hintPlayback.remainingInCurrentFrame();
      if (frameRemaining <= 0) {
        // A recorded frame with dt rounded down to 0ms -- nothing to spend, just
        // move straight to the next one without touching this tick's budget.
        this.hintPlayback.advance(0);
        continue;
      }
      if (remaining <= 0) break; // no real time left to spend this tick

      const stepDt = Math.min(remaining, frameRemaining);
      const f = this.hintPlayback.currentInputState();
      this.downHeld = f.down;

      // Reconstructs a fake pointer.worldX/worldY from the *live* player position
      // (not whatever position the player happened to be at when this was
      // recorded, which may not even exactly match during playback) plus the
      // recorded aim angle, at an arbitrary distance -- Player.js only ever
      // derives a direction from the pointer via Angle.Between(player, pointer),
      // never uses its actual distance, so any nonzero AIM_RAY_LENGTH reproduces
      // the same angle. See HintReplay.js's top comment for why storing an angle
      // instead of a point is safe to do at all.
      const aimWorldX = this.player.x + Math.cos(f.angle) * AIM_RAY_LENGTH;
      const aimWorldY = this.player.y + Math.sin(f.angle) * AIM_RAY_LENGTH;

      // stepDt -- clipped to this frame's remaining duration, not the tick's raw
      // scaledDelta -- so cooldown/charge/dash-lock timers etc count down by
      // precisely as much time as this recorded frame actually covered.
      this.player.update(time, stepDt, stepDt, {
        cursors: { left: { isDown: f.left }, right: { isDown: f.right }, up: { isDown: f.up } },
        keys: { A: { isDown: f.left }, D: { isDown: f.right }, W: { isDown: f.up }, SPACE: { isDown: f.fire }, Q: { isDown: f.dash } },
        pointer: {
          worldX: aimWorldX,
          worldY: aimWorldY,
          // Approximation for the fire-ready flash position (Player.js's only use
          // of screen-space x/y) -- unscrolling the synthetic world point by the
          // current camera scroll. It's a one-frame cosmetic flash, so exactness
          // doesn't matter.
          x: aimWorldX - this.cameras.main.scrollX,
          y: aimWorldY - this.cameras.main.scrollY,
          leftButtonDown: () => f.fire,
          rightButtonDown: () => f.dash,
        },
        bulletGroup: this.playerBullets,
        // Actual shots/dashes during hint playback are driven exclusively by the
        // forceFireEvent()/forceDashEvent() calls above, off the recording's own
        // timeline -- see Player.update()'s suppressAutoFire doc comment for why
        // this update() call itself must not also be allowed to trigger one on
        // its own.
        suppressAutoFire: true,
      });

      this.hintPlayback.advance(stepDt);
      remaining -= stepDt;
    }

    if (this.hintPlayback.done) {
      this.endHintPlayback();
      return;
    }

    this.enemies.children.iterate((enemy) => {
      if (enemy && enemy.active) enemy.update(time, delta, scaledDelta);
    });

    this.bulletCleanupFrame++;
    if (this.bulletCleanupFrame % 4 === 0) {
      destroyOffscreenBullets(this.playerBullets, this.worldBounds, BULLET_OFFSCREEN_MARGIN);
      destroyOffscreenBullets(this.enemyBullets, this.worldBounds, BULLET_OFFSCREEN_MARGIN);
    }

    // Surfaces the bullet-time vignette for the whole preview -- a constant visual
    // cue that this is a hint replay, not real gameplay -- independent of whatever
    // this.bulletTimeActive actually is right now (that still reflects the live
    // SHIFT key, still genuinely slowing the preview down via applyBulletTimeToggle()
    // above; this is just the HUD tint, forced on regardless). enemiesLeft/
    // timeRemainingMs are along for the ride since Hud.update() expects all three,
    // not because either is meaningful mid-preview.
    this.hud.update({
      enemiesLeft: this.enemies.countActive(true),
      bulletTimeActive: true,
      timeRemainingMs: this.timeRemainingMs,
    });
  }

  // Reads the live SHIFT key and applies/reverts the bullet-time slowdown across
  // physics/time/tweens/anims, only touching anything on an actual state change.
  // Shared by the real update() loop and updateHintPlayback() -- the latter calls
  // this too, so a viewer can hold SHIFT during a hint to slow the preview down for
  // a closer look, exactly like real gameplay, even though the input driving the
  // player/enemies themselves is prerecorded rather than live.
  applyBulletTimeToggle() {
    const wantsBulletTime = this.keys.SHIFT.isDown;
    if (wantsBulletTime === this.bulletTimeActive) return;
    this.bulletTimeActive = wantsBulletTime;
    // BULLET_TIME_MULTIPLIER is the speed multiplier applied while bullet time is
    // active (e.g. 0.5 = half speed). time.timeScale and tweens.timeScale both use
    // the intuitive "higher = faster" convention, so scale applies directly to them.
    // Arcade's physics.world.timeScale is inverted: with the default fixedStep mode,
    // a LOWER value makes physics steps trigger more often (i.e. faster movement), so
    // it needs the reciprocal to actually slow gravity/velocity/bullets down in sync
    // with everything else.
    const scale = this.bulletTimeActive ? BULLET_TIME_MULTIPLIER : 1;
    this.physics.world.timeScale = 1 / scale;
    this.time.timeScale = scale;
    this.tweens.timeScale = scale;
    this.anims.globalTimeScale = scale;
    setBulletTimeAudioEffect(this.bulletTimeActive);
  }

  update(time, delta) {
    // create() is async and hasn't necessarily finished setting up this.keys,
    // this.cursors, physics groups, etc. yet -- see the comment on the sceneReady
    // flag near the top of create(). Bail out entirely until it has.
    if (!this.sceneReady) return;

    // --- hint recording: catch the "closing" frame. Arcade's physics step resolves
    // overlaps (e.g. the bullet that kills the last enemy, or a death-platform touch)
    // *before* this update() call runs each frame -- so on the exact frame gameEnded
    // first flips true, winLevel()/loseLevel() have already fired above, and the
    // early return below would skip this frame's hint recording entirely. That would
    // leave the recording's total duration exactly one frame short of the real run:
    // during playback, the ghost would then pause one frame *before* that same
    // overlap has time to resolve again, freezing on a not-quite-dead enemy (or a
    // not-quite-dead player). recordClosingFrameOnce() (see HintReplay.js) records
    // this frame's dt with no held inputs -- nothing meaningful drives the player
    // after the game is over -- giving playback that missing bit of time back, and
    // is safe to call every frame gameEnded stays true since only the first call
    // actually records.
    if (HINT_RECORDING_ENABLED && !this.isHintPlayback && this.gameEnded) {
      this.hintRecorder.recordClosingFrameOnce(delta * this.time.timeScale);
    }

    if (this.gameEnded || this.isPaused) return;

    if (this.isHintPlayback) {
      this.updateHintPlayback(time, delta);
      return;
    }

    // --- elapsed-time stopwatch for save purposes -- always runs, regardless of
    // whether this level has a timeLimitMs, and uses the same raw/unscaled delta so
    // bullet time can't be used to inflate a "fast" completion time. Not displayed
    // anywhere; only read once, in winLevel(). ---
    this.elapsedMs += delta;

    // --- time limit countdown -- uses the raw, unscaled delta (not scaledDelta),
    // specifically so bullet time can't stretch how fast the clock actually runs out.
    // Only runs at all if this level set a timeLimitMs; otherwise stays null and the
    // HUD never shows a timer. ---
    if (this.timeLimitMs !== null) {
      this.timeRemainingMs = Math.max(0, this.timeRemainingMs - delta);
    }

    // --- bullet time toggle ---
    this.applyBulletTimeToggle();

    // --- bullet-time-scaled delta, used for all charge/dash/cooldown timing ---
    const scaledDelta = delta * this.time.timeScale;

    // --- parallax background: sprite itself stays pinned to the screen (scrollFactor
    // 0), so the "camera factor" effect is faked by shifting the tile pattern by
    // scroll * factor each frame instead of moving the sprite ---
    this.background.tilePositionX = this.cameras.main.scrollX * this.backgroundScrollFactor;
    this.background.tilePositionY = this.cameras.main.scrollY * this.backgroundScrollFactor;

    // --- down-hold state, used by the one-way platform process callback ---
    this.downHeld = this.cursors.down.isDown || this.keys.S.isDown;

    // Phaser only recalculates pointer.worldX/worldY when the pointer itself emits an
    // event (move/down/up/wheel) -- panning or otherwise moving the camera doesn't
    // trigger that, so if the mouse sits still while the camera scrolls, worldX/worldY
    // stay stuck at the pre-scroll value. Everything downstream (weapon aim in
    // Player.js, fireBeamWeapon, the charge-ready indicator below) reads worldX/worldY
    // assuming it reflects "wherever the cursor currently is", so it needs refreshing
    // against the current camera transform once per frame, before any of that runs.
    this.input.activePointer.updateWorldPoint(this.cameras.main);

    // --- hint recording (dev tool): captures the same raw input this frame's
    // player.update() call is about to act on, so the recorded frame and the actual
    // resulting movement always match. Uses scaledDelta (bullet-time included), since
    // that's what "amount of game action" actually happened this frame -- see
    // HintPlayback's doc comment in HintReplay.js for why playback paces itself off
    // that instead of raw dt. The actual recordFrame() call is deferred until after
    // player.update() runs, below -- see the comment there for why. ---
    let hintInputs;
    if (HINT_RECORDING_ENABLED) {
      hintInputs = {
        left: this.cursors.left.isDown || this.keys.A.isDown,
        right: this.cursors.right.isDown || this.keys.D.isDown,
        up: this.cursors.up.isDown || this.keys.W.isDown,
        down: this.cursors.down.isDown || this.keys.S.isDown,
        fire: this.input.activePointer.leftButtonDown() || this.keys.SPACE.isDown,
        dash: this.input.activePointer.rightButtonDown() || this.keys.Q.isDown,
      };
    }

    // --- delegate all player input/movement/dash/charge handling to the Player entity ---
    this.player.update(time, delta, scaledDelta, {
      cursors: this.cursors,
      keys: this.keys,
      pointer: this.input.activePointer,
      bulletGroup: this.playerBullets,
    });

    // --- hint recording (dev tool), continued: only now, after player.update() has
    // actually run, do we know whether a shot fired or a dash triggered this tick --
    // and, critically, at what angle. That can't be read off the raw input above:
    // CHARGE-mode weapons fire on RELEASE (Player.updateChargeFire), while
    // COOLDOWN-mode weapons and dashing fire on PRESS, or on any later held frame
    // the instant their cooldown clears (Player.updateCooldownFire, and the dash
    // check in Player.update()) -- there's no single input-edge rule that covers
    // both. So this reads the real event straight from Player.js's own
    // firedThisFrame/dashedThisFrame (+ firedAngle/dashedAngle) flags, set inside
    // fireWeapon()/startDash(), rather than guessing from button transitions here. ---
    if (HINT_RECORDING_ENABLED) {
      const shotFired = this.player.firedThisFrame || this.player.dashedThisFrame;
      const shotAngle = this.player.firedThisFrame ? this.player.firedAngle : this.player.dashedAngle;
      this.hintRecorder.recordFrame(scaledDelta, hintInputs, shotAngle, shotFired);
    }

    // --- charge-ready indicator: shown while a CHARGE-mode weapon is held at full
    // charge, tracking the pointer each frame; removed the instant it isn't (charge
    // dropped below full, released/fired, or switched off charging entirely). The
    // COOLDOWN-mode equivalent is a one-frame flash instead -- see
    // spawnFireReadyIndicator(), triggered from Player.updateCooldownFire(). ---
    const isFullyCharged = this.player.isCharging && this.player.getChargeRatio() === 1;
    if (isFullyCharged) {
      if (!this.chargeReadyIndicator) {
        this.chargeReadyIndicator = drawFireReadyRing(this, 0, 0);
      }
      this.chargeReadyIndicator.setPosition(this.input.activePointer.x, this.input.activePointer.y);
    } else if (this.chargeReadyIndicator) {
      this.chargeReadyIndicator.destroy();
      this.chargeReadyIndicator = null;
    }

    // --- enemy shoot-cooldown/range checks (scaledDelta so bullet time slows enemy
    // fire rate the same way it slows everything else) ---
    this.enemies.children.iterate((enemy) => {
      if (enemy && enemy.active) enemy.update(time, delta, scaledDelta);
    });

    // --- clean up bullets that have flown well past the world edge (every 4th frame --
    // a bullet moving at a constant velocity doesn't need checking 60 times a second to
    // catch it ~100px past the boundary; a few frames of slop doesn't matter here) ---
    this.bulletCleanupFrame++;
    if (this.bulletCleanupFrame % 4 === 0) {
      destroyOffscreenBullets(this.playerBullets, this.worldBounds, BULLET_OFFSCREEN_MARGIN);
      destroyOffscreenBullets(this.enemyBullets, this.worldBounds, BULLET_OFFSCREEN_MARGIN);
    }

    // --- HUD updates ---
    const enemiesLeft = this.enemies.countActive(true);
    this.hud.update({
      enemiesLeft,
      bulletTimeActive: this.bulletTimeActive,
      timeRemainingMs: this.timeRemainingMs,
    });

    // --- goal activation particles: start once, the moment the last enemy is cleared ---
    if (!this.goalActivated && enemiesLeft === 0) {
      this.goalActivated = true;
      startGoalActivationParticles(this, this.goal.x, this.goal.y);
    }

    // --- fall off world = death ---
    if (this.player.y > this.worldBounds.height + 60) this.loseLevel();

    // --- time limit expired = death ---
    if (this.timeLimitMs !== null && this.timeRemainingMs <= 0) {
      this.loseLevel("TIME'S UP");
    }
  }
}