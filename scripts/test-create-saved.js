#!/usr/bin/env node
/**
 * scripts/test-create-saved.js
 *
 * Create workout: after Save the done screen ("Workout created", Ari's design via components/DoneHost.tsx) shows BEFORE the screen leaves.
 * React Native can't run under node, so this checks the exact source order; the phone log proves it live:
 * "[CREATE] workout saved ... showing the done screen", then "[CREATE] leaving after the done screen" when Continue is tapped.
 * (The look and the words of the done screen itself are tested in scripts/test-done-screen.js.)
 */
const fs = require('fs');
const path = require('path');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split('\r\n').join('\n');
const cw = read('app/create-workout.tsx');

const saveBody = cw.slice(cw.indexOf('const save = useCallback'), cw.indexOf('const onMessage'));
check('Save writes the plan FIRST, then shows the done screen (it never leaves before the plan is saved)', saveBody.indexOf('await savePlan') > 0 && saveBody.indexOf('await savePlan') < saveBody.indexOf('showDone('));
check('Save itself does not leave the screen (leaving happens only when Continue is tapped on the done screen)', !/router\.back\(\)/.test(saveBody.slice(0, saveBody.indexOf('onContinue'))) && /onContinue: \(\) => \{[^}]*router\.back\(\)/.test(saveBody));
check('the done screen says "Workout created" with the real workout (name, exercises, length)', /DONE_TITLES\.created/.test(saveBody) && /createdDoneLine\(\{ name: workout\.splitLabel, exercises: workout\.exercises\.length, minutes: workoutMinutes\(workout\) \}\)/.test(saveBody));
check('the success haptic is the done screen\'s (one, when its title appears), not a second one here', !/hapticSuccess\(\)/.test(saveBody) && /hapticSuccess\(\)/.test(read('components/DoneHost.tsx')));
check('a second tap on Save while saving does nothing, and a failed save lets you try again', saveBody.includes('if (saving.current) return;') && (saveBody.match(/saving\.current = false/g) || []).length >= 3);
check('the old SavedCheck is not used here any more', !/SavedCheck/.test(cw));
check('log lines prove it on the phone', cw.includes('[CREATE] workout saved') && cw.includes('[CREATE] leaving after the done screen'));
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
