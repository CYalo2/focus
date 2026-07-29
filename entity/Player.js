import {
  PLAYER_STATS,
  GRAVITY,
  DASH,
  PLAYER_BUSY_TINT,
  CHARGE_MIN_OPACITY,
  WEAPON_DISPLAY_DISTANCE,
  WEAPON_FLASH_TINT,
  WEAPON_FLASH_INTERVAL_MS,
  DEPTH,
} from "../data/Constants.js";
import { WEAPONS, WEAPON_FIRE_MODE, applyWeaponSpread } from "../data/Weapons.js";
import { createBullet } from "./Bullet.js";
import { spawnDashParticles } from "../fx/Particles.js";

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, weapon) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setScale(2);

    this.weapon = weapon;
    // The animation keys for the weapon display sprite (below) are named after
    // whatever key this weapon is registered under in WEAPONS (e.g. "default" ->
    // default_weapon_idle/_charge/_ready), so this just reverse-looks-up that key
    // from the object identity, rather than requiring WEAPONS entries to redundantly
    // carry their own key as a field too.
    this.weaponName = Object.keys(WEAPONS).find((key) => WEAPONS[key] === weapon);

    this.setCollideWorldBounds(true);
    this.setDragX(PLAYER_STATS.drag);
    this.setDepth(DEPTH.player);

    this.play("player_idle");

    // Weapon display: a separate sprite orbiting the player at a fixed radius,
    // always rotated to face the mouse (see updateWeaponDisplay()) -- fireWeapon()
    // below also spawns bullets from this sprite's position rather than the
    // player's, so shots visibly originate from the weapon itself.
    this.weaponSprite = scene.add.sprite(x, y, 'player');
    this.weaponSprite.setScale(2);
    this.weaponSprite.setDepth(DEPTH.weapon);
    this.weaponSprite.play(`${this.weaponName}_weapon_idle`);

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

    // Normally bullets spawn at the weapon sprite's tip -- but a bounceable platform is
    // the one case resolveBulletSpawnInWall() below deliberately leaves alone (bullets
    // rebound off it rather than being destroyed), so a shot fired with the weapon tip
    // stuck inside one would otherwise just get stuck bouncing in place. Falling back to
    // the player's own center avoids that without needing bounce logic to special-case
    // an embedded spawn.
    let spawnX = this.weaponSprite.x;
    let spawnY = this.weaponSprite.y;
    const bodiesAtWeaponTip = this.scene.physics.overlapRect(spawnX, spawnY, 1, 1, false, true);
    if (bodiesAtWeaponTip.some((body) => body.gameObject && this.scene.platformsBounceable.contains(body.gameObject))) {
      spawnX = this.x;
      spawnY = this.y;
    }

    const bullet = createBullet(this.scene, bulletGroup, 'bulletPlayer', spawnX, spawnY, angle, this.weapon.projectileSpeed);
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

    // Catches the case where the weapon sprite's tip is itself inside a wall when it
    // fires -- see GameScene.resolveBulletSpawnInWall() for why that needs an explicit
    // check rather than relying on Arcade's own collider/overlap to catch it.
    this.scene.resolveBulletSpawnInWall(bullet);

    if (this.weapon.recoil) {
      const recoilVec = new Phaser.Math.Vector2();
      this.scene.physics.velocityFromRotation(angle, -this.weapon.recoil, recoilVec);
      this.setVelocity(this.body.velocity.x + recoilVec.x, this.body.velocity.y + recoilVec.y);
    }
  }

  // Keeps the weapon display sprite orbiting the player at WEAPON_DISPLAY_DISTANCE,
  // always rotated to face the mouse, and picks its animation for the current
  // fire-mode/charge/cooldown state -- `${weaponName}_weapon_idle/_charge/_ready` for
  // CHARGE-mode weapons, `${weaponName}_weapon_idle/_cooldown` for COOLDOWN-mode ones.
  // Also flashes the sprite yellow (alternating with its normal look) while a
  // CHARGE-mode weapon is held at full charge, so "ready to fire" reads clearly on the
  // weapon itself rather than only via the player's tint.
  updateWeaponDisplay(time, pointer) {
    const aimAngle = Phaser.Math.Angle.Between(this.x, this.y, pointer.worldX, pointer.worldY);
    this.weaponSprite.rotation = aimAngle;
    this.weaponSprite.x = this.x + Math.cos(aimAngle) * WEAPON_DISPLAY_DISTANCE;
    this.weaponSprite.y = this.y + Math.sin(aimAngle) * WEAPON_DISPLAY_DISTANCE;

    const isCooldownWeapon = (this.weapon.fireMode || WEAPON_FIRE_MODE.CHARGE) === WEAPON_FIRE_MODE.COOLDOWN;
    const fullyCharged = !isCooldownWeapon && this.isCharging && this.chargeElapsedMs >= this.weapon.chargeTimeMs;

    if (isCooldownWeapon) {
      this.weaponSprite.play(this.isOnCooldown ? `${this.weaponName}_weapon_cooldown` : `${this.weaponName}_weapon_idle`, true);
    } else if (fullyCharged) {
      this.weaponSprite.play(`${this.weaponName}_weapon_ready`, true);
    } else if (this.isCharging) {
      this.weaponSprite.play(`${this.weaponName}_weapon_charge`, true);
    } else {
      this.weaponSprite.play(`${this.weaponName}_weapon_idle`, true);
    }

    if (fullyCharged) {
      const flashOn = Math.floor(time / WEAPON_FLASH_INTERVAL_MS) % 2 === 0;
      if (flashOn) this.weaponSprite.setTint(WEAPON_FLASH_TINT);
      else this.weaponSprite.clearTint();
    } else {
      this.weaponSprite.clearTint();
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

    // --- weapon-busy visual indicator: a single, very slight shade applied for
    // charging, fully-charged, and cooldown alike (previously three different tint
    // colors) -- the weapon sprite's own animation/flash below is what now carries
    // the distinction between those states. ---
    if (this.isCharging || this.isOnCooldown) {
      this.setTint(PLAYER_BUSY_TINT);
    } else {
      this.clearTint();
    }

    this.updateWeaponDisplay(time, pointer);

    let moved = false;

    // --- movement (reads real input each frame, unaffected by timeScale) ---
    if (!this.isDashing && this.lockRemainingMs <= 0) {
      const left = cursors.left.isDown || keys.A.isDown;
      const right = cursors.right.isDown || keys.D.isDown;
      const jump = cursors.up.isDown || keys.W.isDown;

      // Applies during either a charge or a cooldown -- both represent "weapon busy"
      const firingPenaltyActive = this.isCharging || this.isOnCooldown;
      const speedMult = firingPenaltyActive ? this.weapon.moveSpeedMultiplier : 1;
      const jumpMult = firingPenaltyActive ? this.weapon.jumpMultiplier : 1;
      moved = left || right;

      if (left) {
        this.setVelocityX(-PLAYER_STATS.moveSpeed * speedMult); this.facing = -1;
      }
      else if (right) {
        this.setVelocityX(PLAYER_STATS.moveSpeed * speedMult); this.facing = 1;
      }

      if (jump && this.body.blocked.down) {
        this.setVelocityY(-PLAYER_STATS.jumpVelocity * jumpMult);
      }
    }

    if (this.dashCooldownRemainingMs == 0) {
      if (!this.body.blocked.down) {
        if (this.body.velocity.y < 0) {
          this.play("player_rise", true);
        } else {
          this.play("player_fall", true);
        }
      } else if (moved) {
        this.play("player_run", true);
      } else {
        this.play("player_idle", true);
      }
    } else {
      if (!this.body.blocked.down) {
        if (this.body.velocity.y < 0) {
          this.play("player_rise_c", true);
        } else {
          this.play("player_fall_c", true);
        }
      } else if (moved) {
        this.play("player_run_c", true);
      } else {
        this.play("player_idle_c", true);
      }
    }
    

    this.setFlipX(this.facing === -1);
  }

  destroy(fromScene) {
    if (this.weaponSprite) this.weaponSprite.destroy();
    super.destroy(fromScene);
  }
}