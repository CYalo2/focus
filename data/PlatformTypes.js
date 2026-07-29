import { ENEMY_BASE_TINT } from "./Constants.js";

export const PLATFORM_TYPES = {
    normal: {},

    oneway: {},

    breakable: {
        health: 3,
    },

    bounceable: {},

    enemyPassthrough: {},

    bulletPassthrough: {},

    death: {},

    redirect: {},
};

export const PLATFORM_TINTS = {
    bounceable: 0x008400,
    death: 0xcd2121,
    redirect: 0x640280,
};