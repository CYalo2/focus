import { DEPTH } from "../data/Constants.js";

export function createBullet(scene, group, texture, x, y, angle, speed) {
  const bullet = group.create(x, y, texture);
  bullet.setDepth(DEPTH.bullet);
  bullet.body.allowGravity = false;
  bullet.setBounce(1, 1);
  bullet.rotation = angle;
  scene.physics.velocityFromRotation(angle, speed, bullet.body.velocity);
  return bullet;
}

export function reorientBullet(bullet) {
  bullet.rotation = Math.atan2(bullet.body.velocity.y, bullet.body.velocity.x);
}

function angleDelta(a, b) {
  let diff = (b - a) % (Math.PI * 2);
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (diff > Math.PI) diff -= Math.PI * 2;
  return diff;
}

export function redirectBullet(bullet, area) {
  const currentAngle = Math.atan2(bullet.body.velocity.y, bullet.body.velocity.x);
  if (Math.abs(angleDelta(currentAngle, area.redirectAngle)) < 1e-4) return;

  const speed = Math.hypot(bullet.body.velocity.x, bullet.body.velocity.y);

  bullet.body.reset(area.x, area.y);
  bullet.rotation = area.redirectAngle;
  bullet.scene.physics.velocityFromRotation(area.redirectAngle, speed, bullet.body.velocity);
}

export function destroyOffscreenBullets(group, worldBounds, margin) {
  const { width, height } = worldBounds;
  group.children.iterate((bullet) => {
    if (!bullet || !bullet.active) return;
    if (bullet.x < -margin || bullet.x > width + margin || bullet.y < -margin || bullet.y > height + margin) {
      bullet.destroy();
    }
  });
}