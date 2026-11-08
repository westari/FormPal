/**
 * lib/progressData.ts
 *
 * Pure (no React/RN) adapter: real app data -> the one JSON blob the Progress
 * tab's artboard reads from `window.__athltData` (see app/(tabs)/progress.tsx).
 * Nothing here invents numbers — an empty log produces empty arrays / null,
 * and the page renders its own empty states for those.
 */
import { Muscle, getExerciseDef, muscleCreditParts } from '../constants/exercises';
import { TIER_META } from '../constants/tierPalette';
import {
  TIER_ORDER, tierIndex, tierProgress, muscleCreditTotals, belowBronzeProgress, groupIntoWorkouts, calcStreak,
  type SessionEntry, type MuscleTiers, type Tier,
} from './sessionLog';
import { computeOverallStanding, MUSCLE_DISPLAY_ORDER } from '../components/MuscleTierMap';
import { progressBodyMapSvg } from './progressBodyMap';
import type { WeightEntry } from './weightLog';

export const MUSCLE_LABEL: Record<Muscle, string> = {
  [Muscle.Chest]: 'Chest', [Muscle.Shoulders]: 'Shoulders', [Muscle.RearDelts]: 'Rear delts',
  [Muscle.Biceps]: 'Biceps', [Muscle.Triceps]: 'Triceps', [Muscle.Forearms]: 'Forearms',
  [Muscle.Lats]: 'Lats', [Muscle.Traps]: 'Traps', [Muscle.LowerBack]: 'Lower back',
  [Muscle.Abs]: 'Abs', [Muscle.Quads]: 'Quads', [Muscle.Hamstrings]: 'Hamstrings',
  [Muscle.Glutes]: 'Glutes', [Muscle.Calves]: 'Calves',
};

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

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
  workouts: { ts: number; name: string; when: string; form: string; formPct: number | null; reps: number; sets: number; thumb: string | null; muscle: string | null; fallback: string | null }[];
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

export function primaryMuscle(entries: SessionEntry[]): string | null {
  const tally = new Map<string, number>();
  for (const e of entries) {
    const def = getExerciseDef(e.exerciseId);
    if (!def) continue;
    for (const c of def.muscles) {
      const { muscle, weight } = muscleCreditParts(c);
      tally.set(muscle, (tally.get(muscle) ?? 0) + e.reps * weight);
    }
  }
  let best: string | null = null, bestV = 0;
  for (const [m, v] of tally) if (v > bestV) { best = m; bestV = v; }
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
  const credit = muscleCreditTotals(sessions);
  const muscles = MUSCLE_DISPLAY_ORDER.map(m => {
    const info = tiers[m];
    const mm = TIER_META[info?.tier ?? 'bronze'];
    // below Bronze: ALL the training this muscle has had, over Bronze's bar (shared rule, lib/sessionLog.ts)
    const toBronzeF = belowBronzeProgress(credit.get(m) ?? 0);
    const toBronze = Math.round(toBronzeF * 100);
    return {
      key: m, icon: null as string | null,
      name: MUSCLE_LABEL[m], tier: info ? info.tier : null,
      label: info ? cap(info.tier) : 'Unranked',
      pct: info ? Math.round(tierProgress(info) * 100) : toBronze,
      hi: mm.hi, lo: mm.lo, ink: mm.ink,
      _ord: info ? tierIndex(info.tier) * 2 + tierProgress(info) : -1 + toBronzeF / 10,
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
      // the muscle this workout worked most: its icon is the picture when no video frame exists
      muscle: primaryMuscle(g.entries), fallback: null as string | null,
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
    bodyMap: { front: progressBodyMapSvg(tiers, 'front'), back: progressBodyMapSvg(tiers, 'back') },
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
