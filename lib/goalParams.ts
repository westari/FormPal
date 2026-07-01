/**
 * lib/goalParams.ts
 *
 * Maps (goal, experience) → training parameters.
 * This is the "exercise science" layer — every number here has a reason.
 * Edit this file to tune the algorithm; the generator + progression just consume it.
 *
 * Sources:
 *   Strength  — Zatsiorsky & Kraemer (2006): neural adaptation peaks at 1–6 rep range
 *   Hypertrophy/Toned — Schoenfeld (2010): optimal 6–12 reps + metabolic stress
 *   General   — ACSM guidelines (2011): 8–12 reps balances strength + endurance stimulus
 *   Weightloss — Paoli et al. (2012): circuit/high-rep maximises EPOC and calorie burn
 */

import type { Goal, Experience } from '../types/plan';

export interface TrainingParams {
  // Goal-appropriate rep range. Progression advances toward repRange[1].
  repRange:     [number, number];
  // Goal-appropriate set range. Progression advances toward setRange[1].
  setRange:     [number, number];
  // Rest between sets (seconds).
  restSeconds:  number;
  // Starting point within the range, adjusted for experience level.
  startReps:    number;
  startSets:    number;
}

// Per-goal base params (experience-agnostic)
const BASE_PARAMS: Record<Goal, Omit<TrainingParams, 'startReps' | 'startSets'>> = {
  // Low reps, high sets, long rest — maximum force development
  strength: {
    repRange:    [4, 8],
    setRange:    [3, 5],
    restSeconds: 120,
  },
  // Moderate reps + sets — muscle definition without excessive volume
  toned: {
    repRange:    [10, 15],
    setRange:    [3, 4],
    restSeconds: 60,
  },
  // Balanced — the default for "just get fit"
  general: {
    repRange:    [8, 12],
    setRange:    [3, 4],
    restSeconds: 90,
  },
  // High reps, short rest — maximise calorie burn and metabolic stress
  weightloss: {
    repRange:    [12, 20],
    setRange:    [3, 4],
    restSeconds: 30,
  },
};

// Experience adjusts where within the range a new plan starts
// (beginners start low; advanced users start higher and need more volume to grow)
function experienceOffset(experience: Experience): { repOffset: number; setOffset: number } {
  switch (experience) {
    case 'beginner':     return { repOffset: 0,    setOffset: 0    };
    case 'intermediate': return { repOffset: 0.33, setOffset: 0.33 };  // ~⅓ up the range
    case 'advanced':     return { repOffset: 0.67, setOffset: 0.67 };  // ~⅔ up the range
  }
}

export function goalParams(goal: Goal, experience: Experience): TrainingParams {
  const base    = BASE_PARAMS[goal];
  const offset  = experienceOffset(experience);

  const repSpan = base.repRange[1] - base.repRange[0];
  const setSpan = base.setRange[1] - base.setRange[0];

  const startReps = Math.round(base.repRange[0] + repSpan * offset.repOffset);
  const startSets = Math.round(base.setRange[0] + setSpan * offset.setOffset);

  return { ...base, startReps, startSets };
}
