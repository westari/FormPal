/**
 * lib/homeRings.ts
 *
 * The three goal rings at the top of Home (pure maths, tested):
 *   Workouts  this week's workouts out of the weekly goal (lib/weeklyGoal.ts)
 *   Form      this week's average form score (reps-weighted, only form-checked exercises); the goal is 90%
 *   Muscles   muscles trained this week out of the 11 shown on the muscle map
 * The week is Monday to Sunday. Camera workouts and logged sessions count; practice form checks do not. A ring that has nothing yet is empty
 * (0), never hidden.
 */
import { groupIntoWorkouts, workoutSessions, type SessionEntry } from './sessionLog';
import { weekBounds, weekProgress } from './weeklyGoal';
import { workedMuscles } from './muscleRanksData';
import { MUSCLE_DISPLAY_ORDER } from '../components/MuscleTierMap';

export const FORM_GOAL = 90;
export const MUSCLE_TOTAL = MUSCLE_DISPLAY_ORDER.length; // 11

export interface Ring {
  id: 'workouts' | 'form' | 'muscles';
  label: string;
  /** 0 to 1: how full the ring is */
  fill: number;
  /** what is in the middle: "2/4", "82%", "5/11" */
  text: string;
  /** the ring is complete (goal reached) */
  done: boolean;
  /** the raw numbers (for tests and the haptic) */
  value: number;
  goal: number;
}

export interface HomeRings { weekStart: number; rings: Ring[] }

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function homeRings(allSessions: SessionEntry[], weeklyGoal: number, now: number = Date.now()): HomeRings {
  const { start, end } = weekBounds(now);
  const sessions = workoutSessions(allSessions);
  const week = sessions.filter(s => s.ts >= start && s.ts < end);

  const wp = weekProgress(sessions, weeklyGoal, now);
  const workouts: Ring = { id: 'workouts', label: 'Workouts', fill: clamp01(wp.done / wp.goal), text: `${wp.done}/${wp.goal}`, done: wp.reached, value: wp.count, goal: wp.goal };

  // form: reps-weighted average over the form-checked exercises of this week
  let reps = 0, good = 0;
  for (const e of week) { if (e.formChecked === false) continue; reps += e.reps; good += e.goodReps; }
  const pct = reps > 0 ? Math.round((good / reps) * 100) : 0;
  const form: Ring = { id: 'form', label: 'Form', fill: clamp01(pct / FORM_GOAL), text: `${pct}%`, done: reps > 0 && pct >= FORM_GOAL, value: pct, goal: FORM_GOAL };

  // muscles: distinct muscles of the map trained this week
  const hit = new Set<string>();
  for (const g of groupIntoWorkouts(week)) for (const w of workedMuscles(g.entries)) if (MUSCLE_DISPLAY_ORDER.includes(w.muscle)) hit.add(w.muscle);
  const muscles: Ring = { id: 'muscles', label: 'Muscles', fill: clamp01(hit.size / MUSCLE_TOTAL), text: `${hit.size}/${MUSCLE_TOTAL}`, done: hit.size >= MUSCLE_TOTAL, value: hit.size, goal: MUSCLE_TOTAL };

  return { weekStart: start, rings: [workouts, form, muscles] };
}

/** Storage key for "this ring already closed this week" (so the success haptic plays only the first time each week). */
export const ringDoneKey = (id: string, weekStart: number) => `formpal_ring_done_${id}_${weekStart}`;

/** Which rings to celebrate: complete now and not yet celebrated this week. */
export function ringsToCelebrate(rings: { id: string; done: boolean }[], alreadyCelebrated: (id: string) => boolean): string[] {
  return rings.filter(r => r.done && !alreadyCelebrated(r.id)).map(r => r.id);
}
