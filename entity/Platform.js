import { PLATFORM_TYPES, PLATFORM_TINTS } from "../data/PlatformTypes.js";
import { DEPTH, TILE_SIZE, BULLET_ENEMY_TINT } from "../data/Constants.js";
import { lightenColor } from "../data/ColorUtils.js";

// Builds the platform groups for a level from its platform list. Platforms are
// defined by two opposite corners (x1,y1)-(x2,y2) rather than a center point + size --
// order doesn't matter (top-left/bottom-right or the reverse both work), since
// width/height come from the absolute difference and the tileSprite's center is just
// the midpoint of the two corners.

// Sets tilePosition so this tileSprite's pattern lines up with every other aligned
// tileSprite in the world, regardless of where each one's own local origin falls.
// The background TileSprite is anchored at world (0,0) with tilePosition (0,0) (see
// GameScene.create()), so its tile pattern at any world point (wx, wy) shows texture
// coordinate (wx mod TILE_SIZE, wy mod TILE_SIZE). A given sprite's local (0,0) --
// its default-origin top-left corner -- sits at world (worldLeft, worldTop); setting
// tilePosition to that same value mod TILE_SIZE makes the texture shown there match
// what the background shows at that point, so patterns continue unbroken across
// sprite edges instead of restarting at each sprite's own corner. tileScale shifts
// the pattern's repeat period to TILE_SIZE * scale in world space while tilePosition
// itself stays in pre-scale texture space, so both the modulo period and the offset
// need to be divided through by the scale factor.
function alignTileSprite(sprite, worldLeft, worldTop) {
  const scaleX = sprite.tileScaleX;
  const scaleY = sprite.tileScaleY;
  const periodX = TILE_SIZE * scaleX;
  const periodY = TILE_SIZE * scaleY;
  sprite.tilePositionX = (((worldLeft % periodX) + periodX) % periodX) / scaleX;
  sprite.tilePositionY = (((worldTop % periodY) + periodY) % periodY) / scaleY;
}

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

const ONEWAY_TOP = 10;

// Platform types whose exposed edges get a darkened outline (see
// drawPlatformOutlines below). Just 'normal' for now, but kept as a list so
// other types can opt in later without touching the drawing logic.
const OUTLINE_PLATFORM_TYPES = ['normal'];

// Thickness (px) of the darkened outline strip.
const BORDER_WIDTH = 2;

// Alpha of the black overlay used to "darken" the border. Drawn as a
// semi-transparent black strip rather than a tinted color, since outline
// platforms use the raw 'tile' texture (no flat base color to darken).
const BORDER_DARKEN_ALPHA = 0.35;

// Builds a oneway platform as a tinted 'platform' top/bottom frame around an
// interior filled with 'background_tile', tinted to match the level's background
// (see GameScene's this.background.setTint call), instead of one flat tinted
// rectangle. rect is the (invisible) physics tileSprite already sized/positioned
// to the platform's full w x h -- this only adds decoration on top of it.
function buildOnewayVisual(scene, rect, w, h, levelBackgroundColor) {
  const left = rect.x - w / 2;
  const top = rect.y - h / 2;
  const bottom = rect.y + h / 2;

  const bTop = ONEWAY_TOP;
  const innerH = h - bTop;
  const innerCy = top + bTop + innerH / 2;

  const makeStrip = (x, y, sw, sh) => {
    const strip = scene.add.tileSprite(x, y, sw, sh, 'tile');
    strip.setDepth(DEPTH.platform);
    strip.setTileScale(2, 2);
    alignTileSprite(strip, x - sw / 2, y - sh / 2);
    return strip;
  };

  const topStrip = makeStrip(rect.x, top + bTop / 2, w, bTop);

  const inner = scene.add.tileSprite(rect.x, innerCy, w, innerH, 'background_tile');
  inner.setDepth(DEPTH.platform);
  inner.setTileScale(2, 2);
  inner.setTint(levelBackgroundColor !== undefined ? lightenColor(levelBackgroundColor, 0.2) : 0xffffff);
  alignTileSprite(inner, left, top + bTop);

  // A thin darkened line along the very top edge, same look (width/alpha) as
  // the outline drawn for OUTLINE_PLATFORM_TYPES, so oneway platforms read as
  // clearly cappable-from-above without needing their own separate style.
  const topBorder = scene.add.graphics();
  topBorder.setDepth(DEPTH.platform + 1);
  topBorder.fillStyle(0x000000, BORDER_DARKEN_ALPHA);
  topBorder.fillRect(left, top, w, BORDER_WIDTH);

  // The underlying rect stays invisible -- it exists purely to host the physics
  // body -- while these pieces provide the actual visual.
  rect.setVisible(false);
  rect.onewayVisual = { topStrip, inner, topBorder };
}

// Subtracts a set of [a,b] ranges from [start,end] and returns whatever
// sub-ranges are left over. Used to figure out which part of a platform's
// edge is NOT shared with a touching neighbor, so only that part gets the
// darkened border. coveredRanges may overlap each other and needn't be sorted.
function subtractCoveredRanges(start, end, coveredRanges) {
  let segments = [[start, end]];
  coveredRanges.forEach(([a, b]) => {
    const next = [];
    segments.forEach(([s, e]) => {
      if (b <= s || a >= e) {
        next.push([s, e]);
        return;
      }
      if (a > s) next.push([s, a]);
      if (b < e) next.push([b, e]);
    });
    segments = next;
  });
  return segments.filter(([s, e]) => e - s > 0.01);
}

// Draws a darkened outline around the exposed edges of `platforms` (each
// {left, top, right, bottom}). Where two platforms in the list share an edge
// (one's right lines up with another's left, etc, with overlapping range on
// the perpendicular axis), that shared portion is treated as interior -- no
// border is drawn there -- so a contiguous cluster of platforms reads as one
// shape with a single outline around its outside, rather than each platform
// getting its own fully-boxed border.
function drawPlatformOutlines(scene, platforms) {
  const graphics = scene.add.graphics();
  graphics.setDepth(DEPTH.platform + 1);
  graphics.fillStyle(0x000000, BORDER_DARKEN_ALPHA);

  platforms.forEach(p => {
    const touchingAbove = platforms
      .filter(q => q !== p && q.bottom === p.top && q.right > p.left && q.left < p.right)
      .map(q => [Math.max(q.left, p.left), Math.min(q.right, p.right)]);
    subtractCoveredRanges(p.left, p.right, touchingAbove)
      .forEach(([s, e]) => graphics.fillRect(s, p.top, e - s, BORDER_WIDTH));

    const touchingBelow = platforms
      .filter(q => q !== p && q.top === p.bottom && q.right > p.left && q.left < p.right)
      .map(q => [Math.max(q.left, p.left), Math.min(q.right, p.right)]);
    subtractCoveredRanges(p.left, p.right, touchingBelow)
      .forEach(([s, e]) => graphics.fillRect(s, p.bottom - BORDER_WIDTH, e - s, BORDER_WIDTH));

    const touchingLeft = platforms
      .filter(q => q !== p && q.right === p.left && q.bottom > p.top && q.top < p.bottom)
      .map(q => [Math.max(q.top, p.top), Math.min(q.bottom, p.bottom)]);
    subtractCoveredRanges(p.top, p.bottom, touchingLeft)
      .forEach(([s, e]) => graphics.fillRect(p.left, s, BORDER_WIDTH, e - s));

    const touchingRight = platforms
      .filter(q => q !== p && q.left === p.right && q.bottom > p.top && q.top < p.bottom)
      .map(q => [Math.max(q.top, p.top), Math.min(q.bottom, p.bottom)]);
    subtractCoveredRanges(p.top, p.bottom, touchingRight)
      .forEach(([s, e]) => graphics.fillRect(p.right - BORDER_WIDTH, s, BORDER_WIDTH, e - s));
  });

  return graphics;
}

export function createPlatforms(scene, levelPlatforms, levelBackgroundColor) {
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

  // Geometry (left/top/right/bottom) for every platform whose type is in
  // OUTLINE_PLATFORM_TYPES, collected as we go so we can draw the darkened
  // outline once all platforms exist -- outline-drawing needs to see every
  // candidate at once to know which edges are shared vs exposed.
  const outlineCandidates = [];

  levelPlatforms.forEach(p => {
    const type = p.type || 'normal';
    const typeDefaults = PLATFORM_TYPES[type];
    const w = Math.abs(p.x2 - p.x1);
    const h = Math.abs(p.y2 - p.y1);
    const cx = (p.x1 + p.x2) / 2;
    const cy = (p.y1 + p.y2) / 2;

    // 'normal' platforms use the same 'tile' texture as GameScene's background,
    // untinted, so they read as a cutout of the background rather than their own
    // rectangle. 'breakable' platforms get the same blend-style treatment but with
    // their own 'breakable_tile' texture instead, so cracks/damage read clearly
    // without a flat tint washing them out. 'bulletPassthrough' also blends in with
    // 'tile', tinted like the interior of a oneway platform (see buildOnewayVisual's
    // `inner`) -- lightenColor(levelBackgroundColor, 0.5). 'enemyPassthrough' gets
    // that same lightenColor(..., 0.5) treatment, but starting from BULLET_ENEMY_TINT
    // instead of the background color, so it reads as the enemy-flavored version of
    // the same see-through surface. Every other type keeps the old 'platform'
    // texture + type tint.
    const BLEND_TEXTURES = { normal: 'tile', breakable: 'breakable_tile', bulletPassthrough: 'background_tile', enemyPassthrough: 'tile' };
    const isBlendPlatform = type in BLEND_TEXTURES;
    const rect = scene.add.tileSprite(cx, cy, w, h, isBlendPlatform ? BLEND_TEXTURES[type] : 'platform');
    rect.setDepth(DEPTH.platform);
    rect.setTileScale(2, 2);

    const left = cx - w / 2;
    const top = cy - h / 2;
    alignTileSprite(rect, left, top);

    if (OUTLINE_PLATFORM_TYPES.includes(type)) {
      outlineCandidates.push({ left, top, right: left + w, bottom: top + h });
    }

    if (!isBlendPlatform) {
      rect.setTint(PLATFORM_TINTS[type]);
      rect.baseTint = PLATFORM_TINTS[type];
    } else if (type === 'breakable') {
      // Untinted (see BLEND_TEXTURES above), but damagePlatformAtPoint's hit-flash
      // in GameScene still reads/restores rect.baseTint -- white is the tint that
      // leaves the texture showing as-is, so flashing toward it and back is a no-op
      // visually until the brighten kicks in, exactly like the tinted types above.
      rect.baseTint = 0xffffff;
    } else if (type === 'bulletPassthrough') {
      rect.setTint(levelBackgroundColor !== undefined ? lightenColor(levelBackgroundColor, 0.2) : 0xffffff);
    } else if (type === 'enemyPassthrough') {
      rect.setTint(lightenColor(BULLET_ENEMY_TINT, 0.5));
    }

    scene.physics.add.existing(rect, true);
    rect.body.updateFromGameObject();

    if (type === 'oneway') {
      platformsOneway.add(rect);
      buildOnewayVisual(scene, rect, w, h, levelBackgroundColor);
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

  const platformOutlines = drawPlatformOutlines(scene, outlineCandidates);

  return {
    platformsNormal,
    platformsOneway,
    platformsBreakable,
    platformsBounceable,
    platformsEnemyPassthrough,
    platformsBulletPassthrough,
    platformsDeath,
    platformsRedirect,
    platformOutlines,
  };
}