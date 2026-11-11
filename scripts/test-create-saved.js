#!/usr/bin/env node
/**
 * scripts/test-create-saved.js
 *
 * Create workout: after Save a short check + "Workout saved" shows BEFORE the screen leaves (it used to close at once).
 * React Native can't run under node, so this checks the exact source order and timing; the phone log proves it live:
 * "[CREATE] workout saved ... showing the Workout saved check", then "[CREATE] leaving after the saved check" about 1s later.
 */
const fs = require('fs');
const path = require('path');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const cw = read('app/create-workout.tsx'), sc = read('components/SavedCheck.tsx');

const saveBody = cw.slice(cw.indexOf('const save = useCallback'), cw.indexOf('const onMessage'));
check('Save writes the plan FIRST, then shows the check (it never leaves before the plan is saved)', saveBody.indexOf('await savePlan') > 0 && saveBody.indexOf('await savePlan') < saveBody.indexOf('setSaved(true)'));
check('Save itself no longer calls router.back (leaving happens only after the check)', !/router\.back\(\)/.test(saveBody));
check('the check leaves via onSavedDone -> router.back()', /onSavedDone = useCallback\(\(\) => \{[^}]*router\.back\(\)/.test(cw) && cw.includes('<SavedCheck text="Workout saved" onDone={onSavedDone} />'));
check('a success haptic plays with the check', saveBody.includes('hapticSuccess()'));
check('a second tap on Save while saving does nothing, and a failed save lets you try again', saveBody.includes('if (saving.current) return;') && (saveBody.match(/saving\.current = false/g) || []).length >= 3);
const hold = parseInt((/SAVED_CHECK_HOLD_MS = (\d+)/.exec(sc) || [])[1], 10);
check('the check holds about a second (long enough to read, short enough not to drag): ' + hold + ' ms', hold >= 700 && hold <= 1500);
check('the check says it in plain words, with a big green check mark', sc.includes('checkmark') && sc.includes('#34c759'));
check('log lines prove it on the phone', cw.includes("[CREATE] workout saved") && cw.includes("[CREATE] leaving after the saved check"));
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
