export const BACKGROUND_COLOR = 0x1a1a22;

export const BULLET_TIME_MULTIPLIER = 0.5;

export const GRAVITY = 1400;

export const PLAYER_STATS = {
    moveSpeed: 480,
    jumpVelocity: 700,
    drag: 4800,
};

export const ENEMY_KNOCKBACK_DRAG = 1400;

// Single subtle shade applied to the player while charging, fully charged, or on
// weapon cooldown alike -- replaces the old three separate per-state tints. Close to
// white (0xffffff = no change) so it reads as "very slightly shaded", not a color swap.
export const PLAYER_BUSY_TINT = 0xd8d8d8;

// How far (px) the weapon display sprite sits from the player's center, along the
// aim direction -- see Player.updateWeaponDisplay().
export const WEAPON_DISPLAY_DISTANCE = 32;

// Repeating flash shown on the weapon display sprite while a CHARGE-mode weapon is
// held at full charge -- alternates with the sprite's normal look every
// WEAPON_FLASH_INTERVAL_MS. See Player.updateWeaponDisplay().
export const WEAPON_FLASH_TINT = 0xffff00;
export const WEAPON_FLASH_INTERVAL_MS = 100;

export const CHARGE_MIN_OPACITY = 0.3;

export const DASH = {
    speed: 1400,
    drag: 5300,
    gravityFraction: 0.5,
    lockMs: 40,
    cooldownMs: 1200,
    minSpeed: 20,
    maxStepDistance: 12,
    skin: 4,
};

export const DEFAULT_WORLD_BOUNDS = {
    width: 1400,
    height: 640,
};

export const ENEMY_MAX_INACCURACY_RAD = 1.5;

export const WEAPON_MAX_INACCURACY_RAD = 0.3;

export const BULLET_OFFSCREEN_MARGIN = 100;

// How long (ms) before an enemy's cooldown ends that it starts showing
// ENEMY_WARNING_TINT to telegraph an incoming shot -- see Enemy.js's
// updateThreatTint(), which compares this against shootCooldownRemaining.
export const ENEMY_WARNING_TIME_MS = 500;

// Shown instead of the enemy's normal appearance while the player is outside
// this enemy's attack range box (see isPlayerInRange() in Enemy.js) -- a
// muted, desaturated shade signaling it currently poses no threat.
export const ENEMY_OUT_OF_RANGE_TINT = 0x999999;

export const BULLET_PLAYER_TINT = 0xffd23a;
export const BULLET_ENEMY_TINT = 0xff1600;
export const GOAL_BASE_TINT = 0x63c722;

export const PLAYER_DASH_PARTICLES = 0x5fcde4;

export const HIT_FLASH_BRIGHTEN_AMOUNT = 0.6;

export const TILE_SIZE = 32;

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