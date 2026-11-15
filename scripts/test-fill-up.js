#!/usr/bin/env node
/**
 * scripts/test-fill-up.js
 *
 * Ari 2026-11-13: after Finish, a white wash sweeps up the screen and Today's progress FILLS UP live (reps count up, bars slide forward, muscles
 * light up one after another), about 2 seconds in all, a tap skips to the end. Plus the clearer rank rows ("Shoulders +7 reps · 113 to Gold" with a
 * bar), the Overall section, and the body (trained muscles bright, untrained grey).
 *
 *   Part 1 (node): the payload the page reads: reps, to-next, bars, which muscles are lit before / after
 *   Part 2 (Playwright, the REAL muscleranks.html + the shipped injection): the armed (empty) state, the fill, the skip tap, the final state
 *   Part 3 (static): the white wash and the haptics are wired
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

const DAY = 24 * 60 * 60 * 1000, NOW = Date.now();
const entry = (id, reps, good, daysAgo) => ({ ts: NOW - daysAgo * DAY, exerciseId: id, displayName: id, reps, goodReps: good, pct: Math.round(100 * good / reps), formChecked: true });
function iconFor(m) {
  const f = path.join(ROOT, 'assets', 'images', 'muscle-icons', `${m === 'shoulders' ? 'shoulders' : m}-bronze.png`);
  return ['shoulders', 'triceps', 'quads', 'glutes', 'biceps', 'chest', 'hamstrings', 'abs', 'lats'].includes(m) && fs.existsSync(f) ? 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') : null;
}
const emblem = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'assets', 'ranks', 'bronze.png')).toString('base64');
function build(prior, today) {
  const thisWorkout = today.map((e) => ({ ...e, ts: NOW }));
  const all = [...prior, ...thisWorkout];
  const tiersBefore = sessionLog.computeMuscleTiers(prior), tiersAfter = sessionLog.computeMuscleTiers(all);
  const standingBefore = MTM.computeOverallStanding(tiersBefore), standingAfter = MTM.computeOverallStanding(tiersAfter);
  const payload = data.buildMuscleRanksPayload({ entries: thisWorkout, tiersBefore, tiersAfter, standingBefore, standingAfter, labels: MTM.MUSCLE_LABELS, note: 'Solid session.', iconFor, emblem, history: all, muscleCount: MTM.MUSCLE_DISPLAY_ORDER.length });
  return { payload, tiersBefore, tiersAfter };
}
// squat 60 reps before (quads + glutes + hamstrings already trained), shoulder press + curl today
const SC = build([entry('squat', 60, 55, 10)], [entry('shoulderPress', 30, 28, 0), entry('curl', 20, 18, 0)]);
const P = SC.payload;

// ── Part 1 ──
console.log('--- 1. the payload ---');
console.log('  rows: ' + P.hits.map((h) => `${h.name} ${h.gain} bar ${h.barFrom}->${h.barTo}`).join(' | '));
check('every row is "+N reps · M to Silver" with the numbers to animate (reps, to-next, bar from / to)', P.hits.length >= 3 && P.hits.every((h) => /^\+\d+ reps? · \d+ to [A-Z][a-z]+$/.test(h.gain) && h.reps > 0 && h.toNext >= 0 && h.barTo >= h.barFrom && h.nextLabel));
check('the reps are the muscle credit of the GOOD reps (28 good shoulder-press reps = +28 reps for Shoulders)', P.hits.find((h) => h.name === 'Shoulders').reps === 28);
check('"M to Silver" is the 150-rep bar minus the muscle volume after today (Shoulders 150 - 28 = 122... less any earlier reps)', P.hits.find((h) => h.name === 'Shoulders').toNext === 150 - 28);
check('the overall section has what the page needs (count of muscles, before / after / gained as numbers)', P.rank.count === 11 && typeof P.rank.pctNum === 'number' && typeof P.rank.beforePctNum === 'number' && P.rank.gainedNum >= 0);
check('before today: the muscles of the squat are lit; the muscles trained today are not', ['quads', 'glutes'].every((m) => P.lit.before.includes(m)) && !P.lit.before.includes('shoulders') && !P.lit.before.includes('biceps'), P.lit.before.join());
check('after today: the squat muscles AND today\'s muscles are lit; the rest stay grey', ['quads', 'glutes', 'shoulders', 'biceps'].every((m) => P.lit.after.includes(m)) && !P.lit.after.includes('chest') && !P.lit.after.includes('abs'), P.lit.after.join());
{
  const svg = decodeURIComponent(P.bodyMap.replace('data:image/svg+xml;utf8,', ''));
  const tags = [...svg.matchAll(/<path [^>]*data-m="([A-Za-z]+)"[^>]*fill="(#[0-9a-fA-F]{6})"|<path [^>]*fill="(#[0-9a-fA-F]{6})"[^>]*data-m="([A-Za-z]+)"/g)];
  check('the body image marks every lit fragment with its muscle (data-m) so the page can light them one by one', (svg.match(/data-m="/g) || []).length >= 8);
  check('the body: untrained muscles are the grey fill (#E3E4EA), trained ones are a colour', svg.includes('#E3E4EA') && /fill="#(?!E3E4EA|F1F2F6)[0-9a-fA-F]{6}" data-m="quads"/.test(svg));
  void tags;
}

// ── Part 2 ──
(async () => {
  console.log('\n--- 2. the real page (muscleranks.html + the shipped injection) ---');
  const file = path.join(ROOT, 'assets', 'app screens', 'muscleranks.html');
  const browser = await chromium.launch();
  const open = async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 852 }, deviceScaleFactor: 2 });
    const msgs = []; let readyAt = null; const t0 = Date.now();
    await page.exposeFunction('__post', (d) => { let m; try { m = JSON.parse(d); } catch { return; } if (m.type === 'pageConsole') return; msgs.push(m.type); if (m.type === 'ready' && readyAt === null) readyAt = Date.now() - t0; });
    await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
    await page.addInitScript(inject.muscleRanksBeforeJs(P));
    await page.goto(pathToFileURL(file).href, { waitUntil: 'commit' });
    const deadline = Date.now() + 9000;
    while (readyAt === null && Date.now() < deadline) await page.waitForTimeout(25);
    return { page, msgs, ready: readyAt !== null };
  };
  const state = (page) => page.evaluate(() => {
    const root = document.getElementById('dc-root');
    const rows = [...root.querySelectorAll('[data-mr-chip]')].map((c) => ({ txt: (c.querySelector('[data-mr-gain]') || {}).textContent, bar: c.querySelector('[data-mr-fill]').style.width, op: c.style.opacity }));
    const img = root.querySelector('img[alt="Muscles worked this session"]');
    const gd = root.querySelector('[data-mr-overall]');
    let oBar = null; root.querySelectorAll('div').forEach((d) => { if (d.style.height === '6px' && d.style.borderRadius === '999px' && d.firstElementChild) oBar = d.firstElementChild.style.width; });
    const text = root.innerText.replace(/\s+/g, ' ');
    return { rows, imgSrc: img && img.getAttribute('src'), gained: gd && gd.textContent, oBar, head: (text.match(/(\d+\.\d)%/) || [])[1], fill: window.__mrFillState && window.__mrFillState() };
  });

  // (a) never armed: the final numbers at once (any other entry into the page is unchanged)
  {
    const { page, ready } = await open();
    check('NOT armed: the page posts ready and shows the final numbers at once', ready);
    const s = await state(page);
    check('NOT armed: rows read the final "+28 reps · 122 to Silver", bars full, body image is the final one', s.rows.every((r, i) => r.txt === P.hits[i].gain && parseFloat(r.bar) === P.hits[i].barTo) && s.imgSrc === P.bodyMap, JSON.stringify(s.rows.map((r) => r.txt)));
    await page.close();
  }
  // (b) armed -> empty -> play -> final, timed
  {
    const { page, msgs } = await open();
    await page.evaluate(() => window.__mrArm());
    await page.waitForTimeout(150);
    const pre = await state(page);
    check('ARMED: every row waits empty ("+0 reps", all the reps still to go), hidden, bar at where it was', pre.rows.every((r, i) => r.txt === `+0 reps · ${P.hits[i].toNext + P.hits[i].reps} to ${P.hits[i].nextLabel}` && parseFloat(r.op) === 0 && parseFloat(r.bar) === P.hits[i].barFrom), JSON.stringify(pre.rows.map((r) => r.txt + '|' + r.op + '|' + r.bar)));
    check('ARMED: the header number and "+X% today" and the overall bar sit at the BEFORE value', parseFloat(pre.head) === P.rank.beforePctNum && parseFloat(pre.gained) === 0 && Math.abs(parseFloat(pre.oBar) - P.rank.beforePctNum) < 0.1, `${pre.head} ${pre.gained} ${pre.oBar}`);
    check('ARMED: only the muscles trained BEFORE today are lit (the squat ones); today\'s are grey', pre.imgSrc && pre.imgSrc !== P.bodyMap && decodeURIComponent(pre.imgSrc).includes('data-m="quads"'));
    const litOf = (src) => { const svg = decodeURIComponent(src.replace('data:image/svg+xml;utf8,', '')); const out = new Set(); for (const m of svg.matchAll(/<path [^>]*fill="(#[0-9a-fA-F]{6})"[^>]*data-m="([A-Za-z]+)"/g)) if (m[1] !== '#E3E4EA') out.add(m[2]); for (const m of svg.matchAll(/<path [^>]*data-m="([A-Za-z]+)"[^>]*fill="(#[0-9a-fA-F]{6})"/g)) if (m[2] !== '#E3E4EA') out.add(m[1]); return out; };
    const litPre = litOf(pre.imgSrc);
    check('ARMED: the lit set in the picture is exactly the "before" set', [...P.lit.before].every((m) => litPre.has(m)) && !litPre.has('shoulders') && !litPre.has('biceps'), [...litPre].join());

    const t0 = Date.now();
    await page.evaluate(() => window.__mrPlay());
    const samples = []; const srcs = new Set();
    while (Date.now() - t0 < 2400) {
      const s = await state(page);
      samples.push({ t: Date.now() - t0, ...s }); srcs.add(s.imgSrc);
      if (s.fill && s.fill.played) break;
      await page.waitForTimeout(40);
    }
    const doneAt = (samples.find((x) => x.fill && x.fill.played) || {}).t;
    check('FILL: it finishes in about 1.5 seconds (wash + fill is about 2 s)', doneAt !== undefined && doneAt >= 1200 && doneAt <= 1900, `${doneAt}ms`);
    const mid = samples.find((x) => x.t >= 500 && x.t <= 800);
    check('FILL: half way the numbers are BETWEEN empty and final (reps counting up, bars sliding, header number rising)', !!mid && mid.rows.some((r) => { const n = parseInt(r.txt.replace('+', '')); return n > 0 && n < P.hits[mid.rows.indexOf(r)].reps; }) && mid.rows.some((r, i) => parseFloat(r.bar) > P.hits[i].barFrom && parseFloat(r.bar) < P.hits[i].barTo) && parseFloat(mid.head) > P.rank.beforePctNum && parseFloat(mid.head) < P.rank.pctNum, mid && JSON.stringify(mid.rows.map((r) => r.txt)) + ' head ' + mid.head);
    const firstShown = P.hits.map((_, i) => { const x = samples.find((q) => parseFloat(q.rows[i].op) > 0); return x ? x.t : null; });
    check('FILL: the rows appear one AFTER another (each later than the one before)', firstShown.every((t, i) => t !== null && (i === 0 || t > firstShown[i - 1])), firstShown.join(','));
    const newlyLit = P.lit.after.filter((m) => !P.lit.before.includes(m)).length;
    check('FILL: muscles light up one after another on the body (a new picture for each new muscle: ' + srcs.size + ' pictures seen for ' + newlyLit + ' new muscles)', srcs.size >= 1 + P.hits.filter((h) => !P.lit.before.includes(h.muscle)).length - 1);
    const fin = await state(page);
    check('END: the numbers are exactly the final ones (rows, bars, header number, "+X% today", overall bar) and the picture is the final one', fin.rows.every((r, i) => r.txt === P.hits[i].gain && parseFloat(r.bar) === P.hits[i].barTo && parseFloat(r.op) === 1) && fin.imgSrc === P.bodyMap && parseFloat(fin.head) === P.rank.pctNum && parseFloat(fin.gained) === P.rank.gainedNum && Math.abs(parseFloat(fin.oBar) - P.rank.pctNum) < 0.1, JSON.stringify(fin).slice(0, 300));
    check('END: nothing was sent to the app but "fillStart" and the usual ready (no stray taps)', !msgs.includes('doneRanks') && msgs.includes('fillStart'), msgs.join());
    await page.screenshot({ path: path.join(ROOT, '.scratch', 'fill-end.png') });
    await page.close();
  }
  // (c) a tap skips to the end and does not press Done
  {
    const { page, msgs } = await open();
    await page.evaluate(() => window.__mrArm());
    await page.evaluate(() => window.__mrPlay());
    await page.waitForTimeout(350);
    const midS = await state(page);
    await page.screenshot({ path: path.join(ROOT, '.scratch', 'fill-mid.png') });
    // tap right on the Done button
    const done = await page.evaluate(() => { const all = [...document.querySelectorAll('#dc-root div')].filter((d) => d.children.length === 0 && (d.textContent || '').trim() === 'Done'); const r = all[0].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(done.x, done.y);
    await page.waitForTimeout(120);
    const after = await state(page);
    check('TAP: while it fills, one tap jumps straight to the end', !!midS.fill.playing && after.fill.played && after.rows.every((r, i) => r.txt === P.hits[i].gain) && after.imgSrc === P.bodyMap, JSON.stringify(after.fill));
    check('TAP: that tap (even on Done) does only the skip: Done is NOT pressed', !msgs.includes('doneRanks'));
    await page.mouse.click(done.x, done.y);
    await page.waitForTimeout(80);
    check('after the fill, Done works again', msgs.includes('doneRanks'));
    await page.close();
  }
  // (d) armed but the app never starts it: it fills by itself (never stays empty)
  {
    const { page } = await open();
    await page.evaluate(() => window.__mrArm());
    await page.waitForTimeout(4700);
    const s = await state(page);
    check('SAFETY: armed and never started -> it starts itself after 4.5 s (never stays empty)', !!s.fill.playing || s.fill.played, JSON.stringify(s.fill));
    await page.close();
  }
  await browser.close();

  // ── Part 3 ──
  console.log('\n--- 3. the wash and the haptics ---');
  const w = fs.readFileSync(path.join(ROOT, 'components', 'WarmSurfaces.tsx'), 'utf8').split('\r\n').join('\n');
  check('the white wash is a gradient panel that rises from below the screen to above it', /k === 'ranks' && washOn/.test(w) && /outputRange: \[screenH, -screenH \* 1\.5\]/.test(w) && /LinearGradient/.test(w) && /'rgba\(255,255,255,0\)'/.test(w));
  check('the page is armed (empty) when it is ready, and played when the wash covers the screen (about 380 ms in)', /if \(k === 'ranks'\) ref\.current\?\.injectJavaScript\('window\.__mrArm && window\.__mrArm\(\); true;'\)/.test(w) && /WASH_PLAY_MS = 380/.test(w) && /__mrPlay/.test(w));
  check('wash + fill is about 2 seconds (wash 700 ms, fill 1.5 s starting at 380 ms)', /WASH_MS = 700/.test(w) && inject.MUSCLE_RANKS_DOM_JS.includes('total: 1500'));
  check('the wash starts the moment the Today\'s progress page is shown (Finish review and every other way in)', /if \(k === 'ranks'\) startWash\(\);/.test(w));
  const rf = fs.readFileSync(path.join(ROOT, 'app', 'rep-feedback.tsx'), 'utf8').split('\r\n').join('\n');
  const H = fs.readFileSync(path.join(ROOT, 'lib', 'haptics.ts'), 'utf8').split('\r\n').join('\n');
  check('the Finish button: hapticFinish() = impact Heavy + notification Success (the one exception to the soft haptics)', /export function hapticFinish\(\)/.test(H) && /ImpactFeedbackStyle\.Heavy/.test(H.split('export function hapticFinish')[1]) && /NotificationFeedbackType\.Success/.test(H.split('export function hapticFinish')[1]) && /hapticFinish\(\); \/\/ the one strong haptic/.test(rf));
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
