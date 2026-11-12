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
const { RENAME_ROW_KEY } = require('../lib/editSheetBridge.ts');
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
  {
    const keep = rows(plan.workouts[1]);
    const rn = pe.applyEditRows(plan, 'w1', [...keep, [RENAME_ROW_KEY, '  Push Day  ']]);
    check('RENAME: the name row renames the workout (trimmed) and keeps every exercise as it was', rn && rn.workouts[1].splitLabel === 'Push Day' && rn.workouts[1].exercises === plan.workouts[1].exercises || (rn && rn.workouts[1].splitLabel === 'Push Day' && rn.workouts[1].exercises.every((e, i) => e === plan.workouts[1].exercises[i])), rn && rn.workouts[1].splitLabel);
    check('RENAME: the other workouts keep their names', rn.workouts[0].splitLabel === 'Lower Body' && rn.workouts[2].splitLabel === 'Full Body');
    check('RENAME: the name row is never treated as an exercise', rn.workouts[1].exercises.length === plan.workouts[1].exercises.length);
    check('RENAME: an empty or unchanged name changes nothing (null)', pe.applyEditRows(plan, 'w1', [...keep, [RENAME_ROW_KEY, '   ']]) === null && pe.applyEditRows(plan, 'w1', [...keep, [RENAME_ROW_KEY, 'Upper Body']]) === null);
    const both = pe.applyEditRows(plan, 'w1', [...keep.filter(r => r[0] !== 'Bicep Curl'), [RENAME_ROW_KEY, 'Arms']]);
    check('RENAME: a rename together with an exercise change saves both', both.workouts[1].splitLabel === 'Arms' && both.workouts[1].exercises.length === 3);
    check('RENAME: a very long name is cut to 40 characters', pe.applyEditRows(plan, 'w1', [...keep, [RENAME_ROW_KEY, 'x'.repeat(80)]]).workouts[1].splitLabel.length === 40);
  }
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
    const renamedOk = await saveWorkoutEdit('w2', [['Bodyweight Squat', '3 × 12'], ['Push-up', '3 × 12'], [RENAME_ROW_KEY, 'Leg Day']]);
    const st2 = await loadPlan();
    check('RENAME: saved to storage AND the plan store, so every screen (Home, Train, My workouts, the workout) shows it', renamedOk === true && st2.workouts[2].splitLabel === 'Leg Day' && usePlanStore.getState().plan.workouts[2].splitLabel === 'Leg Day');
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
    await p.touchscreen.tap(add.x, add.y); await p.waitForTimeout(700);
    const picker = () => p.evaluate(() => { const e = document.getElementById('__trpick'); return e ? { open: e.style.display === 'block', rows: [...e.querySelectorAll('[data-pick]')].map(r => r.getAttribute('data-pick')), none: /No exercises match/.test(e.innerText) } : null; });
    const pk0 = await picker();
    check('Train: "Add exercise" opens a picker (adds nothing yet)', pk0 && pk0.open && pk0.rows.length === 12 && !/Bodyweight Squat 3 × 10/.test(await sheetRows(p)), JSON.stringify(pk0 && pk0.rows.slice(0, 3)));
    await p.fill('#__trpick input', 'lung'); await p.waitForTimeout(200);
    const pk1 = await picker();
    const want = pe.addableExercises().map(r => r[0]).filter(n => !['Push-up', 'Shoulder Press', 'Pull-up'].includes(n));
    const rank = require('../lib/trainData').rankExercises(pe.addableExercises().filter(r => !['Push-up', 'Shoulder Press', 'Pull-up'].includes(r[0])), 'lung', 12).map(r => r[0]);
    check('Train: picker search uses the SAME ranking as Practice Exercises (starts-with first, then contains)', pk1.rows.length > 0 && pk1.rows.join() === rank.join(), pk1.rows.join(' | '));
    await p.fill('#__trpick input', 'zzzzq'); await p.waitForTimeout(200);
    check('Train: picker with no match says so', (await picker()).none);
    await p.fill('#__trpick input', 'bodyweight squat'); await p.waitForTimeout(200);
    const pt = await p.evaluate(() => { const r = document.querySelector('#__trpick [data-pick]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, n: document.querySelector('#__trpick [data-pick]').getAttribute('data-pick') }; });
    await p.touchscreen.tap(pt.x, pt.y); await p.waitForTimeout(700);
    const after = await sheetRows(p);
    check('Train: only the tapped exercise is added (and the picker closes)', after.includes(pt.n) && !(await picker()).open && (after.match(/\d × \d+/g) || []).length === 4, pt.n + ' / ' + after.slice(0, 130));
    
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
    // RENAME on the real page: the sheet has a "Workout name" box; a new name is saved with the rows
    await p.evaluate(() => { const r = [...document.querySelectorAll('div[data-scroll]')].find(x => x.style.overflowX === 'auto' && x.children.length === 7); r.scrollLeft = 99999; });
    await p.waitForTimeout(400);
    await tapSel(p, editTomorrow);
    const nb = await p.evaluate(() => { const i = document.querySelector('[data-edit-name] input'); if (!i) return null; const sh = i.closest('div[style*="620px"]'); const sr = sh.getBoundingClientRect(), ir = i.getBoundingClientRect(); return { v: i.value, fs: getComputedStyle(i).fontSize, inside: ir.top >= sr.top && ir.bottom <= sr.bottom && ir.width > 150 }; });
    check('RENAME Train: the Edit sheet has a "Workout name" box, filled with the name (Full Body), text 16px or more (no iOS zoom), inside the sheet', !!nb && nb.v === 'Full Body' && parseFloat(nb.fs) >= 16 && nb.inside, JSON.stringify(nb));
    await p.screenshot({ path: path.join(ROOT, '.scratch', 'train-edit-rename.png') });
    await p.fill('[data-edit-name] input', 'Leg Day');
    await closeSheet(); await p.waitForTimeout(900);
    const s3 = msgs.filter(m => m.type === 'saveEdit'), last = s3[s3.length - 1];
    check('RENAME Train: a rename alone is saved: one saveEdit for that workout, the same exercises plus ONE name row', s3.length === 3 && last.wid === 'w2' && last.rows.length === 3 && last.rows[2][0] === RENAME_ROW_KEY && last.rows[2][1] === 'Leg Day', JSON.stringify(last));
    plan = pe.applyEditRows(plan, 'w2', last.rows);
    await push(p); await p.waitForTimeout(600);
    const tomorrowCard = await p.evaluate(() => { const r = [...document.querySelectorAll('div[data-scroll]')].find(x => x.style.overflowX === 'auto' && x.children.length === 7); return r.children[6].innerText.split(String.fromCharCode(10)).join(' ').trim(); });
    check('RENAME Train: after the save the card shows the new name', /Leg Day/.test(tomorrowCard) && !/Full Body/.test(tomorrowCard), tomorrowCard.slice(0, 60));
    await tapSel(p, editTomorrow);
    check('RENAME Train: reopening the sheet shows the new name in the box', (await p.evaluate(() => document.querySelector('[data-edit-name] input').value)) === 'Leg Day');
    await p.fill('[data-edit-name] input', '');
    await closeSheet(); await p.waitForTimeout(800);
    check('RENAME Train: closing with an empty box (or the same name) saves nothing', msgs.filter(m => m.type === 'saveEdit').length === 3);
    await ctx.close();
  }

  // ── Home ──
  {
    const home = require('../app/(tabs)/index.tsx');
    const { dcLogicPatchJs } = require('../lib/dcLogicPatch.ts');
    const { EDIT_BRIDGE_JS } = require('../lib/editSheetBridge.ts');
    const helpers = require('../lib/dcWebviewHelpers.ts');
    let plan = mkPlan();
    const before = helpers.DC_VIEWPORT_JS + helpers.DC_NO_ZOOM_JS + helpers.DC_SETTLE_JS + home.HOME_GUARD_JS + EDIT_BRIDGE_JS + require('../lib/addExercisePicker.ts').ADD_PICKER_JS + dcLogicPatchJs(home.HOME_LOGIC_EXT);
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
    const geo = await p.evaluate(() => { const e = [...document.querySelectorAll('div')].find(d => d.style.maxHeight === '620px'); const c = [...document.querySelectorAll('div')].find(d => d.style.height === '520px' && d.style.position === 'absolute'); return { e: [getComputedStyle(e).visibility, getComputedStyle(e).pointerEvents], c: [getComputedStyle(c).visibility, getComputedStyle(c).pointerEvents], pad: [...document.querySelectorAll('[data-fp-header]')].map(h => h.style.paddingTop) }; });
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
    // Home's Add exercise opens the SAME picker as Train (word-start search over the real catalogue)
    const addH = await p.evaluate(() => { const sh = [...document.querySelectorAll('div')].find(d => d.style.maxHeight === '620px'); const b = [...sh.querySelectorAll('div,a')].filter(e => /^Add exercise$/.test((e.innerText || '').trim()))[0]; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.touchscreen.tap(addH.x, addH.y); await p.waitForTimeout(700);
    const pickerH = () => p.evaluate(() => { const e = document.getElementById('__trpick'); return e ? { open: e.style.display === 'block', rows: [...e.querySelectorAll('[data-pick]')].map(r => r.getAttribute('data-pick')), none: /No exercises match/.test(e.innerText) } : null; });
    const h0 = await pickerH();
    check('Home: "Add exercise" opens the picker and adds nothing yet', h0 && h0.open && h0.rows.length === 12 && !/Bodyweight Squat 3 × 10/.test(await sheetRows(p)), JSON.stringify(h0 && h0.rows.slice(0, 3)));
    const { searchExercises } = require('../lib/exerciseSearch.ts');
    const names = pe.addableExercises().map(r => r[0]).filter(n => !['Push-up', 'Shoulder Press', 'Pull-up'].includes(n));
    for (const q of ['g', 'lung', 'push']) {
      await p.fill('#__trpick input', q); await p.waitForTimeout(200);
      const got = (await pickerH()).rows.join(); const want = searchExercises(names, q, 12).join();
      check(`Home picker: search "${q}" gives exactly the shared word-start answer`, got === want && got.length > 0, got.slice(0, 90));
    }
    await p.fill('#__trpick input', 'ight'); await p.waitForTimeout(200);
    check('Home picker: a match in the MIDDLE of a word finds nothing ("ight" does not find Bodyweight Squat)', (await pickerH()).none);
    await p.fill('#__trpick input', 'bodyweight squat'); await p.waitForTimeout(200);
    const ph = await p.evaluate(() => { const r = document.querySelector('#__trpick [data-pick]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.touchscreen.tap(ph.x, ph.y); await p.waitForTimeout(700);
    check('Home: only the tapped exercise is added, the picker closes', /Bodyweight Squat 3 × 10/.test(await sheetRows(p)) && !(await pickerH()).open);
    await closeSheet(); await p.waitForTimeout(900);
    const saves2 = msgs.filter(m => m.type === 'saveEdit');
    check('Home: the added exercise is saved to the plan', saves2.length === 2 && saves2[1].rows.map(r => r[0]).join() === 'Push-up,Shoulder Press,Pull-up,Bodyweight Squat', JSON.stringify(saves2.map(x => x.rows && x.rows.length)));
    // RENAME on Home: same sheet, same box
    plan = pe.applyEditRows(plan, saves2[1].wid, saves2[1].rows);
    await p.evaluate(logicJs()); await inject(p); await p.waitForTimeout(700);
    await tapSel(p, editBtn);
    const hv = await p.evaluate(() => { const i = document.querySelector('[data-edit-name] input'); return i ? i.value : null; });
    check('RENAME Home: the sheet has the Workout name box filled with the current name', hv === 'Upper Body', String(hv));
    await p.fill('[data-edit-name] input', 'Push Day');
    await closeSheet(); await p.waitForTimeout(900);
    const saves3 = msgs.filter(m => m.type === 'saveEdit');
    check('RENAME Home: the new name is posted once, as the last row', saves3.length === 3 && saves3[2].rows[saves3[2].rows.length - 1][0] === RENAME_ROW_KEY && saves3[2].rows[saves3[2].rows.length - 1][1] === 'Push Day', JSON.stringify(saves3[2]));
    plan = pe.applyEditRows(plan, saves3[2].wid, saves3[2].rows);
    await p.evaluate(logicJs()); await inject(p); await p.waitForTimeout(700);
    check('RENAME Home: the hero shows the new name', /^Push Day [0-9]+ min/.test(await hero()), await hero());
    await p.screenshot({ path: path.join(ROOT, '.scratch', 'home-edit-saved.png') });
    await ctx.close();
  }
  await wk.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
