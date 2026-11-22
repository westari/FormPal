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
  // typing in the app's bar fills the design's own search
  await p.evaluate(() => window.__trSetQuery('squat')); await p.waitForTimeout(500);
  const typed = await p.evaluate(() => { const i = document.querySelector('input[placeholder="Search 120+ exercises"]'); return { value: i.value, rows: [...document.querySelectorAll('[aria-label="Check form"]')].length, text: /squat/i.test(document.body.innerText) }; });
  check('what is typed in the app\'s bar becomes the design\'s own search: the box shows it and the real results appear', typed.value === 'squat' && typed.rows > 0 && typed.text, JSON.stringify(typed));
  const mid = await snap();
  check('typing alone moves nothing either (the scroll happens only when the app asks for it)', mid.scrollTop === before.scrollTop && mid.canvasTf === before.canvasTf, JSON.stringify([before.scrollTop, mid.scrollTop]));
  await p.evaluate(() => window.__trReveal()); await p.waitForTimeout(1200);
  const rev = await snap();
  check('the one reveal scroll puts the search and its results up in the visible area above the keyboard (it is lifted toward the top), and the canvas is untouched', rev.y < 874 * 0.4 && rev.canvasTf === before.canvasTf && rev.canvasH === before.canvasH, JSON.stringify([rev.y, rev.scrollTop]));
  await p.evaluate(() => window.__trSetQuery('')); await p.waitForTimeout(300);
  check('clearing it brings the page back to the normal list', await p.evaluate(() => document.querySelector('input[placeholder="Search 120+ exercises"]').value === ''));
  await browser.close();

  // ── the native side (source order; the phone log line proves it live: "[TRAIN] search bar opened (docked above the keyboard)") ──
  const src = fs.readFileSync(path.join(ROOT, 'app', '(tabs)', 'train.tsx'), 'utf8').split('\r\n').join('\n');
  check('app: the docked bar rises with the keyboard by a NATIVE transform (translateY from the keyboard height, native driver), no layout change and no KeyboardAvoidingView', /translateY: Animated\.multiply\(kbH, -1\)/.test(src) && /keyboardWillShow/.test(src) && /useNativeDriver: true/.test(src.slice(src.indexOf('keyboardWillShow'), src.indexOf('keyboardWillShow') + 400)) && !/KeyboardAvoidingView/.test(src));
  check('app: the bar fades in with the keyboard (no flash at the bottom of the screen before it rises) and a tap outside closes it', /opacity: kbH\.interpolate\(\{ inputRange: \[0, 40\], outputRange: \[0, 1\]/.test(src) && /train-search-dismiss/.test(src) && /returnKeyType="search"/.test(src));
  check('app: typing is sent to the page\'s search and the one reveal scroll is asked for once, at the first letter', /__trSetQuery/.test(src) && /searchRevealed\.current = true/.test(src) && /__trReveal/.test(src));
  check('app: opening it logs a [TRAIN] line', /search bar opened \(docked above the keyboard\)/.test(src));
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
