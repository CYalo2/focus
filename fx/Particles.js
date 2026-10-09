import { DEPTH, BULLET_ENEMY_TINT, GOAL_BASE_TINT, PLAYER_DASH_PARTICLES } from "../data/Constants.js";

function syncToBulletTime(scene, emitter) {
  emitter.timeScale = scene.time.timeScale;
}

export function spawnBulletBreakParticles(scene, x, y, color) {
  const emitter = scene.add.particles(x, y, 'particle', {
    lifespan: 250,
    speed: { min: 30, max: 80 },
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

export function spawnEnemyDeathParticles(scene, x, y) {
  const emitter = scene.add.particles(x, y, 'particle', {
    lifespan: 500,
    speed: { min: 40, max: 110 },
    scale: { start: 1, end: 0 },
    alpha: { start: 1, end: 0 },
    tint: BULLET_ENEMY_TINT,
    quantity: 20,
    emitting: false,
  });
  emitter.setDepth(DEPTH.explosion);
  syncToBulletTime(scene, emitter);
  emitter.explode(20);
  scene.time.delayedCall(600, () => emitter.destroy());
}

export function spawnBulletBounceParticles(scene, x, y, color) {
  const emitter = scene.add.particles(x, y, 'particle', {
    lifespan: 150,
    speed: { min: 15, max: 40 },
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

export function spawnDashParticles(scene, x, y) {
  const emitter = scene.add.particles(x, y, 'particle', {
    lifespan: 200,
    speed: { min: 20, max: 60 },
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

const BREAKABLE_PLATFORM_TINT = 0x999999;

export function spawnPlatformHitParticles(scene, x, y) {
  const emitter = scene.add.particles(x, y, 'particle', {
    lifespan: 180,
    speed: { min: 15, max: 45 },
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

export function spawnPlatformBreakParticles(scene, x, y) {
  const emitter = scene.add.particles(x, y, 'particle', {
    lifespan: 400,
    speed: { min: 30, max: 100 },
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

const GOAL_PARTICLE_DURATION_MS = 1500;
const GOAL_PARTICLE_LIFESPAN_MS = 700;

export function startGoalActivationParticles(scene, x, y) {
  const emitter = scene.add.particles(x, y, 'particle', {
    lifespan: GOAL_PARTICLE_LIFESPAN_MS,
    speed: { min: 10, max: 35 },
    scale: { start: 0.6, end: 0 },
    alpha: { start: 1, end: 0 },
    tint: GOAL_BASE_TINT,
    quantity: 1,
    frequency: 120,
    duration: GOAL_PARTICLE_DURATION_MS,
  });
  emitter.setDepth(DEPTH.explosion);
  syncToBulletTime(scene, emitter);
  scene.time.delayedCall(GOAL_PARTICLE_DURATION_MS + GOAL_PARTICLE_LIFESPAN_MS, () => emitter.destroy());
  return emitter;
}