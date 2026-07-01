/**
 * types/plan.ts
 *
 * All TypeScript types for the plan system.
 * These are the shapes that flow through generator → storage → store → UI.
 *
 * Supabase sync notes (for later):
 *   - Plan.id and Workout.id are string keys suitable as database primary keys.
 *   - progressionState is a flat Record — easy to upsert as individual rows.
 *   - planStorage.ts is the only layer that touches AsyncStorage;
 *     wrap it (don't replace it) to add Supabase mirroring later.
 */

import type { Location } from '../constants/exercises';

// ─── User plan-profile inputs ─────────────────────────────────────────────────

export type Goal       = 'strength' | 'toned' | 'general' | 'weightloss';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export { Location };

export interface PlanProfile {
  goal:        Goal;
  experience:  Experience;
  daysPerWeek: number;      // 1–7
  location:    Location;
}

// ─── Split structure ──────────────────────────────────────────────────────────

// Which split type was selected by the generator for this plan.
export type SplitType =
  | 'fullBody'      // current reality with ~3 exercises; graceful default
  | 'upperLower'    // 4+ days, needs >= 3 upper + 3 lower exercises in catalog
  | 'pushPullLegs'; // 6 days, needs >= 3 push + 3 pull + 3 lower in catalog

// ─── A single exercise slot in a workout ─────────────────────────────────────

export interface PlannedExercise {
  exerciseId:         string;   // matches ExerciseDef.id and CV engine ExerciseType
  displayName:        string;
  targetSets:         number;
  targetReps:         number;
  restSeconds:        number;
  currentVariationId: string;   // which variation is active (starts equal to exerciseId)
}

// ─── A single training session ────────────────────────────────────────────────

export interface Workout {
  id:            string;
  sessionNumber: number;   // 1-indexed position in the plan (for display: "Session 4")
  splitLabel:    string;   // e.g. "Full Body", "Upper Body", "Push Day"
  rationale:     string;   // short "why this workout" text shown to user for transparency
  exercises:     PlannedExercise[];
  completed:     boolean;
  completedAt?:  number;   // Unix ms
}

// ─── Per-exercise progression state ──────────────────────────────────────────

export interface ExerciseProgressionState {
  exerciseId:            string;
  currentVariationId:    string;   // may advance to nextVariationId over time
  currentReps:           number;
  currentSets:           number;
  sessionsAtCurrentLevel: number;  // how many completions at this exact reps/sets level
}

// ─── The full plan ────────────────────────────────────────────────────────────

export interface Plan {
  id:                   string;
  profile:              PlanProfile;
  splitType:            SplitType;
  workouts:             Workout[];   // ordered queue — currentWorkoutIndex points to next
  progressionState:     Record<string, ExerciseProgressionState>;  // keyed by exerciseId
  generatedAt:          number;      // Unix ms
  currentWorkoutIndex:  number;      // index into workouts[] for next uncompleted session
}
