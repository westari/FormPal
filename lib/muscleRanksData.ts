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
  return 100 * Math.min(
    clamp01((info.volume - curVol) / (nextVol - curVol)),
    clamp01((info.goodRatio - curQual) / (nextQual - curQual)),
  );
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

export interface StandingLike { tier: Tier; progress: number; atTop: boolean }

function standingAbs(s: StandingLike | null): number {
  return s ? tierIndex(s.tier) * 100 + s.progress * 100 : 0;
}

/** "+12%", "+0.4%", "+0%" — one decimal only when it would otherwise round to 0. */
export function formatGain(pct: number): string {
  if (pct <= 0) return '+0%';
  if (pct < 1) return `+${(Math.round(pct * 10) / 10).toFixed(1).replace(/\.0$/, '')}%`;
  return `+${Math.round(pct)}%`;
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
    pct: number;            // progress toward `next`, 0-100
    gained: string;         // overall gain today, number text without "+"/"%"
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
  const overallGain = Math.max(0, standingAbs(standingAfter) - standingAbs(standingBefore));

  const gainText = overallGain <= 0 ? '0' : overallGain < 1 ? (Math.round(overallGain * 10) / 10).toFixed(1) : String(Math.round(overallGain));

  return {
    rank: {
      has: !!tier,
      atTop: !!standingAfter?.atTop,
      tier,
      label: tier ? cap(tier) : 'Unranked',
      next: cap(nextTier),
      pct: standingAfter ? Math.round(standingAfter.progress * 100) : 0,
      gained: gainText,
      hi: meta.hi, lo: meta.lo, ink: meta.ink,
      emblem,
    },
    note,
    hits: worked.slice(0, 2).map(w => ({
      name: labels[w.muscle] ?? String(w.muscle),
      gain: formatGain(rowGainPct(w.muscle, w.credit, tiersBefore, tiersAfter)),
      icon: iconFor(w.muscle),
    })),
    bodyMap: bodyMapPairDataUri(worked.map(w => w.muscle)),
  };
}
