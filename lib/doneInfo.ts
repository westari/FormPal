/**
 * lib/doneInfo.ts
 *
 * The grey line under the title of the done screen (components/DoneHost.tsx): REAL, useful information for that moment, never filler.
 * Pure functions (tested). Each returns one short sentence or two.
 */
import { groupIntoWorkouts, workoutSessions, type SessionEntry } from './sessionLog';
import { weekProgress } from './weeklyGoal';

export type DoneKind = 'workout' | 'formCheck' | 'logged' | 'created' | 'weight';
export const DONE_TITLES: Record<DoneKind, string> = {
  workout: 'Workout complete',
  formCheck: 'Form check complete',
  logged: 'Session logged',
  created: 'Workout created',
  weight: 'Weight logged',
};

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** "3 of 4 this week", "Weekly goal reached: 4 of 4" (+ bonus). */
export function weekLine(w: { count: number; goal: number }): string {
  const done = Math.min(w.count, w.goal);
  if (w.count >= w.goal) return `Weekly goal reached: ${done} of ${w.goal}${w.count > w.goal ? `, +${w.count - w.goal} bonus` : ''}.`;
  return `${done} of ${w.goal} this week.`;
}

/** Is this workout's form score the best of all the earlier workouts (and are there earlier ones)? */
export function isNewBestForm(allSessions: SessionEntry[], ts: number): { best: boolean; pct: number } {
  const groups = groupIntoWorkouts(workoutSessions(allSessions)).filter(g => g.entries.some(e => e.formChecked !== false));
  const mine = groups.find(g => g.ts === ts);
  if (!mine) return { best: false, pct: 0 };
  const earlier = groups.filter(g => g.ts < ts);
  return { best: earlier.length > 0 && mine.pct > Math.max(...earlier.map(g => g.pct)), pct: mine.pct };
}

export function workoutDoneLine(o: { reps: number; goodReps: number; scored: boolean; durationSec?: number; newBestPct?: number | null; week?: { count: number; goal: number } | null }): string {
  const pct = o.reps > 0 ? Math.round((o.goodReps / o.reps) * 100) : 0;
  let a = o.scored && o.reps > 0 ? `${plural(o.reps, 'rep')}, ${pct}% clean` : plural(o.reps, 'rep');
  if (o.durationSec && o.durationSec >= 60) a += ` in ${Math.round(o.durationSec / 60)} min`;
  a += '.';
  const b = o.newBestPct != null ? `New best form: ${o.newBestPct}%.` : o.week ? weekLine(o.week) : '';
  return b ? `${a} ${b}` : a;
}

export function formCheckDoneLine(o: { exerciseName?: string; reps: number; goodReps: number }): string {
  const name = o.exerciseName ? `${o.exerciseName}: ` : '';
  if (o.reps <= 0) return `${name}no reps were counted this time.`;
  return `${name}${plural(o.reps, 'rep')}, ${Math.round((o.goodReps / o.reps) * 100)}% clean.`;
}

export function loggedDoneLine(o: { exercises: number; reps: number; week?: { count: number; goal: number } | null }): string {
  const a = `${plural(o.exercises, 'exercise')}, ${plural(o.reps, 'rep')}.`;
  return o.week ? `${a} ${weekLine(o.week)}` : a;
}

export function createdDoneLine(o: { name: string; exercises: number; minutes: number }): string {
  return `${o.name}: ${plural(o.exercises, 'exercise')}, about ${o.minutes} min. It is next in your plan.`;
}

export function weightDoneLine(o: { weightLb: number; prevLb?: number | null; kg?: boolean }): string {
  const fmt = (lb: number) => (o.kg ? `${(lb / 2.2046).toFixed(1)} kg` : `${(Math.round(lb * 10) / 10).toFixed(1)} lb`);
  if (o.prevLb == null) return `${fmt(o.weightLb)}. Your first weigh-in.`;
  const d = Math.round((o.weightLb - o.prevLb) * 10) / 10;
  if (d === 0) return `${fmt(o.weightLb)}, the same as last time.`;
  return `${fmt(o.weightLb)}, ${d < 0 ? 'down' : 'up'} ${fmt(Math.abs(d))} since last time.`;
}

/** The week count for the lines above (camera workouts and logged sessions; practice excluded). */
export function weekCount(sessions: SessionEntry[], goal: number, now?: number): { count: number; goal: number } {
  const p = weekProgress(sessions, goal, now);
  return { count: p.count, goal: p.goal };
}
