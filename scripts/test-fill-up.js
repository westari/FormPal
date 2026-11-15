#!/usr/bin/env node
/**
 * scripts/test-fill-up.js
 *
 * Today's progress (assets/app screens/muscleranks.html + the shipped injection), 2026-11-15:
 *   - small rows in %, each saying what it is progress toward ("Shoulders +1.4% to Gold"); the reps rows are gone
 *   - NO overall % and no "average of all muscles" text; the overall only shows when it ranks up ("Overall: Bronze -> Silver!")
 *   - it FILLS UP live (the % counts up, rows appear one after another, muscles light up), about 1.5 s, a tap skips
 *   - the body: trained muscles bright, untrained grey
 *   - NO white wash any more (DoneScreen replaced it); the back button is the normal Liquid Glass one
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const sessionLog = require('../lib/sessionLog.ts');
const MTM = require('../components/MuscleTierMap.tsx');
const data = require('../lib/muscleRanksData.ts');
const inject = require('../lib/muscleRanksInject.ts');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');

const DAY = 24 * 60 * 60 * 1000, NOW = Date.now();
const entry = (id, reps, good, daysAgo) => ({ ts: NOW - daysAgo * DAY, exerciseId: id, displayName: id, reps, goodReps: good, pct: Math.round(100 * good / reps), formChecked: true });
function iconFor(m) {
  const f = path.join(ROOT, 'assets', 'images', 'muscle-icons', `${m}-bronze.png`);
  return ['shoulders', 'triceps', 'quads', 'glutes', 'biceps', 'chest', 'hamstrings', 'abs', 'lats'].includes(m) && fs.existsSync(f) ? 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') : null;
}
const emblem = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'assets', 'ranks', 'bronze.png')).toString('base64');
function build(prior, today) {
  const thisWorkout = today.map((e) => ({ ...e, ts: NOW }));
  const all = [...prior, ...thisWorkout];
  const tiersBefore = sessionLog.computeMuscleTiers(prior), tiersAfter = sessionLog.computeMuscleTiers(all);
  const standingBefore = MTM.computeOverallStanding(tiersBefore), standingAfter = MTM.computeOverallStanding(tiersAfter);
  return data.buildMuscleRanksPayload({ entries: thisWorkout, tiersBefore, tiersAfter, standingBefore, standingAfter, labels: MTM.MUSCLE_LABELS, note: 'Solid session.', iconFor, emblem, history: all, muscleCount: MTM.MUSCLE_DISPLAY_ORDER.length });
}
const P = build([entry('squat', 60, 55, 10)], [entry('shoulderPress', 30, 28, 0), entry('curl', 20, 18, 0)]);

console.log('--- 1. the payload ---');
console.log('  rows: ' + P.hits.map((h) => h.gain).join(' | '));
check('every row is "+1.4% to Gold": a % and what it is progress toward (small rows in %, NOT reps)', P.hits.length >= 3 && P.hits.every((h) => /^\+\d+\.\d% to [A-Z][a-z]+$/.test(h.gain) && h.gainNum > 0 && h.nextLabel));
check('the Shoulders row is +18.7% to Silver (28 good reps of the 150-rep bar: the math is the same as before)', P.hits.find((h) => h.name === 'Shoulders').gain === '+18.7% to Silver');
check('before today the squat muscles are lit and today\'s are not; after today both are lit and the rest stay grey', ['quads', 'glutes'].every((m) => P.lit.before.includes(m)) && !P.lit.before.includes('shoulders') && ['quads', 'shoulders', 'biceps'].every((m) => P.lit.after.includes(m)) && !P.lit.after.includes('chest'));
{
  const svg = decodeURIComponent(P.bodyMap.replace('data:image/svg+xml;utf8,', ''));
  check('the body: untrained muscles are the grey fill (#E3E4EA), trained ones a colour, every lit fragment is marked (data-m)', svg.includes('#E3E4EA') && /fill="#(?!E3E4EA|F1F2F6)[0-9a-fA-F]{6}" data-m="quads"/.test(svg));
}

(async () => {
  console.log('\n--- 2. the real page ---');
  const file = path.join(ROOT, 'assets', 'app screens', 'muscleranks.html');
  const browser = await chromium.launch();
  const open = async (payload) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 852 }, deviceScaleFactor: 2 });
    const msgs = []; let readyAt = null; const t0 = Date.now();
    await page.exposeFunction('__post', (d) => { let m; try { m = JSON.parse(d); } catch { return; } if (m.type === 'pageConsole') return; msgs.push(m.type); if (m.type === 'ready' && readyAt === null) readyAt = Date.now() - t0; });
    await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
    await page.addInitScript(inject.muscleRanksBeforeJs(payload));
    await page.goto(pathToFileURL(file).href, { waitUntil: 'commit' });
    const deadline = Date.now() + 9000;
    while (readyAt === null && Date.now() < deadline) await page.waitForTimeout(25);
    return { page, msgs, ready: readyAt !== null };
  };
  const state = (page) => page.evaluate(() => {
    const root = document.getElementById('dc-root');
    const chips = [...root.querySelectorAll('div')].filter((d) => d.style.position === 'absolute' && (d.style.top === '284px' || d.hasAttribute('data-mr-chip')));
    const rows = chips.map((c) => ({ txt: c.children[2].textContent, op: c.style.opacity }));
    const img = root.querySelector('img[alt="Muscles worked this session"]');
    return { rows, imgSrc: img && img.getAttribute('src'), text: root.innerText.replace(/\s+/g, ' '), fill: window.__mrFillState && window.__mrFillState() };
  });

  {
    const { page, ready } = await open(P);
    check('NOT armed: ready, and the final numbers at once', ready);
    const s = await state(page);
    check('NOT armed: every row reads its final "+x.x% to <rank>" and the final body picture shows', s.rows.every((r, i) => r.txt === P.hits[i].gain) && s.imgSrc === P.bodyMap, JSON.stringify(s.rows.map((r) => r.txt)));
    check('NO overall % and no "average of all muscles" text on the page', !/average of all|Overall rank|% today|Overall \+/.test(s.text) && !s.text.includes(P.rank.pctLabel), s.text.slice(0, 200));
    check('the summary card Ari likes is still there (the note and Done)', /Solid session/.test(s.text) && /Done/.test(s.text) && /Today's progress/.test(s.text));
    await page.screenshot({ path: path.join(ROOT, '.scratch', 'progress-final.png') });
    await page.close();
  }
  {
    // an overall RANK-UP is the one time the overall shows, as a big moment
    const up = JSON.parse(JSON.stringify(P));
    up.rank.rankedUp = true; up.rank.prevLabel = 'Bronze'; up.rank.label = 'Silver'; up.rank.next = 'Gold';
    const { page, ready } = await open(up);
    const s = await state(page);
    check('RANK-UP: the page shows "Overall: Bronze → Silver!" as a big moment', ready && s.text.includes('Overall: Bronze → Silver!'), s.text.slice(0, 260));
    const big = await page.evaluate(() => { const e = document.querySelector('[data-mr-big]'); const r = e && e.getBoundingClientRect(); return r && r.width; });
    check('RANK-UP: with the rank emblem made big (64px), and still no % and no "average" text', Math.abs(big - 64) < 2 && !/average of all|% today/.test(s.text), String(big));
    await page.screenshot({ path: path.join(ROOT, '.scratch', 'progress-rankup.png') });
    await page.close();
  }
  {
    const { page, msgs } = await open(P);
    await page.evaluate(() => window.__mrArm());
    await page.waitForTimeout(150);
    const pre = await state(page);
    check('ARMED: every row waits empty ("+0.0% to Silver"), hidden', pre.rows.every((r, i) => r.txt === `+0.0% to ${P.hits[i].nextLabel}` && parseFloat(r.op) === 0), JSON.stringify(pre.rows));
    const litOf = (src) => { const svg = decodeURIComponent(src.replace('data:image/svg+xml;utf8,', '')); const out = new Set(); for (const m of svg.matchAll(/<path [^>]*fill="(#[0-9a-fA-F]{6})"[^>]*data-m="([A-Za-z]+)"/g)) if (m[1] !== '#E3E4EA') out.add(m[2]); return out; };
    const litPre = litOf(pre.imgSrc);
    check('ARMED: only the muscles trained BEFORE today are lit (the squat ones)', P.lit.before.every((m) => litPre.has(m)) && !litPre.has('shoulders') && !litPre.has('biceps'), [...litPre].join());
    const t0 = Date.now();
    await page.evaluate(() => window.__mrPlay());
    const samples = []; const srcs = new Set();
    while (Date.now() - t0 < 2400) { const s = await state(page); samples.push({ t: Date.now() - t0, ...s }); srcs.add(s.imgSrc); if (s.fill && s.fill.played) break; await page.waitForTimeout(40); }
    const doneAt = (samples.find((x) => x.fill && x.fill.played) || {}).t;
    check('FILL: it finishes in about 1.5 seconds', doneAt !== undefined && doneAt >= 1200 && doneAt <= 1900, `${doneAt}ms`);
    const mid = samples.find((x) => x.t >= 500 && x.t <= 800);
    check('FILL: half way the % are BETWEEN 0.0 and the final value (counting up live)', !!mid && mid.rows.some((r, i) => { const n = parseFloat(r.txt.replace('+', '')); return n > 0 && n < P.hits[i].gainNum; }), mid && JSON.stringify(mid.rows.map((r) => r.txt)));
    const firstShown = P.hits.map((_, i) => { const x = samples.find((q) => parseFloat(q.rows[i].op) > 0); return x ? x.t : null; });
    check('FILL: the rows appear one AFTER another', firstShown.every((t, i) => t !== null && (i === 0 || t > firstShown[i - 1])), firstShown.join(','));
    check('FILL: muscles light up one after another on the body (' + srcs.size + ' pictures)', srcs.size >= 3);
    const fin = await state(page);
    check('END: exactly the final rows and picture', fin.rows.every((r, i) => r.txt === P.hits[i].gain && parseFloat(r.op) === 1) && fin.imgSrc === P.bodyMap);
    check('END: nothing was sent to the app but fillStart and ready', !msgs.includes('doneRanks') && msgs.includes('fillStart'), msgs.join());
    await page.screenshot({ path: path.join(ROOT, '.scratch', 'fill-end.png') });
    await page.close();
  }
  {
    const { page, msgs } = await open(P);
    await page.evaluate(() => window.__mrArm());
    await page.evaluate(() => window.__mrPlay());
    await page.waitForTimeout(350);
    const midS = await state(page);
    const done = await page.evaluate(() => { const all = [...document.querySelectorAll('#dc-root div')].filter((d) => d.children.length === 0 && (d.textContent || '').trim() === 'Done'); const r = all[0].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(done.x, done.y);
    await page.waitForTimeout(120);
    const after = await state(page);
    check('TAP: while it fills, one tap jumps to the end, and does NOT press Done', !!midS.fill.playing && after.fill.played && after.rows.every((r, i) => r.txt === P.hits[i].gain) && !msgs.includes('doneRanks'));
    await page.mouse.click(done.x, done.y); await page.waitForTimeout(80);
    check('after the fill, Done works again', msgs.includes('doneRanks'));
    await page.close();
  }
  {
    const { page } = await open(P);
    await page.evaluate(() => window.__mrArm());
    await page.waitForTimeout(4700);
    const s = await state(page);
    check('SAFETY: armed and never started -> it starts itself after 4.5 s', !!s.fill.playing || s.fill.played);
    await page.close();
  }
  await browser.close();

  console.log('\n--- 3. wiring ---');
  const w = read('components/WarmSurfaces.tsx');
  check('NO white wash any more (DoneScreen replaced it): no wash view, no LinearGradient sweep, no WASH constants', !/washOn|startWash|WASH_MS|WASH_PLAY_MS/.test(w));
  check('the page is armed (empty) when ready, and played by the screen when it shows: window.__mrArm / __mrPlay', /window\.__mrArm && window\.__mrArm\(\)/.test(w) && /__mrPlay/.test(read('app/recap.tsx')));
  check('Today back button is the normal Liquid Glass back button (LiquidGlassButton shows for ranks)', /(pageBroken || k === 'ranks')/.test(w));
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
