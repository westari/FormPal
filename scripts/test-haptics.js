#!/usr/bin/env node
/**
 * scripts/test-haptics.js
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
const H = require('../lib/screenHaptics.ts');

(async () => {
  // ── Part 1: the mapping ──
  const run = (k) => { calls.length = 0; H.haptic(k); return calls.join(); };
  check('selection -> selectionAsync', run('selection') === 'selection');
  check('light -> impactAsync(Light)', run('light') === 'impact:Light');
  check('medium (Start / Save / Finish / Log) -> impactAsync(Medium)', run('medium') === 'impact:Medium');
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
    check('Create workout: a stepper (+) -> ONE selection tick', k.join() === 'selection', k.join());
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
    check('Log a session: a Recent row (a picker) -> ONE selection tick', k.join() === 'selection', k.join());
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
  check('camera: rep counted -> Light, rejected (X) -> Warning, one call per rep', /haptic\(rep\.good \? 'light' : 'warning'\)/.test(fc));
  check('camera: a missed attempt (X from the attempt detector) -> Warning; a soft rep -> Light', /haptic\('warning'\);\n      }\n    }\n  };/.test(fc) && /setFeedback\(\{ good: true, reason: '', seq: \+\+feedbackSeq\.current \}\);\n        haptic\('light'\)/.test(fc));
  check('camera: stop = Medium, back = Light, mute and flash = selection, flip = Light', /haptic\('medium'\); void handleStop/.test(fc) && /haptic\('light'\); void handleBack/.test(fc) && /haptic\('selection'\); handleToggleMute/.test(fc) && /haptic\('selection'\); handleFlash/.test(fc) && /haptic\('light'\); handleFlip/.test(fc));
  check('camera: errors -> Error', (fc.match(/haptic\('error'\)/g) || []).length >= 2);
  check('Workout complete (a real workout) and a rank up -> Success, once each', /!isHistoryMode && !celebrated\.current\) \{ celebrated\.current = true; haptic\('success'\)/.test(rc) && /rankedUp && !rankCelebrated\.current\) \{ rankCelebrated\.current = true; haptic\('success'\)/.test(rc));
  check('post-workout pages: the page script is installed on all four and its message plays the haptic; the native back / All sets buttons are Light', ['recap', 'repfeedback', 'ranks', 'allsets'].every((k) => new RegExp(k + ':\\s+`[^`]*HAPTIC_CLICK_JS').test(ws)) && /msg\.type === 'haptic'/.test(ws) && /const send = \(type: string\) => \{ haptic\('light'\)/.test(ws));
  check('design screens (Create workout, My workouts, Log a session) play the haptic their page asks for', /msg\.type === 'haptic'/.test(ds) && /HAPTIC_CLICK_JS/.test(read('lib/designScreens.ts')));
  check('Create workout and Log a session errors -> Error', /haptic\('error'\); Alert\.alert/.test(read('app/create-workout.tsx')) && /haptic\('error'\)/.test(read('app/log-session.tsx')));
  check('the page script never doubles: ONE capture listener on the document, installed once', (read('lib/hapticClick.ts').match(/addEventListener\('click'/g) || []).length === 1 && /__hapInstalled/.test(read('lib/hapticClick.ts')));
  Module._load = orig;
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
