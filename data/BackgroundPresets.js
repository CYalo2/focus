export const BACKGROUND_PRESETS = [
    {
        width: 700, height: 360,
        platforms: [
            { x1: 30, y1: 205, x2: 130, y2: 220, type: 'normal' },

            { x1: 240, y1: 25, x2: 255, y2: 190, type: 'normal' },
            { x1: 255, y1: 175, x2: 355, y2: 190, type: 'oneway' },
            { x1: 355, y1: 175, x2: 370, y2: 300, type: 'normal' },

            { x1: 620, y1: 25, x2: 635, y2: 140, type: 'normal' },
            { x1: 520, y1: 125, x2: 620, y2: 140, type: 'oneway' },
            { x1: 505, y1: 125, x2: 520, y2: 300, type: 'normal' },
        ]
    },
    {
        width: 800, height: 360,
        unlockAfterLevel: 2,
        platforms: [
            { x1: 405, y1: 80, x2: 420, y2: 310, type: "normal" },
            { x1: 405, y1: 310, x2: 420, y2: 360, type: "breakable" },
            { x1: 625, y1: 80, x2: 640, y2: 360, type: "normal" },
            { x1: 420, y1: 80, x2: 625, y2: 95, type: "normal" },
            { x1: 420, y1: 245, x2: 560, y2: 260, type: "normal" },

            { x1: 50, y1: 255, x2: 125, y2: 270, type: "normal" },
            { x1: 150, y1: 300, x2: 225, y2: 315, type: "normal" },
            { x1: 250, y1: 255, x2: 325, y2: 270, type: "normal" },

            { x1: 60, y1: 50, x2: 210, y2: 65, type: "bounceable" },
            { x1: 60, y1: 85, x2: 210, y2: 100, type: "bounceable" },

            { x1: 210, y1: 45, x2: 230, y2: 65, type: "enemyPassthrough" },
            { x1: 305, y1: 40, x2: 330, y2: 65, type: "redirect", direction: 180 },
        ]
    },
    {
        width: 450, height: 360,
        unlockAfterLevel: 2,
        platforms: [
            { x1: 0, y1: 250, x2: 130, y2: 265, type: 'breakable' },
            { x1: 170, y1: 210, x2: 260, y2: 225, type: 'breakable' },
            { x1: 300, y1: 280, x2: 450, y2: 295, type: 'breakable' },
        ]
    },
    {
        width: 550, height: 360,
        unlockAfterLevel: 6,
        platforms: [
            { x1: 0, y1: 0, x2: 245, y2: 360, type: "normal" },
            { x1: 245, y1: 25, x2: 395, y2: 40, type: "oneway" },
            { x1: 245, y1: 170, x2: 395, y2: 185, type: "oneway" },
            { x1: 245, y1: 315, x2: 395, y2: 330, type: "oneway" },
            { x1: 395, y1: 0, x2: 550, y2: 360, type: "normal" },
        ]
    },
    {
        width: 555, height: 360,
        unlockAfterLevel: 6,
        platforms: [
            { x1: 133, y1: 115, x2: 233, y2: 130, type: "oneway" },
            { x1: 133, y1: 260, x2: 233, y2: 275, type: "oneway" },
            { x1: 408, y1: 115, x2: 508, y2: 130, type: "oneway" },
            { x1: 408, y1: 260, x2: 508, y2: 275, type: "oneway" },
        ]
    },
    {
        width: 1000, height: 360,
        unlockAfterLevel: 7,
        platforms: [
            { x1: 0, y1: 355, x2: 1000, y2: 360, type: "death" },

            { x1: 50, y1: 270, x2: 150, y2: 285, type: "normal" },

            { x1: 300, y1: 175, x2: 400, y2: 190, type: "normal" },

            { x1: 550, y1: 215, x2: 650, y2: 220, type: "death" },
            { x1: 550, y1: 220, x2: 650, y2: 235, type: "normal" },

            { x1: 750, y1: 230, x2: 850, y2: 245, type: "normal" },
        ]
    },
    {
        width: 615, height: 360,
        unlockAfterLevel: 12,
        platforms: [
            { x1: 25, y1: 135, x2: 50, y2: 160, type: "redirect", direction: 0 },
            { x1: 150, y1: 135, x2: 175, y2: 160, type: "redirect", direction: 270 },
            { x1: 150, y1: 10, x2: 175, y2: 35, type: "redirect", direction: 180 },

            { x1: 225, y1: 220, x2: 240, y2: 235, type: "redirect", direction: 0 },
            { x1: 550, y1: 220, x2: 565, y2: 235, type: "redirect", direction: 90 },

            { x1: 155, y1: 180, x2: 225, y2: 270, type: "normal" },

            { x1: 525, y1: 170, x2: 550, y2: 195, type: "redirect", direction: 180 },

            { x1: 490, y1: 150, x2: 550, y2: 170, type: "normal" },
            { x1: 550, y1: 150, x2: 570, y2: 220, type: "normal" },

            { x1: 540, y1: 293, x2: 565, y2: 318, type: "redirect", direction: 180 },
            { x1: 310, y1: 325, x2: 410, y2: 340, type: "oneway" },
        ]
    },
    {
        width: 430, height: 175,
        unlockAfterLevel: 12,
        platforms: [
            { x1: 55, y1: 0, x2: 155, y2: 175, type: "normal" },

            { x1: 0, y1: 25, x2: 55, y2: 40, type: "oneway" },
            { x1: 0, y1: 50, x2: 55, y2: 65, type: "oneway" },
            { x1: 0, y1: 75, x2: 55, y2: 90, type: "oneway" },
            { x1: 0, y1: 100, x2: 55, y2: 115, type: "oneway" },
            { x1: 0, y1: 125, x2: 55, y2: 140, type: "oneway" },
            { x1: 0, y1: 150, x2: 55, y2: 165, type: "oneway" },

            { x1: 155, y1: 25, x2: 430, y2: 40, type: "oneway" },
            { x1: 155, y1: 50, x2: 430, y2: 65, type: "oneway" },
            { x1: 155, y1: 75, x2: 430, y2: 90, type: "oneway" },
            { x1: 155, y1: 100, x2: 430, y2: 115, type: "oneway" },
            { x1: 155, y1: 125, x2: 430, y2: 140, type: "oneway" },
            { x1: 155, y1: 150, x2: 430, y2: 165, type: "oneway" },

            { x1: 0, y1: 0, x2: 55, y2: 15, type: "normal" },
            { x1: 155, y1: 0, x2: 240, y2: 15, type: "normal" },
            { x1: 240, y1: 0, x2: 400, y2: 15, type: "oneway" },
            { x1: 400, y1: 0, x2: 430, y2: 15, type: "normal" },
        ]
    },
    {
        width: 415, height: 360,
        unlockAfterLevel: 12,
        platforms: [
            { x1: 0, y1: 0, x2: 415, y2: 15, type: "bounceable" },
            { x1: 105, y1: 15, x2: 120, y2: 65, type: "bounceable" },
            { x1: 105, y1: 295, x2: 120, y2: 345, type: "bounceable" },
            { x1: 0, y1: 345, x2: 415, y2: 360, type: "bounceable" },

            { x1: 270, y1: 180, x2: 370, y2: 195, type: "oneway" },
        ]
    },
    {
        width: 550, height: 360,
        unlockAfterLevel: 12,
        platforms: [
            { x1: 155, y1: 15, x2: 485, y2: 30, type: "breakable" },
            { x1: 155, y1: 150, x2: 485, y2: 165, type: "breakable" },
            { x1: 155, y1: 195, x2: 485, y2: 210, type: "breakable" },
            { x1: 155, y1: 330, x2: 485, y2: 345, type: "breakable" },

            { x1: 155, y1: 30, x2: 170, y2: 150, type: "breakable" },
            { x1: 290, y1: 30, x2: 305, y2: 150, type: "breakable" },
            { x1: 335, y1: 30, x2: 350, y2: 150, type: "breakable" },
            { x1: 470, y1: 30, x2: 485, y2: 150, type: "breakable" },
            { x1: 155, y1: 165, x2: 170, y2: 195, type: "breakable" },
            { x1: 290, y1: 165, x2: 305, y2: 195, type: "breakable" },
            { x1: 335, y1: 165, x2: 350, y2: 195, type: "breakable" },
            { x1: 470, y1: 165, x2: 485, y2: 195, type: "breakable" },
            { x1: 155, y1: 210, x2: 170, y2: 330, type: "breakable" },
            { x1: 290, y1: 210, x2: 305, y2: 330, type: "breakable" },
            { x1: 335, y1: 210, x2: 350, y2: 330, type: "breakable" },
            { x1: 470, y1: 210, x2: 485, y2: 330, type: "breakable" },

            { x1: 0, y1: 53, x2: 155, y2: 68, type: "breakable" },
            { x1: 0, y1: 293, x2: 155, y2: 308, type: "breakable" },
            { x1: 485, y1: 53, x2: 550, y2: 68, type: "breakable" },
            { x1: 485, y1: 293, x2: 550, y2: 308, type: "breakable" },

            { x1: 193, y1: 0, x2: 208, y2: 15, type: "breakable" },
            { x1: 193, y1: 345, x2: 208, y2: 360, type: "breakable" },
            { x1: 433, y1: 0, x2: 448, y2: 15, type: "breakable" },
            { x1: 433, y1: 345, x2: 448, y2: 360, type: "breakable" },

            { x1: 230, y1: 105, x2: 245, y2: 150, type: "breakable" },
            { x1: 230, y1: 30, x2: 245, y2: 90, type: "breakable" },
            { x1: 170, y1: 90, x2: 290, y2: 105, type: "breakable" },

            { x1: 395, y1: 105, x2: 410, y2: 150, type: "breakable" },
            { x1: 395, y1: 30, x2: 410, y2: 90, type: "breakable" },
            { x1: 350, y1: 90, x2: 470, y2: 105, type: "breakable" },

            { x1: 230, y1: 210, x2: 245, y2: 255, type: "breakable" },
            { x1: 230, y1: 270, x2: 245, y2: 330, type: "breakable" },
            { x1: 170, y1: 255, x2: 290, y2: 270, type: "breakable" },

            { x1: 395, y1: 210, x2: 410, y2: 255, type: "breakable" },
            { x1: 395, y1: 270, x2: 410, y2: 330, type: "breakable" },
            { x1: 350, y1: 255, x2: 470, y2: 270, type: "breakable" },
        ]
    },
    {
        width: 640, height: 360,
        unlockAfterLevel: 13,
        platforms: [
            { x1: 48, y1: 355, x2: 593, y2: 360, type: "death" },

            { x1: 283, y1: 330, x2: 358, y2: 345, type: "normal" },

            { x1: 48, y1: 298, x2: 148, y2: 313, type: "breakable" },
            { x1: 493, y1: 298, x2: 593, y2: 313, type: "breakable" },

            { x1: 283, y1: 40, x2: 358, y2: 215, type: "normal" },
            { x1: 183, y1: 215, x2: 458, y2: 230, type: "normal" },

            { x1: 48, y1: 60, x2: 283, y2: 75, type: "breakable" },
            { x1: 358, y1: 60, x2: 593, y2: 75, type: "breakable" },

            { x1: 0, y1: 60, x2: 48, y2: 360, type: "normal" },
            { x1: 593, y1: 60, x2: 640, y2: 360, type: "normal" },
        ]
    },
    {
        width: 550, height: 360,
        unlockAfterLevel: 14,
        platforms: [
            { x1: 220, y1: 0, x2: 245, y2: 25, type: "redirect", direction: 70 },
            { x1: 395, y1: 0, x2: 420, y2: 25, type: "redirect", direction: 110 },
            { x1: 250, y1: 0, x2: 275, y2: 25, type: "redirect", direction: 30 },
            { x1: 365, y1: 0, x2: 390, y2: 25, type: "redirect", direction: 150 },

            { x1: 220, y1: 183, x2: 245, y2: 208, type: "redirect", direction: 270 },
            { x1: 395, y1: 183, x2: 420, y2: 208, type: "redirect", direction: 270 },

            { x1: 220, y1: 300, x2: 245, y2: 325, type: "redirect", direction: 230 },
            { x1: 395, y1: 300, x2: 420, y2: 325, type: "redirect", direction: 310 },

            { x1: 205, y1: 95, x2: 220, y2: 110, type: "redirect", direction: 20 },
            { x1: 420, y1: 95, x2: 435, y2: 110, type: "redirect", direction: 160 },

            { x1: 100, y1: 25, x2: 125, y2: 50, type: "redirect", direction: 50 },
            { x1: 515, y1: 25, x2: 540, y2: 50, type: "redirect", direction: 130 },

            { x1: 270, y1: 243, x2: 320, y2: 250, type: "redirect", direction: 194.3 },
            { x1: 320, y1: 243, x2: 370, y2: 250, type: "redirect", direction: 345.7 },

            { x1: 310, y1: 140, x2: 320, y2: 150, type: "redirect", direction: 190 },
            { x1: 320, y1: 140, x2: 330, y2: 150, type: "redirect", direction: 350 },
        ]
    },
];