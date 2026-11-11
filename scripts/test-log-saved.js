#!/usr/bin/env node
/**
 * scripts/test-log-saved.js
 * Log a session: after Save a short "Session logged" check shows (success haptic) BEFORE Today's progress opens.
 * Source order check (React Native can't run under node); the phone log proves it live:
 * "[LOG-SESSION] saved N exercises - showing the Session logged check", then "[LOG-SESSION] check done - opening ..." about 1s later.
 */
const fs = require('fs');
const path = require('path');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const ls = fs.readFileSync(path.join(__dirname, '..', 'app/log-session.tsx'), 'utf8').replace(/\r\n/g, '\n');
const save = ls.slice(ls.indexOf('const save = useCallback'), ls.indexOf('const onMessage'));
check('Save writes the session log FIRST, then plays the success haptic and shows the check', save.indexOf('await appendSessions') > 0 && save.indexOf('await appendSessions') < save.indexOf('hapticSuccess()') && save.indexOf('hapticSuccess()') < save.indexOf('setLoggedTs(ts)'));
check('Save itself no longer opens Today\'s progress (that happens only after the check)', !/router\.replace/.test(save));
check('the check says "Session logged" and then opens Today\'s progress for that session (mode logged, its ts)', ls.includes('<SavedCheck text="Session logged" onDone={onLoggedDone} />') && /router\.replace\(\{ pathname: '\/recap' as any, params: \{ mode: 'logged', ts: String\(loggedTs\) \} \}\)/.test(ls));
check('a second tap while saving does nothing', save.includes('if (saving.current) return;'));
check('log lines prove it on the phone', ls.includes('[LOG-SESSION] saved') && ls.includes('[LOG-SESSION] check done'));
console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
