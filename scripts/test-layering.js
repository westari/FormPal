#!/usr/bin/env node
/**
 * scripts/test-layering.js
 *
 * "View rep feedback" showed the muscle page where the video should be.
 *
 * Cause: a warm layer was pulled on screen whenever a page ABOVE it was showing, even if it had never been
 * on screen (WarmSurfaces' coveredByHigher). The muscle-page layer is opaque, so when the rep-feedback page went
 * transparent over its video, the muscle page showed through instead of the video.
 *
 * Part 1: the rule itself (components/WarmSurfaces.tsx layerShouldShow), every case.
 * Part 2: the REAL pages stacked the way the host stacks them (recap, muscle page, rep feedback, all with their
 *   shipped scaffold + data) over a stand-in for the screen's native video. OLD rule = every layer under the open
 *   page shows -> the muscle page covers the video (REPRODUCED). NEW rule = only a layer that was already on
 *   screen stays -> the video is visible.
 * Screenshots: .scratch/layering-{old,new}.png
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { PNG } = require('pngjs');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const WARM = require('../components/WarmSurfaces.tsx');
const recap = require('../lib/recapInject.ts');
const rf = require('../lib/repFeedbackInject.ts');
const mr = require('../lib/muscleRanksData.ts');
const { athltSetDataJs } = require('../lib/dcLogicPatch.ts');
const sessionLog = require('../lib/sessionLog.ts');
const MTM = require('../components/MuscleTierMap.tsx');

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const U = (f) => pathToFileURL(path.join(ROOT, 'assets', 'app screens', f)).href;

// ── Part 1: the rule ─────────────────────────────────────────────────────────
const L = WARM.layerShouldShow;
check('a page that is showing is shown', L(true, false, false) && L(true, true, true));
check('a page that was on screen stays while another opens over it', L(false, true, true));
check('a page that was NEVER on screen is not pulled in by a page opening above it', !L(false, true, false));
check('nothing showing, nothing above: hidden', !L(false, false, false) && !L(false, false, true));

// ── Part 2: the stack ────────────────────────────────────────────────────────
const W = 390, H = 852;
const DAY = 86400000, NOW = Date.now();
const e = (id, reps, good, ago) => ({ ts: NOW - ago * DAY, exerciseId: id, displayName: id, reps, goodReps: good, pct: 90, formChecked: true });
const prior = [e('shoulderPress', 40, 36, 10)], today = [e('shoulderPress', 30, 28, 0)];
const tb = sessionLog.computeMuscleTiers(prior), ta = sessionLog.computeMuscleTiers([...prior, ...today]);
const ranksData = mr.buildMuscleRanksPayload({
  entries: today, tiersBefore: tb, tiersAfter: ta, standingBefore: MTM.computeOverallStanding(tb), standingAfter: MTM.computeOverallStanding(ta),
  labels: MTM.MUSCLE_LABELS, note: 'Solid session.', iconFor: () => null, emblem: null,
});
const VIDEO = '#12b886'; // stand-in for the native video behind the page

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const host = path.join(ROOT, '.scratch', 'layering-host.html');
  fs.mkdirSync(path.dirname(host), { recursive: true });
  const fr = (id, f) => `<iframe id="${id}" style="position:absolute;inset:0;border:0;width:${W}px;height:${H}px;background:transparent" src="${U(f)}"></iframe>`;
  fs.writeFileSync(host, `<body style="margin:0;position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${VIDEO}">
    <div id="video" style="position:absolute;inset:0;background:${VIDEO}"></div>
    ${fr('recap', 'workoutrecap.html')}${fr('ranks', 'muscleranks.html')}${fr('repfeedback', 'repfeedback.html')}</body>`);
  await page.goto(pathToFileURL(host).href);
  await page.waitForTimeout(2500);
  const frame = (n) => page.frames().find(f => f.url().includes(n));
  const prep = async (name, base, data, readyFn) => {
    const f = frame(name);
    await f.evaluate(base);
    await f.waitForFunction(() => window.__fpFitted, null, { timeout: 10000 }).catch(() => {});
    await f.evaluate(data);
    await page.waitForTimeout(900);
  };
  await prep('workoutrecap', WARM.BASE_JS.recap, recap.recapDataJs({ totalReps: 30, moves: 1, pct: 93, hasFormData: true, durationSec: 60, overview: 'Solid session.', hasVideo: true }));
  await prep('muscleranks', WARM.BASE_JS.ranks, athltSetDataJs(ranksData));
  await prep('repfeedback', WARM.BASE_JS.repfeedback, rf.repFeedbackDataJs({ exerciseName: 'Shoulder Press', hasVideo: true, reps: [{ timeSec: 3, good: true, what: 'Full press.' }, { timeSec: 8, good: false, what: 'Press higher.' }] }));
  // what the host does: transparent where the video shows through
  for (const n of ['workoutrecap', 'repfeedback']) await frame(n).addStyleTag({ content: 'html,body{background:transparent!important}' });

  const show = (which) => page.evaluate((which) => {
    for (const id of ['recap', 'ranks', 'repfeedback']) document.getElementById(id).style.display = which.includes(id) ? '' : 'none';
  }, which);
  const px = async (x, y) => { const b = PNG.sync.read(await page.screenshot()); const i = (y * b.width + x) * 4; return [b.data[i], b.data[i + 1], b.data[i + 2]]; };
  const isVideo = (p) => Math.abs(p[0] - 0x12) < 6 && Math.abs(p[1] - 0xb8) < 6 && Math.abs(p[2] - 0x86) < 6;
  // a point in the video area (between the top controls and the card), away from any page text
  const probe = [[40, 300], [350, 300], [195, 260], [195, 505], [330, 500]];
  const sampleVideo = async () => { const r = []; for (const [x, y] of probe) r.push(isVideo(await px(x, y))); return r; };

  await show(['recap', 'ranks', 'repfeedback']);
  await page.screenshot({ path: path.join(ROOT, '.scratch', 'layering-old.png') });
  const old = await sampleVideo();
  check('REPRODUCED (old rule: every layer under the open page shows): the video area is covered', old.some(v => !v), JSON.stringify(old));

  await show(['recap', 'repfeedback']); // new rule: ranks was never on screen, recap was
  const peek = await sampleVideo();
  check('recap kept beneath but not yet hidden: its card pokes above the rep feedback card (why it is hidden once covered)', peek.some(v => !v), JSON.stringify(peek));
  await page.evaluate(() => { document.getElementById('recap').style.opacity = '0'; }); // beneathHidden
  await page.screenshot({ path: path.join(ROOT, '.scratch', 'layering-new.png') });
  const nw = await sampleVideo();
  check('FIXED (new rule + page beneath hidden): the video shows through the rep feedback page', nw.every(Boolean), JSON.stringify(nw));
  await show(['repfeedback']);
  const only = await sampleVideo();
  check('rep feedback alone over the video: the video shows', only.every(Boolean), JSON.stringify(only));
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
