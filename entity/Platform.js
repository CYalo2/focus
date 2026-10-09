import { PLATFORM_TYPES, PLATFORM_TINTS } from "../data/PlatformTypes.js";
import { DEPTH, TILE_SIZE, BULLET_ENEMY_TINT, GOAL_BASE_TINT } from "../data/Constants.js";
import { lightenColor } from "../data/ColorUtils.js";
import { getZoom, snapToDevicePixel } from "../ui/DisplayScale.js";

function alignTileSprite(sprite, worldLeft, worldTop) {
  const scaleX = sprite.tileScaleX;
  const scaleY = sprite.tileScaleY;
  const periodX = TILE_SIZE * scaleX;
  const periodY = TILE_SIZE * scaleY;
  sprite.tilePositionX = (((worldLeft % periodX) + periodX) % periodX) / scaleX;
  sprite.tilePositionY = (((worldTop % periodY) + periodY) % periodY) / scaleY;
}

function rasterizeRedirectArrow(arrow, rect, w, h, angle) {
  const zoom = getZoom();
  const step = 1 / zoom;

  const size = Math.max(7, Math.floor(Math.min(w, h) * 0.7));
  const halfLen = size / 2;
  const headLength = Math.max(3, size * 0.45);
  const headHalf = Math.max(2, size * 0.28);
  const shaftHalf = Math.max(1, size * 0.1);
  const shaftEnd = halfLen - headLength;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const reachPx = Math.ceil((Math.ceil(halfLen) + 1) * zoom);

  arrow.clear();
  arrow.fillStyle(0xffffff, 1);
  for (let py = -reachPx; py < reachPx; py++) {
    let runStart = null;
    for (let px = -reachPx; px <= reachPx; px++) {
      let lit = false;
      if (px < reachPx) {
        const cx = (px + 0.5) * step;
        const cy = (py + 0.5) * step;
        const u = cx * cos + cy * sin;
        const v = -cx * sin + cy * cos;
        const inShaft = u >= -halfLen && u <= shaftEnd && Math.abs(v) <= shaftHalf;
        const inHead = u > shaftEnd && u <= halfLen && Math.abs(v) <= headHalf * (halfLen - u) / headLength;
        lit = inShaft || inHead;
      }

      if (lit && runStart === null) runStart = px;
      if (!lit && runStart !== null) {
        arrow.fillRect(runStart * step, py * step, (px - runStart) * step, step);
        runStart = null;
      }
    }
  }

  arrow.setPosition(snapToDevicePixel(rect.x), snapToDevicePixel(rect.y));
}

const redirectArrows = new Set();

function drawRedirectArrow(scene, rect, w, h, angle) {
  const arrow = scene.add.graphics();
  arrow.setDepth(DEPTH.platform + 1);
  arrow.redirectSpec = { rect, w, h, angle };
  rasterizeRedirectArrow(arrow, rect, w, h, angle);
  redirectArrows.add(arrow);
  rect.redirectArrow = arrow;
}

export function refreshRedirectArrows() {
  redirectArrows.forEach(arrow => {
    if (!arrow.scene || !arrow.active) {
      redirectArrows.delete(arrow);
      return;
    }
    const { rect, w, h, angle } = arrow.redirectSpec;
    rasterizeRedirectArrow(arrow, rect, w, h, angle);
  });
}

const ONEWAY_TOP = 5;

const OUTLINE_PLATFORM_TYPES = ['normal'];

const BORDER_WIDTH = 1;

const BORDER_DARKEN_ALPHA = 0.35;

const BOUNCE_OUTLINE_COLOR = 0x98fb98;
const BOUNCE_OUTLINE_ALPHA = 0.2;

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
    strip.setTileScale(1, 1);
    alignTileSprite(strip, x - sw / 2, y - sh / 2);
    return strip;
  };

  const topStrip = makeStrip(rect.x, top + bTop / 2, w, bTop);

  const inner = scene.add.tileSprite(rect.x, innerCy, w, innerH, 'background_tile');
  inner.setDepth(DEPTH.platform);
  inner.setTileScale(1, 1);
  inner.setTint(levelBackgroundColor !== undefined ? lightenColor(levelBackgroundColor, 0.2) : 0xffffff);
  alignTileSprite(inner, left, top + bTop);

  const topBorder = scene.add.graphics();
  topBorder.setDepth(DEPTH.platform + 1);
  topBorder.fillStyle(0x000000, BORDER_DARKEN_ALPHA);
  topBorder.fillRect(left, top, w, BORDER_WIDTH);

  rect.setVisible(false);
  rect.onewayVisual = { topStrip, inner, topBorder };
}

const GOAL_WIDTH = 20;
const GOAL_HEIGHT = 30;
const GOAL_BORDER = 2;

export function createGoal(scene, x, y, levelBackgroundColor) {
  const w = GOAL_WIDTH;
  const h = GOAL_HEIGHT;
  const border = GOAL_BORDER;

  const left = x - w / 2;
  const top = y - h / 2;
  const right = x + w / 2;

  const body = scene.add.tileSprite(x, y, w, h, 'tile');
  body.setDepth(DEPTH.goal);
  scene.physics.add.existing(body, true);
  body.body.updateFromGameObject();
  body.setVisible(false);

  const makeStrip = (sx, sy, sw, sh, texture) => {
    const strip = scene.add.tileSprite(sx, sy, sw, sh, texture);
    strip.setDepth(DEPTH.goal);
    strip.setTileScale(1, 1);
    alignTileSprite(strip, sx - sw / 2, sy - sh / 2);
    return strip;
  };

  const sideH = h - border;
  const sideCy = top + border + sideH / 2;

  const topStrip = makeStrip(x, top + border / 2, w, border, 'tile');
  topStrip.setTint(GOAL_BASE_TINT);

  const leftStrip = makeStrip(left + border / 2, sideCy, border, sideH, 'tile');
  leftStrip.setTint(GOAL_BASE_TINT);

  const rightStrip = makeStrip(right - border / 2, sideCy, border, sideH, 'tile');
  rightStrip.setTint(GOAL_BASE_TINT);

  const innerW = w - border * 2;
  const inner = scene.add.tileSprite(x, sideCy, innerW, sideH, 'background_tile');
  inner.setDepth(DEPTH.goal);
  inner.setTileScale(1, 1);
  inner.setTint(levelBackgroundColor !== undefined ? lightenColor(levelBackgroundColor, 0.2) : 0xffffff);
  alignTileSprite(inner, left + border, top + border);

  body.goalVisual = { topStrip, leftStrip, rightStrip, inner };
  return body;
}

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

function drawPlatformOutlines(scene, platforms, color = 0x000000, alpha = BORDER_DARKEN_ALPHA, wrapWidth, wrapHeight) {
  const graphics = scene.add.graphics();
  graphics.setDepth(DEPTH.platform + 1);
  graphics.fillStyle(color, alpha);

  platforms.forEach(p => {
    const touchingAbove = platforms
      .filter(q => (q !== p || wrapHeight) && q.right > p.left && q.left < p.right &&
        (q.bottom === p.top || (wrapHeight && q.bottom === p.top + wrapHeight)))
      .map(q => [Math.max(q.left, p.left), Math.min(q.right, p.right)]);
    subtractCoveredRanges(p.left, p.right, touchingAbove)
      .forEach(([s, e]) => graphics.fillRect(s, p.top, e - s, BORDER_WIDTH));

    const touchingBelow = platforms
      .filter(q => (q !== p || wrapHeight) && q.right > p.left && q.left < p.right &&
        (q.top === p.bottom || (wrapHeight && q.top === p.bottom - wrapHeight)))
      .map(q => [Math.max(q.left, p.left), Math.min(q.right, p.right)]);
    subtractCoveredRanges(p.left, p.right, touchingBelow)
      .forEach(([s, e]) => graphics.fillRect(s, p.bottom - BORDER_WIDTH, e - s, BORDER_WIDTH));

    const touchingLeft = platforms
      .filter(q => (q !== p || wrapWidth) && q.bottom > p.top && q.top < p.bottom &&
        (q.right === p.left || (wrapWidth && q.right === p.left + wrapWidth)))
      .map(q => [Math.max(q.top, p.top), Math.min(q.bottom, p.bottom)]);
    subtractCoveredRanges(p.top, p.bottom, touchingLeft)
      .forEach(([s, e]) => graphics.fillRect(p.left, s, BORDER_WIDTH, e - s));

    const touchingRight = platforms
      .filter(q => (q !== p || wrapWidth) && q.bottom > p.top && q.top < p.bottom &&
        (q.left === p.right || (wrapWidth && q.left === p.right - wrapWidth)))
      .map(q => [Math.max(q.top, p.top), Math.min(q.bottom, p.bottom)]);
    subtractCoveredRanges(p.top, p.bottom, touchingRight)
      .forEach(([s, e]) => graphics.fillRect(p.right - BORDER_WIDTH, s, BORDER_WIDTH, e - s));
  });

  return graphics;
}

export function createPlatforms(scene, levelPlatforms, levelBackgroundColor, wrapSize) {
  const platformsNormal = scene.physics.add.staticGroup();
  const platformsOneway = scene.physics.add.staticGroup();
  const platformsBreakable = scene.physics.add.staticGroup();
  const platformsBounceable = scene.physics.add.staticGroup();
  const platformsEnemyPassthrough = scene.physics.add.staticGroup();
  const platformsBulletPassthrough = scene.physics.add.staticGroup();

  const platformsDeath = scene.physics.add.staticGroup();

  const platformsRedirect = scene.physics.add.staticGroup();

  const outlineCandidates = [];

  const bounceOutlineCandidates = [];

  levelPlatforms.forEach(p => {
    const type = p.type || 'normal';
    const typeDefaults = PLATFORM_TYPES[type];
    const w = Math.abs(p.x2 - p.x1);
    const h = Math.abs(p.y2 - p.y1);
    const cx = (p.x1 + p.x2) / 2;
    const cy = (p.y1 + p.y2) / 2;

    const BLEND_TEXTURES = { normal: 'tile', breakable: 'breakable_tile', bulletPassthrough: 'background_tile', enemyPassthrough: 'tile', bounceable: 'bounce_tile' };
    const isBlendPlatform = type in BLEND_TEXTURES;
    const rect = scene.add.tileSprite(cx, cy, w, h, isBlendPlatform ? BLEND_TEXTURES[type] : 'platform');
    rect.setDepth(DEPTH.platform);
    rect.setTileScale(1, 1);

    const left = cx - w / 2;
    const top = cy - h / 2;
    alignTileSprite(rect, left, top);

    if (OUTLINE_PLATFORM_TYPES.includes(type)) {
      outlineCandidates.push({ left, top, right: left + w, bottom: top + h });
    }

    if (type === 'bounceable') {
      bounceOutlineCandidates.push({ left, top, right: left + w, bottom: top + h });
    }

    if (!isBlendPlatform) {
      rect.setTint(PLATFORM_TINTS[type]);
      rect.baseTint = PLATFORM_TINTS[type];
    } else if (type === 'breakable') {
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
      const degrees = p.direction !== undefined ? p.direction : 0;
      rect.redirectAngle = degrees * (Math.PI / 180);
      platformsRedirect.add(rect);
      drawRedirectArrow(scene, rect, w, h, rect.redirectAngle);
    } else {
      platformsNormal.add(rect);
    }
  });

  const platformOutlines = drawPlatformOutlines(scene, outlineCandidates, undefined, undefined, wrapSize?.width, wrapSize?.height);
  const platformBounceOutlines = drawPlatformOutlines(scene, bounceOutlineCandidates, BOUNCE_OUTLINE_COLOR, BOUNCE_OUTLINE_ALPHA, wrapSize?.width, wrapSize?.height);

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
    platformBounceOutlines,
  };
}