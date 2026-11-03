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

// One muscle row's "+%": progress made toward its next tier today. A muscle
// still below Bronze has no tier info at all (see computeMuscleTiers), so its
// progress toward Bronze is this workout's own credited reps over Bronze's
// volume bar rather than a misleading "+0%".
function rowGainPct(m: Muscle, credit: number, before: MuscleTiers, after: MuscleTiers): number {
  const a = after[m];
  if (!a) return Math.min(100, (credit / BRONZE_MIN_VOLUME) * 100);
  return muscleGainPct(before[m], a);
}

export interface MuscleRanksPayload {
  rank: {
    has: boolean; atTop: boolean; tier: Tier | null; label: string; next: string;
    pct: number;            // progress toward `next`, 0-100 (one decimal)
    pctLabel: string;       // header text, e.g. "7.0% to Silver"
    gained: string;         // how much `pct` moved today, number text without "+"/"%"
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
  note: string;
  iconFor: (m: Muscle) => string | null;
  emblem: string | null;
}): MuscleRanksPayload {
  const { entries, tiersBefore, tiersAfter, standingBefore, standingAfter, labels, note, iconFor, emblem } = opts;
  const worked = workedMuscles(entries);

  const tier = standingAfter?.tier ?? null;
  const idx = tier ? tierIndex(tier) : -1;
  const nextTier: Tier = tier ? (idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : tier) : 'bronze';
  const meta = TIER_META[tier ?? 'bronze'];
  // The number at the top is the weakest-link standing (the same one the
  // Progress tab shows). "+X% today" is simply how far THAT number moved today,
  // from the same two standings, so the page can never disagree with itself.
  // (Rank-ups count: a move from Bronze 95% to Silver 3% is +8%.)
  const afterPct = standingAfter ? r1(standingAfter.progress * 100) : 0;
  const beforePct = standingBefore ? r1(standingBefore.progress * 100) : 0;
  const sameTier = !!standingBefore && !!standingAfter && standingBefore.tier === standingAfter.tier;
  const overallGain = standingAfter
    ? Math.max(0, r1(sameTier ? afterPct - beforePct : standingAbs(standingAfter) - standingAbs(standingBefore)))
    : 0;
  const nextLabel = cap(nextTier);
  const weakestName = standingAfter?.muscle ? (labels[standingAfter.muscle] ?? String(standingAfter.muscle)) : null;
  const trainedWeakest = !!standingAfter?.muscle && worked.some(w => w.muscle === standingAfter.muscle);
  const pctLabel = standingAfter?.atTop ? 'Top rank' : `${fmt1(afterPct)}% to ${nextLabel}`;
  // Beginner-plain explanation of every number above it.
  const explain = !standingAfter
    ? 'Keep training: every muscle needs a little more volume before you earn Bronze.'
    : standingAfter.atTop
      ? "You're at the top rank. Nothing left to climb."
      : standingBefore?.muscle && standingBefore.muscle !== standingAfter.muscle && overallGain > 0
        ? `Your rank follows your weakest muscle. Training ${labels[standingBefore.muscle] ?? 'it'} lifted it, so ${weakestName ?? 'another muscle'} (${fmt1(afterPct)}% of the way to ${nextLabel}) now sets your rank: +${fmt1(overallGain)}% today.`
      : trainedWeakest && overallGain > 0
        ? `Your rank follows your weakest muscle${weakestName ? ', ' + weakestName : ''}. It moved ${fmt1(beforePct)}% to ${fmt1(afterPct)}% of the way to ${nextLabel} today (+${fmt1(overallGain)}%).`
        : `Your rank follows your weakest muscle${weakestName ? ', ' + weakestName : ''}, at ${fmt1(afterPct)}% of the way to ${nextLabel}.${trainedWeakest ? '' : " You didn't train it today, so it stayed put."}`;

  // Two rows: the most-worked muscles, but if the weakest muscle (the one that
  // sets the rank) was trained it always gets a row, so the top number can be
  // traced to a visible muscle.
  let shownRows = worked.slice(0, 2);
  if (trainedWeakest && !shownRows.some(w => w.muscle === standingAfter!.muscle)) {
    shownRows = [shownRows[0], worked.find(w => w.muscle === standingAfter!.muscle)!].filter(Boolean);
  }

  return {
    rank: {
      has: !!tier,
      atTop: !!standingAfter?.atTop,
      tier,
      label: tier ? cap(tier) : 'Unranked',
      next: nextLabel,
      pct: afterPct,
      pctLabel,
      gained: fmt1(overallGain),
      hi: meta.hi, lo: meta.lo, ink: meta.ink,
      emblem,
    },
    note: explain,
    hits: shownRows.map(w => ({
      name: labels[w.muscle] ?? String(w.muscle),
      // The weakest muscle's row IS the number at the top, so it shows the very
      // same figure the header moved by; every other row is its own gain.
      gain: w.muscle === standingAfter?.muscle && trainedWeakest
        ? formatGain(overallGain)
        : formatGain(rowGainPct(w.muscle, w.credit, tiersBefore, tiersAfter)),
      icon: iconFor(w.muscle),
    })),
    bodyMap: bodyMapPairDataUri(worked.map(w => w.muscle)),
  };
}
