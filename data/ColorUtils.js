// Blends a hex color toward white by `amount` (0 = original color unchanged, 1 = pure
// white). Useful for hit-flash effects that should read as "brighter" rather than a
// flat white wipe -- setTint can only ever darken a color (it's multiplicative, so the
// result is always <= the original per channel), and setTintFill(0xffffff) replaces the
// color entirely, losing the original hue. Blending first keeps the hue recognizable.
export function lightenColor(hex, amount) {
    const r = (hex >> 16) & 0xff;
    const g = (hex >> 8) & 0xff;
    const b = hex & 0xff;

    const lr = Math.round(r + (255 - r) * amount);
    const lg = Math.round(g + (255 - g) * amount);
    const lb = Math.round(b + (255 - b) * amount);

    return (lr << 16) | (lg << 8) | lb;
}