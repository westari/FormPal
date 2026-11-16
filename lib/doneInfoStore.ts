/**
 * lib/doneInfoStore.ts
 *
 * The saved data the done screen's line needs (the week against the weekly goal). Maths: lib/doneInfo.ts, lib/weeklyGoal.ts.
 */
import { getAllSessions } from './sessionLog';
import { loadPlan } from './planStorage';
import { loadUserDays } from './weeklyGoalStore';
import { resolveWeeklyGoal } from './weeklyGoal';
import { weekCount } from './doneInfo';

/** This week's count against the weekly goal, from what is saved right now. null if it can not be read. */
export async function currentWeek(): Promise<{ count: number; goal: number } | null> {
  try {
    const [sessions, plan, userDays] = await Promise.all([getAllSessions(), loadPlan().catch(() => null), loadUserDays()]);
    return weekCount(sessions, resolveWeeklyGoal(plan?.profile?.daysPerWeek, userDays).goal);
  } catch { return null; }
}
