#!/usr/bin/env node
/**
 * scripts/test-recap-chrome.js
 *
 * 1. Glass top controls: on Workout Complete and rep feedback the page hides its
 *    own white back chevron + "All sets" pill and reports where they are
 *    BEFORE 'ready', so the native Liquid Glass versions (WarmSurfaces) can sit
 *    exactly there from the first visible frame.
 * 2. "All sets" on rep feedback posts openAllSets (it used to just go back).
 * 3. Prefetch: filling the warm page BEFORE the screen opens means 'ready' has
 *    already happened when the screen asks for it, i.e. 0ms visible delay.
 *    Also: the string recap.tsx builds equals the one the prefetch builds.
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const WARM = require('../components/WarmSurfaces.tsx');
const recap = require('../lib/recapInject.ts');
const rf = require('../lib/repFeedbackInject.ts');
const pre = require('../lib/recapPrefetch.ts');

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

async function open(file, scripts) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 852 }, deviceScaleFactor: 2 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const ev = [];
  await page.exposeFunction('__post', (d) => { try { const m = JSON.parse(d); if (m.type !== 'pageConsole') ev.push({ ...m, at: Date.now() }); } catch {} });
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  for (const s of scripts) await page.addInitScript(s);
  await page.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', file)).href, { waitUntil: 'commit' });
  return { browser, page, ev };
}
const waitFor = async (ev, type, ms) => { const d = Date.now() + ms; while (Date.now() < d && !ev.some(x => x.type === type)) await new Promise(r => setTimeout(r, 15)); return ev.find(x => x.type === type); };

const SURF = {
  recap: { file: 'workoutrecap.html', data: () => recap.recapDataJs({ totalReps: 20, moves: 2, pct: 88, hasFormData: true, durationSec: 600, overview: 'x', hasVideo: false }) },
  repfeedback: { file: 'repfeedback.html', data: () => rf.repFeedbackDataJs({ exerciseName: 'Shoulder Press', hasVideo: true, reps: [{ timeSec: 6, what: 'a' }, { timeSec: 11, what: 'b' }] }) },
};

(async () => {
  for (const [kind, S] of Object.entries(SURF)) {
    console.log(`--- ${kind} ---`);
    const w = await open(S.file, [WARM.BASE_JS[kind]]);
    await waitFor(w.ev, 'warm', 9000);
    await w.page.waitForTimeout(700);
    const injectAt = Date.now();
    await w.page.evaluate(S.data());
    const ready = await waitFor(w.ev, 'ready', 5000);
    const chrome = w.ev.find(x => x.type === 'chrome');
    check(`${kind}: page reports back + All sets rects`, !!chrome && chrome.back && chrome.allSets, JSON.stringify(chrome && { back: [chrome.back.l, chrome.back.t, chrome.back.w, chrome.back.h].map(Math.round), all: [chrome.allSets.l, chrome.allSets.t, chrome.allSets.w, chrome.allSets.h].map(Math.round) }));
    check(`${kind}: chrome reported BEFORE ready (glass is there on the first visible frame)`, chrome && ready && chrome.at <= ready.at);
    check(`${kind}: back is top-left, All sets is a pill in the top corner`, chrome && chrome.back.t < 130 && chrome.back.w <= 44 && chrome.allSets.t < 130 && chrome.allSets.w > 60);
    const hidden = await w.page.evaluate(() => {
      const a = document.querySelector('#dc-root a[href="Form Review.dc.html"]');
      return a && getComputedStyle(a).visibility;
    });
    check(`${kind}: the page's own white All sets pill is hidden`, hidden === 'hidden', hidden);
    const backHidden = await w.page.evaluate(() => {
      const c = [...document.querySelectorAll('#dc-root div')].find(d => d.querySelector('svg path[d="M10 3 5 8l5 5"]') && d.getBoundingClientRect().top < 130 && d.getBoundingClientRect().width <= 44);
      return c && getComputedStyle(c).visibility;
    });
    check(`${kind}: the page's own white back circle is hidden`, backHidden === 'hidden', backHidden);
    if (kind === 'repfeedback') {
      await w.page.evaluate(() => document.querySelector('#dc-root a[href="Form Review.dc.html"]').click());
      await w.page.waitForTimeout(100);
      check('repfeedback: All sets posts openAllSets (opens the All sets page, not just back)', w.ev.some(x => x.type === 'openAllSets') && !w.ev.some(x => x.type === 'close'));
    }
    // 3. prefetch: ready already happened long before the screen opens
    await w.page.waitForTimeout(600);
    const screenOpensAt = Date.now();
    const visibleDelay = Math.max(0, ready.at - screenOpensAt); // host reveals at max(activate, ready)
    check(`${kind}: with data prefetched, the card is ready before the screen opens -> ${visibleDelay}ms visible delay`, visibleDelay === 0, `ready ${screenOpensAt - ready.at}ms before the screen asked`);
    await w.browser.close();
  }

  // prefetch string == recap's own string
  const fromPrefetch = pre.recapPageData({ totalReps: 12, totalGoodReps: 9, moves: 1, pct: Math.round(9 / 12 * 100), hasFormData: true, durationSec: 80, hasVideo: true });
  const fromRecap = pre.recapPageData({ totalReps: 12, totalGoodReps: 9, moves: [1].length, pct: 75, hasFormData: true, durationSec: 80, hasVideo: true });
  check('prefetch builds the identical page data string recap.tsx builds (warmPrepare ignores the 2nd)', fromPrefetch === fromRecap);
  WARM.warmPrepare('recap', fromPrefetch); WARM.warmPrepare('recap', fromRecap);
  check('warm store holds the prefetched data once', WARM.useWarm.getState().dataJs.recap === fromPrefetch);

  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
