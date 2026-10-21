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
  let noPersonHits   = 0;
  let unreliable     = 0;
  let settleActive   = false; // saw "rep counting active"
  let settleWaiting  = 0;     // [SETTLE] rejected / still-waiting lines
  let msg: string | null = null;

  const now = () => Date.now();

  function feed(line: string): void {
    if (line.startsWith('[METRIC]')) {
      if (!startedAt) startedAt = now();
      lastMetricAt = now();
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
    if (streamDead) { msg = 'Get in frame'; return; }

    // A working set that's keeping pace — don't nag. Rep-quality ambiguity
    // (phantom rejections, shallow attempts) never overrides this any
    // more — those aren't framing problems, see file header.
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
    msg = null;
  }

  return { feed, message, reset };
}
