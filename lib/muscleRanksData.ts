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
  TIER_ORDER, VOLUME_THRESHOLDS, QUALITY_THRESHOLDS, tierIndex,
  type SessionEntry, type MuscleTiers, type MuscleTierInfo, type Tier,
} from './sessionLog';
import { bodyMapPairDataUri } from './bodyMapSvg';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Same progress-to-next-tier math as the Progress tab's muscle rows (0-100). */
export function muscleProgressPct(info: MuscleTierInfo): number {
  const idx = tierIndex(info.tier);
  if (idx === TIER_ORDER.length - 1) return 100;
  const next = TIER_ORDER[idx + 1];
  const curVol = VOLUME_THRESHOLDS.find(([t]) => t === info.tier)![1];
  const nextVol = VOLUME_THRESHOLDS.find(([t]) => t === next)![1];
  const curQual = QUALITY_THRESHOLDS.find(([t]) => t === info.tier)![1];
  const nextQual = QUALITY_THRESHOLDS.find(([t]) => t === next)![1];
  const vol = clamp01((info.volume - curVol) / (nextVol - curVol));
  // No judged reps (rep-counter exercises only) = no quality signal: volume alone, same as the tier.
  if (info.qualityJudged === false) return 100 * vol;
  return 100 * Math.min(vol, clamp01((info.goodRatio - curQual) / (nextQual - curQual)));
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
    pctLabel: string;       // header text, e.g. "7.0% → 9.0%" (before > after)
    gained: string;         // TOTAL gained today = sum of the muscle rows, number text without "+"/"%"
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

  // ── The three numbers, all from ONE per-muscle progress figure ─────────────
  // progress(m) = how far muscle m is toward the next rank (0-100).
  //   MUSCLE ROW gain  = progress(m) after - progress(m) before            (rounded to 0.1)
  //   TOTAL GAINED     = the SUM of the rows shown (so the page adds up exactly)
  //   OVERALL RANK %   = the AVERAGE of progress(m) over every muscle you have
  //                      trained (ranked muscles + today's muscles). It is shown
  //                      before > after and moves whenever ANY muscle gains.
  // Rank-up (every muscle reached the next tier) is handled by tier*100 + avg.
  const tierBefore = standingBefore?.tier ?? tier;
  const universe = new Set<Muscle>([...(Object.keys(tiersAfter) as Muscle[]), ...worked.map(w => w.muscle)]);
  const prog = (m: Muscle, t: MuscleTiers, ot: Tier | null, today: number) => progressToward(t[m], ot, today);
  const progAfter = (m: Muscle) => prog(m, tiersAfter, tier, credit.get(m) ?? 0);
  // Before today a muscle below Bronze had no progress we can see: 0.
  const progBefore = (m: Muscle) => (tiersBefore[m] ? prog(m, tiersBefore, tierBefore, 0) : 0);
  const muscles = [...universe];
  const avg = (f: (m: Muscle) => number) => (muscles.length ? muscles.reduce((a, m) => a + f(m), 0) / muscles.length : 0);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const afterAvg = r1(avg(progAfter));
  const beforeAvg = r1(avg(progBefore));
  const rankedUp = !!standingBefore && !!standingAfter && standingBefore.tier !== standingAfter.tier;
  const absAfter = (tier ? tierIndex(tier) * 100 : 0) + afterAvg;
  const absBefore = (tierBefore ? tierIndex(tierBefore) * 100 : 0) + beforeAvg;

  // Rows: the two most-worked muscles.
  const shown = worked.slice(0, 2);
  const rowGain = (m: Muscle) => Math.max(0, r1(progAfter(m)) - r1(progBefore(m)));
  const gains = shown.map(w => r1(rowGain(w.muscle)));
  const total = r1(gains.reduce((a, b) => a + b, 0));

  const pctLabel = standingAfter?.atTop
    ? 'Top rank'
    : rankedUp
      ? `${fmt1(beforeAvg)}% → ${fmt1(afterAvg)}% to ${nextLabel}`
      : `${fmt1(beforeAvg)}% → ${fmt1(afterAvg)}%`;

  // Beginner-plain note: the sum, then what the overall number is.
  const sumText = shown.length
    ? `${shown.map((w, i) => `${name(w.muscle)} +${fmt1(gains[i])}%`).join(' + ')} = +${fmt1(total)}%`
    : '';
  const moreMuscles = worked.length > shown.length;
  const explain = !standingAfter && !muscles.length
    ? 'Train a few more reps to start earning ranks.'
    : standingAfter?.atTop
      ? "You're at the top rank. Nothing left to climb."
      : `Total gained today: ${sumText || '+0.0%'}${moreMuscles ? ' (top 2 muscles)' : ''}. `
        + `Overall ${tier ? cap(tier) : 'rank'} = the average of your ${muscles.length} trained muscle${muscles.length === 1 ? '' : 's'} on the way to ${nextLabel}: ${fmt1(beforeAvg)}% → ${fmt1(afterAvg)}%.`;

  return {
    rank: {
      has: !!tier,
      atTop: !!standingAfter?.atTop,
      tier,
      label: tier ? cap(tier) : 'Unranked',
      next: nextLabel,
      pct: afterAvg,
      pctLabel,
      gained: fmt1(total),
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
