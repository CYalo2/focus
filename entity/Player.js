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
import { pointerToGame } from "../ui/DisplayScale.js";

const AUTOAIM_MOUSE_IDLE_MS = 1000;

const AUTOAIM_WEAPON_TURN_RATE = Math.PI * 3;

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, weapon) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.weapon = weapon;
    this.weaponName = Object.keys(WEAPONS).find((key) => WEAPONS[key] === weapon);

    this.setCollideWorldBounds(true);
    this.setDragX(PLAYER_STATS.drag);
    this.setDepth(DEPTH.player);

    this.play("player_idle");

    this.weaponSprite = scene.add.sprite(x, y, 'player');
    this.weaponSprite.setDepth(DEPTH.weapon);
    this.weaponSprite.play(`${this.weaponName}_weapon_idle`);

    this.facing = 1;

    this.isCharging = false;
    this.chargeElapsedMs = 0;
    this.chargeAimIsManual = false;
    this.wasPointerDown = false;

    this.lastMouseX = null;
    this.lastMouseY = null;
    this.lastMouseMoveTime = -Infinity;
    this.lastFrameTime = 0;

    this.fireInputArmed = false;

    this.firedThisFrame = false;
    this.firedAngle = 0;
    this.dashedThisFrame = false;
    this.dashedAngle = 0;

    this.isOnCooldown = false;
    this.cooldownRemainingMs = 0;

    this.isDashing = false;
    this.dashVelX = 0;
    this.dashVelY = 0;
    this.lockRemainingMs = 0;
    this.dashCooldownRemainingMs = 0;
  }

  fireWeapon(pointer, bulletGroup, chargeRatio = 1, aimAngleOverride = undefined) {
    const aimAngle = aimAngleOverride !== undefined ? aimAngleOverride : this.getAimAngle(pointer);
    this.firedThisFrame = true;
    this.firedAngle = aimAngle;

    if (this.weapon.isBeam) {
      this.scene.fireBeamWeapon(this, aimAngle, chargeRatio);
      return;
    }

    const angle = applyWeaponSpread(this.weapon, aimAngle);

    let spawnX = this.weaponSprite.x;
    let spawnY = this.weaponSprite.y;
    const bodiesAtWeaponTip = this.scene.physics.overlapRect(spawnX, spawnY, 0.5, 0.5, false, true);
    if (bodiesAtWeaponTip.some((body) => body.gameObject && this.scene.platformsBounceable.contains(body.gameObject))) {
      spawnX = this.x;
      spawnY = this.y;
    }

    const bullet = createBullet(this.scene, bulletGroup, 'bulletPlayer', spawnX, spawnY, angle, this.weapon.projectileSpeed);
    bullet.damage = this.weapon.damage * chargeRatio;
    bullet.explodesOnHit = !!this.weapon.explodesOnHit;
    bullet.explosionRadius = this.weapon.explosionRadius || 0;
    bullet.knockbackScale = chargeRatio;
    bullet.setAlpha(CHARGE_MIN_OPACITY + (1 - CHARGE_MIN_OPACITY) * chargeRatio);

    this.scene.resolveBulletSpawnInWall(bullet);

    if (this.weapon.recoil) {
      const recoilVec = new Phaser.Math.Vector2();
      this.scene.physics.velocityFromRotation(angle, -this.weapon.recoil, recoilVec);
      this.setVelocity(this.body.velocity.x + recoilVec.x, this.body.velocity.y + recoilVec.y);
    }
  }

  forceFireEvent(angleRad, bulletGroup) {
    const fakePointer = {
      worldX: this.x + Math.cos(angleRad) * 500,
      worldY: this.y + Math.sin(angleRad) * 500,
    };
    this.fireWeapon(fakePointer, bulletGroup, 1, angleRad);
    if ((this.weapon.fireMode || WEAPON_FIRE_MODE.CHARGE) === WEAPON_FIRE_MODE.COOLDOWN) {
      this.cooldownRemainingMs = this.weapon.cooldownMs;
      this.isOnCooldown = true;
    } else {
      this.isCharging = false;
      this.chargeElapsedMs = 0;
    }
  }

  forceDashEvent(angleRad) {
    this.startDash({
      worldX: this.x + Math.cos(angleRad) * 500,
      worldY: this.y + Math.sin(angleRad) * 500,
    }, angleRad);
  }

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
      }
    }
    return { x: pointer.worldX, y: pointer.worldY, isEnemy: false };
  }

  getAimAngle(pointer) {
    const target = this.getAimTarget(pointer);
    return Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
  }

  registerManualAimIntent(time) {
    this.lastMouseMoveTime = time;
  }

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

  updateChargeFire(scaledDelta, leftDown, leftReleasedThisFrame, isMouseTriggered, pointer, bulletGroup, suppressAutoFire = false) {
    if (leftDown && !this.isCharging && !this.isDashing) {
      this.isCharging = true;
      this.chargeElapsedMs = 0;

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

  getChargeProgress() {
    if (!this.isCharging) return 0;
    const { chargeTimeMs } = this.weapon;
    if (!chargeTimeMs) return 0;
    return Phaser.Math.Clamp(this.chargeElapsedMs / chargeTimeMs, 0, 1);
  }

  updateCooldownFire(scaledDelta, leftDown, isMouseTriggered, pointer, bulletGroup, suppressAutoFire = false) {
    if (this.cooldownRemainingMs > 0) {
      this.cooldownRemainingMs = Math.max(0, this.cooldownRemainingMs - scaledDelta);
    }
    this.isOnCooldown = this.cooldownRemainingMs > 0;

    if (leftDown && !this.isOnCooldown && !this.isDashing && !suppressAutoFire) {
      if (isMouseTriggered) {
        this.registerManualAimIntent(this.lastFrameTime);
      }
      this.fireWeapon(pointer, bulletGroup);

      const aimTarget = this.getAimTarget(pointer);
      const indicatorPoint = aimTarget.isEnemy
        ? this.scene.worldToScreen(aimTarget.x, aimTarget.y)
        : pointerToGame(pointer);
      this.scene.spawnFireReadyIndicator(indicatorPoint.x, indicatorPoint.y);
      this.cooldownRemainingMs = this.weapon.cooldownMs;
      this.isOnCooldown = true;
    }
  }

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
      if (overlapX <= 0 || overlapY <= 0) continue;

      if (overlapX < overlapY) {
        this.x += this.x < body.center.x ? -overlapX : overlapX;
      } else {
        this.y += this.y < body.center.y ? -overlapY : overlapY;
      }
    }

    this.body.updateFromGameObject();
  }

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
    this.body.allowGravity = false;
    this.lockRemainingMs = DASH.lockMs;
  }

  startDash(pointer, aimAngleOverride = undefined) {
    const dashAngle = aimAngleOverride !== undefined ? aimAngleOverride : this.getAimAngle(pointer);

    this.dashedThisFrame = true;
    this.dashedAngle = dashAngle;

    this.dashVelX = DASH.speed * Math.cos(dashAngle);
    this.dashVelY = DASH.speed * Math.sin(dashAngle);

    this.setVelocity(0, 0);
    this.body.allowGravity = false;
    this.isDashing = true;
    this.dashCooldownRemainingMs = DASH.cooldownMs;

    spawnDashParticles(this.scene, this.x, this.y);
  }

  updateDash(scaledDelta) {
    const dt = scaledDelta / 1000;

    const speed = Math.hypot(this.dashVelX, this.dashVelY);
    if (speed > 0) {
      const newSpeed = Math.max(0, speed - DASH.drag * dt);
      const scale = newSpeed / speed;
      this.dashVelX *= scale;
      this.dashVelY *= scale;
    }

    this.dashVelY += GRAVITY * DASH.gravityFraction * dt;

    const totalDistance = Math.hypot(this.dashVelX * dt, this.dashVelY * dt);
    const steps = Math.max(1, Math.ceil(totalDistance / DASH.maxStepDistance));
    const stepDt = dt / steps;

    for (let i = 0; i < steps; i++) {
      const targetX = this.x + this.dashVelX * stepDt;
      const targetY = this.y + this.dashVelY * stepDt;

      if (!this.wouldSweepCollideAt(this.x, this.y, targetX, this.y, DASH.skin, DASH.skin) && this.isWithinWorldBoundsX(targetX)) {
        this.x = targetX;
      }

      if (!this.wouldSweepCollideAt(this.x, this.y, this.x, targetY, DASH.skin, DASH.skin) && this.isWithinWorldBoundsY(targetY)) {
        this.y = targetY;
      }
    }

    this.body.updateFromGameObject();

    this.resolveEmbedding();

    if (Math.hypot(this.dashVelX, this.dashVelY) <= DASH.minSpeed) {
      this.finishDash();
    }
  }

  update(time, delta, scaledDelta, ctx) {
    const { cursors, keys, pointer, bulletGroup, suppressAutoFire = false } = ctx;

    if (this.lastMouseX !== null && (pointer.x !== this.lastMouseX || pointer.y !== this.lastMouseY)) {
      this.lastMouseMoveTime = time;
      if (this.isCharging) {
        this.chargeAimIsManual = true;
      }
    }
    this.lastMouseX = pointer.x;
    this.lastMouseY = pointer.y;
    this.lastFrameTime = time;

    this.firedThisFrame = false;
    this.dashedThisFrame = false;

    const leftMouseDown = pointer.leftButtonDown();
    const leftDown = leftMouseDown || keys.SPACE.isDown;

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

    if (this.dashCooldownRemainingMs > 0) {
      this.dashCooldownRemainingMs = Math.max(0, this.dashCooldownRemainingMs - scaledDelta);
    }

    const rightMouseDown = pointer.rightButtonDown();
    const rightDown = rightMouseDown || keys.Q.isDown;
    if (rightDown && !suppressAutoFire && !this.isDashing && !this.isCharging && !this.isOnCooldown && this.dashCooldownRemainingMs <= 0) {
      if (rightMouseDown) {
        this.registerManualAimIntent(time);
      }
      this.startDash(pointer);
    }

    if (this.isDashing) {
      this.updateDash(scaledDelta);
    }

    if (this.lockRemainingMs > 0) {
      this.lockRemainingMs -= scaledDelta;
      if (this.lockRemainingMs <= 0) {
        this.body.allowGravity = true;
        this.setDrag(PLAYER_STATS.drag, 0);
      }
    }

    if (this.isCharging || this.isOnCooldown) {
      this.setTint(PLAYER_BUSY_TINT);
    } else {
      this.clearTint();
    }

    this.updateWeaponDisplay(time, pointer, scaledDelta);

    let moved = false;

    if (!this.isDashing && this.lockRemainingMs <= 0) {
      const left = cursors.left.isDown || keys.A.isDown;
      const right = cursors.right.isDown || keys.D.isDown;
      const jump = cursors.up.isDown || keys.W.isDown;

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