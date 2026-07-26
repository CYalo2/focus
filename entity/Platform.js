import { PLATFORM_TYPES, PLATFORM_TINTS } from "../data/PlatformTypes.js";
import { DEPTH } from "../data/Constants.js";

// Builds the platform groups for a level from its platform list. Platforms are
// defined by two opposite corners (x1,y1)-(x2,y2) rather than a center point + size --
// order doesn't matter (top-left/bottom-right or the reverse both work), since
// width/height come from the absolute difference and the tileSprite's center is just
// the midpoint of the two corners.

// Draws a white arrow centered on a redirect platform, pointing along redirectAngle
// (radians, 0 = pointing right/+x, matching the bullet rotation convention used
// elsewhere). Built as a single filled polygon rather than separate shaft+head
// shapes so it stays crisp at the 90-degree increments redirect platforms mostly
// use, where every edge lands on a pixel-aligned horizontal/vertical line pre-rotation.
function drawRedirectArrow(scene, rect, w, h, angle) {
  const size = Math.min(w, h) * 0.6;
  const shaftHalf = size * 0.08;
  const headHalf = size * 0.22;
  const headLength = size * 0.35;
  const halfLen = size / 2;

  const arrow = scene.add.graphics();
  arrow.fillStyle(0xffffff, 1);
  arrow.beginPath();
  arrow.moveTo(-halfLen, -shaftHalf);
  arrow.lineTo(halfLen - headLength, -shaftHalf);
  arrow.lineTo(halfLen - headLength, -headHalf);
  arrow.lineTo(halfLen, 0);
  arrow.lineTo(halfLen - headLength, headHalf);
  arrow.lineTo(halfLen - headLength, shaftHalf);
  arrow.lineTo(-halfLen, shaftHalf);
  arrow.closePath();
  arrow.fillPath();

  arrow.setPosition(rect.x, rect.y);
  arrow.setRotation(angle);
  arrow.setDepth(DEPTH.platform + 1);
  rect.redirectArrow = arrow;
}

export function createPlatforms(scene, levelPlatforms) {
  const platformsNormal = scene.physics.add.staticGroup();
  const platformsOneway = scene.physics.add.staticGroup();
  const platformsBreakable = scene.physics.add.staticGroup();
  const platformsBounceable = scene.physics.add.staticGroup();
  const platformsEnemyPassthrough = scene.physics.add.staticGroup();
  const platformsBulletPassthrough = scene.physics.add.staticGroup();
  // Not solid to anything -- GameScene only ever registers an overlap (never a
  // collider) between the player and this group, purely to detect the touch and kill
  // the player. No collider means nothing (player, enemies, or bullets) is ever
  // physically blocked by it -- everything passes straight through, visually and
  // physically, the same as oneway platforms do from below/the side.
  const platformsDeath = scene.physics.add.staticGroup();
  // Also never a collider -- same passthrough treatment as platformsDeath. GameScene
  // registers an overlap between this group and the bullet groups only (not the
  // player or enemies) and calls redirectBullet() on hit; see Bullet.js.
  const platformsRedirect = scene.physics.add.staticGroup();

  levelPlatforms.forEach(p => {
    const type = p.type || 'normal';
    const typeDefaults = PLATFORM_TYPES[type];
    const w = Math.abs(p.x2 - p.x1);
    const h = Math.abs(p.y2 - p.y1);
    const cx = (p.x1 + p.x2) / 2;
    const cy = (p.y1 + p.y2) / 2;
    const rect = scene.add.tileSprite(cx, cy, w, h, 'platform');
    rect.setDepth(DEPTH.platform);
    rect.setTint(PLATFORM_TINTS[type]);
    rect.baseTint = PLATFORM_TINTS[type];
    scene.physics.add.existing(rect, true);
    rect.body.updateFromGameObject();

    if (type === 'oneway') {
      platformsOneway.add(rect);
    } else if (type === 'breakable') {
      rect.health = p.health !== undefined ? p.health : typeDefaults.health;
      platformsBreakable.add(rect);
    } else if (type === 'bounceable') {
      platformsBounceable.add(rect);
    } else if (type === 'enemyPassthrough') {
      platformsEnemyPassthrough.add(rect);
    } else if (type === 'bulletPassthrough') {
      platformsBulletPassthrough.add(rect);
    } else if (type === 'death') {
      platformsDeath.add(rect);
    } else if (type === 'redirect') {
      // p.direction is degrees (level-data convention), converted here to radians to
      // match bullet.rotation / velocityFromRotation's convention everywhere else.
      const degrees = p.direction !== undefined ? p.direction : 0;
      rect.redirectAngle = degrees * (Math.PI / 180);
      platformsRedirect.add(rect);
      drawRedirectArrow(scene, rect, w, h, rect.redirectAngle);
    } else {
      platformsNormal.add(rect);
    }
  });

  return {
    platformsNormal,
    platformsOneway,
    platformsBreakable,
    platformsBounceable,
    platformsEnemyPassthrough,
    platformsBulletPassthrough,
    platformsDeath,
    platformsRedirect,
  };
}