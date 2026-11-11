#!/usr/bin/env node
/**
 * scripts/test-workout-templates.js
 * FormPal's ready-made templates (lib/workoutTemplates.ts): about 6, every exercise from the REAL catalogue with its own default
 * sets and reps, clearly marked as not the user's own.
 */
require('./lib/ts-node-loader.js')();
const T = require('../lib/workoutTemplates.ts');
const { EXERCISE_CATALOG } = require('../constants/exercises.ts');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const ids = new Set(EXERCISE_CATALOG.map(e => e.id));
check('6 templates: Beginner full body, Upper body, Lower body, Push, Pull, Core', T.WORKOUT_TEMPLATES.map(t => t.name).join() === 'Beginner full body,Upper body,Lower body,Push,Pull,Core');
check('every template id starts with tpl- and is unique (so a template is never mistaken for the user\'s own workout)', T.WORKOUT_TEMPLATES.every(t => t.id.startsWith('tpl-')) && new Set(T.WORKOUT_TEMPLATES.map(t => t.id)).size === 6);
check('every exercise in every template is in the real catalogue (nothing invented)', T.WORKOUT_TEMPLATES.every(t => t.exerciseIds.every(x => ids.has(x))), T.WORKOUT_TEMPLATES.flatMap(t => t.exerciseIds).filter(x => !ids.has(x)).join());
check('each has 5 or 6 exercises, none twice', T.WORKOUT_TEMPLATES.every(t => t.exerciseIds.length >= 5 && t.exerciseIds.length <= 6 && new Set(t.exerciseIds).size === t.exerciseIds.length));
const w = T.templateWorkout('tpl-upper');
const sq = EXERCISE_CATALOG.find(e => e.id === 'chestPress');
check('a template becomes a plan Workout with the catalogue\'s own default sets and reps and 60s rest', w && w.id === 'tpl-upper' && w.splitLabel === 'Upper body' && w.exercises[0].exerciseId === 'chestPress' && w.exercises[0].targetSets === sq.defaultSets && w.exercises[0].targetReps === sq.defaultReps && w.exercises.every(e => e.restSeconds === 60), JSON.stringify(w && w.exercises[0]));
check('Push has only push moves, Pull only pull moves (by the catalogue\'s own split tags)', (() => { const tag = (id, c) => EXERCISE_CATALOG.find(e => e.id === id).splitCategories.includes(c); return T.getTemplate('tpl-push').exerciseIds.every(x => tag(x, 'push')) && T.getTemplate('tpl-pull').exerciseIds.every(x => tag(x, 'pull')); })());
check('Lower body is only lower-body moves; Core only moves the catalogue lists as working the core', (() => { const e = id => EXERCISE_CATALOG.find(x => x.id === id); return T.getTemplate('tpl-lower').exerciseIds.every(x => e(x).splitCategories.includes('lower')) && T.getTemplate('tpl-core').exerciseIds.every(x => e(x).muscleGroups.includes('core')); })());
check('an unknown id gives nothing; isTemplateId tells templates from plan workouts', T.templateWorkout('tpl-nope') === null && T.isTemplateId('tpl-push') && !T.isTemplateId('custom-123') && !T.isTemplateId(undefined));
check('the note says what they are: "Ready-made basics for anyone. Not tailored to you."', T.TEMPLATE_NOTE === 'Ready-made basics for anyone. Not tailored to you.');
console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
