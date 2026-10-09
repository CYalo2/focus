export function crispStroke(rect) {
    const s = rect.lineWidth;
    if (!s) return rect;

    const outerW = Math.ceil(rect.width) + s;
    const outerH = Math.ceil(rect.height) + s;
    const left = Math.round(rect.x - outerW * rect.originX);
    const top = Math.round(rect.y - outerH * rect.originY);

    rect.setSize(outerW - s, outerH - s);
    rect.setPosition(left + s / 2 + (outerW - s) * rect.originX, top + s / 2 + (outerH - s) * rect.originY);
    return rect;
}