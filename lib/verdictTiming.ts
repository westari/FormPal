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

/**
 * (Ari 2026-11-27) BARELY MOVING IS NOT A REP. The engine ends a stroke after a turn of only 15% of the rep range (ExerciseEngine.trackAttempt), so a small wobble at the
 * top right after a verdict (the arms settling, a little bounce) came out as a second "half rep" ("Go lower" twice for one rep, feedback while barely moving).
 * A stroke counts as a rep attempt only if it LEFT the start zone (the same start zone the held cross waits for). In the 2026-11-27 log the wobbles reached
 * 74.6 to 77.7 and every real half rep 52 to 69; the start zone for shoulder press begins at 73.6, between the two.
 */
export function leftStartZone(reached: number | null | undefined, d: StartLines): boolean {
  if (reached === null || reached === undefined || !isFinite(reached)) return true;   // no number: never drop a verdict on a guess
  return !backAtStart(reached, d);
}

/**
 * A half rep that went at least HALFWAY down from the start zone to the rep line (shoulder press: 61.8, between 73.6 and 50). Only such a stroke may get its cross
 * while Movement Match is low after a rest (Coach strokeOnPath): a resting wobble at the edge of the start zone (2026-11-13 log: dips to 70-72 while he stood at
 * 74) never does. 2026-11-27: the half rep after a 5 s rest reached 55.7.
 */
export function deepHalfRep(reached: number | null | undefined, d: StartLines & { repEnterThreshold: number }): boolean {
  if (reached === null || reached === undefined || !isFinite(reached)) return false;
  const mid = (startLevel(d) + d.repEnterThreshold) / 2;
  return d.topAngle >= d.repExitThreshold ? reached <= mid : reached >= mid;
}
