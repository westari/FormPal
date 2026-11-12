#!/usr/bin/env node
/**
 * scripts/test-exercise-edit.js
 * The workout preview's pencil: planStore.setExerciseTargets changes ONE exercise's sets and reps in ONE plan workout, saves the
 * plan, and leaves everything else alone. The preview screen wires the pencil to a sheet that calls it (checked on the source).
 */
const fs = require('fs'), path = require('path'), Module = require('module');
require('zustand'); // real packages first: the loader below stubs every other package
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const saved = [];
const origLoad = Module._load;
Module._load = function (req) {
  if (/lib\/planStorage$/.test(req)) return { savePlan: async (p) => { saved.push(p); }, loadPlan: async () => null, saveProfile: async () => {}, loadProfile: async () => null, clearPlan: async () => {} };
  return origLoad.apply(this, arguments);
};
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
(async () => {
  const { usePlanStore } = require('../store/planStore.ts');
  const ex = (id) => ({ exerciseId: id, displayName: id, targetSets: 3, targetReps: 10, restSeconds: 60, currentVariationId: id });
  const plan = { currentWorkoutIndex: 0, progressionState: {}, workouts: [{ id: 'a', exercises: [ex('squat'), ex('lunge')] }, { id: 'b', exercises: [ex('curl')] }] };
  usePlanStore.setState({ plan });
  await usePlanStore.getState().setExerciseTargets('a', 1, 5, 12);
  const p = usePlanStore.getState().plan;
  check('the chosen exercise has the new sets and reps', p.workouts[0].exercises[1].targetSets === 5 && p.workouts[0].exercises[1].targetReps === 12);
  check('the other exercise in that workout is untouched', p.workouts[0].exercises[0].targetSets === 3 && p.workouts[0].exercises[0].targetReps === 10);
  check('other workouts are untouched', p.workouts[1].exercises[0].targetSets === 3 && p.workouts[1].exercises[0].targetReps === 10);
  check('the plan was saved', saved.length === 1 && saved[0].workouts[0].exercises[1].targetReps === 12);
  await usePlanStore.getState().setExerciseTargets('nope', 0, 9, 9);
  check('an unknown workout changes nothing', usePlanStore.getState().plan.workouts.every(w => w.exercises.every(e => e.targetSets !== 9)));

  const w = fs.readFileSync(path.join(__dirname, '..', 'app', 'workout', 'index.tsx'), 'utf8');
  check('each card has a pencil button that opens the sheet', /onEdit=\{\(\) => openEdit\(i\)\}/.test(w) && /onPress=\{onEdit\}/.test(w));
  check('the sheet has Sets and Reps steppers and a Save button', /label="Sets"/.test(w) && /label="Reps"/.test(w) && /accessibilityLabel="Save"/.test(w));
  check('Save writes to the plan workout (not for a template) and Start uses the edited numbers', /setTargets\(workout\.id, editing, draft\.sets, draft\.reps\)/.test(w) && /startSess\(workout\)/.test(w));
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
