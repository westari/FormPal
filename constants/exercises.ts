/**
 * constants/exercises.ts
 *
 * The PLAN SYSTEM's exercise catalog — form-checkable exercises only.
 * This is the single source of truth for what the generator can schedule.
 *
 * ADDING A NEW EXERCISE (when CV engine adds support):
 *   1. Add an entry to EXERCISE_CATALOG below.
 *   2. Give it id matching the CV engine's exercise type string.
 *   3. That's it — the generator, progression, and split logic all auto-pick it up.
 *
 * IDs MATCH the CV engine strings in modules/athlt-camera/src/index.ts:
 *   ExerciseType = 'squat' | 'curl' | 'pushup' | ...
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum MuscleGroup {
  Legs      = 'legs',
  Chest     = 'chest',
  Back      = 'back',
  Shoulders = 'shoulders',
  Arms      = 'arms',
  Core      = 'core',
}

// Which split bucket an exercise fills.
// An exercise can fill multiple (e.g. push-up = Upper + Push).
export enum SplitCategory {
  Upper = 'upper',
  Lower = 'lower',
  Push  = 'push',
  Pull  = 'pull',
}

export enum Difficulty {
  Beginner     = 'beginner',
  Intermediate = 'intermediate',
  Advanced     = 'advanced',
}

export enum Equipment {
  None      = 'none',        // bodyweight — always available
  Dumbbell  = 'dumbbell',
  Barbell   = 'barbell',
  Machine   = 'machine',
  Cable     = 'cable',
  PullupBar = 'pullup_bar',
}

// ─── Location → available equipment ──────────────────────────────────────────

export type Location = 'home' | 'gym' | 'outdoors';

export const LOCATION_EQUIPMENT: Record<Location, Equipment[]> = {
  home:     [Equipment.None, Equipment.Dumbbell],
  gym:      [Equipment.None, Equipment.Dumbbell, Equipment.Barbell,
             Equipment.Machine, Equipment.Cable, Equipment.PullupBar],
  outdoors: [Equipment.None, Equipment.PullupBar],
};

// ─── Thresholds for split selection ──────────────────────────────────────────

// We need at least this many exercises per bucket before we use that split.
// With < MIN exercises per bucket we gracefully fall back to full-body.
export const SPLIT_THRESHOLDS = {
  minPerBucket: 3,
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProgressionConfig {
  // Absolute rep range for this exercise (ceiling for progressive overload).
  repRange: [number, number];
  setRange: [number, number];
  // If defined, switch to this exercise id after maxing out reps + sets here.
  nextVariationId?: string;
}

export interface ExerciseDef {
  id:              string;          // must match CV engine ExerciseType
  displayName:     string;
  muscleGroups:    MuscleGroup[];
  splitCategories: SplitCategory[]; // which split bucket(s) this fills
  difficulty:      Difficulty;
  equipment:       Equipment[];     // what's required (empty = bodyweight only)
  defaultReps:     number;
  defaultSets:     number;
  progression:     ProgressionConfig;
  isFormCheckable: true;            // all entries in this catalog must be form-checkable
}

// ─── Catalog ─────────────────────────────────────────────────────────────────
//
// Currently: squat, curl, pushup (the 3 exercises our CV engine supports).
// ↓ ADD NEW EXERCISES HERE as the CV engine gains support for them.

export const EXERCISE_CATALOG: ExerciseDef[] = [
  {
    id:              'squat',
    displayName:     'Bodyweight Squat',
    muscleGroups:    [MuscleGroup.Legs],
    splitCategories: [SplitCategory.Lower],
    difficulty:      Difficulty.Beginner,
    equipment:       [],             // bodyweight — no equipment
    defaultReps:     10,
    defaultSets:     3,
    progression: {
      repRange: [8, 20],
      setRange: [2, 5],
      // nextVariationId: 'pistol_squat'  — add when CV supports it
    },
    isFormCheckable: true,
  },
  {
    id:              'pushup',
    displayName:     'Push-up',
    muscleGroups:    [MuscleGroup.Chest, MuscleGroup.Shoulders, MuscleGroup.Arms],
    splitCategories: [SplitCategory.Upper, SplitCategory.Push],
    difficulty:      Difficulty.Beginner,
    equipment:       [],
    defaultReps:     8,
    defaultSets:     3,
    progression: {
      repRange: [5, 20],
      setRange: [2, 5],
      // nextVariationId: 'diamond_pushup'  — add when CV supports it
    },
    isFormCheckable: true,
  },
  {
    id:              'curl',
    displayName:     'Bicep Curl',
    muscleGroups:    [MuscleGroup.Arms, MuscleGroup.Back],
    splitCategories: [SplitCategory.Upper, SplitCategory.Pull],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.Dumbbell],
    defaultReps:     10,
    defaultSets:     3,
    progression: {
      repRange: [8, 15],
      setRange: [2, 4],
      // nextVariationId: 'hammer_curl'  — add when CV supports it
    },
    isFormCheckable: true,
  },

  {
    id:              'lunge',
    displayName:     'Lunge',
    muscleGroups:    [MuscleGroup.Legs],
    splitCategories: [SplitCategory.Lower],
    difficulty:      Difficulty.Beginner,
    equipment:       [],
    defaultReps:     10,
    defaultSets:     3,
    progression: {
      repRange: [8, 20],
      setRange: [2, 5],
    },
    isFormCheckable: true,
  },
  {
    id:              'shoulderPress',
    displayName:     'Shoulder Press',
    muscleGroups:    [MuscleGroup.Shoulders, MuscleGroup.Arms],
    splitCategories: [SplitCategory.Upper, SplitCategory.Push],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.Dumbbell],
    defaultReps:     8,
    defaultSets:     3,
    progression: {
      repRange: [6, 15],
      setRange: [2, 4],
    },
    isFormCheckable: true,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ADD NEW FORM-CHECKABLE EXERCISES HERE.
  // ─────────────────────────────────────────────────────────────────────────
];

// Quick lookup by id
export function getExerciseDef(id: string): ExerciseDef | undefined {
  return EXERCISE_CATALOG.find(e => e.id === id);
}
