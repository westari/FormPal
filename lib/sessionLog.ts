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
import { getExerciseDef, MuscleGroup } from '../constants/exercises';

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
