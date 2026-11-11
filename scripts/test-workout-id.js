#!/usr/bin/env node
/**
 * scripts/test-workout-id.js
 * The workout preview has ONE param path for its callers (checked on the real source files):
 *   My workouts  -> /workout?id=<id> or /workout?template=<tpl id> : that workout, with Start
 *   Train preview -> /workout?id=<id>&preview=1                    : that workout, no Start (not today)
 * and with neither it is still the next workout.
 */
const fs = require('fs'), path = require('path');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const w = read('app', 'workout', 'index.tsx'), mw = read('app', 'my-workouts.tsx'), tr = read('app', '(tabs)', 'train.tsx');
check('no merge markers left', !/^(<<<<<<<|=======|>>>>>>>)/m.test(w));
check('the screen reads its params once: id, preview, template', (w.match(/useLocalSearchParams</g) || []).length === 1 && /const \{ id, preview, template \}\s*= useLocalSearchParams/.test(w));
check('a template is that template; with an id that workout; without, the next in the plan', /\(template \? templateWorkout\(template\) : null\) \?\? \(id \? usePlanStore\.getState\(\)\.plan\?\.workouts\.find\(w => w\.id === id\) : null\) \?\? getNext\(\)/.test(w));
check('My workouts opens a workout by id, or a FormPal template by template id', /pathname: '\/workout', params: isTemplateId\(String\(m\.id\)\) \? \{ template: String\(m\.id\) \} : \{ id: String\(m\.id\) \}/.test(mw));
check('Train opens a future day as /workout?id=<id>&preview=1, and the screen has no Start button for it', /params: \{ id: to\.slice\('preview:'\.length\), preview: '1' \}/.test(tr) && /const previewOnly = preview === '1'/.test(w) && /\{!previewOnly && \(/.test(w));
console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
