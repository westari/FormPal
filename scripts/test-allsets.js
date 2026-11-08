#!/usr/bin/env node
/**
 * scripts/test-allsets.js
 *
 * The All sets page, in headless Chromium against the REAL design file with
 * the shipped scaffold + data (components/WarmSurfaces BASE_JS + lib/allSetsInject).
 *
 *   REPRODUCES the reported bug with the old code path (the bare design file):
 *   tapping a tile does window.location.href = "Workout Recap v2.dc.html?set=N"
 *   -> the page navigates away to a page that doesn't exist (the stuck "root"
 *   screen). Then proves the fix: every tappable thing either does a real
 *   action or nothing, the page never navigates, Recap/Done post closeAllSets.
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const WARM = require('../components/WarmSurfaces.tsx');
const { allSetsDataJs, setTilesFor } = require('../lib/allSetsInject.ts');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const FILE = pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'allsetsfullworkout.html')).href;

async function open(scripts) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 852 }, deviceScaleFactor: 2 });
  const ev = [];
  await page.exposeFunction('__post', (d) => { try { const m = JSON.parse(d); if (m.type !== 'pageConsole') ev.push({ ...m, at: Date.now() }); } catch {} });
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  for (const s of scripts) await page.addInitScript(s);
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  return { browser, page, ev };
}
const tileTexts = (page) => page.evaluate(() => [...document.querySelectorAll('#dc-root div[style*="grid-template-columns"] > div')].map(d => d.innerText.replace(/\s+/g, ' ').trim()));
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  // ── reproduce: the bare design file ─────────────────────────────────────────
  {
    const { browser, page } = await open([]);
    const before = page.url();
    await page.evaluate(() => document.querySelector('#dc-root div[style*="grid-template-columns"] > div').click()).catch(() => {});
    await page.waitForTimeout(800);
    const after = page.url();
    check('REPRODUCED: in the unpatched design, tapping a tile navigates the page away (the stuck screen)', after !== before, after.split('/').pop());
    await browser.close();
  }

  // ── reproduce: the page the phone ran (commit 1ab290c) tore the design's own tiles out of the DOM ──
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oldallsets-'));
    fs.writeFileSync(path.join(dir, 'oldRecapInject.ts'), execSync('git show 1ab290c:lib/recapInject.ts', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8'));
    const old = require(path.join(dir, 'oldRecapInject.ts'));
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 852 } });
    const errs = [];
    page.on('console', (m) => { if (/render error/.test(m.text())) errs.push(m.text().slice(0, 120)); });
    page.on('pageerror', (e) => errs.push('pageerror ' + e.message.slice(0, 100)));
    await page.exposeFunction('__post', () => {});
    await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
    await page.goto(FILE, { waitUntil: 'load' });
    await page.waitForTimeout(1800);
    await page.evaluate(old.allSetsInject({ tiles: [{ title: 'Shoulder Press', meta: '6 reps' }], videoTileIndex: 0 }));
    await page.waitForTimeout(800);
    const before = errs.length;
    await page.evaluate(() => [...document.querySelectorAll('#dc-root div')].find(d => /^Squats$/.test(d.innerText.trim()) && d.style.borderRadius === '999px').click());
    await page.waitForTimeout(600);
    const blank = await page.evaluate(() => document.getElementById('dc-root').innerText.trim().length);
    check('REPRODUCED: with the page the phone ran, tapping the Squats chip throws "[dc-runtime] render error in <Root>"', errs.length > before, errs[errs.length - 1] || 'no error');
    console.log(`      (page text left after the error: ${blank} chars)`);
    await browser.close();
  }

  // ── fix ──────────────────────────────────────────────────────────────────────
  const payload = {
    tiles: [
      { title: 'Shoulder Press', ex: 'Shoulder Press', meta: '6 reps · 50% form', hasVideo: true },
      { title: 'Lateral Raise', ex: 'Lateral Raise', meta: '10 reps · 80% form', hasVideo: false },
    ],
    videoIdx: 0,
  };
  const { browser, page, ev } = await open([WARM.BASE_JS.allsets]);
  const renderErrors = [];
  page.on('console', (m) => { if (/render error|dc-runtime/i.test(m.text()) && m.type() === 'error') renderErrors.push(m.text().slice(0, 120)); });
  page.on('pageerror', (e) => renderErrors.push('pageerror ' + e.message.slice(0, 100)));
  await page.evaluate(allSetsDataJs(payload));
  await page.waitForTimeout(900);
  const url0 = page.url();
  check('scaffold + data -> page posts ready', ev.some(e => e.type === 'ready'));
  const t = await tileTexts(page);
  check('tiles are the REAL exercises (no Squats / Push-ups / Rows / Lunges)', t.length === 2 && /Shoulder Press/.test(t[0]) && /Lateral Raise/.test(t[1]) && !t.some(x => /Squats|Push-ups|Rows|Lunges/.test(x)), JSON.stringify(t));
  check('video tile reports its rect for the native frame', ev.some(e => e.type === 'tileRect' && !e.none && e.w > 100 && e.vb > e.vt));
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('#dc-root [data-screen-label]')).backgroundColor);
  check('page is transparent (white base + video frame are drawn natively underneath)', bg === 'rgba(0, 0, 0, 0)', bg);

  // no play icon on the tiles
  const plays = await page.evaluate(() => [...document.querySelectorAll('#dc-root svg path[d="M7 4.6v14.8L19 12z"]')].map(p => { const c = p.ownerSVGElement.parentElement; const r = c.getBoundingClientRect(); return getComputedStyle(c).display + ':' + r.width; }));
  check('the play icon is gone from every tile', plays.length > 0 && plays.every(v => v.startsWith('none')), plays.join());
  await page.screenshot({ path: path.join(ROOT, '.scratch', 'allsets-noplay.png') });

  // The tile's rect is posted once, while the page is still hidden and no screen has claimed it yet. It used to be
  // dropped (no handler), so the thumbnail only appeared after a tap changed the layout. Now it is kept and replayed.
  {
    const tile = ev.find(e => e.type === 'tileRect' && !e.none);
    const got = [];
    WARM.noteWarmMessage('allsets', tile);                 // what the host does when the page posts it
    WARM.warmActivate('allsets', { onMessage: (m) => got.push(m) }); // the screen opens All sets afterwards
    await wait(30);
    check('the video tile rect posted before the screen asked for the page reaches the screen (thumbnail shows at once)', got.some(m => m.type === 'tileRect' && m.w === tile.w), JSON.stringify(got.map(g => g.type)));
    WARM.warmRelease('allsets');
  }

  // tap everything tappable
  await page.evaluate(() => document.querySelectorAll('#dc-root div[style*="grid-template-columns"] > div')[0].click());
  check('tapping the video tile opens its rep feedback (openSet)', ev.some(e => e.type === 'openSet' && e.index === 0));
  const nBefore = ev.filter(e => e.type === 'openSet').length;
  await page.evaluate(() => document.querySelectorAll('#dc-root div[style*="grid-template-columns"] > div')[1].click());
  check('tapping a tile with no video does nothing (it is not a button)', ev.filter(e => e.type === 'openSet').length === nBefore);
  // chips filter
  await page.evaluate(() => [...document.querySelectorAll('#dc-root div[style*="border-radius: 999px"]')].find(d => d.innerText.trim() === 'Lateral Raise').click());
  await page.waitForTimeout(150);
  const filtered = await tileTexts(page);
  check('filter chip filters the real tiles', filtered.length === 1 && /Lateral Raise/.test(filtered[0]), JSON.stringify(filtered));
  await page.evaluate(() => [...document.querySelectorAll('#dc-root div[style*="border-radius: 999px"]')].find(d => d.innerText.trim() === 'All').click());
  await page.waitForTimeout(150);
  // bookmark -> Saved filter
  await page.evaluate(() => document.querySelectorAll('#dc-root div[style*="grid-template-columns"] > div')[0].querySelector('div').click());
  await page.waitForTimeout(100);
  await page.evaluate(() => document.querySelector('#dc-root div[sc-camel-on-click], #dc-root div[style*="width: 52px"]').click());
  await page.waitForTimeout(150);
  const saved = await tileTexts(page);
  check('bookmark saves a tile and the Saved filter shows just it', saved.length === 1 && /Shoulder Press/.test(saved[0]), JSON.stringify(saved));
  // hidden dead controls
  const hidden = await page.evaluate(() => [...document.querySelectorAll('#dc-root svg')].filter(s => s.querySelector('path[d="M10.7 10.7 14 14"]') || s.querySelector('path[d^="M5 6.4h6"]')).map(s => getComputedStyle(s.parentElement).visibility));
  check('search + sort (no real function) are hidden', hidden.length === 2 && hidden.every(v => v === 'hidden'), hidden.join());
  // links
  await page.evaluate(() => [...document.querySelectorAll('#dc-root a')].forEach(a => a.click()));
  const closes = ev.filter(e => e.type === 'closeAllSets').length;
  check('Recap and Done both post closeAllSets (back always works)', closes === 2, `${closes}`);
  check('ZERO render errors through every tap above (the old page threw one on the Squats chip)', renderErrors.length === 0, renderErrors.join(' | '));
  await page.evaluate(() => console.error('[dc-runtime] render error in <Root>: boom'));
  await page.waitForTimeout(150);
  check('a page render error is reported to the app (so it can show its native close button)', ev.some(e => e.type === 'pageError'));
  check('the page never navigated away during any of that', page.url() === url0, page.url().split('/').pop());
  await page.screenshot({ path: path.join(ROOT, '.scratch', 'allsets-fixed.png') });
  await browser.close();
  // A set with ZERO counted reps used to show an empty page (no entry is saved, so there were no tiles). It still shows
  // that set, with its video.
  {
    const payload0 = setTilesFor([], true, 'Shoulder Press');
    check('zero reps + a recording -> one tile named after the exercise, carrying the video', payload0.tiles.length === 1 && payload0.tiles[0].hasVideo && payload0.tiles[0].meta === '0 reps' && payload0.videoIdx === 0, JSON.stringify(payload0));
    check('no recording and no reps -> no tiles (nothing to show)', setTilesFor([], false, 'x').tiles.length === 0 && setTilesFor([], false, 'x').videoIdx === null);
    check('with reps the tiles are unchanged (first one keeps the video)', (() => { const p = setTilesFor([{ displayName: 'A', reps: 10, goodReps: 8 }, { displayName: 'B', reps: 5, goodReps: 5 }], true, 'x'); return p.tiles.length === 2 && p.tiles[0].hasVideo && !p.tiles[1].hasVideo && p.tiles[0].meta === '10 reps · 80% form'; })());
    const z = await open([WARM.BASE_JS.allsets]);
    await z.page.evaluate(allSetsDataJs(payload0));
    await z.page.waitForTimeout(900);
    const tz = await tileTexts(z.page);
    check('the real page shows that set (it used to be empty)', tz.length === 1 && /Shoulder Press/.test(tz[0]) && /0 reps/.test(tz[0]), JSON.stringify(tz));
    check('its video tile reports a rect (so the real frame is drawn) and tapping it opens the rep feedback', z.ev.some(e => e.type === 'tileRect' && !e.none && e.w > 100) && await (async () => { await z.page.evaluate(() => document.querySelectorAll('#dc-root div[style*="grid-template-columns"] > div')[0].click()); return z.ev.some(e => e.type === 'openSet' && e.index === 0); })());
    await z.page.screenshot({ path: path.join(ROOT, '.scratch', 'allsets-zero-reps.png') });
    await z.browser.close();
  }
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
