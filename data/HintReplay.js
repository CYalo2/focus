// --- hint replay system ---
// Records the player's input during a real playthrough (dev-only, gated by
// HINT_RECORDING_ENABLED) so it can be pasted into a level's hintReplay field and
// replayed later as an in-level preview. This module owns the frame data itself --
// encoding, base36/string packing, RDP compression, and the recorded/replayed
// timeline -- not anything Phaser-specific; GameScene still does the actual driving
// (real Player.update()/Enemy.update() calls, real bullet groups, real HUD) using
// whatever HintRecorder/HintPlayback hand it each tick. See GameScene.create()/
// update()/updateHintPlayback() for how the two sides connect.

export const HINT_RECORDING_ENABLED = true; // dev-only: records input, P copies last run to clipboard

// --- frame encoding ---
// Frames are stored as compact arrays instead of objects -- no repeated key names in
// the recorded data, and the six boolean inputs pack into one number. Two shapes:
//   [scaledDt, bitmask]            -- most frames: no aim info at all
//   [scaledDt, bitmask, angleDeg]  -- only the frame fire or dash is newly pressed
//
// Angle, not position: every place Player.js reads the pointer (fireWeapon,
// startDash, updateWeaponDisplay) only ever calls
// Phaser.Math.Angle.Between(this.x, this.y, pointer.worldX, pointer.worldY) --
// nothing in the game reacts to the pointer's actual distance from the player, only
// the direction. So aim is stored as a single angle (not an x/y point), and only on
// the frame it actually mattered -- the frame a shot genuinely fired or a dash
// genuinely triggered, not every frame the button happens to still be held.
//
// Which frame that is can't be worked out from the input bitmask alone: a
// CHARGE-mode weapon fires on RELEASE, while a COOLDOWN-mode weapon (and dashing)
// fires on PRESS -- or on any later frame the button is still held, the instant its
// cooldown clears, with no fresh press needed. So GameScene reports this directly
// from Player.js's own firedThisFrame/dashedThisFrame flags (see recordFrame()
// below) rather than this module trying to infer it from raw button transitions.
// One consequence: a single held-down run of frames can contain several of these
// real events (e.g. an auto-repeating COOLDOWN weapon firing again every time its
// cooldown clears), each with its own angle -- see simplifyFrames() below for how
// that's handled. Playback derives a continuous "visible" facing angle for every
// frame in between by interpolating between the surrounding stored angles (see
// HintPlayback below) rather than needing every single frame to carry one.
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

// Shortest signed difference from angle a to angle b, both in degrees, wrapped to
// (-180, 180] -- e.g. angleDeltaDeg(170, -170) is 20, not -340, so interpolation
// below always takes the short way around rather than the long way through the wrap
// point.
function angleDeltaDeg(a, b) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

function lerpAngleDeg(a, b, t) {
  return a + angleDeltaDeg(a, b) * t;
}

// --- base36 number packing ---
// Every field in a frame (dt, bitmask, angleDeg) is a small integer -- base36
// instead of decimal shaves a digit off most of them (a typical two-digit dt like 16
// or 33 becomes a single base36 char) purely to keep the pasted-in string shorter;
// it has no effect on precision, since these are still the same rounded-to-the-
// integer values as before. Negative angles round-trip fine -- both
// Number.prototype.toString and parseInt handle the sign outside the digit
// conversion (e.g. (-5).toString(36) === "-5").
export function toB36(n) {
  return n.toString(36);
}

export function fromB36(s) {
  return parseInt(s, 36);
}

// --- frame (de)serialization ---
// Packs the simplified frame list into a single delimited string instead of nested
// JSON arrays -- "," between a frame's own fields, "|" between frames -- which drops
// the '[', ']', and inter-element ',' that JSON.stringify would otherwise spend on
// every single frame. Combined with base36 above, this is what actually goes into
// the level file's hintReplay.frames field; HintPlayback decodes it straight back
// into [dt, bitmask] / [dt, bitmask, angleDeg] tuples (see its constructor below) --
// nothing outside this module needs to know the on-disk shape.
function encodeFrames(frames) {
  return frames.map((f) => f.map(toB36).join(",")).join("|");
}

function decodeFrames(str) {
  if (str === "") return [];
  return str.split("|").map((part) => part.split(",").map(fromB36));
}

// --- run simplification ---
// Run once, when a recording is copied out (HintRecorder.copyToClipboard()), not
// during live recording -- frames are pushed every tick as-is; this is what actually
// thins them out.
//
// A significant (angle-carrying, 3-element) frame is a real fire/dash event and is
// always kept exactly as recorded, at its exact original position -- collapsing it
// into a neighbor would shift *when* that angle applies during playback, which
// would show the wrong aim at the moment a shot actually fires. What CAN still be
// thinned are the non-significant (2-element) frames in between: consecutive ones
// sharing the same bitmask carry no information beyond "still holding this input
// combo", so any such run collapses to one frame with the run's total duration
// (dt summed, so overall timing -- and every significant frame's position relative
// to it -- is unaffected) and its shared bitmask.
function simplifyFrames(frames) {
  const result = [];
  let i = 0;
  while (i < frames.length) {
    if (frames[i].length === 3) {
      result.push(frames[i]); // significant -- keep as-is, don't merge
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

// --- recording ---
// Owns one run's worth of recorded frames plus the RNG seed it was recorded with (see
// GameScene.create()'s this.rng -- pasting a recording's seed alongside its frames
// makes replayed enemy shot spread match the original run exactly). Call
// recordFrame() once per real update() tick, and recordClosingFrameOnce() once, on
// the tick the level actually ends -- see the comment at that call site in
// GameScene.update() for why the closing frame needs special handling.
export class HintRecorder {
  constructor() {
    this.seed = Date.now(); // paste this (base36-encoded, see copyToClipboard()) as hintReplay.seed
    this.frames = [];
    // Latches true the instant the closing frame is recorded, so that frame is only
    // ever pushed once rather than on every subsequent tick the level stays ended.
    this.closed = false;
  }

  // inputs: {left, right, up, down, fire, dash} booleans for this tick.
  // angleIsSignificant: whether a shot genuinely fired or a dash genuinely
  // triggered THIS tick -- pass this.player.firedThisFrame || this.player.dashedThisFrame
  // from GameScene, read *after* calling player.update() (that's what actually
  // decides it; see those flags' doc comment in Player.js's constructor for why it
  // can't be worked out from raw input here). angle: the matching
  // this.player.firedAngle / this.player.dashedAngle, in radians -- ignored unless
  // angleIsSignificant is true, so it's harmless to pass whatever's convenient
  // otherwise.
  recordFrame(scaledDelta, inputs, angle, angleIsSignificant) {
    if (this.closed) return;
    const bitmask = packInputBitmask(inputs);
    const dt = Math.round(scaledDelta);
    // Rounded to whole ms/degrees -- hint playback doesn't need sub-frame timing or
    // sub-degree aim precision, and rounding also keeps the encoded numbers shorter.
    this.frames.push(angleIsSignificant ? [dt, bitmask, Math.round(radToDeg(angle))] : [dt, bitmask]);
  }

  // No inputs held on the closing frame, since nothing meaningful drives the player
  // after the game is over -- so, like any other frame that isn't a genuine fire/dash
  // event, no angle is stored on it either; playback just carries forward whatever
  // angle it last had. Safe to call every tick after the level ends -- only the
  // first call actually records.
  recordClosingFrameOnce(scaledDelta) {
    if (this.closed) return;
    this.closed = true;
    this.frames.push([Math.round(scaledDelta), 0]);
  }

  // Simplifies the recording and copies it to the clipboard as JSON, ready to paste
  // into a level's hintReplay field. frames is the packed "dt,bitmask[,angle]|..."
  // string (see encodeFrames above), not a nested array -- HintPlayback unpacks it
  // again on the other end. Resolves with the before/after frame counts so the
  // caller can log them.
  copyToClipboard() {
    const simplified = simplifyFrames(this.frames);
    const payload = JSON.stringify({ seed: toB36(this.seed), frames: encodeFrames(simplified) });
    return navigator.clipboard.writeText(payload).then(() => ({
      recordedCount: this.frames.length,
      simplifiedCount: simplified.length,
    }));
  }
}

// --- playback ---
// Steps through a previously-recorded frame list against accumulated *scaled*
// game-time. That specifically means: if the original recording held bullet time
// (SHIFT) for a stretch, that stretch's dt (real ms) is large relative to its scaledDt
// (slowed-down game-time ms). Pacing playback off scaledDt rather than dt means one
// real playback ms always consumes one scaledDt-ms of the recording -- compressing
// whatever was slow-motion in the original down to normal speed, so a hint doesn't
// visibly slow itself down. GameScene.updateHintPlayback() layers the *viewer's own*
// live SHIFT input on top of that via the normal bulletTime toggle, which is a
// separate thing entirely from whatever bullet time the recording itself used.
//
// Since only some frames carry an angle, the "visible" aim angle isn't read straight
// off the currently-active input frame -- it's tracked on a separate, sparser
// timeline (this.angleKeyframes, built once in the constructor) of just the moments
// an angle was actually recorded, and interpolated between the two keyframes
// surrounding the current clock position. That's decoupled entirely from
// this.frameIdx (which tracks discrete input state instead), so a long held-fire
// stretch still shows a steady facing angle (turning only at the next press) rather
// than nothing at all.
//
// currentInputState()/advance()/takePendingFireEvent() are what callers need --
// see GameScene.updateHintPlayback() for how they're driven together each tick:
// clip the tick's real delta to remainingInCurrentFrame(), step the player with
// that clipped amount, advance() by it, and repeat until the tick's delta is used
// up -- so a physics step is always sized off live, natural tick timing (smooth
// regardless of how big or small the underlying recorded frame chunks are) while
// never crossing a frame boundary a fire/dash event needs to land exactly on.

// A significant frame is ALWAYS one or the other (that's what made it significant
// when recorded -- see HintRecorder.recordFrame()'s caller in GameScene), so
// dash-ness is decided from BIT_DASH and fire is just "whatever this significant
// frame isn't". Checking BIT_FIRE instead would miss CHARGE-mode fires entirely:
// those fire on RELEASE, so the fire button is already back up -- BIT_FIRE unset --
// on the exact tick the significant frame was recorded, even though a shot
// genuinely fired. BIT_DASH doesn't have that problem since dashing always triggers
// on PRESS, so it's reliably still set on its own significant frame's tick. Returns
// null for a non-significant (2-element) frame.
function fireEventFor(f) {
  if (f.length !== 3) return null;
  const isDash = (f[1] & BIT_DASH) !== 0;
  return { fire: !isDash, dash: isDash, angle: degToRad(f[2]) };
}

export class HintPlayback {
  // frames: the encoded string from a level's hintReplay.frames field (see
  // encodeFrames/decodeFrames above) -- decoded right here into [dt, bitmask] /
  // [dt, bitmask, angleDeg] tuples, so nothing outside this module needs to know the
  // on-disk format.
  constructor(frames) {
    this.frames = decodeFrames(frames);
    // Precomputes each frame's cumulative scaled start time -- still needed to build
    // the angle keyframe timeline below.
    this.cumulativeMs = new Array(this.frames.length);
    let acc = 0;
    for (let i = 0; i < this.frames.length; i++) {
      this.cumulativeMs[i] = acc;
      acc += this.frames[i][0]; // scaledDt
    }
    this.totalMs = acc;
    this.frameIdx = 0;
    // How much of the CURRENT frame's own dt has already been consumed by previous
    // advance() calls -- lets a single recorded frame span several real ticks (a
    // long held-input run collapses to one big-dt frame via simplifyFrames, and
    // GameScene only ever spends a bit of it per real tick -- see advance() below)
    // as well as a single real tick spanning several short recorded frames.
    this.elapsedInFrame = 0;
    this.clock = 0;

    // The fire/dash event for the frame that's about to become (or, for frame 0,
    // already is) active -- claimed via takePendingFireEvent(). Kept as a separate
    // "pending" slot rather than just read directly off the current frame because
    // GameScene needs to force it the INSTANT this frame becomes active, even on a
    // tick where there isn't enough real time left to actually spend any of the
    // frame's own duration yet (see advance()'s doc comment for why a step is
    // clipped to frame boundaries rather than crossing them).
    this.pendingFireEvent = this.frames.length > 0 ? fireEventFor(this.frames[0]) : null;

    // The sparse angle timeline -- one {ms, angleDeg} entry per frame that actually
    // stored an angle (i.e. every fire/dash press), in recording order.
    this.angleKeyframes = [];
    for (let i = 0; i < this.frames.length; i++) {
      if (this.frames[i].length === 3) {
        this.angleKeyframes.push({ ms: this.cumulativeMs[i], angleDeg: this.frames[i][2] });
      }
    }
    this.angleKeyIdx = 0;
  }

  // True once every recorded frame has been fully consumed.
  get done() {
    return this.frameIdx >= this.frames.length;
  }

  // How much of the currently active frame's own recorded dt is left to spend.
  // GameScene clips each real tick's delta to this (see advance()'s doc comment) so
  // a physics step never crosses into the next recorded frame's input state or
  // overruns a boundary a fire/dash event needs to land exactly on.
  remainingInCurrentFrame() {
    if (this.done) return 0;
    return this.frames[this.frameIdx][0] - this.elapsedInFrame;
  }

  // Pops (and clears) the pending fire/dash event for the currently active frame --
  // returns it exactly once, the first time this is called after that frame became
  // active (via the constructor for frame 0, or via advance() crossing into it for
  // any other frame); returns null every other time, including for frames that
  // simply aren't significant.
  takePendingFireEvent() {
    const evt = this.pendingFireEvent;
    this.pendingFireEvent = null;
    return evt;
  }

  // The currently active frame's raw input state, plus the visible aim angle
  // (interpolated as of the current clock position) in radians. Doesn't advance
  // anything -- call advance() separately once you've decided how much of this
  // frame's remaining time to actually spend this tick.
  currentInputState() {
    const f = this.frames[this.frameIdx];
    return { ...unpackInputBitmask(f[1]), angle: degToRad(this.currentAngleDeg()) };
  }

  // Spends `dt` ms of the currently active frame's remaining duration -- dt must be
  // <= remainingInCurrentFrame(). GameScene clips each real tick's delta to that
  // remaining amount (splitting across frame boundaries by looping when needed)
  // rather than feeding a live, uncapped delta straight through as a single physics
  // step: that earlier approach paced the recording's own event timeline correctly,
  // but a single physics step could then span several original recorded frames'
  // worth of motion (or, worse, a whole simplifyFrames-merged run of held input,
  // whose combined dt can be huge) -- freezing the player for a stretch and then
  // jumping, instead of moving smoothly. Clipping to frame boundaries here instead
  // means movement is always stepped at the live, natural tick size -- smooth
  // regardless of how big or small the underlying recorded frame chunks are --
  // while fire/dash events (which DO need to land exactly on a frame boundary, not
  // partway through one) still can't be missed or blurred across a step, since a
  // step is never allowed to cross one.
  //
  // Advances the clock and elapsedInFrame by dt; once that exhausts the current
  // frame, moves to the next one and primes its pendingFireEvent (if significant)
  // so the next takePendingFireEvent() call picks it up immediately.
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

  // Interpolates the visible aim angle from the surrounding entries in
  // this.angleKeyframes. Holds the nearest keyframe's angle steady before the first
  // one or after the last one -- there's nothing to interpolate toward out there, so
  // it just doesn't turn -- and otherwise eases (shortest way around) between the
  // keyframe just behind the clock and the one just ahead of it. If the recording
  // never fired or dashed at all, there are no keyframes and the angle defaults to 0
  // (facing right) for the whole thing -- a harmless fallback, since nothing reads
  // aim as meaningful outside a fire/dash frame anyway.
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