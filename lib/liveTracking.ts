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
    if (i.repDiag) return 35;
    if (i.trackingCue || i.outOfPlaneCue) return 55;
    return 100;
  }
  return 0;
}

// Rises one number at a time (explicit ask: show every number). Falls faster
// so a person leaving reads as dropping, and a target of 0 (nobody there) is
// shown as 0 immediately instead of counting down for seconds.
export function stepMeter(prev: number, target: number): number {
  if (prev === target) return prev;
  if (target === 0) return 0;
  if (prev < target) return prev + 1;
  return Math.max(target, prev - Math.max(1, Math.ceil((prev - target) / 4)));
}

// How long to wait before the next number. Normal counting is 45ms per number
// (visible, every integer); when the display is far behind its target it runs
// faster (still every integer) so the number never lags the real signal by
// seconds — which is what let "Ready. Go!" appear while it read 46%.
export function meterTickMs(prev: number, target: number): number {
  return Math.abs(target - prev) > 8 ? 18 : 45;
}

export function trackingIsHigh(display: number, target: number): boolean {
  return target >= READY_MIN_PCT && display >= READY_MIN_PCT;
}
