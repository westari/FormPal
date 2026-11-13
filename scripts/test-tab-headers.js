#!/usr/bin/env node
/**
 * scripts/test-tab-headers.js
 * Home, Train, Progress and Profile show ONE header (lib/tabHeader.ts): the same title font, size, weight, letter spacing and
 * position. Each page is opened with the exact
 * injection the app ships, the same top inset, and measured in the live DOM. Screenshots: .scratch/hdr/final-*.png
 */
const path = require('path'), fs = require('fs');
const { openProgress, makeData } = require('./lib/progress-harness.js');
const { open: openProfile } = require('./lib/prof-common.js');
const { openHome } = require('./lib/home-harness.js');
const { chromium } = require('playwright');
const { pathToFileURL } = require('url');
const OUT = path.join(__dirname, '..', '.scratch', 'hdr'); fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const MEASURE = () => {
  const t = document.querySelector('[data-fp-title]');
  if (!t) return null;
  const S = window.__dcCanvasScale || (innerHeight / 844), rt = t.getBoundingClientRect(), ct = getComputedStyle(t);
  const row = t.closest('[data-fp-header]');
  const right = row && [...row.children].filter(c => c !== t.parentElement && getComputedStyle(c).display !== 'none')[0];
  const rr = right && right.getBoundingClientRect();
  const nodeText = [...t.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join('');
  return {
    title: nodeText, anyDate: !!document.querySelector('[data-fp-date]'), tx: rt.left / S, ty: rt.top / S, cy: (rt.top + rt.height / 2) / S, size: parseFloat(ct.fontSize),
    tf: [ct.fontFamily.split(',')[0], ct.fontWeight, ct.letterSpacing, ct.color].join(' | '),
    rightMid: rr ? (rr.top + rr.height / 2) / S : null, blockMid: (rt.top + rt.height / 2) / S,
    overlap: rr ? rt.right > rr.left - 2 : false, wide: t.scrollWidth > t.clientWidth + 1,
    cal: !!t.querySelector('[data-fp-cal]'),
  };
};

async function trainMeasure() {
  require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
  const Module = require('module'); const orig = Module._load;
  Module._load = function (r) { if (/constants\/api$/.test(r)) return { MYPAL_API_URL: 'x' }; if (r === 'expo-asset') return { Asset: {} }; return orig.apply(this, arguments); };
  const train = require('../app/(tabs)/train.tsx'); const { buildTrainData } = require('../lib/trainData.ts'); const { athltSetDataJs } = require('../lib/dcLogicPatch.ts');
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const msgs = []; await p.exposeFunction('__post', d => { try { msgs.push(JSON.parse(d)); } catch {} });
  await p.addInitScript(() => { window.ReactNativeWebView = { postMessage: d => window.__post(d) }; }); await p.addInitScript(train.TRAIN_BEFORE);
  const data = { ...buildTrainData(null, [], { top: 62, bottom: 34 }, new Date()), insets: { top: 62, bottom: 34 } };
  await p.goto(pathToFileURL(path.join(__dirname, '..', 'assets', 'app screens', 'traintab.html')).href, { waitUntil: 'commit' });
  let pushed = false; const t0 = Date.now();
  while (!msgs.some(m => m.type === 'ready') && Date.now() - t0 < 20000) { if (!pushed && msgs.some(m => m.type === 'needData')) { pushed = true; await p.evaluate(athltSetDataJs(data)); } await p.waitForTimeout(50); }
  await p.waitForTimeout(800);
  const m = await p.evaluate(MEASURE); await p.screenshot({ path: path.join(OUT, 'final-train.png'), clip: { x: 0, y: 0, width: 390, height: 260 } }); await b.close(); return m;
}

(async () => {
  const res = {};
  const h = await openHome({ inset: 62 }); await h.page.waitForTimeout(600); res.Home = await h.page.evaluate(MEASURE); await h.page.screenshot({ path: path.join(OUT, 'final-home.png'), clip: { x: 0, y: 0, width: 390, height: 260 } }); await h.browser.close();
  const pr = await openProgress(makeData()); await pr.page.waitForTimeout(400); res.Progress = await pr.page.evaluate(MEASURE); await pr.page.screenshot({ path: path.join(OUT, 'final-progress.png'), clip: { x: 0, y: 0, width: 390, height: 260 } }); await pr.browser.close();
  const pf = await openProfile('full', { width: 390, height: 844 }); await pf.p.waitForTimeout(1500); res.Profile = await pf.p.evaluate(MEASURE); await pf.p.screenshot({ path: path.join(OUT, 'final-profile.png'), clip: { x: 0, y: 0, width: 393, height: 260 } }); await pf.b.close();
  res.Train = await trainMeasure();
  for (const k of Object.keys(res)) console.log('      ' + k + ': ' + JSON.stringify(res[k] && { y: +res[k].ty.toFixed(1), x: +res[k].tx.toFixed(1), size: res[k].size, tf: res[k].tf }));
  const names = Object.keys(res), vals = names.map(k => res[k]);
  const DATE = /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), [A-Z][a-z]+ \d{1,2}$/;
  check('all four pages have the shared header', vals.every(Boolean));
  if (vals.every(Boolean)) {
    check('1: no date line under the title on any page', vals.every(v => !v.anyDate));
    check('2: Home title is the live date ("Thursday, November 12" style)', DATE.test(res.Home.title) && res.Home.title === new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }), res.Home.title);
    check('2: Train / Progress / Profile keep their titles', ['Train', 'Progress', 'Profile'].every(k => res[k].title === k), ['Train', 'Progress', 'Profile'].map(k => res[k].title).join(' | '));
    check('2: Home has the small grey calendar icon beside the date; the others do not', res.Home.cal && !res.Train.cal && !res.Progress.cal && !res.Profile.cal);
    check('same title font, weight, letter spacing, colour on all four', new Set(vals.map(v => v.tf)).size === 1, vals[0].tf);
    check('Train / Progress / Profile are the full 30px', ['Train', 'Progress', 'Profile'].every(k => res[k].size === 30), ['Train', 'Progress', 'Profile'].map(k => res[k].size).join(' | '));
    check('Home date is as big as fits (18..30px), never wraps or runs under the streak chip', res.Home.size >= 18 && res.Home.size <= 30 && !res.Home.wide && !res.Home.overlap, res.Home.size + 'px');
    check('same title position (left edge and vertical centre, within 0.5px)', vals.every(v => Math.abs(v.tx - vals[0].tx) < 0.5 && Math.abs(v.cy - vals[0].cy) < 0.5), vals.map(v => `${v.tx.toFixed(1)},${v.cy.toFixed(1)}`).join(' | '));
    check('the title is clear of the notch (inset 62): top is below 62 + 62', vals.every(v => v.ty >= 124 - 0.5), vals[0].ty.toFixed(1));
    check('the right-hand control is centred on the title', vals.every(v => v.rightMid == null || Math.abs(v.rightMid - v.blockMid) < 2), vals.map(v => `${v.rightMid && v.rightMid.toFixed(1)}/${v.blockMid.toFixed(1)}`).join(' | '));
  }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
