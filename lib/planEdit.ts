/**
 * lib/planEdit.ts
 *
 * Pure logic behind "the Edit sheet saves to the plan" (Train and Home). The design's Edit sheet works on a list of
 * rows ["Push-up", "3 × 12"]: rows can be removed and "Add exercise" appends one. When the sheet closes, the screen
 * sends the final rows here and the matching plan workout is rebuilt from them. No React / RN, so
 * scripts/test-plan-edit.js runs the shipped code under node.
 */
import { EXERCISE_CATALOG } from '../constants/exercises';
import type { Plan, PlannedExercise, Workout } from '../types/plan';
import { RENAME_ROW_KEY } from './editSheetBridge';

export type EditRow = [string, string];

const TIMES = ' × ';
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

type Def = { id: string; displayName: string; defaultSets: number; defaultReps: number };
const CATALOG = EXERCISE_CATALOG as unknown as Def[];

/** "3 × 12" -> [3, 12]; anything else -> null. */
export function parseSetsReps(text: string): [number, number] | null {
  const m = /^\s*(\d+)\s*[x×]\s*(\d+)/i.exec(text || '');
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
}

/** The catalogue exercise a row name means (exact name or id), else null. */
export function resolveExercise(name: string): Def | null {
  const n = norm(name);
  return CATALOG.find(d => norm(d.displayName) === n) ?? CATALOG.find(d => norm(d.id) === n) ?? null;
}

/**
 * The extra exercises the Edit sheet's "Add exercise" offers, in order: real catalogue exercises with their real default
 * sets x reps (the design ships a fixed list of five that are not all tracked exercises).
 */
const FIRST = ['squat', 'pushup', 'lunge', 'bentOverRow', 'pullup', 'shoulderPress', 'deadlift', 'curl'];
export function addableExercises(): EditRow[] {
  const rank = (id: string) => { const i = FIRST.indexOf(id); return i < 0 ? 999 : i; };
  return [...CATALOG].sort((a, b) => rank(a.id) - rank(b.id)).map(d => [d.displayName, `${d.defaultSets}${TIMES}${d.defaultReps}`] as EditRow);
}

/**
 * Rebuild one plan workout from the sheet's final rows. Rows that match an existing exercise keep it (its sets, reps,
 * rest, variation, progression); rows that were removed are dropped; a new row becomes a real planned exercise from the
 * catalogue (rest time copied from the workout's other exercises). Rows that are not a tracked exercise are ignored.
 * Returns a NEW plan (the input is not changed), or null if there is nothing to change.
 */
export function applyEditRows(plan: Plan, workoutId: string, allRows: EditRow[]): Plan | null {
  const wi = plan.workouts.findIndex(w => w.id === workoutId);
  if (wi < 0) return null;
  const w = plan.workouts[wi];
  // The Edit sheet can also rename the workout: the new name travels as one extra row [RENAME_ROW_KEY, name] (so both tabs,
  // which pass the rows straight through, save it without any change). It is the same name every screen shows (splitLabel).
  const renameRow = allRows.find(r => r[0] === RENAME_ROW_KEY);
  const rows = allRows.filter(r => r[0] !== RENAME_ROW_KEY);
  const newName = renameRow ? String(renameRow[1] ?? '').trim().slice(0, 40) : '';
  const renamed = newName.length > 0 && newName !== w.splitLabel;
  const pool = [...w.exercises];
  const rest = w.exercises[0]?.restSeconds ?? 60;
  const next: PlannedExercise[] = [];
  for (const [name, setsText] of rows) {
    const k = pool.findIndex(e => norm(e.displayName) === norm(name));
    if (k >= 0) { next.push(pool.splice(k, 1)[0]); continue; }
    const def = resolveExercise(name);
    if (!def) continue;
    const sr = parseSetsReps(setsText);
    next.push({
      exerciseId: def.id, displayName: def.displayName,
      targetSets: sr ? sr[0] : def.defaultSets, targetReps: sr ? sr[1] : def.defaultReps,
      restSeconds: rest, currentVariationId: def.id,
    });
  }
  const same = next.length === w.exercises.length && next.every((e, i) => e === w.exercises[i]);
  if (same && !renamed) return null;
  const workouts: Workout[] = plan.workouts.map((x, i) => (i === wi ? { ...x, exercises: next, ...(renamed ? { splitLabel: newName } : null) } : x));
  return { ...plan, workouts };
}
