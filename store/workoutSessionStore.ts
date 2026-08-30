/**
 * store/workoutSessionStore.ts
 *
 * Manages an IN-PROGRESS workout session.
 * No persistence — a workout is transient. On app restart, session is lost
 * (acceptable: user would have to re-start anyway).
 *
 * Flow:
 *   startWorkout(workout)
 *   → [per exercise] completeExercise(id, reps, goodReps) OR skipCurrentExercise()
 *   → hasMoreExercises() → repeat OR finishWorkout() → WorkoutSummary
 *   → abortWorkout() at any time
 */

import { create } from 'zustand';
import type { Workout, PlannedExercise } from '../types/plan';
import type { RepEventData } from '../lib/sessionLog';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ExerciseResult {
  exerciseId:  string;
  displayName: string;
  reps:        number;
  goodReps:    number;
  formScore:   number;    // 0–100 (0 and ignored when formChecked === false)
  // false = a 'repCounter' exercise (exerciseDefinitions.ts `mode`): reps were
  // counted, form was not judged. Excluded from overallFormScore / totalGoodReps
  // in the summary and saved to the session log with formChecked:false.
  formChecked: boolean;
  skipped:     boolean;
  completed:   boolean;
  // Per-rep good/bad/cue breakdown, EPHEMERAL (this store is already
  // documented as non-persisted — see file header) — feeds recap.tsx's rep
  // breakdown section. Empty for a skipped exercise.
  repEvents:   RepEventData[];
}

export interface WorkoutSummary {
  workoutId:          string;
  splitLabel:         string;
  rationale:          string;
  startedAt:          number;   // Unix ms
  finishedAt:         number;   // Unix ms
  durationSeconds:    number;
  results:            ExerciseResult[];
  totalReps:          number;
  totalGoodReps:      number;
  overallFormScore:   number;   // 0–100 (weighted avg)
  exercisesCompleted: number;
  exercisesTotal:     number;
}

// ─── Internal session shape ───────────────────────────────────────────────────

interface WorkoutSession {
  workout:      Workout;
  startedAt:    number;
  results:      ExerciseResult[];  // same length as workout.exercises, tracks each
  currentIndex: number;            // index of the NEXT exercise to do
  summary:      WorkoutSummary | null;  // set when finishWorkout() is called
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface WorkoutSessionState {
  session: WorkoutSession | null;

  // ── Actions ──────────────────────────────────────────────────────────────
  /** Begin a new workout session (replaces any existing one). */
  startWorkout: (workout: Workout) => void;

  /** Record a completed exercise result and advance the index. `formChecked`
   *  false = a rep-counter exercise (reps only, form not judged). */
  completeExercise: (exerciseId: string, reps: number, goodReps: number, repEvents?: RepEventData[], formChecked?: boolean) => void;

  /** Mark the current exercise skipped and advance. */
  skipCurrentExercise: () => void;

  /** Compute + store the summary and return it. Call when workout is done. */
  finishWorkout: () => WorkoutSummary | null;

  /** Discard the session entirely (user abandoned). */
  abortWorkout: () => void;

  // ── Selectors ─────────────────────────────────────────────────────────────
  currentExercise:  () => PlannedExercise | null;
  hasMoreExercises: () => boolean;
  /** 0.0–1.0 filled fraction for the progress bar. */
  progressFraction: () => number;
  getSummary:       () => WorkoutSummary | null;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function computeSummary(session: WorkoutSession): WorkoutSummary {
  const completed    = session.results.filter(r => r.completed);
  const totalReps    = completed.reduce((a, r) => a + r.reps, 0);
  // Form % and "good reps" only reflect the exercises whose form was judged.
  const scored       = completed.filter(r => r.formChecked);
  const scoredReps   = scored.reduce((a, r) => a + r.reps, 0);
  const totalGood    = scored.reduce((a, r) => a + r.goodReps, 0);
  const overallScore = scoredReps > 0 ? Math.round((totalGood / scoredReps) * 100) : 0;
  const finishedAt   = Date.now();

  return {
    workoutId:          session.workout.id,
    splitLabel:         session.workout.splitLabel,
    rationale:          session.workout.rationale,
    startedAt:          session.startedAt,
    finishedAt,
    durationSeconds:    Math.round((finishedAt - session.startedAt) / 1000),
    results:            session.results,
    totalReps,
    totalGoodReps:      totalGood,
    overallFormScore:   overallScore,
    exercisesCompleted: completed.length,
    exercisesTotal:     session.workout.exercises.length,
  };
}

// ─── Store implementation ─────────────────────────────────────────────────────

export const useWorkoutSessionStore = create<WorkoutSessionState>()((set, get) => ({
  session: null,

  startWorkout: (workout: Workout) => {
    set({
      session: {
        workout,
        startedAt:    Date.now(),
        currentIndex: 0,
        summary:      null,
        results:      workout.exercises.map(ex => ({
          exerciseId:  ex.exerciseId,
          displayName: ex.displayName,
          reps:        0,
          goodReps:    0,
          formScore:   0,
          formChecked: true,
          skipped:     false,
          completed:   false,
          repEvents:   [],
        })),
      },
    });
  },

  completeExercise: (exerciseId: string, reps: number, goodReps: number, repEvents: RepEventData[] = [], formChecked = true) => {
    const { session } = get();
    if (!session) return;

    const idx = session.results.findIndex(r => r.exerciseId === exerciseId);
    if (idx === -1) return;

    const formScore = formChecked && reps > 0 ? Math.round((goodReps / reps) * 100) : 0;
    const updated   = [...session.results];
    updated[idx]    = { ...updated[idx], reps, goodReps, formScore, formChecked, completed: true, skipped: false, repEvents };

    set({
      session: {
        ...session,
        results:      updated,
        currentIndex: session.currentIndex + 1,
      },
    });
  },

  skipCurrentExercise: () => {
    const { session } = get();
    if (!session) return;
    const idx     = session.currentIndex;
    const updated = [...session.results];
    if (idx < updated.length) {
      updated[idx] = { ...updated[idx], skipped: true, completed: false };
    }
    set({ session: { ...session, results: updated, currentIndex: idx + 1 } });
  },

  finishWorkout: () => {
    const { session } = get();
    if (!session) return null;
    const summary = computeSummary(session);
    set({ session: { ...session, summary } });
    return summary;
  },

  abortWorkout: () => set({ session: null }),

  // Selectors ─────────────────────────────────────────────────────────────────

  currentExercise: () => {
    const { session } = get();
    if (!session) return null;
    return session.workout.exercises[session.currentIndex] ?? null;
  },

  hasMoreExercises: () => {
    const { session } = get();
    if (!session) return false;
    return session.currentIndex < session.workout.exercises.length;
  },

  progressFraction: () => {
    const { session } = get();
    if (!session || session.workout.exercises.length === 0) return 0;
    return session.currentIndex / session.workout.exercises.length;
  },

  getSummary: () => get().session?.summary ?? null,
}));
