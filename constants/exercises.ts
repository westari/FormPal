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
 * Enforced at compile time now, not just documented — see the
 * _exerciseIdsRegisteredWithNativeBridge check near EXERCISE_CATALOG below.
 */

import type { ExerciseType } from '../modules/athlt-camera/src/index';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum MuscleGroup {
  Legs      = 'legs',
  Chest     = 'chest',
  Back      = 'back',
  Shoulders = 'shoulders',
  Arms      = 'arms',
  Core      = 'core',
}

// Individual-muscle taxonomy — ADDITIVE alongside MuscleGroup above, not a
// replacement. MuscleGroup/muscleGroups stays exactly as-is (still used by
// exercise-picker.tsx's subtitle text and left in place for anything else
// that reads the 6-bucket grouping); this finer-grained enum exists
// specifically for the muscle-rank system (lib/sessionLog.ts's
// computeMuscleTiers, components/MuscleTierMap.tsx), which needs to tell
// biceps from triceps and quads from hamstrings from glutes — a single
// "arms" or "legs" bucket can't drive 10+ distinct rank tiles.
//
// Values NOT anatomically exhaustive — scoped to what this app's exercise
// catalog can actually target and what the muscle-rank UI has (or will
// have) an icon for. RearDelts/Traps/LowerBack/Abs/Calves/Forearms are
// included for completeness even though no icon asset exists for them yet
// (see components/MuscleTierMap.tsx — those render via the existing
// real-path SVG icon as a fallback until dedicated art is supplied).
export enum Muscle {
  Chest      = 'chest',
  Shoulders  = 'shoulders',   // front deltoid
  RearDelts  = 'rearDelts',
  Biceps     = 'biceps',
  Triceps    = 'triceps',
  Forearms   = 'forearms',
  Lats       = 'lats',
  Traps      = 'traps',
  LowerBack  = 'lowerBack',
  Abs        = 'abs',
  Quads      = 'quads',
  Hamstrings = 'hamstrings',
  Glutes     = 'glutes',
  Calves     = 'calves',
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

// A plain Muscle gets full (1.0) credit — the common case. An exercise
// where a muscle is a real but lesser assist (e.g. biceps in a pulling
// movement) can instead give it a partial-credit object. Kept as a union
// rather than converting every entry to an object so the ~40 exercises
// that don't need this stay untouched plain Muscle[] literals.
export type MuscleCredit = Muscle | { muscle: Muscle; weight: number };

export function muscleCreditParts(entry: MuscleCredit): { muscle: Muscle; weight: number } {
  return typeof entry === 'object' ? entry : { muscle: entry, weight: 1 };
}

export interface ExerciseDef {
  id:              string;          // must match CV engine ExerciseType
  displayName:     string;
  muscleGroups:    MuscleGroup[];
  // Individual muscles this exercise targets, ordered primary → secondary.
  // See the Muscle enum's comment above for why this exists alongside
  // muscleGroups instead of replacing it. computeMuscleTiers (lib/
  // sessionLog.ts) reads each entry's weight via muscleCreditParts() —
  // "secondary" here isn't just documentation, it actually credits less.
  muscles:         MuscleCredit[];
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

export const EXERCISE_CATALOG = [
  {
    id:              'squat',
    displayName:     'Bodyweight Squat',
    muscleGroups:    [MuscleGroup.Legs],
    muscles:         [Muscle.Quads, Muscle.Glutes],
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
    muscles:         [Muscle.Chest, Muscle.Triceps, Muscle.Abs],
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
    muscles:         [Muscle.Biceps],
    splitCategories: [SplitCategory.Upper, SplitCategory.Pull],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.Dumbbell],
    defaultReps:     10,
    defaultSets:     3,
    progression: {
      repRange: [8, 15],
      setRange: [2, 4],
      nextVariationId: 'hammerCurl',
    },
    isFormCheckable: true,
  },
  {
    id:              'hammerCurl',
    displayName:     'Hammer Curl',
    muscleGroups:    [MuscleGroup.Arms, MuscleGroup.Back],
    muscles:         [Muscle.Biceps, Muscle.Forearms],
    splitCategories: [SplitCategory.Upper, SplitCategory.Pull],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.Dumbbell],
    defaultReps:     10,
    defaultSets:     3,
    progression: {
      repRange: [8, 15],
      setRange: [2, 4],
    },
    isFormCheckable: true,
  },
  {
    id:              'concentrationCurl',
    displayName:     'Concentration Curl',
    muscleGroups:    [MuscleGroup.Arms],
    muscles:         [Muscle.Biceps],
    splitCategories: [SplitCategory.Upper, SplitCategory.Pull],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.Dumbbell],
    defaultReps:     10,
    defaultSets:     3,
    progression: {
      repRange: [8, 15],
      setRange: [2, 4],
    },
    isFormCheckable: true,
  },
  {
    id:              'preacherCurl',
    displayName:     'Preacher Curl',
    muscleGroups:    [MuscleGroup.Arms],
    muscles:         [Muscle.Biceps],
    splitCategories: [SplitCategory.Upper, SplitCategory.Pull],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.Dumbbell],
    defaultReps:     10,
    defaultSets:     3,
    progression: {
      repRange: [8, 15],
      setRange: [2, 4],
    },
    isFormCheckable: true,
  },
  {
    id:              'reverseCurl',
    displayName:     'Reverse Curl',
    muscleGroups:    [MuscleGroup.Arms, MuscleGroup.Back],
    muscles:         [Muscle.Biceps, Muscle.Forearms],
    splitCategories: [SplitCategory.Upper, SplitCategory.Pull],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.Dumbbell],
    defaultReps:     10,
    defaultSets:     3,
    progression: {
      repRange: [8, 15],
      setRange: [2, 4],
    },
    isFormCheckable: true,
  },
  {
    id:              'cableCurl',
    displayName:     'Cable Curl',
    muscleGroups:    [MuscleGroup.Arms, MuscleGroup.Back],
    muscles:         [Muscle.Biceps],
    splitCategories: [SplitCategory.Upper, SplitCategory.Pull],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.Cable],
    defaultReps:     12,
    defaultSets:     3,
    progression: {
      repRange: [10, 20],
      setRange: [2, 4],
    },
    isFormCheckable: true,
  },

  {
    id:              'lunge',
    displayName:     'Lunge',
    muscleGroups:    [MuscleGroup.Legs],
    muscles:         [Muscle.Quads, Muscle.Glutes],
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
    muscles:         [Muscle.Shoulders, Muscle.Triceps],
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
  {
    id:              'chestPress',
    displayName:     'Chest Press',
    muscleGroups:    [MuscleGroup.Chest, MuscleGroup.Arms],
    muscles:         [Muscle.Chest, Muscle.Triceps],
    splitCategories: [SplitCategory.Upper, SplitCategory.Push],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.Dumbbell, Equipment.Barbell],
    defaultReps:     8,
    defaultSets:     3,
    progression: {
      repRange: [6, 15],
      setRange: [2, 4],
    },
    isFormCheckable: true,
  },
  // Barbell Bench Press — same tracked movement as chestPress (see
  // barbellBenchPress's own registration in exerciseDefinitions.ts for the
  // full trackability investigation), scoped to Barbell-only equipment and
  // Advanced difficulty (a flat barbell bench press carries real technique/
  // safety weight chestPress's generic dumbbell-or-barbell framing doesn't
  // specifically call out — no rack/spotter guidance exists in this app yet,
  // so defaulting to the more cautious difficulty tier here).
  {
    id:              'barbellBenchPress',
    displayName:     'Barbell Bench Press',
    muscleGroups:    [MuscleGroup.Chest, MuscleGroup.Arms],
    muscles:         [Muscle.Chest, Muscle.Triceps],
    splitCategories: [SplitCategory.Upper, SplitCategory.Push],
    difficulty:      Difficulty.Advanced,
    equipment:       [Equipment.Barbell],
    defaultReps:     6,
    defaultSets:     4,
    progression: {
      repRange: [4, 12],
      setRange: [3, 5],
    },
    isFormCheckable: true,
  },

  {
    id:              'jumpingJack',
    displayName:     'Jumping Jack',
    muscleGroups:    [MuscleGroup.Legs, MuscleGroup.Shoulders, MuscleGroup.Core],
    muscles:         [Muscle.Quads, Muscle.Calves, Muscle.Shoulders, Muscle.Abs],
    splitCategories: [SplitCategory.Upper, SplitCategory.Lower],
    difficulty:      Difficulty.Beginner,
    equipment:       [],
    defaultReps:     20,
    defaultSets:     3,
    progression: {
      repRange: [15, 50],
      setRange:  [2, 5],
    },
    isFormCheckable: true,
  },

  // ─── Squat-family variants ────────────────────────────────────────────────

  {
    id:              'gobletSquat',
    displayName:     'Goblet Squat',
    muscleGroups:    [MuscleGroup.Legs, MuscleGroup.Core],
    muscles:         [Muscle.Quads, Muscle.Glutes, Muscle.Abs],
    splitCategories: [SplitCategory.Lower],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.Dumbbell],
    defaultReps:     10,
    defaultSets:     3,
    progression:     { repRange: [8, 15], setRange: [2, 4] },
    isFormCheckable: true,
  },

  {
    id:              'airSquat',
    displayName:     'Air Squat',
    muscleGroups:    [MuscleGroup.Legs, MuscleGroup.Core],
    muscles:         [Muscle.Quads, Muscle.Glutes],
    splitCategories: [SplitCategory.Lower],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.None],
    defaultReps:     15,
    defaultSets:     3,
    progression:     { repRange: [10, 25], setRange: [2, 5] },
    isFormCheckable: true,
  },

  {
    id:              'frontSquat',
    displayName:     'Front Squat',
    muscleGroups:    [MuscleGroup.Legs, MuscleGroup.Core],
    muscles:         [Muscle.Quads, Muscle.Glutes, Muscle.Abs],
    splitCategories: [SplitCategory.Lower],
    difficulty:      Difficulty.Advanced,
    equipment:       [Equipment.Barbell],
    defaultReps:     6,
    defaultSets:     4,
    progression:     { repRange: [4, 10], setRange: [3, 5] },
    isFormCheckable: true,
  },

  {
    id:              'backSquat',
    displayName:     'Back Squat',
    muscleGroups:    [MuscleGroup.Legs, MuscleGroup.Core],
    muscles:         [Muscle.Quads, Muscle.Glutes],
    splitCategories: [SplitCategory.Lower],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.Barbell],
    defaultReps:     8,
    defaultSets:     4,
    progression:     { repRange: [4, 12], setRange: [3, 5] },
    isFormCheckable: true,
  },

  {
    id:              'sumoSquat',
    displayName:     'Sumo Squat',
    muscleGroups:    [MuscleGroup.Legs, MuscleGroup.Core],
    muscles:         [Muscle.Quads, Muscle.Glutes],
    splitCategories: [SplitCategory.Lower],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.Dumbbell],
    defaultReps:     10,
    defaultSets:     3,
    progression:     { repRange: [8, 15], setRange: [2, 4] },
    isFormCheckable: true,
  },

  // ─── Push-up-family variants ──────────────────────────────────────────────

  {
    id:              'kneePushup',
    displayName:     'Knee Push-up',
    muscleGroups:    [MuscleGroup.Chest, MuscleGroup.Arms, MuscleGroup.Core],
    muscles:         [Muscle.Chest, Muscle.Triceps, Muscle.Abs],
    splitCategories: [SplitCategory.Upper, SplitCategory.Push],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.None],
    defaultReps:     12,
    defaultSets:     3,
    progression:     { repRange: [8, 20], setRange: [2, 4] },
    isFormCheckable: true,
  },

  {
    id:              'inclinePushup',
    displayName:     'Incline Push-up',
    muscleGroups:    [MuscleGroup.Chest, MuscleGroup.Arms, MuscleGroup.Core],
    muscles:         [Muscle.Chest, Muscle.Triceps, Muscle.Abs],
    splitCategories: [SplitCategory.Upper, SplitCategory.Push],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.None],
    defaultReps:     12,
    defaultSets:     3,
    progression:     { repRange: [8, 20], setRange: [2, 4] },
    isFormCheckable: true,
  },

  {
    id:              'widePushup',
    displayName:     'Wide Push-up',
    muscleGroups:    [MuscleGroup.Chest, MuscleGroup.Arms, MuscleGroup.Core],
    muscles:         [Muscle.Chest, Muscle.Triceps, Muscle.Abs],
    splitCategories: [SplitCategory.Upper, SplitCategory.Push],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.None],
    defaultReps:     10,
    defaultSets:     3,
    progression:     { repRange: [8, 15], setRange: [2, 4] },
    isFormCheckable: true,
  },

  {
    id:              'diamondPushup',
    displayName:     'Diamond Push-up',
    muscleGroups:    [MuscleGroup.Chest, MuscleGroup.Arms, MuscleGroup.Core],
    muscles:         [Muscle.Triceps, Muscle.Chest, Muscle.Abs],
    splitCategories: [SplitCategory.Upper, SplitCategory.Push],
    difficulty:      Difficulty.Advanced,
    equipment:       [Equipment.None],
    defaultReps:     8,
    defaultSets:     3,
    progression:     { repRange: [5, 15], setRange: [2, 4] },
    isFormCheckable: true,
  },

  {
    id:              'declinePushup',
    displayName:     'Decline Push-up',
    muscleGroups:    [MuscleGroup.Chest, MuscleGroup.Arms, MuscleGroup.Core],
    muscles:         [Muscle.Chest, Muscle.Shoulders, Muscle.Triceps, Muscle.Abs],
    splitCategories: [SplitCategory.Upper, SplitCategory.Push],
    difficulty:      Difficulty.Advanced,
    equipment:       [Equipment.None],
    defaultReps:     8,
    defaultSets:     3,
    progression:     { repRange: [5, 15], setRange: [2, 4] },
    isFormCheckable: true,
  },

  // ─── Shoulder-press-family variants ──────────────────────────────────────

  {
    id:              'overheadPress',
    displayName:     'Overhead Press',
    muscleGroups:    [MuscleGroup.Shoulders, MuscleGroup.Arms],
    muscles:         [Muscle.Shoulders, Muscle.Triceps],
    splitCategories: [SplitCategory.Upper, SplitCategory.Push],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.Barbell],
    defaultReps:     6,
    defaultSets:     4,
    progression:     { repRange: [4, 10], setRange: [3, 5] },
    isFormCheckable: true,
  },

  {
    id:              'arnoldPress',
    displayName:     'Arnold Press',
    muscleGroups:    [MuscleGroup.Shoulders, MuscleGroup.Arms],
    muscles:         [Muscle.Shoulders, Muscle.Triceps],
    splitCategories: [SplitCategory.Upper, SplitCategory.Push],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.Dumbbell],
    defaultReps:     8,
    defaultSets:     3,
    progression:     { repRange: [6, 12], setRange: [2, 4] },
    isFormCheckable: true,
  },

  {
    id:              'dumbbellShoulderPress',
    displayName:     'Dumbbell Shoulder Press',
    muscleGroups:    [MuscleGroup.Shoulders, MuscleGroup.Arms],
    muscles:         [Muscle.Shoulders, Muscle.Triceps],
    splitCategories: [SplitCategory.Upper, SplitCategory.Push],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.Dumbbell],
    defaultReps:     10,
    defaultSets:     3,
    progression:     { repRange: [6, 15], setRange: [2, 4] },
    isFormCheckable: true,
  },

  {
    id:              'machineShoulderPress',
    displayName:     'Machine Shoulder Press',
    muscleGroups:    [MuscleGroup.Shoulders, MuscleGroup.Arms],
    muscles:         [Muscle.Shoulders, Muscle.Triceps],
    splitCategories: [SplitCategory.Upper, SplitCategory.Push],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.Machine],
    defaultReps:     10,
    defaultSets:     3,
    progression:     { repRange: [6, 15], setRange: [2, 4] },
    isFormCheckable: true,
  },

  // ─── Lunge-family variants ────────────────────────────────────────────────

  {
    id:              'splitSquat',
    displayName:     'Split Squat',
    muscleGroups:    [MuscleGroup.Legs, MuscleGroup.Core],
    muscles:         [Muscle.Quads, Muscle.Glutes],
    splitCategories: [SplitCategory.Lower],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.None],
    defaultReps:     10,
    defaultSets:     3,
    progression:     { repRange: [8, 15], setRange: [2, 4] },
    isFormCheckable: true,
  },

  {
    id:              'reverseLunge',
    displayName:     'Reverse Lunge',
    muscleGroups:    [MuscleGroup.Legs, MuscleGroup.Core],
    muscles:         [Muscle.Quads, Muscle.Glutes],
    splitCategories: [SplitCategory.Lower],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.None],
    defaultReps:     10,
    defaultSets:     3,
    progression:     { repRange: [8, 15], setRange: [2, 4] },
    isFormCheckable: true,
  },

  {
    id:              'stepUp',
    displayName:     'Step-up',
    muscleGroups:    [MuscleGroup.Legs, MuscleGroup.Core],
    muscles:         [Muscle.Quads, Muscle.Glutes],
    splitCategories: [SplitCategory.Lower],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.None],
    defaultReps:     10,
    defaultSets:     3,
    progression:     { repRange: [8, 15], setRange: [2, 4] },
    isFormCheckable: true,
  },

  {
    id:              'bulgarianSplitSquat',
    displayName:     'Bulgarian Split Squat',
    muscleGroups:    [MuscleGroup.Legs, MuscleGroup.Core],
    muscles:         [Muscle.Quads, Muscle.Glutes],
    splitCategories: [SplitCategory.Lower],
    difficulty:      Difficulty.Advanced,
    equipment:       [Equipment.None],
    defaultReps:     8,
    defaultSets:     3,
    progression:     { repRange: [6, 12], setRange: [3, 4] },
    isFormCheckable: true,
  },

  // ─── Close-grip push-up (push-up family) ─────────────────────────────────

  {
    id:              'closegripPushup',
    displayName:     'Close-grip Push-up',
    muscleGroups:    [MuscleGroup.Chest, MuscleGroup.Arms, MuscleGroup.Core],
    muscles:         [Muscle.Triceps, Muscle.Chest, Muscle.Abs],
    splitCategories: [SplitCategory.Upper, SplitCategory.Push],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.None],
    defaultReps:     8,
    defaultSets:     3,
    progression:     { repRange: [5, 15], setRange: [2, 4] },
    isFormCheckable: true,
  },

  // ─── Tricep-family variants ───────────────────────────────────────────────

  {
    id:              'tricepPushdown',
    displayName:     'Tricep Pushdown',
    muscleGroups:    [MuscleGroup.Arms],
    muscles:         [Muscle.Triceps],
    splitCategories: [SplitCategory.Upper, SplitCategory.Push],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.Cable],
    defaultReps:     12,
    defaultSets:     3,
    progression:     { repRange: [8, 20], setRange: [2, 4] },
    isFormCheckable: true,
  },

  {
    id:              'overheadTricepExtension',
    displayName:     'Overhead Tricep Extension',
    muscleGroups:    [MuscleGroup.Arms],
    muscles:         [Muscle.Triceps],
    splitCategories: [SplitCategory.Upper, SplitCategory.Push],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.Dumbbell],
    defaultReps:     10,
    defaultSets:     3,
    progression:     { repRange: [8, 15], setRange: [2, 4] },
    isFormCheckable: true,
  },

  {
    id:              'skullcrusher',
    displayName:     'Skullcrusher',
    muscleGroups:    [MuscleGroup.Arms],
    muscles:         [Muscle.Triceps],
    splitCategories: [SplitCategory.Upper, SplitCategory.Push],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.Barbell],
    defaultReps:     10,
    defaultSets:     3,
    progression:     { repRange: [6, 12], setRange: [3, 4] },
    isFormCheckable: true,
  },

  // ─── Row family ────────────────────────────────────────────────────────────

  {
    id:              'bentOverRow',
    displayName:     'Bent-Over Row',
    muscleGroups:    [MuscleGroup.Back],
    // Biceps is a real assist in any pulling movement, not a co-primary
    // mover the way lats/rear-delts are — WEIGHTED 0.45, see MuscleCredit's
    // comment. 0.45 is a reasoned starting value (not device- or log-
    // derived, there's no way to measure this from rep-detection data),
    // consistent across every row variant and lat pulldown rather than
    // guessed per-exercise.
    muscles:         [Muscle.Lats, Muscle.RearDelts, { muscle: Muscle.Biceps, weight: 0.45 }],
    splitCategories: [SplitCategory.Upper, SplitCategory.Pull],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.Dumbbell],
    defaultReps:     10,
    defaultSets:     3,
    progression:     { repRange: [6, 12], setRange: [3, 4] },
    isFormCheckable: true,
  },

  {
    id:              'barbellRow',
    displayName:     'Barbell Row',
    muscleGroups:    [MuscleGroup.Back],
    // Biceps is a real assist in any pulling movement, not a co-primary
    // mover the way lats/rear-delts are — WEIGHTED 0.45, see MuscleCredit's
    // comment. 0.45 is a reasoned starting value (not device- or log-
    // derived, there's no way to measure this from rep-detection data),
    // consistent across every row variant and lat pulldown rather than
    // guessed per-exercise.
    muscles:         [Muscle.Lats, Muscle.RearDelts, { muscle: Muscle.Biceps, weight: 0.45 }],
    splitCategories: [SplitCategory.Upper, SplitCategory.Pull],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.Barbell],
    defaultReps:     8,
    defaultSets:     4,
    progression:     { repRange: [5, 10], setRange: [3, 5] },
    isFormCheckable: true,
  },

  {
    id:              'singleArmRow',
    displayName:     'Single-Arm Row',
    muscleGroups:    [MuscleGroup.Back],
    // Biceps is a real assist in any pulling movement, not a co-primary
    // mover the way lats/rear-delts are — WEIGHTED 0.45, see MuscleCredit's
    // comment. 0.45 is a reasoned starting value (not device- or log-
    // derived, there's no way to measure this from rep-detection data),
    // consistent across every row variant and lat pulldown rather than
    // guessed per-exercise.
    muscles:         [Muscle.Lats, Muscle.RearDelts, { muscle: Muscle.Biceps, weight: 0.45 }],
    splitCategories: [SplitCategory.Upper, SplitCategory.Pull],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.Dumbbell],
    defaultReps:     10,
    defaultSets:     3,
    progression:     { repRange: [8, 12], setRange: [3, 4] },
    isFormCheckable: true,
  },

  {
    id:              'invertedRow',
    displayName:     'Inverted Row',
    muscleGroups:    [MuscleGroup.Back],
    // Biceps is a real assist in any pulling movement, not a co-primary
    // mover the way lats/rear-delts are — WEIGHTED 0.45, see MuscleCredit's
    // comment. 0.45 is a reasoned starting value (not device- or log-
    // derived, there's no way to measure this from rep-detection data),
    // consistent across every row variant and lat pulldown rather than
    // guessed per-exercise.
    muscles:         [Muscle.Lats, Muscle.RearDelts, { muscle: Muscle.Biceps, weight: 0.45 }],
    splitCategories: [SplitCategory.Upper, SplitCategory.Pull],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.None],
    defaultReps:     10,
    defaultSets:     3,
    progression:     { repRange: [8, 15], setRange: [3, 4] },
    isFormCheckable: true,
  },

  {
    id:              'tBarRow',
    displayName:     'T-Bar Row',
    muscleGroups:    [MuscleGroup.Back],
    // Biceps is a real assist in any pulling movement, not a co-primary
    // mover the way lats/rear-delts are — WEIGHTED 0.45, see MuscleCredit's
    // comment. 0.45 is a reasoned starting value (not device- or log-
    // derived, there's no way to measure this from rep-detection data),
    // consistent across every row variant and lat pulldown rather than
    // guessed per-exercise.
    muscles:         [Muscle.Lats, Muscle.RearDelts, { muscle: Muscle.Biceps, weight: 0.45 }],
    splitCategories: [SplitCategory.Upper, SplitCategory.Pull],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.Barbell],
    defaultReps:     8,
    defaultSets:     4,
    progression:     { repRange: [6, 10], setRange: [3, 5] },
    isFormCheckable: true,
  },

  {
    id:              'seatedCableRow',
    displayName:     'Seated Cable Row',
    muscleGroups:    [MuscleGroup.Back],
    // Biceps is a real assist in any pulling movement, not a co-primary
    // mover the way lats/rear-delts are — WEIGHTED 0.45, see MuscleCredit's
    // comment. 0.45 is a reasoned starting value (not device- or log-
    // derived, there's no way to measure this from rep-detection data),
    // consistent across every row variant and lat pulldown rather than
    // guessed per-exercise.
    muscles:         [Muscle.Lats, Muscle.RearDelts, { muscle: Muscle.Biceps, weight: 0.45 }],
    splitCategories: [SplitCategory.Upper, SplitCategory.Pull],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.Cable],
    defaultReps:     12,
    defaultSets:     3,
    progression:     { repRange: [8, 15], setRange: [3, 4] },
    isFormCheckable: true,
  },

  {
    id:              'machineRow',
    displayName:     'Machine Row',
    muscleGroups:    [MuscleGroup.Back],
    // Biceps is a real assist in any pulling movement, not a co-primary
    // mover the way lats/rear-delts are — WEIGHTED 0.45, see MuscleCredit's
    // comment. 0.45 is a reasoned starting value (not device- or log-
    // derived, there's no way to measure this from rep-detection data),
    // consistent across every row variant and lat pulldown rather than
    // guessed per-exercise.
    muscles:         [Muscle.Lats, Muscle.RearDelts, { muscle: Muscle.Biceps, weight: 0.45 }],
    splitCategories: [SplitCategory.Upper, SplitCategory.Pull],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.Machine],
    defaultReps:     12,
    defaultSets:     3,
    progression:     { repRange: [8, 15], setRange: [3, 4] },
    isFormCheckable: true,
  },

  // ─── Hip-hinge family ───────────────────────────────────────────────────────
  {
    id:              'romanianDeadlift',
    displayName:     'Romanian Deadlift',
    muscleGroups:    [MuscleGroup.Legs, MuscleGroup.Back],
    muscles:         [Muscle.Hamstrings, Muscle.Glutes, Muscle.LowerBack],
    splitCategories: [SplitCategory.Lower],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.Dumbbell],
    defaultReps:     10,
    defaultSets:     3,
    progression:     { repRange: [8, 20], setRange: [2, 5] },
    isFormCheckable: true,
  },

  {
    id:              'deadlift',
    displayName:     'Deadlift',
    muscleGroups:    [MuscleGroup.Legs, MuscleGroup.Back],
    muscles:         [Muscle.Hamstrings, Muscle.Glutes, Muscle.LowerBack, Muscle.Quads],
    splitCategories: [SplitCategory.Lower],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.Barbell],
    defaultReps:     8,
    defaultSets:     3,
    progression:     { repRange: [5, 15], setRange: [2, 5] },
    isFormCheckable: true,
  },

  {
    id:              'goodMorning',
    displayName:     'Good Morning',
    muscleGroups:    [MuscleGroup.Legs, MuscleGroup.Back],
    muscles:         [Muscle.Hamstrings, Muscle.Glutes, Muscle.LowerBack],
    splitCategories: [SplitCategory.Lower],
    difficulty:      Difficulty.Advanced,
    equipment:       [Equipment.Barbell],
    defaultReps:     10,
    defaultSets:     3,
    progression:     { repRange: [8, 15], setRange: [2, 4] },
    isFormCheckable: true,
  },

  {
    id:              'kettlebellSwing',
    displayName:     'Kettlebell Swing',
    muscleGroups:    [MuscleGroup.Legs, MuscleGroup.Back],
    muscles:         [Muscle.Glutes, Muscle.Hamstrings, Muscle.LowerBack],
    splitCategories: [SplitCategory.Lower],
    difficulty:      Difficulty.Intermediate,
    // No Kettlebell entry in the Equipment enum — Dumbbell is the closest
    // stand-in (a common swing substitute); flag if a real Equipment.Kettlebell
    // is ever added.
    equipment:       [Equipment.Dumbbell],
    defaultReps:     15,
    defaultSets:     3,
    progression:     { repRange: [10, 25], setRange: [2, 5] },
    isFormCheckable: true,
  },

  {
    id:              'singleLegRDL',
    displayName:     'Single-Leg RDL',
    muscleGroups:    [MuscleGroup.Legs, MuscleGroup.Back],
    muscles:         [Muscle.Hamstrings, Muscle.Glutes, Muscle.LowerBack],
    splitCategories: [SplitCategory.Lower],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.None],
    defaultReps:     8,
    defaultSets:     3,
    progression:     { repRange: [6, 15], setRange: [2, 4] },
    isFormCheckable: true,
  },

  // ─── Cable pull-through ─────────────────────────────────────────────────────
  // Added in place of hip thrust — see cablePullThrough's own registration
  // in exerciseDefinitions.ts for the full trackability writeup (why hip
  // thrust was skipped, why this is the trackable replacement). Glutes
  // primary (this is specifically a glute-biased hinge variant, the reason
  // it's a real, commonly-used hip-thrust alternative in actual programming,
  // not just a trackability compromise), hamstrings weighted 0.6 (a full-ROM
  // hinge engages them more than the standing kickback did), lowerBack 0.25
  // "light" — same reasoned-not-measured weighting convention as the rest of
  // this family (see MuscleCredit's own comment above).
  {
    id:              'cablePullThrough',
    displayName:     'Cable Pull-Through',
    muscleGroups:    [MuscleGroup.Legs, MuscleGroup.Back],
    muscles:         [Muscle.Glutes, { muscle: Muscle.Hamstrings, weight: 0.6 }, { muscle: Muscle.LowerBack, weight: 0.25 }],
    splitCategories: [SplitCategory.Lower],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.Cable],
    defaultReps:     12,
    defaultSets:     3,
    progression:     { repRange: [10, 20], setRange: [2, 4] },
    isFormCheckable: true,
  },

  // ─── Shoulder/arm isolation raise family ───────────────────────────────────
  {
    id:              'lateralRaise',
    displayName:     'Lateral Raise',
    muscleGroups:    [MuscleGroup.Shoulders],
    muscles:         [Muscle.Shoulders],
    splitCategories: [SplitCategory.Upper, SplitCategory.Push],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.Dumbbell],
    defaultReps:     12,
    defaultSets:     3,
    progression:     { repRange: [10, 20], setRange: [2, 4] },
    isFormCheckable: true,
  },

  {
    id:              'frontRaise',
    displayName:     'Front Raise',
    muscleGroups:    [MuscleGroup.Shoulders],
    muscles:         [Muscle.Shoulders],
    splitCategories: [SplitCategory.Upper, SplitCategory.Push],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.Dumbbell],
    defaultReps:     12,
    defaultSets:     3,
    progression:     { repRange: [10, 20], setRange: [2, 4] },
    isFormCheckable: true,
  },

  // ─── Lat pulldown family ────────────────────────────────────────────────────
  // Modeled on seatedCableRow above — same equipment (Cable), same split
  // buckets (Upper + Pull), same beginner difficulty/rep-range shape. This
  // was the missing piece of lat pulldown's registration: the exercise was
  // already wired into EXERCISE_DEFINITIONS, EXERCISE_STANDARDS, ExerciseType,
  // and EXERCISE_UI, but never added HERE — and this catalog (not those other
  // lists) is what app/exercise-picker.tsx actually reads to build the
  // selectable exercise list, so it was invisible in the UI despite being
  // fully functional underneath.
  {
    id:              'latPulldown',
    displayName:     'Lat Pulldown',
    muscleGroups:    [MuscleGroup.Back, MuscleGroup.Arms],
    // Biceps WEIGHTED 0.45 — see the row variants' identical comment above
    // and MuscleCredit's own comment; this was the exercise that surfaced
    // the missing-weighting bug in the first place (reported: biceps
    // jumped to Gold off lat pulldown volume alone).
    muscles:         [Muscle.Lats, { muscle: Muscle.Biceps, weight: 0.45 }],
    splitCategories: [SplitCategory.Upper, SplitCategory.Pull],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.Cable],
    defaultReps:     10,
    defaultSets:     3,
    progression:     { repRange: [8, 15], setRange: [3, 4] },
    isFormCheckable: true,
  },

  // ─── Standing glute kickback ────────────────────────────────────────────────
  // Replaces gluteBridge/hipThrust — both removed, Apple Vision's body-pose
  // model can't track a person lying down (100% frame rejection, confirmed
  // on-device). This is the standing equivalent: same hip-extension muscle
  // targets, but the person stays upright the whole time. Hamstrings
  // weighted 0.5 (real secondary mover in hip extension, not co-primary with
  // glutes) and lowerBack weighted 0.25 ("light") — same reasoned-not-measured
  // weighting convention as the row family's biceps 0.45 (see MuscleCredit's
  // comment above), carried over unchanged from the old gluteBridge entry
  // since the muscles worked haven't changed, only the body position.
  {
    id:              'standingGluteKickback',
    displayName:     'Standing Glute Kickback',
    muscleGroups:    [MuscleGroup.Legs, MuscleGroup.Back],
    muscles:         [Muscle.Glutes, { muscle: Muscle.Hamstrings, weight: 0.5 }, { muscle: Muscle.LowerBack, weight: 0.25 }],
    splitCategories: [SplitCategory.Lower],
    difficulty:      Difficulty.Beginner,
    equipment:       [],
    defaultReps:     12,
    defaultSets:     3,
    progression: {
      repRange: [10, 20],
      setRange: [2, 4],
    },
    isFormCheckable: true,
  },

  // ─── Face pull ──────────────────────────────────────────────────────────────
  // Rear delts primary, traps weighted 0.5 as a real secondary mover (a face
  // pull's scapular-retraction component works the mid traps directly, not
  // just as incidental assistance) — same reasoned-not-measured weighting
  // convention as the row family's biceps 0.45 / glute kickback's hamstrings
  // 0.5 (see MuscleCredit's own comment above). Cable-only equipment — a
  // face pull is a cable-machine (or heavy-band) exercise by definition; no
  // dedicated Equipment.Band exists yet, and Cable is the far more common
  // real setup.
  {
    id:              'facePull',
    displayName:     'Face Pull',
    muscleGroups:    [MuscleGroup.Shoulders, MuscleGroup.Back],
    muscles:         [Muscle.RearDelts, { muscle: Muscle.Traps, weight: 0.5 }],
    splitCategories: [SplitCategory.Upper, SplitCategory.Pull],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.Cable],
    defaultReps:     15,
    defaultSets:     3,
    progression: {
      repRange: [12, 20],
      setRange: [2, 4],
    },
    isFormCheckable: true,
  },

  // ─── Pull-up ────────────────────────────────────────────────────────────────
  // Biceps weighted 0.45 — same convention as latPulldown/the row family
  // (see MuscleCredit's own comment above): a real secondary mover in any
  // vertical/horizontal pull, not just incidental assistance.
  {
    id:              'pullup',
    displayName:     'Pull-up',
    muscleGroups:    [MuscleGroup.Back, MuscleGroup.Arms],
    muscles:         [Muscle.Lats, { muscle: Muscle.Biceps, weight: 0.45 }],
    splitCategories: [SplitCategory.Upper, SplitCategory.Pull],
    difficulty:      Difficulty.Intermediate,
    equipment:       [Equipment.PullupBar],
    defaultReps:     8,
    defaultSets:     3,
    progression: {
      repRange: [5, 15],
      setRange: [2, 4],
    },
    isFormCheckable: true,
  },

  // ─── Calf raise ─────────────────────────────────────────────────────────────
  // See its registration in constants/exerciseDefinitions.ts for an
  // explicit feasibility flag — this app has no heel/toe joint at all, and
  // this may not be reliably trackable regardless of thresholds.
  {
    id:              'calfRaise',
    displayName:     'Calf Raise',
    muscleGroups:    [MuscleGroup.Legs],
    muscles:         [Muscle.Calves],
    splitCategories: [SplitCategory.Lower],
    difficulty:      Difficulty.Beginner,
    equipment:       [],
    defaultReps:     15,
    defaultSets:     3,
    progression: {
      repRange: [12, 25],
      setRange: [2, 4],
    },
    isFormCheckable: true,
  },

  // ─── Leg curl (machine) ─────────────────────────────────────────────────────
  // Glutes weighted 0.3 — real but lesser secondary mover in knee flexion
  // (same reasoned-not-measured weighting convention as the row family's
  // biceps 0.45 / glute kickback's hamstrings 0.5, see MuscleCredit above).
  {
    id:              'legCurl',
    displayName:     'Leg Curl (Machine)',
    muscleGroups:    [MuscleGroup.Legs],
    muscles:         [Muscle.Hamstrings, { muscle: Muscle.Glutes, weight: 0.3 }],
    splitCategories: [SplitCategory.Lower],
    difficulty:      Difficulty.Beginner,
    equipment:       [Equipment.Machine],
    defaultReps:     12,
    defaultSets:     3,
    progression: {
      repRange: [10, 20],
      setRange: [2, 4],
    },
    isFormCheckable: true,
  },

  // ─── Crunch ─────────────────────────────────────────────────────────────────
  // No SplitCategory.Core bucket exists yet (only Upper/Lower/Push/Pull) —
  // Upper is the closest available fit, not a precise one. See its
  // registration in constants/exerciseDefinitions.ts for a real, confirmed
  // (not hypothetical) tracking risk this shares with the removed
  // gluteBridge: Vision has failed 100% of frames on a lying-down pose
  // before, on-device.
  {
    id:              'crunch',
    displayName:     'Crunch',
    muscleGroups:    [MuscleGroup.Core],
    muscles:         [Muscle.Abs],
    splitCategories: [SplitCategory.Upper],
    difficulty:      Difficulty.Beginner,
    equipment:       [],
    defaultReps:     15,
    defaultSets:     3,
    progression: {
      repRange: [12, 25],
      setRange: [2, 4],
    },
    isFormCheckable: true,
  },

  // Russian twist was here — removed as untrackable (rotation about a vertical
  // axis is invisible to a monocular side-on camera; device log confirmed a
  // dead-flat signal). See the REMOVED note in constants/exerciseDefinitions.ts.

  // Dips — bodyweight upright push (triceps / lower chest / front delts).
  // Side-camera; elbow-angle rep metric (see constants/exerciseDefinitions.ts).
  {
    id:              'dips',
    displayName:     'Dips',
    muscleGroups:    [MuscleGroup.Chest, MuscleGroup.Shoulders, MuscleGroup.Arms],
    muscles:         [Muscle.Triceps, Muscle.Chest, Muscle.Shoulders],
    splitCategories: [SplitCategory.Upper, SplitCategory.Push],
    difficulty:      Difficulty.Intermediate,
    equipment:       [],
    defaultReps:     8,
    defaultSets:     3,
    progression: {
      repRange: [5, 15],
      setRange: [2, 5],
    },
    isFormCheckable: true,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ADD NEW FORM-CHECKABLE EXERCISES HERE.
  // ─────────────────────────────────────────────────────────────────────────
] as const satisfies ExerciseDef[];

// The literal union of every catalog id — 'squat' | 'curl' | 'pushup' | ...
// derived FROM the array above (as const + satisfies keeps each entry's
// literal id type instead of widening to string), not hand-maintained.
// This is what makes registration foolproof: EXERCISE_DEFINITIONS,
// EXERCISE_STANDARDS, EXERCISE_UI, and SETUP_INFO are all typed as
// Record<ExerciseId, ...> below/elsewhere, so TypeScript refuses to compile
// if any of them is missing an entry for a catalog exercise — a build-time
// error pointing at the exact missing exercise, instead of a runtime
// silent-squat-fallback discovered by accident. See the ExerciseType check
// right below for the native-bridge half of this.
export type ExerciseId = (typeof EXERCISE_CATALOG)[number]['id'];

// Compile-time proof every catalog exercise is also registered with the
// native camera bridge's ExerciseType union (modules/athlt-camera/src/
// index.ts) — chest press's actual bug: present in every JS-side list,
// present in ExerciseType too as it turned out, but that's exactly the kind
// of gap this line exists to catch the NEXT time it's actually missing.
// If this line fails to compile, some EXERCISE_CATALOG id isn't in
// ExerciseType yet — add it there.
type _ExerciseIdsAreValidExerciseTypes = ExerciseId extends ExerciseType ? true : never;
const _exerciseIdsRegisteredWithNativeBridge: _ExerciseIdsAreValidExerciseTypes = true;
void _exerciseIdsRegisteredWithNativeBridge;

// Quick lookup by id
export function getExerciseDef(id: string): ExerciseDef | undefined {
  return EXERCISE_CATALOG.find(e => e.id === id);
}
