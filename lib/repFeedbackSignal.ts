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
export const repFeedbackSignal = { finishedReview: false };
