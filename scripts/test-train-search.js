#!/usr/bin/env node
/**
 * scripts/test-train-search.js  (round 8, item 4)
 * Train > Practice Exercises: tapping the search bar made the whole app jump and flicker. Now the page's own search box never takes focus
 * (nothing in the page can move or re-lay itself out); the tap asks the app for a docked search bar that rises with the keyboard by itself.
 * Real traintab.html with the shipped injection in Chromium (a real mouse click), then the native side as source order.
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const Module = require('module'); const orig = Module._load;
Module._load = function (r) { if (/constants\/api$/.test(r)) return { MYPAL_API_URL: 'http://localhost/none' }; if (r === 'expo-asset') return { Asset: {} }; return orig.apply(this, arguments); };
const fs = require('fs'), path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const train = require('../app/(tabs)/train.tsx');
const { buildTrainData } = require('../lib/trainData.ts');
const { athltSetDataJs } = require('../lib/dcLogicPatch.ts');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const ex = (id, displayName, sets, reps) => ({ exerciseId: id, displayName, targetSets: sets, targetReps: reps, restSeconds: 60, currentVariationId: id });
const plan = { id: 'p', generatedAt: new Date(2026, 9, 1).toISOString(), profile: { goal: 'general', experience: 'beginner', daysPerWeek: 3, location: 'gym' }, currentWorkoutIndex: 0,
  workouts: [{ id: 'wA', splitLabel: 'Lower Body', exercises: [ex('squat', 'Bodyweight Squat', 3, 12)] }] };
const INS = { top: 62, bottom: 34 };
const data = { ...buildTrainData(plan, [], INS, new Date(2026, 10, 18, 9)), insets: INS };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const msgs = [];
  await p.exposeFunction('__post', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
  await p.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  await p.addInitScript(train.TRAIN_BEFORE);
  await p.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'traintab.html')).href, { waitUntil: 'commit' });
  const t0 = Date.now(); let pushed = false;
  while (!msgs.some(m => m.type === 'ready') && Date.now() - t0 < 25000) {
    if (!pushed && msgs.some(m => m.type === 'needData')) { pushed = true; await p.evaluate(athltSetDataJs(data)); }
    await p.waitForTimeout(40);
  }
  await p.waitForTimeout(900);
  // scroll to the Practice Exercises search at the bottom
  await p.evaluate(() => { const i = document.querySelector('input[placeholder="Search 120+ exercises"]'); const sc = i.closest('[data-scroll]'); sc.scrollTop = sc.scrollHeight; });
  await p.waitForTimeout(400);
  const snap = () => p.evaluate(() => {
    const i = document.querySelector('input[placeholder="Search 120+ exercises"]'), sc = i.closest('[data-scroll]'), root = document.querySelector('[data-tr-canvas]');
    const r = i.getBoundingClientRect();
    return { scrollTop: Math.round(sc.scrollTop), canvasTf: root.style.transform, canvasH: root.style.height, bodyH: document.body.style.height, active: document.activeElement && document.activeElement.tagName, ro: i.hasAttribute('readonly'), x: r.x + r.width / 2, y: r.y + r.height / 2, winScroll: window.scrollY, visible: r.top > 0 && r.bottom < innerHeight };
  });
  const before = await snap();
  console.log('      before:', JSON.stringify(before));
  check('the page\'s own search box is locked (read only, no caret), so it can never take focus or raise the keyboard by itself', before.ro === true);
  await p.mouse.click(before.x, before.y); await p.waitForTimeout(500);
  const after = await snap();
  check('a real tap on the search bar asks the app for its docked bar (message "search")', msgs.some(m => m.type === 'search'), JSON.stringify(msgs.filter(m => m.type === 'search')));
  check('the page\'s box did NOT take focus (nothing focused in the page)', after.active !== 'INPUT', after.active);
  check('NOTHING moved: same scroll position, same canvas scale and height, same page height, the bar is where it was', after.scrollTop === before.scrollTop && after.canvasTf === before.canvasTf && after.canvasH === before.canvasH && after.bodyH === before.bodyH && after.winScroll === before.winScroll, JSON.stringify([before, after]));
  // the page's box reports where it is, and is hidden while the app's bar sits on top of it (it keeps its place: nothing moves)
  const sm = msgs.find((m) => m.type === 'search');
  check('round 11: the tap sends the box real place (left, top, width, height) so the app bar can start exactly on top of it', sm && sm.rect && Math.abs(sm.rect.top - (before.y - sm.rect.height / 2)) < 2 && sm.rect.width > 300 && sm.rect.height > 40, JSON.stringify(sm));
  await p.evaluate(() => window.__trSearchHide(true)); await p.waitForTimeout(100);
  const hid = await p.evaluate(() => { const i = document.querySelector('input[placeholder="Search 120+ exercises"]'); const r = i.parentElement.getBoundingClientRect(); return { vis: getComputedStyle(i.parentElement).visibility, top: Math.round(r.top) }; });
  const mid = await snap();
  check('round 11: while the app bar is on top, the page own box is only hidden (visibility): it does not move, nothing around it changes and the scroll position is the same', hid.vis === 'hidden' && mid.scrollTop === before.scrollTop && mid.canvasTf === before.canvasTf && mid.canvasH === before.canvasH && Math.abs(hid.top - Math.round(sm.rect.top)) <= 1, JSON.stringify([hid, mid.scrollTop, before.scrollTop]));
  await p.evaluate(() => window.__trSearchHide(false)); await p.waitForTimeout(100);
  check('round 11: it is shown again when the search closes', await p.evaluate(() => getComputedStyle(document.querySelector('input[placeholder="Search 120+ exercises"]').parentElement).visibility) === 'visible');
  await browser.close();

  // ── the native side (source order; the phone log line proves it live: "[TRAIN] search opened: the bar is on the page own box and rises with the keyboard") ──
  const src = fs.readFileSync(path.join(ROOT, 'app', '(tabs)', 'train.tsx'), 'utf8').split('\r\n').join('\n');
  check('app: the bar starts EXACTLY on the page box (its top set to the box top before it is shown) and rises with the keyboard by a native transform with the keyboard own duration (like a normal iOS search)', /barY\.setValue\(r\.top\)/.test(src) && /keyboardWillShow/.test(src) && /toValue: screenH - e\.endCoordinates\.height - BAR_GAP - BAR_H, duration: e\.duration \|\| 250/.test(src) && /useNativeDriver: true/.test(src.slice(src.indexOf('keyboardWillShow'), src.indexOf('keyboardWillShow') + 500)) && /translateY: barY/.test(src) && !/KeyboardAvoidingView/.test(src));
  check('app: and when it closes the bar slides back down onto the page box with the keyboard, then the page box is shown again', /toValue: y0Ref\.current, duration: \(e && e\.duration\) \|\| 250/.test(src) && /__trSearchHide\(false\)/.test(src));
  check('app: the results are listed in a card right above the bar from the app own catalogue list (rankExercises), each row opens the form check; the PAGE is never scrolled and never sent the text (no reveal scroll, no query pushed)', /rankExercises\(libRef\.current\.lib, search\.text, 8\)/.test(src) && /router\.push\(`\/formcheck\?exercise=\$\{id\}`/.test(src) && !/__trReveal/.test(src) && !/injectJavaScript\(`window\.__trSetQuery/.test(src));
  check('app: the bar has the page own look (white pill, 48px) and opening logs a [TRAIN] line', /searchBar: \{ height: 48, borderRadius: 24/.test(src) && /search opened: the bar is on the page/.test(src));
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
