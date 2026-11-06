#!/usr/bin/env node
/**
 * scripts/test-plan-edit.js
 *
 * "Edit sheet changes save to the plan" (Train and Home).
 *   1. lib/planEdit.ts (pure): removing, adding, reordering, unknown names, no-change, the input never mutated.
 *   2. lib/planEditSave.ts with an in-memory plan storage: the plan really changes in storage AND the plan store.
 *   3. The REAL design pages (WebKit) with the exact injection each tab ships: the design's own Edit sheet is opened,
 *      a row removed and one added, the sheet closed -> the page posts exactly one saveEdit with the right workout and
 *      rows; closing without a change posts nothing; after the save the page shows the new exercise count and the
 *      reopened sheet lists the saved exercises. Train and Home.
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const Module = require('module');
const prev = Module._load;
Module._load = function (r) { if (/constants\/api$/.test(r)) return { MYPAL_API_URL: 'http://localhost/none' }; if (r === 'expo-asset') return { Asset: {} }; return prev.apply(this, arguments); };
const path = require('path');
const { pathToFileURL } = require('url');
const { webkit } = require('playwright');
const ROOT = path.join(__dirname, '..');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const pe = require('../lib/planEdit.ts');
const { buildTrainData } = require('../lib/trainData.ts');
const { athltSetDataJs } = require('../lib/dcLogicPatch.ts');

const ex = (id, name, sets, reps, rest = 75) => ({ exerciseId: id, displayName: name, targetSets: sets, targetReps: reps, restSeconds: rest, currentVariationId: id });
const mkPlan = () => ({ id: 'p', profile: { goal: 'general', experience: 'beginner', daysPerWeek: 4, location: 'gym' }, splitType: 'fullBody', progressionState: {}, generatedAt: 1, currentWorkoutIndex: 1,
  workouts: [
    { id: 'w0', sessionNumber: 1, splitLabel: 'Lower Body', rationale: '', completed: true, exercises: [ex('squat', 'Bodyweight Squat', 3, 12), ex('lunge', 'Lunge', 3, 10)] },
    { id: 'w1', sessionNumber: 2, splitLabel: 'Upper Body', rationale: '', completed: false, exercises: [ex('pushup', 'Push-up', 3, 12), ex('shoulderPress', 'Shoulder Press', 3, 10), ex('curl', 'Bicep Curl', 3, 12), ex('pullup', 'Pull-up', 3, 6)] },
    { id: 'w2', sessionNumber: 3, splitLabel: 'Full Body', rationale: '', completed: false, exercises: [ex('squat', 'Bodyweight Squat', 3, 12), ex('pushup', 'Push-up', 3, 12)] },
  ] });

// ── 1. pure ──────────────────────────────────────────────────────────────────────────────────────────────────
console.log('--- lib/planEdit.ts ---');
{
  const plan = mkPlan(), snapshot = JSON.stringify(plan);
  const rows = (w) => w.exercises.map(e => [e.displayName, `${e.targetSets} × ${e.targetReps}`]);
  const r1 = rows(plan.workouts[1]).filter(r => r[0] !== 'Bicep Curl');
  const a = pe.applyEditRows(plan, 'w1', r1);
  check('removing a row removes that exercise from the workout (and only that one)', a && a.workouts[1].exercises.map(e => e.displayName).join() === 'Push-up,Shoulder Press,Pull-up');
  check('the other workouts and the plan fields are untouched', a.workouts[0] === plan.workouts[0] && a.workouts[2] === plan.workouts[2] && a.currentWorkoutIndex === 1 && a.id === 'p');
  check('the plan passed in is never mutated', JSON.stringify(plan) === snapshot);
  check('kept exercises keep their own sets, reps and rest', a.workouts[1].exercises[0].targetReps === 12 && a.workouts[1].exercises[0].restSeconds === 75);
  const b = pe.applyEditRows(plan, 'w1', [...rows(plan.workouts[1]), ['Lunge', '3 × 10']]);
  const added = b.workouts[1].exercises[4];
  check('"Add exercise" adds a real catalogue exercise with its id, sets x reps and the workout\'s rest time', added.exerciseId === 'lunge' && added.targetSets === 3 && added.targetReps === 10 && added.restSeconds === 75 && added.currentVariationId === 'lunge', JSON.stringify(added));
  const c = pe.applyEditRows(plan, 'w1', [['Pull-up', '3 × 6'], ['Push-up', '3 × 12']]);
  check('row order is the new exercise order', c.workouts[1].exercises.map(e => e.displayName).join() === 'Pull-up,Push-up');
  check('a name that is not a tracked exercise is ignored, not invented', pe.applyEditRows(plan, 'w1', [...rows(plan.workouts[1]), ['Basket weaving', '3 × 10']]) === null);
  check('no change -> null (nothing to save)', pe.applyEditRows(plan, 'w1', rows(plan.workouts[1])) === null);
  check('unknown workout id -> null', pe.applyEditRows(plan, 'nope', []) === null);
  const d = pe.applyEditRows(plan, 'w1', [['Push-up', '3 × 12'], ['Push-up', '3 × 12']]);
  check('the same exercise can be added a second time', d && d.workouts[1].exercises.length === 2 && d.workouts[1].exercises[1].exerciseId === 'pushup');
  const ex2 = pe.addableExercises();
  check('"Add exercise" offers real catalogue exercises (Squat, Push-up, Lunge first) with real defaults', ex2.length > 30 && ex2[0][0] === 'Bodyweight Squat' && /^\d+ × \d+$/.test(ex2[0][1]) && ex2.every(r => pe.resolveExercise(r[0])), ex2.slice(0, 3).map(r => r.join(' ')).join(' | '));
  check('sets x reps text parses', JSON.stringify(pe.parseSetsReps('4 × 8')) === '[4,8]' && pe.parseSetsReps('3 × 45s')[1] === 45 && pe.parseSetsReps('x') === null);
}

// ── 2. storage + store ───────────────────────────────────────────────────────────────────────────────────────
const mem = new Map();
const AS = { __esModule: true, default: { getItem: async (k) => (mem.has(k) ? mem.get(k) : null), setItem: async (k, v) => { mem.set(k, v); }, removeItem: async (k) => { mem.delete(k); } } };

(async () => {
  console.log('--- lib/planEditSave.ts (in-memory storage) ---');
  const cloud = [];
  Module._load = function (r) {
    if (r === '@react-native-async-storage/async-storage') return AS;
    if (/formpalSync$/.test(r)) return { savePlanToCloud: async (p) => { cloud.push(p.id); } };
    return prev.apply(this, arguments);
  };
  try {
    const { savePlan, loadPlan } = require('../lib/planStorage.ts');
    const { saveWorkoutEdit } = require('../lib/planEditSave.ts');
    const { usePlanStore } = require('../store/planStore.ts');
    await savePlan(mkPlan());
    const saved = await saveWorkoutEdit('w1', [['Push-up', '3 × 12'], ['Pull-up', '3 × 6'], ['Lunge', '3 × 10']]);
    const stored = await loadPlan();
    check('saveWorkoutEdit changes the plan in storage', saved === true && stored.workouts[1].exercises.map(e => e.displayName).join() === 'Push-up,Pull-up,Lunge', stored.workouts[1].exercises.map(e => e.displayName).join());
    check('...and refreshes the plan store the workout screen reads', usePlanStore.getState().plan.workouts[1].exercises.length === 3);
    check('...and goes through the existing savePlan (cloud mirror was called)', cloud.length >= 2);
    check('saving the same thing again changes nothing', (await saveWorkoutEdit('w1', [['Push-up', '3 × 12'], ['Pull-up', '3 × 6'], ['Lunge', '3 × 10']])) === false);
  } catch (e) { check('plan storage test could run', false, e.message.split('\n')[0]); }
  Module._load = function (r) { if (/constants\/api$/.test(r)) return { MYPAL_API_URL: 'http://localhost/none' }; if (r === 'expo-asset') return { Asset: {} }; return prev.apply(this, arguments); };

  // ── 3. the real pages ──
  console.log('--- the design\'s own Edit sheet, Train and Home ---');
  const wk = await webkit.launch();
  async function open(file, before, afterInit) {
    const ctx = await wk.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const msgs = [];
    await p.exposeFunction('__post', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
    await p.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
    await p.addInitScript(before);
    p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
    await p.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', file)).href, { waitUntil: 'commit' });
    await afterInit(p, msgs);
    return { ctx, p, msgs };
  }
  const sheetRows = (p) => p.evaluate(() => { const e = [...document.querySelectorAll('div')].find(d => d.style.maxHeight === '620px'); return e.innerText.replace(/\s+/g, ' ').trim(); });
  const tapSel = async (p, fn, arg) => {
    await p.evaluate(({ fn, arg }) => { const el = eval('(' + fn + ')')(arg); el.scrollIntoView({ block: 'center', inline: 'center' }); }, { fn: fn.toString(), arg });
    await p.waitForTimeout(150);
    const pt = await p.evaluate(({ fn, arg }) => { const r = eval('(' + fn + ')')(arg).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, { fn: fn.toString(), arg });
    await p.touchscreen.tap(pt.x, pt.y); await p.waitForTimeout(450);
  };
  const sheetBtn = (re) => [...document.querySelectorAll('div')].find(d => d.style.maxHeight === '620px') && [...[...document.querySelectorAll('div')].find(d => d.style.maxHeight === '620px').querySelectorAll('div,a,span')].filter(e => new RegExp(re).test((e.innerText || '').trim()) && !(e.children.length > 3))[0];
  const removeFirstRow = () => { const sh = [...document.querySelectorAll('div')].find(d => d.style.maxHeight === '620px'); const rows = [...sh.querySelectorAll('div')].filter(d => d.querySelector('div[aria-label="Remove"], div[aria-label="Delete"]')); return null; };

  // ── Train ──
  {
    const train = require('../app/(tabs)/train.tsx');
    const now = new Date(2026, 10, 5, 14, 0, 0);
    let plan = mkPlan();
    const push = (p) => p.evaluate(athltSetDataJs({ ...buildTrainData(plan, [], { top: 62, bottom: 34 }, now) }));
    const { ctx, p, msgs } = await open('traintab.html', train.TRAIN_BEFORE, async (p, msgs) => {
      let pushed = false; const t0 = Date.now();
      while (!msgs.some(m => m.type === 'ready') && Date.now() - t0 < 25000) { if (!pushed && msgs.some(m => m.type === 'needData')) { pushed = true; await push(p); } await p.waitForTimeout(50); }
      await p.waitForTimeout(500);
    });
    const meta = () => p.evaluate(() => { const r = [...document.querySelectorAll('div[data-scroll]')].find(x => x.style.overflowX === 'auto' && x.children.length === 7); return r.children[5].innerText.replace(/\s+/g, ' ').trim(); });
    console.log('      Train today card:', (await meta()).slice(0, 60));
    const editBtn = () => { const r = [...document.querySelectorAll('div[data-scroll]')].find(x => x.style.overflowX === 'auto' && x.children.length === 7); return r.children[5].querySelector('a[aria-label="Edit workout"]'); };
    const closeSheet = () => p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => x.style.zIndex === '62'); d.click(); });
    // open, change nothing, close -> nothing posted
    await tapSel(p, editBtn);
    check('Train: Edit opens the sheet with today\'s real exercises', /Push-up 3 × 12 Shoulder Press 3 × 10 Bicep Curl 3 × 12 Pull-up 3 × 6/.test(await sheetRows(p)), (await sheetRows(p)).slice(0, 110));
    await closeSheet(); await p.waitForTimeout(700);
    check('Train: closing the sheet without a change saves nothing', !msgs.some(m => m.type === 'saveEdit'));
    // remove Bicep Curl (the design's own remove control), add an exercise, close
    await tapSel(p, editBtn);
    const rm = await p.evaluate(() => { const sh = [...document.querySelectorAll('div')].find(d => d.style.maxHeight === '620px'); const row = [...sh.querySelectorAll('div')].find(d => /Bicep Curl/.test(d.innerText || '') && d.querySelector('div[sc-camel-on-click], div[aria-label]') && d.children.length >= 2 && (d.innerText || '').length < 40); const x = row.querySelector('div[aria-label], div[style*="cursor: pointer"]'); const r = x.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: row.innerText.replace(/\s+/g, ' ') }; });
    await p.touchscreen.tap(rm.x, rm.y); await p.waitForTimeout(300);
    check('Train: the design\'s own remove control drops the row', !/Bicep Curl/.test(await sheetRows(p)), (await sheetRows(p)).slice(0, 100));
    const add = await p.evaluate(() => { const sh = [...document.querySelectorAll('div')].find(d => d.style.maxHeight === '620px'); const b = [...sh.querySelectorAll('div,a')].filter(e => /^Add exercise$/.test((e.innerText || '').trim()))[0]; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.touchscreen.tap(add.x, add.y); await p.waitForTimeout(300);
    const after = await sheetRows(p);
    check('Train: "Add exercise" adds a real catalogue exercise (Bodyweight Squat 3 × 10)', /Bodyweight Squat 3 × 10/.test(after), after.slice(0, 130));
    await closeSheet(); await p.waitForTimeout(900);
    const saves = msgs.filter(m => m.type === 'saveEdit');
    console.log('      posted:', JSON.stringify(saves));
    check('Train: closing posts ONE saveEdit for today\'s workout with the final rows', saves.length === 1 && saves[0].wid === 'w1' && saves[0].rows.map(r => r[0]).join() === 'Push-up,Shoulder Press,Pull-up,Bodyweight Squat', JSON.stringify(saves.map(s => [s.wid, s.rows && s.rows.map(r => r[0])])));
    // what the screen does next: save to the plan, rebuild the data, push it
    plan = pe.applyEditRows(plan, saves[0].wid, saves[0].rows);
    await push(p); await p.waitForTimeout(600);
    const m2 = await meta();
    check('Train: after the save the card shows the new exercise count (4 -> 4: curl out, squat in) and minutes', /Upper Body \d+ min · 4 exercises/.test(m2), m2.slice(0, 70));
    await tapSel(p, editBtn);
    check('Train: reopening the sheet lists the SAVED exercises', /Push-up 3 × 12 Shoulder Press 3 × 10 Pull-up 3 × 6 Bodyweight Squat 3 × 10/.test(await sheetRows(p)), (await sheetRows(p)).slice(0, 120));
    await closeSheet(); await p.waitForTimeout(600);
    check('Train: reopening and closing again without a change saves nothing more', msgs.filter(m => m.type === 'saveEdit').length === 1);
    // tomorrow's card saves to ITS workout, not today's
    await p.evaluate(() => { const r = [...document.querySelectorAll('div[data-scroll]')].find(x => x.style.overflowX === 'auto' && x.children.length === 7); r.scrollLeft = 99999; });
    await p.waitForTimeout(400);
    const editTomorrow = () => { const r = [...document.querySelectorAll('div[data-scroll]')].find(x => x.style.overflowX === 'auto' && x.children.length === 7); return r.children[6].querySelector('a[aria-label="Edit workout"]'); };
    await tapSel(p, editTomorrow);
    check('Train: tomorrow\'s card opens ITS OWN exercises (Full Body), not today\'s', /Bodyweight Squat 3 × 12 Push-up 3 × 12/.test(await sheetRows(p)) && !/Shoulder Press/.test(await sheetRows(p)), (await sheetRows(p)).slice(0, 100));
    const rm2 = await p.evaluate(() => { const sh = [...document.querySelectorAll('div')].find(d => d.style.maxHeight === '620px'); const row = [...sh.querySelectorAll('div')].find(d => /Push-up/.test(d.innerText || '') && d.children.length >= 2 && (d.innerText || '').length < 40); const x = row.querySelector('div[aria-label], div[style*="cursor: pointer"]'); const r = x.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.touchscreen.tap(rm2.x, rm2.y); await p.waitForTimeout(300);
    await closeSheet(); await p.waitForTimeout(900);
    const s2 = msgs.filter(m => m.type === 'saveEdit');
    check('Train: tomorrow\'s change is saved to workout w2', s2.length === 2 && s2[1].wid === 'w2' && s2[1].rows.length === 1, JSON.stringify(s2[1]));
    await ctx.close();
  }

  // ── Home ──
  {
    const home = require('../app/(tabs)/index.tsx');
    const { dcLogicPatchJs } = require('../lib/dcLogicPatch.ts');
    const { EDIT_BRIDGE_JS } = require('../lib/editSheetBridge.ts');
    const helpers = require('../lib/dcWebviewHelpers.ts');
    let plan = mkPlan();
    const before = helpers.DC_VIEWPORT_JS + helpers.DC_NO_ZOOM_JS + helpers.DC_SETTLE_JS + home.HOME_GUARD_JS + EDIT_BRIDGE_JS + dcLogicPatchJs(home.HOME_LOGIC_EXT);
    const logicJs = () => { const ld = home.buildHomeLogicData(plan); return athltSetDataJs(ld) + '; window.__editWid = ' + JSON.stringify(ld.editWid) + '; true;'; };
    const inject = (p) => p.evaluate(home.buildHomeInjectJs(plan, [], 62, 34) + '; true;');
    const { ctx, p, msgs } = await open('home.html', before, async (p, msgs) => {
      await p.waitForTimeout(1500);
      await p.evaluate(home.HOME_SCALE_FIT_JS);
      await p.evaluate(logicJs());
      await inject(p);
      const t0 = Date.now();
      while (!msgs.some(m => m.type === 'ready') && Date.now() - t0 < 15000) await p.waitForTimeout(60);
      await p.waitForTimeout(600);
    });
    const hero = () => p.evaluate(() => { const n = [...document.querySelectorAll('div')].find(d => d.style.fontSize === '27px' && d.style.maxWidth === '236px'); const metas = [...document.querySelectorAll('div,span')].filter(d => /\d+ min · \d+ exercise/.test(d.textContent) && d.textContent.length < 40 && d.children.length < 2).map(d => d.textContent.trim()); return n.textContent.trim() + ' ' + [...new Set(metas)].join(' | '); });
    console.log('      Home hero:', await hero());
    check('Home: the hero card shows today\'s real workout name and minutes / exercise count (not the design\'s "38 min · 4 exercises")', /^Upper Body \d+ min · 4 exercises$/.test(await hero()), await hero());
    const geo = await p.evaluate(() => { const e = [...document.querySelectorAll('div')].find(d => d.style.maxHeight === '620px'); const c = [...document.querySelectorAll('div')].find(d => d.style.height === '520px' && d.style.position === 'absolute'); return { e: [getComputedStyle(e).visibility, getComputedStyle(e).pointerEvents], c: [getComputedStyle(c).visibility, getComputedStyle(c).pointerEvents], pad: [...document.querySelectorAll('[data-home-header]')].map(h => h.style.paddingTop) }; });
    check('Home: both sheets still hidden at launch and the header still pushed down after the logic swap', geo.e[0] === 'hidden' && geo.c[0] === 'hidden' && geo.pad.length === 1 && parseFloat(geo.pad[0]) > 100, JSON.stringify(geo));
    const editBtn = () => document.querySelector('a[aria-label="Edit workout"]');
    const closeSheet = () => p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => x.style.zIndex === '62'); d.click(); });
    await tapSel(p, editBtn);
    check('Home: Edit opens the design\'s sheet with today\'s REAL exercises (it used to show Squat / Push-up / Deadlift / Pull-up demo rows)', /Push-up 3 × 12 Shoulder Press 3 × 10 Bicep Curl 3 × 12 Pull-up 3 × 6/.test(await sheetRows(p)), (await sheetRows(p)).slice(0, 110));
    await closeSheet(); await p.waitForTimeout(700);
    check('Home: closing without a change saves nothing', !msgs.some(m => m.type === 'saveEdit'));
    await tapSel(p, editBtn);
    const rm = await p.evaluate(() => { const sh = [...document.querySelectorAll('div')].find(d => d.style.maxHeight === '620px'); const row = [...sh.querySelectorAll('div')].find(d => /Bicep Curl/.test(d.innerText || '') && d.children.length >= 2 && (d.innerText || '').length < 40); const x = row.querySelector('div[aria-label], div[style*="cursor: pointer"]'); const r = x.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.touchscreen.tap(rm.x, rm.y); await p.waitForTimeout(300);
    await closeSheet(); await p.waitForTimeout(900);
    const saves = msgs.filter(m => m.type === 'saveEdit');
    check('Home: closing posts ONE saveEdit for today\'s workout with the final rows', saves.length === 1 && saves[0].wid === 'w1' && saves[0].rows.map(r => r[0]).join() === 'Push-up,Shoulder Press,Pull-up', JSON.stringify(saves.map(s => [s.wid, s.rows && s.rows.map(r => r[0])])));
    plan = pe.applyEditRows(plan, saves[0].wid, saves[0].rows);
    await p.evaluate(logicJs()); await inject(p); await p.waitForTimeout(700);
    check('Home: after the save the hero shows the new exercise count (3)', /^Upper Body \d+ min · 3 exercises$/.test(await hero()), await hero());
    await tapSel(p, editBtn);
    check('Home: reopening the sheet lists the saved exercises', /Push-up 3 × 12 Shoulder Press 3 × 10 Pull-up 3 × 6/.test(await sheetRows(p)) && !/Bicep Curl/.test(await sheetRows(p)), (await sheetRows(p)).slice(0, 100));
    await p.screenshot({ path: path.join(ROOT, '.scratch', 'home-edit-saved.png') });
    await ctx.close();
  }
  await wk.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
