#!/usr/bin/env node
/**
 * scripts/test-rep-feedback.js
 *
 * Loads the REAL assets/app screens/repfeedback.html in headless Chromium and
 * runs the EXACT inject that ships in app/rep-feedback.tsx (transpiled slice,
 * not a copy). Checks, against the live DOM:
 *   1. card reveal ('ready') time vs the previous version, no layout shift after
 *   2. scrub bar starts at 0%, only moves with real playback / rep taps, and
 *      the initial open does NOT seek
 *   3. speed button reports its position to RN (native glass menu) and no
 *      page-drawn dark menu exists any more; label can be updated from RN
 *   4. the native video area fills to the top (static check on the source)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { pathToFileURL } = require('url');
const ts = require('typescript');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OLD_REV = process.env.OLD_REV || '6cad1f8';
const THROTTLE = Number(process.env.THROTTLE || 4);
const file = path.join(ROOT, 'assets', 'app screens', 'repfeedback.html');

function loadInject(src) {
  const a = src.indexOf('const CONSOLE_FORWARD_JS');
  const b = src.indexOf('export default function RepFeedbackScreen');
  const js = ts.transpileModule(src.slice(a, b), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText + '\nmodule.exports = { repFeedbackInject };';
  const m = { exports: {} };
  new Function('module', 'exports', js)(m, m.exports);
  return m.exports.repFeedbackInject;
}
const newSrc = fs.readFileSync(path.join(ROOT, 'app', 'rep-feedback.tsx'), 'utf8');
const oldSrc = execSync(`git show ${OLD_REV}:app/rep-feedback.tsx`, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
const opts = { exerciseName: 'Shoulder Press', hasVideo: true, reps: [
  { timeSec: 6.0, what: 'Test rep one. Fix one.' },
  { timeSec: 11.0, what: 'Test rep two. Fix two.' },
  { timeSec: 16.0, what: 'Test rep three. Fix three.' },
] };
const OLD = loadInject(oldSrc)(opts);
const NEW = loadInject(newSrc)(opts);

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

async function open(inject, mode, throttle) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 852 }, deviceScaleFactor: 2 });
  if (throttle) {
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  }
  const msgs = [];
  let t0 = 0, readyAt = null;
  await page.exposeFunction('__post', (d) => {
    let m; try { m = JSON.parse(d); } catch { return; }
    if (m.type === 'pageConsole') return;
    msgs.push({ ...m, at: Date.now() - t0 });
    if (m.type === 'ready' && readyAt === null) readyAt = Date.now() - t0;
  });
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  if (mode === 'start') await page.addInitScript(inject);
  if (mode === 'dcl') page.on('domcontentloaded', () => { page.evaluate(inject).catch(() => {}); });
  t0 = Date.now();
  await page.goto(pathToFileURL(file).href, { waitUntil: 'commit' });
  const deadline = Date.now() + 8000;
  while (readyAt === null && Date.now() < deadline) await page.waitForTimeout(25);
  return { browser, page, msgs, getReadyAt: () => readyAt };
}

const cardRect = (page) => page.evaluate(() => {
  const c = document.querySelector('#dc-root div[style*="border-radius: 36px"]');
  const r = c && c.getBoundingClientRect();
  const root = document.getElementById('dc-root');
  return { rect: r ? [r.left, r.top, r.width, r.height].map(Math.round) : null, transform: root && root.style.transform };
});

(async () => {
  // 1. latency + stability
  const oldRun = await open(OLD, 'dcl', THROTTLE);
  const oldReady = oldRun.getReadyAt();
  await oldRun.browser.close();

  const run = await open(NEW, 'start', THROTTLE);
  const readyAt = run.getReadyAt();
  console.log(`      old: ready at ${oldReady === null ? 'NEVER' : oldReady + 'ms'}   new: ready at ${readyAt === null ? 'NEVER' : readyAt + 'ms'}  (CPU x${THROTTLE})`);
  check('NEW posts ready', readyAt !== null);
  check('NEW is not slower than OLD', oldReady === null || readyAt <= oldReady, `${readyAt}ms vs ${oldReady}ms`);
  const { page } = run;
  const atReady = await cardRect(page);
  await page.waitForTimeout(1800);
  const later = await cardRect(page);
  check('card does not move/rescale after reveal', JSON.stringify(atReady) === JSON.stringify(later), `${JSON.stringify(atReady)} -> ${JSON.stringify(later)}`);
  check('real data in card (rep 1 text, not demo text)', await page.evaluate(() => /Test rep one/.test(document.body.innerText)));

  // 2. scrub bar
  const bar = () => page.evaluate(() => {
    const kids = [...document.querySelectorAll('#dc-root div')].filter(d => d.style && d.style.position === 'relative' && d.style.flexGrow === '1' && d.style.height === '30px');
    const t = kids[0];
    if (!t) return null;
    const fill = [...t.children].find(c => c.style.borderRadius === '999px' && c.style.height === '4px' && c.style.width);
    const thumb = [...t.children].find(c => c.style.borderRadius === '50%' && c.style.width === '16px');
    return { fill: fill && fill.style.width, thumb: thumb && thumb.style.left };
  });
  const b0 = await bar();
  check('bar starts at 0% at the beginning of the video', b0 && b0.fill === '0%' && b0.thumb === '0%', JSON.stringify(b0));
  const seeksAtOpen = run.msgs.filter(m => m.type === 'seek');
  check('opening the screen does NOT seek the video', seeksAtOpen.length === 0, `${seeksAtOpen.length} seek messages`);
  await page.evaluate(() => window.__fpSetDuration(30));
  const b1 = await bar();
  check('duration arriving does not move the bar off 0%', b1.fill === '0%' && b1.thumb === '0%', JSON.stringify(b1));
  await page.evaluate(() => window.__fpSetCurrentTime(12));
  const b2 = await bar();
  check('bar follows real playback (12s of 30s = 40%)', parseFloat(b2.fill) === 40 && parseFloat(b2.thumb) === 40, JSON.stringify(b2));
  // tapping "Next rep" seeks to rep 2 and the bar jumps there
  await page.evaluate(() => {
    [...document.querySelectorAll('#dc-root div')].find(d => d.children.length === 0 && /Next rep/.test(d.textContent)).click();
  });
  const seeksAfter = run.msgs.filter(m => m.type === 'seek');
  const b3 = await bar();
  check('Next rep seeks to rep 2 (11s)', seeksAfter.length === 1 && seeksAfter[0].timeSec === 11, JSON.stringify(seeksAfter.map(s => s.timeSec)));
  check('bar jumps to rep 2 (11/30 = 36.7%)', parseFloat(b3.fill) === 36.7, JSON.stringify(b3));

  // 3. speed menu
  const before = await page.evaluate(() => document.body.children.length);
  const expectRect = await page.evaluate(() => {
    const el = document.querySelector('#dc-root svg path[d="M8 8l2.6-2.4"]').closest('div');
    const r = el.getBoundingClientRect();
    el.click();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const open_ = run.msgs.filter(m => m.type === 'openSpeedMenu');
  check('speed button tells RN to open the native glass menu', open_.length === 1, JSON.stringify(open_[0] && open_[0].rect));
  check('reported rect is the real button position', open_[0] && Math.abs(open_[0].rect.top - expectRect.top) < 1 && Math.abs(open_[0].rect.left - expectRect.left) < 1);
  const after = await page.evaluate(() => document.body.children.length);
  check('no page-drawn dark menu is created any more', before === after, `body children ${before} -> ${after}`);
  await page.evaluate(() => window.__fpSetSpeedLabel('1.5x'));
  check('RN can set the speed label', await page.evaluate(() => /1\.5x/.test(document.body.innerText)));
  await page.screenshot({ path: path.join(ROOT, '.scratch', 'rep-feedback-new.png') });
  await run.browser.close();

  // 4. native video area fills to the top (like Workout Complete)
  const m = newSrc.match(/videoArea:\s*\{[^}]*\}/);
  check('video area starts at top: 0', m && /top:\s*0\b/.test(m[0]) && !/top:\s*'3%'/.test(m[0]), m && m[0]);
  const initialSeekGone = !/currentTime\s*=\s*reps\[0\]\.timeSec/.test(newSrc);
  check('RN no longer seeks to rep 1 on start', initialSeekGone);

  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
