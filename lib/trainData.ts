/**
 * lib/trainData.ts
 *
 * Pure adapter for the Train tab (assets/app screens/traintab.html): turns the real plan + real session log into
 * the data the design's own logic renders (see TRAIN_LOGIC_EXT in app/(tabs)/train.tsx). No React / RN, so
 * scripts/test-train.js runs the exact shipped code under node.
 *
 * The design shows seven day cards with TODAY in slot 5 (index 5) and tomorrow in slot 6: its own scrolling logic is
 * written around that (it centres card 5 on open). So the week is a rolling window, five days back through
 * tomorrow, and the calendar strip above it is the same seven days.
 */
import { EXERCISE_CATALOG } from '../constants/exercises';
import { groupIntoWorkouts, calcStreak, type SessionEntry, type WorkoutGroup } from './sessionLog';
import type { Plan, Workout } from '../types/plan';

export interface TrainDay {
  short: string;          // "Mon"
  name: string;           // "Full body" | "Rest day"
  meta: string;           // "38 min · 4 exercises" | "Recover for Wednesday"
  done?: boolean;
  rest?: boolean;
  href: string;           // what the main button does ("tr:start" | "tr:recap:<ts>" | "tr:myworkouts" | "tr:none")
  restHref: string;       // what a rest card's button does
}

export interface TrainData {
  insets: { top: number; bottom: number };
  streak: number;
  cal: [string, number][];                       // the strip: ["Mon", 7] x7
  days: TrainDay[];                              // 7 cards, today = 5
  moves: Record<string, [string, string][]>;     // day name -> [exercise, "3 × 10"] (the Edit sheet's rows)
  lib: [string, string][];                       // Practice Exercises: [name, "Quads · Glutes"]
  libIds: Record<string, string>;                // name -> exercise id (what Check form opens)
  myWorkouts: { name: string; meta: string }[];  // the My Workouts rail (up to 3 cards)
}

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOT = ' · ';
const TIMES = ' × ';

const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function workoutMinutes(w: Workout): number {
  return Math.max(10, Math.round(w.exercises.reduce((a, e) => a + e.targetSets * (e.restSeconds + 40), 0) / 60));
}
export const plannedMeta = (w: Workout) => `${workoutMinutes(w)} min${DOT}${plural(w.exercises.length, 'exercise')}`;
const plannedRows = (w: Workout): [string, string][] => w.exercises.map(e => [e.displayName, `${e.targetSets}${TIMES}${e.targetReps}`]);

/** The plan workout a finished group most resembles (most exercises in common), else a name from its own entries. */
function nameForGroup(g: WorkoutGroup, plan: Plan | null): string {
  const ids = new Set(g.entries.map(e => e.exerciseId));
  let best: Workout | null = null, bestN = 0;
  for (const w of plan?.workouts ?? []) {
    const n = w.exercises.filter(e => ids.has(e.exerciseId)).length;
    if (n > bestN) { best = w; bestN = n; }
  }
  if (best) return best.splitLabel;
  const first = g.entries[0]?.displayName ?? 'Workout';
  return g.entries.length > 1 ? `${first} +${g.entries.length - 1}` : first;
}
const groupMeta = (g: WorkoutGroup) => `${plural(g.entries.length, 'exercise')}${DOT}${plural(g.totalReps, 'rep')}`;
const groupRows = (g: WorkoutGroup): [string, string][] => g.entries.map(e => [e.displayName, plural(e.reps, 'rep')]);

/** Popular first, then the rest of the catalogue: the list shows 5 until you search. */
const FIRST = ['squat', 'pushup', 'pullup', 'lunge', 'shoulderPress', 'deadlift', 'curl', 'row'];
export function practiceLibrary(): { lib: [string, string][]; libIds: Record<string, string> } {
  const cat = EXERCISE_CATALOG as unknown as { id: string; displayName: string; muscles: unknown[] }[];
  const rank = (id: string) => { const i = FIRST.indexOf(id); return i < 0 ? 999 : i; };
  const sorted = [...cat].sort((a, b) => rank(a.id) - rank(b.id));
  const lib: [string, string][] = [], libIds: Record<string, string> = {};
  for (const def of sorted) {
    if (libIds[def.displayName]) continue; // names are the row keys
    const muscles = def.muscles.map((m: any) => String(typeof m === 'string' ? m : m?.muscle ?? '')).filter(Boolean)
      .slice(0, 2).map(s => s.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim());
    lib.push([def.displayName, muscles.join(DOT) || 'Full body']);
    libIds[def.displayName] = def.id;
  }
  return { lib, libIds };
}

export function buildTrainData(
  plan: Plan | null,
  sessions: SessionEntry[],
  insets: { top: number; bottom: number } = { top: 0, bottom: 0 },
  now: Date = new Date(),
): TrainData {
  const today = dayStart(now);
  const groups = groupIntoWorkouts(sessions);
  const byDay = new Map<string, WorkoutGroup>();
  for (const g of groups) { const k = keyOf(new Date(g.ts)); if (!byDay.has(k)) byDay.set(k, g); } // newest of the day
  const workouts = plan?.workouts ?? [];
  const cur = workouts.length ? Math.max(0, Math.min(workouts.length - 1, plan!.currentWorkoutIndex ?? 0)) : -1;
  const todayDone = byDay.has(keyOf(today));
  // today's planned workout; tomorrow's is the next one (or the same one again once today's is done and the plan has moved on)
  const todayW = cur >= 0 && !todayDone ? workouts[cur] : null;
  const tomorrowW = cur >= 0 ? workouts[todayDone ? cur : (cur + 1) % workouts.length] : null;

  const moves: Record<string, [string, string][]> = {};
  const days: TrainDay[] = [];
  const cal: [string, number][] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i - 5);
    cal.push([SHORT[date.getDay()], date.getDate()]);
    const nextName = LONG[addDays(date, 1).getDay()];
    const g = byDay.get(keyOf(date));
    if (i <= 5 && g) {
      const name = nameForGroup(g, plan);
      moves[name] = groupRows(g);
      days.push({ short: SHORT[date.getDay()], name, meta: groupMeta(g), done: true, href: `tr:recap:${g.ts}`, restHref: 'tr:log' });
    } else if (i === 5) {
      if (todayW) {
        moves[todayW.splitLabel] = plannedRows(todayW);
        days.push({ short: SHORT[date.getDay()], name: todayW.splitLabel, meta: plannedMeta(todayW), href: 'tr:start', restHref: 'tr:start' });
      } else {
        days.push({ short: SHORT[date.getDay()], name: 'Rest day', meta: cur < 0 ? 'Build a plan to get started' : 'Recover for tomorrow', rest: true, href: 'tr:start', restHref: 'tr:start' });
      }
    } else if (i === 6) {
      if (tomorrowW) {
        moves[tomorrowW.splitLabel] = moves[tomorrowW.splitLabel] ?? plannedRows(tomorrowW);
        days.push({ short: SHORT[date.getDay()], name: tomorrowW.splitLabel, meta: plannedMeta(tomorrowW), href: 'tr:myworkouts', restHref: 'tr:none' });
      } else {
        days.push({ short: SHORT[date.getDay()], name: 'Rest day', meta: 'Recover for ' + LONG[addDays(date, 1).getDay()], rest: true, href: 'tr:none', restHref: 'tr:none' });
      }
    } else {
      days.push({ short: SHORT[date.getDay()], name: 'Rest day', meta: 'Recover for ' + nextName, rest: true, href: 'tr:none', restHref: 'tr:log' });
    }
  }
  // the Edit sheet looks rows up by the card's name and falls back to "Full body"
  moves['Full body'] = moves['Full body'] ?? (todayW ? plannedRows(todayW) : tomorrowW ? plannedRows(tomorrowW) : []);

  const { lib, libIds } = practiceLibrary();
  return {
    insets, streak: calcStreak(sessions), cal, days, moves, lib, libIds,
    myWorkouts: workouts.slice(0, 3).map(w => ({ name: w.splitLabel, meta: plural(w.exercises.length, 'exercise') })), // short, like the design's "42 min" (a longer line wraps and moves everything below)
  };
}
