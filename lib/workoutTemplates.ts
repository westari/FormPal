/**
 * lib/workoutTemplates.ts
 *
 * FormPal's ready-made workouts ("FormPal templates" in My workouts). Plain basics for anyone: NOT tailored to the user (their own
 * plan workouts are). Every exercise is from the real catalogue (constants/exercises.ts) with the catalogue's own default sets and
 * reps, so each one can be form-checked and started like any other workout.
 *
 * Tapping a template opens the workout preview (app/workout/index.tsx?template=<id>), where it can be started or saved to Mine
 * (the same saved list the My workouts bookmarks use, SAVED_WORKOUTS_KEY).
 */
import { EXERCISE_CATALOG } from '../constants/exercises';
import type { Workout } from '../types/plan';

export const SAVED_WORKOUTS_KEY = 'formpal_saved_workouts';
export const TEMPLATE_PREFIX = 'tpl-';
/** The words shown on the FormPal templates tab. */
export const TEMPLATE_NOTE = 'Ready-made basics for anyone. Not tailored to you.';

export interface WorkoutTemplate { id: string; name: string; blurb: string; exerciseIds: string[] }

export const WORKOUT_TEMPLATES: WorkoutTemplate[] = [
  { id: 'tpl-beginner-full', name: 'Beginner full body', blurb: 'A simple head-to-toe start',
    exerciseIds: ['squat', 'kneePushup', 'invertedRow', 'lunge', 'dumbbellShoulderPress', 'crunch'] },
  { id: 'tpl-upper', name: 'Upper body', blurb: 'Chest, back, shoulders and arms',
    exerciseIds: ['chestPress', 'bentOverRow', 'dumbbellShoulderPress', 'latPulldown', 'curl', 'tricepPushdown'] },
  { id: 'tpl-lower', name: 'Lower body', blurb: 'Quads, hamstrings and glutes',
    exerciseIds: ['gobletSquat', 'romanianDeadlift', 'reverseLunge', 'stepUp', 'legCurl'] },
  { id: 'tpl-push', name: 'Push', blurb: 'Chest, shoulders and triceps',
    exerciseIds: ['chestPress', 'dumbbellShoulderPress', 'inclinePushup', 'lateralRaise', 'tricepPushdown'] },
  { id: 'tpl-pull', name: 'Pull', blurb: 'Back and biceps',
    exerciseIds: ['latPulldown', 'seatedCableRow', 'bentOverRow', 'facePull', 'curl', 'hammerCurl'] },
  { id: 'tpl-core', name: 'Core', blurb: 'Moves that make your core work',
    exerciseIds: ['crunch', 'kneePushup', 'inclinePushup', 'splitSquat', 'stepUp', 'airSquat'] },
];

export const isTemplateId = (id: string | null | undefined): boolean => !!id && id.startsWith(TEMPLATE_PREFIX);
export const getTemplate = (id: string | null | undefined): WorkoutTemplate | null => WORKOUT_TEMPLATES.find(t => t.id === id) ?? null;

/** A template as a plan Workout (so the workout preview and the run screen treat it like any other workout). */
export function templateWorkout(id: string | null | undefined): Workout | null {
  const t = getTemplate(id);
  if (!t) return null;
  const byId = new Map(EXERCISE_CATALOG.map(e => [e.id as string, e]));
  const exercises = t.exerciseIds.filter(x => byId.has(x)).map(x => {
    const e = byId.get(x)!;
    return { exerciseId: e.id, displayName: e.displayName, targetSets: e.defaultSets, targetReps: e.defaultReps, restSeconds: 60, currentVariationId: e.id };
  });
  return { id: t.id, sessionNumber: 0, splitLabel: t.name, rationale: TEMPLATE_NOTE, exercises, completed: false } as unknown as Workout;
}
