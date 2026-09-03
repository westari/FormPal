/**
 * lib/repDiagnostics.ts
 *
 * "Why aren't my reps counting?" — a live analyzer that reads the native
 * engine's own debug-log stream during a tracking session and, when reps
 * AREN'T landing, works out the likely reason and returns one short
 * on-screen instruction naming what the camera needs to see.
 *
 * This is the link the user asked for: the guidance command reads the same
 * signal the rep counter does, so a silent "0 reps" turns into "here's what
 * to fix" instead of nothing — and once counting starts it goes quiet.
 *
 * Reload-only — it consumes lines native already emits ([METRIC], [REP],
 * [SETTLE*], [SETUP-TRACE], rejection lines).
 */

export interface RepDiagnostic {
  feed(line: string): void;
  /** current best on-screen instruction, or null when nothing looks wrong */
  message(): string | null;
  reset(): void;
}

const GRACE_SEC       = 4;   // don't nag before tracking has had a fair shot
const STALE_REP_SEC   = 10;  // reps were counting, then stopped for this long
const NUDGE_AFTER_SEC = 5;   // counting has never started — speak up by now

export function createRepDiagnostic(): RepDiagnostic {
  let startedAt       = 0;
  let lastRepAt       = 0;
  let repCount        = 0;
  let metricFrames    = 0;
  let downTransitions = 0;   // metric crossed into a rep (state -> down/inRep)
  let lastState       = '';
  let noPersonHits    = 0;
  let unreliable      = 0;
  let phantom         = 0;
  let settleActive    = false; // saw "rep counting active"
  let settleWaiting   = 0;     // [SETTLE] rejected / still-waiting lines
  let msg: string | null = null;

  const now = () => Date.now();

  function feed(line: string): void {
    if (line.startsWith('[METRIC]')) {
      if (!startedAt) startedAt = now();
      metricFrames++;
      const st = line.match(/state=(\w+)/)?.[1] ?? '';
      if ((st === 'down' || st === 'inRep') && lastState !== st) downTransitions++;
      lastState = st;
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
      noPersonHits = 0; unreliable = 0; phantom = 0; // a rep landed — clear the slate
    }
    recompute();
  }

  function recompute(): void {
    if (!startedAt) { msg = null; return; }
    const elapsed  = (now() - startedAt) / 1000;
    const sinceRep = lastRepAt ? (now() - lastRepAt) / 1000 : elapsed;

    // Never nag a set that's working: something has counted recently.
    if (repCount > 0 && sinceRep < STALE_REP_SEC) { msg = null; return; }
    if (elapsed < GRACE_SEC) { msg = null; return; }

    // Short. Plain. Most specific cause first. Never more than 4 words.
    if (noPersonHits >= 3) {
      msg = 'Get in frame';
    } else if (unreliable >= 2) {
      msg = 'Move farther back';
    } else if (!settleActive && settleWaiting >= 3) {
      msg = 'Lie flat, hold still';
    } else if (downTransitions >= 2 && repCount === 0) {
      msg = 'Come all the way down';
    } else if (phantom >= 2) {
      msg = 'Full range each rep';
    } else if (repCount === 0 && elapsed > NUDGE_AFTER_SEC) {
      msg = metricFrames > 10 ? 'Sit up higher' : 'Get in frame';
    } else if (repCount > 0 && sinceRep >= STALE_REP_SEC) {
      msg = 'Keep going, steady reps';
    } else {
      msg = null;
    }
  }

  function message(): string | null { return msg; }

  function reset(): void {
    startedAt = lastRepAt = repCount = metricFrames = downTransitions = 0;
    noPersonHits = unreliable = phantom = settleWaiting = 0;
    settleActive = false;
    lastState = '';
    msg = null;
  }

  return { feed, message, reset };
}
