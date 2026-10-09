export function installPixelTextDefaults() {
    const proto = Phaser.GameObjects.GameObjectFactory.prototype;
    if (proto.__pixelTextPatched) return;
    const addText = proto.text;
    proto.text = function (x, y, text, style) {
        return addText.call(this, x, y, text, { fontFamily: "'Silkscreen', 'Courier New', monospace", ...style });
    };
    proto.__pixelTextPatched = true;
}

export async function loadPixelFonts() {
    if (!document.fonts || !document.fonts.load) return;
    try {
        await document.fonts.load("16px Silkscreen");
    } catch (err) {
        console.warn("Pixel font failed to load:", err);
    }
    if (!document.fonts.check("16px Silkscreen")) {
        console.error("Silkscreen font is not available; text will use the fallback font.");
    }
}