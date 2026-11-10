#!/usr/bin/env node
/**
 * scripts/bench-tab-lag.js  [progress|profile|train] [cpuRate=4] [runs=5]
 *
 * First-open time of a tab's web page, the way the tab does it: page starts loading, asks for data, gets it, and
 * reveals itself ("ready"). Reports, per run, ms from the start of the load to: the page asking for data, the data
 * landing, the design's logic being swapped in, and READY (the moment the tab becomes visible). Chromium with a CPU
 * slowdown, the real design files, the exact shipped injection.  Output lines start with [TAB-LAG] like the app's logs.
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const Module = require('module'); const prev = Module._load;
Module._load = function (r) { if (/constants\/api$/.test(r)) return { MYPAL_API_URL: 'http://localhost/none' }; if (r === 'expo-asset') return { Asset: {} }; return prev.apply(this, arguments); };
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const which = process.argv[2] || 'progress';
const rate = Number(process.argv[3] || 4);
const runs = Number(process.argv[4] || 5);
const { PNG } = require('pngjs');
const H = require('../lib/dcWebviewHelpers.ts');
const diffRatio = (a, b, tol = 24) => { const A = PNG.sync.read(a), B = PNG.sync.read(b); if (A.width !== B.width || A.height !== B.height) return 1; let n = 0; for (let i = 0; i < A.data.length; i += 4) if (Math.abs(A.data[i] - B.data[i]) > tol || Math.abs(A.data[i + 1] - B.data[i + 1]) > tol || Math.abs(A.data[i + 2] - B.data[i + 2]) > tol) n++; return n / (A.width * A.height); };
const { dcLogicPatchJs, athltSetDataJs } = require('../lib/dcLogicPatch.ts');

function setup() {
  if (which === 'progress') {
    const { PROGRESS_LOGIC_EXT, PROGRESS_DOM_JS } = require('../lib/progressInject.ts');
    const { makeData } = require('./lib/progress-harness.js');
    return { file: 'progress.html', before: H.DC_VIEWPORT_JS + H.DC_NO_ZOOM_JS + H.CONSOLE_FORWARD_JS + H.DC_SETTLE_JS + dcLogicPatchJs(PROGRESS_LOGIC_EXT) + PROGRESS_DOM_JS, data: makeData(), ask: 'needData' };
  }
  if (which === 'profile') {
    const inject = require('../lib/profileInject.ts');
    const AS = { getItem: async () => null, setItem: async () => {} };
    const sessionLog = require('../lib/sessionLog.ts');
    const profileData = require('../lib/profileData.ts');
    const DAY = 86400000, now = Date.now();
    const ss = Array.from({ length: 12 }, (_, d) => ({ ts: now - d * DAY - 3600e3, exerciseId: 'pushup', displayName: 'Push-ups', reps: 12, goodReps: 10, pct: 90, formChecked: true }));
    const data = profileData.buildProfileData({ seedVersion: 1, name: 'Ari', email: 'ari@example.com', sessions: ss, streak: sessionLog.calcStreak(ss), planProfile: { goal: 'toned', experience: 'intermediate', daysPerWeek: 4, location: 'gym' }, planGeneratedAt: now - 30 * DAY, location: 'home', latestWeightLb: 182.4, details: {}, audio: { enabled: true, voiceFrequency: 'correctionsOnly' }, appVersion: 'FormPal 1.0.0 (7)', insets: { top: 59, bottom: 34 } });
    return { file: 'profile.html', before: H.DC_VIEWPORT_JS + H.CONSOLE_FORWARD_JS + H.DC_SETTLE_JS + dcLogicPatchJs(inject.PROFILE_LOGIC_EXT) + inject.PROFILE_DOM_JS, data, ask: 'needData' };
  }
  throw new Error('unknown tab ' + which);
}

(async () => {
  const cfg = setup();
  const b = await chromium.launch();
  const rows = [], jumps = [];
  for (let k = 0; k < runs; k++) {
    const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const msgs = [];
    await p.exposeFunction('__post', (d) => { let m; try { m = JSON.parse(d); } catch { return; } msgs.push({ type: m.type, at: Date.now() }); });
    await p.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
    await p.addInitScript(() => { window.__t = {}; const iv = setInterval(() => { const n = performance.now(); if (window.__athltData && !window.__t.data) window.__t.data = n; if (window.__athltLogicReady && !window.__t.logic) window.__t.logic = n; if (document.documentElement && document.documentElement.hasAttribute('data-pready') && !window.__t.ready) { window.__t.ready = n; clearInterval(iv); } }, 4); });
    await p.addInitScript(cfg.before);
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const t0 = Date.now();
    await p.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', cfg.file)).href, { waitUntil: 'commit' });
    let pushed = false, askedAt = 0;
    while (!(await p.evaluate(() => !!(window.__t && window.__t.ready)).catch(() => false)) && Date.now() - t0 < 30000) {
      if (!pushed && msgs.some(m => m.type === cfg.ask)) { pushed = true; askedAt = msgs.find(m => m.type === cfg.ask).at - t0; await p.evaluate(athltSetDataJs(cfg.data)); }
      await p.waitForTimeout(8);
    }
    const first = await p.screenshot();
    await p.waitForTimeout(1500);
    const settled = await p.screenshot();
    jumps.push(diffRatio(first, settled));
    const t = await p.evaluate(() => window.__t);
    rows.push({ asked: askedAt, data: Math.round(t.data), logic: Math.round(t.logic), ready: Math.round(t.ready) });
    await ctx.close();
  }
  await b.close();
  const med = (k) => rows.map(r => r[k]).sort((a, c) => a - c)[Math.floor(rows.length / 2)];
  console.log(`[TAB-LAG] ${which} first open @${rate}x CPU, ${runs} runs: page asked for data +${med('asked')}ms | data landed +${med('data')}ms | design logic swapped +${med('logic')}ms | READY +${med('ready')}ms (gap logic->ready ${med('ready') - med('logic')}ms)`);
  console.log('      runs:', JSON.stringify(rows));
  console.log(`[TAB-LAG] ${which} first visible frame vs the settled frame: worst difference ${(Math.max(...jumps) * 100).toFixed(2)}% of pixels over ${runs} runs (no jump = under 0.4%)`);
  if (Math.max(...jumps) > 0.004) { console.log('FAIL: the page jumps after it is shown'); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
