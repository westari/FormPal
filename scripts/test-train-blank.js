#!/usr/bin/env node
/**
 * scripts/test-train-blank.js   (Train tab: blank white screen on first open)
 *
 * The device log showed: "web view load end" and then NOTHING for 12s ("page never said ready"), so the tab stayed blank
 * until a safety timer. Cause: the page would not show itself until its pictures were repaired and its day strip centred,
 * and on the phone either one can fail to happen (the pictures' source tag is already gone when the page looks for it;
 * the design's own centring gives up if the page was not on screen yet). The tab must show without them.
 *
 * Hostile first-open conditions simulated, real file, real injection:
 *   A. the pictures' source can not be found at all   B. the design's own centring never runs
 * Runs the PREVIOUS code (REPRODUCES: never ready) and the fixed code.
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const Module = require('module'); const orig = Module._load;
Module._load = function (r) { if (/constants\/api$/.test(r)) return { MYPAL_API_URL: 'http://localhost/none' }; if (r === 'expo-asset') return { Asset: {} }; return orig.apply(this, arguments); };
const path = require('path'); const { pathToFileURL } = require('url'); const fs = require('fs');
const { webkit } = require('playwright');
const ROOT = path.join(__dirname, '..');
const cur = require('../app/(tabs)/train.tsx');
const old = fs.existsSync(path.join(ROOT, '.scratch', 'old', 'train-old.tsx')) ? require('../.scratch/old/train-old.tsx') : null;
const { extractTrainImages } = require('../lib/trainTemplate.ts');
const IMGS = extractTrainImages(fs.readFileSync(path.join(ROOT, 'assets', 'app screens', 'traintab.html'), 'utf8'));
const { buildTrainData } = require('../lib/trainData.ts');
const { athltSetDataJs } = require('../lib/dcLogicPatch.ts');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const URL_ = pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'traintab.html')).href;
const data = { ...buildTrainData(null, [], { top: 62, bottom: 34 }, new Date(2026, 10, 5)) };

async function firstOpen(before, hostile) {
  const b = await webkit.launch();
  const ctx = await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const msgs = [];
  await p.exposeFunction('__post', (d) => { try { msgs.push({ ...JSON.parse(d), at: Date.now() }); } catch {} });
  await p.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  if (hostile.noTemplate) await p.addInitScript(() => { Object.defineProperty(window, '__trTplText', { set() {}, get() { return undefined; }, configurable: true }); window.fetch = () => Promise.reject(new Error('blocked')); });
  if (hostile.noCentre) await p.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); let n = 0; window.requestAnimationFrame = (f) => raf((t) => { try { if (document.querySelector('div[data-scroll]') && /centre|offsetLeft/.test(String(f))) return; } catch (e) {} f(t); }); const sl = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft'); Object.defineProperty(Element.prototype, 'scrollLeft', { get() { return sl.get.call(this); }, set(v) { if (window.__allowScroll) sl.set.call(this, v); }, configurable: true }); setTimeout(() => { window.__allowScroll = true; }, 100000); });
  if (hostile.handed) await p.addInitScript(`window.__trImgs = ${JSON.stringify(IMGS)};`);
  await p.addInitScript(before);
  await p.goto(URL_, { waitUntil: 'commit' });
  const t0 = Date.now(); let pushed = false;
  while (!msgs.some(m => m.type === 'ready') && Date.now() - t0 < 6000) { if (!pushed && msgs.some(m => m.type === 'needData')) { pushed = true; await p.evaluate(athltSetDataJs(data)); } await p.waitForTimeout(50); }
  const ready = msgs.find(m => m.type === 'ready');
  const diag = msgs.find(m => m.type === 'notReady');
  await p.waitForTimeout(400);
  const flame = await p.evaluate(() => { const m = document.querySelector('div[role="img"][aria-label="Streak"]'); return m ? (getComputedStyle(m).webkitMaskImage || getComputedStyle(m).maskImage || '').slice(0, 14) : ''; });
  const state = await p.evaluate(() => ({ vis: document.body ? getComputedStyle(document.body).visibility : 'none', text: (document.body && document.body.innerText || '').length }));
  await b.close();
  state.flame = flame;
  return { readyMs: ready ? ready.at - t0 : null, diag, state };
}

(async () => {
  for (const [name, hostile] of [['pictures cannot be found', { noTemplate: true }], ['normal', {}]]) {
    if (old) {
      const o = await firstOpen(old.TRAIN_BEFORE, hostile);
      console.log(`      OLD code, ${name}: ready ${o.readyMs == null ? 'NEVER (6s)' : o.readyMs + 'ms'}`);
      if (hostile.noTemplate) check('REPRODUCED with the previous code: the tab never says ready when the pictures cannot be found', o.readyMs == null, JSON.stringify(o.diag && o.diag.parts));
    }
    const n = await firstOpen(cur.TRAIN_BEFORE, hostile);
    console.log(`      NEW code, ${name}: ready ${n.readyMs == null ? 'NEVER (6s)' : n.readyMs + 'ms'}`);
    check(`${name}: the tab shows itself by itself (within 3s), no safety timer needed`, n.readyMs != null && n.readyMs < 3000, n.readyMs + 'ms');
    check(`${name}: it is visible and filled (not blank)`, n.state.vis === 'visible' && n.state.text > 100, JSON.stringify(n.state));
  }
  {
    const h = await firstOpen(cur.TRAIN_BEFORE, { noTemplate: true, handed: true });
    console.log(`      NEW code, the app hands over the pictures (the page cannot find them itself): ready ${h.readyMs}ms, flame mask ${h.state.flame}`);
    check('the app hands the pictures to the page: tab ready fast (< 1.2s) and the flame is a real image', h.readyMs != null && h.readyMs < 1200 && /blob:/.test(h.state.flame), h.readyMs + 'ms ' + h.state.flame);
  }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
