import { createPlatforms } from "../entity/Platform.js";
import { BACKGROUND_COLOR } from "../data/Constants.js";

// createPlatforms() only returns its physics groups + the two outline-graphics
// passes -- some platform types (oneway, redirect) also attach extra visual
// pieces as properties on the base rect (onewayVisual.*, redirectArrow) rather
// than returning them, so we have to walk the groups to pick those up too.
// This gives us every game object one createPlatforms() call produced, so a
// tile can be treated as one self-contained unit for the container below.
function collectPlatformVisuals(result) {
    const objects = [];

    const groups = [
        result.platformsNormal, result.platformsOneway, result.platformsBreakable,
        result.platformsBounceable, result.platformsEnemyPassthrough,
        result.platformsBulletPassthrough, result.platformsDeath, result.platformsRedirect,
    ];

    groups.forEach(group => {
        group.getChildren().forEach(rect => {
            objects.push(rect);
            if (rect.onewayVisual) {
                objects.push(rect.onewayVisual.topStrip, rect.onewayVisual.inner, rect.onewayVisual.topBorder);
            }
            if (rect.redirectArrow) {
                objects.push(rect.redirectArrow);
            }
        });
    });

    objects.push(result.platformOutlines, result.platformBounceOutlines);
    return objects;
}

// One instance of a preset's platforms, built with the exact same renderer
// GameScene uses -- so oneway strips, redirect arrows, breakable cracks, bounce
// outlines, etc. all look identical to their in-level appearance -- positioned
// at (x, y) via a container. Passing { width, height } as the wrap size makes
// drawPlatformOutlines (inside createPlatforms) treat platforms touching the
// tile's right/bottom edge as adjacent to ones touching the left/top edge, so
// outlines connect seamlessly across the seam between repeated tiles instead of
// each tile getting its own capped-off border on the seam side.
//
// The physics bodies createPlatforms() makes are real static bodies, but
// nothing in these scenes ever colliders against them, so they just sit there
// unused -- harmless, and not worth stripping out given how much of the visual
// logic (oneway strips, outlines...) is entangled with the platform-creation
// loop itself.
function buildBackgroundTile(scene, preset, x, y) {
    const wrapSize = { width: preset.width, height: preset.height ?? preset.width };
    const result = createPlatforms(scene, preset.platforms, BACKGROUND_COLOR, wrapSize);
    return scene.add.container(x, y, collectPlatformVisuals(result));
}

// Lays a grid of `preset` copies over the screen (with a spare row/column of
// buffer in every direction) and returns an update(delta) function that
// drifts the whole grid at `angleDegrees` (0 = rightward, 90 = downward) at
// `speed` px/sec. Pass speed 0 for a static background; angle is irrelevant then.
export function createBackground(scene, preset, speed = 0, angleDegrees = 0) {
    const { width, height } = scene.scale;
    const tileW = preset.width;
    const tileH = preset.height ?? preset.width;

    // +2 so there's always a buffer tile ready to scroll into view on every side.
    const cols = Math.ceil(width / tileW) + 2;
    const rows = Math.ceil(height / tileH) + 2;

    const root = scene.add.container(0, 0);
    root.setDepth(-100); // behind everything else the scene adds
    root.setAlpha(0.35); // dimmed so foreground text/UI stays readable

    const tiles = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const t = buildBackgroundTile(scene, preset, c * tileW, r * tileH);
            root.add(t);
            tiles.push({ t, c, r });
        }
    }

    const rad = Phaser.Math.DegToRad(angleDegrees);
    const vx = Math.cos(rad) * speed;
    const vy = Math.sin(rad) * speed;

    let offsetX = 0, offsetY = 0;
    return function updateBackground(delta) {
        if (speed === 0) return;
        const dt = delta / 1000;
        offsetX = (offsetX + vx * dt) % tileW;
        offsetY = (offsetY + vy * dt) % tileH;
        // -1 column/row of offset so a tile is always ready just off the
        // top-left edge to drift into view as things move.
        tiles.forEach(({ t, c, r }) => {
            t.x = (c - 1) * tileW + offsetX;
            t.y = (r - 1) * tileH + offsetY;
        });
    };
}