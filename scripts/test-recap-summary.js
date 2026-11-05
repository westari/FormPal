#!/usr/bin/env node
/**
 * scripts/test-recap-summary.js
 * Workout complete card, "Overview" text: short, and stretched across most of the card width (no early wrapping).
 * Real workoutrecap.html + the real injection (WarmSurfaces base + recapPageData). Screenshots: .scratch/recap-summary-<case>.png
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const WARM = require('../components/WarmSurfaces.tsx');
const pre = require('../lib/recapPrefetch.ts');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

const CASES = {
  'good (9 of 12)': { reps: 12, good: 9, form: true },
  'great (11 of 12)': { reps: 12, good: 11, form: true },
  'perfect': { reps: 10, good: 10, form: true },
  'rough (4 of 10)': { reps: 10, good: 4, form: true },
  'rep counter only': { reps: 14, good: 0, form: false },
};

async function open(c) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const ev = [];
  await page.exposeFunction('__post', (d) => { try { ev.push(JSON.parse(d)); } catch {} });
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  await page.addInitScript(WARM.BASE_JS.recap);
  await page.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'workoutrecap.html')).href, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  await page.evaluate(pre.recapPageData({ totalReps: c.reps, totalGoodReps: c.good, moves: 1, pct: c.reps ? Math.round(c.good / c.reps * 100) : 0, hasFormData: c.form, durationSec: 80, hasVideo: false }));
  await page.waitForTimeout(900);
  return { browser, page };
}

(async () => {
  for (const [name, c] of Object.entries(CASES)) {
    const { browser, page } = await open(c);
    const m = await page.evaluate(() => {
      const el = document.querySelector('#dc-root div[style*="font-size: 17px"][style*="line-height: 1.48"], #dc-root div[style*="line-height: 1.48"]');
      if (!el) return null;
      const cs = getComputedStyle(el), box = el.getBoundingClientRect();
      const avail = box.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      // per word boxes via a Range per word, grouped into lines
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let tn = tw.nextNode(); while (tn && !tn.nodeValue.trim()) tn = tw.nextNode();
      const words = []; const re = /\S+/g; let mm;
      while ((mm = re.exec(tn.nodeValue))) { const r = document.createRange(); r.setStart(tn, mm.index); r.setEnd(tn, mm.index + mm[0].length); const q = r.getBoundingClientRect(); words.push({ t: Math.round(q.top), l: q.left, r: q.right, w: q.width }); }
      const byLine = []; words.forEach((w) => { let ln = byLine.find((x) => x.t === w.t); if (!ln) { ln = { t: w.t, l: 1e9, r: -1e9, first: w }; byLine.push(ln); } ln.l = Math.min(ln.l, w.l); ln.r = Math.max(ln.r, w.r); });
      byLine.sort((a, b) => a.t - b.t);
      const ls = byLine.map((x) => x.r - x.l);
      // a line is "cut short" only if the first word of the NEXT line would still have fitted on it
      const cutShort = byLine.slice(0, -1).filter((x, i) => (x.r - x.l) + 5 + byLine[i + 1].first.w <= avail).length;
      return { text: el.textContent, avail, lines: ls, cutShort, wrap: cs.textWrap || cs.textWrapMode, padL: cs.paddingLeft, cardW: el.closest('div[style*="border-radius"]').getBoundingClientRect().width };
    });
    if (!m) { check(`${name}: overview found`, false); await browser.close(); continue; }
    const words = m.text.trim().split(/\s+/).length;
    const fullLines = m.lines.slice(0, -1);
    const worstFill = fullLines.length ? Math.min(...fullLines) / m.avail : 1;
    console.log(`      "${m.text}"  (${words} words, ${m.lines.length} lines, widest ${Math.round(Math.max(...m.lines))}px of ${Math.round(m.avail)}px)`);
    check(`${name}: short (at most 16 words)`, words <= 16, `${words} words`);
    check(`${name}: no early wrap - every line is as full as the words allow (the next word would not fit), and none is under 80%`, m.cutShort === 0 && worstFill >= 0.8, `${m.cutShort} lines cut short, worst line ${(worstFill * 100).toFixed(0)}% of ${Math.round(m.avail)}px`);
    check(`${name}: text spans most of the card (text width >= 90% of card width)`, m.avail / m.cardW >= 0.9, `${Math.round(m.avail)} of ${Math.round(m.cardW)}px`);
    await page.screenshot({ path: path.join(ROOT, '.scratch', `recap-summary-${name.replace(/[^a-z0-9]+/gi, '-')}.png`) });
    await browser.close();
  }
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
