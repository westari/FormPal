#!/usr/bin/env node
/**
 * scripts/bench-musclemap-scroll.js
 * Opens the Progress "Muscle Map" page (real progress.html + the exact shipped injection, real tier data), slows the CPU 4x, and
 * scrolls it with real touch-style wheel steps while recording every animation frame. Prints the slowest frame and how many frames
 * took over 34ms (a dropped frame at 30fps on a 4x slower CPU). MAP=outlined swaps in the old busy drawing to compare.
 */
const path = require('path');
const { openProgress, makeData } = require('./lib/progress-harness.js');
const { Muscle } = require('../constants/exercises.ts');

(async () => {
  const mk = (tier) => ({ tier, peakTier: tier, volume: 50, goodRatio: 0.8 });
  const tiers = {};
  const all = Object.values(Muscle);
  all.forEach((m, i) => { tiers[m] = mk(['bronze', 'silver', 'gold', 'platinum', 'diamond'][i % 5]); });
  const data = makeData({ tiers });
  if (process.env.MAP === 'outlined') {
    const { progressBodyMapSvg } = require('../lib/progressBodyMap.ts');
    data.bodyMap = { front: progressBodyMapSvg(tiers, 'front'), back: progressBodyMapSvg(tiers, 'back') };
  }
  const { browser, page: p } = await openProgress(data);
  const c = await p.context().newCDPSession(p); await c.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await p.evaluate(() => { document.querySelector('#dc-root a[style*="padding: 18px 18px 14px"]').click(); });
  await p.waitForTimeout(1500);
  const scrollers = await p.evaluate(() => [...document.querySelectorAll('#dc-root div[data-scroll]')].map((e) => ({ h: e.scrollHeight, c: e.clientHeight, top: e.getBoundingClientRect().top, op: getComputedStyle(e).overflowY })));
  console.log('scrollers', JSON.stringify(scrollers));
  await p.evaluate(() => { window.__gaps = []; window.__g = true; let last = performance.now(); (function l() { const n = performance.now(); window.__gaps.push(Math.round(n - last)); last = n; if (window.__g) requestAnimationFrame(l); })(); });
  for (let i = 0; i < 3; i++) {
    await c.send('Input.synthesizeScrollGesture', { x: 195, y: 650, yDistance: -500, speed: 900, gestureSourceType: 'touch' });
    await c.send('Input.synthesizeScrollGesture', { x: 195, y: 250, yDistance: 500, speed: 900, gestureSourceType: 'touch' });
  }
  const gaps = await p.evaluate(() => { window.__g = false; return window.__gaps; });
  const g = gaps.slice(3);
  const sorted = [...g].sort((a, b) => a - b);
  console.log(`frames ${g.length} | slowest ${Math.max(...g)}ms | median ${sorted[Math.floor(g.length / 2)]}ms | over 34ms: ${g.filter((x) => x > 34).length} | over 100ms: ${g.filter((x) => x > 100).length}`);
  const moved = await p.evaluate(() => Math.max(...[...document.querySelectorAll('#dc-root div[data-scroll]')].map((e) => e.scrollTop)));
  console.log('scrolled at most', moved, 'px');
  await browser.close();
  process.exit(0);
})();
