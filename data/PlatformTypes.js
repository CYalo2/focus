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
    normal: 0xffffff,
    oneway: 0x5da0ff,
    breakable: 0xff8a3a,
    bounceable: 0x4ade80,
    enemyPassthrough: 0xc74b4a,
    bulletPassthrough: 0xffe066,
    death: 0x000000,
    redirect: 0xb266ff,
};