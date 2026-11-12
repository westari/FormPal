#!/usr/bin/env node
/**
 * scripts/test-tab-headers.js
 * Home, Train, Progress and Profile show ONE header (lib/tabHeader.ts): the same title font, size, weight, letter spacing and
 * position, and the same date line under it ("Thursday, November 12") in the same style. Each page is opened with the exact
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
  const t = document.querySelector('[data-fp-title]'), d = document.querySelector('[data-fp-date]');
  if (!t || !d) return null;
  const S = window.__dcCanvasScale || (innerHeight / 844), rt = t.getBoundingClientRect(), rd = d.getBoundingClientRect(), ct = getComputedStyle(t), cd = getComputedStyle(d);
  const row = t.closest('[data-fp-header]');
  const right = row && [...row.children].filter(c => c !== t.parentElement && getComputedStyle(c).display !== 'none')[0];
  const rr = right && right.getBoundingClientRect();
  return {
    title: t.textContent, date: d.textContent, tx: rt.left / S, ty: rt.top / S, dy: rd.top / S, dx: rd.left / S,
    tf: [ct.fontFamily.split(',')[0], ct.fontSize, ct.fontWeight, ct.letterSpacing, ct.color].join(' | '),
    df: [cd.fontFamily.split(',')[0], cd.fontSize, cd.fontWeight, cd.letterSpacing, cd.color].join(' | '),
    rightMid: rr ? (rr.top + rr.height / 2) / S : null, blockMid: (rt.top + (rd.bottom - rt.top) / 2) / S,
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
  for (const k of Object.keys(res)) console.log('      ' + k + ': ' + JSON.stringify(res[k] && { y: +res[k].ty.toFixed(1), x: +res[k].tx.toFixed(1), tf: res[k].tf, df: res[k].df }));
  const names = Object.keys(res), vals = names.map(k => res[k]);
  check('all four pages have the shared header', vals.every(Boolean));
  if (vals.every(Boolean)) {
    check('titles are Home / Train / Progress / Profile', names.every(k => res[k].title === k), vals.map(v => v.title).join(' | '));
    check('same title font, size, weight, letter spacing, colour', new Set(vals.map(v => v.tf)).size === 1, vals[0].tf);
    check('same title position (x and y, within 0.5px)', vals.every(v => Math.abs(v.tx - vals[0].tx) < 0.5 && Math.abs(v.ty - vals[0].ty) < 0.5), vals.map(v => `${v.tx.toFixed(1)},${v.ty.toFixed(1)}`).join(' | '));
    check('date line has the same style on all four', new Set(vals.map(v => v.df)).size === 1, vals[0].df);
    check('date line sits at the same place under the title', vals.every(v => Math.abs(v.dy - vals[0].dy) < 0.5 && Math.abs(v.dx - vals[0].dx) < 0.5), vals.map(v => v.dy.toFixed(1)).join(' | '));
    check('date line reads like "Thursday, November 12"', vals.every(v => /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), [A-Z][a-z]+ \d{1,2}$/.test(v.date)), vals[0].date);
    check('the title is clear of the notch (inset 62): top is below 62 + 62', vals.every(v => v.ty >= 124 - 0.5), vals[0].ty.toFixed(1));
    check('the right-hand control is centred on the title block', vals.every(v => v.rightMid == null || Math.abs(v.rightMid - v.blockMid) < 2), vals.map(v => `${v.rightMid && v.rightMid.toFixed(1)}/${v.blockMid.toFixed(1)}`).join(' | '));
  }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
