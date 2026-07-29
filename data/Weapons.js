import { WEAPON_MAX_INACCURACY_RAD } from "./Constants.js";

// CHARGE: hold click to charge, release to fire; movement/jump multipliers apply
// while charging. Requires chargeTimeMs.
//   Optional minChargeMs lets the weapon fire early on release instead of requiring
//   a full chargeTimeMs hold -- releasing anywhere from minChargeMs up to
//   chargeTimeMs still fires, at a proportional "charge ratio" of
//   (elapsed - minChargeMs) / (chargeTimeMs - minChargeMs), 0 (just barely
//   qualified) to 1 (fully charged). That ratio scales the fired projectile's
//   damage and knockback, and its visual opacity between CHARGE_MIN_OPACITY and 1
//   -- see Player.getChargeRatio()/fireWeapon() and Enemy.applyKnockback(). Releasing
//   before minChargeMs doesn't fire at all, same as releasing early already didn't.
//   Leaving minChargeMs undefined keeps the old all-or-nothing behavior: only a
//   release at or after chargeTimeMs fires, always at full ratio (1).
// COOLDOWN: fires immediately on click, then can't fire again until cooldownMs
// elapses; movement/jump multipliers apply during that cooldown instead. Requires
// cooldownMs.
export const WEAPON_FIRE_MODE = {
    CHARGE: "charge",
    COOLDOWN: "cooldown",
};

// Applies this weapon's accuracy spread to a base aim angle -- same triangular
// distribution Enemy.shoot() uses (Math.random() - Math.random(), weighted toward 0
// rather than a flat edge-to-edge spread), just scaled by WEAPON_MAX_INACCURACY_RAD
// instead of the enemy constant, so player weapons read as noticeably more precise
// than enemy fire at a comparable accuracy value. accuracy is 0..1 and defaults to 1
// (perfectly accurate, zero spread) when a weapon doesn't define one, so existing
// weapons are unaffected unless they opt in. Used by both Player.fireWeapon (for
// travelling projectiles) and GameScene.fireBeamWeapon (for the hitscan beam), so a
// weapon's accuracy applies the same way regardless of which of the two it uses.
export function applyWeaponSpread(weapon, baseAngle) {
    const accuracy = weapon.accuracy !== undefined ? weapon.accuracy : 1;
    const spread = (1 - accuracy) * WEAPON_MAX_INACCURACY_RAD;
    if (!spread) return baseAngle;
    return baseAngle + (Math.random() - Math.random()) * spread;
}

export const WEAPONS = {
    default: {
        fireMode: WEAPON_FIRE_MODE.CHARGE,
        chargeTimeMs: 300,
        minChargeMs: 200,
        moveSpeedMultiplier: 0.5,
        jumpMultiplier: 0.5,
        projectileSpeed: 900,
        recoil: 300,
        damage: 1,
    },

    // Same stats as `default`, but isBeam: true replaces the travelling projectile
    // with an instant hitscan beam (see Player.fireWeapon / GameScene.fireBeamWeapon).
    // The beam stops at the first normal/enemyPassthrough platform in its path (same
    // platforms a regular bullet would break against), but pierces straight through
    // breakable and bounceable platforms -- damaging every breakable it passes
    // through along the way -- and through every enemy in its path, same as it pierces
    // breakables. beamWidth is purely visual (the drawn rectangle's thickness);
    // beamRange caps how far it can reach if nothing stops it first.
    beam: {
        fireMode: WEAPON_FIRE_MODE.CHARGE,
        chargeTimeMs: 500,
        moveSpeedMultiplier: 0.8,
        jumpMultiplier: 0.8,
        recoil: 300,
        damage: 1,
        isBeam: true,
        beamWidth: 6,
        beamRange: 1500,
    },

    // Example of a COOLDOWN-mode weapon with an on-hit explosion: fires the instant
    // you click, then the movement/jump multipliers apply for cooldownMs before you
    // can fire again. explodesOnHit + explosionRadius deal `damage` to every enemy
    // within that radius when the bullet breaks against a wall or a direct hit --
    // not when it bounces off a bounceable platform, and not when it's cleaned up
    // for going offscreen.
    blaster: {
        fireMode: WEAPON_FIRE_MODE.COOLDOWN,
        cooldownMs: 700,
        moveSpeedMultiplier: 0.4,
        jumpMultiplier: 0.25,
        projectileSpeed: 600,
        recoil: 500,
        damage: 1,
        explodesOnHit: true,
        explosionRadius: 80,
    },
};