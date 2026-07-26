import { BULLET_TIME_MULTIPLIER, DEFAULT_WORLD_BOUNDS, BULLET_OFFSCREEN_MARGIN, HIT_FLASH_BRIGHTEN_AMOUNT, DEPTH, BULLET_PLAYER_TINT, BULLET_ENEMY_TINT } from "../data/Constants.js";
import { lightenColor } from "../data/ColorUtils.js";
import { LEVELS } from "../data/Levels.js";
import { WEAPONS, applyWeaponSpread } from "../data/Weapons.js";
import { Player } from "../entity/Player.js";
import { Enemy } from "../entity/Enemy.js";
import { createPlatforms } from "../entity/Platform.js";
import { destroyOffscreenBullets, reorientBullet, redirectBullet } from "../entity/Bullet.js";
import { Hud } from "../ui/Hud.js";
import { showEndScreen } from "../ui/EndScreen.js";
import { showPauseMenu } from "../ui/PauseMenu.js";
import { spawnBulletBreakParticles, spawnBulletBounceParticles, spawnEnemyDeathParticles, startGoalActivationParticles } from "../fx/Particles.js";
import { recordLevelCompletion } from "../save/SaveManager.js";

export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  init(data) {
    this.levelIndex = data.levelIndex || 0;
    this.levelData = LEVELS[this.levelIndex];
  }

  create() {
    const level = this.levelData;

    // --- weapon ---
    this.weapon = WEAPONS[level.weapon];

    // --- state ---
    this.bulletTimeActive = false;
    this.gameEnded = false;
    this.downHeld = false;
    this.bulletCleanupFrame = 0; // throttles destroyOffscreenBullets to every 4th frame

    // --- time limit (optional per-level; omit for no limit and no HUD display) ---
    this.timeLimitMs = level.timeLimitMs !== undefined ? level.timeLimitMs : null;
    this.timeRemainingMs = this.timeLimitMs;

    // Always-on stopwatch, unlike timeRemainingMs above -- runs for every level
    // regardless of whether it has a time limit, purely so recordLevelCompletion() has
    // a "time spent on the level" to save. Uses raw delta, not scaledDelta, so it's not
    // displayed anywhere (that would need its own formatting/HUD slot); it's only ever
    // read once, at the moment of winning.
    this.elapsedMs = 0;

    this.goalActivated = false; // guards startGoalActivationParticles firing more than once

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
    this.cameras.main.setBackgroundColor('#1a1a22');

    // --- platforms (split by type) ---
    const platforms = createPlatforms(this, level.platforms);
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

    this.physics.add.overlap(this.enemyBullets, this.platformsBreakable, (bullet, platform) => this.damagePlatform(bullet, platform, 1, BULLET_ENEMY_TINT));
    this.physics.add.collider(this.enemyBullets, this.platformsNormal, (b) => {
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
    this.physics.add.overlap(this.playerBullets, this.platformsRedirect, (bullet, area) => redirectBullet(bullet, area));
    this.physics.add.overlap(this.enemyBullets, this.platformsRedirect, (bullet, area) => redirectBullet(bullet, area));

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
    this.input.mouse.disableContextMenu();

    // --- HUD (fixed to camera) ---
    this.hud = new Hud(this, { hasTimer: this.timeLimitMs !== null, hasEnemies: level.enemies.length > 0 });

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
    // isPaused is true (which is what actually freezes gameplay).
    this.input.keyboard.on("keydown-E", () => this.togglePause());
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
  }

  hitEnemy(bullet, enemy) {
    const damage = bullet.damage !== undefined ? bullet.damage : 1;
    const bulletAngle = bullet.rotation; // capture before bullet.destroy() below
    // Exclude the directly-hit enemy from the splash -- it's already about to take
    // `damage` from the direct hit below, so including it too would double-damage it.
    this.explodeBullet(bullet, enemy);
    spawnBulletBreakParticles(this, bullet.x, bullet.y, BULLET_PLAYER_TINT);
    bullet.destroy();
    enemy.applyKnockback(bulletAngle);
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
  hitEnemyWithBeam(enemy, damage, angle) {
    spawnBulletBreakParticles(this, enemy.x, enemy.y, BULLET_PLAYER_TINT);
    enemy.applyKnockback(angle);
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
    if (this.gameEnded) return;
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
    this.spawnExplosionEffect(x, y, radius);

    // includeStatic must be true here -- breakable platforms live in a static physics
    // group, and overlapCirc excludes static bodies by default, which is why the splash
    // previously only ever found (dynamic) enemies.
    const bodies = this.physics.overlapCirc(x, y, radius, true, true);
    bodies.forEach((body) => {
      const obj = body.gameObject;
      if (!obj || obj === excludeObj || !obj.active) return;

      if (this.enemies.contains(obj)) {
        if (obj.hit(damage)) {
          spawnEnemyDeathParticles(this, obj.x, obj.y);
          obj.destroy();
        }
      } else if (this.platformsBreakable.contains(obj)) {
        this.damagePlatformAtPoint(obj.x, obj.y, obj, damage, tint);
      }
    });

    if (this.enemies.countActive(true) === 0 && this.physics.overlap(this.player, this.goal)) {
      this.winLevel();
    }
  }

  // Instant hitscan fire for isBeam weapons (see Weapons.js) -- called from
  // Player.fireWeapon instead of createBullet(). Unlike a travelling bullet this
  // resolves everything in one step: find how far the beam reaches before a solid
  // (normal/enemyPassthrough) platform stops it, then damage every breakable
  // platform and every enemy it pierces through along the way, then draw the beam.
  fireBeamWeapon(player, pointer) {
    const weapon = player.weapon;
    const aimAngle = Phaser.Math.Angle.Between(player.x, player.y, pointer.worldX, pointer.worldY);
    const angle = applyWeaponSpread(weapon, aimAngle);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const maxRange = weapon.beamRange || Math.hypot(this.worldBounds.width, this.worldBounds.height);

    // How far the beam travels before something solid stops it -- same two groups a
    // regular bullet collides-and-breaks against (platformsNormal,
    // platformsEnemyPassthrough); everything else (breakable, bounceable, oneway,
    // bulletPassthrough) never blocks it, matching how bullets already treat those.
    let beamLength = maxRange;
    [this.platformsNormal, this.platformsEnemyPassthrough].forEach((group) => {
      group.children.iterate((platform) => {
        if (!platform || !platform.active) return;
        const t = this.raycastRect(player.x, player.y, dx, dy, platform.body);
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
      const t = this.raycastRect(player.x, player.y, dx, dy, platform.body);
      if (t !== null && t <= beamLength) {
        this.damagePlatformAtPoint(player.x + dx * t, player.y + dy * t, platform, weapon.damage, BULLET_PLAYER_TINT);
      }
    });

    // Pierce every enemy up to that same stopping distance. Snapshot first, same reason
    // as above -- hitEnemyWithBeam can destroy() an enemy, which removes it from
    // this.enemies mid-loop and would skip whichever enemy shifts into its slot.
    this.enemies.getChildren().slice().forEach((enemy) => {
      if (!enemy || !enemy.active) return;
      const t = this.raycastRect(player.x, player.y, dx, dy, enemy.body);
      if (t !== null && t <= beamLength) {
        this.hitEnemyWithBeam(enemy, weapon.damage, angle);
      }
    });

    this.spawnBeamEffect(player.x, player.y, angle, beamLength, weapon.beamWidth || 6);

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

  // Brief rectangle flash along the beam's path -- fades out fast since the beam
  // itself is resolved instantly rather than travelling like a bullet.
  spawnBeamEffect(x, y, angle, length, width) {
    const beam = this.add.rectangle(x, y, length, width, BULLET_PLAYER_TINT, 0.9);
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

  // Brief expanding, fading circle so an explosion actually reads as one rather than
  // dealing invisible splash damage.
  spawnExplosionEffect(x, y, radius) {
    const circle = this.add.circle(x, y, radius, 0xffaa33, 0.5).setDepth(DEPTH.explosion);
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
    this.damagePlatformAtPoint(x, y, platform, damage, tint);
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
      platform.destroy();
    }
  }

  // async because we wait on recordLevelCompletion() to learn whether this run beat
  // the stored best time before showing the end screen -- the screen needs that
  // answer to decide whether to display "NEW BEST!". gameEnded is still set and
  // physics still paused synchronously above the await, so the level itself freezes
  // immediately; only the end-screen overlay itself is delayed by the save round-trip
  // (typically near-instant on localStorage, capped at SDK_TIMEOUT_MS on CrazyGames).
  async winLevel() {
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.physics.pause();
    const elapsedMs = this.elapsedMs;
    let isNewBest = false;
    try {
      ({ isNewBest } = await recordLevelCompletion(this.levelIndex, elapsedMs));
    } catch (err) {
      console.error('Failed to save level completion:', err);
    }
    showEndScreen(this, 'LEVEL COMPLETE', '#63c722', true, elapsedMs, isNewBest);
  }

  loseLevel() {
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.physics.pause();
    this.player.setTint(0x555555);
    // If the player dies mid-bullet-time (SHIFT still held), update()'s toggle-off logic
    // below never runs again since it bails out on gameEnded -- reset these here instead,
    // so a retry doesn't inherit bullet time's slowdown. this.time in particular persists
    // across a scene restart, unlike physics.world/tweens, so this is the one that
    // actually causes cooldowns to stay slowed if it's skipped.
    this.bulletTimeActive = false;
    this.physics.world.timeScale = 1;
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    showEndScreen(this, 'YOU DIED', '#e24b4a', false);
  }

  update(time, delta) {
    if (this.gameEnded || this.isPaused) return;

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
    const wantsBulletTime = this.keys.SHIFT.isDown;
    if (wantsBulletTime !== this.bulletTimeActive) {
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
    }

    // --- bullet-time-scaled delta, used for all charge/dash/cooldown timing ---
    const scaledDelta = delta * this.time.timeScale;

    // --- down-hold state, used by the one-way platform process callback ---
    this.downHeld = this.cursors.down.isDown || this.keys.S.isDown;

    // --- delegate all player input/movement/dash/charge handling to the Player entity ---
    this.player.update(time, delta, scaledDelta, {
      cursors: this.cursors,
      keys: this.keys,
      pointer: this.input.activePointer,
      bulletGroup: this.playerBullets,
    });

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
      this.loseLevel();
    }
  }
}