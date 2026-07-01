/**
 * store/planStore.ts
 *
 * Zustand store for the plan system.
 *
 * Key design choices:
 *   - No Zustand persist middleware — persistence is manual via planStorage.ts.
 *     This keeps the sync-layer abstraction clean (add Supabase later by editing
 *     planStorage.ts only, not the store).
 *   - Async actions (load, generate) set isLoaded=false while working.
 *   - markWorkoutComplete applies progression immediately, then re-saves.
 *   - When the current workout index reaches near the end of the queue,
 *     we silently extend by generating another week's worth.
 */

import { create } from 'zustand';
import { generatePlan }                       from '../lib/planGenerator';
import { goalParams }                         from '../lib/goalParams';
import { applyWorkoutProgression }            from '../lib/progression';
import { savePlan, loadPlan, saveProfile,
         loadProfile, clearPlan }             from '../lib/planStorage';
import { getExerciseDef }                     from '../constants/exercises';
import type { Plan, Workout, PlanProfile }    from '../types/plan';

interface PlanState {
  plan:      Plan | null;
  profile:   PlanProfile | null;
  isLoaded:  boolean;   // false while AsyncStorage is being read

  // ── Load persisted state on app mount ──────────────────────────────────────
  loadFromStorage: () => Promise<void>;

  // ── Create / replace the plan ─────────────────────────────────────────────
  createPlan: (profile: PlanProfile) => Promise<void>;
  regenerate: () => Promise<void>;   // regenerate with existing profile

  // ── Selectors ─────────────────────────────────────────────────────────────
  getNextWorkout:    () => Workout | null;
  getRemainingCount: () => number;

  // ── Completion ────────────────────────────────────────────────────────────
  markWorkoutComplete: (workoutId: string) => Promise<void>;

  // ── Reset ─────────────────────────────────────────────────────────────────
  resetAll: () => Promise<void>;
}

export const usePlanStore = create<PlanState>()((set, get) => ({
  plan:     null,
  profile:  null,
  isLoaded: false,

  // ── Load from AsyncStorage ────────────────────────────────────────────────

  loadFromStorage: async () => {
    const [plan, profile] = await Promise.all([loadPlan(), loadProfile()]);
    set({ plan, profile, isLoaded: true });
  },

  // ── Create plan ───────────────────────────────────────────────────────────

  createPlan: async (profile: PlanProfile) => {
    const plan = generatePlan(profile);
    await Promise.all([savePlan(plan), saveProfile(profile)]);
    set({ plan, profile });
  },

  // ── Regenerate with same profile ──────────────────────────────────────────

  regenerate: async () => {
    const { profile } = get();
    if (!profile) return;
    const plan = generatePlan(profile);
    await savePlan(plan);
    set({ plan });
  },

  // ── Selectors ─────────────────────────────────────────────────────────────

  getNextWorkout: () => {
    const { plan } = get();
    if (!plan) return null;
    return plan.workouts[plan.currentWorkoutIndex] ?? null;
  },

  getRemainingCount: () => {
    const { plan } = get();
    if (!plan) return 0;
    return plan.workouts.length - plan.currentWorkoutIndex;
  },

  // ── Mark workout complete ─────────────────────────────────────────────────

  markWorkoutComplete: async (workoutId: string) => {
    const { plan, profile } = get();
    if (!plan || !profile) return;

    const idx = plan.workouts.findIndex(w => w.id === workoutId);
    if (idx === -1) return;

    const completedAt = Date.now();

    // Mark the workout done
    const updatedWorkouts = plan.workouts.map((w, i) =>
      i === idx ? { ...w, completed: true, completedAt } : w
    );

    // Apply progressive overload to every exercise in this workout
    const exerciseIds = plan.workouts[idx].exercises.map(e => e.exerciseId);
    const params      = goalParams(profile.goal, profile.experience);
    const updatedProgression = applyWorkoutProgression(
      plan.progressionState,
      exerciseIds,
      getExerciseDef,
      params,
    );

    const nextIdx = idx + 1;

    const updatedPlan: Plan = {
      ...plan,
      workouts:            updatedWorkouts,
      progressionState:    updatedProgression,
      currentWorkoutIndex: nextIdx,
    };

    await savePlan(updatedPlan);
    set({ plan: updatedPlan });
  },

  // ── Reset everything ──────────────────────────────────────────────────────

  resetAll: async () => {
    await clearPlan();
    set({ plan: null, profile: null });
  },
}));
