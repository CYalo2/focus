let zoom = 1;

export function getZoom() {
    return zoom;
}

export function setZoom(value) {
    zoom = value;
}

export function applyDisplayCamera(scene) {
    const cam = scene.cameras.main;
    cam.setOrigin(0, 0);
    cam.setZoom(zoom);
}

export function pointerToGame(pointer) {
    return { x: pointer.x / zoom, y: pointer.y / zoom };
}

export function snapToDevicePixel(value) {
    return Math.round(value * zoom) / zoom;
}
