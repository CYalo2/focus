import { ENEMY_TYPES } from "../data/EnemyTypes.js";
import { ENEMY_MAX_INACCURACY_RAD, ENEMY_BASE_TINT, ENEMY_WARNING_TIME_MS, ENEMY_WARNING_TINT, ENEMY_OUT_OF_RANGE_TINT, HIT_FLASH_BRIGHTEN_AMOUNT, ENEMY_KNOCKBACK_DRAG, DEPTH } from "../data/Constants.js";
import { lightenColor } from "../data/ColorUtils.js";
import { createBullet } from "./Bullet.js";

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, config = {}) {
    super(scene, x, y, 'enemy');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTH.enemy);

    const typeDefaults = ENEMY_TYPES[config.type || 'default'];

    this.setVelocityX(0); // default type stays in its spawn x position
    this.affectedByGravity = config.affectedByGravity !== undefined ? config.affectedByGravity : typeDefaults.affectedByGravity;
    this.health = config.health !== undefined ? config.health : typeDefaults.health;
    this.accuracy = config.accuracy !== undefined ? config.accuracy : typeDefaults.accuracy;
    this.projectileSpeed = config.projectileSpeed !== undefined ? config.projectileSpeed : typeDefaults.projectileSpeed;
    this.projectileCount = config.projectileCount !== undefined ? config.projectileCount : typeDefaults.projectileCount;
    // Fixed firing direction, in degrees -- if set (by config or the type's own
    // default, as with 'turret'), shoot() fires along this angle instead of aiming at
    // the player. Stays undefined for types like 'default' that don't define one,
    // which is exactly what keeps them aiming at the player.
    this.angleDeg = config.angleDeg !== undefined ? config.angleDeg : typeDefaults.angleDeg;

    // Velocity (px/s) applied away from an incoming hit's direction when a player
    // projectile hits this enemy. 0 (the default) means no knockback at all -- see
    // applyKnockback, which skips all work in that case.
    this.knockback = config.knockback !== undefined ? config.knockback
      : (typeDefaults.knockback !== undefined ? typeDefaults.knockback : 0);

    // Attack range box -- shoot() only fires while the player is within this many
    // pixels of the enemy's *current* position on each side (recomputed every shot,
    // so it tracks the enemy if it moves). Any side left undefined is unbounded.
    this.leftDist = config.leftDist !== undefined ? config.leftDist : typeDefaults.leftDist;
    this.rightDist = config.rightDist !== undefined ? config.rightDist : typeDefaults.rightDist;
    this.topDist = config.topDist !== undefined ? config.topDist : typeDefaults.topDist;
    this.bottomDist = config.bottomDist !== undefined ? config.bottomDist : typeDefaults.bottomDist;

    this.applyBodySettings();

    // Initial threat-state color -- without this, an enemy that starts out of range
    // (or, in principle, already past its warning window) would show its default
    // appearance for the first frame or two until update() first runs.
    this.updateThreatTint();

    // Cooldown is tracked manually (decremented in update()) rather than with a
    // scene.time.addEvent loop, so that entering range doesn't have to wait out
    // whatever's left of an interval that already ticked while out of range -- see
    // update() below.
    this.shootCooldownMs = config.shootCooldownMs !== undefined ? config.shootCooldownMs : typeDefaults.shootCooldownMs;
    // Delay before the enemy's first shot. Left undefined (by config or the type's own
    // default), this just falls back to shootCooldownMs, same as before -- set it to
    // override how long the enemy waits before it can fire for the very first time,
    // independent of the cooldown used between subsequent shots.
    this.initialCooldownMs = config.initialCooldownMs !== undefined ? config.initialCooldownMs : typeDefaults.initialCooldownMs;
    this.shootCooldownRemaining = this.initialCooldownMs !== undefined ? this.initialCooldownMs : this.shootCooldownMs;
  }

  // Called every frame by GameScene.update(). Counts the cooldown down using
  // scaledDelta (so bullet time slows enemy fire rate the same way the old
  // scene.time-based timer did, since scene.time respects time.timeScale), and fires
  // the instant the cooldown is up AND the player is in range -- rather than only
  // checking range at fixed intervals, which could leave a shot "blocked" for up to a
  // full cooldown after the player steps into range.
  update(time, delta, scaledDelta) {
    if (!this.active || this.scene.gameEnded) return;
    this.shootCooldownRemaining -= scaledDelta;
    if (this.shootCooldownRemaining <= 0 && this.isPlayerInRange()) {
      this.shoot();
      this.shootCooldownRemaining = this.shootCooldownMs;
    }
    this.updateThreatTint();
  }

  // Arcade Physics Groups reapply their own defaults (collideWorldBounds: false,
  // allowGravity: true, etc.) to every member on .add() as well as .create() -- this
  // clobbers whatever was set here in the constructor the moment GameScene calls
  // this.enemies.add(enemy). Call this again right after that to restore them.
  applyBodySettings() {
    this.setCollideWorldBounds(true);
    this.body.allowGravity = this.affectedByGravity;
    this.setDragX(ENEMY_KNOCKBACK_DRAG); // lets applyKnockback's impulse bleed off, like player recoil
  }

  // Checks the player is within this enemy's attack range box, measured from the
  // enemy's current position -- any side left undefined (leftDist, rightDist,
  // topDist, bottomDist) is unbounded on that side.
  isPlayerInRange() {
    const player = this.scene.player;
    if (this.leftDist !== undefined && player.x < this.x - this.leftDist) return false;
    if (this.rightDist !== undefined && player.x > this.x + this.rightDist) return false;
    if (this.topDist !== undefined && player.y < this.y - this.topDist) return false;
    if (this.bottomDist !== undefined && player.y > this.y + this.bottomDist) return false;
    return true;
  }

  // Recolors the enemy to reflect its current threat state: ENEMY_OUT_OF_RANGE_TINT
  // if the player's outside its attack range entirely, ENEMY_WARNING_TINT if it's
  // about to fire (in range, cooldown inside ENEMY_WARNING_TIME_MS), or its default
  // appearance (clearTint) otherwise. Skipped entirely while a hit flash is in
  // progress -- tracked via tintClearEvent, see hit() -- so the flash always takes
  // visual priority and isn't overwritten a frame or two after it starts; once the
  // flash's own timer clears it, that callback calls this again to pick up whichever
  // of these states is current at that point, rather than always reverting to
  // default.
  updateThreatTint() {
    if (this.tintClearEvent) return;
    if (!this.isPlayerInRange()) {
      this.setTint(ENEMY_OUT_OF_RANGE_TINT);
    } else if (this.shootCooldownRemaining <= ENEMY_WARNING_TIME_MS) {
      this.setTint(ENEMY_WARNING_TINT);
    } else {
      this.clearTint();
    }
  }

  shoot() {
    // Fixed direction (e.g. a turret) if angleDeg is set; otherwise aim at the player,
    // same as ever. Either way, accuracy applies the same inaccuracy spread on top.
    const baseAngle = this.angleDeg !== undefined
      ? Phaser.Math.DegToRad(this.angleDeg)
      : Phaser.Math.Angle.Between(this.x, this.y, this.scene.player.x, this.scene.player.y);
    const spread = (1 - this.accuracy) * ENEMY_MAX_INACCURACY_RAD;

    for (let i = 0; i < this.projectileCount; i++) {
      const offset = (Math.random() - Math.random()) * spread; // triangular distribution, weighted toward 0
      this.fireBullet(baseAngle + offset);
    }
  }

  fireBullet(angle) {
    createBullet(this.scene, this.scene.enemyBullets, 'bulletEnemy', this.x, this.y, angle, this.projectileSpeed);
  }

  // Pushes the enemy along `angle` (the incoming bullet's direction of travel) at
  // this enemy's knockback speed -- added onto its current velocity, same as player
  // weapon recoil, so it's a brief shove that ENEMY_KNOCKBACK_DRAG (X) and
  // gravity/ground collision (Y) bring back down rather than a permanent velocity
  // change. Bails immediately when knockback is 0 (the default) -- the common case --
  // so unaffected enemies pay no per-hit cost beyond this one check.
  //
  // scale (0..1, default 1) multiplies the knockback speed -- pass a bullet's
  // knockbackScale here (see Player.fireWeapon) so a barely-charged hit shoves an
  // enemy less than a fully-charged one, same proportion as its damage.
  applyKnockback(angle, scale = 1) {
    if (!this.knockback || !scale) return;
    const knockbackVec = new Phaser.Math.Vector2();
    this.scene.physics.velocityFromRotation(angle, this.knockback * scale, knockbackVec);
    this.setVelocity(this.body.velocity.x + knockbackVec.x, this.body.velocity.y + knockbackVec.y);
  }

  // Applies damage and flashes the enemy briefly brighter (not pure white -- that would
  // wipe out the color entirely with setTintFill, or do nothing at all with setTint,
  // since multiplying by white is a no-op). Returns true if this hit killed it.
  hit(damage) {
    this.health -= damage;
    this.setTintFill(lightenColor(ENEMY_BASE_TINT, HIT_FLASH_BRIGHTEN_AMOUNT));
    // Each call to delayedCall() creates a brand new, independent timer -- with no
    // tracking, a second hit landing before the first hit's 100ms is up would still
    // leave the FIRST timer counting down to its own clearTint(), which then fires
    // early and wipes the second hit's flash out ahead of schedule (or, if the tint
    // is already at its brightest, makes a later hit produce no visible change at
    // all -- reading as the flash having "stopped working"). Cancelling any still-
    // pending timer before scheduling a fresh one keeps exactly one flash-clear alive
    // per enemy, so the visible flash always reflects the most recent hit.
    if (this.tintClearEvent) this.scene.time.removeEvent(this.tintClearEvent);
    this.tintClearEvent = this.scene.time.delayedCall(100, () => {
      this.tintClearEvent = null;
      if (this.active) this.updateThreatTint();
    });
    return this.health <= 0;
  }

}