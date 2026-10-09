export const HINT_RECORDING_ENABLED = false; // dev-only: records input, P copies last run to clipboard

const BIT_LEFT = 1;
const BIT_RIGHT = 2;
const BIT_UP = 4;
const BIT_DOWN = 8;
const BIT_FIRE = 16;
const BIT_DASH = 32;

function packInputBitmask({ left, right, up, down, fire, dash }) {
  return (
    (left ? BIT_LEFT : 0) |
    (right ? BIT_RIGHT : 0) |
    (up ? BIT_UP : 0) |
    (down ? BIT_DOWN : 0) |
    (fire ? BIT_FIRE : 0) |
    (dash ? BIT_DASH : 0)
  );
}

function unpackInputBitmask(bitmask) {
  return {
    left: (bitmask & BIT_LEFT) !== 0,
    right: (bitmask & BIT_RIGHT) !== 0,
    up: (bitmask & BIT_UP) !== 0,
    down: (bitmask & BIT_DOWN) !== 0,
    fire: (bitmask & BIT_FIRE) !== 0,
    dash: (bitmask & BIT_DASH) !== 0,
  };
}

function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function angleDeltaDeg(a, b) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

function lerpAngleDeg(a, b, t) {
  return a + angleDeltaDeg(a, b) * t;
}

export function toB36(n) {
  return n.toString(36);
}

export function fromB36(s) {
  return parseInt(s, 36);
}

function encodeFrames(frames) {
  return frames.map((f) => f.map(toB36).join(",")).join("|");
}

function decodeFrames(str) {
  if (str === "") return [];
  return str.split("|").map((part) => part.split(",").map(fromB36));
}

function simplifyFrames(frames) {
  const result = [];
  let i = 0;
  while (i < frames.length) {
    if (frames[i].length === 3) {
      result.push(frames[i]);
      i++;
      continue;
    }
    let j = i + 1;
    while (j < frames.length && frames[j].length === 2 && frames[j][1] === frames[i][1]) j++;
    let totalDt = 0;
    for (let k = i; k < j; k++) totalDt += frames[k][0];
    result.push([totalDt, frames[i][1]]);
    i = j;
  }
  return result;
}

export class HintRecorder {
  constructor() {
    this.seed = Date.now();
    this.frames = [];

    this.closed = false;
  }

  recordFrame(scaledDelta, inputs, angle, angleIsSignificant) {
    if (this.closed) return;
    const bitmask = packInputBitmask(inputs);
    const dt = Math.round(scaledDelta);
    this.frames.push(angleIsSignificant ? [dt, bitmask, Math.round(radToDeg(angle))] : [dt, bitmask]);
  }

  recordClosingFrameOnce(scaledDelta) {
    if (this.closed) return;
    this.closed = true;
    this.frames.push([Math.round(scaledDelta), 0]);
  }

  copyToClipboard() {
    const simplified = simplifyFrames(this.frames);
    const payload = JSON.stringify({ seed: toB36(this.seed), frames: encodeFrames(simplified) });
    return navigator.clipboard.writeText(payload).then(() => ({
      recordedCount: this.frames.length,
      simplifiedCount: simplified.length,
    }));
  }
}

function fireEventFor(f) {
  if (f.length !== 3) return null;
  const isDash = (f[1] & BIT_DASH) !== 0;
  return { fire: !isDash, dash: isDash, angle: degToRad(f[2]) };
}

export class HintPlayback {
  constructor(frames) {
    this.frames = decodeFrames(frames);
    this.cumulativeMs = new Array(this.frames.length);
    let acc = 0;
    for (let i = 0; i < this.frames.length; i++) {
      this.cumulativeMs[i] = acc;
      acc += this.frames[i][0];
    }
    this.totalMs = acc;
    this.frameIdx = 0;
    this.elapsedInFrame = 0;
    this.clock = 0;

    this.pendingFireEvent = this.frames.length > 0 ? fireEventFor(this.frames[0]) : null;

    this.angleKeyframes = [];
    for (let i = 0; i < this.frames.length; i++) {
      if (this.frames[i].length === 3) {
        this.angleKeyframes.push({ ms: this.cumulativeMs[i], angleDeg: this.frames[i][2] });
      }
    }
    this.angleKeyIdx = 0;
  }

  get done() {
    return this.frameIdx >= this.frames.length;
  }

  remainingInCurrentFrame() {
    if (this.done) return 0;
    return this.frames[this.frameIdx][0] - this.elapsedInFrame;
  }

  takePendingFireEvent() {
    const evt = this.pendingFireEvent;
    this.pendingFireEvent = null;
    return evt;
  }

  currentInputState() {
    const f = this.frames[this.frameIdx];
    return { ...unpackInputBitmask(f[1]), angle: degToRad(this.currentAngleDeg()) };
  }

  advance(dt) {
    this.clock += dt;
    this.elapsedInFrame += dt;
    if (this.elapsedInFrame >= this.frames[this.frameIdx][0]) {
      this.frameIdx++;
      this.elapsedInFrame = 0;
      if (!this.done) {
        this.pendingFireEvent = fireEventFor(this.frames[this.frameIdx]);
      }
    }
  }

  currentAngleDeg() {
    const keyframes = this.angleKeyframes;
    if (keyframes.length === 0) return 0;
    while (this.angleKeyIdx < keyframes.length - 1 && keyframes[this.angleKeyIdx + 1].ms <= this.clock) {
      this.angleKeyIdx++;
    }
    const cur = keyframes[this.angleKeyIdx];
    const next = keyframes[this.angleKeyIdx + 1];
    if (!next) return cur.angleDeg;
    const span = next.ms - cur.ms;
    const t = span > 0 ? Math.max(0, Math.min(1, (this.clock - cur.ms) / span)) : 1;
    return lerpAngleDeg(cur.angleDeg, next.angleDeg, t);
  }
}