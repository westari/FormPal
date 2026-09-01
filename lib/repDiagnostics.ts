/**
 * lib/repDiagnostics.ts
 *
 * "Why aren't my reps counting?" — a live analyzer that reads the native
 * engine's own debug-log stream during a tracking session and, when reps
 * AREN'T landing, works out the likely reason and returns one short
 * on-screen instruction.
 *
 * This is the link the user asked for: the guidance command reads the same
 * signal the rep counter does, so a silent "0 reps" turns into "here's what
 * to fix" instead of nothing.
 *
 * Reload-only — it consumes lines that native already emits
 * ([METRIC], [REP], [SETUP-TRACE], rejection lines).
 */

export interface RepDiagnostic {
  feed(line: string): void;
  /** current best on-screen instruction, or null when nothing looks wrong */
  message(): string | null;
  reset(): void;
}

const GRACE_SEC        = 6;   // don't nag before tracking has had a fair shot
const STALE_REP_SEC    = 10;  // reps were counting, then stopped for this long
const NUDGE_AFTER_SEC  = 11;  // counting has never started

export function createRepDiagnostic(): RepDiagnostic {
  let startedAt      = 0;
  let lastRepAt      = 0;
  let repCount       = 0;
  let metricFrames   = 0;
  let downTransitions = 0;   // metric crossed into a rep (state -> down)
  let lastState      = '';
  let noPersonHits   = 0;
  let unreliable     = 0;
  let phantom        = 0;
  let msg: string | null = null;

  const now = () => Date.now();

  function feed(line: string): void {
    if (line.startsWith('[METRIC]')) {
      if (!startedAt) startedAt = now();
      metricFrames++;
      const st = line.match(/state=(\w+)/)?.[1] ?? '';
      if (st === 'down' && lastState !== 'down') downTransitions++;
      lastState = st;
    } else if (/no person detected|person left frame|rep abandoned|returning to SETUP/i.test(line)) {
      noPersonHits++;
    } else if (/\[REP\] rejected.*tracking unreliable/i.test(line)) {
      unreliable++;
    } else if (/\[REP\] rejected.*phantom/i.test(line)) {
      phantom++;
    } else if (/^\[REP\] #\d+/.test(line)) {
      repCount++;
      lastRepAt = now();
      noPersonHits = 0; unreliable = 0; phantom = 0;  // a rep landed — clear the slate
    }
    recompute();
  }

  function recompute(): void {
    if (!startedAt) { msg = null; return; }
    const elapsed  = (now() - startedAt) / 1000;
    const sinceRep = lastRepAt ? (now() - lastRepAt) / 1000 : elapsed;

    if (elapsed < GRACE_SEC) { msg = null; return; }
    if (repCount > 0 && sinceRep < STALE_REP_SEC) { msg = null; return; }

    // Ordered most-specific → most-generic. Keep these SHORT — a few words.
    if (noPersonHits >= 3) {
      msg = 'Get fully in frame';
    } else if (unreliable >= 1) {
      msg = 'Move closer';
    } else if (phantom >= 1) {
      msg = 'Sit up higher';
    } else if (downTransitions >= 2 && repCount === 0) {
      msg = 'Lie all the way back';
    } else if (metricFrames > 0 && metricFrames < elapsed * 2.5) {
      msg = 'Line up in the box';
    } else if (repCount === 0 && elapsed > NUDGE_AFTER_SEC) {
      msg = 'Sit up higher';
    } else {
      msg = null;
    }
  }

  function message(): string | null { return msg; }

  function reset(): void {
    startedAt = lastRepAt = repCount = metricFrames = downTransitions = 0;
    noPersonHits = unreliable = phantom = 0;
    lastState = '';
    msg = null;
  }

  return { feed, message, reset };
}
