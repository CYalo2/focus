import { WEAPON_MAX_INACCURACY_RAD } from "./Constants.js";

export const WEAPON_FIRE_MODE = {
    CHARGE: "charge",
    COOLDOWN: "cooldown",
};

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
        projectileSpeed: 450,
        recoil: 150,
        damage: 1,
    },

    beam: {
        fireMode: WEAPON_FIRE_MODE.CHARGE,
        chargeTimeMs: 500,
        moveSpeedMultiplier: 0.8,
        jumpMultiplier: 0.8,
        recoil: 150,
        damage: 1,
        isBeam: true,
        beamWidth: 3,
        beamRange: 750,
    },

    blaster: {
        fireMode: WEAPON_FIRE_MODE.COOLDOWN,
        cooldownMs: 700,
        moveSpeedMultiplier: 0.4,
        jumpMultiplier: 0.25,
        projectileSpeed: 300,
        recoil: 250,
        damage: 1,
        explodesOnHit: true,
        explosionRadius: 40,
    },
};