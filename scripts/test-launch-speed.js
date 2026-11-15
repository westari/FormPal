#!/usr/bin/env node
/**
 * scripts/test-launch-speed.js
 * Why the app showed a blank screen for ~6s after launch, and why Train / Progress were slow on the first tap (found in
 * C:\Users\arize\gym app\logs\latest.log):
 *   - the four tab pages only start loading when their tab is first on screen. The tab bar visited them behind a cover, but the visits
 *     were scheduled on a JS thread that was busy with a big hidden "recap" page, the Create/My workouts/Log warm-ups and a clip
 *     catch-up, so they ran 3.7s late ("TRAIN focused" at +4.1s, cover lifted at +4.1s, pages ready at +6.1s after mount);
 *   - the visits happened ONCE per app run. After every workout recap the tabs screen is rebuilt (log: "layout mounted" and
 *     "TRAIN mounted" again), nobody visited the tabs again, and the next first tap of Progress / Train loaded the page in front of
 *     the user ("progress first open: shown -> ready 1656ms"; "iOS killed the web view process" and a 3.4s Train tap).
 * Fix: the hidden big pages wait for lib/launchGate.ts (opened ~2s after the tabs were visited); the tab visits start at 60ms and
 * run on every mount of the tab bar. React Native cannot run under node, so this checks the shipped source and timings; the phone
 * log proves it live: "[TAB-LAG] cover lifted ~400ms after the tab bar mounted".
 */
const fs = require('fs'), path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const bar = read('components/GlassTabBar.tsx'), ws = read('components/WarmSurfaces.tsx'), dp = read('components/DesignPrewarm.tsx'), gate = read('lib/launchGate.ts');
const num = (re, s) => parseInt((re.exec(s) || [])[1], 10);
const FIRST = num(/WARM_FIRST_MS = (\d+)/, bar), STEP = num(/WARM_STEP_MS = (\d+)/, bar), SETTLE = num(/SETTLE_AFTER_MS = (\d+)/, bar);
const planned = FIRST + 3 * STEP + 60;
check('3: the tab visits start at once (first visit at ' + FIRST + 'ms, was 350ms) and the whole round is planned at ' + planned + 'ms, was 760ms', FIRST <= 100 && STEP <= 100 && planned <= 450, `first ${FIRST}, step ${STEP}, planned cover lift ${planned}ms`);
check('3: the tab bar logs how long the cover really took ("[TAB-LAG] cover lifted Nms after the tab bar mounted")', /cover lifted ' \+ \(Date\.now\(\) - mountedAt\.current\)/.test(bar));
check('4: the tab visits run on EVERY mount of the tab bar (launch and after each workout recap), not once per app run', !/let warmedUp|warmedUp = true/.test(bar) && /const \[warming, setWarming\] = useState\(true\)/.test(bar));
check('3: the hidden recap page and the three design warm-ups wait for the launch gate (the tabs load first)', /useLaunchSettled\(\)/.test(ws) && /want\[k\] && \(settled \|\| activeNow\[k\]\)/.test(ws) && /useLaunchSettled\(\)/.test(dp) && /if \(!settled\) return;/.test(dp));
check('3: ...but a recap that a screen asks for early is never held back (active pages mount at once)', /activeNow\[k\]/.test(ws));
check('3: the gate opens ' + SETTLE + 'ms after the cover lifts, and a backstop (started when the tab bar mounts, not at import: the log had 28s between) opens it anyway', SETTLE >= 500 && SETTLE <= 3000 && /setTimeout\(markLaunchSettled, SETTLE_AFTER_MS\)/.test(bar) && /LAUNCH_BACKSTOP_MS = 8000/.test(gate) && /startLaunchBackstop\(\);/.test(bar) && !/^setTimeout\(markLaunchSettled/m.test(gate));
check('3: the state test still sees the recap page as wanted from app start (only its mounting waits)', /want:\s+\{ recap: true/.test(ws));
// the gate itself
require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
const g = require('../lib/launchGate.ts');
check('gate: closed at start, opens once, stays open', g.isLaunchSettled() === false && (g.markLaunchSettled(), g.isLaunchSettled() === true) && (g.markLaunchSettled(), g.isLaunchSettled() === true));
const prof = read('app/(tabs)/progress.tsx');
check('4: the tab pages sit on the page colour (#eeeef1), so a page that is still loading is never a white flash', ['index', 'train', 'progress', 'profile'].every((f) => /web:\s+\{ flex: 1, backgroundColor: '#eeeef1' \}/.test(read(`app/(tabs)/${f}.tsx`))));
// ── 1: the 28 seconds before the first screen (log 2026-11-15: last module line 18:39:48.74, first screen 18:40:16.80, nothing in between) ──
const lay = read('app/_layout.tsx');
check('1: the first screen never waits for fonts longer than the hard stop (' + num(/FONT_WAIT_MS = (\d+)/, lay) + 'ms), and the loading screen is hidden then', num(/FONT_WAIT_MS = (\d+)/, lay) <= 2000 && /const ready = fontsLoaded \|\| !!fontError \|\| fontWaitOver/.test(lay) && /if \(!ready\) return null/.test(lay) && /hideAsync\(\)/.test(lay) && !/if \(!fontsLoaded && !fontError\) return null/.test(lay));
check('1: the phone log proves it: "[LAUNCH] first screen allowed Nms after the app code started" and "[LAUNCH] fonts loaded Nms ..."', /\[LAUNCH\] first screen allowed/.test(lay) && /\[LAUNCH\] fonts loaded/.test(lay));
check('1: the plan is loaded into the store at app start (nothing waits on it)', /usePlanStore\.getState\(\)\.loadFromStorage\(\)/.test(lay));
// ── 1 + 3: the launch cover and the tap cover ──
const tr = read('lib/tabReady.ts');
check('1: the launch cover has a HARD stop (' + num(/LAUNCH_COVER_MAX_MS = (\d+)/, tr) + 'ms) that does not depend on any page saying ready', num(/LAUNCH_COVER_MAX_MS = (\d+)/, tr) <= 3000 && /setTimeout\(\(\) => setWarming\(false\), LAUNCH_COVER_MAX_MS\)/.test(bar));
check('3: each tab reports when its page is drawn (and when iOS killed it), so a tab is never shown half-loaded', ['index', 'train', 'progress', 'profile'].every((n) => { const src = read('app/(tabs)/' + n + '.tsx'); return src.includes("markTabReady('" + n + "')") && src.includes("markTabLoading('" + n + "')"); }));
check('3: a tap on a tab that is not drawn yet shows the page-coloured cover until it is (1.5s hard stop)', /waitingForPage/.test(bar) && num(/TAP_COVER_MAX_MS = (\d+)/, tr) <= 1500);
// the tab state machine, run for real
const T = require('../lib/tabReady.ts');
T.resetTabReady();
check('3: tab readiness: nothing is ready at start; each tab becomes ready alone; a killed page is loading again', !T.allTabsReady() && (T.markTabReady('train'), T.isTabReady('train') && !T.isTabReady('progress')) && (T.markTabLoading('train'), !T.isTabReady('train')) && (['index', 'train', 'progress', 'profile'].forEach((n) => T.markTabReady(n)), T.allTabsReady()));
// ── 2: Done after a workout ──
const rc = read('app/recap.tsx'), st = read('app/streak-screen.tsx'), pp = read('app/progress-photo-screen.tsx'), lt = read('lib/leaveToTabs.ts');
check('2: Done / Continue / photo screens leave with dismissTo (back to the tabs that are still there with all four pages loaded), not router.replace (a second tabs screen that loaded everything again: the 5 seconds)', /leaveToTabs\(router, dest\)/.test(rc) && /leaveToTabs\(router, dest\)/.test(st) && /leaveToTabs\(router, dest\)/.test(pp) && !/router\.replace\(dest/.test(rc + st + pp) && /router\.dismissTo\(dest/.test(lt));
const calls = []; const fake = { dismissTo: (h) => calls.push('dismissTo ' + h), replace: (h) => calls.push('replace ' + h) };
require('../lib/leaveToTabs.ts').leaveToTabs(fake, '/(tabs)/train');
require('../lib/leaveToTabs.ts').leaveToTabs({ replace: (h) => calls.push('replace ' + h) }, '/(tabs)/');
require('../lib/leaveToTabs.ts').leaveToTabs({ dismissTo: () => { throw new Error('x'); }, replace: (h) => calls.push('replace ' + h) }, '/(tabs)/');
check('2: leaveToTabs pops back to the tabs; falls back to replace only if dismissTo is missing or throws', calls.join(' | ') === 'dismissTo /(tabs)/train | replace /(tabs)/ | replace /(tabs)/', calls.join(' | '));
console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
