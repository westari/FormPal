/**
 * lib/liveTracking.ts
 *
 * Pure logic behind formcheck.tsx's live "TRACKING" meter and its spoken /
 * shown "Ready. Go!". Kept free of React/RN so scripts/test-live-tracking.js
 * can run the exact shipped code under node.
 *
 * Rules (explicit asks):
 *  - No person visible => the meter is 0%, never a leftover number.
 *  - "Ready. Go!" only once tracking is actually high (meter at/above
 *    READY_MIN_PCT), not merely when the native setup hold completed.
 */

export const NO_PERSON_CUE = 'Step back into frame';
export const READY_MIN_PCT = 95;

// ── Steady-tracking gate for "Ready. Go!" ───────────────────────────────────
// Native's setup hold (2.0s, joint confidence >= 0.25) says "in frame", but the first reps after it
// still lagged: real shoulder-press logs show joint confidence 0.43-0.77 and the first reps rejected
// as "tracking unreliable". So "Ready. Go!" now also needs the FULL body to have been tracked without
// a single break for a while: every setup frame trackable, and no gap in the frame stream.
// PLACEHOLDERS (not measured, set from reasoning): do a few starts and send the [READY-GATE] log
// lines, then the real values get set from those numbers.
export const READY_STEADY_MS = 3500;   // PLACEHOLDER: native hold is 2000ms, so this adds ~1.5s of steady tracking
export const READY_MAX_GAP_MS = 400;   // PLACEHOLDER: setup frames arrive every ~100ms; a longer silence counts as a break

export interface SteadyGate {
  /** One native setup event (they arrive every frame). Returns true if this event broke the steady run. */
  feed(allVisible: boolean, nowMs: number, passed?: boolean): boolean;
  /** How long the full body has been tracked without a break (0 if broken). */
  steadyMs(nowMs: number): number;
  reset(): void;
}

export function createSteadyGate(): SteadyGate {
  let since = 0, last = 0, passedAt = 0;
  return {
    feed(allVisible, nowMs, passed) {
      let broke = false;
      if (passed && allVisible) { if (!since) since = nowMs; last = nowMs; passedAt = nowMs; return false; }
      if (!allVisible || (last > 0 && nowMs - last > READY_MAX_GAP_MS)) { broke = since > 0; since = 0; passedAt = 0; }
      if (allVisible && !since) since = nowMs;
      last = nowMs;
      return broke;
    },
    // After native's "passed" the setup events stop, so the run keeps counting up with the clock from then on;
    // before it, the run is measured up to the last event.
    steadyMs(nowMs) { return since ? ((passedAt ? nowMs : last) - since) : 0; },
    reset() { since = 0; last = 0; passedAt = 0; },
  };
}

// ── Counter signal: what the rep counter itself can see ─────────────────────
// The "Camera confidence" number must agree with whether reps count. Reps are counted from the native rep metric,
// which needs shoulder + elbow every frame, so the honest confidence is "how well has the counter been seeing those
// joints lately". Native prints exactly that in its debug log, and this reads the same lines the counter produces:
//   [METRIC] ... value=V            -> a frame where the rep metric was measurable (~every 0.4s)
//   [SETTLE-TRACE] / [REP-TRACE]    -> per-frame metric samples (REP-TRACE also carries framesSincePoseGap)
//   framesSincePoseGap going DOWN   -> the pose was lost for a moment (the counter skips frames after a gap and
//                                      abandons a rep when the gap is long: the arms leaving the frame at the top of
//                                      a press, standing too close, a limb hidden)
//   "[REP] rejected - tracking unreliable"   -> the counter threw a rep away because it could not see you
//   [TRACK] person lost / back      -> nobody in frame
// All windows below are PLACEHOLDERS (reasoned, not measured): send a log and they get set from real numbers.
export const COUNTER_BLIND_MS = 1500;      // no metric sample for this long = the counter is blind
export const COUNTER_GAP_RECOVER_MS = 4000; // after a pose gap the score climbs back over this long
export const COUNTER_GAP_FLOOR = 45;        // score right after a pose gap
export const COUNTER_UNRELIABLE_MS = 6000;
export const COUNTER_UNRELIABLE_SCORE = 40;
export const COUNTER_BLIND_SCORE = 20;

// "Ready. Go!" additionally waits until the counter can really see you (PLACEHOLDERS, set from the [READY-GATE] lines):
// at least READY_COUNTER_MIN_SAMPLES metric samples in the last READY_COUNTER_WINDOW_MS with no pose gap, and - for
// exercises that need a start position (shoulder press: hands at the shoulders) - every one of them in that position.
// The real log that motivated this: Go showed at 38.3s while the counter was still rejecting the pose as "not a genuine
// starting position" (readings 34-58, needs >= 63.7) and the first reps of the set were lost.
export const READY_COUNTER_WINDOW_MS = 1200;
export const READY_COUNTER_MIN_SAMPLES = 3;

export interface CounterFlags { diag?: boolean; cue?: boolean }

export interface CounterSignal {
  /** Feed every native debug-log line. */
  feedLog(message: string, nowMs: number): void;
  /** Tell it which soft warnings are showing right now (a "why not counting" message, a framing cue). They fade in and out over ~0.5s. */
  setFlags(flags: CounterFlags): void;
  /** 0-100, continuous: how well the counter can see you right now. Before any sample has arrived it returns 100 (nothing is wrong yet). */
  score(nowMs: number): number;
  /** True if at least `minSamples` metric samples arrived in the last `windowMs` and none was a pose gap / unreliable report. */
  healthy(nowMs: number, windowMs: number, minSamples: number): boolean;
  /** True if the last `minSamples` metric samples (all within `windowMs`) read at or above `minValue` (the user holds the start position). */
  atStartPosition(minValue: number, nowMs: number, windowMs: number, minSamples: number): boolean;
  /** Newest metric value, or null. */
  lastValue(): number | null;
  /** True once any metric sample has arrived (without debug logging there are none, and nothing may wait on them). */
  seen(): boolean;
  reset(): void;
}

// The score is 100 minus a sum of SMALL, continuous penalties (PLACEHOLDER weights):
//   - the metric samples arriving unevenly (0 .. 6): a hiccup in the camera stream is a few points, not a cliff
//   - the metric going quiet (0 .. 80, from 0.4s to 1.5s of silence)
//   - a pose loss, fading out over 4s (55 -> 0)
//   - a rep thrown out for low joint confidence (0 .. 50 by how low the confidence was), fading over 6s
//   - a "why not counting" message (up to 40) or a framing cue (up to 25), faded in/out over ~0.5s
export const COUNTER_JITTER_MAX = 6;
export const COUNTER_SILENCE_MAX = 80;
export const COUNTER_GAP_MAX = 55;
export const COUNTER_CONF_MAX = 50;
export const COUNTER_DIAG_MAX = 40;
export const COUNTER_CUE_MAX = 25;
export const COUNTER_FLAG_TAU_MS = 500;

export function createCounterSignal(): CounterSignal {
  let sampleAt = 0, gapAt = 0, unreliableAt = 0, prevGap: number | null = null, value: number | null = null;
  let confQ = 1; // joint confidence quality (0..1) of the last rejected rep
  let samples: { t: number; v: number; tag: string }[] = [];
  let flagTarget = { diag: 0, cue: 0 }, flagVal = { diag: 0, cue: 0 }, flagAt = 0;
  const note = (t: number, v: number, tag: string) => { value = v; sampleAt = t; samples.push({ t, v, tag }); if (samples.length > 40) samples = samples.slice(-40); };
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  return {
    feedLog(msg, now) {
      if (msg.startsWith('[METRIC]')) {
        const m = /value=([-\d.]+)/.exec(msg);
        if (m) note(now, parseFloat(m[1]), 'M');
      } else if (msg.startsWith('[SETTLE-TRACE]')) {
        const m = /angle=([-\d.]+)/.exec(msg);
        if (m) note(now, parseFloat(m[1]), 'S');
      } else if (msg.startsWith('[REP-TRACE]')) {
        const m = /angle=([-\d.]+)/.exec(msg), g = /framesSincePoseGap=(\d+)/.exec(msg);
        if (m) note(now, parseFloat(m[1]), 'R');
        if (g) { const n = +g[1]; if (prevGap !== null && n < prevGap) gapAt = now; prevGap = n; }
      } else if (/^\[REP\] rejected\s+\S+\s+tracking unreliable/.test(msg)) {
        unreliableAt = now;
        const mids: number[] = [];
        const re = /=\[([\d.]+)-([\d.]+)\]/g; let mm: RegExpExecArray | null;
        while ((mm = re.exec(msg))) mids.push((parseFloat(mm[1]) + parseFloat(mm[2])) / 2);
        // Vision's joint confidence for a clearly visible arm sits around 0.7-0.9: map the average of what this rep had onto 0..1
        if (mids.length) confQ = clamp01(mids.reduce((x, y) => x + y, 0) / mids.length / 0.8);
      } else if (msg.startsWith('[TRACK] person lost')) {
        gapAt = now;
      }
    },
    setFlags(f) { flagTarget = { diag: f.diag ? 1 : 0, cue: f.cue ? 1 : 0 }; },
    score(now) {
      if (!sampleAt) return 100;
      // fade the soft warnings in/out
      const dt = flagAt ? Math.max(0, now - flagAt) : 0; flagAt = now;
      const k = 1 - Math.exp(-dt / COUNTER_FLAG_TAU_MS);
      flagVal = { diag: flagVal.diag + (flagTarget.diag - flagVal.diag) * k, cue: flagVal.cue + (flagTarget.cue - flagVal.cue) * k };
      let pen = 0;
      // uneven sample timing (same kind of line only)
      const tag = samples.length ? samples[samples.length - 1].tag : '';
      const same = samples.filter((x) => x.tag === tag).slice(-8);
      if (same.length >= 4) {
        const d = same.slice(1).map((x, i) => x.t - same[i].t).sort((x, y) => x - y), med = d[Math.floor(d.length / 2)];
        const jit = d.reduce((x, y) => x + Math.abs(y - med), 0) / d.length;
        pen += clamp01(jit / 250) * COUNTER_JITTER_MAX;
      }
      pen += clamp01((now - sampleAt - 400) / (COUNTER_BLIND_MS - 400)) * COUNTER_SILENCE_MAX;
      if (gapAt) pen += clamp01(1 - (now - gapAt) / COUNTER_GAP_RECOVER_MS) * COUNTER_GAP_MAX;
      if (unreliableAt) pen += clamp01(1 - (now - unreliableAt) / COUNTER_UNRELIABLE_MS) * (1 - confQ) * COUNTER_CONF_MAX;
      pen += flagVal.diag * COUNTER_DIAG_MAX + flagVal.cue * COUNTER_CUE_MAX;
      return Math.max(5, Math.round(100 - Math.min(95, pen)));
    },
    healthy(now, windowMs, minSamples) {
      const recent = samples.filter((x) => now - x.t <= windowMs);
      if (recent.length < minSamples) return false;
      if (gapAt && now - gapAt <= windowMs) return false;
      if (unreliableAt && now - unreliableAt <= windowMs) return false;
      return true;
    },
    atStartPosition(minValue, now, windowMs, minSamples) {
      const recent = samples.filter((x) => now - x.t <= windowMs);
      return recent.length >= minSamples && recent.every((x) => x.v >= minValue);
    },
    lastValue() { return value; },
    seen() { return sampleAt > 0; },
    reset() { sampleAt = 0; gapAt = 0; unreliableAt = 0; prevGap = null; value = null; samples = []; confQ = 1; flagVal = { diag: 0, cue: 0 }; flagTarget = { diag: 0, cue: 0 }; flagAt = 0; },
  };
}

// Hints native's setup check emits when Vision found nobody at all (every
// frame, see ExerciseEngine.notePersonMissing / positionGuidance).
const SETUP_NO_PERSON_HINTS = ['Get in frame', 'Get back in frame'];

export interface MeterInputs {
  phase: string;                 // formcheck Phase
  isActive: boolean;             // tracking or stopping
  setupAllVisible: boolean;
  setupHoldProgress: number;     // 0..1
  setupHint: string;
  personDetected?: boolean;      // onDebugStats.personDetected (tracking only)
  trackingCue?: string;
  outOfPlaneCue?: string;
  repDiag: string | null;
  /** 0-100 from createCounterSignal().score(): how well the rep counter itself sees you (tracking only). */
  counterScore?: number;
}

export function personLost(i: MeterInputs): boolean {
  if (i.phase === 'setup') {
    return !i.setupAllVisible && (i.setupHint === '' || SETUP_NO_PERSON_HINTS.includes(i.setupHint));
  }
  if (i.isActive) return i.personDetected === false || i.repDiag === NO_PERSON_CUE;
  return false;
}

export function meterTarget(i: MeterInputs): number {
  if (i.phase === 'setup') {
    if (personLost(i)) return 0;
    if (!i.setupAllVisible) return 25; // person in frame, joints not trackable yet
    return Math.round(60 + i.setupHoldProgress * 40);
  }
  if (i.phase === 'setup-done') return 100;
  if (i.isActive) {
    if (personLost(i)) return 0;
    let t = 100;
    if (i.repDiag) t = 35;
    else if (i.trackingCue || i.outOfPlaneCue) t = 55;
    // the same signal the counter works from: high only if reps can actually be counted
    if (i.counterScore !== undefined) t = Math.min(t, i.counterScore);
    return t;
  }
  return 0;
}

// ── Smooth meter ─────────────────────────────────────────────────────────────
// The number is LIVE and CONTINUOUS: the target it chases is itself a continuous quality (see createCounterSignal.score:
// it moves a little when the picture changes a little), and the shown number follows it with exponential smoothing, so a
// small change in the picture is a small change on screen (100 -> 98), a big one glides, and nothing ever steps.
// "Nobody there" is still shown at once (0). Time-based, so it feels the same at any frame rate.
export const METER_TAU_UP_MS = 220;     // PLACEHOLDER smoothing time constants
export const METER_TAU_DOWN_MS = 300;

export interface MeterSmoother {
  /** Advance to `nowMs` with the raw `target`; returns the integer to display. */
  tick(target: number, nowMs: number): number;
  /** The target the display is gliding toward. */
  readonly effectiveTarget: number;
}

export function createMeterSmoother(): MeterSmoother {
  let eff = 0, disp = 0, lastMs = -1;
  return {
    tick(target, nowMs) {
      const dt = lastMs < 0 ? 0 : Math.max(0, nowMs - lastMs);
      lastMs = nowMs;
      if (target === 0) { eff = 0; disp = 0; return 0; }
      eff = target;
      const tau = target > disp ? METER_TAU_UP_MS : METER_TAU_DOWN_MS;
      disp += (target - disp) * (1 - Math.exp(-dt / tau));
      return Math.round(disp);
    },
    get effectiveTarget() { return eff; },
  };
}

export function trackingIsHigh(display: number, target: number): boolean {
  return target >= READY_MIN_PCT && display >= READY_MIN_PCT;
}
