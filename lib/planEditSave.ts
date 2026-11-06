/**
 * lib/planEditSave.ts
 *
 * Saves an Edit-sheet change to the real plan (existing plan storage, which also mirrors to the cloud) and refreshes
 * the in-memory plan store, so the workout screen, Home and Train all show the change. Used by the Train and Home tabs.
 */
import { loadPlan, savePlan } from './planStorage';
import { usePlanStore } from '../store/planStore';
import { applyEditRows, type EditRow } from './planEdit';

/** true when the plan changed and was saved. */
export async function saveWorkoutEdit(workoutId: string, rows: EditRow[]): Promise<boolean> {
  const plan = await loadPlan();
  if (!plan) return false;
  const next = applyEditRows(plan, workoutId, rows);
  if (!next) return false;
  await savePlan(next);
  await usePlanStore.getState().loadFromStorage();
  return true;
}
