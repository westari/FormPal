#!/usr/bin/env node
/**
 * scripts/test-train-search-keyboard.js
 * Train > Practice Exercises search: tapping the search box brings up the keyboard, which shortens the visible page. The page used to
 * stay 844 tall, so its lower part (the search box and its results) sat behind the keyboard and the screen looked cut off. The keyboard
 * is simulated by shrinking the viewport (508 high, like an iPhone with the keyboard up). Real traintab.html + the shipped injection.
 */
const path = require('path'); const { chromium } = require('playwright'); const { pathToFileURL } = require('url');
require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
const Module = require('module'); const orig = Module._load;
Module._load = function (r) { if (/constants\/api$/.test(r)) return { MYPAL_API_URL: 'x' }; if (r === 'expo-asset') return { Asset: {} }; return orig.apply(this, arguments); };
const train = require('../app/(tabs)/train.tsx'); const { buildTrainData } = require('../lib/trainData.ts'); const { athltSetDataJs } = require('../lib/dcLogicPatch.ts');
const fs = require('fs'); const OUT = path.join(__dirname, '..', '.scratch', 'kb'); fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const msgs = []; await p.exposeFunction('__post', d => { try { msgs.push(JSON.parse(d)); } catch {} });
  await p.addInitScript(() => { window.ReactNativeWebView = { postMessage: d => window.__post(d) }; }); await p.addInitScript(train.TRAIN_BEFORE);
  const data = { ...buildTrainData(null, [], { top: 62, bottom: 34 }, new Date()), insets: { top: 62, bottom: 34 } };
  await p.goto(pathToFileURL(path.join(__dirname, '..', 'assets', 'app screens', 'traintab.html')).href, { waitUntil: 'commit' });
  let pushed = false; const t0 = Date.now();
  while (!msgs.some(m => m.type === 'ready') && Date.now() - t0 < 20000) { if (!pushed && msgs.some(m => m.type === 'needData')) { pushed = true; await p.evaluate(athltSetDataJs(data)); } await p.waitForTimeout(50); }
  await p.waitForTimeout(800);
  const canvasH = () => p.evaluate(() => Math.round([...document.querySelectorAll('div')].find(d => d.style.width === '390px').getBoundingClientRect().height));
  const state = () => p.evaluate(() => { const i = document.querySelector('input[placeholder*="Search"]'); const r = i.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, innerH: innerHeight }; });
  check('before the keyboard the canvas is the full 844 tall', (await canvasH()) === 844, String(await canvasH()));
  await p.evaluate(() => { const sc = document.querySelector('div[data-scroll]'); sc.scrollTop = sc.scrollHeight; });
  await p.waitForTimeout(300);
  await p.click('input[placeholder*="Search"]');
  await p.setViewportSize({ width: 390, height: 508 }); // the keyboard comes up
  await p.waitForTimeout(900);
  const kb = await state();
  check('12: with the keyboard up the page is only as tall as the visible area (nothing hidden behind the keyboard)', (await canvasH()) <= 520, String(await canvasH()));
  check('12: the search box is fully inside the visible area, above the keyboard', kb.top >= 0 && kb.bottom <= kb.innerH - 20, JSON.stringify(kb));
  await p.screenshot({ path: path.join(OUT, 'search-focused.png') });
  await p.keyboard.type('squat'); await p.waitForTimeout(700);
  const res = await p.evaluate(() => { const rows = [...document.querySelectorAll('div')].filter(d => /Squat/i.test(d.textContent) && d.style.fontSize === '15px' && d.style.fontWeight === '600'); const r = rows[0] && rows[0].getBoundingClientRect(); const i = document.querySelector('input[placeholder*="Search"]').getBoundingClientRect(); return { n: rows.length, first: r && [Math.round(r.top), Math.round(r.bottom)], inputBottom: i.bottom, innerH: innerHeight }; });
  console.log('      results:', JSON.stringify(res));
  check('12: typing shows results below the search box, and the first one is inside the visible area (scrollable, not cut off)', res.n > 0 && res.first && res.first[1] <= res.innerH);
  await p.screenshot({ path: path.join(OUT, 'search-typed.png') });
  await p.setViewportSize({ width: 390, height: 844 }); // keyboard down
  await p.waitForTimeout(700);
  check('12: with the keyboard down the page is the full 844 tall again', (await canvasH()) === 844, String(await canvasH()));
  await b.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
