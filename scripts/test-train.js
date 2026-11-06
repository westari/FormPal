#!/usr/bin/env node
/**
 * scripts/test-train.js
 *
 * The Train tab against the NEW design file (assets/app screens/traintab.html), in WebKit (closest to the phone),
 * with the EXACT injection the tab ships (TRAIN_BEFORE from app/(tabs)/train.tsx) and the real data builder
 * (lib/trainData.ts). Proves:
 *   - it is the new design (fingerprint), not the old one
 *   - real data: plan workout on Today, finished days from the session log, calendar dates, streak, Practice list,
 *     My Workouts, Edit sheet rows
 *   - real chrome: fake tab bar + "+" hidden, header below the notch, sheets hidden until opened and lifted above
 *     the tab bar, last section scrolls clear of the tab bar
 *   - every button goes to the real screen, nothing navigates the page away, search filters, Cue chat is wired
 *   - no zoom (REAL pinch in Chromium), nothing paints before ready
 *   - geometry equals the bare design file (same viewport, no insets), screenshot side by side
 * Screenshots: .scratch/train-file.png, .scratch/train-tab.png, .scratch/train-compare.png
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const Module = require('module'); const orig = Module._load;
Module._load = function (r) { if (/constants\/api$/.test(r)) return { MYPAL_API_URL: 'http://localhost/none' }; if (r === 'expo-asset') return { Asset: {} }; return orig.apply(this, arguments); };
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { webkit, chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const train = require('../app/(tabs)/train.tsx');
const { buildTrainData } = require('../lib/trainData.ts');
const { athltSetDataJs } = require('../lib/dcLogicPatch.ts');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const FILE = path.join(ROOT, 'assets', 'app screens', 'traintab.html');
const URL_ = pathToFileURL(FILE).href;

// ── the new file, not the old one ────────────────────────────────────────────────────────────────────────────
const md5 = crypto.createHash('md5').update(fs.readFileSync(FILE)).digest('hex');
console.log(`      traintab.html: ${fs.statSync(FILE).size} bytes, md5 ${md5.slice(0, 8)} (the old Oct 5 file was 164128 bytes, sha1 3d54799f)`);
check('the file on disk is the new design (not the 164 KB Oct 5 file)', fs.statSync(FILE).size > 300000);

// ── data ─────────────────────────────────────────────────────────────────────────────────────────────────────
const DAY = 86400000, now = new Date(2026, 10, 5, 14, 0, 0); // a Thursday
const at = (daysAgo, h = 9) => { const d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(h, 0, 0, 0); return d.getTime(); };
const ex = (id, displayName, sets, reps) => ({ exerciseId: id, displayName, targetSets: sets, targetReps: reps, restSeconds: 60, currentVariationId: id });
const plan = { id: 'p', profile: { goal: 'general', experience: 'beginner', daysPerWeek: 4, location: 'gym' }, currentWorkoutIndex: 1,
  workouts: [
    { id: 'w0', splitLabel: 'Lower Body', exercises: [ex('squat', 'Bodyweight Squat', 3, 12), ex('lunge', 'Lunge', 3, 10)] },
    { id: 'w1', splitLabel: 'Upper Body', exercises: [ex('pushup', 'Push-up', 3, 12), ex('shoulderPress', 'Shoulder Press', 3, 10), ex('curl', 'Bicep Curl', 3, 12), ex('pullup', 'Pull-up', 3, 6)] },
    { id: 'w2', splitLabel: 'Full Body', exercises: [ex('squat', 'Bodyweight Squat', 3, 12), ex('pushup', 'Push-up', 3, 12), ex('row', 'Row', 3, 10)] },
  ] };
const entry = (ts, id, name, reps) => ({ ts, exerciseId: id, displayName: name, reps, goodReps: reps - 1, pct: 90, formChecked: true });
const sessions = [
  entry(at(1), 'squat', 'Bodyweight Squat', 12), entry(at(1), 'lunge', 'Lunge', 10),   // yesterday: Lower Body
  entry(at(3), 'pushup', 'Push-up', 12), entry(at(3), 'shoulderPress', 'Shoulder Press', 10), // 3 days ago
  entry(at(4), 'squat', 'Bodyweight Squat', 12),
];
const INS = { top: 62, bottom: 34 };
const data = buildTrainData(plan, sessions, INS, now);

console.log('--- data (lib/trainData.ts) ---');
console.log('      cal   ', JSON.stringify(data.cal));
console.log('      days  ', data.days.map(d => `${d.short}:${d.name}${d.done ? '(done)' : ''}`).join(' | '));
check('7 day cards and 7 calendar days, today in slot 5 (the design centres slot 5)', data.days.length === 7 && data.cal.length === 7 && data.cal[5][1] === 5 && data.cal[5][0] === 'Thu', JSON.stringify(data.cal[5]));
check('today is the plan\'s current workout with real minutes and exercise count', data.days[5].name === 'Upper Body' && /^\d+ min · 4 exercises$/.test(data.days[5].meta), data.days[5].meta);
check('yesterday shows the workout that was really done (matched to the plan)', data.days[4].done && data.days[4].name === 'Lower Body' && /2 exercises · 22 reps/.test(data.days[4].meta), data.days[4].name + ' / ' + data.days[4].meta);
check('days with no workout are rest days', data.days[3].rest === true && /^Recover for /.test(data.days[3].meta), data.days[3].short + ' ' + data.days[3].meta);
check('tomorrow is the next plan workout', data.days[6].name === 'Full Body');
check('Edit sheet rows exist for today (real exercises)', data.moves['Upper Body'].length === 4 && data.moves['Upper Body'][0][0] === 'Push-up' && data.moves['Full body'].length > 0);
check('Practice list is the real catalogue, Squat/Push-up first, ids mapped', data.lib.length > 20 && data.libIds[data.lib[0][0]] === 'squat' && data.libIds[data.lib[1][0]] === 'pushup', data.lib.slice(0, 3).map(l => l.join(' / ')).join(' | '));
check('My Workouts = first three plan workouts', data.myWorkouts.length === 3 && data.myWorkouts[0].name === 'Lower Body');
const empty = buildTrainData(null, [], INS, now);
check('no plan: today is a rest card that offers to start, nothing crashes', empty.days[5].rest && empty.myWorkouts.length === 0 && empty.days.length === 7);
const doneToday = buildTrainData(plan, [...sessions, entry(at(0, 8), 'pushup', 'Push-up', 12)], INS, now);
check('a workout done today shows as finished with its recap link', doneToday.days[5].done && /^tr:recap:/.test(doneToday.days[5].href));

// ── the page ─────────────────────────────────────────────────────────────────────────────────────────────────
const SCRIPTS = train.TRAIN_BEFORE;
async function openTab(browser, { width = 402, height = 874, insets = INS, dataset = data, engineOpts = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...engineOpts });
  const p = await ctx.newPage();
  const msgs = [];
  await p.exposeFunction('__post', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
  await p.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  await p.addInitScript(SCRIPTS);
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  const first = { vis: null };
  const d = { ...dataset, insets };
  await p.goto(URL_, { waitUntil: 'commit' });
  const t0 = Date.now(); let pushed = false, sawVisibleBeforeReady = false;
  while (!msgs.some(m => m.type === 'ready') && Date.now() - t0 < 25000) {
    if (!pushed && msgs.some(m => m.type === 'needData')) { pushed = true; await p.evaluate(athltSetDataJs(d)); }
    const vis = await p.evaluate(() => (document.body ? getComputedStyle(document.body).visibility : 'none')).catch(() => 'none');
    if (vis === 'visible' && !msgs.some(m => m.type === 'ready')) sawVisibleBeforeReady = true;
    await p.waitForTimeout(40);
  }
  await p.waitForTimeout(700);
  return { ctx, p, msgs, readyMs: Date.now() - t0, sawVisibleBeforeReady };
}

(async () => {
  const wk = await webkit.launch();
  // ── bare design file (what it looks like) ──
  const raw = await wk.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  const rp = await raw.newPage();
  await rp.goto(URL_); await rp.waitForTimeout(3500);
  await rp.screenshot({ path: path.join(ROOT, '.scratch', 'train-file.png') });
  const RECTS = () => {
    const find = (re) => [...document.querySelectorAll('div,a,span')].filter(e => (e.children.length === 0 || e.children.length === 1 && e.firstElementChild.tagName === 'SPAN') && re.test((e.textContent || '').trim()))[0];
    const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left * 10) / 10, Math.round(b.top * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10]; };
    const rail = [...document.querySelectorAll('div[data-scroll]')].find(x => x.style.overflowX === 'auto' && x.children.length === 7);
    return { title: r(find(/^Train$/)), strip: r([...document.querySelectorAll('div')].find(d => d.style.height === '76px')), today: r(rail && rail.children[5]), railTop: r(rail), quick: r(find(/^Quick Start$/)), create: r(find(/^Create workout$/)), myW: r(find(/^My Workouts$/)), practice: r(find(/^Practice Exercises$/)) };
  };
  const rawRects = await rp.evaluate(RECTS);
  await raw.close();

  // ── the tab, same viewport, no insets ──
  const same = await openTab(wk, { width: 390, height: 844, insets: { top: 0, bottom: 0 } });
  await same.p.screenshot({ path: path.join(ROOT, '.scratch', 'train-tab-390.png') });
  const tabRects = await same.p.evaluate(RECTS);
  const diffs = Object.keys(rawRects).map(k => { const a = rawRects[k], b = tabRects[k]; return a && b ? Math.max(...a.map((v, i) => Math.abs(v - b[i]))) : 999; });
  console.log('      file :', JSON.stringify(rawRects)); console.log('      tab  :', JSON.stringify(tabRects));
  check('geometry equals the bare design file (title, calendar strip, Today card, Quick Start, My Workouts, Practice): max difference ' + Math.max(...diffs).toFixed(1) + 'px', Math.max(...diffs) <= 1.5, JSON.stringify(Object.fromEntries(Object.keys(rawRects).map((k, i) => [k, diffs[i]]))));
  await same.ctx.close();

  // ── the tab on a real phone (402x874, top inset 62, bottom 34) ──
  const { ctx, p, msgs, readyMs, sawVisibleBeforeReady } = await openTab(wk);
  console.log(`      ready after ${readyMs}ms`);
  await p.screenshot({ path: path.join(ROOT, '.scratch', 'train-tab.png') });
  const fp = (msgs.find(m => m.type === 'fingerprint') || {}).fp || '';
  console.log('      fingerprint:', fp);
  check('the page fingerprint is the NEW design (7 cards, Quick Start, My Workouts, Practice Exercises, no old hero)', /cards=7 quickStart=1 myWorkouts=1 practice=1 oldHero=0 title=Train/.test(fp), fp);
  check('nothing painted before the page said ready', !sawVisibleBeforeReady);

  const dom = await p.evaluate(() => {
    const txt = (e) => (e.textContent || '').trim();
    const rail = [...document.querySelectorAll('div[data-scroll]')].find(x => x.style.overflowX === 'auto' && x.children.length === 7);
    const cards = [...rail.children].map(c => c.innerText.replace(/\s+/g, ' ').trim());
    const strip = [];
    const nums = [...document.querySelectorAll('div')].filter(d => /^\d{1,2}$/.test(txt(d)) && d.style.fontSize === '17px').map(txt);
    const bar = [...document.querySelectorAll('div')].filter(d => d.style.right === '88px' && d.style.bottom === '22px');
    const fab = [...document.querySelectorAll('div')].filter(d => d.style.right === '14px' && d.style.bottom === '22px' && d.style.width === '64px');
    const hdr = document.querySelector('[data-train-header]');
    const S = window.__dcCanvasScale;
    const title = [...document.querySelectorAll('div')].find(d => d.style.fontSize === '30px' && txt(d) === 'Train');
    const sheets = [...document.querySelectorAll('div')].filter(d => d.style.maxHeight === '620px' || (d.style.height === '520px' && d.style.position === 'absolute')).map(d => { const r = d.getBoundingClientRect(), cs = getComputedStyle(d); return { top: Math.round(r.top), vis: cs.visibility, pe: cs.pointerEvents }; });
    const streak = [...document.querySelectorAll('span')].map(txt).find(t => /^\d+$/.test(t));
    const today = rail.children[5].getBoundingClientRect(), railR = rail.getBoundingClientRect();
    return { cards, strip, nums, barHidden: bar.length > 0 && bar.every(b => getComputedStyle(b).display === 'none'), fabHidden: fab.length > 0 && fab.every(b => getComputedStyle(b).display === 'none'),
      titleTop: title ? title.getBoundingClientRect().top : -1, S, sheets, streak, vh: innerHeight, todayCentre: today.left + today.width / 2, vw: innerWidth, scrollLeft: rail.scrollLeft,
      my: [...document.querySelectorAll('a[href^="Workout Preview"]')].map(a => ({ t: a.innerText.replace(/\s+/g, ' ').trim(), d: getComputedStyle(a).display })),
      lib: [...document.querySelectorAll('[aria-label="Check form"]')].length, path: location.pathname };
  });
  console.log('      cards:', dom.cards.map(c => c.slice(0, 48)).join(' || '));
  check('Today card (slot 5) shows the real workout, "Start workout" button', /^Today Upper Body \d+ min · 4 exercises/.test(dom.cards[5]) && /Start workout/.test(dom.cards[5]), dom.cards[5]);
  check('Yesterday shows the real finished workout with "View recap"', /^Wed Lower Body 2 exercises · 22 reps/.test(dom.cards[4].replace('Thu', 'Wed')) || /Lower Body 2 exercises · 22 reps/.test(dom.cards[4]), dom.cards[4].slice(0, 70));
  check('rest days show "Rest day"', /Rest day/.test(dom.cards[3]) && /Rest day/.test(dom.cards[0]), dom.cards[3].slice(0, 40));
  check('the calendar strip carries the real dates (rolling week, today = slot 5)', dom.nums.join(',') === data.cal.map(c => c[1]).join(','), dom.nums.join(','));
  check('the design centred Today on open (its own scroll logic still works)', Math.abs(dom.todayCentre - dom.vw / 2) < 6, `today centre ${dom.todayCentre.toFixed(1)} vs ${dom.vw / 2}`);
  check('the streak is the real streak', dom.streak === String(data.streak), dom.streak + ' vs ' + data.streak);
  check('the fake tab bar and the fake "+" are hidden (the app has real ones)', dom.barHidden && dom.fabHidden);
  const hdrGap = dom.titleTop;
  check(`the header sits below the notch (title top ${hdrGap.toFixed(0)}px >= top inset ${INS.top})`, hdrGap >= INS.top);
  check('both sheets are completely hidden at launch (not visible, no taps)', dom.sheets.length === 2 && dom.sheets.every(s => s.vis === 'hidden' && s.pe === 'none'), JSON.stringify(dom.sheets));
  check('My Workouts shows the real first three workouts', dom.my.length === 3 && dom.my[0].t.startsWith('Lower Body') && dom.my[1].t.startsWith('Upper Body'), JSON.stringify(dom.my.map(m => m.t)));
  check('the page is still the same document (never navigated away)', dom.path.endsWith('traintab.html'));

  // ── buttons ──
  const take = () => msgs.filter(m => m.type === 'nav' || m.type === 'practice').splice(0);
  const clear = () => { for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].type === 'nav' || msgs[i].type === 'practice') msgs.splice(i, 1); };
  const tapText = async (re, scope = 'a,div') => {
    const c = await p.evaluate(({ re, scope }) => {
      const rx = new RegExp(re);
      const el = [...document.querySelectorAll(scope)].filter(e => rx.test((e.innerText || '').trim()) && !e.children.length === false || false)[0];
      return null;
    }, { re: re.source, scope });
    return c;
  };
  async function tapEl(selectorFn, arg) {
    const pt = await p.evaluate(({ fn, arg }) => { const el = eval('(' + fn + ')')(arg); if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, { fn: selectorFn.toString(), arg });
    if (!pt) throw new Error('no element for ' + selectorFn);
    await p.waitForTimeout(150);
    const pt2 = await p.evaluate(({ fn, arg }) => { const el = eval('(' + fn + ')')(arg); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, { fn: selectorFn.toString(), arg });
    await p.touchscreen.tap(pt2.x, pt2.y); await p.waitForTimeout(350);
  }
  const railCard = (i) => [...document.querySelectorAll('div[data-scroll]')].find(x => x.style.overflowX === 'auto' && x.children.length === 7).children[i];
  const linkIn = (arg) => { const c = [...document.querySelectorAll('div[data-scroll]')].find(x => x.style.overflowX === 'auto' && x.children.length === 7).children[arg.i]; return [...c.querySelectorAll('a')].find(a => new RegExp(arg.re).test(a.innerText)); };
  clear(); await tapEl(linkIn, { i: 5, re: 'Start workout' });
  check('Start workout -> the real workout screen', take().some(m => m.type === 'nav' && m.to === 'start'));
  clear(); await tapEl(linkIn, { i: 4, re: 'View recap' });
  const recap = take()[0];
  check('View recap (yesterday) -> that workout\'s recap, by its timestamp', recap && recap.to === 'recap:' + at(1), JSON.stringify(recap));
  clear(); await tapEl(linkIn, { i: 3, re: 'Log a session' });
  check('Log a session (rest day) -> the real log screen', take().some(m => m.to === 'log'));
  clear(); await tapEl(linkIn, { i: 6, re: 'Preview workout' });
  check('Preview workout (tomorrow) -> My Workouts', take().some(m => m.to === 'myworkouts'));
  const byText = (re) => [...document.querySelectorAll('a')].find(a => new RegExp(re).test(a.innerText));
  clear(); await tapEl(byText, '^Create workout');
  check('Create workout -> the real create screen', take().some(m => m.to === 'create'));
  clear(); await tapEl(byText, '^Log a session$');
  check('Quick Start "Log a session" -> the real log screen', take().some(m => m.to === 'log'));
  clear(); await tapEl(byText, '^My Workouts');
  check('My Workouts header -> the real My Workouts screen', take().some(m => m.to === 'myworkouts'));
  clear(); await tapEl(byText, '^Upper Body');
  check('a My Workouts card -> My Workouts (never leaves the page)', take().some(m => m.to === 'myworkouts'));
  // Practice Exercises: the design shows its list only while you search (that is how the file is designed)
  const typeSearch = async (text) => {
    await p.evaluate(() => { const i = document.querySelector('input[placeholder^="Search"]'); i.scrollIntoView({ block: 'center' }); });
    await p.waitForTimeout(150);
    const si = await p.evaluate(() => { const r = document.querySelector('input[placeholder^="Search"]').getBoundingClientRect(); return { x: r.x + 30, y: r.y + r.height / 2 }; });
    await p.touchscreen.tap(si.x, si.y);
    await p.keyboard.press('Control+A'); await p.keyboard.type(text); await p.waitForTimeout(400);
  };
  const rows = () => p.evaluate(() => [...document.querySelectorAll('[aria-label="Check form"]')].map(b => { let e = b; for (let i = 0; i < 4 && e; i++, e = e.parentElement) if (e.innerText && e.innerText.length > 4) return e.innerText.replace(/\s+/g, ' ').trim(); return ''; }));
  check('no exercise list until you search (as designed)', (await rows()).length === 0);
  await typeSearch('push');
  const pushRows = await rows();
  console.log('      search "push":', JSON.stringify(pushRows));
  check('search finds the real exercises ("push")', pushRows.length >= 2 && pushRows.every(t => /push/i.test(t)), JSON.stringify(pushRows));
  clear(); await tapEl(() => document.querySelectorAll('[aria-label="Check form"]')[0]);
  const pr = take()[0];
  check('Check form on the first result -> the camera for that exact exercise (pushup)', pr && pr.type === 'practice' && pr.id === 'pushup', JSON.stringify(pr));
  await typeSearch('lunge');
  const lr = await rows();
  check('search "lunge" lists only lunges', lr.length >= 1 && lr.every(t => /lunge/i.test(t)), JSON.stringify(lr));
  clear(); await tapEl(() => document.querySelectorAll('[aria-label="Check form"]')[0]);
  check('...and Check form opens that exercise', take().some(m => m.type === 'practice' && m.id === 'lunge'));
  await typeSearch('zzzz');
  check('a search with no match shows the designs own No exercises match that message', /No exercises match that/.test(await p.evaluate(() => document.body.innerText)));
  await typeSearch('lunge');
  await p.screenshot({ path: path.join(ROOT, '.scratch', 'train-tab-search.png') });
  await p.evaluate(() => { const i = document.querySelector('input[placeholder^="Search"]'); i.blur(); });

  // ── bottom padding: the last section scrolls clear of the real tab bar ──
  const sc = await p.evaluate(() => { const s = [...document.querySelectorAll('div[data-scroll]')].find(x => x.style.overflowY === 'auto' || getComputedStyle(x).overflowY === 'auto'); s.scrollTop = 99999; return true; });
  await p.waitForTimeout(250);
  const last = await p.evaluate(() => {
    const body = [...document.querySelectorAll('div')].filter(d => d.style.borderBottom || d.style.borderTop || true);
    const lastEl = [...document.querySelectorAll('[aria-label="Check form"]')].pop() || document.querySelector('input[placeholder^="Search"]');
    return { lastBottom: lastEl.getBoundingClientRect().bottom + 12, vh: innerHeight };
  });
  const tabTop = last.vh - INS.bottom - 49;
  check(`the last row can scroll above the real tab bar (bottom ${last.lastBottom.toFixed(0)} <= tab top ${tabTop})`, last.lastBottom <= tabTop + 1);
  await p.screenshot({ path: path.join(ROOT, '.scratch', 'train-tab-bottom.png') });
  await p.evaluate(() => { [...document.querySelectorAll('div[data-scroll]')].forEach(s => { s.scrollTop = 0; }); });
  await p.waitForTimeout(200);

  // ── sheets: Edit opens with real rows, closes, hidden again ──
  clear(); await tapEl((arg) => { const c = [...document.querySelectorAll('div[data-scroll]')].find(x => x.style.overflowX === 'auto' && x.children.length === 7).children[5]; return c.querySelector('a[aria-label="Edit workout"]'); });
  await p.waitForTimeout(700);
  const open = await p.evaluate(() => { const e = [...document.querySelectorAll('div')].find(d => d.style.maxHeight === '620px'); const r = e.getBoundingClientRect(); return { vis: getComputedStyle(e).visibility, top: r.top, bottom: r.bottom, text: e.innerText.replace(/\s+/g, ' ').trim(), vh: innerHeight }; });
  console.log('      edit sheet:', open.text.slice(0, 120));
  check('Edit opens the design\'s own sheet with today\'s REAL exercises', open.vis === 'visible' && /Edit Workout/.test(open.text) && /Push-up/.test(open.text) && /Bicep Curl/.test(open.text), open.text.slice(0, 100));
  check('the open sheet sits above the real tab bar (bottom ' + open.bottom.toFixed(0) + ' <= ' + (open.vh - INS.bottom - 49 + 2) + ')', open.bottom <= open.vh - INS.bottom - 49 + 2);
  await p.screenshot({ path: path.join(ROOT, '.scratch', 'train-tab-edit.png') });
  await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => x.style.zIndex === '62'); d.click(); });
  await p.waitForTimeout(900);
  const closed = await p.evaluate(() => [...document.querySelectorAll('div')].filter(d => d.style.maxHeight === '620px').map(d => getComputedStyle(d).visibility));
  check('after closing it is hidden again', closed.every(v => v === 'hidden'));

  // ── Cue chat is real ──
  clear(); await tapEl((arg) => { const c = [...document.querySelectorAll('div[data-scroll]')].find(x => x.style.overflowX === 'auto' && x.children.length === 7).children[5]; return [...c.querySelectorAll('a')].find(a => /Edit with Cue/.test(a.innerText)); });
  await p.waitForTimeout(700);
  const inp = await p.evaluate(() => { const i = [...document.querySelectorAll('input')].find(x => /minutes|form|e\.g\./.test(x.placeholder)); const r = i.getBoundingClientRect(); return { x: r.x + 20, y: r.y + r.height / 2, vis: getComputedStyle(i.closest('div[style*="520px"]')).visibility }; });
  check('Edit with Cue opens its sheet', inp.vis === 'visible');
  await p.touchscreen.tap(inp.x, inp.y); await p.keyboard.type('make it 20 minutes'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  check('sending in the Cue chat goes to the real Cue backend (homeCueSend), not the design\'s fake reply', msgs.some(m => m.type === 'homeCueSend' && m.text === 'make it 20 minutes'));
  await p.screenshot({ path: path.join(ROOT, '.scratch', 'train-tab-cue.png') });
  await ctx.close();

  // ── a rest card with nothing to do has no button (tomorrow's "Train anyway" went nowhere) ──
  {
    const e = await openTab(wk, { dataset: empty });
    const btns = await e.p.evaluate(() => { const r = [...document.querySelectorAll('div[data-scroll]')].find(x => x.style.overflowX === 'auto' && x.children.length === 7); return [5, 6].map(i => [...r.children[i].querySelectorAll('a')].map(a => ({ t: a.innerText.trim(), d: getComputedStyle(a).display, h: a.getAttribute('href') }))); });
    console.log('      no plan, buttons today/tomorrow:', JSON.stringify(btns));
    check('the rest card for today keeps its "Train anyway" button', btns[0].some(b => /Train anyway/.test(b.t) && b.d !== 'none'));
    check('the rest card for tomorrow has NO dead button (hidden)', btns[1].every(b => b.d === 'none'), JSON.stringify(btns[1]));
    await e.p.screenshot({ path: path.join(ROOT, '.scratch', 'train-tab-norest.png') });
    await e.ctx.close();
  }

  // ── no zoom: REAL pinch + double tap in Chromium ──
  {
    const cb = await chromium.launch();
    const cx = await cb.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const cp = await cx.newPage();
    const cm = [];
    await cp.exposeFunction('__post', (d) => { try { cm.push(JSON.parse(d)); } catch {} });
    await cp.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
    await cp.addInitScript(SCRIPTS);
    await cp.goto(URL_, { waitUntil: 'commit' });
    const t0 = Date.now(); let pushed = false;
    while (!cm.some(m => m.type === 'ready') && Date.now() - t0 < 25000) { if (!pushed && cm.some(m => m.type === 'needData')) { pushed = true; await cp.evaluate(athltSetDataJs({ ...data, insets: INS })); } await cp.waitForTimeout(60); }
    const cdp = await cx.newCDPSession(cp);
    const pts = (d) => [{ x: 201 - d, y: 400, id: 1 }, { x: 201 + d, y: 400, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(30) });
    for (let d = 30; d <= 150; d += 10) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d) }); await new Promise(r => setTimeout(r, 16)); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cp.waitForTimeout(400);
    const sc = await cp.evaluate(() => window.visualViewport.scale);
    check('a real two-finger pinch does not zoom the Train tab', sc <= 1.001, 'scale ' + sc.toFixed(3));
    const meta = await cp.evaluate(() => document.querySelector('meta[name=viewport]').content);
    check('viewport meta blocks zoom', /maximum-scale=1/.test(meta) && /user-scalable=no/.test(meta), meta);
    await cb.close();
  }
  await wk.close();

  // ── side by side ──
  {
    const b = await webkit.launch();
    const pg = await (await b.newContext({ viewport: { width: 860, height: 900 }, deviceScaleFactor: 1 })).newPage();
    const img = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, '.scratch', f)).toString('base64');
    await pg.setContent(`<body style="margin:0;background:#ccc;display:flex;gap:20px;padding:16px;font:13px sans-serif">
      <div><div>traintab.html as designed (390x844)</div><img src="${img('train-file.png')}" style="width:390px"></div>
      <div><div>the Train tab (390x844, same data shapes, no insets)</div><img src="${img('train-tab-390.png')}" style="width:390px"></div></body>`);
    await pg.waitForTimeout(300);
    await pg.screenshot({ path: path.join(ROOT, '.scratch', 'train-compare.png') });
    await b.close();
  }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
