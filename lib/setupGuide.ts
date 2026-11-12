/**
 * lib/setupGuide.ts
 *
 * The setup line before "Ready. Go!", written for someone who has never used the app. ONE decision, so the words, the confidence
 * number and Go can never disagree:
 *
 *   fit    the camera cannot see you steadily yet. The line says the ONE thing to do ("Step into view", "Step back further")
 *   ready  everything the exercise needs is visible: "Hold still" for about a second, then Go
 *
 * THE RULE (Ari, 2026-11-12): Ready when every joint the exercise needs is clearly visible and he is steady for about 1 second.
 * No rehearsal rep first. The old gate also wanted the hands at the shoulders, a full reach to the top and back, a held pause and the
 * confidence meter reading high; in the 2026-11-12 log it never said Ready although he stood fully in frame with his arms out and the
 * native setup had passed: the meter was capped at 35 by the "fit" step and the reach to the top was never "seen". If the hands leave
 * the frame at the top later, the Guide handles it during the set ("Keep your hands in view").
 *
 * The confidence cap per stage keeps the big number honest: it only reads 100 once the stage is "ready".
 * ALL NUMBERS ARE PLACEHOLDERS (one real log).
 */
import { GUIDE_LINES } from './guideCoach';

export type SetupStage = 'fit' | 'ready';

export const SETUP_TUNING = {
  capFit: 35, capReady: 100,
};

export interface SetupInputs {
  now: number;
  healthy: boolean;            // metric samples are flowing, no pose gap, no unreliable rejection in the recent window
  seen: boolean;               // any metric sample at all
  frameHint: boolean;          // a "Step into frame" / "Can't see arms" style hint is showing, or no person
  /** the Guide line for the hint that is showing (lib/guideCoach.ts guideLine), if any */
  hintLine?: string | null;
  handsExercise: boolean;      // wording: hands vs whole body
  /** debug logging on: metric samples are expected, so none at all means the body is not tracked */
  expectSamples?: boolean;
}

export interface SetupDecision { stage: SetupStage; text: string; cap: number; ready: boolean }

export function createSetupGuide() {
  function update(i: SetupInputs): SetupDecision {
    const fitText = i.hintLine ?? (i.handsExercise ? GUIDE_LINES.backHands : GUIDE_LINES.backBody);
    const blind = i.expectSamples !== false && !i.seen;
    if (blind || (i.seen && !i.healthy) || i.frameHint) return { stage: 'fit', text: fitText, cap: SETUP_TUNING.capFit, ready: false };
    return { stage: 'ready', text: GUIDE_LINES.holdStill, cap: SETUP_TUNING.capReady, ready: true };
  }
  return { update, reset() { /* no state: every answer comes from the inputs */ } };
}
export type SetupGuide = ReturnType<typeof createSetupGuide>;
