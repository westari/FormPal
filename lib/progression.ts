/**
 * lib/progression.ts
 *
 * Progressive overload model.
 *
 * LADDER (in order of priority):
 *   1. Rep progression  — increase reps toward params.repRange[1]
 *   2. Set progression  — once reps maxed, add a set and reset reps to repRange[0]
 *   3. Variation switch — once sets maxed AND a harder variation exists, advance to it
 *   4. Plateau hold     — if already at peak and no next variation, maintain current level
 *
 * SESSIONS_TO_PROGRESS = 2: the user must complete an exercise at the same
 * reps/sets level TWICE before we nudge them forward. This avoids weekly overload
 * and gives the body time to consolidate the stimulus (Bompa & Haff, 2009).
 *
 * Called by: store/planStore.ts → markWorkoutComplete
 */

import type { ExerciseProgressionState } from '../types/plan';
import type { ExerciseDef }              from '../constants/exercises';
import type { TrainingParams }           from './goalParams';

// Sessions at same reps/sets before advancing
const SESSIONS_TO_PROGRESS = 2;

export interface ProgressionResult {
  state:    ExerciseProgressionState;
  advanced: boolean;   // true if reps, sets, or variation actually changed
  message:  string;    // human-readable description of what changed (for dev logging)
}

export function nextProgression(
  state:  ExerciseProgressionState,
  def:    ExerciseDef,
  params: TrainingParams,
): ProgressionResult {
  const newCount = state.sessionsAtCurrentLevel + 1;

  // Not yet time to advance — just track the completion
  if (newCount < SESSIONS_TO_PROGRESS) {
    return {
      state:    { ...state, sessionsAtCurrentLevel: newCount },
      advanced: false,
      message:  `${def.id}: ${state.currentReps} reps × ${state.currentSets} sets (${newCount}/${SESSIONS_TO_PROGRESS} sessions)`,
    };
  }

  // Ready to advance
  const base = { ...state, sessionsAtCurrentLevel: 0 };

  // Step 1: more reps
  if (base.currentReps < params.repRange[1]) {
    const next = { ...base, currentReps: base.currentReps + 1 };
    return {
      state:    next,
      advanced: true,
      message:  `${def.id}: reps ${state.currentReps} → ${next.currentReps} (sets unchanged at ${next.currentSets})`,
    };
  }

  // Step 2: more sets (reps reset to min for fresh challenge)
  if (base.currentSets < params.setRange[1]) {
    const next = { ...base, currentSets: base.currentSets + 1, currentReps: params.repRange[0] };
    return {
      state:    next,
      advanced: true,
      message:  `${def.id}: added a set → ${next.currentSets} sets, reps reset to ${next.currentReps}`,
    };
  }

  // Step 3: harder variation (if defined)
  if (def.progression.nextVariationId) {
    const next: ExerciseProgressionState = {
      ...base,
      currentVariationId:     def.progression.nextVariationId,
      currentReps:            params.repRange[0],
      currentSets:            params.setRange[0],
    };
    return {
      state:    next,
      advanced: true,
      message:  `${def.id}: advanced to variation "${next.currentVariationId}", reset to ${next.currentReps}r × ${next.currentSets}s`,
    };
  }

  // Step 4: at peak, hold
  return {
    state:    base,
    advanced: false,
    message:  `${def.id}: at peak (${base.currentReps}r × ${base.currentSets}s, no next variation). Maintaining.`,
  };
}

// Apply progression for every exercise in a completed workout and return the updated map.
export function applyWorkoutProgression(
  progressionState: Record<string, ExerciseProgressionState>,
  completedExerciseIds: string[],
  getCatalogEntry: (id: string) => ExerciseDef | undefined,
  params: TrainingParams,
): Record<string, ExerciseProgressionState> {
  const next = { ...progressionState };
  for (const exerciseId of completedExerciseIds) {
    const current = next[exerciseId];
    const def     = getCatalogEntry(exerciseId);
    if (!current || !def) continue;
    const result = nextProgression(current, def, params);
    next[exerciseId] = result.state;
    if (__DEV__) {
      console.log('[Progression]', result.message);
    }
  }
  return next;
}
