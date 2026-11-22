/**
 * lib/goalDetail.ts
 *
 * The data behind the goal pages (tap a ring on Home): the goal in depth: this week by day and the past weeks. Pure maths
 * (tested), built on lib/homeRings.ts so the page and the ring can never disagree.
 */
import { groupIntoWorkouts, workoutSessions, type SessionEntry } from './sessionLog';
import { weekBounds } from './weeklyGoal';
import { homeRings, FORM_GOAL, MUSCLE_TOTAL, type Ring } from './homeRings';
import { workedMuscles } from './muscleRanksData';
import { MUSCLE_DISPLAY_ORDER } from '../components/MuscleTierMap';

export type GoalId = 'workouts' | 'form' | 'muscles';
export const GOAL_COLORS: Record<GoalId, [string, string]> = { workouts: ['#ffb03a', '#ff6a1a'], form: ['#a99bff', '#7c6bf0'], muscles: ['#59d18a', '#26a85f'] };
export const isGoalId = (x: unknown): x is GoalId => x === 'workouts' || x === 'form' || x === 'muscles';

export interface DayCell { label: string; text: string; fill: number; today: boolean; future: boolean }
export interface WeekCell { label: string; text: string; fill: number; current: boolean; done: boolean }
export interface GoalDetail {
  id: GoalId;
  title: string;
  ring: Ring;
  /** the one-line state: "2 of 4 workouts this week, 2 to go" */
  summary: string;
  days: DayCell[];
  weeks: WeekCell[];
  /** muscles page only: the 11 muscles and whether each was trained this week */
  muscles?: { name: string; hit: boolean }[];
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pretty = (m: string) => m.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const DAY = 86400000;

export function goalDetail(id: GoalId, allSessions: SessionEntry[], weeklyGoal: number, now: number = Date.now()): GoalDetail {
  const { start } = weekBounds(now);
  const sessions = workoutSessions(allSessions);
  const cur = homeRings(allSessions, weeklyGoal, now);
  const ring = cur.rings.find(r => r.id === id)!;
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

  // ── this week, day by day ──
  const days: DayCell[] = DAYS.map((label, i) => {
    const d0 = new Date(start); d0.setDate(d0.getDate() + i);
    const lo = d0.getTime(), hi = new Date(lo).setDate(d0.getDate() + 1);
    const today = lo === todayStart.getTime(), future = lo > todayStart.getTime();
    const ofDay = sessions.filter(s => s.ts >= lo && s.ts < hi);
    if (id === 'workouts') {
      const n = groupIntoWorkouts(ofDay).length;
      return { label, text: n ? String(n) : (future ? '' : '0'), fill: clamp01(n / 2), today, future };
    }
    if (id === 'form') {
      let reps = 0, good = 0; for (const e of ofDay) { if (e.formChecked === false) continue; reps += e.reps; good += e.goodReps; }
      const pct = reps ? Math.round(good / reps * 100) : null;
      return { label, text: pct == null ? (future ? '' : '–') : pct + '%', fill: pct == null ? 0 : clamp01(pct / 100), today, future };
    }
    const hit = new Set<string>();
    for (const g of groupIntoWorkouts(ofDay)) for (const w of workedMuscles(g.entries)) if (MUSCLE_DISPLAY_ORDER.includes(w.muscle)) hit.add(w.muscle);
    return { label, text: hit.size ? String(hit.size) : (future ? '' : '0'), fill: clamp01(hit.size / MUSCLE_TOTAL), today, future };
  });

  // ── the past weeks (this one and the 7 before it) ──
  const weeks: WeekCell[] = [];
  for (let k = 0; k < 8; k++) {
    const ws = new Date(start); ws.setDate(ws.getDate() - 7 * k);
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    const r = homeRings(allSessions, weeklyGoal, ws.getTime() + 3 * DAY).rings.find(x => x.id === id)!;
    const label = `${MON[ws.getMonth()]} ${ws.getDate()} – ${ws.getMonth() === we.getMonth() ? '' : MON[we.getMonth()] + ' '}${we.getDate()}`;
    weeks.push({ label: k === 0 ? 'This week' : label, text: r.text, fill: r.fill, current: k === 0, done: r.done });
  }

  const left = Math.max(0, ring.goal - ring.value);
  let title: string, summary: string;
  if (id === 'workouts') {
    title = 'Workouts';
    summary = ring.value >= ring.goal ? `Goal reached: ${ring.value} of ${ring.goal} workouts this week${ring.value > ring.goal ? ` (+${ring.value - ring.goal} bonus)` : ''}` : `${ring.value} of ${ring.goal} workouts this week, ${left} to go`;
    return { id, title, ring, summary, days, weeks };
  }
  if (id === 'form') {
    title = 'Form';
    summary = ring.value === 0 ? 'No form-checked reps yet this week' : ring.value >= FORM_GOAL ? `${ring.value}% clean reps this week: goal reached` : `${ring.value}% clean reps this week, ${FORM_GOAL - ring.value} points to the ${FORM_GOAL}% goal`;
    return { id, title, ring, summary, days, weeks };
  }
  title = 'Muscles';
  const hit = new Set<string>();
  for (const g of groupIntoWorkouts(sessions.filter(s => s.ts >= start && s.ts < weekBounds(now).end))) for (const w of workedMuscles(g.entries)) hit.add(w.muscle);
  summary = ring.value >= MUSCLE_TOTAL ? `All ${MUSCLE_TOTAL} muscles trained this week` : `${ring.value} of ${MUSCLE_TOTAL} muscles trained this week, ${left} to go`;
  return { id, title, ring, summary, days, weeks, muscles: MUSCLE_DISPLAY_ORDER.map(m => ({ name: pretty(String(m)), hit: hit.has(m) })) };
}
