#!/usr/bin/env node
/**
 * scripts/test-paywall-smooth.js  (Ari 2026-11-27: the paywall auto-scroll "works, but feels choppy. Make it smooth (60fps, eased)")
 * Real paywallv2.html in Chromium with the EXACT scripts the app injects (scripts/lib/paywall-harness.js), iPhone 15 size, 60 Hz. After __pwAutoScroll and the 5 s wait,
 * the list's VISIBLE position (scroll position + the rows' own transform) is read on EVERY animation frame and compared with a perfect eased glide.
 * Choppy = a frame where it stands still although it should move, or jumps, or is off the eased curve. Run with PW_SRC=<old onboarding.tsx> to measure the old code.
 */
const path = require('path');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  -> ' + detail : ''}`); if (!ok) failed++; };

async function measure(R) {
  const { chromium } = require('playwright');
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 393, height: 852 - 59 }, deviceScaleFactor: 3 }); const pg = await ctx.newPage();
  await pg.addInitScript('window.ReactNativeWebView={postMessage:function(m){(window.__posts=window.__posts||[]).push(m)}};window.__dcFitBoth=1;window.__dcKeepFx=1;');
  await pg.addInitScript(R.CUE_ORB_JS); await pg.addInitScript(R.EARLY);
  await pg.goto('file://' + path.resolve(__dirname, '..', 'assets', 'app screens', 'paywallv2.html').split(path.sep).join('/'));
  await pg.waitForTimeout(1500); await pg.evaluate(R.DC); await pg.evaluate(R.TIDY); await pg.waitForTimeout(2500);
  await pg.evaluate('window.__pwAutoScroll()');
  const res = await pg.evaluate(() => new Promise((done) => {
    const scr = document.querySelector('#dc-root [data-scroll]');
    const vis = () => { const k = scr.children[0]; let off = 0; try { off = -new DOMMatrixReadOnly(getComputedStyle(k).transform).m42; } catch (e) {} return scr.scrollTop + off; };
    const fr = []; const t0 = performance.now();
    (function f(ts) { fr.push([ts - t0, vis()]); if (ts - t0 < 12500) requestAnimationFrame(f); else done({ fr, max: scr.scrollHeight - scr.clientHeight, top: scr.scrollTop, transform: getComputedStyle(scr.children[0]).transform, posts: window.__posts || [] }); })(t0);
  }));
  await br.close();
  // the glide: from the first frame that moved to the last one
  const fr = res.fr; const i0 = fr.findIndex((x) => x[1] > 0.01); let i1 = fr.length - 1; while (i1 > 0 && Math.abs(fr[i1][1] - fr[i1 - 1][1]) < 0.001) i1--;
  const dist = fr[fr.length - 1][1];
  const ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
  const tStart = fr[Math.max(0, i0 - 1)][0], tEnd = tStart + 6000;
  let stalls = 0, jumps = 0, back = 0, maxDev = 0, moving = 0;
  for (let i = Math.max(1, i0); i <= i1; i++) {
    const step = fr[i][1] - fr[i - 1][1];
    const p0 = Math.min(1, Math.max(0, (fr[i - 1][0] - tStart) / (tEnd - tStart))), p1 = Math.min(1, Math.max(0, (fr[i][0] - tStart) / (tEnd - tStart)));
    const ideal = dist * (ease(p1) - ease(p0));
    if (step < -0.01) back++;
    if (ideal > 0.4 && step < 0.05) stalls++;
    if (ideal > 0.4 && step > ideal * 2 + 0.5) jumps++;
    if (step > 0.01) moving++;
    maxDev = Math.max(maxDev, Math.abs(fr[i][1] - dist * ease(p1)));
  }
  const frames = i1 - Math.max(1, i0) + 1;
  const durSec = (fr[i1][0] - fr[Math.max(0, i0)][0]) / 1000;
  // slow at both ends, fastest in the middle (eased)
  const v = (a, b) => (fr[b][1] - fr[a][1]) / ((fr[b][0] - fr[a][0]) / 1000);
  const n = i1 - i0; const vStart = v(i0, i0 + Math.round(n * 0.08)), vMid = v(i0 + Math.round(n * 0.46), i0 + Math.round(n * 0.54)), vEnd = v(i1 - Math.round(n * 0.08), i1);
  return { dist: Math.round(dist), max: res.max, top: res.top, transform: res.transform, frames, moving, stalls, jumps, back, maxDev: +maxDev.toFixed(2), durSec: +durSec.toFixed(2), vStart: Math.round(vStart), vMid: Math.round(vMid), vEnd: Math.round(vEnd), startedAfter: +(fr[i0][0] / 1000).toFixed(2), posts: res.posts.filter((p) => p.startsWith('pwscroll:')) };
}

(async () => {
  const R = require('./lib/paywall-harness.js');
  const m = await measure(R);
  console.log(JSON.stringify(m));
  if (process.env.PW_SRC) { console.log('(measured ' + process.env.PW_SRC + ')'); process.exit(0); }
  check('it still waits about 5 s, then scrolls the whole list to its end, and ends as a REAL scroll position (no transform left)', m.startedAfter >= 4.8 && m.startedAfter <= 5.6 && Math.abs(m.top - m.max) <= 1 && m.max > 100 && (m.transform === 'none' || m.transform === 'matrix(1, 0, 0, 1, 0, 0)'), JSON.stringify(m));
  check('it takes about 6 s', m.durSec >= 5.6 && m.durSec <= 6.3, m.durSec);
  check('EVERY frame moves it (no frame where it stands still and then jumps): no stalls, no jumps, never backwards', m.stalls === 0 && m.jumps === 0 && m.back === 0, JSON.stringify({ stalls: m.stalls, jumps: m.jumps, back: m.back }));
  check('it follows the eased curve within 2.5 px all the way (the old timer stepping was 12.7 px off; the rest is this test guessing the first frame)', m.maxDev <= 2.5, m.maxDev);
  check('eased: slow at the start and the end, fastest in the middle', m.vStart < m.vMid * 0.35 && m.vEnd < m.vMid * 0.35, JSON.stringify({ vStart: m.vStart, vMid: m.vMid, vEnd: m.vEnd }));
  check('the page still reports what it does (the [PAYWALL] auto-scroll log lines)', m.posts.some((p) => /asked/.test(p)) && m.posts.some((p) => /scrolling/.test(p)) && m.posts.some((p) => /done/.test(p)), JSON.stringify(m.posts));
  // a touch in the middle of the glide stops it exactly where it is (no jump), as a real scroll position he can drag from
  {
    const { chromium } = require('playwright');
    const br = await chromium.launch();
    const pg = await (await br.newContext({ viewport: { width: 393, height: 793 }, deviceScaleFactor: 3 })).newPage();
    await pg.addInitScript('window.ReactNativeWebView={postMessage:function(){}};window.__dcFitBoth=1;window.__dcKeepFx=1;');
    await pg.addInitScript(R.CUE_ORB_JS); await pg.addInitScript(R.EARLY);
    await pg.goto('file://' + path.resolve(__dirname, '..', 'assets', 'app screens', 'paywallv2.html').split(path.sep).join('/'));
    await pg.waitForTimeout(1500); await pg.evaluate(R.DC); await pg.evaluate(R.TIDY); await pg.waitForTimeout(2500);
    await pg.evaluate('window.__pwAutoScroll()'); await pg.waitForTimeout(5000 + 2500);
    const t = await pg.evaluate(() => {
      const scr = document.querySelector('#dc-root [data-scroll]');
      const vis = () => { let off = 0; try { off = -new DOMMatrixReadOnly(getComputedStyle(scr.children[0]).transform).m42; } catch (e) {} return scr.scrollTop + off; };
      const before = vis(); scr.dispatchEvent(new Event('touchstart')); const after = vis();
      return { before, after, top: scr.scrollTop, transform: getComputedStyle(scr.children[0]).transform };
    });
    await pg.waitForTimeout(1500);
    const later = await pg.evaluate(() => document.querySelector('#dc-root [data-scroll]').scrollTop);
    await br.close();
    check('a touch in the middle stops it right where it is (no jump), as a real scroll position, and it stays there', t.before > 20 && Math.abs(t.after - t.before) <= 1.5 && (t.transform === 'none' || t.transform === 'matrix(1, 0, 0, 1, 0, 0)') && Math.abs(later - t.top) <= 1, JSON.stringify({ ...t, later }));
  }
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
