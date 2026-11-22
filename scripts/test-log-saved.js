#!/usr/bin/env node
/**
 * scripts/test-log-saved.js
 * Log a session: after Save the done screen ("Session logged", Ari's design via components/DoneHost.tsx) shows BEFORE Today's progress opens.
 * Source order check (React Native can't run under node); the phone log proves it live:
 * "[LOG-SESSION] saved N exercises - showing the done screen", then "[LOG-SESSION] done screen finished - opening ..." after Continue.
 * (The look and the words of the done screen are tested in scripts/test-done-screen.js.)
 */
const fs = require('fs');
const path = require('path');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const ls = fs.readFileSync(path.join(__dirname, '..', 'app/log-session.tsx'), 'utf8').replace(/\r\n/g, '\n');
const save = ls.slice(ls.indexOf('const save = useCallback'), ls.indexOf('const onMessage'));
check('Save writes the session log FIRST, then shows the done screen AT ONCE; the week count is worked out behind it and fills in the grey line (round 7)', save.indexOf('await appendSessions') > 0 && save.indexOf('await appendSessions') < save.indexOf('showDone(') && /subtitle: currentWeek\(\)\.then\(/.test(save) && !/await currentWeek\(\)/.test(save));
check('Save itself does not open Today\'s progress (that happens only when Continue is tapped)', !/router\.replace/.test(save.slice(0, save.indexOf('onContinue'))));
check('the done screen says "Session logged" with the real exercises, reps and week, and Continue opens Today\'s progress for that session (mode logged, its ts)', /DONE_TITLES\.logged/.test(save) && /loggedDoneLine\(/.test(save) && /router\.replace\(\{ pathname: '\/recap' as any, params: \{ mode: 'logged', ts: String\(ts\) \} \}\)/.test(save));
check('a second tap while saving does nothing', save.includes('if (saving.current) return;'));
check('the success haptic is the done screen\'s, one only', !/hapticSuccess\(\)/.test(save));
check('log lines prove it on the phone', ls.includes('[LOG-SESSION] saved') && ls.includes('[LOG-SESSION] done screen finished'));
console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
