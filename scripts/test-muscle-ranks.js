#!/usr/bin/env node
/**
 * scripts/test-muscle-ranks.js
 *
 * After-workout muscle page (assets/app screens/muscleranks.html).
 *
 * Part 1 (node, REAL app code): sessions -> lib/sessionLog + components/
 *   MuscleTierMap standing -> lib/muscleRanksData payload. Proves the rank,
 *   the per-muscle +%, the muscle rows and the body-map highlight come from the
 *   real data and differ per workout (no fixed "Shoulders, Triceps").
 * Part 2 (Playwright, REAL design file + the shipped injection from
 *   lib/muscleRanksInject): loads the page with the payload, waits for the
 *   'ready' the app waits for, and checks the live DOM: real rank/%/gain text,
 *   no placeholder text, real body map, and that NOTHING moves after reveal.
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
const paths = require('../components/muscleMapPaths.generated.ts');
const { TIER_META } = require('../constants/tierPalette.ts');
const { EXERCISE_CATALOG, Muscle } = require('../constants/exercises.ts');

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const entry = (id, reps, good, daysAgo, ts) => ({
  ts: ts ?? NOW - daysAgo * DAY, exerciseId: id, displayName: id, reps, goodReps: good, pct: Math.round(100 * good / reps), formChecked: true,
});

const ICON_FILE = { shoulders: 'shoulders', triceps: 'triceps', quads: 'quads', glutes: 'glutes', biceps: 'biceps', chest: 'chest', hamstrings: 'hamstrings', abs: 'abs', lats: 'lats' };
function iconFor(m) {
  const slug = ICON_FILE[m];
  if (!slug) return null;
  const f = path.join(ROOT, 'assets', 'images', 'muscle-icons', `${slug}-bronze.png`);
  return fs.existsSync(f) ? 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') : null;
}
function emblemFor(tier) {
  const f = path.join(ROOT, 'assets', 'ranks', `${tier ?? 'bronze'}.png`);
  return 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
}

function build(prior, today) {
  const ts = NOW;
  const thisWorkout = today.map(e => ({ ...e, ts }));
  const all = [...prior, ...thisWorkout];
  const tiersBefore = sessionLog.computeMuscleTiers(prior);
  const tiersAfter = sessionLog.computeMuscleTiers(all);
  const standingBefore = MTM.computeOverallStanding(tiersBefore);
  const standingAfter = MTM.computeOverallStanding(tiersAfter);
  const payload = data.buildMuscleRanksPayload({
    entries: thisWorkout, tiersBefore, tiersAfter, standingBefore, standingAfter,
    labels: MTM.MUSCLE_LABELS, note: 'Solid session. You hit good form on 28 of 30 reps (93%).',
    iconFor, emblem: emblemFor(standingAfter && standingAfter.tier),
  });
  return { payload, standingBefore, standingAfter, tiersBefore, tiersAfter };
}

const oneMuscle = EXERCISE_CATALOG.find(e => e.muscles.length === 1);

const SCENARIOS = {
  'shoulders+triceps (bronze)': build(
    [entry('shoulderPress', 40, 36, 10)],
    [entry('shoulderPress', 30, 28, 0)]),
  'legs (squat+lunge)': build(
    [entry('squat', 60, 55, 12), entry('shoulderPress', 90, 80, 20)],
    [entry('squat', 30, 27, 0), entry('lunge', 24, 20, 0)]),
  'silver user': build(
    [entry('shoulderPress', 400, 396, 20)],
    [entry('shoulderPress', 40, 40, 0)]),
  'brand new user, unranked': build([], [entry('curl', 6, 6, 0)]),
};
// worst-case widths: the two longest muscle labels side by side
{
  const sc = build([entry('romanianDeadlift', 60, 55, 10)], [entry('romanianDeadlift', 30, 27, 0)]);
  sc.payload.hits = [
    { name: 'Hamstrings', gain: '+30%', icon: iconFor('hamstrings') },
    { name: 'Rear Delts', gain: '+30%', icon: iconFor('shoulders') },
  ];
  SCENARIOS['longest labels (Hamstrings + Rear Delts)'] = sc;
}
if (oneMuscle) SCENARIOS[`single muscle (${oneMuscle.id})`] = build([entry(oneMuscle.id, 20, 18, 5)], [entry(oneMuscle.id, 25, 23, 0)]);

// ── Part 1: data ─────────────────────────────────────────────────────────────
console.log('--- data (real sessionLog + MuscleTierMap standing) ---');
for (const [name, sc] of Object.entries(SCENARIOS)) {
  const { payload: p, standingAfter } = sc;
  console.log(`  ${name}: rank=${p.rank.label}->${p.rank.next} ${p.rank.pct}% (+${p.rank.gained}% today)  rows=${p.hits.map(h => h.name + ' ' + h.gain).join(' | ') || '(none)'}`);
  check(`${name}: rank label is the real standing`, p.rank.label === (standingAfter ? standingAfter.tier[0].toUpperCase() + standingAfter.tier.slice(1) : 'Unranked'));
  check(`${name}: progress % is the real standing`, p.rank.pct === (standingAfter ? Math.round(standingAfter.progress * 100) : 0));
  check(`${name}: every row has a real muscle name + a +N% gain (no bare "+%")`, p.hits.every(h => h.name && /^\+\d+(\.\d)?%$/.test(h.gain)));
}
const A = SCENARIOS['shoulders+triceps (bronze)'].payload, B = SCENARIOS['legs (squat+lunge)'].payload;
check('rows follow the workout: shoulders workout -> Shoulders/Triceps', A.hits.map(h => h.name).sort().join() === 'Shoulders,Triceps', A.hits.map(h => h.name).join());
check('rows follow the workout: legs workout -> different muscles', !B.hits.some(h => /Shoulders|Triceps/.test(h.name)) && B.hits.length === 2, B.hits.map(h => h.name).join());
check('rows carry the real Flaticon art', A.hits.every(h => h.icon && h.icon.startsWith('data:image/png;base64,')));
{
  // gain really is after - before for that muscle
  const sc = SCENARIOS['shoulders+triceps (bronze)'];
  const exp = data.muscleGainPct(sc.tiersBefore.shoulders, sc.tiersAfter.shoulders);
  const shown = parseFloat(A.hits.find(h => h.name === 'Shoulders').gain.replace(/[+%]/g, ''));
  check('Shoulders +% equals (after - before) progress from the logs', Math.abs(shown - exp) <= 0.51, `shown ${shown} expected ${exp.toFixed(2)}`);
}
{
  // body map: only the worked muscles are coloured
  const idByD = {};
  for (const [id, d] of Object.entries({ ...paths.MUSCLE_MAP_FRONT_PATHS, ...paths.MUSCLE_MAP_BACK_PATHS })) idByD[d] = id;
  const svg = decodeURIComponent(A.bodyMap.replace('data:image/svg+xml;utf8,', ''));
  const colored = new Set();
  for (const m of svg.matchAll(/<path d="([^"]+)" fill="(#[0-9a-fA-F]{6})"/g)) {
    if (!['#E3E4EA', '#F1F2F6'].includes(m[2]) && idByD[m[1]]) colored.add(idByD[m[1]]);
  }
  const base = [...colored].map(id => id.replace(/-\d+$/, ''));
  const regionIds = (mu) => paths.MUSCLE_MAP_REGIONS[mu].ids;
  const expected = new Set([...regionIds('shoulders'), ...regionIds('triceps')]);
  check('body map colours the worked muscles (shoulders + triceps fragments)', [...expected].every(id => colored.has(id)), `${colored.size}/${expected.size}`);
  check('body map colours NOTHING else (quads/chest/etc stay neutral)', [...colored].every(id => expected.has(id)), [...new Set(base)].join());
  check('body map has a thin outline around both figures', (svg.match(/stroke="rgba\(40,44,60,0\.5\)" stroke-width="2\.4"/g) || []).length === 2);
  check('body map is front + back side by side', svg.includes('viewBox="78 -9 479 833"') && svg.includes('viewBox="641 -13 483 832"'));
}

// ── Part 2: the real page ────────────────────────────────────────────────────
(async () => {
  console.log('\n--- page (real muscleranks.html + shipped injection, CPU x4) ---');
  const file = path.join(ROOT, 'assets', 'app screens', 'muscleranks.html');
  const browser = await chromium.launch();
  for (const [name, sc] of Object.entries(SCENARIOS)) {
    const p = sc.payload;
    const page = await browser.newPage({ viewport: { width: 390, height: 852 }, deviceScaleFactor: 2 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    let t0 = 0, readyAt = null;
    const msgs = [];
    await page.exposeFunction('__post', (d) => {
      let m; try { m = JSON.parse(d); } catch { return; }
      if (m.type === 'pageConsole') return;
      msgs.push(m.type);
      if (m.type === 'ready' && readyAt === null) readyAt = Date.now() - t0;
    });
    await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
    await page.addInitScript(inject.muscleRanksBeforeJs(p));
    t0 = Date.now();
    await page.goto(pathToFileURL(file).href, { waitUntil: 'commit' });
    const deadline = Date.now() + 9000;
    while (readyAt === null && Date.now() < deadline) await page.waitForTimeout(25);
    check(`${name}: page posts ready`, readyAt !== null, `${readyAt}ms`);

    const snap = () => page.evaluate(() => {
      const root = document.getElementById('dc-root');
      const rects = [];
      root.querySelectorAll('div,span,img,svg').forEach((el) => {
        const r = el.getBoundingClientRect();
        const t = el.children.length === 0 ? (el.textContent || '').trim() : '';
        const cs = getComputedStyle(el);
        rects.push([el.tagName, t.slice(0, 30), Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), cs.opacity, cs.visibility, el.tagName === 'IMG' ? (el.src || '').length : 0]);
      });
      const img = root.querySelector('img[alt="Muscles worked this session"]');
      return { text: root.innerText, rects, imgSrc: img && img.getAttribute('src'), imgW: img && img.naturalWidth, imgVis: img && getComputedStyle(img).visibility, transform: root.style.transform };
    });
    const atReady = await snap();
    await page.waitForTimeout(2200);
    const later = await snap();

    const txt = atReady.text.replace(/\s+/g, ' ');
    check(`${name}: header shows real rank + %`, txt.includes(p.rank.label) && txt.includes(p.rank.pct + '%'), `${p.rank.label} ${p.rank.pct}%`);
    check(`${name}: "${p.rank.label} -> ${p.rank.next}" row + "+${p.rank.gained}% today"`, txt.includes(p.rank.next) && txt.includes(`+${p.rank.gained}% today`));
    check(`${name}: muscle rows = ${p.hits.map(h => h.name + ' ' + h.gain).join(', ') || 'none'}`,
      p.hits.every(h => txt.includes(h.name) && txt.includes(h.gain)));
    const placeholders = ['Bronze II', 'Bronze III', '+14% today', 'Quads', 'Glutes', '+6%', '+5%', '72%'];
    const bad = placeholders.filter(x => txt.includes(x) && !(p.hits.some(h => h.name === x || h.gain === x) || p.rank.label + p.rank.next + p.rank.pct + '%' === 'x'));
    // 'Quads'/'Glutes' etc may legitimately be a real row; anything else from the design's demo must be gone
    const realBad = bad.filter(x => !p.hits.some(h => h.name === x || h.gain === x) && x !== `+${p.rank.gained}% today` && x !== p.rank.pct + '%');
    check(`${name}: no design placeholder text left`, realBad.length === 0, realBad.join());
    const chipInfo = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('#dc-root div')].filter(d => d.style.position === 'absolute' && d.style.top === '284px');
      const card = chips[0] && chips[0].parentElement.getBoundingClientRect();
      return chips.map(c => {
        const r = c.getBoundingClientRect(); const ic = c.children[0]; const cs = getComputedStyle(ic);
        return { l: r.left, r: r.right, cardL: card.left, cardR: card.right, icon: cs.backgroundImage.slice(0, 12), iw: ic.getBoundingClientRect().width };
      });
    });
    check(`${name}: every row shows its Flaticon art`, p.hits.every((h, i) => !h.icon || (chipInfo[i] && chipInfo[i].icon.startsWith('url(')) ), JSON.stringify(chipInfo.map(c => c.icon)));
    check(`${name}: rows don't overlap each other or leave the card`, chipInfo.every((c, i) => c.l >= c.cardL - 1 && c.r <= c.cardR + 1 && (i === 0 || c.l >= chipInfo[i - 1].r)), chipInfo.map(c => Math.round(c.l) + '-' + Math.round(c.r)).join(' | '));
    check(`${name}: real body map image, decoded, visible`, atReady.imgSrc === p.bodyMap && atReady.imgW > 0 && atReady.imgVis === 'visible');
    check(`${name}: layout identical at reveal and 2.2s later (nothing shifts)`, JSON.stringify(atReady.rects) === JSON.stringify(later.rects) && atReady.transform === later.transform);
    await page.screenshot({ path: path.join(ROOT, '.scratch', `muscle-${name.replace(/[^a-z0-9]+/gi, '-')}.png`) });
    await page.close();
  }
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
