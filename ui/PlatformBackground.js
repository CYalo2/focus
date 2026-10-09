import { createPlatforms } from "../entity/Platform.js";
import { BACKGROUND_COLOR, GAME_WIDTH, GAME_HEIGHT } from "../data/Constants.js";
import { getZoom } from "./DisplayScale.js";

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

function buildBackgroundTile(scene, preset, x, y) {
    const wrapSize = { width: preset.width, height: preset.height ?? preset.width };
    const result = createPlatforms(scene, preset.platforms, BACKGROUND_COLOR, wrapSize);
    return scene.add.container(x, y, collectPlatformVisuals(result));
}

export function createBackground(scene, preset, speed = 0, angleDegrees = 0) {
    const width = GAME_WIDTH, height = GAME_HEIGHT;
    const tileW = preset.width;
    const tileH = preset.height ?? preset.width;

    const cols = Math.ceil(width / tileW) + 2;
    const rows = Math.ceil(height / tileH) + 2;

    const root = scene.add.container(0, 0);
    root.setDepth(-100);
    root.setAlpha(0.35);

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

        const zoom = getZoom();
        const snap = (v) => Math.round(v * zoom) / zoom;
        tiles.forEach(({ t, c, r }) => {
            t.x = snap((c - 1) * tileW + offsetX);
            t.y = snap((r - 1) * tileH + offsetY);
        });
    };
}