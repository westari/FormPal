/**
 * scripts/lib/missed-attempt-mirror.js
 *
 * A line-for-line JS MIRROR of the missed-attempt tracker added to modules/athlt-camera/ios/ExerciseEngine.swift (trackAttempt / finishAttempt /
 * resetAttemptTracker, 2026-11-15). Swift cannot be compiled on Windows, so the same logic runs here on the real logs and on synthetic strokes.
 * Keep the two in step: same constants, same order of checks, same names.
 *
 * Fidelity note: the engine sees every frame (about 30 a second); a device log only has the [METRIC] line about 2.5 times a second plus the
 * 10-a-second [REP-TRACE] lines while a rep is in progress. A replay can therefore only find strokes that last a few log lines; the phone sees more.
 * ALL FOUR NUMBERS ARE PLACEHOLDERS (same as the Swift).
 */
const ATTEMPT_MIN_FRACTION = 0.35;
const ATTEMPT_TURN_FRACTION = 0.15;
const ATTEMPT_MIN_FRAMES = 3;
const ATTEMPT_MIN_SECONDS = 0.25;
const ATTEMPT_TOP_FRACTION = 0.20;

function createMissedAttemptMirror(opts = {}) {
  const onMissed = opts.onMissed || (() => {});
  const T = { enter: 50, exit: 58, rom: 55, top: 84 };     // the exercise's own lines (from the [METRIC] line)
  let repPhase = 'atTop';                                    // 'atTop' | 'inRep'
  let repTopValue = 0;
  let atkPeak = -Infinity, atkStartPeak = 0, atkLow = Infinity, atkFrames = 0, atkStartTime = null, atkDescending = false;
  const resetAttemptTracker = () => { atkPeak = -Infinity; atkStartPeak = 0; atkLow = Infinity; atkFrames = 0; atkStartTime = null; atkDescending = false; };

  function finishAttempt(range, t) {
    const size = (atkStartPeak - atkLow) / range;
    const seconds = atkStartTime === null ? 0 : (t - atkStartTime) / 1000;
    if (!(size >= ATTEMPT_MIN_FRACTION && atkFrames >= ATTEMPT_MIN_FRAMES && seconds >= ATTEMPT_MIN_SECONDS)) return;
    const topNeeded = T.top - ATTEMPT_TOP_FRACTION * range;
    const topDef = Math.max(0, (topNeeded - atkStartPeak) / range);
    const bottomDef = Math.max(0, (atkLow - T.enter) / range);
    if (!(topDef > 0 || bottomDef > 0)) return;
    let reason, reached, needed;
    if (topDef > bottomDef) { reason = 'short_top'; reached = atkStartPeak; needed = topNeeded; }
    else { reason = 'short_bottom'; reached = atkLow; needed = T.enter; }
    onMissed({ reason, reached, needed, size, frames: atkFrames, t });
  }

  function trackAttempt(angle, t) {
    const range = Math.abs(T.top - T.rom);   // the exercise's own range (def.topAngle to goodROM), as in the Swift
    if (!(range > 0.01)) return;
    const turn = range * ATTEMPT_TURN_FRACTION;
    if (!atkDescending) {
      atkPeak = Math.max(atkPeak, angle);
      if (atkPeak - angle >= turn) { atkDescending = true; atkStartPeak = atkPeak; atkLow = angle; atkFrames = 1; atkStartTime = t; }
    } else {
      atkFrames += 1;
      if (angle < atkLow) atkLow = angle;
      if (angle - atkLow >= turn) { finishAttempt(range, t); atkDescending = false; atkPeak = angle; }
    }
  }

  return {
    /** the exercise's lines (the [METRIC] line carries them) */
    setLines(l) { Object.assign(T, l); },
    /** one frame's metric value at time t (ms) */
    frame(angle, t) {
      if (repPhase === 'inRep') {
        resetAttemptTracker();                                // no tracking while a rep is in progress
        if (angle > T.exit) repPhase = 'atTop';               // the rep ended (counted or rejected by the engine's own guards)
        return;
      }
      repTopValue = Math.min(Math.max(repTopValue, angle), T.top + 20);
      if (angle >= T.enter) trackAttempt(angle, t);
      if (angle < T.enter) { resetAttemptTracker(); repPhase = 'inRep'; }
    },
    reset() { repPhase = 'atTop'; repTopValue = 0; resetAttemptTracker(); },
  };
}

module.exports = { createMissedAttemptMirror, ATTEMPT_MIN_FRACTION, ATTEMPT_TURN_FRACTION, ATTEMPT_MIN_FRAMES, ATTEMPT_MIN_SECONDS, ATTEMPT_TOP_FRACTION };
