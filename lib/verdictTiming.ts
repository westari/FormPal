/**
 * lib/verdictTiming.ts
 *
 * WHEN a verdict lands (Ari 2026-11-25): a check (good rep) and a cross (half rep) must come at the SAME moment, when the rep is finished: the arms are back at the
 * start position. The engine reports a counted rep only after it has seen the arms come back (the exit line held for a few frames, plus the start-position gate
 * where the exercise has one), but it reports a half rep the moment the stroke TURNS at its shallow bottom (ExerciseEngine.finishAttempt), which is earlier by
 * the time the arms need to get back up. So the screen holds a half rep's cross until the metric is back in the start zone (or a short maximum wait, so a cross
 * can never be lost or stay stuck).
 *
 * The start zone is the top part of the way from the exit line to the exercise's own start value (topAngle). PLACEHOLDER numbers: 60% and 1.1 s.
 */
export const START_ZONE_FRACTION = 0.6;
export const CROSS_MAX_WAIT_MS = 1100;

export interface StartLines { topAngle: number; repExitThreshold: number }

/** The metric value that counts as "back at the start position". */
export function startLevel(d: StartLines): number { return d.repExitThreshold + START_ZONE_FRACTION * (d.topAngle - d.repExitThreshold); }

/** Is the metric (last reading) back in the start zone? Works whichever way the exercise's metric runs. */
export function backAtStart(value: number | null, d: StartLines): boolean {
  if (value === null || !isFinite(value)) return false;
  const lvl = startLevel(d);
  return d.topAngle >= d.repExitThreshold ? value >= lvl : value <= lvl;
}

export interface PendingCross { reason: string; at: number }

/** Is this held cross due now? why = the words for the log. */
export function crossDue(p: PendingCross, now: number, value: number | null, d: StartLines): { due: boolean; why: string } {
  if (backAtStart(value, d)) return { due: true, why: 'the arms are back at the start position' };
  if (now - p.at >= CROSS_MAX_WAIT_MS) return { due: true, why: `waited the most (${CROSS_MAX_WAIT_MS} ms)` };
  return { due: false, why: '' };
}
