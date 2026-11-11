/**
 * lib/setupGuide.ts
 *
 * The setup steps before "Ready. Go!", written for someone who has never used the app. ONE decision, from the same numbers, so
 * the words, the confidence number and Go can never disagree:
 *
 *   fit    "Step back so your raised hands show"     the camera cannot track you steadily yet (or a frame hint is up)
 *   start  "Hands at your shoulders"            you are tracked, but not in the starting position
 *   raise  "Raise both hands overhead"          (overhead exercises) the camera has not yet SEEN your full lockout
 *   lower  "Lower to your shoulders"            you reached lockout; come back to the start
 *   hold   "Hold still"                         everything is visible; being held steady (the existing steady timer)
 *   ready  Go may show
 *
 * Why the extra "raise" step: in the 2026-11-11 log "Ready / Go" fired with only the head (and garbage joints) in frame, then
 * the arms left the frame on the first press. The only per-frame signal the app has about the arms is the exercise's own
 * measured value, so Go now waits until that value has really travelled to the top (lockout) and back while tracking stayed
 * continuous. (The native build with the whole-body check, setupExtraJoints, adds wrists and hips; this works without it.)
 *
 * The confidence cap per stage is what keeps the big number honest: it can only read 100 once the stage is "ready".
 *
 * ALL NUMBERS ARE PLACEHOLDERS (one real log): lockout fraction, how long the start position must be held.
 */
export type SetupStage = 'fit' | 'start' | 'raise' | 'lower' | 'hold' | 'ready';

export const SETUP_TUNING = {
  lockoutFraction: 0.94,   // the value must reach this fraction of the exercise's top (84 -> 79; real lockouts read 82-89)
  rackBelowLockout: 8,      // "back at your shoulders" = the last 0.7s peaked at least this far under lockout
  holdMsAfterLockout: 1500, // after lockout and back at the start, hold this long (on top of the steady timer)
  capFit: 35, capStart: 60, capRaise: 70, capLower: 80, capHold: 92,
};

export interface SetupInputs {
  now: number;
  healthy: boolean;            // metric samples are flowing, no pose gap, no unreliable rejection in the recent window
  seen: boolean;               // any metric sample at all
  atStart: boolean;            // the value sits in the start zone
  value: number | null;        // latest measured value
  frameHint: boolean;          // "Step into frame" / "Can't see arms" style hint is showing, or no person
  steadyOk: boolean;           // the existing steady-tracking timer is satisfied
  needsLockout: boolean;       // overhead exercises
  topValue: number;            // the exercise's top reading (topAngle)
  handsExercise: boolean;      // wording: "hands" vs "body"
}

export interface SetupDecision { stage: SetupStage; text: string; cap: number; ready: boolean }

export function createSetupGuide() {
  let reachedAt = 0;
  let backAtStartSince = 0;
  const T = SETUP_TUNING;
  function update(i: SetupInputs): SetupDecision {
    const lockoutMin = i.topValue * T.lockoutFraction;
    const fitText = i.handsExercise ? 'Step back so your raised hands show' : 'Step back so your whole body shows';
    if (!i.seen || !i.healthy || i.frameHint) {
      // losing the person mid-setup (arms left the frame) forgets the lockout: it has to be seen again, in frame
      if (i.seen && !i.healthy) { reachedAt = 0; backAtStartSince = 0; }
      return { stage: 'fit', text: fitText, cap: T.capFit, ready: false };
    }
    if (i.needsLockout && !reachedAt && i.value !== null && i.value >= lockoutMin) reachedAt = i.now;
    if (i.needsLockout && !reachedAt) {
      return i.atStart
        ? { stage: 'raise', text: 'Raise both hands overhead', cap: T.capRaise, ready: false }
        : { stage: 'start', text: i.handsExercise ? 'Hands at your shoulders' : 'Get in position', cap: T.capStart, ready: false };
    }
    // back at the rack = the recent peak has come down from lockout (SETUP_TUNING.rackBelowLockout under it) and still reads as the start zone
    const down = !i.needsLockout || (i.value !== null && i.value <= lockoutMin - T.rackBelowLockout);
    if (!i.atStart || !down) { backAtStartSince = 0; return { stage: 'lower', text: i.needsLockout ? 'Lower to your shoulders' : 'Get in position', cap: T.capLower, ready: false }; }
    if (!backAtStartSince) backAtStartSince = i.now;
    const held = i.now - backAtStartSince >= (i.needsLockout ? T.holdMsAfterLockout : 0);
    if (!held || !i.steadyOk) return { stage: 'hold', text: 'Hold still', cap: T.capHold, ready: false };
    return { stage: 'ready', text: 'Ready', cap: 100, ready: true };
  }
  return { update, reset() { reachedAt = 0; backAtStartSince = 0; }, reached() { return reachedAt > 0; } };
}
export type SetupGuide = ReturnType<typeof createSetupGuide>;

/** Exercises whose Go needs the full top position seen first. */
export function needsLockout(exerciseId: string | undefined): boolean {
  return /press|overhead/i.test(exerciseId ?? '');
}
