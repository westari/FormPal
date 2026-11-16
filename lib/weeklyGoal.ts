/**
 * lib/weeklyGoal.ts
 *
 * The weekly goal: WORKOUTS PER WEEK. Pure maths (no storage), so it can be tested.
 *  - The goal starts from the plan's days per week; if the user picked their own number in Profile > Weekly goal, that wins.
 *  - The week runs Monday to Sunday (local time).
 *  - Camera workouts and logged sessions count; practice form checks (kind: 'practice') do not.
 *  - The count caps at the goal ("4 of 4"); anything beyond it is shown as a bonus ("+2 bonus"), never "6 of 4".
 */
import { groupIntoWorkouts, workoutSessions, type SessionEntry } from './sessionLog';

export const DEFAULT_WEEKLY_GOAL = 3;

/** The goal: the user's own number if they picked one, else the plan's days per week, else the default (3). */
export function resolveWeeklyGoal(planDaysPerWeek: number | null | undefined, userDays: boolean[] | null | undefined): { goal: number; source: 'user' | 'plan' | 'default' } {
  const picked = Array.isArray(userDays) ? userDays.filter(Boolean).length : 0;
  if (picked > 0) return { goal: picked, source: 'user' };
  if (typeof planDaysPerWeek === 'number' && Number.isFinite(planDaysPerWeek) && planDaysPerWeek >= 1) return { goal: Math.min(7, Math.round(planDaysPerWeek)), source: 'plan' };
  return { goal: DEFAULT_WEEKLY_GOAL, source: 'default' };
}

/** Monday 00:00 of the week that contains `now`, and the next Monday 00:00 (local time). */
export function weekBounds(now: number): { start: number; end: number } {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  const back = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - back);
  const start = d.getTime();
  const e = new Date(start); e.setDate(e.getDate() + 7);
  return { start, end: e.getTime() };
}

export interface WeekProgress {
  goal: number;
  /** workouts done this week (camera + logged), not capped */
  count: number;
  /** the count that counts toward the goal: never above the goal */
  done: number;
  /** workouts beyond the goal */
  bonus: number;
  remaining: number;
  reached: boolean;
  /** "2 of 4 workouts", or "4 of 4 workouts · +2 bonus" */
  label: string;
}

export function weekProgress(sessions: SessionEntry[], goal: number, now: number = Date.now()): WeekProgress {
  const { start, end } = weekBounds(now);
  const g = Math.max(1, Math.round(goal));
  const count = groupIntoWorkouts(workoutSessions(sessions)).filter(w => w.ts >= start && w.ts < end).length;
  const done = Math.min(count, g), bonus = Math.max(0, count - g);
  return { goal: g, count, done, bonus, remaining: Math.max(0, g - count), reached: count >= g, label: `${done} of ${g} workout${g === 1 ? '' : 's'}${bonus > 0 ? ` · +${bonus} bonus` : ''}` };
}

/** "4 workouts a week" (Profile). */
export function weeklyGoalLabel(goal: number): string { return `${goal} workout${goal === 1 ? '' : 's'} a week`; }
