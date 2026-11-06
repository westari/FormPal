/**
 * lib/muscleRanksData.ts
 *
 * Pure adapter for the after-workout muscle page (assets/app screens/
 * muscleranks.html, shown by app/recap.tsx): real rank, real progress, the
 * muscles THIS workout actually trained with their real gain, and the real
 * body map. Nothing here is a placeholder — a muscle with no gain says +0%.
 *
 * No React/RN so scripts/test-muscle-ranks.js can run it under node.
 */
import { getExerciseDef, muscleCreditParts, Muscle } from '../constants/exercises';
import { TIER_META } from '../constants/tierPalette';
import {
  TIER_ORDER, VOLUME_THRESHOLDS, tierIndex, tierProgress,
  type SessionEntry, type MuscleTiers, type MuscleTierInfo, type Tier,
} from './sessionLog';
import { bodyMapPairDataUri } from './bodyMapSvg';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Same progress-to-next-tier math as the Progress tab's muscle rows (0-100). */
export function muscleProgressPct(info: MuscleTierInfo): number {
  return 100 * tierProgress(info); // the one implementation lives in lib/sessionLog.ts
}

// Progress as a single number that keeps rising across tiers, so a rank-up
// mid-workout still reads as a positive gain (100 per tier + progress).
function absolute(info: MuscleTierInfo | undefined): number {
  return info ? tierIndex(info.tier) * 100 + muscleProgressPct(info) : 0;
}

/** Percentage-point gain for one muscle across this workout (never negative). */
export function muscleGainPct(before: MuscleTierInfo | undefined, after: MuscleTierInfo | undefined): number {
  if (!after) return 0;
  return Math.max(0, absolute(after) - absolute(before));
}

export interface StandingLike { tier: Tier; progress: number; atTop: boolean; muscle?: Muscle }

function standingAbs(s: StandingLike | null): number {
  return s ? tierIndex(s.tier) * 100 + s.progress * 100 : 0;
}

// Every number on the muscle page is shown to ONE decimal, always, so the
// arithmetic on screen visibly adds up (6.3% -> 7.0% is +0.7%).
const r1 = (n: number) => Math.round(n * 10) / 10;
export const fmt1 = (n: number) => r1(n).toFixed(1);

/** "+12.0%", "+0.7%", "+0.0%". */
export function formatGain(pct: number): string {
  return `+${fmt1(Math.max(0, pct))}%`;
}

/** Muscles this workout trained, most-worked first (credit-weighted reps, as the rank system counts them). */
export function workedMuscles(entries: SessionEntry[]): { muscle: Muscle; credit: number }[] {
  const tally = new Map<Muscle, number>();
  for (const e of entries) {
    const def = getExerciseDef(e.exerciseId);
    if (!def) continue;
    for (const c of def.muscles) {
      const { muscle, weight } = muscleCreditParts(c);
      tally.set(muscle, (tally.get(muscle) ?? 0) + e.reps * weight);
    }
  }
  return [...tally.entries()]
    .filter(([, credit]) => credit > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([muscle, credit]) => ({ muscle, credit }));
}

const BRONZE_MIN_VOLUME = VOLUME_THRESHOLDS.find(([t]) => t === 'bronze')![1];

/**
 * How far one muscle is toward `target` (the NEXT rank of the overall rank), 0-100:
 *  - ranked at the overall tier: its own progress toward the next tier
 *  - already above the overall tier: 100 (it has nothing left to do for this rank)
 *  - not ranked yet (below Bronze): today's credited reps over Bronze's volume bar
 *    (only known for muscles trained today)
 */
function progressToward(info: MuscleTierInfo | undefined, overallTier: Tier | null, todayCredit: number): number {
  if (!info) return Math.min(100, (todayCredit / BRONZE_MIN_VOLUME) * 100);
  if (overallTier && tierIndex(info.tier) > tierIndex(overallTier)) return 100;
  return muscleProgressPct(info);
}

export interface MuscleRanksPayload {
  rank: {
    has: boolean; atTop: boolean; tier: Tier | null; label: string; next: string;
    pct: number;            // overall progress toward `next` AFTER today, 0-100 (one decimal)
    pctLabel: string;       // header text: only the newest number, e.g. "9.0%"
    gained: string;         // overall gain today (the change in the overall %), number text without "+"/"%"
    hi: string; lo: string; ink: string;
    emblem: string | null;
  };
  note: string;
  hits: { name: string; gain: string; icon: string | null }[];
  bodyMap: string;          // data: URI, only worked muscles coloured
}

export function buildMuscleRanksPayload(opts: {
  entries: SessionEntry[];
  tiersBefore: MuscleTiers;
  tiersAfter: MuscleTiers;
  standingBefore: StandingLike | null;
  standingAfter: StandingLike | null;
  labels: Record<string, string>;
  note?: string;
  iconFor: (m: Muscle) => string | null;
  emblem: string | null;
}): MuscleRanksPayload {
  const { entries, tiersBefore, tiersAfter, standingBefore, standingAfter, labels, iconFor, emblem } = opts;
  const worked = workedMuscles(entries);
  const credit = new Map(worked.map(w => [w.muscle, w.credit]));
  const name = (m: Muscle) => labels[m] ?? String(m);

  const tier = standingAfter?.tier ?? null;
  const idx = tier ? tierIndex(tier) : -1;
  const nextTier: Tier = tier ? (idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : tier) : 'bronze';
  const nextLabel = cap(nextTier);
  const meta = TIER_META[tier ?? 'bronze'];

  // ── The numbers, all from ONE per-muscle progress figure ───────────────────
  // Every muscle's progress is its OWN progress toward ITS next tier (0-100, the same math as the Progress
  // tab's muscle rows). It used to be measured toward the OVERALL next rank and capped at 100 for any muscle
  // already above the overall (weakest-link) tier, so training shoulders/triceps that were already past
  // Bronze could never show a gain: 100 before, 100 after, +0.0% (reported: "Bronze 53.2% -> 53.2%").
  //   MUSCLE ROW gain = that muscle's progress after - before (rank-ups count: tier*100 + progress), 0.1 steps
  //   OVERALL %       = computeOverallStanding().progress: the average own-progress over every ranked muscle, AFTER today (same on every screen)
  //   GAINED TODAY    = the SUM of the muscle rows' gains (the rows shown on the page add up to it exactly)
  const universe = new Set<Muscle>([...(Object.keys(tiersAfter) as Muscle[]), ...worked.map(w => w.muscle)]);
  // Not ranked yet (below Bronze): today's credited reps over Bronze's volume bar; before today there is nothing to see: 0.
  const progAfter = (m: Muscle) => (tiersAfter[m] ? muscleProgressPct(tiersAfter[m]!) : Math.min(100, ((credit.get(m) ?? 0) / BRONZE_MIN_VOLUME) * 100));
  const absAfter = (m: Muscle) => (tiersAfter[m] ? absolute(tiersAfter[m]) : progAfter(m));
  const progBefore = (m: Muscle) => (tiersBefore[m] ? muscleProgressPct(tiersBefore[m]!) : 0);
  const absBefore = (m: Muscle) => (tiersBefore[m] ? absolute(tiersBefore[m]) : 0);
  const muscles = [...universe];
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const avg = (f: (m: Muscle) => number) => (muscles.length ? muscles.reduce((a, m) => a + f(m), 0) / muscles.length : 0);
  const gainOf = (m: Muscle) => Math.max(0, r1(absAfter(m)) - r1(absBefore(m)));
  // The header % is THE overall rank % every screen shows (computeOverallStanding().progress); only a brand-new user with
  // no ranked muscle yet falls back to today's partial progress toward Bronze.
  const afterAvg = standingAfter && !standingAfter.atTop ? r1(standingAfter.progress * 100) : r1(avg(progAfter));
  const beforeAvg = r1(avg(progBefore));
  const rankedUp = !!standingBefore && !!standingAfter && standingBefore.tier !== standingAfter.tier;

  // Rows: EVERY muscle that gained today (most-worked first). If nothing gained (e.g. a rep-counter move that moves no
  // bar), the two most-worked muscles are shown at +0.0% so the card is never empty.
  const gainers = worked.filter(w => r1(gainOf(w.muscle)) > 0);
  const shown = gainers.length ? gainers : worked.slice(0, 2);
  const gains = shown.map(w => r1(gainOf(w.muscle)));
  // TODAY'S TOTAL = the sum of the gains shown in the rows (every muscle that gained), so +1.4 +1.4 +0.6 always read +3.4.
  const overallGain = r1(gains.reduce((a, g) => a + g, 0));

  // Header: ONLY the newest number (no "old -> new").
  const pctLabel = standingAfter?.atTop ? 'Top rank' : `${fmt1(afterAvg)}%`;

  // A short coach note: how the session went (passed in), then one plain line about the rank. No sums, no maths.
  const joined = shown.length <= 2
    ? shown.map(w => name(w.muscle)).join(' and ')
    : `${name(shown[0].muscle)}, ${name(shown[1].muscle)} and ${shown.length - 2} more`;
  const rankLine = standingAfter?.atTop
    ? "You're at the top rank. Keep your form clean to stay there."
    : rankedUp
      ? `You reached ${cap(tier ?? 'bronze')}. Nice work.`
      : gains.some(g => g > 0) && joined
        ? `${joined} moved up. ${nextLabel} is next.`
        : '';
  const explain = !standingAfter && !muscles.length
    ? 'Train a few more reps to start earning ranks.'
    : [opts.note, rankLine].filter(Boolean).join(' ');

  return {
    rank: {
      has: !!tier,
      atTop: !!standingAfter?.atTop,
      tier,
      label: tier ? cap(tier) : 'Unranked',
      next: nextLabel,
      pct: afterAvg,
      pctLabel,
      gained: fmt1(overallGain),
      hi: meta.hi, lo: meta.lo, ink: meta.ink,
      emblem,
    },
    note: explain,
    hits: shown.map((w, i) => ({
      name: name(w.muscle),
      gain: formatGain(gains[i]),
      icon: iconFor(w.muscle),
    })),
    bodyMap: bodyMapPairDataUri(worked.map(w => w.muscle)),
  };
}

// Exposed so the test can check every number independently.
export const _internals = { progressToward };
