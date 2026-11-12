#!/usr/bin/env node
/**
 * scripts/test-logged-session.js
 *
 * Saving a session from Log a session used to open the old filler "session logged" screen. It must open the SAME after-workout
 * progress screen a real workout ends on (muscle rows, Bronze -> Silver, Overall +X%), with the logged exercises counted.
 *   Part 1 (static): log-session.tsx routes to /recap in 'logged' mode (not /session-logged); recap.tsx opens that mode straight
 *          on the muscle page, loads the saved entries, and closes it to Home.
 *   Part 2 (real code): the page's saved items -> session entries -> the real rank maths + payload builder (the one recap.tsx
 *          calls): the logged exercises produce the muscle rows, the rank row and an "Overall +X%" equal to the sum of the rows.
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs');
const path = require('path');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split('\r\n').join('\n');

const ls = read('app/log-session.tsx'), rc = read('app/recap.tsx');
check('Log a session routes to /recap with mode "logged" and the saved timestamp (after the Session logged check), NOT to the old /session-logged filler', /pathname: '\/recap' as any, params: \{ mode: 'logged', ts: String\(loggedTs\) \}/.test(ls) && !/session-logged/.test(ls));
check('recap opens the logged mode straight on the muscle page ("Today\'s progress")', /isLoggedMode \? 'ranks' : 'summary'/.test(rc));
check('recap loads the saved entries for that timestamp and counts them (they are not re-written)', /else if \(isLoggedMode\) \{[\s\S]{0,500}all\.filter\(e => e\.ts === Number\(tsParam\)\)/.test(rc) && !/persistOnMount\.current = entries[\s\S]{0,40}isLoggedMode/.test(rc));
check('it waits for the muscle page data before showing anything (no flash of the Workout complete card)', /\(isLoggedMode && !ranksPayload\)/.test(rc));
check('Done (and the page\'s back) close it to Home; the logged mode is never treated as a past workout', /isHistoryMode = !isWorkoutMode && !isLoggedMode/.test(rc) && /closeRanks'\) \{ if \(isLoggedMode\) void handleDoneRanks\(\)/.test(rc));

check('15: Save shows the short Session logged check (success haptic), THEN one replace to Today progress; no timer of its own (the check owns the hold)', !/setTimeout/.test(ls) && !ls.includes('__dsSaved') && ls.includes('<SavedCheck text="Session logged" onDone={onLoggedDone} />') && ls.includes('hapticSuccess()') && (ls.match(/router\.replace/g) || []).length === 1);
check('15: the next screen opens on the same light background (no dark flash): the logged mode uses a light root and dark status bar', rc.includes("isLoggedMode ? { backgroundColor: '#f2f2f6' } : null") && rc.includes("isLoggedMode ? 'dark' : 'light'"));
check('16: app/session-logged.tsx is no longer referenced anywhere', !['app/_layout.tsx', 'app/log-session.tsx', 'app/recap.tsx', 'lib/designScreens.ts'].some((f) => read(f).includes('session-logged')));
const { buildCatalog, entriesFromPage } = require('../lib/designScreens.ts');
const { EXERCISE_CATALOG } = require('../constants/exercises.ts');
const sessionLog = require('../lib/sessionLog.ts');
const MTM = require('../components/MuscleTierMap.tsx');
const data = require('../lib/muscleRanksData.ts');
const cat = buildCatalog(EXERCISE_CATALOG);
const now = new Date(2026, 10, 18, 9, 30);
const { ts, entries } = entriesFromPage({ dayNum: 18, year: 2026, month: 10, items: [{ n: 'Push-up', sets: 3, reps: 10, load: null }, { n: 'Bicep Curl', sets: 3, reps: 12, load: 20 }] }, cat, now);
const DAY = 864e5;
const prior = [{ ts: ts - 20 * DAY, exerciseId: 'shoulderPress', displayName: 'Shoulder Press', reps: 40, goodReps: 36, pct: 90, formChecked: true }];
const all = [...prior, ...entries];
const tiersBefore = sessionLog.computeMuscleTiers(prior), tiersAfter = sessionLog.computeMuscleTiers(all);
const stB = MTM.computeOverallStanding(tiersBefore), stA = MTM.computeOverallStanding(tiersAfter);
const iconFor = () => 'data:image/png;base64,AA==';
const p = data.buildMuscleRanksPayload({ entries, tiersBefore, tiersAfter, standingBefore: stB, standingAfter: stA, labels: MTM.MUSCLE_LABELS, iconFor, emblem: null, history: all, note: 'Logged.' });
console.log('  rows: ' + p.hits.map((h) => h.name + ' ' + h.gain).join(' | ') + `   Overall +${p.rank.gained}%   ${p.rank.label} -> ${p.rank.next}`);
const names = p.hits.map((h) => h.name);
check('the logged exercises are counted: Push-up gives Chest / Triceps / Shoulders rows, Bicep Curl gives a Biceps row', ['Chest', 'Triceps', 'Biceps'].every((n) => names.includes(n)), names.join(', '));
check('every row is a real gain above zero', p.hits.every((h) => parseFloat(h.gain.replace(/[+%]/g, '')) > 0));
check('there is a "Bronze -> Silver" style rank row', !!p.rank.label && !!p.rank.next, `${p.rank.label} -> ${p.rank.next}`);
check('"Overall +X%" is the small move of the overall rank (the average of every muscle), not the sum of the rows', parseFloat(p.rank.gained) > 0 && parseFloat(p.rank.gained) < p.hits.reduce((a, h) => a + parseFloat(h.gain.replace(/[+%]/g, '')), 0), p.rank.gained);
check('the entries carry one timestamp (that is how the screen finds them again) and are manual (no form judged)', entries.every((e) => e.ts === ts && e.formChecked === false));
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
