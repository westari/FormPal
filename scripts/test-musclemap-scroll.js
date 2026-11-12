#!/usr/bin/env node
/**
 * scripts/test-musclemap-scroll.js
 * Scrolling the Progress "Muscle Map" page: the looping Cue orb animations (15 of them on the page) are PAUSED while a finger scrolls
 * and run again shortly after it stops, so nothing repaints under the scrolling page. Real progress.html + the shipped injection, a
 * real touch scroll gesture. (Frame-by-frame smoothness itself can only be felt on the phone; scripts/bench-musclemap-scroll.js
 * prints frame times in Chromium for reference.)
 */
const { openProgress, makeData } = require('./lib/progress-harness.js');
const { Muscle } = require('../constants/exercises.ts');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
(async () => {
  const tiers = {};
  Object.values(Muscle).forEach((m, i) => { tiers[m] = { tier: ['bronze', 'silver', 'gold'][i % 3], peakTier: 'bronze', volume: 50, goodRatio: 0.8 }; });
  const { browser, page: p } = await openProgress(makeData({ tiers }));
  const c = await p.context().newCDPSession(p);
  const running = () => p.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
  const flag = () => p.evaluate(() => document.documentElement.hasAttribute('data-scrolling'));
  await p.evaluate(() => { document.querySelector('#dc-root a[style*="padding: 18px 18px 14px"]').click(); });
  await p.waitForTimeout(1500);
  const rest = await running();
  check('at rest the orbs animate (looping animations are running)', rest >= 5, rest + ' running');
  check('at rest the page is not marked as scrolling', !(await flag()));
  // a real scroll (wheel steps over the page); sample while it is still going
  await p.mouse.move(195, 500);
  let mid = -1, midFlag = false;
  for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, 70); await p.waitForTimeout(25); if (i === 6) { mid = await running(); midFlag = await flag(); } }
  check('while the page scrolls it is marked scrolling', midFlag);
  check('...and no looping animation runs under it', mid === 0, mid + ' running');
  const moved = await p.evaluate(() => Math.max(...[...document.querySelectorAll('#dc-root div[data-scroll]')].map((e) => e.scrollTop)));
  check('the page really scrolled (the wheel moved content)', moved > 50, moved + 'px');
  await p.waitForTimeout(500);
  const after = await running();
  check('after the finger stops the page is no longer marked scrolling', !(await flag()));
  check('...and the orbs animate again', after >= 5, after + ' running');
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
