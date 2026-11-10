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
check('the screen reads ONE id param (and a preview flag), once', (w.match(/useLocalSearchParams</g) || []).length === 1 && /const \{ id, preview: previewParam \}/.test(w));
check('My workouts opens a workout by id only (Start stays available)', /pathname: '\/workout', params: \{ id: String\(m\.id\) \}/.test(mw) && !/preview/.test(mw));
check('Train\'s preview opens the same screen with id + preview=1', /pathname: '\/workout', params: \{ id: to\.slice\('preview:'\.length\), preview: '1' \}/.test(tr));
check('with an id the workout is that one; without, the next in the plan; a missing preview id shows "not in your plan"', /const workout    = preview \? byId : \(byId \?\? getNext\(\)\)/.test(w) && /not in your plan any more/.test(w));
check('Start shows for a normal open and for today\'s workout in a preview, never for a later day\'s preview', /\(!preview \|\| isCurrent\) && \(/.test(w));
console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
