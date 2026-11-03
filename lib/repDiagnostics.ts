/**
 * lib/repDiagnostics.ts
 *
 * "Why aren't my reps counting?" — a live analyzer that reads the native
 * engine's own debug-log stream during a tracking session and, when the
 * camera genuinely can't see/track the person, works out why and returns
 * one short on-screen instruction.
 *
 * Explicit rules from direct user feedback:
 * - Never exercise technique ("go deeper", "come all the way back up") —
 *   this screen is only about whether the camera can see the user, never
 *   how to do the exercise (they already watched the demo video). Short —
 *   1-4 words — never a full instructional sentence.
 * - Never fire at the same time a rep result (GOOD/BAD/PRESS HIGHER) is
 *   showing — "there's nothing to fix if it's able to see you." This is
 *   why this file ONLY tracks genuine tracking-loss signals (dead frame
 *   stream, no person, unreliable confidence, settle problems) — NOT
 *   phantom-rep rejections or ambiguous rep-attempt/miss counting, both of
 *   which are about movement quality, not camera framing, and used to fire
 *   "Move back" on perfectly ordinary movement noise while a rep was
 *   correctly being counted right alongside it.
 *
 * `message()` re-evaluates against the wall clock on every call, so callers
 * should poll it on a timer too (not only on new log lines) — otherwise a
 * lost pose that stops the log stream leaves a stale message on screen.
 *
 * Reload-only — it consumes lines native already emits ([METRIC], [REP],
 * [SETTLE*], rejection lines).
 */

import { NO_PERSON_CUE } from './liveTracking';

export interface RepDiagnostic {
  feed(line: string): void;
  /** current best on-screen instruction, or null when nothing looks wrong */
  message(): string | null;
  reset(): void;
}

const GRACE_SEC       = 1.5; // don't nag before tracking has had a fair shot
const STALE_REP_SEC   = 10;  // reps were counting, then stopped for this long
// [METRIC] lines arrive ~3/sec while a pose is found (native throttles them to
// 0.33s), so 0.9s of silence means two missed lines in a row = person gone.
// Was 2.5s, which made "step back into frame" show 3+ seconds late.
const STREAM_DEAD_SEC = 0.9;
// Floor exercises (sit-up) legitimately lose the whole person at the top of every
// rep, so they keep the old, patient threshold.
export const STREAM_DEAD_SEC_FLOOR = 2.5;

// "Moved but nothing counted" rule. PLACEHOLDERS (not from a device log): the
// window the movement is measured over, how long since the last counted rep
// before it may fire, how much of the exercise's full range (|top - rom| from
// the [METRIC] line) the movement must cover, and how long a cue stays up.
const MOVE_WINDOW_SEC     = 5;
const MOVE_SILENCE_SEC    = 4.5;
const MOVE_RANGE_FRACTION = 0.85;
const CUE_HOLD_SEC        = 3;

export function createRepDiagnostic(streamDeadSec: number = STREAM_DEAD_SEC): RepDiagnostic {
  let startedAt      = 0;
  let lastRepAt      = 0;
  let lastMetricAt   = 0;
  let repCount       = 0;
  let noPersonHits   = 0;
  let unreliable     = 0;
  let settleActive   = false; // saw "rep counting active"
  let settleWaiting  = 0;     // [SETTLE] rejected / still-waiting lines
  let msg: string | null = null;
  let personLost     = false; // native said "[TRACK] person lost" (~0.2s after the last pose)
  let waitAt         = 0;     // last [REP-WAIT]
  let rejectedAt     = 0;     // last non-tracking [REP] rejected
  let fullRange      = 0;     // |top - rom| from the latest [METRIC] line (metric units)
  const recent: { at: number; v: number }[] = [];

  const now = () => Date.now();

  function feed(line: string): void {
    if (line.startsWith('[METRIC]')) {
      if (!startedAt) startedAt = now();
      lastMetricAt = now();
      personLost = false; // a metric line means a pose is being measured again
      // Movement bookkeeping for the "you moved but nothing counted" rule.
      const v = /value=([-\d.]+)/.exec(line), t = /top=([-\d.]+)/.exec(line), r = /rom=([-\d.]+)/.exec(line);
      if (v) {
        recent.push({ at: now(), v: parseFloat(v[1]) });
        while (recent.length && now() - recent[0].at > MOVE_WINDOW_SEC * 1000) recent.shift();
      }
      if (t && r) fullRange = Math.abs(parseFloat(t[1]) - parseFloat(r[1]));
    } else if (/^\[TRACK\] person lost/.test(line)) {
      // Native noticed ~6 frames (~0.2s) with no person: show the cue NOW instead
      // of waiting for the metric stream to look dead.
      personLost = true;
    } else if (/^\[TRACK\] person back/.test(line)) {
      personLost = false;
    } else if (/^\[REP-WAIT\]/.test(line)) {
      // Native: the old rule would have counted, but the arms are not back at
      // the start position yet. Tell the user what finishes the rep.
      waitAt = now();
    } else if (/^\[REP\] rejected/.test(line) && !/tracking unreliable/i.test(line)) {
      // A real attempt that native threw out (phantom / gate): never silent.
      rejectedAt = now();
    } else if (/rep counting active|entering ACTIVE/i.test(line)) {
      settleActive = true;
    } else if (/\[SETTLE\][^]*?(rejected|still waiting|not a genuine)/i.test(line)) {
      settleWaiting++;
    } else if (/no person detected|person left frame|rep abandoned|returning to SETUP/i.test(line)) {
      noPersonHits++;
    } else if (/\[REP\] rejected.*tracking unreliable/i.test(line)) {
      unreliable++;
    } else if (/^\[REP\] #\d+/.test(line)) {
      repCount++;
      lastRepAt = now();
      noPersonHits = 0; unreliable = 0;
      waitAt = rejectedAt = 0;
      recent.length = 0;
    }
    recompute();
  }

  function recompute(): void {
    if (!startedAt) { msg = null; return; }
    const elapsed    = (now() - startedAt) / 1000;
    const sinceRep   = lastRepAt ? (now() - lastRepAt) / 1000 : elapsed;
    const streamDead = lastMetricAt > 0 && (now() - lastMetricAt) / 1000 > streamDeadSec;

    // Native's own "person lost" signal beats the grace period and the 0.9s
    // stream-dead wait: someone who walks off should be told at once.
    if (personLost) { msg = NO_PERSON_CUE; return; }

    if (elapsed < GRACE_SEC) { msg = null; return; }

    // Pose is GONE — wins over everything.
    if (streamDead) { msg = NO_PERSON_CUE; return; }

    // SILENCE IS NEVER ALLOWED (explicit rule): a rep the user does must either
    // count or get a cue. Three ways a real attempt used to vanish silently:
    //  1. native saw the press but the arms never got back to the start
    //     ([REP-WAIT]) -> say what finishes it;
    //  2. native threw the attempt out ([REP] rejected ...) -> say so;
    //  3. the user clearly moved through most of the range and nothing counted
    //     or got rejected for a while -> say so.
    if (waitAt && (now() - waitAt) / 1000 < CUE_HOLD_SEC) { msg = 'Lower arms to start'; return; }
    if (rejectedAt && (now() - rejectedAt) / 1000 < CUE_HOLD_SEC) { msg = 'Rep not counted'; return; }
    if (sinceRep >= MOVE_SILENCE_SEC && fullRange > 0 && recent.length >= 3) {
      let lo = Infinity, hi = -Infinity;
      for (const p of recent) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }
      if (hi - lo >= MOVE_RANGE_FRACTION * fullRange) { msg = 'Rep not counted'; return; }
    }

    // A working set that's keeping pace — don't nag about framing.
    if (repCount > 0 && sinceRep < STALE_REP_SEC) { msg = null; return; }

    if (noPersonHits >= 2) {
      msg = 'Move back';
    } else if (unreliable >= 2) {
      msg = 'Move back';
    } else if (!settleActive && settleWaiting >= 4) {
      msg = 'Hold still';
    } else {
      msg = null;
    }
  }

  function message(): string | null { recompute(); return msg; }

  function reset(): void {
    startedAt = lastRepAt = lastMetricAt = repCount = 0;
    noPersonHits = unreliable = settleWaiting = 0;
    settleActive = false;
    waitAt = rejectedAt = fullRange = 0;
    personLost = false;
    recent.length = 0;
    msg = null;
  }

  return { feed, message, reset };
}
