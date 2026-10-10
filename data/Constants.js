export const BACKGROUND_COLOR = 0x1a1a22;

export const BULLET_TIME_MULTIPLIER = 0.25;

export const GAME_WIDTH = 640;
export const GAME_HEIGHT = 360;

export const GRAVITY = 700;

export const PLAYER_STATS = {
    moveSpeed: 240,
    jumpVelocity: 350,
    drag: 2400,
};

export const ENEMY_KNOCKBACK_DRAG = 700;

export const PLAYER_BUSY_TINT = 0xd8d8d8;

export const WEAPON_DISPLAY_DISTANCE = 16;

export const WEAPON_FLASH_TINT = 0xffff00;
export const WEAPON_FLASH_INTERVAL_MS = 100;

export const CHARGE_MIN_OPACITY = 0.3;

export const DASH = {
    speed: 700,
    drag: 2650,
    gravityFraction: 0.5,
    lockMs: 40,
    cooldownMs: 1200,
    minSpeed: 10,
    maxStepDistance: 6,
    skin: 2,
};

export const DEFAULT_WORLD_BOUNDS = {
    width: 700,
    height: 320,
};

export const ENEMY_MAX_INACCURACY_RAD = 1.5;

export const WEAPON_MAX_INACCURACY_RAD = 0.3;

export const BULLET_OFFSCREEN_MARGIN = 50;

export const ENEMY_WARNING_TIME_MS = 500;

export const ENEMY_OUT_OF_RANGE_TINT = 0x999999;

export const BULLET_PLAYER_TINT = 0xffd23a;
export const BULLET_ENEMY_TINT = 0xff1600;
export const GOAL_BASE_TINT = 0x23ff16;

export const PLAYER_DASH_PARTICLES = 0x5fcde4;

export const HIT_FLASH_BRIGHTEN_AMOUNT = 0.6;

export const TILE_SIZE = 32;

export const CHARGE_VIGNETTE_COLOR = 0x000000;
export const CHARGE_VIGNETTE_MAX_ALPHA = 0.25;

export const DEPTH = {
    background: 0,
    platform: 1,
    levelText: 2,
    goal: 3,
    enemy: 4,
    player: 5,
    weapon: 6,
    bullet: 7,
    explosion: 8,
};