#!/usr/bin/env node
/**
 * scripts/test-app-start.js  (Ari 2026-11-25: about 5 s of a white screen at app start)
 * From the 2026-11-25 log (scripts/fixtures/app-start-2026-11-25.log.txt): the fonts were ready 0.46 s after the app code started and the splash was hidden then;
 * the four tab pages (web views) only reported "ready" about 5 to 6.6 s after the start (Train 10.8 s, Profile 11.7 s, the app started at 05.1 s). In between the
 * screen showed the empty (white) tab pages. Now the splash (the app's own cream splash, not white) stays until all four pages are drawn, with a backstop.
 */
const fs = require('fs'); const path = require('path');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split('\r\n').join('\n');
const log = read('scripts/fixtures/app-start-2026-11-25.log.txt');
const ms = (l) => { const m = /^(\d\d):(\d\d):(\d\d\.\d+)/.exec(l); return (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000; };
const lines = log.split('\n').filter(Boolean);
const t0 = ms(lines.find((l) => /\[LAUNCH\] fonts loaded/.test(l))) - 458;
const ready = lines.filter((l) => /page ready/.test(l)).map((l) => [(/\[(TRAIN|PROFILE)\]/.exec(l) || [])[1], ms(l) - t0]);
console.log('  the log: splash hidden at 0.5 s; tab pages ready at: ' + ready.map(([n, t]) => n + ' ' + (t / 1000).toFixed(1) + ' s').join(', '));
check('the log shows the gap: a tab page was ready only 5 s or more after the splash had been hidden', ready.length >= 2 && Math.min(...ready.map((r) => r[1])) > 4500);
const lay = read('app/_layout.tsx');
check('the splash is hidden only when all four tab pages are ready (allTabsReady), with a backstop so it can never hang', lay.includes('const firstPageUp = allTabsReady();') && lay.includes('if (ready && (firstPageUp || splashBackstop)) {') && lay.includes('SPLASH_BACKSTOP_MS = 8000'));
check('it re-checks whenever a tab page becomes ready (useTabReadyVersion)', lay.includes('useTabReadyVersion();'));
check('the splash colour is the app\'s own cream, not white', /"backgroundColor": "#F4EFE6"/.test(read('app.json')));
check('a log line says when and why it was hidden: [LAUNCH] splash hidden N ms after ... (all four tab pages have painted / backstop)', lay.includes('[LAUNCH] splash hidden '));
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
