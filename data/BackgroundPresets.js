// Each preset tiles seamlessly in both directions: a platform crossing
// x = width reappears at x = 0 (same y), and crossing y = height reappears
// at y = 0 (same x).
export const BACKGROUND_PRESETS = [
    {
        width: 1400, height: 720,
        platforms: [
            { x1: 60, y1: 410, x2: 260, y2: 440, type: 'normal' },

            { x1: 480, y1: 50, x2: 510, y2: 380, type: 'normal' },
            { x1: 510, y1: 350, x2: 710, y2: 380, type: 'oneway' },
            { x1: 710, y1: 350, x2: 740, y2: 600, type: 'normal' },

            { x1: 1240, y1: 50, x2: 1270, y2: 280, type: 'normal' },
            { x1: 1040, y1: 250, x2: 1240, y2: 280, type: 'oneway' },
            { x1: 1010, y1: 250, x2: 1040, y2: 600, type: 'normal' },
        ]
    },
    {
        width: 1600, height: 720,
        unlockAfterLevel: 2,
        platforms: [
            { x1: 810, y1: 160, x2: 840, y2: 620, type: "normal" },
            { x1: 810, y1: 620, x2: 840, y2: 720, type: "breakable" },
            { x1: 1250, y1: 160, x2: 1280, y2: 720, type: "normal" },
            { x1: 840, y1: 160, x2: 1250, y2: 190, type: "normal" },
            { x1: 840, y1: 490, x2: 1120, y2: 520, type: "normal" },

            { x1: 100, y1: 510, x2: 250, y2: 540, type: "normal" },
            { x1: 300, y1: 600, x2: 450, y2: 630, type: "normal" },
            { x1: 500, y1: 510, x2: 650, y2: 540, type: "normal" },

            { x1: 120, y1: 100, x2: 420, y2: 130, type: "bounceable" },
            { x1: 120, y1: 170, x2: 420, y2: 200, type: "bounceable" },

            { x1: 420, y1: 90, x2: 460, y2: 130, type: "enemyPassthrough" },
            { x1: 610, y1: 80, x2: 660, y2: 130, type: "redirect", direction: 180 },
        ]
    },
    {
        width: 900, height: 720,
        unlockAfterLevel: 2,
        platforms: [
            { x1: 0, y1: 500, x2: 260, y2: 530, type: 'breakable' },
            { x1: 340, y1: 420, x2: 520, y2: 450, type: 'breakable' },
            { x1: 600, y1: 560, x2: 900, y2: 590, type: 'breakable' },
        ]
    },
    {
        width: 1100, height: 720,
        unlockAfterLevel: 6,
        platforms: [
            { x1: 0, y1: 0, x2: 490, y2: 720, type: "normal" },
            { x1: 490, y1: 50, x2: 790, y2: 80, type: "oneway" },
            { x1: 490, y1: 340, x2: 790, y2: 370, type: "oneway" },
            { x1: 490, y1: 630, x2: 790, y2: 660, type: "oneway" },
            { x1: 790, y1: 0, x2: 1100, y2: 720, type: "normal" },
        ]
    },
    {
        width: 1110, height: 720,
        unlockAfterLevel: 6,
        platforms: [
            { x1: 180, y1: 230, x2: 380, y2: 260, type: "oneway" },
            { x1: 180, y1: 520, x2: 380, y2: 550, type: "oneway" },
            { x1: 730, y1: 230, x2: 930, y2: 260, type: "oneway" },
            { x1: 730, y1: 520, x2: 930, y2: 550, type: "oneway" },
        ]
    },
    {
        width: 2000, height: 720,
        unlockAfterLevel: 7,
        platforms: [
            { x1: 0, y1: 710, x2: 2000, y2: 720, type: "death" },

            { x1: 100, y1: 540, x2: 300, y2: 570, type: "normal" },

            { x1: 600, y1: 350, x2: 800, y2: 380, type: "normal" },

            { x1: 1100, y1: 430, x2: 1300, y2: 440, type: "death" },
            { x1: 1100, y1: 440, x2: 1300, y2: 470, type: "normal" },

            { x1: 1500, y1: 460, x2: 1700, y2: 490, type: "normal" },
        ]
    },
    {
        width: 1230, height: 720,
        unlockAfterLevel: 12,
        platforms: [
            { x1: 50, y1: 270, x2: 100, y2: 320, type: "redirect", direction: 0 },
            { x1: 300, y1: 270, x2: 350, y2: 320, type: "redirect", direction: 270 },
            { x1: 300, y1: 20, x2: 350, y2: 70, type: "redirect", direction: 180 },

            { x1: 450, y1: 440, x2: 480, y2: 470, type: "redirect", direction: 0 },
            { x1: 1100, y1: 440, x2: 1130, y2: 470, type: "redirect", direction: 90 },

            { x1: 310, y1: 360, x2: 450, y2: 540, type: "normal" },

            { x1: 1050, y1: 340, x2: 1100, y2: 390, type: "redirect", direction: 180 },

            { x1: 980, y1: 300, x2: 1100, y2: 340, type: "normal" },
            { x1: 1100, y1: 300, x2: 1140, y2: 440, type: "normal" },

            { x1: 1080, y1: 585, x2: 1130, y2: 635, type: "redirect", direction: 180 },
            { x1: 620, y1: 650, x2: 820, y2: 680, type: "oneway" },
        ]
    },
    {
        width: 860, height: 350,
        unlockAfterLevel: 12,
        platforms: [
            { x1: 110, y1: 0, x2: 310, y2: 350, type: "normal" },

            { x1: 0, y1: 50, x2: 110, y2: 80, type: "oneway" },
            { x1: 0, y1: 100, x2: 110, y2: 130, type: "oneway" },
            { x1: 0, y1: 150, x2: 110, y2: 180, type: "oneway" },
            { x1: 0, y1: 200, x2: 110, y2: 230, type: "oneway" },
            { x1: 0, y1: 250, x2: 110, y2: 280, type: "oneway" },
            { x1: 0, y1: 300, x2: 110, y2: 330, type: "oneway" },

            { x1: 310, y1: 50, x2: 860, y2: 80, type: "oneway" },
            { x1: 310, y1: 100, x2: 860, y2: 130, type: "oneway" },
            { x1: 310, y1: 150, x2: 860, y2: 180, type: "oneway" },
            { x1: 310, y1: 200, x2: 860, y2: 230, type: "oneway" },
            { x1: 310, y1: 250, x2: 860, y2: 280, type: "oneway" },
            { x1: 310, y1: 300, x2: 860, y2: 330, type: "oneway" },

            { x1: 0, y1: 0, x2: 110, y2: 30, type: "normal" },
            { x1: 310, y1: 0, x2: 480, y2: 30, type: "normal" },
            { x1: 480, y1: 0, x2: 800, y2: 30, type: "oneway" },
            { x1: 800, y1: 0, x2: 860, y2: 30, type: "normal" },
        ]
    },
    {
        width: 830, height: 720,
        unlockAfterLevel: 12,
        platforms: [
            { x1: 0, y1: 0, x2: 830, y2: 30, type: "bounceable" },
            { x1: 210, y1: 30, x2: 240, y2: 130, type: "bounceable" },
            { x1: 210, y1: 590, x2: 240, y2: 690, type: "bounceable" },
            { x1: 0, y1: 690, x2: 830, y2: 720, type: "bounceable" },

            { x1: 540, y1: 360, x2: 740, y2: 390, type: "oneway" },
        ]
    },
    {
        width: 1100, height: 720,
        unlockAfterLevel: 12,
        platforms: [
            { x1: 310, y1: 30, x2: 970, y2: 60, type: "breakable" },
            { x1: 310, y1: 300, x2: 970, y2: 330, type: "breakable" },
            { x1: 310, y1: 390, x2: 970, y2: 420, type: "breakable" },
            { x1: 310, y1: 660, x2: 970, y2: 690, type: "breakable" },

            { x1: 310, y1: 60, x2: 340, y2: 300, type: "breakable" },
            { x1: 580, y1: 60, x2: 610, y2: 300, type: "breakable" },
            { x1: 670, y1: 60, x2: 700, y2: 300, type: "breakable" },
            { x1: 940, y1: 60, x2: 970, y2: 300, type: "breakable" },
            { x1: 310, y1: 330, x2: 340, y2: 390, type: "breakable" },
            { x1: 580, y1: 330, x2: 610, y2: 390, type: "breakable" },
            { x1: 670, y1: 330, x2: 700, y2: 390, type: "breakable" },
            { x1: 940, y1: 330, x2: 970, y2: 390, type: "breakable" },
            { x1: 310, y1: 420, x2: 340, y2: 660, type: "breakable" },
            { x1: 580, y1: 420, x2: 610, y2: 660, type: "breakable" },
            { x1: 670, y1: 420, x2: 700, y2: 660, type: "breakable" },
            { x1: 940, y1: 420, x2: 970, y2: 660, type: "breakable" },

            { x1: 0, y1: 105, x2: 310, y2: 135, type: "breakable" },
            { x1: 0, y1: 585, x2: 310, y2: 615, type: "breakable" },
            { x1: 970, y1: 105, x2: 1100, y2: 135, type: "breakable" },
            { x1: 970, y1: 585, x2: 1100, y2: 615, type: "breakable" },

            { x1: 385, y1: 0, x2: 415, y2: 30, type: "breakable" },
            { x1: 385, y1: 690, x2: 415, y2: 720, type: "breakable" },
            { x1: 865, y1: 0, x2: 895, y2: 30, type: "breakable" },
            { x1: 865, y1: 690, x2: 895, y2: 720, type: "breakable" },

            { x1: 460, y1: 210, x2: 490, y2: 300, type: "breakable" },
            { x1: 460, y1: 60, x2: 490, y2: 180, type: "breakable" },
            { x1: 340, y1: 180, x2: 580, y2: 210, type: "breakable" },

            { x1: 790, y1: 210, x2: 820, y2: 300, type: "breakable" },
            { x1: 790, y1: 60, x2: 820, y2: 180, type: "breakable" },
            { x1: 700, y1: 180, x2: 940, y2: 210, type: "breakable" },

            { x1: 460, y1: 420, x2: 490, y2: 510, type: "breakable" },
            { x1: 460, y1: 540, x2: 490, y2: 660, type: "breakable" },
            { x1: 340, y1: 510, x2: 580, y2: 540, type: "breakable" },

            { x1: 790, y1: 420, x2: 820, y2: 510, type: "breakable" },
            { x1: 790, y1: 540, x2: 820, y2: 660, type: "breakable" },
            { x1: 700, y1: 510, x2: 940, y2: 540, type: "breakable" },
        ]
    },
    {
        width: 1280, height: 720,
        unlockAfterLevel: 13,
        platforms: [
            { x1: 95, y1: 710, x2: 1185, y2: 720, type: "death" },

            { x1: 565, y1: 660, x2: 715, y2: 690, type: "normal" },

            { x1: 95, y1: 595, x2: 295, y2: 625, type: "breakable" },
            { x1: 985, y1: 595, x2: 1185, y2: 625, type: "breakable" },

            { x1: 565, y1: 80, x2: 715, y2: 430, type: "normal" },
            { x1: 365, y1: 430, x2: 915, y2: 460, type: "normal" },

            { x1: 95, y1: 120, x2: 565, y2: 150, type: "breakable" },
            { x1: 715, y1: 120, x2: 1185, y2: 150, type: "breakable" },

            { x1: 0, y1: 120, x2: 95, y2: 720, type: "normal" },
            { x1: 1185, y1: 120, x2: 1280, y2: 720, type: "normal" },
        ]
    },
    {
        width: 1100, height: 720,
        unlockAfterLevel: 14,
        platforms: [
            { x1: 440, y1: 0, x2: 490, y2: 50, type: "redirect", direction: 70 },
            { x1: 790, y1: 0, x2: 840, y2: 50, type: "redirect", direction: 110 },
            { x1: 500, y1: 0, x2: 550, y2: 50, type: "redirect", direction: 30 },
            { x1: 730, y1: 0, x2: 780, y2: 50, type: "redirect", direction: 150 },

            { x1: 440, y1: 365, x2: 490, y2: 415, type: "redirect", direction: 270 },
            { x1: 790, y1: 365, x2: 840, y2: 415, type: "redirect", direction: 270 },

            { x1: 440, y1: 600, x2: 490, y2: 650, type: "redirect", direction: 230 },
            { x1: 790, y1: 600, x2: 840, y2: 650, type: "redirect", direction: 310 },

            { x1: 410, y1: 190, x2: 440, y2: 220, type: "redirect", direction: 20 },
            { x1: 840, y1: 190, x2: 870, y2: 220, type: "redirect", direction: 160 },

            { x1: 200, y1: 50, x2: 250, y2: 100, type: "redirect", direction: 50 },
            { x1: 1030, y1: 50, x2: 1080, y2: 100, type: "redirect", direction: 130 },

            { x1: 540, y1: 485, x2: 640, y2: 500, type: "redirect", direction: 194.3 },
            { x1: 640, y1: 485, x2: 740, y2: 500, type: "redirect", direction: 345.7 },

            { x1: 620, y1: 280, x2: 640, y2: 300, type: "redirect", direction: 190 },
            { x1: 640, y1: 280, x2: 660, y2: 300, type: "redirect", direction: 350 },
        ]
    },
];