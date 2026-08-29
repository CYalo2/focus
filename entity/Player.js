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
import { isAutoAimEnabled } from "../save/SaveManager.js";

// How long (ms) the mouse has to sit still before autoaim reclaims aim control from
// a manual override -- see getAimAngle(). A manual override starts either from the
// mouse actually moving, or from registerManualAimIntent() treating a fresh dash/
// cooldown-fire click as if it had (see that method's doc comment). Real elapsed
// time (compared against the `time` GameScene.update() passes in), not scaledDelta,
// so this window doesn't stretch out during bullet time.
const AUTOAIM_MOUSE_IDLE_MS = 1000;

// How fast (radians/sec) the weapon sprite visually rotates to catch up to its
// target angle while autoaim is actively tracking an enemy -- see
// updateWeaponDisplay(). Manual mouse aim is unaffected by this and still snaps
// instantly; this only smooths the swing whenever getAimTarget() resolves to an
// enemy, whether that's the moment aim first switches over from the mouse, or
// just the enemy continuing to move while already autoaimed at. Scaled by
// scaledDelta each frame (not raw delta), so the turn rate itself stays
// consistent during bullet time rather than the swing appearing to speed
// up/slow down with it.
const AUTOAIM_WEAPON_TURN_RATE = Math.PI * 3; // ~540 deg/sec

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
    // always rotated to face the current aim target (see updateWeaponDisplay()) --
    // fireWeapon() below also spawns bullets from this sprite's position rather than
    // the player's, so shots visibly originate from the weapon itself.
    this.weaponSprite = scene.add.sprite(x, y, 'player');
    this.weaponSprite.setScale(2);
    this.weaponSprite.setDepth(DEPTH.weapon);
    this.weaponSprite.play(`${this.weaponName}_weapon_idle`);

    this.facing = 1; // 1 = right, -1 = left

    // charge-to-fire state (WEAPON_FIRE_MODE.CHARGE)
    this.isCharging = false;
    this.chargeElapsedMs = 0; // counts up while charging, scaled by bullet time
    // Whether the CURRENT charge (while isCharging is true) is manually aimed vs
    // autoaimed -- decided once when the charge starts and then held fixed for the
    // rest of that charge; see updateChargeFire() and getAimTarget().
    this.chargeAimIsManual = false;
    this.wasPointerDown = false;

    // Autoaim mouse-tracking: lastMouseX/Y are screen coordinates (pointer.x/y, not
    // worldX/worldY) specifically so panning/scrolling the camera alone never reads
    // as "the mouse moved" -- see update()'s comment where these are compared each
    // frame. lastMouseMoveTime starts at -Infinity (not 0) so autoaim is free to
    // target the closest enemy from the very first frame, rather than treating a
    // level's opening moment as a fresh "just moved" window. lastFrameTime mirrors
    // GameScene's own `time` each frame, so getAimAngle() (called from methods that
    // don't themselves receive `time`, like fireWeapon()) has a clock to compare
    // lastMouseMoveTime against without threading `time` through every call site.
    this.lastMouseX = null;
    this.lastMouseY = null;
    this.lastMouseMoveTime = -Infinity;
    this.lastFrameTime = 0;

    // Guards against the click that started the level (or re-entered this scene)
    // being immediately read as a fire input on the very first update() frame --
    // fire input stays inert until the left button has been seen released at least
    // once, so the player can never spawn already-shooting. Set true the first
    // frame the button reads up; see update() below.
    this.fireInputArmed = false;

    // One-frame "did a real fire/dash game event happen this tick, and at what
    // angle" flags -- for GameScene's hint recorder (see update()'s reset and
    // fireWeapon()/startDash()'s sets below). These exist because *when* a shot or
    // dash actually happens isn't simply "the button was just pressed": a
    // CHARGE-mode weapon fires on RELEASE (updateChargeFire), while a COOLDOWN-mode
    // weapon (and dashing) fires on PRESS -- or on any later frame the button is
    // still held, the instant cooldown clears (updateCooldownFire, and the dash
    // check in update()). There's no single input-edge rule that covers all of
    // that, so the actual moment has to be reported from here, where it happens,
    // rather than reconstructed from raw button state elsewhere.
    this.firedThisFrame = false;
    this.firedAngle = 0;
    this.dashedThisFrame = false;
    this.dashedAngle = 0;

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
  //
  // aimAngleOverride (radians), if passed, is used exactly as-is instead of going
  // through getAimAngle()'s autoaim logic -- forceFireEvent() (hint playback) passes
  // the recording's own exact angle here, since a replay has to reproduce precisely
  // the shot that was recorded regardless of whatever the autoaim setting happens to
  // be during THIS viewing.
  fireWeapon(pointer, bulletGroup, chargeRatio = 1, aimAngleOverride = undefined) {
    // Computed up front (before the beam branch) since both beam and projectile
    // weapons need it, and so the hint-recording flag below covers every weapon
    // type this function fires, not just projectile ones.
    const aimAngle = aimAngleOverride !== undefined ? aimAngleOverride : this.getAimAngle(pointer);
    // A real fire event, happening right now, at this angle -- see the flags'
    // declaration in the constructor for why this can't be inferred from raw input
    // elsewhere.
    this.firedThisFrame = true;
    this.firedAngle = aimAngle;

    // Beam weapons are instant/hitscan rather than a travelling projectile -- the
    // scene owns the platform/enemy groups a beam needs to raycast against, so it
    // (not Player) does the actual hit-detection, damage, and visual. Passes the
    // aimAngle already computed above (rather than the raw pointer, which
    // fireBeamWeapon used to re-derive its own angle from) so a beam weapon goes
    // through the same autoaim/manual-override logic as every other weapon instead
    // of always firing straight at the mouse regardless of the autoaim setting.
    // This also covers the beam's own recoil kick, so we return before the
    // bullet-specific logic below.
    if (this.weapon.isBeam) {
      this.scene.fireBeamWeapon(this, aimAngle, chargeRatio);
      return;
    }

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

  // Hint playback only: forces the exact fire event the recording captured to
  // happen on THIS tick, at the exact recorded angle (radians), instead of leaving
  // it to updateCooldownFire()/updateChargeFire() to re-decide when to fire off
  // this playback session's own (re-simulated, not the original recording's)
  // cooldown/charge timers -- see HintPlayback.advance()'s fireEvents doc comment
  // in HintReplay.js for why that re-derivation can drift a tick or two away from
  // the recorded moment. Called from GameScene.updateHintPlayback() *before*
  // player.update() runs its own fire logic this same tick, so the cooldown/charge
  // bookkeeping reset below (mirroring what updateCooldownFire/updateChargeFire
  // themselves do right after a normal shot) is what stops that logic from also
  // firing a second, redundant shot immediately afterward.
  forceFireEvent(angleRad, bulletGroup) {
    const fakePointer = {
      worldX: this.x + Math.cos(angleRad) * 1000,
      worldY: this.y + Math.sin(angleRad) * 1000,
    };
    this.fireWeapon(fakePointer, bulletGroup, 1, angleRad);
    if ((this.weapon.fireMode || WEAPON_FIRE_MODE.CHARGE) === WEAPON_FIRE_MODE.COOLDOWN) {
      this.cooldownRemainingMs = this.weapon.cooldownMs;
      this.isOnCooldown = true;
      // No spawnFireReadyIndicator() here, unlike updateCooldownFire()'s normal
      // post-shot bookkeeping -- there's no real cursor position during hint
      // playback to flash it at (fakePointer.x/y would just be an approximation
      // off the weapon sprite), and showing a crosshair flash with nothing under
      // it to explain it is more confusing than helpful in a preview.
    } else {
      this.isCharging = false;
      this.chargeElapsedMs = 0;
    }
  }

  // Hint playback only: forces the exact dash event the recording captured to
  // happen on THIS tick, at the exact recorded angle -- same reasoning as
  // forceFireEvent() above. startDash() itself sets isDashing/dashCooldownRemainingMs
  // unconditionally (its callers are what normally gate *whether* to call it), so
  // calling it directly here already prevents update()'s own dash check from
  // double-triggering this same tick -- no extra bookkeeping needed.
  forceDashEvent(angleRad) {
    this.startDash({
      worldX: this.x + Math.cos(angleRad) * 1000,
      worldY: this.y + Math.sin(angleRad) * 1000,
    }, angleRad);
  }

  // Returns the closest active enemy to the player, or null if there aren't any
  // (level already cleared, or no enemies at all) -- used by getAimAngle() below.
  // Distance is compared with squared distances throughout so the search never
  // needs a sqrt per enemy, just for the final comparison.
  getClosestEnemy() {
    const enemies = this.scene.enemies?.getChildren() || [];
    let closest = null;
    let closestDistSq = Infinity;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const distSq = Phaser.Math.Distance.Squared(this.x, this.y, enemy.x, enemy.y);
      if (distSq < closestDistSq) {
        closestDistSq = distSq;
        closest = enemy;
      }
    }
    return closest;
  }

  // Returns the world-space point being aimed/fired at this frame, and whether
  // that's an enemy (autoaim) or literally the pointer (manual) -- everything that
  // needs an aim direction (getAimAngle() below, for the weapon sprite/bullets/
  // dash) is built on top of this, and GameScene also calls it directly to know
  // where to draw the charge-ready crosshair, so that indicator can sit over the
  // real target instead of always sitting under the mouse.
  //
  // Normally just "the pointer" -- with autoaim on, this defaults to the closest
  // active enemy instead, UNLESS the mouse recently moved, which hands aim back to
  // manual. A fresh dash/cooldown-fire click points exactly where you clicked (see
  // registerManualAimIntent()'s doc comment), and even idly moving the mouse with
  // nothing held briefly overrides autoaim for the weapon-display sprite, decaying
  // back to the closest enemy once the mouse has been still for
  // AUTOAIM_MOUSE_IDLE_MS. CHARGE mode is the one exception to that decay: while
  // isCharging is true, this reads the manual-vs-autoaim verdict from
  // chargeAimIsManual instead of re-deriving it from the timer every frame -- that
  // flag is decided once when the charge starts and can still be flipped to manual
  // by a genuine mouse move mid-charge, but never decays back to autoaim while the
  // charge is still held (see updateChargeFire() and update()'s mouse-move check).
  getAimTarget(pointer) {
    if (isAutoAimEnabled()) {
      const mouseRecentlyMoved = this.isCharging
        ? this.chargeAimIsManual
        : (this.lastFrameTime - this.lastMouseMoveTime) < AUTOAIM_MOUSE_IDLE_MS;
      if (!mouseRecentlyMoved) {
        const closestEnemy = this.getClosestEnemy();
        if (closestEnemy) {
          return { x: closestEnemy.x, y: closestEnemy.y, isEnemy: true };
        }
        // No active enemies to autoaim at -- fall through to manual aim below.
      }
    }
    return { x: pointer.worldX, y: pointer.worldY, isEnemy: false };
  }

  // Returns the angle (radians) to aim/fire along this frame -- see getAimTarget()
  // above for the actual autoaim/manual-override logic this is built on.
  getAimAngle(pointer) {
    const target = this.getAimTarget(pointer);
    return Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
  }

  // Treats THIS INSTANT as if the mouse had just physically moved, for the purposes
  // of the manual-aim-override check in getAimTarget()/getAimAngle() above. Called
  // right before a fresh right-CLICK dash (see update()) or a fresh COOLDOWN-mode
  // left-CLICK fire (see updateCooldownFire()) -- deliberately mouse-button-only:
  // Q and SPACE trigger the exact same dash/fire, but have no on-screen location of
  // their own to point at, so they're left to aim wherever getAimAngle() already
  // resolves to (autoaim's closest enemy, or the mouse if autoaim's off) rather
  // than forcing a manual override neither key actually asked for. A real mouse
  // click, by contrast, aims that dash/shot exactly where you clicked instead of
  // wherever autoaim's closest enemy happens to be. CHARGE mode doesn't call this
  // method, but applies the identical reasoning inline -- see chargeAimIsManual and
  // updateChargeFire() for how it decides and locks in manual-vs-autoaim for an
  // entire held charge. Only meant to be called immediately before the
  // getAimTarget()/getAimAngle() call it's overriding for, since -- like a real
  // mouse move -- it decays after AUTOAIM_MOUSE_IDLE_MS.
  registerManualAimIntent(time) {
    this.lastMouseMoveTime = time;
  }

  // Keeps the weapon display sprite orbiting the player at WEAPON_DISPLAY_DISTANCE,
  // always facing the current aim target (the mouse, or -- with autoaim on -- the
  // closest enemy; see getAimTarget()), and picks its animation for the current
  // fire-mode/charge/cooldown state -- `${weaponName}_weapon_idle/_charge/_ready`
  // for CHARGE-mode weapons, `${weaponName}_weapon_idle/_cooldown` for COOLDOWN-mode
  // ones. Also flashes the sprite yellow (alternating with its normal look) while a
  // CHARGE-mode weapon is held at full charge, so "ready to fire" reads clearly on
  // the weapon itself rather than only via the player's tint.
  //
  // The sprite's rotation doesn't always jump straight to the target angle: while
  // autoaim is tracking an enemy (aimTarget.isEnemy), it instead turns toward that
  // angle at AUTOAIM_WEAPON_TURN_RATE, so both a fresh mouse->enemy handoff and the
  // enemy simply moving read as the weapon visibly swinging around rather than
  // teleporting. Manual mouse aim (isEnemy false) is exempt from that and still
  // snaps instantly, same as before -- so aim->mouse handoffs, and normal mouse
  // tracking, stay exactly as responsive as they've always been. This only affects
  // the displayed sprite angle; getAimAngle() (used by fireWeapon()/startDash()) is
  // untouched, so shots and dashes still fire at the true, un-lagged aim angle.
  updateWeaponDisplay(time, pointer, scaledDelta) {
    const aimTarget = this.getAimTarget(pointer);
    const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, aimTarget.x, aimTarget.y);

    if (aimTarget.isEnemy) {
      const maxStep = AUTOAIM_WEAPON_TURN_RATE * (scaledDelta / 1000);
      this.weaponSprite.rotation = Phaser.Math.Angle.RotateTo(this.weaponSprite.rotation, targetAngle, maxStep);
    } else {
      this.weaponSprite.rotation = targetAngle;
    }

    const aimAngle = this.weaponSprite.rotation;
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
  // suppressAutoFire (hint playback only): still tracks isCharging/chargeElapsedMs so
  // the weapon's charge animation looks right, but never itself calls fireWeapon() --
  // during hint playback, actual shots are driven exclusively by GameScene forcing the
  // recording's own fire events via forceFireEvent() (see its doc comment below), so
  // this path re-firing on its own (off this playback session's own re-simulated charge
  // timing, not the recording's) would risk an extra, unrecorded shot sneaking in.
  // isMouseTriggered: whether the mouse button specifically (not SPACE) is what's
  // currently down -- see the chargeAimIsManual assignment below.
  updateChargeFire(scaledDelta, leftDown, leftReleasedThisFrame, isMouseTriggered, pointer, bulletGroup, suppressAutoFire = false) {
    if (leftDown && !this.isCharging && !this.isDashing) {
      this.isCharging = true;
      this.chargeElapsedMs = 0;
      // Lock in whichever aim mode -- manual or autoaim -- applies on this exact
      // starting frame, for the entire charge that follows (see chargeAimIsManual's
      // declaration and getAimTarget() for how it's used). Without locking it in,
      // aim would keep re-deciding every frame off the same decaying "mouse
      // recently moved" window everything else uses, which let a charge that
      // legitimately started in manual mode silently flip back to autoaim
      // mid-charge the moment the mouse sat still for AUTOAIM_MOUSE_IDLE_MS, even
      // though you never let go of the button.
      //
      // A mouse CLICK starting the charge counts as manual outright, same as it
      // does for a fresh dash/cooldown-fire click (see registerManualAimIntent()'s
      // doc comment) -- you clicked at an actual on-screen location, so that's
      // where the charge should point, whether or not the mouse happened to have
      // physically moved in the last second beforehand. SPACE, by contrast, has no
      // on-screen location of its own to point at, so a SPACE-started charge falls
      // back to "was the mouse recently moved" -- autoaim's enemy if not, manual if
      // so -- same as everything else not scoped to charging.
      this.chargeAimIsManual = isMouseTriggered || (this.lastFrameTime - this.lastMouseMoveTime) < AUTOAIM_MOUSE_IDLE_MS;
    }
    if (this.isCharging) {
      this.chargeElapsedMs += scaledDelta;
    }
    if (leftReleasedThisFrame) {
      if (this.isCharging && !suppressAutoFire) {
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
  // suppressAutoFire (hint playback only): still ticks cooldownRemainingMs/isOnCooldown
  // down normally so the weapon's cooldown animation looks right, but never itself calls
  // fireWeapon() -- same reasoning as updateChargeFire()'s suppressAutoFire above. This
  // matters especially here since a held click on a COOLDOWN weapon auto-refires every
  // time cooldownRemainingMs clears -- exactly the repeated-shot case a tick of drift
  // between this re-simulated timer and the recording's own timeline would otherwise
  // slip an extra unrecorded shot into.
  // isMouseTriggered: whether the mouse button specifically (not SPACE) is what's
  // currently down -- see the registerManualAimIntent() call below.
  updateCooldownFire(scaledDelta, leftDown, isMouseTriggered, pointer, bulletGroup, suppressAutoFire = false) {
    if (this.cooldownRemainingMs > 0) {
      this.cooldownRemainingMs = Math.max(0, this.cooldownRemainingMs - scaledDelta);
    }
    this.isOnCooldown = this.cooldownRemainingMs > 0;

    if (leftDown && !this.isOnCooldown && !this.isDashing && !suppressAutoFire) {
      // A mouse click is a deliberate shot, not idle mouse motion -- point it
      // exactly where clicked (see registerManualAimIntent()'s doc comment) rather
      // than leaving it to whatever autoaim happens to be doing. Held-through-
      // cooldown auto-refires re-register this every shot too, so aim stays pinned
      // to the click for as long as the button's held down. SPACE, by contrast,
      // has no on-screen "location" of its own to point at -- it fires wherever
      // getAimAngle() already resolves to (the closest enemy under autoaim, the
      // mouse otherwise), same as it always has.
      if (isMouseTriggered) {
        this.registerManualAimIntent(this.lastFrameTime);
      }
      this.fireWeapon(pointer, bulletGroup);
      // One-frame "ready" flash marking the shot -- drawn over the enemy under
      // autoaim (the same target the shot just went to) rather than always under
      // the cursor, so the flash actually confirms where the shot landed. The
      // CHARGE-mode equivalent instead shows the same circle continuously while
      // held at full charge (see GameScene.update()), since a cooldown weapon has
      // no held state to linger on -- same enemy-vs-cursor positioning applies
      // there too.
      const aimTarget = this.getAimTarget(pointer);
      const indicatorPoint = aimTarget.isEnemy
        ? this.scene.worldToScreen(aimTarget.x, aimTarget.y)
        : { x: pointer.x, y: pointer.y };
      this.scene.spawnFireReadyIndicator(indicatorPoint.x, indicatorPoint.y);
      this.cooldownRemainingMs = this.weapon.cooldownMs;
      this.isOnCooldown = true;
    }
  }

  // Pushes the player back out of any solid platform it's currently overlapping, along
  // whichever axis needs the smaller correction -- the same logic Arcade's own
  // collision separation uses, done manually since Arcade's version doesn't work for a
  // body with no tracked per-frame velocity (see the comment at its call site). Safe to
  // call any time the player might be embedded; a no-op if it isn't overlapping anything.
  // Solid groups here mirror the player's real colliders against normal movement
  // (normal, breakable, bounceable, enemyPassthrough, bulletPassthrough) -- oneway is
  // intentionally excluded, same as it's already a soft collision from other directions.
  resolveEmbedding() {
    const scene = this.scene;
    const halfW = this.body.width / 2;
    const halfH = this.body.height / 2;
    const groups = [scene.platformsNormal, scene.platformsBreakable, scene.platformsBounceable, scene.platformsEnemyPassthrough, scene.platformsBulletPassthrough];
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
  // bounceable, enemyPassthrough, or bulletPassthrough -- oneway is intentionally excluded,
  // same as it's already a soft collision from other directions) if swept from (x0, y0) to (x1, y1).
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
        || scene.platformsEnemyPassthrough.contains(obj)
        || scene.platformsBulletPassthrough.contains(obj);
    });
  }

  // Whether the player's body would still be fully inside the physics world bounds
  // at this x/y -- used alongside wouldSweepCollideAt() below so a dash treats the
  // world edge the same way it treats a wall: position simply doesn't update past
  // it, letting the same drag-based slow-down bring the dash to a stop there
  // instead of relying on Arcade's own world-bounds collision, which can't run
  // during a dash for the same reason resolveEmbedding() exists (see its comment):
  // the body's real velocity is pinned at (0, 0) while dashing.
  isWithinWorldBoundsX(x) {
    const bounds = this.scene.physics.world.bounds;
    const halfW = this.body.width / 2;
    return x - halfW >= bounds.x && x + halfW <= bounds.right;
  }

  isWithinWorldBoundsY(y) {
    const bounds = this.scene.physics.world.bounds;
    const halfH = this.body.height / 2;
    return y - halfH >= bounds.y && y + halfH <= bounds.bottom;
  }

  finishDash() {
    this.isDashing = false;
    this.dashVelX = 0;
    this.dashVelY = 0;
    this.setVelocity(0, 0);
    this.body.allowGravity = false; // stays off for the lock phase below
    this.lockRemainingMs = DASH.lockMs;
  }

  // aimAngleOverride (radians), if passed, is used exactly as-is instead of going
  // through getAimAngle() -- forceDashEvent() (hint playback) passes the
  // recording's own exact angle here, for the same reason fireWeapon()'s
  // aimAngleOverride exists: a replay has to reproduce precisely the dash that was
  // recorded regardless of whatever autoaim/mouse-position happens to be doing
  // during THIS viewing.
  startDash(pointer, aimAngleOverride = undefined) {
    // Dashes toward the same direction the weapon is currently facing -- i.e.
    // whatever getAimAngle() resolves to (the closest enemy under autoaim, the
    // mouse otherwise) -- rather than always straight at the raw pointer. That
    // keeps dashing consistent with autoaim instead of fighting it, while still
    // behaving exactly as before with autoaim off, since getAimAngle() itself
    // falls back to "toward the mouse" in that case.
    const dashAngle = aimAngleOverride !== undefined ? aimAngleOverride : this.getAimAngle(pointer);
    // A real dash event, happening right now, at this angle -- see the flags'
    // declaration in the constructor for why this can't be inferred from raw input
    // elsewhere (dash, like a COOLDOWN weapon, can also retrigger on a later held
    // frame the instant dashCooldownRemainingMs clears, not just on initial press).
    this.dashedThisFrame = true;
    this.dashedAngle = dashAngle;

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
      if (!this.wouldSweepCollideAt(this.x, this.y, targetX, this.y, DASH.skin, DASH.skin) && this.isWithinWorldBoundsX(targetX)) {
        this.x = targetX;
      }

      if (!this.wouldSweepCollideAt(this.x, this.y, this.x, targetY, DASH.skin, DASH.skin) && this.isWithinWorldBoundsY(targetY)) {
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

  // ctx: { cursors, keys, pointer, bulletGroup, suppressAutoFire }
  // suppressAutoFire (hint playback only, default false): passed straight through to
  // updateCooldownFire()/updateChargeFire() (see their doc comments), and also gates
  // the dash auto-trigger a few lines down -- during hint playback GameScene forces
  // the recording's own fire/dash events directly via forceFireEvent()/
  // forceDashEvent() *before* calling update(), so this flag stops update()'s own
  // per-tick re-decision (driven by this playback session's own re-simulated
  // cooldown/charge/dash timers, not the recording's) from also triggering an extra,
  // unrecorded shot or dash of its own -- most likely to actually happen during a
  // held-click COOLDOWN-weapon burst, where a tick of drift between the two timers is
  // otherwise enough to slip a phantom shot in between two recorded ones.
  update(time, delta, scaledDelta, ctx) {
    const { cursors, keys, pointer, bulletGroup, suppressAutoFire = false } = ctx;

    // Autoaim mouse tracking: pointer.x/y (screen-space) rather than worldX/worldY,
    // since GameScene refreshes worldX/worldY from the camera transform every single
    // frame regardless of whether the player's hand has actually moved (see its own
    // comment on that call) -- comparing those would make autoaim think the mouse
    // was "moving" continuously any time the camera scrolls. lastMouseX starting at
    // null skips the very first frame's comparison, so level start doesn't spuriously
    // read as a fresh move. lastFrameTime just mirrors `time` for getAimAngle() (and
    // any other method here that doesn't itself receive `time`) to compare against.
    if (this.lastMouseX !== null && (pointer.x !== this.lastMouseX || pointer.y !== this.lastMouseY)) {
      this.lastMouseMoveTime = time;
      // A genuine mouse move mid-charge can still hand a charge that started
      // autoaimed over to manual -- see chargeAimIsManual's declaration and
      // getAimTarget() -- it just can't happen the other way around, so this only
      // ever sets it to true, never resets it back to false.
      if (this.isCharging) {
        this.chargeAimIsManual = true;
      }
    }
    this.lastMouseX = pointer.x;
    this.lastMouseY = pointer.y;
    this.lastFrameTime = time;

    // Cleared at the top of every frame so GameScene can read them as "did this
    // happen on THIS tick" right after this call returns -- see their declaration
    // in the constructor. fireWeapon()/startDash() below set them (at most once
    // each) if this tick's fire/dash handling actually triggers.
    this.firedThisFrame = false;
    this.dashedThisFrame = false;

    // --- fire input (LEFT click or SPACE), branches on the weapon's fire mode ---
    const leftMouseDown = pointer.leftButtonDown();
    const leftDown = leftMouseDown || keys.SPACE.isDown;

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
        this.updateCooldownFire(scaledDelta, leftDown, leftMouseDown, pointer, bulletGroup, suppressAutoFire);
      } else {
        this.updateChargeFire(scaledDelta, leftDown, leftReleasedThisFrame, leftMouseDown, pointer, bulletGroup, suppressAutoFire);
      }
    }
    this.wasPointerDown = leftDown;

    // --- dash cooldown countdown ---
    if (this.dashCooldownRemainingMs > 0) {
      this.dashCooldownRemainingMs = Math.max(0, this.dashCooldownRemainingMs - scaledDelta);
    }

    // --- dash (RIGHT click or Q, fires toward the mouse) -- checks the button is
    // currently down rather than just-pressed, so holding it through the cooldown fires
    // again automatically the instant the cooldown clears, with no need to release and
    // re-click. Blocked while charging or on weapon cooldown, same as firing is
    // blocked while dashing, for symmetry. Also blocked by suppressAutoFire -- see this
    // method's doc comment above. ---
    const rightMouseDown = pointer.rightButtonDown();
    const rightDown = rightMouseDown || keys.Q.isDown;
    if (rightDown && !suppressAutoFire && !this.isDashing && !this.isCharging && !this.isOnCooldown && this.dashCooldownRemainingMs <= 0) {
      // A right-click dash is a deliberate click, not idle mouse motion -- point it
      // exactly where clicked (see registerManualAimIntent()'s doc comment) rather
      // than leaving it to whatever autoaim happens to be doing. Held-through-
      // cooldown re-dashes re-register this every trigger too, so aim stays pinned
      // to the click for as long as the button's held down. Q, by contrast, has no
      // on-screen "location" of its own to point at -- it dashes wherever
      // getAimAngle() already resolves to (the closest enemy under autoaim, the
      // mouse otherwise), same as firing does.
      if (rightMouseDown) {
        this.registerManualAimIntent(time);
      }
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

    this.updateWeaponDisplay(time, pointer, scaledDelta);

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
      moved = (left && !this.body.blocked.left) || (right && !this.body.blocked.right);

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