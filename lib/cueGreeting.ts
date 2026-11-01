/**
 * lib/cueGreeting.ts
 *
 * Cue's first chat bubble. The Claude-Design artboard (assets/app screens/cue.html)
 * ships a demo greeting ("Today is Full body, 38 minutes...") — this replaces it
 * with the user's real workout for today, or a plain greeting when there's no plan.
 * Pure (no RN) so it can be tested directly.
 */
import type { Plan } from '../types/plan';

export function buildCueGreeting(plan: Plan | null): string {
  const w = plan && plan.workouts.length > 0 ? (plan.workouts[plan.currentWorkoutIndex] ?? plan.workouts[0]) : null;
  if (!w || w.exercises.length === 0) {
    return "Hey, I'm Cue, your form coach. Ask me about your training, your form, or building a plan.";
  }
  const n = w.exercises.length;
  const sets = w.exercises.reduce((a, e) => a + e.targetSets, 0);
  return `Hey! Today is ${w.splitLabel}: ${n} exercise${n === 1 ? '' : 's'}, ${sets} sets. Want me to change anything about it?`;
}

/** JS to run in the Cue page: sets the first bubble's text (page defines window.__cueSetGreeting). */
export function cueGreetingInjectJs(text: string): string {
  return `window.__cueSetGreeting && window.__cueSetGreeting(${JSON.stringify(text)}); true;`;
}
