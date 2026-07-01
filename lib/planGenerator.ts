/**
 * lib/planGenerator.ts
 *
 * Pure function: generatePlan(profile) → Plan.
 * No side effects, no randomness, no external calls — completely deterministic.
 *
 * SPLIT SELECTION LOGIC (threshold-driven, degrades gracefully):
 *
 *   Currently (3 exercises: squat, pushup, curl):
 *     Lower bucket: 1 exercise  → below threshold
 *     Upper bucket: 2 exercises → below threshold
 *     → Always picks FULL BODY. Works well: every session trains everything.
 *
 *   When catalog grows to, e.g., 8+ exercises:
 *     Lower: squat, lunge, deadlift → 3 exercises → threshold met
 *     Upper: pushup, curl, row, press → 4 → threshold met + daysPerWeek >= 4
 *     → Switches to UPPER/LOWER automatically.
 *
 *   At 15+ exercises with 6 days/week:
 *     Push, Pull, Legs each hit threshold → PUSH/PULL/LEGS.
 *
 * VARIATION IN FULL BODY:
 *   With only 3 exercises, variation comes from rotating which exercise is first
 *   (the "prime" slot gets the freshest energy — Enoka 2008). This produces 3
 *   distinct session flavors that repeat in a cycle.
 */

import { EXERCISE_CATALOG, LOCATION_EQUIPMENT, SPLIT_THRESHOLDS,
         SplitCategory, type ExerciseDef } from '../constants/exercises';
import { goalParams }                        from './goalParams';
import type { Plan, Workout, PlannedExercise, PlanProfile,
              ExerciseProgressionState, SplitType } from '../types/plan';

// ─── Rationale strings ────────────────────────────────────────────────────────
// Shown in the UI to explain why each session is structured this way.

const FULL_BODY_RATIONALES: Record<string, string[]> = {
  strength:   [
    'Full body strength — every compound movement, maximum load.',
    'Full body — heavy and deliberate. Quality over quantity.',
    'Full body strength — building neuromuscular power from the ground up.',
  ],
  toned: [
    'Full body — sculpting every muscle group in one session.',
    'Full body — moderate reps to build definition and burn fat.',
    'Full body — balanced stimulus for a lean, strong physique.',
  ],
  general: [
    'Full body — building your base with balanced movement.',
    'Full body — hitting every muscle group while you\'re fresh.',
    'Full body — finishing the week with a complete session.',
  ],
  weightloss: [
    'Full body circuit — maximum calorie burn, minimum rest.',
    'Full body — high reps, short rest, constant movement.',
    'Full body circuit — elevating your metabolism for hours.',
  ],
};

const UPPER_RATIONALES = ['Upper body — chest, shoulders, and arms.', 'Upper — pressing and pulling for a strong upper frame.'];
const LOWER_RATIONALES = ['Lower body — legs and glutes.', 'Lower — building power from the ground up.'];
const PUSH_RATIONALE   = 'Push day — chest, shoulders, triceps.';
const PULL_RATIONALE   = 'Pull day — back and biceps.';
const LEGS_RATIONALE   = 'Legs day — quads, hamstrings, glutes.';

// ─── Split selection ──────────────────────────────────────────────────────────

function selectSplit(eligible: ExerciseDef[], daysPerWeek: number): SplitType {
  const MIN = SPLIT_THRESHOLDS.minPerBucket;

  const countIn = (cat: SplitCategory) =>
    eligible.filter(ex => ex.splitCategories.includes(cat)).length;

  // Push/Pull/Legs: needs 6+ days and >= MIN in each of Push, Pull, Lower
  if (
    daysPerWeek >= 6 &&
    countIn(SplitCategory.Push)  >= MIN &&
    countIn(SplitCategory.Pull)  >= MIN &&
    countIn(SplitCategory.Lower) >= MIN
  ) {
    return 'pushPullLegs';
  }

  // Upper/Lower: needs 4+ days and >= MIN in Upper and Lower
  if (
    daysPerWeek >= 4 &&
    countIn(SplitCategory.Upper) >= MIN &&
    countIn(SplitCategory.Lower) >= MIN
  ) {
    return 'upperLower';
  }

  // Default — full body (current reality with 3 exercises)
  return 'fullBody';
}

// ─── Exercise ordering (rotate for variety) ──────────────────────────────────

function rotate<T>(arr: T[], by: number): T[] {
  if (arr.length === 0) return arr;
  const shift = by % arr.length;
  return [...arr.slice(shift), ...arr.slice(0, shift)];
}

// ─── Workout builder ──────────────────────────────────────────────────────────

function buildWorkout(
  sessionIndex: number,
  eligible:     ExerciseDef[],
  splitType:    SplitType,
  profile:      PlanProfile,
  startReps:    number,
  startSets:    number,
  restSeconds:  number,
): Workout {
  let pool:       ExerciseDef[];
  let splitLabel: string;
  let rationale:  string;

  if (splitType === 'fullBody') {
    pool       = eligible;
    splitLabel = 'Full Body';
    const rationaleSet = FULL_BODY_RATIONALES[profile.goal] ?? FULL_BODY_RATIONALES.general;
    rationale  = rationaleSet[sessionIndex % rationaleSet.length];

  } else if (splitType === 'upperLower') {
    const isUpper = sessionIndex % 2 === 0;
    pool          = eligible.filter(ex =>
      ex.splitCategories.includes(isUpper ? SplitCategory.Upper : SplitCategory.Lower)
    );
    splitLabel    = isUpper ? 'Upper Body' : 'Lower Body';
    const options = isUpper ? UPPER_RATIONALES : LOWER_RATIONALES;
    rationale     = options[Math.floor(sessionIndex / 2) % options.length];

  } else {
    // pushPullLegs — cycles Push → Pull → Legs → Push → Pull → Legs …
    const bucketIndex = sessionIndex % 3;
    const bucket      = [SplitCategory.Push, SplitCategory.Pull, SplitCategory.Lower][bucketIndex];
    pool              = eligible.filter(ex => ex.splitCategories.includes(bucket));
    splitLabel        = ['Push Day', 'Pull Day', 'Legs Day'][bucketIndex];
    rationale         = [PUSH_RATIONALE, PULL_RATIONALE, LEGS_RATIONALE][bucketIndex];
  }

  // Rotate exercise order each session — different exercise gets the "prime" slot
  const ordered = rotate(pool, sessionIndex);

  const exercises: PlannedExercise[] = ordered.map(ex => ({
    exerciseId:         ex.id,
    displayName:        ex.displayName,
    targetSets:         startSets,
    targetReps:         startReps,
    restSeconds,
    currentVariationId: ex.id,
  }));

  return {
    id:            `workout_${sessionIndex}_${Date.now()}`,
    sessionNumber: sessionIndex + 1,
    splitLabel,
    rationale,
    exercises,
    completed:     false,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

// How many weeks of workouts to generate upfront.
// The store auto-regenerates when the user approaches the end.
const PLAN_WEEKS = 4;

export function generatePlan(profile: PlanProfile): Plan {
  const params = goalParams(profile.goal, profile.experience);

  // Filter catalog to exercises reachable at this location
  const available = LOCATION_EQUIPMENT[profile.location];
  const eligible  = EXERCISE_CATALOG.filter(ex =>
    ex.equipment.length === 0 ||                                    // bodyweight: always ok
    ex.equipment.every(eq => available.includes(eq))                // equipment check
  );

  if (eligible.length === 0) {
    // Shouldn't happen in practice — bodyweight exercises have no equipment requirement
    throw new Error(`No exercises available for location "${profile.location}"`);
  }

  const splitType    = selectSplit(eligible, profile.daysPerWeek);
  const totalSessions = profile.daysPerWeek * PLAN_WEEKS;

  const workouts: Workout[] = Array.from({ length: totalSessions }, (_, i) =>
    buildWorkout(i, eligible, splitType, profile, params.startReps, params.startSets, params.restSeconds)
  );

  // Initialize progression state for every eligible exercise
  const progressionState: Record<string, ExerciseProgressionState> = {};
  for (const ex of eligible) {
    progressionState[ex.id] = {
      exerciseId:             ex.id,
      currentVariationId:     ex.id,
      currentReps:            params.startReps,
      currentSets:            params.startSets,
      sessionsAtCurrentLevel: 0,
    };
  }

  return {
    id:                  `plan_${Date.now()}`,
    profile,
    splitType,
    workouts,
    progressionState,
    generatedAt:         Date.now(),
    currentWorkoutIndex: 0,
  };
}
