/**
 * lib/cameraConfidence.ts
 *
 * CAMERA CONFIDENCE = how well the camera can see what it needs to count reps (docs/movement-match.md, lib/coachTuning.ts).
 *
 * The old number only looked at the parts the camera COULD see (it read 100 while nothing counted, because the hands had left the frame
 * at the top and the counter never saw the top of the rep). The rules now, identical for every exercise:
 *   - Movement Match HIGH and reps counting      -> 90-100
 *   - Movement Match HIGH, no rep counted for ~5 seconds (or 2 attempts that did not count)
 *                                                -> below 80 and FALLING (-3 a second, floor 15), never near 100
 *   - Movement Match HIGH and the rep path is cut at the top / bottom (hands or feet leaving the frame)
 *                                                -> capped at 70 straight away
 *   - Movement Match LOW                         -> just what the camera sees (the visibility score)
 * So it can NEVER read 80+ while the user is clearly trying and no reps count.
 */
import { CONFIDENCE as C, MOVEMENT_MATCH as MM } from './coachTuning';
import type { MatchResult } from './movementMatch';

export interface ConfidenceInputs {
  now: number;
  /** 0-100: what the camera sees right now (createCounterSignal().score) */
  visibility: number;
  match: MatchResult;
  /** when the last rep counted (native [REP] or a soft rep), 0 = none yet */
  lastCountAt: number;
  /** attempts (strokes) that did not count since the last counted rep */
  missedSinceCount: number;
}

export interface ConfidenceResult {
  value: number;
  trying: boolean;
  counting: boolean;
  stuck: boolean;
  /** seconds since "trying with no rep counted" began (0 when not stuck) */
  stuckSec: number;
  cap: 'none' | 'stuck' | 'cut' | 'floor';
  why: string;
}

export interface CameraConfidence {
  update(i: ConfidenceInputs): ConfidenceResult;
  reset(): void;
}

export function createCameraConfidence(opts: { log?: (m: string) => void } = {}): CameraConfidence {
  let stuckSince = 0, lastLogAt = 0, lastLogVal = -100, lastLogWhy = '';
  let lastNow = 0, tryAcc = 0, lastTryingAt = 0, lastCountSeen = 0;
  return {
    update(i) {
      const trying = i.match.trying && i.match.tryingForSec >= MM.minTryingSec;
      const counting = i.lastCountAt > 0 && i.now - i.lastCountAt <= C.countRecentSec * 1000;
      // time spent TRYING since the last counted rep (a short pause between presses does not restart the clock)
      const dt = lastNow ? Math.min(1000, Math.max(0, i.now - lastNow)) / 1000 : 0;
      lastNow = i.now;
      if (i.lastCountAt !== lastCountSeen) { lastCountSeen = i.lastCountAt; tryAcc = 0; }
      if (trying) { tryAcc += dt; lastTryingAt = i.now; }
      const notCountingSec = tryAcc;
      const onset = trying && !counting && (tryAcc >= C.stuckAfterSec || i.missedSinceCount >= C.stuckAttempts);
      if (counting) stuckSince = 0;
      else if (onset && !stuckSince) stuckSince = i.now;
      else if (stuckSince && !trying && i.now - lastTryingAt > C.releaseSec * 1000) stuckSince = 0; // the user stopped: it recovers
      const stuck = stuckSince > 0;
      const stuckSec = stuckSince ? (i.now - stuckSince) / 1000 : 0;

      let value = i.visibility, cap: ConfidenceResult['cap'] = 'none', why = `the camera sees ${i.visibility}`;
      if (stuck) {
        const c = Math.max(C.stuckFloor, C.stuckStart - C.stuckFallPerSec * stuckSec);
        if (c < value) { value = c; cap = 'stuck'; }
        why = `trying (match ${i.match.score}) but no rep counted for ${notCountingSec.toFixed(0)}s / ${i.missedSinceCount} attempts, so it cannot read high (falling ${C.stuckFallPerSec}/s)`;
      }
      if (trying && (i.match.cut === 'top' || i.match.cut === 'bottom' || i.match.cut === 'both') && value > C.cutCap) {
        value = C.cutCap; cap = 'cut';
        why = `trying, and the rep path is cut off at the ${i.match.cut} (the camera never sees the whole rep)`;
      }
      if (trying && counting && !stuck && value < C.countingFloor) {
        value = C.countingFloor; cap = 'floor';
        why = `trying and reps are counting, so 90+ (the camera sees ${i.visibility})`;
      }
      value = Math.max(0, Math.min(100, Math.round(value)));
      if (opts.log && (Math.abs(value - lastLogVal) >= C.logDelta || why.slice(0, 20) !== lastLogWhy || i.now - lastLogAt >= C.logEverySec * 1000)) {
        lastLogAt = i.now; lastLogVal = value; lastLogWhy = why.slice(0, 20);
        opts.log(`[CONFIDENCE] ${value} (${why}) match=${i.match.score} counting=${counting ? 'yes' : 'no'} (PLACEHOLDER numbers)`);
      }
      return { value, trying, counting, stuck, stuckSec, cap, why };
    },
    reset() { stuckSince = 0; lastLogAt = 0; lastLogVal = -100; lastLogWhy = ''; lastNow = 0; tryAcc = 0; lastTryingAt = 0; lastCountSeen = 0; },
  };
}
