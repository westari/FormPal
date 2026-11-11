/**
 * lib/rankTuning.ts
 *
 * EVERY tunable number of the rank system, in one place. Nothing else in the app has its own copy of a threshold,
 * half-life or log size: lib/sessionLog.ts (computeMuscleTiers / tierProgress) reads these, and every screen reads
 * sessionLog.
 *
 * !! PLACEHOLDERS !!  Every number in this file is a first guess, tuned with scripts/sim-rank-progress.js against an
 * imagined user (3 workouts a week, 30 reps per exercise, every muscle trained each workout). They are meant to be
 * re-tuned from real use. Change a number here, run `node scripts/sim-rank-progress.js --check`, read the table.
 *
 * THE SHAPE (what the numbers are for):
 *  - Progress is "decayed volume" (reps, each worth less as it ages). A constant training rate can never climb past
 *    rate x HALF_LIFE / ln2, so the top ranks sit close to that ceiling: only people who keep training hard for a
 *    long time get there, and a casual user's ceiling is simply lower (never too easy).
 *  - The gap between one rank and the next grows at every step (75, 385, 720, 980, 1190, 1350 reps between ranks), so the same 30 reps move the progress bar a lot at Bronze and only a little at Gold or Diamond: fast
 *    at the bottom, a slow grind at the top.
 *  - Good form is a second gate: the share of reps with good form must clear a bar that rises with every rank, so
 *    a high rank also means clean reps, not just a lot of them.
 */
import type { Tier } from './sessionLog';

/** How long until an unused rep is worth half. Long on purpose: a holiday should barely move a rank. PLACEHOLDER. */
export const DECAY_HALF_LIFE_DAYS = 240;

/**
 * 2026-11-11: Bronze moved from 50 to 150 (every higher tier moved up by 100, same gaps). 30 good reps on one muscle from Unranked
 * used to read +60% (Bronze at 50); it now reads +20% (30 of 150). A normal user (3 workouts a week, one 30-rep slot per muscle per
 * workout) reaches the first Bronze in 5 workouts, about 1.7 weeks. See `node scripts/sim-rank-progress.js` for the table.
 *
 * Decayed reps needed for each tier (PLACEHOLDERS). Highest first, as tierFromVolume expects.
 * A user training a muscle 3x a week (30 reps each) reaches Silver in week 2, Gold week 7, Platinum month 4, Diamond
 * month 8, Master month 16 and can never reach Champion (their ceiling, ~4450, is below it). Training 4x a week with
 * very clean form gets Champion in about 18 months. scripts/sim-rank-progress.js prints the exact table.
 */
export const VOLUME_THRESHOLDS: [Tier, number][] = [
  ['champion', 4850],
  ['master',   3500],
  ['diamond',  2310],
  ['platinum', 1330],
  ['gold',      610],
  ['silver',    225],
  ['bronze',    150],
];

/** Share of judged reps that must be good form for each tier (PLACEHOLDERS), highest first. */
export const QUALITY_THRESHOLDS: [Tier, number][] = [
  ['champion', 0.94],
  ['master',   0.88],
  ['diamond',  0.80],
  ['platinum', 0.72],
  ['gold',     0.62],
  ['silver',   0.50],
  ['bronze',   0],
];

/**
 * How many logged exercises are kept. It was 200, which at ~18 a week is only the last 11 weeks: older training fell
 * out of the log, so volume (and rank) could never climb past what 11 weeks can reach. Ranks are computed from the
 * whole log, so it must hold years. PLACEHOLDER: ~6.4 years at 18 entries a week (about 0.8 MB of storage).
 */
export const MAX_LOG_ENTRIES = 6000;
