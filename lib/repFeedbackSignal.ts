/**
 * lib/repFeedbackSignal.ts
 *
 * Explicit ask: tapping "Finish review" on rep-feedback.tsx should land
 * you on the real after-workout ranks/bodymap screen (recap.tsx's
 * 'ranks' view — the already-working MuscleTierMap implementation, not a
 * placeholder), not just pop back to the summary card.
 *
 * recap.tsx stays mounted underneath rep-feedback.tsx the whole time
 * (it's a push, not a replace), so there's no route param path back to
 * it — this tiny module-level singleton is the simplest way to signal
 * "jump to ranks" across the two screens. rep-feedback.tsx sets the flag
 * right before router.back(); recap.tsx's existing onFocus check (it
 * already runs one, for navigatingToFeedback) reads and clears it.
 */
// openAllSets: "All sets" tapped on rep feedback — recap.tsx opens its All sets page on refocus.
export const repFeedbackSignal: {
  finishedReview: boolean;
  openAllSets: boolean;
  /** Set by recap.tsx while it is mounted: lets "Finish review" switch it to the muscle page right away,
   *  while the rep feedback page is still on screen, instead of waiting for the back transition to finish. */
  onFinishReview: (() => void) | null;
  /** Set by recap.tsx while it is mounted: "All sets" switches it to the All sets page right away, while the rep feedback page is still on screen. */
  onOpenAllSets: (() => void) | null;
  /** The rep the rep feedback was on when All sets was opened, so Back from All sets returns to that rep (not rep 1). */
  repIdx: number;
  /** Set by recap.tsx while mounted. A form check's Continue calls it first: the recap's own native video (it sits behind the warm page) is hidden and paused at once,
   *  so it cannot flash while the done screen fades away (Ari 2026-11-25: "it flashes the workout complete video screen, then the tab"). */
  onLeaveNow: (() => void) | null;
} = { finishedReview: false, openAllSets: false, onFinishReview: null, onOpenAllSets: null, repIdx: 0, onLeaveNow: null };
