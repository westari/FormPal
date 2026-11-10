#!/usr/bin/env node
/**
 * scripts/test-workout-id.js
 * The workout screen has ONE ?id path for both callers (checked on the real source files):
 *   My workouts  -> /workout?id=<id>            : that workout, with Start
 *   Train preview -> /workout?id=<id>&preview=1 : that workout, Start only if it is today's
 * and with no id it is still the next workout.
 */
const fs = require('fs'), path = require('path');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const w = read('app', 'workout', 'index.tsx'), mw = read('app', 'my-workouts.tsx'), tr = read('app', '(tabs)', 'train.tsx');
check('no merge markers left', !/^(<<<<<<<|=======|>>>>>>>)/m.test(w));
check('the screen reads ONE id param, once', (w.match(/useLocalSearchParams</g) || []).length === 1 && /const \{ id \}\s*= useLocalSearchParams/.test(w));
check('with an id the workout is that one; without, the next in the plan', /const workout\s*= \(id \? usePlanStore\.getState\(\)\.plan\?\.workouts\.find\(w => w\.id === id\) : null\) \?\? getNext\(\)/.test(w));
check('My workouts opens a workout by id only', /pathname: '\/workout', params: \{ id: String\(m\.id\) \}/.test(mw));
check('Train has no made-up preview: no preview route, no preview UI on the workout screen', !/preview:/.test(tr) && !/preview/i.test(w));
console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
