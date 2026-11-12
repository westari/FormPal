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
import { VOLUME_THRESHOLDS, MAX_LOG_ENTRIES, UNJUDGED_REP_CREDIT } from './rankTuning';

// The tunable numbers live in lib/rankTuning.ts (all placeholders); re-exported so every existing import keeps working.
export { VOLUME_THRESHOLDS };

export const SESSION_LOG_KEY = 'formpal_session_log';
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionEntry {
  ts:          number; // epoch ms — shared across every exercise in the same workout
  exerciseId:  string;
  displayName: string;
  reps:        number;
  goodReps:    number;
  pct:         number; // 0-100 form score for this exercise (meaningless when formChecked === false)
  // false = a 'repCounter' exercise (see exerciseDefinitions.ts's `mode`): reps
  // were counted but form was NOT judged. Such entries contribute VOLUME to
  // muscle ranks but never a quality score, and are excluded from every
  // form-score aggregate. Omitted/true on every pre-existing entry (back-compat).
  formChecked?: boolean;
  // true = typed in by hand in Log a session (never recorded with the camera). Older hand-logged entries have no flag: see isManualEntry.
  manual?: boolean;
}

/** A session the user typed in (new entries carry manual: true; older ones are recognised by the way they were written: no form judged, no good reps, no score). */
export function isManualEntry(e: SessionEntry): boolean {
  return e.manual === true || (e.formChecked === false && (e.goodReps ?? 0) === 0 && (e.pct ?? 0) === 0);
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
      formChecked: e.formChecked ?? true,
      ...(e.manual ? { manual: true } : {}),
    }));
  } catch {
    return [];
  }
}

// EVERY write to the session log says where it came from (device logs: `[SESSION-WRITE] source=...`), and a write that is already in
// the log (same time, exercise and reps) is dropped, so a screen that mounts twice can never add the same session twice. The only
// callers are: the camera/workout recap ('recap-workout' / 'recap-camera') and the user pressing Save session ('log-session').
// Nothing else (no replay, no test data, no attempt detector) writes here.
export async function appendSessions(entries: SessionEntry[], source: string = 'unknown'): Promise<void> {
  if (entries.length === 0) return;
  try {
    const existing = await getAllSessions();
    const have = new Set(existing.map(e => `${e.ts}|${e.exerciseId}|${e.reps}`));
    const fresh = entries.filter(e => !have.has(`${e.ts}|${e.exerciseId}|${e.reps}`));
    console.log(`[SESSION-WRITE] source=${source} entries=${entries.length} new=${fresh.length} :: ` + entries.map(e => `${e.displayName} x${e.reps}`).join(', '));
    if (fresh.length === 0) return;
    const log = [...existing, ...fresh];
    if (log.length > MAX_LOG_ENTRIES) log.splice(0, log.length - MAX_LOG_ENTRIES);
    await AsyncStorage.setItem(SESSION_LOG_KEY, JSON.stringify(log));
  } catch {}
}

/** Remove one workout (every exercise saved with this ts) from the log. Returns how many entries went. */
export async function removeWorkoutSessions(ts: number): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_LOG_KEY);
    if (!raw) return 0;
    const all = JSON.parse(raw) as { ts?: number }[];
    const keep = all.filter(e => e.ts !== ts);
    if (keep.length === all.length) return 0;
    await AsyncStorage.setItem(SESSION_LOG_KEY, JSON.stringify(keep));
    console.log(`[SESSION-REMOVE] workout ${ts}: removed ${all.length - keep.length} entries`);
    return all.length - keep.length;
  } catch { return 0; }
}

// ─── Workout grouping ─────────────────────────────────────────────────────────
// Every exercise completed in the same workout is saved with the SAME ts (see
// app/recap.tsx), so grouping by exact ts reconstructs "one workout" without
// needing a separate workoutId field.

// Only the entries whose form was actually judged — the set every form-score
// aggregate (trend charts, "best form", weighted %) should run over. A
// 'repCounter' exercise's reps still count as training volume elsewhere, but
// its pct is meaningless and must never enter a score average.
export function scoredSessions(sessions: SessionEntry[]): SessionEntry[] {
  return sessions.filter(e => e.formChecked !== false);
}

// Consecutive-day streak (today or yesterday counts as "still going", so a
// session logged first thing this morning doesn't read as streak-broken
// before the user has had a chance to train today). Single source of truth —
// previously duplicated as a local function in app/(tabs)/progress.tsx.
export function calcStreak(sessions: SessionEntry[]): number {
  if (sessions.length === 0) return 0;
  const daySet = new Set(sessions.map(s => {
    const d = new Date(s.ts); d.setHours(0, 0, 0, 0); return d.getTime();
  }));
  const todayMs = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
  const startDay = daySet.has(todayMs) ? todayMs : todayMs - DAY_MS;
  if (!daySet.has(startDay)) return 0;
  let streak = 0; let check = startDay;
  while (daySet.has(check)) { streak++; check -= DAY_MS; }
  return streak;
}

export function groupIntoWorkouts(sessions: SessionEntry[]): WorkoutGroup[] {
  const byTs = new Map<number, SessionEntry[]>();
  for (const e of sessions) {
    const arr = byTs.get(e.ts) ?? [];
    arr.push(e);
    byTs.set(e.ts, arr);
  }
  return Array.from(byTs.entries())
    .map(([ts, entries]) => {
      // totalReps is real training volume — every rep, judged or not.
      const totalReps     = entries.reduce((a, e) => a + e.reps, 0);
      // The % and "good reps" only reflect exercises whose form was judged.
      const scored        = entries.filter(e => e.formChecked !== false);
      const scoredReps    = scored.reduce((a, e) => a + e.reps, 0);
      const totalGoodReps = scored.reduce((a, e) => a + e.goodReps, 0);
      const pct           = scoredReps > 0 ? Math.round((totalGoodReps / scoredReps) * 100) : 0;
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

// Rank numbers (good reps needed per rank): see lib/rankTuning.ts (placeholders, with the reasoning).

function tierFromVolume(v: number): Tier {
  for (const [tier, min] of VOLUME_THRESHOLDS) if (v >= min) return tier;
  return 'bronze'; // there is no "Unranked": everyone starts at Bronze 0%
}

export interface MuscleTierInfo {
  tier:      Tier; // the rank from this muscle's good-rep total (no fading: resting never lowers it)
  peakTier:  Tier; // the highest rank ever reached; with no fading it always equals tier (kept for the "Peak" badge code)
  volume:    number; // good reps x muscle credit, all time, no fading
  goodRatio: number; // 0-1 good / judged reps over the whole log (information only: it no longer gates a rank)
  // false = this muscle has NO judged reps (rep-counter exercises only). Information only.
  qualityJudged?: boolean;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * THE ONE progress-to-the-next-tier number (0-1) for a muscle. Every screen that shows a muscle's % calls this (the
 * after-workout page, the rank map, the overall standing); do not re-implement it. It is simply the muscle's good reps
 * inside this rank over the reps this rank needs (REPS_TO_NEXT_RANK), so each good rep is worth a fixed percent per rank.
 */
export function tierProgress(info: MuscleTierInfo): number {
  const idx = tierIndex(info.tier);
  if (idx === TIER_ORDER.length - 1) return 1;
  const next = TIER_ORDER[idx + 1];
  const curVol  = VOLUME_THRESHOLDS.find(([t]) => t === info.tier)![1];
  const nextVol = VOLUME_THRESHOLDS.find(([t]) => t === next)![1];
  return clamp01((info.volume - curVol) / (nextVol - curVol));
}

/** Kept so older callers still compile. There is no "Unranked" any more (see rankTuning.ts): always 0, i.e. Bronze 0%. */
export function belowBronzeProgress(_totalCredit: number): number {
  return 0; // retired: there is no rank below Bronze (Bronze starts at 0 reps), so a muscle with no training sits at Bronze 0%
}

/** Credit-weighted reps per muscle over a set of sessions (every rep, judged or not, no decay). */
export function muscleCreditTotals(sessions: SessionEntry[]): Map<Muscle, number> {
  const out = new Map<Muscle, number>();
  for (const e of sessions) {
    const def = getExerciseDef(e.exerciseId);
    if (!def) continue;
    for (const c of def.muscles) {
      const { muscle, weight } = muscleCreditParts(c);
      out.set(muscle, (out.get(muscle) ?? 0) + e.reps * weight);
    }
  }
  return out;
}

// KEYED BY Muscle (individual muscle), not MuscleGroup, this round — a
// single "arms" or "legs" bucket can't drive separate biceps/triceps or
// quads/hamstrings/glutes rank tiles. MuscleGroup/muscleGroupsWorked above
// are untouched (still used by recap.tsx for something unrelated to
// ranking) — this is a parallel, more granular system, not a replacement.
export type MuscleTiers = Partial<Record<Muscle, MuscleTierInfo>>;

export function computeMuscleTiers(sessions: SessionEntry[]): MuscleTiers {
  // Per muscle: good reps x credit (the rank number), plus judged / good reps for the information-only goodRatio.
  // An entry whose form was never judged (rep counter only, typed in by hand) has no good or bad: its reps count at HALF credit.
  const acc = new Map<Muscle, { vol: number; qual: number; good: number }>();
  for (const s of sessions) {
    const def = getExerciseDef(s.exerciseId);
    if (!def) continue; // exerciseId missing/unknown: can't attribute muscles
    const judged = s.formChecked !== false;
    const goodReps = judged ? Math.max(0, Math.min(s.goodReps, s.reps)) : s.reps * UNJUDGED_REP_CREDIT; // form never checked: half credit
    for (const entry of def.muscles) {
      const { muscle: m, weight } = muscleCreditParts(entry);
      const a = acc.get(m) ?? { vol: 0, qual: 0, good: 0 };
      a.vol  += goodReps * weight;
      if (judged) { a.qual += s.reps * weight; a.good += goodReps * weight; }
      acc.set(m, a);
    }
  }
  const out: MuscleTiers = {};
  for (const [m, a] of acc) {
    const tier = tierFromVolume(a.vol);
    out[m] = { tier, peakTier: tier, volume: a.vol, goodRatio: a.qual > 0 ? a.good / a.qual : 0, qualityJudged: a.qual > 0 };
  }
  return out;
}
