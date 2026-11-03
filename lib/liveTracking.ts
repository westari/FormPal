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

// ── Smooth meter ─────────────────────────────────────────────────────────────
// The meter used to chase the raw target one number per 45ms and followed every
// flicker of it (100 -> 55 -> 100 as a cue blinked on and off), so it lagged
// behind the body and jittered. Now:
//  * the target is DE-BOUNCED: it may go UP at once, but a LOWER (non-zero)
//    target must hold for LOWER_HOLD_MS before the meter believes it, so a
//    one-frame flicker never shows. Zero (nobody there) is always immediate.
//  * the shown number glides toward the target at a fixed speed (fast up,
//    faster down), time-based, so it feels the same at any frame rate.
// Accuracy is unchanged: a real, sustained change is shown within a fraction of
// a second, and "no person" is shown instantly.
export const METER_UP_PER_SEC = 140;
export const METER_DOWN_PER_SEC = 280;
export const LOWER_HOLD_MS = 350;

export interface MeterSmoother {
  /** Advance to `nowMs` with the raw `target`; returns the integer to display. */
  tick(target: number, nowMs: number): number;
  /** The de-bounced target the display is gliding toward. */
  readonly effectiveTarget: number;
}

export function createMeterSmoother(): MeterSmoother {
  let eff = 0, disp = 0, lastMs = -1, lowerSince = 0;
  return {
    tick(target, nowMs) {
      const dt = lastMs < 0 ? 0 : Math.max(0, nowMs - lastMs);
      lastMs = nowMs;
      if (target === 0) { eff = 0; disp = 0; lowerSince = 0; return 0; }
      if (target >= eff) { eff = target; lowerSince = 0; }
      else {
        if (!lowerSince) lowerSince = nowMs;
        if (nowMs - lowerSince >= LOWER_HOLD_MS) { eff = target; lowerSince = 0; }
      }
      if (disp < eff) disp = Math.min(eff, disp + (METER_UP_PER_SEC * dt) / 1000);
      else if (disp > eff) disp = Math.max(eff, disp - (METER_DOWN_PER_SEC * dt) / 1000);
      return Math.round(disp);
    },
    get effectiveTarget() { return eff; },
  };
}

export function trackingIsHigh(display: number, target: number): boolean {
  return target >= READY_MIN_PCT && display >= READY_MIN_PCT;
}
