/**
 * lib/sessionLog.ts
 *
 * Single source of truth for the local "formpal_session_log" — every completed
 * exercise (solo Quick Form Check or one slot inside a full Workout) writes one
 * SessionEntry here. This is what the progress-tab muscle heatmap, the
 * milestones/streak stats, and the recap screen's history mode all read from.
 *
 * Before this file existed, entries only stored {ts, reps, goodReps, pct} — no
 * exerciseId — so the muscle heatmap couldn't actually tell which muscles a
 * session trained; it faked an even spread across every catalog muscle group.
 * exerciseId/displayName are now required going forward; old entries missing
 * them still load (back-compat), they just can't contribute to the heatmap.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getExerciseDef, MuscleGroup, Muscle, muscleCreditParts } from '../constants/exercises';

export const SESSION_LOG_KEY = 'formpal_session_log';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LOG_ENTRIES = 200;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionEntry {
  ts:          number; // epoch ms — shared across every exercise in the same workout
  exerciseId:  string;
  displayName: string;
  reps:        number;
  goodReps:    number;
  pct:         number; // 0-100 form score for this exercise
}

// Per-rep good/bad + cue, EPHEMERAL only — never persisted into SessionEntry/
// AsyncStorage (would grow the log unboundedly). Flows solo mode: formcheck.tsx
// -> recap.tsx nav param. Workout mode: formcheck.tsx -> workout/run.tsx ->
// workoutSessionStore's transient ExerciseResult -> recap.tsx. Recap renders
// it as the per-rep good/bad breakdown; history mode has none since past
// sessions never captured it.
export interface RepEventData {
  timeSec: number;
  good:    boolean;
  reason:  string;
}

export interface WorkoutGroup {
  ts:            number;
  entries:       SessionEntry[];
  totalReps:     number;
  totalGoodReps: number;
  pct:           number; // 0-100 weighted across the whole group
}

export type MuscleScores = Partial<Record<MuscleGroup, number>>;

// ─── Storage ──────────────────────────────────────────────────────────────────

export async function getAllSessions(): Promise<SessionEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<SessionEntry>[];
    return parsed.map(e => ({
      ts:          e.ts ?? 0,
      exerciseId:  e.exerciseId ?? 'unknown',
      displayName: e.displayName ?? e.exerciseId ?? 'Exercise',
      reps:        e.reps ?? 0,
      goodReps:    e.goodReps ?? 0,
      pct:         e.pct ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function appendSessions(entries: SessionEntry[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    const existing = await getAllSessions();
    const log = [...existing, ...entries];
    if (log.length > MAX_LOG_ENTRIES) log.splice(0, log.length - MAX_LOG_ENTRIES);
    await AsyncStorage.setItem(SESSION_LOG_KEY, JSON.stringify(log));
  } catch {}
}

// ─── Workout grouping ─────────────────────────────────────────────────────────
// Every exercise completed in the same workout is saved with the SAME ts (see
// app/recap.tsx), so grouping by exact ts reconstructs "one workout" without
// needing a separate workoutId field.

export function groupIntoWorkouts(sessions: SessionEntry[]): WorkoutGroup[] {
  const byTs = new Map<number, SessionEntry[]>();
  for (const e of sessions) {
    const arr = byTs.get(e.ts) ?? [];
    arr.push(e);
    byTs.set(e.ts, arr);
  }
  return Array.from(byTs.entries())
    .map(([ts, entries]) => {
      const totalReps     = entries.reduce((a, e) => a + e.reps, 0);
      const totalGoodReps = entries.reduce((a, e) => a + e.goodReps, 0);
      const pct           = totalReps > 0 ? Math.round((totalGoodReps / totalReps) * 100) : 0;
      return { ts, entries, totalReps, totalGoodReps, pct };
    })
    .sort((a, b) => b.ts - a.ts);
}

// ─── Muscle-volume scoring ────────────────────────────────────────────────────
// Real per-exercise volume: each session's reps only count toward the muscle
// groups its OWN exercise actually trains (via EXERCISE_CATALOG), decayed by
// age (14-day half-life, same curve the old progress-tab hack used), then
// normalized 0..1 against the highest-volume muscle group.

function rawMuscleWeightedReps(sessions: SessionEntry[], now: number): Record<string, number> {
  const raw: Record<string, number> = {};
  for (const s of sessions) {
    const def = getExerciseDef(s.exerciseId);
    if (!def) continue; // exerciseId missing/unknown (old entry, or not in the plan catalog) — can't attribute muscles
    const ageDays = (now - s.ts) / DAY_MS;
    const weight  = s.reps * Math.exp((-ageDays * Math.LN2) / 14);
    for (const mg of def.muscleGroups) {
      raw[mg] = (raw[mg] ?? 0) + weight;
    }
  }
  return raw;
}

export function computeOverallMuscleScores(sessions: SessionEntry[]): MuscleScores {
  const raw = rawMuscleWeightedReps(sessions, Date.now());
  const max = Math.max(0, ...Object.values(raw));
  if (max === 0) return {};
  const out: MuscleScores = {};
  for (const mg of Object.keys(raw) as MuscleGroup[]) out[mg] = raw[mg] / max;
  return out;
}

// Which muscle groups a specific set of sessions (e.g. one workout) touches —
// unweighted by age/decay, since this answers "did I train this," not "how much."
export function muscleGroupsWorked(sessions: SessionEntry[]): Set<MuscleGroup> {
  const set = new Set<MuscleGroup>();
  for (const s of sessions) {
    const def = getExerciseDef(s.exerciseId);
    if (!def) continue;
    def.muscleGroups.forEach(mg => set.add(mg));
  }
  return set;
}

// ─── Muscle tiers (replaces the heatmap) ───────────────────────────────────
//
// A muscle's tier depends on BOTH how much it was trained AND how good the
// form was — deliberately, per the explicit ask: this app is the only one
// that can rank muscles by form quality (camera-verified reps), not just
// volume, and that's meant to be the actual point of the feature, not a
// side factor. A muscle reaches Diamond by being trained hard WITH good
// form; high volume alone caps out well short of it.
//
// Mechanism: compute a volume tier and a quality tier independently, take
// whichever is LOWER. So volume alone can get you to the door of a tier,
// but the good-rep ratio decides whether you actually walk through it.

export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master' | 'champion';

// EXTENDED (this round) — Bronze..Diamond alone had a low ceiling; added
// Master and Champion above Diamond for more progression room.
export const TIER_ORDER: Tier[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'champion'];

export function tierIndex(t: Tier): number { return TIER_ORDER.indexOf(t); }

// Decay half-life for the ACTIVE/current tier — was 14 days, which meant a
// single 2-week break cut decayed volume in half. Bumped to 120 days
// (~8.5x gentler) per explicit ask: "a vacation shouldn't tank someone" —
// a short break should barely move the active rank, only many weeks/months
// of real absence should. At H=120: a 2-week gap retains ~92% of value, a
// 1-month gap ~84%, a 3-month gap ~60%, a 6-month gap ~35%. This does NOT
// affect goodRatio (see computeMuscleTiers) — numerator and denominator
// decay identically, so their ratio is already decay-invariant between
// sessions regardless of half-life.
const DECAY_HALF_LIFE_DAYS = 120;

// Volume thresholds — decayed weighted rep count, ABSOLUTE (not relative to
// your own max — see the old comment this replaces for why).
//
// RETUNED this round to fix a real, provable bug: the old thresholds hit
// Platinum in ~1 month of normal training — way too fast for a "serious
// lifter" tier. Recalculated against the actual finite-time decay curve
// (V(T) = SS·(1 − 2^(−T/H)), where SS = dailyRate × H/ln2 is the steady-
// state ceiling a constant rate converges to) for a realistic reference
// user: one muscle trained 2x/week, ~30 good reps/session ≈ 8.57 reps/day
// → SS ≈ 1484 at H=120.
//
// The math has a real constraint worth being explicit about: at ANY fixed
// half-life, a CONSTANT training rate converges to its steady state within
// a few half-lives (~87% there by 3×H) — it can't keep climbing forever.
// So "Diamond in 8-12 months" isn't the reference rate's decay integral
// literally still rising at month 10 in isolation; it's calibrated so that
// EXACTLY the reference rate approaches these values only that slowly
// (this IS still real math, just closer to the asymptote than to zero —
// see the exact day-counts below), and reaching Platinum+ in practice means
// sustaining MORE than the bare reference rate, which is exactly the design
// goal (higher tiers require more/harder training, not just more calendar
// time at the same effort).
//
// Time-to-tier for the reference rate (8.57 reps/day, H=120 days):
//   Bronze    ~50    →  ~6 days     (first session or two)
//   Silver    ~230   →  ~29 days    (~1 month)
//   Gold      ~520   →  ~75 days    (~2.5 months)
//   Platinum  ~900   →  ~162 days   (~5.5 months)
//   Diamond   ~1200  →  ~287 days   (~9.5 months)
//   Master    ~1350  →  ~416 days   (~14 months)
//   Champion  ~1450  →  ~655 days   (~22 months, and only at PERFECT
//                        adherence — any real inconsistency pushes this
//                        further out or out of reach, matching "only the
//                        top 1-2% ever get there")
export const VOLUME_THRESHOLDS: [Tier, number][] = [
  ['champion', 1450],
  ['master',   1350],
  ['diamond',  1200],
  ['platinum',  900],
  ['gold',      520],
  ['silver',    230],
  ['bronze',     50],
];

// Good-rep ratio thresholds (0-1). Deliberately demanding at the top —
// Champion requires 99% good reps — since the whole premise of this feature
// is that a top rank should mean genuinely clean form, not just showing up.
export const QUALITY_THRESHOLDS: [Tier, number][] = [
  ['champion', 0.99],
  ['master',   0.97],
  ['diamond',  0.95],
  ['platinum', 0.85],
  ['gold',     0.70],
  ['silver',   0.50],
  ['bronze',   0],
];

function tierFromVolume(v: number): Tier | null {
  for (const [tier, min] of VOLUME_THRESHOLDS) if (v >= min) return tier;
  return null; // below even Bronze — not enough real training to rank at all
}

function tierFromQuality(q: number): Tier {
  for (const [tier, min] of QUALITY_THRESHOLDS) if (q >= min) return tier;
  return 'bronze';
}

export interface MuscleTierInfo {
  tier:      Tier; // ACTIVE rank — decays with inactivity (gentle, see DECAY_HALF_LIFE_DAYS), but floors at Bronze rather than disappearing once ever earned
  peakTier:  Tier; // PEAK rank — the highest tier this muscle has EVER reached, permanent, never decays. Display as a "Peak: X" badge alongside the active tier.
  volume:    number; // decayed weighted rep count (absolute, not normalized)
  goodRatio: number; // 0-1 — recency-weighted good/total, same decay applied to both
}

// KEYED BY Muscle (individual muscle), not MuscleGroup, this round — a
// single "arms" or "legs" bucket can't drive separate biceps/triceps or
// quads/hamstrings/glutes rank tiles. MuscleGroup/muscleGroupsWorked above
// are untouched (still used by recap.tsx for something unrelated to
// ranking) — this is a parallel, more granular system, not a replacement.
export type MuscleTiers = Partial<Record<Muscle, MuscleTierInfo>>;

export function computeMuscleTiers(sessions: SessionEntry[]): MuscleTiers {
  const now    = Date.now();
  const lambda = Math.LN2 / DECAY_HALF_LIFE_DAYS;

  // Group each session's per-muscle contribution (reps/goodReps scaled by
  // MuscleCredit weight — see that type's own comment) by muscle,
  // chronologically. Needed (not just the old single flat pass) so PEAK
  // tier can be derived below: An exercise's good-rep ratio applies to
  // every muscle it targets — SessionEntry only tracks form quality per
  // EXERCISE, not per muscle within it, so this is the honest granularity
  // available, not an approximation of something more precise we're
  // choosing not to show.
  const byMuscle = new Map<Muscle, { ts: number; reps: number; goodReps: number }[]>();
  for (const s of sessions) {
    const def = getExerciseDef(s.exerciseId);
    if (!def) continue; // exerciseId missing/unknown — can't attribute muscles
    for (const entry of def.muscles) {
      const { muscle: m, weight } = muscleCreditParts(entry);
      const arr = byMuscle.get(m) ?? [];
      arr.push({ ts: s.ts, reps: s.reps * weight, goodReps: s.goodReps * weight });
      byMuscle.set(m, arr);
    }
  }

  const out: MuscleTiers = {};
  for (const [m, entries] of byMuscle) {
    entries.sort((a, b) => a.ts - b.ts);
    let vol = 0, goodVol = 0;
    let lastTs = entries[0].ts;
    let peakTier: Tier | null = null;

    // Walk sessions chronologically. Decayed volume is at a LOCAL MAXIMUM
    // right after each session (it only shrinks between sessions, never
    // grows on its own), so evaluating the tier at each session's own
    // timestamp and tracking the running max gives the true all-time peak
    // in one forward pass — no need to replay day-by-day. goodRatio doesn't
    // even need decaying between sessions for this (see DECAY_HALF_LIFE_DAYS'
    // comment — it's decay-invariant), so this is exact, not approximated.
    for (const e of entries) {
      const gapDays = (e.ts - lastTs) / DAY_MS;
      const decay   = Math.exp(-lambda * gapDays);
      vol     = vol * decay + e.reps;
      goodVol = goodVol * decay + e.goodReps;
      lastTs  = e.ts;

      const volTier = tierFromVolume(vol);
      if (volTier) {
        const ratio     = vol > 0 ? goodVol / vol : 0;
        const qualTier  = tierFromQuality(ratio);
        const localTier = tierIndex(qualTier) < tierIndex(volTier) ? qualTier : volTier;
        if (!peakTier || tierIndex(localTier) > tierIndex(peakTier)) peakTier = localTier;
      }
    }

    if (!peakTier) continue; // never crossed Bronze, ever — not shown, not fabricated

    // Decay forward from the last session to now for the current/active value.
    const decayToNow = Math.exp(-lambda * (now - lastTs) / DAY_MS);
    vol     *= decayToNow;
    goodVol *= decayToNow;
    const goodRatio = vol > 0 ? goodVol / vol : 0;

    // Active tier floors at Bronze once ever earned — a long-enough absence
    // dulls the rank toward the bottom, it doesn't erase the muscle from
    // the map entirely. peakTier (above) is the permanent record of how
    // high it actually got.
    const rawVolTier  = tierFromVolume(vol);
    const currentTier = rawVolTier
      ? (tierIndex(tierFromQuality(goodRatio)) < tierIndex(rawVolTier) ? tierFromQuality(goodRatio) : rawVolTier)
      : 'bronze';

    out[m] = { tier: currentTier, peakTier, volume: vol, goodRatio };
  }
  return out;
}
