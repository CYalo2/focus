import { DEPTH, ENEMY_BASE_TINT, GOAL_BASE_TINT, PLAYER_DASH_PARTICLES } from "../data/Constants.js";

// All three effects use the plain white 'particle' texture from BootScene and tint it
// per-call -- tinting white with any color gives back that exact color (unlike tinting
// white WITH white, which is the invisible no-op multiply described elsewhere for hit
// flashes -- not a concern here since we're never tinting toward white itself).

// ParticleEmitter has its own `timeScale` property, completely separate from
// Clock/Tweens/Arcade World timeScale -- Phaser doesn't apply GameScene's bullet-time
// scaling to particles automatically. Snapshotting scene.time.timeScale onto the
// emitter at creation is enough for these short-lived effects (all under 2.2s even at
// full duration): if bullet time toggles mid-burst the tail end won't re-sync, but
// that's not visually noticeable for effects this short.
function syncToBulletTime(scene, emitter) {
  emitter.timeScale = scene.time.timeScale;
}

// Small, short-lived burst for a projectile hitting/breaking against a wall, an enemy,
// or the player. Only call this where a bullet actually breaks -- never for a
// bounceable rebound (it doesn't break there) or for bullets cleaned up offscreen.
export function spawnBulletBreakParticles(scene, x, y, color) {
  const emitter = scene.add.particles(x, y, 'particle', {
    lifespan: 250,
    speed: { min: 60, max: 160 },
    scale: { start: 0.6, end: 0 },
    alpha: { start: 1, end: 0 },
    tint: color,
    quantity: 10,
    emitting: false,
  });
  emitter.setDepth(DEPTH.explosion);
  syncToBulletTime(scene, emitter);
  emitter.explode(10);
  scene.time.delayedCall(300, () => emitter.destroy());
}

// Bigger, longer-lived burst for an enemy dying -- whether from a direct hit or from
// being caught in an explosive weapon's splash radius.
export function spawnEnemyDeathParticles(scene, x, y) {
  const emitter = scene.add.particles(x, y, 'particle', {
    lifespan: 500,
    speed: { min: 80, max: 220 },
    scale: { start: 1, end: 0 },
    alpha: { start: 1, end: 0 },
    tint: ENEMY_BASE_TINT,
    quantity: 20,
    emitting: false,
  });
  emitter.setDepth(DEPTH.explosion);
  syncToBulletTime(scene, emitter);
  emitter.explode(20);
  scene.time.delayedCall(600, () => emitter.destroy());
}

// Tiny burst for a projectile bouncing off a bounceable platform -- much smaller than
// the break burst above, since a bounce isn't the bullet dying, just a little visual
// tap to sell the impact.
export function spawnBulletBounceParticles(scene, x, y, color) {
  const emitter = scene.add.particles(x, y, 'particle', {
    lifespan: 150,
    speed: { min: 30, max: 80 },
    scale: { start: 0.35, end: 0 },
    alpha: { start: 0.8, end: 0 },
    tint: color,
    quantity: 4,
    emitting: false,
  });
  emitter.setDepth(DEPTH.explosion);
  syncToBulletTime(scene, emitter);
  emitter.explode(4);
  scene.time.delayedCall(200, () => emitter.destroy());
}

// Small burst at the point where a dash begins -- fires once at the start position,
// not a trail following the player through the dash itself.
export function spawnDashParticles(scene, x, y) {
  const emitter = scene.add.particles(x, y, 'particle', {
    lifespan: 200,
    speed: { min: 40, max: 120 },
    scale: { start: 0.5, end: 0 },
    alpha: { start: 0.8, end: 0 },
    tint: PLAYER_DASH_PARTICLES,
    quantity: 8,
    emitting: false,
  });
  emitter.setDepth(DEPTH.explosion);
  syncToBulletTime(scene, emitter);
  emitter.explode(8);
  scene.time.delayedCall(250, () => emitter.destroy());
}

// Tiny burst for a breakable platform taking a hit but surviving -- much smaller than
// the break burst below, just a little visual tap to sell the impact landed.
const BREAKABLE_PLATFORM_TINT = 0x999999;

export function spawnPlatformHitParticles(scene, x, y) {
  const emitter = scene.add.particles(x, y, 'particle', {
    lifespan: 180,
    speed: { min: 30, max: 90 },
    scale: { start: 0.4, end: 0 },
    alpha: { start: 0.8, end: 0 },
    tint: BREAKABLE_PLATFORM_TINT,
    quantity: 5,
    emitting: false,
  });
  emitter.setDepth(DEPTH.explosion);
  syncToBulletTime(scene, emitter);
  emitter.explode(5);
  scene.time.delayedCall(230, () => emitter.destroy());
}

// Bigger burst for a breakable platform actually breaking apart -- call this once,
// where the platform is destroyed, not on every hit leading up to it.
export function spawnPlatformBreakParticles(scene, x, y) {
  const emitter = scene.add.particles(x, y, 'particle', {
    lifespan: 400,
    speed: { min: 60, max: 200 },
    scale: { start: 0.8, end: 0 },
    alpha: { start: 1, end: 0 },
    tint: BREAKABLE_PLATFORM_TINT,
    quantity: 18,
    emitting: false,
  });
  emitter.setDepth(DEPTH.explosion);
  syncToBulletTime(scene, emitter);
  emitter.explode(18);
  scene.time.delayedCall(450, () => emitter.destroy());
}

// Ambient sparkle on the goal for a limited window after the last enemy is cleared,
// then stops on its own -- not a permanent effect. `duration` tells the emitter to
// stop spawning new particles after that many ms; we then wait an extra `lifespan` on
// top of that before destroying the emitter object itself, so the last few particles
// it spawned get to fully fade out instead of vanishing abruptly. Meant to be started
// once (guard against calling this every frame) the moment the last enemy is cleared.
const GOAL_PARTICLE_DURATION_MS = 1500;
const GOAL_PARTICLE_LIFESPAN_MS = 700;

export function startGoalActivationParticles(scene, x, y) {
  const emitter = scene.add.particles(x, y, 'particle', {
    lifespan: GOAL_PARTICLE_LIFESPAN_MS,
    speed: { min: 20, max: 70 },
    scale: { start: 0.6, end: 0 },
    alpha: { start: 1, end: 0 },
    tint: GOAL_BASE_TINT,
    quantity: 1,
    frequency: 120, // one new particle roughly every 120ms, until duration runs out
    duration: GOAL_PARTICLE_DURATION_MS,
  });
  emitter.setDepth(DEPTH.explosion);
  syncToBulletTime(scene, emitter);
  scene.time.delayedCall(GOAL_PARTICLE_DURATION_MS + GOAL_PARTICLE_LIFESPAN_MS, () => emitter.destroy());
  return emitter;
}