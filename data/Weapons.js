// CHARGE: hold click to charge, release to fire; movement/jump multipliers apply
// while charging. Requires chargeTimeMs.
// COOLDOWN: fires immediately on click, then can't fire again until cooldownMs
// elapses; movement/jump multipliers apply during that cooldown instead. Requires
// cooldownMs.
export const WEAPON_FIRE_MODE = {
    CHARGE: "charge",
    COOLDOWN: "cooldown",
};

export const WEAPONS = {
    default: {
        name: "Default",
        fireMode: WEAPON_FIRE_MODE.CHARGE,
        chargeTimeMs: 300,
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
        name: "Beam",
        fireMode: WEAPON_FIRE_MODE.CHARGE,
        chargeTimeMs: 500,
        moveSpeedMultiplier: 0.5,
        jumpMultiplier: 0.5,
        recoil: 0,
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
        name: "Blaster",
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