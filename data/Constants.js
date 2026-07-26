export const BULLET_TIME_MULTIPLIER = 0.5;

export const GRAVITY = 1400;

export const PLAYER_STATS = {
    moveSpeed: 480,
    jumpVelocity: 700,
    drag: 4800,
};

export const ENEMY_KNOCKBACK_DRAG = 1400;

export const CHARGING_TINT = 0xff8a3a;
export const CHARGE_READY_TINT = 0xffe066;

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

export const ENEMY_BASE_TINT = 0xe24b4a;

// How long (ms) before an enemy's cooldown ends that it starts showing
// ENEMY_WARNING_TINT to telegraph an incoming shot -- see Enemy.js's
// updateThreatTint(), which compares this against shootCooldownRemaining.
export const ENEMY_WARNING_TIME_MS = 400;

// Shown instead of the enemy's normal appearance while it's within
// ENEMY_WARNING_TIME_MS of firing (and the player's in range) -- a brighter,
// more urgent-looking shade than the base red so an incoming shot reads as a
// distinct warning rather than blending into idle/hit-flash colors.
export const ENEMY_WARNING_TINT = 0xff7a5c;

// Shown instead of the enemy's normal appearance while the player is outside
// this enemy's attack range box (see isPlayerInRange() in Enemy.js) -- a
// muted, desaturated shade signaling it currently poses no threat.
export const ENEMY_OUT_OF_RANGE_TINT = 0x8a5a5a;

export const BULLET_PLAYER_TINT = 0xffd23a;
export const BULLET_ENEMY_TINT = 0xff8a3a;
export const GOAL_BASE_TINT = 0x63c722;
export const PLAYER_BASE_TINT = 0x3aa0ff;

export const HIT_FLASH_BRIGHTEN_AMOUNT = 0.6;

export const DEPTH = {
    platform: 0,
    levelText: 1,
    goal: 2,
    enemy: 3,
    player: 4,
    bullet: 5,
    explosion: 6,
};