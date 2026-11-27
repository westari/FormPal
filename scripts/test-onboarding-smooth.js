#!/usr/bin/env node
/**
 * scripts/test-onboarding-smooth.js  (Ari 2026-11-27: "the rank wheel, 'building your plan' and the goal graph are much laggier than before. Find what changed and
 * make them as smooth as they used to be. Measure before and after.")
 *
 * MEASURED in Chromium with the CPU slowed 6x (like a phone), with the exact scripts the app injects (scripts/lib/onb-perf.js):
 *   1. The scripts the app injects into "building your plan" and the plan page (fit, polish, header, scroll reporting, the Cue orb rule) cost nothing measurable:
 *      the page with NO injected script and the page with all of them use the same time. So they are not what got slower.
 *   2. What runs AT THE SAME TIME: while "building your plan" animated, the app also loaded the plan page, the trial reminder AND the paywall (the two heaviest pages:
 *      blur effects and masks kept on since 2026-11-22/25, the breathing orb unfrozen on 2026-11-25, a 46 s carousel), and the hidden pages kept animating behind the
 *      goal graph. Measured below: how much CPU a hidden paywall / trial reminder burns every 6 s, animating vs paused.
 *   3. The rank wheel (native): the shields got a picture-shaped shadow on 2026-11-27 (RankShield) and the wheel moved every shield from the JS thread on every frame.
 * Fixes: trial + paywall load only after the goal graph has drawn (or when he leaves the plan page); a page that is not on screen pauses its animations; the wheel's
 * motion runs on the UI thread; the shield shadow is drawn once (rasterized). (1) and (2) are measured here; (3) is native: only the phone can show it.
 */
const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const { measure } = require('./lib/onb-perf.js');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split('\r\n').join('\n');

async function hiddenCost(br, file, keepFx, paused, R) {
  const ctx = await br.newContext({ viewport: { width: 393, height: 793 }, deviceScaleFactor: 3 });
  const pg = await ctx.newPage(); const cdp = await ctx.newCDPSession(pg);
  await cdp.send('Performance.enable'); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await pg.addInitScript('window.ReactNativeWebView={postMessage:function(){}};window.__dcFitBoth=1;' + (keepFx ? 'window.__dcKeepFx=1;' : ''));
  await pg.addInitScript(R.CUE_ORB_JS); if (file === 'paywallv2') await pg.addInitScript(R.EARLY);
  await pg.goto('file://' + path.resolve(__dirname, '..', 'assets', 'app screens', file + '.html').split(path.sep).join('/'));
  await pg.waitForTimeout(1500); await pg.evaluate(R.DC); await pg.evaluate(file === 'paywallv2' ? R.TIDY : R.TRIAL); await pg.waitForTimeout(2500);
  await pg.evaluate(R.PAUSE); if (paused) await pg.evaluate('window.__onbPause(true)');
  await pg.waitForTimeout(300);
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  await pg.waitForTimeout(6000);
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  const running = await pg.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
  await ctx.close();
  return { task: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000), recalc: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000), running };
}

(async () => {
  const br = await chromium.launch();
  console.log('--- 1. the injected scripts on "building your plan" and the goal graph (6 s, CPU 6x slower) ---');
  for (const page of ['generatePlan', 'planReady']) {
    const none = await measure(br, page, { only: [], cueOrb: false }), all = await measure(br, page, {});
    console.log(`  ${page}: page alone ${none.task} ms busy (script ${none.script}), with every injected script ${all.task} ms (script ${all.script}); janky frames ${none.janky} / ${all.janky}`);
    check(`${page}: the app's injected scripts add no real cost (within 25% of the page alone, no janky frames)`, all.task <= none.task * 1.25 && all.janky <= none.janky + 1, JSON.stringify({ none, all }));
  }
  console.log('--- 2. a page loaded but NOT on screen (the pool) ---');
  const R = require('./lib/paywall-harness.js');
  for (const [file, fx] of [['paywallv2', true], ['trialreminder', true]]) {
    const run = await hiddenCost(br, file, fx, false, R), stop = await hiddenCost(br, file, fx, true, R);
    console.log(`  hidden ${file}: animating ${run.task} ms busy every 6 s (${run.running} animations running); paused ${stop.task} ms (${stop.running} running)`);
    if (run.running > 0) check(`hidden ${file}: paused, it stops all its animations and uses far less of the phone (under half)`, stop.running === 0 && stop.task < run.task * 0.5, JSON.stringify({ run, stop }));
    else check(`hidden ${file}: it has no running animations once settled (nothing to pause), and paused stays at 0`, stop.running === 0, JSON.stringify({ run, stop }));
  }
  await br.close();
  console.log('--- the app ---');
  const ob = read('app/onboarding.tsx');
  check('"building your plan" loads only the plan page: the trial reminder and the paywall load after the goal graph has drawn (4.5 s) or when he leaves the plan page',
    ob.includes("POOL_ORDER.filter((key) => key === 'planReady' || lateMounted)") && ob.includes('const LATE_POOL_MS = 4500;') && ob.includes("if (activeKey === null && sawPlanReady.current) setLateMounted(true);"));
  check('a pool page that is not on screen pauses its animations, and resumes when it comes on screen', ob.includes("window.__onbPause && window.__onbPause(' + (poolActive ? 'false' : 'true') + ')") && ob.includes("(inPool ? ONB_PAUSE_JS : '')"));
  check('no page reports its scroll to the app any more (a message on every scrolled frame)', !/ONB_SCROLL_REPORT_JS : ONB_SCROLL_REPORT_JS|\+ ONB_SCROLL_REPORT_JS/.test(ob) && !ob.includes("m.indexOf('onbscroll:')"));
  const rw = read('components/onboarding/RankWheelScreen.tsx'), rs = read('components/onboarding/RankShield.tsx');
  check('rank wheel: the shields move on the UI thread (native driver), the shadow is drawn once (rasterized)', rw.includes("onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true, listener: onScrollFrame as any })}") && rs.includes('shouldRasterizeIOS={shadow}'));
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
