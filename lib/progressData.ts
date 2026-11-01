/**
 * lib/progressData.ts
 *
 * Pure (no React/RN) adapter: real app data -> the one JSON blob the Progress
 * tab's artboard reads from `window.__athltData` (see app/(tabs)/progress.tsx).
 * Nothing here invents numbers — an empty log produces empty arrays / null,
 * and the page renders its own empty states for those.
 */
import { Muscle } from '../constants/exercises';
import { TIER_META } from '../constants/tierPalette';
import {
  TIER_ORDER, VOLUME_THRESHOLDS, QUALITY_THRESHOLDS, tierIndex, groupIntoWorkouts, calcStreak,
  type SessionEntry, type MuscleTiers, type MuscleTierInfo, type Tier,
} from './sessionLog';
import { computeOverallStanding, MUSCLE_DISPLAY_ORDER } from '../components/MuscleTierMap';
import { bodyMapSvg } from './bodyMapSvg';
import type { WeightEntry } from './weightLog';

export const MUSCLE_LABEL: Record<Muscle, string> = {
  [Muscle.Chest]: 'Chest', [Muscle.Shoulders]: 'Shoulders', [Muscle.RearDelts]: 'Rear delts',
  [Muscle.Biceps]: 'Biceps', [Muscle.Triceps]: 'Triceps', [Muscle.Forearms]: 'Forearms',
  [Muscle.Lats]: 'Lats', [Muscle.Traps]: 'Traps', [Muscle.LowerBack]: 'Lower back',
  [Muscle.Abs]: 'Abs', [Muscle.Quads]: 'Quads', [Muscle.Hamstrings]: 'Hamstrings',
  [Muscle.Glutes]: 'Glutes', [Muscle.Calves]: 'Calves',
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// Same progress-to-next-tier math as MuscleTierMap's tileProgress (not exported there).
function tileProgress(info: MuscleTierInfo): number {
  const idx = tierIndex(info.tier);
  if (idx === TIER_ORDER.length - 1) return 1;
  const next = TIER_ORDER[idx + 1];
  const curVol = VOLUME_THRESHOLDS.find(([t]) => t === info.tier)![1];
  const nextVol = VOLUME_THRESHOLDS.find(([t]) => t === next)![1];
  const curQual = QUALITY_THRESHOLDS.find(([t]) => t === info.tier)![1];
  const nextQual = QUALITY_THRESHOLDS.find(([t]) => t === next)![1];
  return Math.min(
    clamp01((info.volume - curVol) / (nextVol - curVol)),
    clamp01((info.goodRatio - curQual) / (nextQual - curQual)),
  );
}

export interface ProgressData {
  rank: {
    has: boolean; tier: Tier | null; label: string; pct: number; nextLabel: string; atTop: boolean;
    streak: number; hi: string; lo: string; ink: string; emblem: string | null;
  };
  muscles: { key: string; icon: string | null; name: string; tier: Tier | null; label: string; pct: number; hi: string; lo: string; ink: string }[];
  weakest: string | null;
  bodyMap: { front: string; back: string };
  ladder: { name: string; tier: Tier; state: 'done' | 'you' | 'locked'; img: string | null }[];
  weight: { d: string; w: number }[];
  form: { ts: number; pct: number }[];
  bests: { name: string; value: string; unit: string; kind: 'streak' | 'form' | 'reps' }[];
  workouts: { ts: number; name: string; when: string; form: string; formPct: number | null; reps: number; sets: number; thumb: string | null }[];
  hasSessions: boolean;
  insets: { top: number; bottom: number };
  photos: PhotoView[];
}

/** A saved progress photo as the page needs it (thumb is a small data: URI, null if one couldn't be made). */
export interface PhotoView { id: string; ts: number; pose: 'front' | 'side' | 'back'; thumb: string | null; label: string }

const DAY_MS = 24 * 60 * 60 * 1000;
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayLabel(ts: number, now: number): string {
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const d1 = new Date(ts); d1.setHours(0, 0, 0, 0);
  const diff = Math.round((d0.getTime() - d1.getTime()) / DAY_MS);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return WD[d1.getDay()];
  return `${MON[d1.getMonth()]} ${d1.getDate()}`;
}

function longestStreak(sessions: SessionEntry[]): number {
  const days = Array.from(new Set(sessions.map(s => { const d = new Date(s.ts); d.setHours(0, 0, 0, 0); return d.getTime(); }))).sort((a, b) => a - b);
  let best = 0, run = 0, prev = -1;
  for (const d of days) {
    run = prev >= 0 && Math.round((d - prev) / DAY_MS) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

export function buildProgressData(
  sessions: SessionEntry[], tiers: MuscleTiers, weights: WeightEntry[], now: number = Date.now(),
  extras: { insets?: { top: number; bottom: number }; photos?: { id: string; ts: number; pose: 'front' | 'side' | 'back'; thumb: string | null }[] } = {},
): ProgressData {
  const standing = computeOverallStanding(tiers);
  const tier = standing?.tier ?? null;
  const idx = tier ? tierIndex(tier) : -1;
  const nextTier = tier ? (idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : tier) : 'bronze';
  const meta = TIER_META[tier ?? 'bronze'];

  // Only muscles that have icon art are listed (the same 11 the native rank grid shows); the
  // body map above still colours all 14 regions.
  const muscles = MUSCLE_DISPLAY_ORDER.map(m => {
    const info = tiers[m];
    const mm = TIER_META[info?.tier ?? 'bronze'];
    return {
      key: m, icon: null as string | null,
      name: MUSCLE_LABEL[m], tier: info ? info.tier : null,
      label: info ? cap(info.tier) : 'Unranked',
      pct: info ? Math.round(tileProgress(info) * 100) : 0,
      hi: mm.hi, lo: mm.lo, ink: mm.ink,
      _ord: info ? tierIndex(info.tier) * 2 + tileProgress(info) : -1,
    };
  }).sort((a, b) => b._ord - a._ord).map(({ _ord, ...rest }) => rest);

  // Weakest ranked muscle = where to focus next (only meaningful once 2+ are ranked).
  const ranked = muscles.filter(m => m.tier);
  const weakest = ranked.length >= 2 ? ranked[ranked.length - 1].name : null;

  const groups = groupIntoWorkouts(sessions); // newest first
  const workouts = groups.slice(0, 30).map(g => {
    const first = g.entries[0];
    const name = g.entries.length === 1 ? first.displayName : `${first.displayName} + ${g.entries.length - 1} more`;
    const scored = g.entries.some(e => e.formChecked !== false);
    return {
      ts: g.ts, name,
      when: `${dayLabel(g.ts, now)} · ${g.totalReps} reps`,
      form: scored ? `${g.pct}%` : '–',
      formPct: scored ? g.pct : null,
      reps: g.totalReps, sets: g.entries.length, thumb: null as string | null,
    };
  });

  const form = groups.filter(g => g.entries.some(e => e.formChecked !== false))
    .map(g => ({ ts: g.ts, pct: g.pct })).sort((a, b) => a.ts - b.ts);

  const bests: ProgressData['bests'] = [];
  if (sessions.length > 0) {
    const bs = longestStreak(sessions);
    bests.push({ name: 'Best streak', value: String(bs), unit: bs === 1 ? 'day' : 'days', kind: 'streak' });
    if (form.length > 0) bests.push({ name: 'Best form', value: String(Math.max(...form.map(f => f.pct))), unit: '%', kind: 'form' });
    bests.push({ name: 'Most reps', value: String(Math.max(...groups.map(g => g.totalReps))), unit: 'reps', kind: 'reps' });
  }

  return {
    rank: {
      has: !!tier, tier, label: tier ? cap(tier) : 'Unranked',
      pct: standing ? Math.round(standing.progress * 100) : 0,
      nextLabel: cap(nextTier), atTop: !!standing?.atTop,
      streak: calcStreak(sessions), hi: meta.hi, lo: meta.lo, ink: meta.ink, emblem: null,
    },
    muscles, weakest,
    bodyMap: { front: bodyMapSvg(tiers, 'front'), back: bodyMapSvg(tiers, 'back') },
    ladder: TIER_ORDER.map(t => ({
      name: cap(t), tier: t, img: null,
      state: !tier ? 'locked' : t === tier ? 'you' : tierIndex(t) < tierIndex(tier) ? 'done' : 'locked',
    })),
    weight: weights.map(w => ({ d: w.dateKey, w: w.weightLb })),
    form, bests, workouts, hasSessions: sessions.length > 0,
    insets: extras.insets ?? { top: 0, bottom: 0 },
    photos: (extras.photos ?? []).map(ph => {
      const d = new Date(ph.ts);
      return { ...ph, label: `${MON[d.getMonth()]} ${d.getDate()}` };
    }),
  };
}
