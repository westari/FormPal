#!/usr/bin/env node
/**
 * scripts/test-warm-surfaces.js
 *
 * The persistent warm WebViews (components/WarmSurfaces.tsx), simulated in
 * headless Chromium with 4x CPU throttle against the REAL design files:
 *
 *   1. the data-free scaffold (BASE_JS, exactly what the host injects at app
 *      start) loads and posts 'warm' on its own, and does NOT post 'ready'
 *      (nothing to show yet, so the host keeps it hidden)
 *   2. later, injecting just the session data (what a screen does when it
 *      opens) reaches 'ready' in a fraction of a cold load
 *   3. the page is in its FINAL layout at 'ready': nothing moves afterwards
 *   4. content is the real data (no design placeholders)
 *
 * Cold = a fresh WebView doing scaffold + data from scratch (what every screen
 * open used to cost). Chromium is not WKWebView: compare the two numbers, the
 * absolute values are not device numbers.
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const WARM = require('../components/WarmSurfaces.tsx');
const recap = require('../lib/recapInject.ts');
const rf = require('../lib/repFeedbackInject.ts');
const mr = require('../lib/muscleRanksInject.ts');
const mrData = require('../lib/muscleRanksData.ts');
const { athltSetDataJs } = require('../lib/dcLogicPatch.ts');
const sessionLog = require('../lib/sessionLog.ts');
const MTM = require('../components/MuscleTierMap.tsx');

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

// ── data for each surface ────────────────────────────────────────────────────
const DAY = 86400000, NOW = Date.now();
const e = (id, reps, good, ago) => ({ ts: NOW - ago * DAY, exerciseId: id, displayName: id, reps, goodReps: good, pct: 90, formChecked: true });
const prior = [e('shoulderPress', 40, 36, 10)], today = [e('shoulderPress', 30, 28, 0)];
const tiersBefore = sessionLog.computeMuscleTiers(prior), tiersAfter = sessionLog.computeMuscleTiers([...prior, ...today]);
const ranksPayload = mrData.buildMuscleRanksPayload({
  entries: today, tiersBefore, tiersAfter,
  standingBefore: MTM.computeOverallStanding(tiersBefore), standingAfter: MTM.computeOverallStanding(tiersAfter),
  labels: MTM.MUSCLE_LABELS, note: 'Solid session. You hit good form on 28 of 30 reps (93%).',
  iconFor: () => 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'assets', 'images', 'muscle-icons', 'shoulders-bronze.png')).toString('base64'),
  emblem: 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'assets', 'ranks', 'bronze.png')).toString('base64'),
});
const repsData = [
  { timeSec: 6, what: 'Test rep one. Fix one.' }, { timeSec: 11, what: 'Test rep two. Fix two.' },
];

const SURFACES = {
  recap: {
    file: 'workoutrecap.html',
    data: recap.recapDataJs({ totalReps: 20, moves: 2, pct: 88, hasFormData: true, durationSec: 600, overview: 'Real overview text here.', hasVideo: false }),
    cold: recap.workoutrecapInject({ totalReps: 20, moves: 2, pct: 88, hasFormData: true, durationSec: 600, overview: 'Real overview text here.', hasVideo: false }),
    real: (t) => /20\s*Reps/.test(t) && /88%/.test(t) && /Real overview text here/.test(t) && !/\b148\b|38:12/.test(t),
    card: '#dc-root div[style*="border-radius: 36px"]',
  },
  repfeedback: {
    file: 'repfeedback.html',
    data: rf.repFeedbackDataJs({ exerciseName: 'Shoulder Press', hasVideo: true, reps: repsData }),
    cold: rf.repFeedbackInject({ exerciseName: 'Shoulder Press', hasVideo: true, reps: repsData }),
    real: (t) => /Test rep one/.test(t),
    card: '#dc-root div[style*="border-radius: 36px"]',
  },
  ranks: {
    file: 'muscleranks.html',
    data: athltSetDataJs(ranksPayload),
    cold: mr.muscleRanksBeforeJs(ranksPayload),
    real: (t) => t.includes(ranksPayload.rank.label) && ranksPayload.hits.every(h => t.includes(h.name) && t.includes(h.gain)) && !/Quads|Glutes|\+6%|Bronze II/.test(t),
    card: '#dc-root img[alt="Muscles worked this session"]',
    // Its data (incl. decoding the body-map SVG) is injected while the user is
    // still on Workout Complete, i.e. long before the page is shown, so what
    // matters is that the work finishes in the background, hidden.
    background: true,
  },
};

async function open(file, initScripts) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 852 }, deviceScaleFactor: 2 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const ev = [];
  await page.exposeFunction('__post', (d) => { try { const m = JSON.parse(d); if (m.type !== 'pageConsole') ev.push({ type: m.type, at: Date.now() }); } catch {} });
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  for (const s of initScripts) await page.addInitScript(s);
  const t0 = Date.now();
  await page.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', file)).href, { waitUntil: 'commit' });
  return { browser, page, ev, t0 };
}
const waitFor = async (ev, type, ms) => { const d = Date.now() + ms; while (Date.now() < d && !ev.some(x => x.type === type)) await new Promise(r => setTimeout(r, 15)); return ev.find(x => x.type === type); };
const snap = (page, card) => page.evaluate((sel) => {
  const root = document.getElementById('dc-root');
  const rects = [];
  root.querySelectorAll('div,span,img,svg').forEach((el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    rects.push([el.tagName, el.children.length ? '' : (el.textContent || '').trim().slice(0, 24), Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), cs.opacity, cs.visibility]);
  });
  return { text: root.innerText.replace(/\s+/g, ' '), rects, transform: root.style.transform, hasCard: !!document.querySelector(sel) };
}, card);

// ── host state machine (the real store + API from WarmSurfaces.tsx) ──────────
{
  const { useWarm, warmWant, warmPrepare, warmActivate, warmDeactivate, warmRelease } = WARM;
  const st = () => useWarm.getState();
  check('state: recap surface is wanted from app start (loads before any workout)', st().want.recap === true);
  check('state: rep feedback / muscle page are not loaded until a recap needs them', !st().want.repfeedback && !st().want.ranks);
  warmWant('ranks', true);
  warmPrepare('ranks', 'DATA_A');
  check('state: prepare stores the data without activating', st().dataJs.ranks === 'DATA_A' && !st().active.ranks);
  warmActivate('ranks', { onMessage: () => {} });
  check('state: activate marks it active', st().active.ranks === true);
  warmDeactivate('ranks');
  check('state: deactivate hides but keeps data + epoch (page keeps its state)', !st().active.ranks && st().dataJs.ranks === 'DATA_A' && st().epoch.ranks === 0);
  warmRelease('ranks');
  check('state: release drops data and bumps epoch so a fresh page re-warms', st().dataJs.ranks === null && st().epoch.ranks === 1 && !st().warm.ranks && !st().revealed.ranks);
  warmPrepare('ranks', 'DATA_B');
  check('state: a released surface accepts new data', st().dataJs.ranks === 'DATA_B');
}

(async () => {
  for (const [kind, S] of Object.entries(SURFACES)) {
    console.log(`--- ${kind} ---`);
    // cold: what a screen used to pay on every open
    const c = await open(S.file, [S.cold]);
    const coldReady = await waitFor(c.ev, 'ready', 9000);
    const coldMs = coldReady ? coldReady.at - c.t0 : null;
    await c.browser.close();

    // warm: scaffold at "app start", data injected later when a screen opens
    const w = await open(S.file, [WARM.BASE_JS[kind]]);
    const warm = await waitFor(w.ev, 'warm', 9000);
    check(`${kind}: scaffold alone posts 'warm'`, !!warm, warm ? `${warm.at - w.t0}ms after load` : '');
    await w.page.waitForTimeout(900); // user is mid-workout; the page sits ready
    check(`${kind}: scaffold alone does NOT post 'ready' (stays hidden until it has data)`, !w.ev.some(x => x.type === 'ready'));
    const tOpen = Date.now();
    await w.page.evaluate(S.data); // what warmInject / the host does when the screen opens
    const ready = await waitFor(w.ev, 'ready', 5000);
    const openMs = ready ? ready.at - tOpen : null;
    console.log(`      cold open: ${coldMs}ms   warm open: ${openMs}ms   (CPU x4)`);
    check(`${kind}: warm open reaches 'ready'`, !!ready);
    if (S.background) {
      check(`${kind}: data applies in the background, hidden, in under 1s (injected as soon as the recap data exists)`, openMs !== null && openMs < 1000, `${openMs}ms`);
    } else {
      check(`${kind}: warm open is under 150ms`, openMs !== null && openMs < 150, `${openMs}ms`);
      check(`${kind}: warm open is at least 3x faster than a cold load`, openMs !== null && coldMs !== null && openMs * 3 <= coldMs, `${openMs}ms vs ${coldMs}ms`);
    }
    const atReady = await snap(w.page, S.card);
    await w.page.waitForTimeout(2200);
    const later = await snap(w.page, S.card);
    check(`${kind}: real data on screen at reveal`, S.real(atReady.text), atReady.text.slice(0, 90));
    check(`${kind}: final layout at reveal (nothing moves for 2.2s after)`,
      JSON.stringify(atReady.rects) === JSON.stringify(later.rects) && atReady.transform === later.transform);
    await w.page.screenshot({ path: path.join(ROOT, '.scratch', `warm-${kind}.png`) });
    await w.browser.close();
  }
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
