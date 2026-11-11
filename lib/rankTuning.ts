/**
 * lib/rankTuning.ts
 *
 * EVERY tunable number of the rank system, in one place. lib/sessionLog.ts (computeMuscleTiers / tierProgress) reads these,
 * and every screen reads sessionLog.
 *
 * RANKS GO BY GOOD REPS, NOT BY WEEKS (2026-11-12):
 *  - Each muscle has its own good-rep total. A good rep adds its muscle credit (main muscle 1.0, helpers less, see
 *    constants/muscleWeights.ts). A rep with bad form adds nothing.
 *  - There is NO fading: a rep counts the same today and in a year. Resting never lowers a rank.
 *  - Each rank needs a fixed number of good reps to get to the next one, so every rep at that rank is worth a fixed number of
 *    percent. The numbers below are PLACEHOLDERS (first guesses, to be tuned from real use).
 *  - Everyone starts at Bronze 0%. There is no "Unranked". The first rank-up is Bronze -> Silver.
 *  - The OVERALL rank is not a rep count: it is built from the muscles (components/MuscleTierMap.tsx computeOverallStanding).
 *
 *   rank step            good reps   percent per rep
 *   Bronze   -> Silver        150        +0.67%
 *   Silver   -> Gold          500        +0.20%
 *   Gold     -> Platinum    1,200        +0.083%
 *   Platinum -> Diamond     2,500        +0.04%
 *   Diamond  -> Master      5,000        +0.02%
 *   Master   -> Champion   10,000        +0.01%
 *
 * Reps whose form cannot be checked (typed in by hand in Log a session, or rep-counter-only exercises) count at HALF credit,
 * so the camera stays the best way to rank up. Camera reps with good form count in full. (Ari's decision, 2026-11-11.)
 *
 * Run `node scripts/sim-rank-progress.js` for the reps table.
 */
import type { Tier } from './sessionLog';

/** Good reps (muscle credit) needed to go from each rank to the NEXT one. PLACEHOLDERS. */
export const REPS_TO_NEXT_RANK: { from: Tier; to: Tier; reps: number }[] = [
  { from: 'bronze',   to: 'silver',   reps: 150 },
  { from: 'silver',   to: 'gold',     reps: 500 },
  { from: 'gold',     to: 'platinum', reps: 1200 },
  { from: 'platinum', to: 'diamond',  reps: 2500 },
  { from: 'diamond',  to: 'master',   reps: 5000 },
  { from: 'master',   to: 'champion', reps: 10000 },
];

/** Percent of the next rank that ONE good rep (credit 1.0) adds while at each rank. Derived from the table above. */
export const PERCENT_PER_REP: Record<string, number> = Object.fromEntries(REPS_TO_NEXT_RANK.map(r => [r.from, 100 / r.reps]));

/** Total good reps (muscle credit) at which each rank STARTS, highest first (tierFromVolume expects that order). */
export const VOLUME_THRESHOLDS: [Tier, number][] = (() => {
  const out: [Tier, number][] = [['bronze', 0]];
  let total = 0;
  for (const r of REPS_TO_NEXT_RANK) { total += r.reps; out.push([r.to, total]); }
  return out.reverse();
})();

/**
 * A muscle counts toward the OVERALL rank once it has real training: this many good reps (Silver's bar). Without it, a muscle
 * that only gets a few helper reps (abs from push-ups) sits at Bronze for ever and holds the overall rank at Bronze for everyone.
 * Before any muscle has this much, the overall bar is the average of everything trained, so it moves from the first workout.
 */
export const OVERALL_MIN_VOLUME: number = VOLUME_THRESHOLDS.find(([t]) => t === 'silver')![1];

/**
 * How many logged exercises are kept. Ranks are computed from the whole log (no fading), so it must hold years.
 * PLACEHOLDER: ~6.4 years at 18 entries a week (about 0.8 MB of storage).
 */
export const MAX_LOG_ENTRIES = 6000;

/** Credit for a rep whose form was never checked (Log a session, rep counter only): half of a good camera rep. */
export const UNJUDGED_REP_CREDIT = 0.5;
