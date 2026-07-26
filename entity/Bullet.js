import { DEPTH } from "../data/Constants.js";

// Shared setup for both player and enemy bullets -- creation, depth, gravity, bounce
// (for bounceable platforms), and initial rotation to match the texture's "points
// along +x at rotation 0" convention. Used by Player.fireWeapon and Enemy.fireBullet,
// which previously duplicated all of this independently.
export function createBullet(scene, group, texture, x, y, angle, speed) {
  const bullet = group.create(x, y, texture);
  bullet.setDepth(DEPTH.bullet);
  bullet.body.allowGravity = false;
  bullet.setBounce(1, 1); // full rebound off bounceable platforms; normal/breakable destroy it before this matters
  bullet.rotation = angle; // matches the texture's "points along +x at rotation 0" convention
  scene.physics.velocityFromRotation(angle, speed, bullet.body.velocity);
  return bullet;
}

// Called only when a bullet actually bounces off a bounceable platform -- velocity
// never changes at any other point in a bullet's life other than this and
// redirectBullet() below, so these are the only two spots (besides creation) where
// its facing needs to be recalculated.
export function reorientBullet(bullet) {
  bullet.rotation = Math.atan2(bullet.body.velocity.y, bullet.body.velocity.x);
}

// Smallest angle (in radians, signed, range -PI..PI) from `a` to `b`, handling the
// wraparound at +-PI so e.g. comparing 179deg to -179deg reads as "close", not "far".
function angleDelta(a, b) {
  let diff = (b - a) % (Math.PI * 2);
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (diff > Math.PI) diff -= Math.PI * 2;
  return diff;
}

// Called on overlap between a bullet group and a redirect platform (see Platform.js /
// GameScene.js). If the bullet isn't already traveling in the area's specified
// direction, it's snapped to the area's center and re-aimed along that direction,
// keeping its current speed. The already-on-course check matters twice over: it's
// what lets a bullet actually leave in the new direction without being immediately
// re-centered on the next overlapping frame, and it means a bullet merely passing
// straight through along the intended line is left alone entirely.
export function redirectBullet(bullet, area) {
  const currentAngle = Math.atan2(bullet.body.velocity.y, bullet.body.velocity.x);
  if (Math.abs(angleDelta(currentAngle, area.redirectAngle)) < 1e-4) return;

  const speed = Math.hypot(bullet.body.velocity.x, bullet.body.velocity.y);
  // bullet.setPosition() alone isn't enough here: the body owns position, not the
  // sprite, and the physics step's own sprite-from-body sync (which runs right after
  // this overlap callback, same step) would silently overwrite a plain setPosition()
  // and leave the bullet wherever its body actually was. body.reset() moves the body
  // itself (and syncs the sprite to match) -- it also zeroes velocity/acceleration as
  // a side effect, which is fine since we set the real velocity explicitly right after.
  bullet.body.reset(area.x, area.y);
  bullet.rotation = area.redirectAngle;
  bullet.scene.physics.velocityFromRotation(area.redirectAngle, speed, bullet.body.velocity);
}

// Destroys any bullet in the group once it's traveled `margin` past the world edge --
// called every frame (throttled) in GameScene.update(), but only over the (small)
// bullet groups, so it's cheap. Bullets no longer collide with world bounds, so
// without this they'd otherwise fly forever.
export function destroyOffscreenBullets(group, worldBounds, margin) {
  const { width, height } = worldBounds;
  group.children.iterate((bullet) => {
    if (!bullet || !bullet.active) return;
    if (bullet.x < -margin || bullet.x > width + margin || bullet.y < -margin || bullet.y > height + margin) {
      bullet.destroy();
    }
  });
}