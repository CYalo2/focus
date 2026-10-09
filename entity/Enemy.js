import { ENEMY_TYPES } from "../data/EnemyTypes.js";
import { ENEMY_MAX_INACCURACY_RAD, ENEMY_WARNING_TIME_MS, ENEMY_OUT_OF_RANGE_TINT, HIT_FLASH_BRIGHTEN_AMOUNT, ENEMY_KNOCKBACK_DRAG, DEPTH, BULLET_ENEMY_TINT } from "../data/Constants.js";
import { lightenColor } from "../data/ColorUtils.js";
import { createBullet } from "./Bullet.js";

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, config = {}) {
    super(scene, x, y, 'enemy');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTH.enemy);

    this.type = config.type || 'default';
    const typeDefaults = ENEMY_TYPES[this.type];

    this.setVelocityX(0);
    this.affectedByGravity = config.affectedByGravity !== undefined ? config.affectedByGravity : typeDefaults.affectedByGravity;
    this.health = config.health !== undefined ? config.health : typeDefaults.health;
    this.accuracy = config.accuracy !== undefined ? config.accuracy : typeDefaults.accuracy;
    this.projectileSpeed = config.projectileSpeed !== undefined ? config.projectileSpeed : typeDefaults.projectileSpeed;
    this.projectileCount = config.projectileCount !== undefined ? config.projectileCount : typeDefaults.projectileCount;

    this.isBeam = config.isBeam !== undefined ? config.isBeam : (typeDefaults.isBeam || false);
    this.beamRange = config.beamRange !== undefined ? config.beamRange : typeDefaults.beamRange;
    this.beamWidth = config.beamWidth !== undefined ? config.beamWidth : typeDefaults.beamWidth;

    this.angleDeg = config.angleDeg !== undefined ? config.angleDeg : typeDefaults.angleDeg;

    this.explodesOnHit = config.explodesOnHit !== undefined ? config.explodesOnHit : (typeDefaults.explodesOnHit || false);
    this.explosionRadius = config.explosionRadius !== undefined ? config.explosionRadius : typeDefaults.explosionRadius;

    this.knockback = config.knockback !== undefined ? config.knockback
      : (typeDefaults.knockback !== undefined ? typeDefaults.knockback : 0);

    this.hitsBreakable = config.hitsBreakable !== undefined ? config.hitsBreakable : typeDefaults.hitsBreakable;

    this.leftDist = config.leftDist !== undefined ? config.leftDist : typeDefaults.leftDist;
    this.rightDist = config.rightDist !== undefined ? config.rightDist : typeDefaults.rightDist;
    this.topDist = config.topDist !== undefined ? config.topDist : typeDefaults.topDist;
    this.bottomDist = config.bottomDist !== undefined ? config.bottomDist : typeDefaults.bottomDist;

    this.applyBodySettings();

    this.updateThreatState();

    this.shootCooldownMs = config.shootCooldownMs !== undefined ? config.shootCooldownMs : typeDefaults.shootCooldownMs;

    this.initialCooldownMs = config.initialCooldownMs !== undefined ? config.initialCooldownMs : typeDefaults.initialCooldownMs;
    this.shootCooldownRemaining = this.initialCooldownMs !== undefined ? this.initialCooldownMs : this.shootCooldownMs;
  }

  update(time, delta, scaledDelta) {
    if (!this.active || this.scene.gameEnded) return;
    this.shootCooldownRemaining -= scaledDelta;
    if (this.shootCooldownRemaining <= 0 && this.isPlayerInRange()) {
      this.shoot();
      this.shootCooldownRemaining = this.shootCooldownMs;
    }
    this.updateThreatState();
  }

  applyBodySettings() {
    this.setCollideWorldBounds(true);
    this.body.allowGravity = this.affectedByGravity;
    this.setDragX(ENEMY_KNOCKBACK_DRAG);
  }

  isPlayerInRange() {
    const player = this.scene.player;
    if (this.leftDist !== undefined && player.x < this.x - this.leftDist) return false;
    if (this.rightDist !== undefined && player.x > this.x + this.rightDist) return false;
    if (this.topDist !== undefined && player.y < this.y - this.topDist) return false;
    if (this.bottomDist !== undefined && player.y > this.y + this.bottomDist) return false;
    return true;
  }

  getAnimationKey() {
    let key = `${this.type}_enemy`;
    if (this.affectedByGravity) key += '_grounded';
    if (this.isPlayerInRange() && this.shootCooldownRemaining <= ENEMY_WARNING_TIME_MS) key += '_w';
    return key;
  }

  updateThreatState() {
    if (this.tintClearEvent) return;

    const key = this.getAnimationKey();
    if (this.anims.currentAnim?.key !== key) this.play(key, true);

    if (!this.isPlayerInRange()) {
      this.setTint(ENEMY_OUT_OF_RANGE_TINT);
    } else {
      this.clearTint();
    }
  }

  shoot() {
    const baseAngle = this.angleDeg !== undefined
      ? Phaser.Math.DegToRad(this.angleDeg)
      : Phaser.Math.Angle.Between(this.x, this.y, this.scene.player.x, this.scene.player.y);
    const spread = (1 - this.accuracy) * ENEMY_MAX_INACCURACY_RAD;

    if (this.isBeam) {
      const offset = (this.scene.rng.next() - this.scene.rng.next()) * spread;
      this.scene.fireEnemyBeam(this, baseAngle + offset);
      return;
    }

    for (let i = 0; i < this.projectileCount; i++) {
      const offset = (this.scene.rng.next() - this.scene.rng.next()) * spread;
      this.fireBullet(baseAngle + offset);
    }
  }

  fireBullet(angle) {
    const bullet = createBullet(this.scene, this.scene.enemyBullets, 'bulletEnemy', this.x, this.y, angle, this.projectileSpeed);
    bullet.hitsBreakable = this.hitsBreakable;
    if (this.explodesOnHit) {
      bullet.explodesOnHit = true;
      bullet.explosionRadius = this.explosionRadius;
    }
  }

  applyKnockback(angle, scale = 1) {
    if (!this.knockback || !scale) return;
    const knockbackVec = new Phaser.Math.Vector2();
    this.scene.physics.velocityFromRotation(angle, this.knockback * scale, knockbackVec);
    this.setVelocity(this.body.velocity.x + knockbackVec.x, this.body.velocity.y + knockbackVec.y);
  }

  hit(damage) {
    this.health -= damage;
    this.setTintFill(lightenColor(BULLET_ENEMY_TINT, HIT_FLASH_BRIGHTEN_AMOUNT));
    
    if (this.tintClearEvent) this.scene.time.removeEvent(this.tintClearEvent);
    this.tintClearEvent = this.scene.time.delayedCall(100, () => {
      this.tintClearEvent = null;
      if (this.active) this.updateThreatState();
    });
    return this.health <= 0;
  }

}