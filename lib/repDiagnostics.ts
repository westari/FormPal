/**
 * lib/repDiagnostics.ts
 *
 * "Why aren't my reps counting?" — a live analyzer that reads the native
 * engine's own debug-log stream during a tracking session and, when reps
 * AREN'T landing, works out the likely reason and returns one short
 * on-screen instruction.
 *
 * `message()` re-evaluates against the wall clock on every call, so callers
 * should poll it on a timer too (not only on new log lines) — otherwise a
 * lost pose that stops the log stream leaves a stale message on screen.
 *
 * Reload-only — it consumes lines native already emits ([METRIC], [REP],
 * [SETTLE*], rejection lines).
 */

export interface RepDiagnostic {
  feed(line: string): void;
  /** current best on-screen instruction, or null when nothing looks wrong */
  message(): string | null;
  reset(): void;
}

const GRACE_SEC       = 3;   // don't nag before tracking has had a fair shot
const STALE_REP_SEC   = 10;  // reps were counting, then stopped for this long
const STREAM_DEAD_SEC = 2.5; // [METRIC] lines were flowing, then stopped = no pose

export function createRepDiagnostic(): RepDiagnostic {
  let startedAt      = 0;
  let lastRepAt      = 0;
  let lastMetricAt   = 0;
  let repCount       = 0;
  let metricFrames   = 0;
  let noPersonHits   = 0;
  let unreliable     = 0;
  let phantom        = 0;
  let settleActive   = false; // saw "rep counting active"
  let settleWaiting  = 0;     // [SETTLE] rejected / still-waiting lines
  // Metric-vs-threshold tracking — the exercises here DECREASE into a rep
  // (rest = high value, working = low). enter < exit (exit has hysteresis).
  let crossedEnter    = false; // value dropped below enter at least once
  let returnedToExit  = false; // after that, rose back above exit
  let msg: string | null = null;

  const now = () => Date.now();

  function feed(line: string): void {
    if (line.startsWith('[METRIC]')) {
      if (!startedAt) startedAt = now();
      lastMetricAt = now();
      metricFrames++;
      const v  = parseFloat(line.match(/value=([-\d.]+)/)?.[1]  ?? 'NaN');
      const en = parseFloat(line.match(/enter=([-\d.]+)/)?.[1]  ?? 'NaN');
      const ex = parseFloat(line.match(/exit=([-\d.]+)/)?.[1]   ?? 'NaN');
      if (!Number.isNaN(v) && !Number.isNaN(en) && v < en) crossedEnter = true;
      if (crossedEnter && !Number.isNaN(v) && !Number.isNaN(ex) && v > ex) returnedToExit = true;
    } else if (/rep counting active|entering ACTIVE/i.test(line)) {
      settleActive = true;
    } else if (/\[SETTLE\][^]*?(rejected|still waiting|not a genuine)/i.test(line)) {
      settleWaiting++;
    } else if (/no person detected|person left frame|rep abandoned|returning to SETUP/i.test(line)) {
      noPersonHits++;
    } else if (/\[REP\] rejected.*tracking unreliable/i.test(line)) {
      unreliable++;
    } else if (/\[REP\] rejected.*phantom/i.test(line)) {
      phantom++;
    } else if (/^\[REP\] #\d+/.test(line)) {
      repCount++;
      lastRepAt = now();
      noPersonHits = 0; unreliable = 0; phantom = 0;
      crossedEnter = false; returnedToExit = false;
    }
    recompute();
  }

  function recompute(): void {
    if (!startedAt) { msg = null; return; }
    const elapsed    = (now() - startedAt) / 1000;
    const sinceRep   = lastRepAt ? (now() - lastRepAt) / 1000 : elapsed;
    const streamDead = lastMetricAt > 0 && (now() - lastMetricAt) / 1000 > STREAM_DEAD_SEC;

    if (elapsed < GRACE_SEC) { msg = null; return; }

    // Pose is GONE — wins over everything.
    if (streamDead) { msg = 'Point the camera at your body'; return; }

    // A working set — don't nag.
    if (repCount > 0 && sinceRep < STALE_REP_SEC) { msg = null; return; }

    // Framing / tracking problems first.
    if (noPersonHits >= 2) {
      msg = 'Fit your whole body in frame';
    } else if (unreliable >= 2) {
      msg = 'Move farther back';
    } else if (!settleActive && settleWaiting >= 4) {
      msg = 'Hold still at the start';
    } else if (phantom >= 1) {
      msg = 'Slower, fuller reps';
    } else if (repCount === 0 && !crossedEnter && metricFrames > 8) {
      // Never got deep enough for a rep to even begin.
      msg = 'Go deeper into each rep';
    } else if (repCount === 0 && crossedEnter && !returnedToExit && metricFrames > 8) {
      // Went into a rep but never came back to the start.
      msg = 'Return to the start each rep';
    } else {
      msg = null;
    }
  }

  function message(): string | null { recompute(); return msg; }

  function reset(): void {
    startedAt = lastRepAt = lastMetricAt = repCount = metricFrames = 0;
    noPersonHits = unreliable = phantom = settleWaiting = 0;
    settleActive = crossedEnter = returnedToExit = false;
    msg = null;
  }

  return { feed, message, reset };
}
