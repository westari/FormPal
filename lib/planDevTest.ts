/**
 * lib/planDevTest.ts
 *
 * DEV ONLY — shows a sample generated plan in the Metro console.
 *
 * Usage: call runPlanDevTest() once, e.g. from a useEffect in your home screen:
 *
 *   import { runPlanDevTest } from '../../lib/planDevTest';
 *   useEffect(() => { if (__DEV__) runPlanDevTest(); }, []);
 *
 * Expected output (with current 3-exercise catalog, home, general/beginner/3days):
 *   - splitType: 'fullBody'
 *   - 12 workouts (4 weeks × 3 days)
 *   - Each workout: 3 exercises × 3 sets × 8 reps × 90s rest
 *   - Exercise order rotates each session: [squat,pushup,curl] → [pushup,curl,squat] → [curl,squat,pushup]
 *   - After 2 completions of squat, reps advance from 8 → 9
 */

import { generatePlan }   from './planGenerator';
import { goalParams }     from './goalParams';
import { nextProgression } from './progression';
import { getExerciseDef } from '../constants/exercises';
import type { PlanProfile } from '../types/plan';

export function runPlanDevTest(): void {
  console.log('\n══════════════════════════════════════════');
  console.log('  FormPal Plan System — Dev Test');
  console.log('══════════════════════════════════════════\n');

  const profile: PlanProfile = {
    goal:        'general',
    experience:  'beginner',
    daysPerWeek: 3,
    location:    'home',
  };

  const plan = generatePlan(profile);

  console.log('PLAN ID:       ', plan.id);
  console.log('SPLIT TYPE:    ', plan.splitType);
  console.log('PROFILE:       ', JSON.stringify(profile));
  console.log('TOTAL WORKOUTS:', plan.workouts.length, '(4 weeks × 3 days)');
  console.log('');

  // Show the first 3 workouts (1 full week)
  console.log('── Week 1 Workouts ──────────────────────────');
  plan.workouts.slice(0, profile.daysPerWeek).forEach(w => {
    console.log(`\nSession ${w.sessionNumber}: "${w.splitLabel}"`);
    console.log(`  Rationale: ${w.rationale}`);
    w.exercises.forEach(ex => {
      console.log(`  • ${ex.displayName.padEnd(20)} ${ex.targetSets}×${ex.targetReps}  rest ${ex.restSeconds}s`);
    });
  });

  // Show progression state
  console.log('\n── Initial Progression State ───────────────');
  Object.values(plan.progressionState).forEach(s => {
    console.log(`  ${s.exerciseId}: ${s.currentReps} reps × ${s.currentSets} sets (level 0/${2})`);
  });

  // Simulate 3 workout completions for squat to show progression advancing
  console.log('\n── Progression Simulation: Squat ───────────');
  const params   = goalParams(profile.goal, profile.experience);
  const squatDef = getExerciseDef('squat')!;
  let sqState    = plan.progressionState['squat'];

  for (let i = 1; i <= 3; i++) {
    const result = nextProgression(sqState, squatDef, params);
    sqState = result.state;
    console.log(`  After completion ${i}: ${result.message}`);
  }

  console.log('\n══════════════════════════════════════════\n');
}
