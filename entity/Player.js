import { PLAYER_STATS, GRAVITY, DASH, CHARGING_TINT, CHARGE_READY_TINT, CHARGE_MIN_OPACITY, DEPTH } from "../data/Constants.js";
import { WEAPON_FIRE_MODE, applyWeaponSpread } from "../data/Weapons.js";
import { createBullet } from "./Bullet.js";
import { spawnDashParticles } from "../fx/Particles.js";

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, weapon) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.weapon = weapon;
    this.setCollideWorldBounds(true);
    this.setDragX(PLAYER_STATS.drag);
    this.setDepth(DEPTH.player);

    this.facing = 1; // 1 = right, -1 = left

    // charge-to-fire state (WEAPON_FIRE_MODE.CHARGE)
    this.isCharging = false;
    this.chargeElapsedMs = 0; // counts up while charging, scaled by bullet time
    this.wasPointerDown = false;

    // Guards against the click that started the level (or re-entered this scene)
    // being immediately read as a fire input on the very first update() frame --
    // fire input stays inert until the left button has been seen released at least
    // once, so the player can never spawn already-shooting. Set true the first
    // frame the button reads up; see update() below.
    this.fireInputArmed = false;

    // fire-then-cooldown state (WEAPON_FIRE_MODE.COOLDOWN)
    this.isOnCooldown = false;
    this.cooldownRemainingMs = 0; // counts down after firing, scaled by bullet time

    // dash state
    this.isDashing = false;         // true while manually integrating dash velocity each frame
    this.dashVelX = 0;
    this.dashVelY = 0;
    this.lockRemainingMs = 0; // post-dash: no gravity AND no movement input, scaled by bullet time
    this.dashCooldownRemainingMs = 0; // counts down between dashes, scaled by bullet time
  }

  // chargeRatio (0, 1]: how charged the shot was at release -- see getChargeRatio().
  // Defaults to 1 (fully charged) so COOLDOWN-mode weapons and any other caller that
  // doesn't pass one keep firing at full strength, unaffected.
  fireWeapon(pointer, bulletGroup, chargeRatio = 1) {
    // Beam weapons are instant/hitscan rather than a travelling projectile -- the
    // scene owns the platform/enemy groups a beam needs to raycast against, so it
    // (not Player) does the actual hit-detection, damage, and visual. This also
    // covers the beam's own recoil kick, so we return before the bullet-specific
    // logic below.
    if (this.weapon.isBeam) {
      this.scene.fireBeamWeapon(this, pointer, chargeRatio);
      return;
    }

    const aimAngle = Phaser.Math.Angle.Between(this.x, this.y, pointer.worldX, pointer.worldY);
    const angle = applyWeaponSpread(this.weapon, aimAngle);
    const bullet = createBullet(this.scene, bulletGroup, 'bulletPlayer', this.x, this.y, angle, this.weapon.projectileSpeed);
    bullet.damage = this.weapon.damage * chargeRatio;
    bullet.explodesOnHit = !!this.weapon.explodesOnHit;
    bullet.explosionRadius = this.weapon.explosionRadius || 0;
    // Carried alongside damage so the bullet/enemy collision handler can scale
    // knockback the same way -- pass this into enemy.applyKnockback(angle, scale)
    // instead of the enemy's full knockback every time.
    bullet.knockbackScale = chargeRatio;
    // Partial charge reads as partial opacity: CHARGE_MIN_OPACITY at chargeRatio 0,
    // fully opaque at chargeRatio 1. A no-op (alpha 1) when chargeRatio is 1, which
    // covers every weapon that doesn't define minChargeMs.
    bullet.setAlpha(CHARGE_MIN_OPACITY + (1 - CHARGE_MIN_OPACITY) * chargeRatio);

    if (this.weapon.recoil) {
      const recoilVec = new Phaser.Math.Vector2();
      this.scene.physics.velocityFromRotation(angle, -this.weapon.recoil, recoilVec);
      this.setVelocity(this.body.velocity.x + recoilVec.x, this.body.velocity.y + recoilVec.y);
    }
  }

  // WEAPON_FIRE_MODE.CHARGE: hold LEFT click to charge, release to fire toward cursor.
  updateChargeFire(scaledDelta, leftDown, leftReleasedThisFrame, pointer, bulletGroup) {
    if (leftDown && !this.isCharging && !this.isDashing) {
      this.isCharging = true;
      this.chargeElapsedMs = 0;
    }
    if (this.isCharging) {
      this.chargeElapsedMs += scaledDelta;
    }
    if (leftReleasedThisFrame) {
      if (this.isCharging) {
        const chargeRatio = this.getChargeRatio();
        if (chargeRatio !== null) {
          this.fireWeapon(pointer, bulletGroup, chargeRatio);
        }
      }
      this.isCharging = false;
    }
  }

  // How "charged" the current hold is at release, as a proportion in (0, 1] -- or
  // null if it hasn't charged enough to fire at all yet.
  // Weapons without minChargeMs keep the old all-or-nothing behavior: null below
  // chargeTimeMs, 1 at or above it (releasing early just doesn't fire, same as ever).
  // Weapons with minChargeMs can release early instead, scaled linearly from
  // minChargeMs (ratio ~0, just barely qualifies) up to chargeTimeMs (ratio 1).
  getChargeRatio() {
    const { chargeTimeMs, minChargeMs } = this.weapon;
    if (minChargeMs === undefined) {
      return this.chargeElapsedMs >= chargeTimeMs ? 1 : null;
    }
    if (this.chargeElapsedMs < minChargeMs) return null;
    if (this.chargeElapsedMs >= chargeTimeMs) return 1;
    const span = chargeTimeMs - minChargeMs;
    return span > 0 ? (this.chargeElapsedMs - minChargeMs) / span : 1;
  }

  // WEAPON_FIRE_MODE.COOLDOWN: fires on click, then can't fire again until cooldownMs
  // elapses; movement/jump multipliers apply during that cooldown the same way they
  // apply during a charge. Checks the button is currently DOWN rather than just-pressed,
  // so holding it through the cooldown fires again automatically the instant the
  // cooldown clears, with no need to release and re-click (mirrors how dashing already
  // works below in update()).
  updateCooldownFire(scaledDelta, leftDown, pointer, bulletGroup) {
    if (this.cooldownRemainingMs > 0) {
      this.cooldownRemainingMs = Math.max(0, this.cooldownRemainingMs - scaledDelta);
    }
    this.isOnCooldown = this.cooldownRemainingMs > 0;

    if (leftDown && !this.isOnCooldown && !this.isDashing) {
      this.fireWeapon(pointer, bulletGroup);
      // One-frame "ready" flash at the cursor, marking the shot -- the CHARGE-mode
      // equivalent instead shows the same circle continuously while held at full
      // charge (see GameScene.update()), since a cooldown weapon has no held state
      // to linger on.
      this.scene.spawnFireReadyIndicator(pointer.worldX, pointer.worldY);
      this.cooldownRemainingMs = this.weapon.cooldownMs;
      this.isOnCooldown = true;
    }
  }

  // Pushes the player back out of any solid platform it's currently overlapping, along
  // whichever axis needs the smaller correction -- the same logic Arcade's own
  // collision separation uses, done manually since Arcade's version doesn't work for a
  // body with no tracked per-frame velocity (see the comment at its call site). Safe to
  // call any time the player might be embedded; a no-op if it isn't overlapping anything.
  resolveEmbedding() {
    const scene = this.scene;
    const halfW = this.body.width / 2;
    const halfH = this.body.height / 2;
    const groups = [scene.platformsNormal, scene.platformsBreakable, scene.platformsBounceable, scene.platformsEnemyPassthrough];
    const bodies = scene.physics.overlapRect(this.x - halfW, this.y - halfH, this.body.width, this.body.height, false, true);

    for (const body of bodies) {
      const obj = body.gameObject;
      if (!groups.some((g) => g.contains(obj))) continue;

      const overlapX = Math.min(this.x + halfW, body.right) - Math.max(this.x - halfW, body.x);
      const overlapY = Math.min(this.y + halfH, body.bottom) - Math.max(this.y - halfH, body.y);
      if (overlapX <= 0 || overlapY <= 0) continue; // touching, not actually overlapping

      if (overlapX < overlapY) {
        this.x += this.x < body.center.x ? -overlapX : overlapX;
      } else {
        this.y += this.y < body.center.y ? -overlapY : overlapY;
      }
    }

    this.body.updateFromGameObject();
  }

  // Checks whether the player's body would overlap a solid platform (normal, breakable,
  // bounceable, or enemyPassthrough -- oneway is intentionally excluded, same as it's
  // already a soft collision from other directions) if swept from (x0, y0) to (x1, y1).
  // Used while dashing, since that moves the player by directly setting position/body
  // each frame rather than through velocity, so Phaser's normal collider resolution
  // never runs against it.
  //
  // Checks the whole swept rectangle rather than just the destination point -- a
  // destination-only check can miss solid geometry the body would have passed through
  // mid-step. That matters most right at a corner where two platforms meet (e.g. a
  // wall standing on a floor): a diagonal step's endpoint can land cleanly outside both
  // platforms individually even though the corner itself juts into the path between
  // where the step started and ended. This over-approximates slightly (a very close
  // graze past a corner gets blocked a touch earlier than it strictly needs to), which
  // is a small price for guaranteeing the dash can never end up embedded in something
  // it swept through. For a single-point check, call it with (x, y, x, y).
  //
  // skinX/skinY shrink the query rectangle on that axis by DASH.skin -- used when
  // checking a single-axis move (see updateDash) so that merely resting against a
  // surface on the OTHER axis (e.g. standing on the ground while checking a purely
  // horizontal dash) doesn't get treated as a brand new blockage. Without this, the
  // ground the player is already touching would re-trigger on every horizontal check
  // (its overlap with the body never goes away, since it's not moving), making it
  // impossible to dash at all while grounded.
  // Shrinks only the TRAILING edge of the swept box on each axis (the side you're
  // moving away from) by `skin`, leaving the LEADING edge (the side you're moving
  // toward) at full body size. That asymmetry is what makes both directions work at
  // once: full size on approach means the check still blocks exactly at contact with
  // no embedding, while the shrunk trailing edge means a surface you're already resting
  // flush against (zero gap) doesn't get treated as a fresh blockage the instant you try
  // to move away from it. When an axis isn't moving at all this step (a0 === a1, e.g.
  // checking a purely horizontal move so y0 === y1), there's no "leading" side to keep
  // precise, so both edges shrink -- that's the perpendicular-axis case (see the header
  // comment above) where all we need is to not false-block on resting contact.
  axisBounds(a0, a1, half, skin) {
    if (a1 > a0) return { min: a0 - half + skin, max: a1 + half };
    if (a1 < a0) return { min: a1 - half, max: a0 + half - skin };
    return { min: a0 - half + skin, max: a0 + half - skin };
  }

  wouldSweepCollideAt(x0, y0, x1, y1, skinX = 0, skinY = 0) {
    const scene = this.scene;
    const halfW = this.body.width / 2;
    const halfH = this.body.height / 2;
    const { min: minX, max: maxX } = this.axisBounds(x0, x1, halfW, skinX);
    const { min: minY, max: maxY } = this.axisBounds(y0, y1, halfH, skinY);
    const bodies = scene.physics.overlapRect(minX, minY, maxX - minX, maxY - minY, false, true);
    return bodies.some((body) => {
      const obj = body.gameObject;
      return scene.platformsNormal.contains(obj)
        || scene.platformsBreakable.contains(obj)
        || scene.platformsBounceable.contains(obj)
        || scene.platformsEnemyPassthrough.contains(obj);
    });
  }

  finishDash() {
    this.isDashing = false;
    this.dashVelX = 0;
    this.dashVelY = 0;
    this.setVelocity(0, 0);
    this.body.allowGravity = false; // stays off for the lock phase below
    this.lockRemainingMs = DASH.lockMs;
  }

  startDash(pointer) {
    const dashAngle = Phaser.Math.Angle.Between(this.x, this.y, pointer.worldX, pointer.worldY);

    this.dashVelX = DASH.speed * Math.cos(dashAngle);
    this.dashVelY = DASH.speed * Math.sin(dashAngle);

    this.setVelocity(0, 0);
    this.body.allowGravity = false; // gravity's contribution is folded into updateDash's manual integration instead
    this.isDashing = true;
    this.dashCooldownRemainingMs = DASH.cooldownMs;

    spawnDashParticles(this.scene, this.x, this.y);
  }

  // Per-frame velocity integration for an active dash -- this replaced an earlier
  // closed-form "position purely as a function of elapsed time since the dash started"
  // formula, since that can't represent velocity changing at an arbitrary moment (like
  // hitting a wall) -- the velocity has to persist and change over time as actual
  // state instead. Manual position-setting still means Phaser's normal collider
  // resolution never runs against this movement, so wouldSweepCollideAt() below is what
  // prevents tunneling through walls (and now also triggers the wall slow-down).
  updateDash(scaledDelta) {
    const dt = scaledDelta / 1000; // seconds, so DASH.drag/GRAVITY (already per-second units) apply directly

    // Linear drag opposing whatever direction the dash is currently moving in --
    // shrinks speed toward 0 without changing direction on its own.
    const speed = Math.hypot(this.dashVelX, this.dashVelY);
    if (speed > 0) {
      const newSpeed = Math.max(0, speed - DASH.drag * dt);
      const scale = newSpeed / speed;
      this.dashVelX *= scale;
      this.dashVelY *= scale;
    }

    // Partial gravity, same as the old formula's gravityDrop term, just applied
    // incrementally to velocity instead of baked into a closed-form position.
    this.dashVelY += GRAVITY * DASH.gravityFraction * dt;

    // Sub-step the movement so a fast dash can't skip clean over a thin wall in a
    // single frame -- without this, a wall thinner than one frame's total travel
    // distance would go completely unchecked, since only the position after the full
    // move would ever get tested, never anywhere in between. Each sub-step is capped
    // at DASH.maxStepDistance so nothing skips a wall thinner than that.
    const totalDistance = Math.hypot(this.dashVelX * dt, this.dashVelY * dt);
    const steps = Math.max(1, Math.ceil(totalDistance / DASH.maxStepDistance));
    const stepDt = dt / steps;

    for (let i = 0; i < steps; i++) {
      const targetX = this.x + this.dashVelX * stepDt;
      const targetY = this.y + this.dashVelY * stepDt;

      // Resolve each axis independently: a wall blocking one axis shouldn't also
      // freeze movement on the other -- e.g. dashing diagonally into a wall should
      // still let you slide along it on the axis that's still clear. On contact, the
      // position on that axis just doesn't update this step; overall speed still winds
      // down from the drag above, without an extra penalty specifically for touching
      // something.
      //
      // Each check sweeps the whole move, not just its endpoint -- see
      // wouldSweepCollideAt for why a destination-only check isn't enough at a corner.
      // DASH.skin is passed for both axes on every call; axisBounds applies it as a
      // trailing-edge-only shrink on whichever axis is actually moving (so a wall you're
      // moving away from doesn't block you, while one you're moving into still blocks
      // precisely) and as a symmetric shrink on the other, non-moving axis (so merely
      // resting against a surface perpendicular to this move -- e.g. standing on the
      // ground while checking a purely horizontal step -- doesn't block it either).
      if (!this.wouldSweepCollideAt(this.x, this.y, targetX, this.y, DASH.skin, DASH.skin)) {
        this.x = targetX;
      }

      if (!this.wouldSweepCollideAt(this.x, this.y, this.x, targetY, DASH.skin, DASH.skin)) {
        this.y = targetY;
      }
    }

    this.body.updateFromGameObject();

    // Final correction pass: if the player is still overlapping solid geometry after
    // the step loop above -- whatever let that happen -- push it back out along
    // whichever axis needs the smaller correction, same as Arcade's own separation
    // would. Arcade can't do this for us during a dash: its collider only separates
    // two bodies using their tracked per-frame velocity, and the player's real
    // body.velocity is pinned at (0, 0) for the whole dash (movement happens by
    // directly setting position instead) -- with zero velocity on both sides, Arcade's
    // own collision resolution just marks the body `embedded` and leaves it exactly
    // where it is rather than pushing it out. This is a manual stand-in for that.
    this.resolveEmbedding();

    // Ends once speed has decayed enough to no longer feel like a dash -- a fixed
    // duration doesn't work here, since grinding against a wall can extend how long
    // that takes versus a dash that never touches one.
    if (Math.hypot(this.dashVelX, this.dashVelY) <= DASH.minSpeed) {
      this.finishDash();
    }
  }

  // ctx: { cursors, keys, pointer, bulletGroup }
  update(time, delta, scaledDelta, ctx) {
    const { cursors, keys, pointer, bulletGroup } = ctx;

    // --- fire input (LEFT click or SPACE), branches on the weapon's fire mode ---
    const leftDown = pointer.leftButtonDown() || keys.SPACE.isDown;

    // Arm fire input the first time the button reads up -- until then (e.g. the
    // click that started the level is still being held down on this very first
    // frame) fire input is completely ignored below, so firing can't start without
    // an intervening release.
    if (!this.fireInputArmed && !leftDown) {
      this.fireInputArmed = true;
    }

    const leftReleasedThisFrame = this.fireInputArmed && !leftDown && this.wasPointerDown;

    if (this.fireInputArmed) {
      if ((this.weapon.fireMode || WEAPON_FIRE_MODE.CHARGE) === WEAPON_FIRE_MODE.COOLDOWN) {
        this.updateCooldownFire(scaledDelta, leftDown, pointer, bulletGroup);
      } else {
        this.updateChargeFire(scaledDelta, leftDown, leftReleasedThisFrame, pointer, bulletGroup);
      }
    }
    this.wasPointerDown = leftDown;

    // --- dash cooldown countdown ---
    if (this.dashCooldownRemainingMs > 0) {
      this.dashCooldownRemainingMs = Math.max(0, this.dashCooldownRemainingMs - scaledDelta);
    }

    // --- dash (RIGHT click or C, fires toward the mouse) -- checks the button is
    // currently down rather than just-pressed, so holding it through the cooldown fires
    // again automatically the instant the cooldown clears, with no need to release and
    // re-click. Blocked while charging or on weapon cooldown, same as firing is
    // blocked while dashing, for symmetry. ---
    const rightDown = pointer.rightButtonDown() || keys.Q.isDown;
    if (rightDown && !this.isDashing && !this.isCharging && !this.isOnCooldown && this.dashCooldownRemainingMs <= 0) {
      this.startDash(pointer);
    }

    if (this.isDashing) {
      this.updateDash(scaledDelta);
    }

    // --- post-dash lock: no gravity AND no movement input, then everything returns to normal ---
    if (this.lockRemainingMs > 0) {
      this.lockRemainingMs -= scaledDelta;
      if (this.lockRemainingMs <= 0) {
        this.body.allowGravity = true;
        this.setDrag(PLAYER_STATS.drag, 0); // back to normal: drag only on x, none on y
      }
    }

    // --- weapon-busy visual indicator: charging shows two stages (charging, then
    // charge-ready); cooldown mode just shows the "busy" tint for its whole duration,
    // since there's no ready/not-ready distinction to show ---
    if (this.isCharging) {
      this.setTint(this.chargeElapsedMs >= this.weapon.chargeTimeMs ? CHARGE_READY_TINT : CHARGING_TINT);
    } else if (this.isOnCooldown) {
      this.setTint(CHARGING_TINT);
    } else {
      this.clearTint();
    }

    // --- movement (reads real input each frame, unaffected by timeScale) ---
    if (!this.isDashing && this.lockRemainingMs <= 0) {
      const left = cursors.left.isDown || keys.A.isDown;
      const right = cursors.right.isDown || keys.D.isDown;
      const jump = cursors.up.isDown || keys.W.isDown;

      // Applies during either a charge or a cooldown -- both represent "weapon busy"
      const firingPenaltyActive = this.isCharging || this.isOnCooldown;
      const speedMult = firingPenaltyActive ? this.weapon.moveSpeedMultiplier : 1;
      const jumpMult = firingPenaltyActive ? this.weapon.jumpMultiplier : 1;

      if (left) { this.setVelocityX(-PLAYER_STATS.moveSpeed * speedMult); this.facing = -1; }
      else if (right) { this.setVelocityX(PLAYER_STATS.moveSpeed * speedMult); this.facing = 1; }

      if (jump && this.body.blocked.down) {
        this.setVelocityY(-PLAYER_STATS.jumpVelocity * jumpMult);
      }
    }
  }
}