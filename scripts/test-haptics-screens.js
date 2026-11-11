#!/usr/bin/env node
/**
 * scripts/test-haptics-screens.js
 *
 * One haptic per press, with the exact mapping (expo-haptics used directly via lib/screenHaptics.ts):
 *   toggles / pickers / chips / steppers / tabs -> selectionAsync       normal button / card / row -> impactAsync(Light)
 *   main actions (Start, Save, Finish, Log)     -> impactAsync(Medium)  rep counted -> Light, rep rejected (X) -> notification Warning
 *   workout complete, rank up                   -> notification Success errors -> notification Error
 * Part 1 runs the real lib/screenHaptics.ts against a recording stand-in for expo-haptics.
 * Part 2 clicks real controls in the real design pages (the same injected script the app ships) and counts the messages.
 * Part 3 checks the native screens call it at the right places.
 */
const Module = require('module');
const path = require('path');
const fs = require('fs');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

const calls = [];
const FAKE = {
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
  NotificationFeedbackType: { Success: 'Success', Warning: 'Warning', Error: 'Error' },
  selectionAsync: async () => { calls.push('selection'); },
  impactAsync: async (s) => { calls.push('impact:' + s); },
  notificationAsync: async (t) => { calls.push('notification:' + t); },
};
require('./lib/ts-node-loader.js')();
const orig = Module._load;
Module._load = function (req) { if (req === 'expo-haptics') return FAKE; return orig.apply(this, arguments); };
const H = require('../lib/haptics.ts');

(async () => {
  // ── Part 1: the mapping ──
  const FN = { selection: 'hapticSelect', light: 'hapticSelect', medium: 'hapticMain', warning: 'hapticWarning', success: 'hapticSuccess', error: 'hapticError' };
  const run = (k) => { H.__setHapticBackend(FAKE); calls.length = 0; H[FN[k]](); return calls.join(); };
  check('selection -> selectionAsync', run('selection') === 'selection');
  check('an ordinary tap (hapticSelect) -> selectionAsync', run('light') === 'selection');
  check('a main action (hapticMain: Start / Save / Finish / Log) -> impactAsync(Light)', run('medium') === 'impact:Light');
  check('rep rejected (X) -> notificationAsync(Warning)', run('warning') === 'notification:Warning');
  check('workout complete / rank up -> notificationAsync(Success)', run('success') === 'notification:Success');
  check('errors -> notificationAsync(Error)', run('error') === 'notification:Error');
  check('every call plays exactly ONE haptic', ['selection', 'light', 'medium', 'warning', 'success', 'error'].every((k) => run(k).split(',').length === 1));

  // ── Part 2: real pages ──
  const { openDesign, catalog, DS } = require('./lib/design-harness.js');
  const cat = catalog();
  const clickAndCount = async (page, msgs, fn) => { const before = msgs.filter((m) => m.type === 'haptic').length; await fn(); await page.waitForTimeout(120); return msgs.filter((m) => m.type === 'haptic').slice(before).map((m) => m.kind); };
  {
    const { browser, page, msgs } = await openDesign('create', DS.createWorkoutData(cat));
    let k = await clickAndCount(page, msgs, () => page.evaluate(() => document.querySelector('[data-ds-add]').click()));
    check('Create workout: the Add exercise button -> ONE light tap', k.join() === 'light', k.join());
    await page.fill('input[placeholder="Search to add an exercise"]', 'curl'); await page.dispatchEvent('input[placeholder="Search to add an exercise"]', 'change'); await page.waitForTimeout(200);
    k = await clickAndCount(page, msgs, () => page.evaluate(() => { const el = [...document.querySelectorAll('#dc-root div')].filter((e) => /^Bicep Curl$/.test((e.textContent || '').trim())).sort((a, b) => a.textContent.length - b.textContent.length)[0]; el.click(); }));
    check('Create workout: picking a result from the list -> ONE haptic (a row press)', k.length === 1, k.join());
    k = await clickAndCount(page, msgs, () => page.evaluate(() => { const plus = [...document.querySelectorAll('#dc-root div')].filter((d) => d.style.cursor === 'pointer' && d.style.width === '36px' && d.querySelector('svg')); plus[1].click(); }));
    check('Create workout: a stepper (+) -> ONE selection tick', k.join() === 'select', k.join());
    await page.fill('input[placeholder="Name your workout"]', 'Test'); await page.dispatchEvent('input[placeholder="Name your workout"]', 'change'); await page.waitForTimeout(200);
    k = await clickAndCount(page, msgs, () => page.evaluate(() => { const a = [...document.querySelectorAll('#dc-root a')].find((x) => /Save workout/.test(x.textContent)); a.click(); }));
    check('Create workout: Save workout -> ONE medium tap (main action)', k.join() === 'medium', k.join());
    k = await clickAndCount(page, msgs, () => page.evaluate(() => { document.querySelector('#dc-root a[aria-label="Back"]').click(); }));
    check('Create workout: Back -> ONE light tap', k.join() === 'light', k.join());
    k = await clickAndCount(page, msgs, () => page.click('input[placeholder="Name your workout"]'));
    check('typing in a text box makes no haptic', k.length === 0, k.join());
    await browser.close();
  }
  {
    const { browser, page, msgs } = await openDesign('log', DS.logSessionData(cat, new Date(2026, 10, 18, 9, 30), ['Bicep Curl']));
    let k = await clickAndCount(page, msgs, () => page.evaluate(() => document.querySelector('[data-ds-chip="Bicep Curl"]').click()));
    check('Log a session: a Recent row (a picker) -> ONE selection tick', k.join() === 'select', k.join());
    k = await clickAndCount(page, msgs, () => page.evaluate(() => { const a = [...document.querySelectorAll('#dc-root a')].find((x) => /Save session/.test(x.textContent)); a.click(); }));
    check('Log a session: Save session -> ONE medium tap', k.join() === 'medium', k.join());
    await browser.close();
  }
  {
    const { browser, page, msgs } = await openDesign('my', DS.myWorkoutsData([{ id: 'a1', splitLabel: 'Upper Body', exercises: [{ displayName: 'Push-up', targetSets: 3 }] }], []));
    const k = await clickAndCount(page, msgs, () => page.evaluate(() => { const a = [...document.querySelectorAll('#dc-root a')].find((x) => /Upper Body/.test(x.textContent)) || document.querySelector('#dc-root a'); a.click(); }));
    check('My workouts: opening a workout card -> ONE haptic', k.length === 1, k.join());
    await browser.close();
  }

  // ── Part 3: native screens call it ──
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split('\r\n').join('\n');
  const fc = read('app/formcheck.tsx'), rc = read('app/recap.tsx'), ws = read('components/WarmSurfaces.tsx'), ds = read('components/DesignScreen.tsx');
  check('camera: rep counted -> Light, rejected (X) -> Warning, one call per rep (lib/haptics.ts)', fc.includes('(rep.good ? hapticSelect() : hapticWarning())') && fc.includes("from '../lib/haptics'"));
  check('camera: a missed attempt (X from the attempt detector) -> Warning; a soft rep -> Light', fc.includes('hapticWarning();\n      }\n    }\n  };') && fc.includes("setFeedback({ good: true, reason: '', seq: ++feedbackSeq.current });\n        hapticSelect()"));
  check('camera: stop = Medium, back = Light, mute and flash = selection, flip = Light', fc.includes('hapticMain(); void handleStop') && fc.includes('hapticSelect(); void handleBack') && fc.includes('hapticSelect(); handleToggleMute') && fc.includes('hapticSelect(); handleFlash') && fc.includes('hapticSelect(); handleFlip'));
  check('camera: errors -> Error', (fc.match(/hapticError\(\)/g) || []).length >= 2);
  check('Workout complete (a real workout) and a rank up -> Success, once each', rc.includes('celebrated.current = true; hapticSuccess()') && rc.includes('rankCelebrated.current = true; hapticSuccess()'));
  check('post-workout pages: the page script is installed on all four and its message plays the haptic; the native back / All sets buttons are Light', ['recap', 'repfeedback', 'ranks', 'allsets'].every((k) => new RegExp(k + ':\\s+`[^`]*HAPTIC_CLICK_JS').test(ws)) && /msg\.type === 'haptic'/.test(ws) && ws.includes('const send = (type: string) => { hapticSelect();'));
  check('design screens (Create workout, My workouts, Log a session) play the haptic their page asks for, through lib/haptics hapticKind', /msg\.type === 'haptic'/.test(ds) && ds.includes('hapticKind(msg.kind)') && /HAPTIC_CLICK_JS/.test(read('lib/designScreens.ts')));
  check('Create workout and Log a session errors -> Error', read('app/create-workout.tsx').includes('hapticError(); Alert.alert') && read('app/log-session.tsx').includes('hapticError()'));
  check('no screen still imports the old lib/screenHaptics (every screen uses lib/haptics.ts)', ['app/formcheck.tsx', 'app/recap.tsx', 'app/create-workout.tsx', 'app/log-session.tsx', 'components/WarmSurfaces.tsx', 'components/DesignScreen.tsx'].every((f) => !read(f).includes('screenHaptics')));
  check('the page script never doubles: ONE capture listener on the document, installed once', (read('lib/hapticClick.ts').match(/addEventListener\('click'/g) || []).length === 1 && /__hapInstalled/.test(read('lib/hapticClick.ts')));
  // the crash: formcheck called hapticLight, which lib/haptics no longer exports -> "is not a function" on every Back / flip.
  {
    const have = new Set(Object.keys(H));
    const bad = [];
    const walk = (d) => { for (const e of fs.readdirSync(path.join(__dirname, '..', d), { withFileTypes: true })) { if (['node_modules', '.scratch', 'ios', 'android'].includes(e.name)) continue; const rel = d + '/' + e.name; if (e.isDirectory()) walk(rel); else if (/[.]tsx?$/.test(e.name)) { const src = read(rel); for (const m of src.matchAll(/import[ ]*[{]([^}]*)[}][ ]*from[ ]*['"][./]*(?:lib[/])?haptics['"]/g)) for (const n of m[1].split(',').map((x) => x.trim().split(/[ ]+as[ ]+/)[0]).filter(Boolean)) if (!have.has(n)) bad.push(rel + ': ' + n); } } };
    for (const d of ['app', 'components', 'lib']) walk(d);
    check('every name any file imports from lib/haptics really exists there (a missing one threw "is not a function" on Back)', bad.length === 0, bad.join(' | '));
  }
  Module._load = orig;
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
