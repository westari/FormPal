#!/usr/bin/env node
/**
 * scripts/test-streak.js
 * The streak page (opened from the Train flame): the number, the words and the week row all come from the REAL streak.
 * Unit: lib/streakInfo.ts on made-up sessions. Page: real streak.html + the real injection, screenshot .scratch/streak-after.png
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const H = require('../lib/dcWebviewHelpers.ts');
const { streakInfo, streakPageJs } = require('../lib/streakInfo.ts');
const ROOT = path.join(__dirname, '..');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const DAY = 86400000;
// a Wednesday at noon, so Mon/Tue are before it and Thu..Sun after
const now = new Date(2026, 10, 11, 12).getTime(); // 2026-11-11 is a Wednesday
const at = (daysAgo) => ({ ts: now - daysAgo * DAY, displayName: 'x', reps: 5, goodReps: 5, sets: 1 });

const two = streakInfo([at(0), at(1)], now);
check('2-day streak, trained today: count 2, "Day 2 streak!", no "starts today" line', two.count === 2 && two.headline === 'Day 2 streak!' && !/starts today/i.test(two.sub), JSON.stringify(two));
check('...and Tue + Wed (yesterday + today) are the orange days in the week row', JSON.stringify(two.week) === JSON.stringify([false, true, true, false, false, false, false]) && two.todayIdx === 2, JSON.stringify(two.week));
const one = streakInfo([at(0)], now);
check('1-day streak today: "Day 1 streak!" and it says the streak started today', one.count === 1 && one.headline === 'Day 1 streak!' && /started your streak today/.test(one.sub));
const alive = streakInfo([at(1), at(2)], now);
check('streak alive through yesterday, nothing today yet: 2 days, asks to train today, Mon + Tue orange', alive.count === 2 && !alive.trainedToday && /Train today/.test(alive.sub) && JSON.stringify(alive.week) === JSON.stringify([true, true, false, false, false, false, false]), JSON.stringify(alive));
const none = streakInfo([at(5)], now);
check('no streak: 0, "No streak yet"', none.count === 0 && none.headline === 'No streak yet' && none.week.every(x => !x));
const fresh = streakInfo([], now, 3);
check('the workout flow\'s own count wins if the session is not on disk yet (3, today done)', fresh.count === 3 && fresh.trainedToday && fresh.headline === 'Day 3 streak!');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage() {} }; });
  await page.addInitScript(H.DC_VIEWPORT_JS + H.DC_NO_ZOOM_JS);
  await page.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'streak.html')).href, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ROOT, '.scratch', 'streak-before.png') });
  await page.evaluate(H.dcScaleFitJs('#ffffff') + streakPageJs(two));
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const t = (sel) => (document.querySelector('#dc-root ' + sel) || {}).textContent;
    const cs = [...document.querySelectorAll('#dc-root div[style*="width: 30px"][style*="height: 30px"]')].filter(c => !c.closest('[data-sk-star]') && !c.hasAttribute('data-sk-star'));
    return {
      head: t('div[style*="font-size: 29px"]'), sub: t('div[style*="font-size: 16px"]'),
      days: cs.map(c => ({ on: c.getAttribute('data-streak-day'), bg: getComputedStyle(c).backgroundImage.slice(0, 22), check: !!c.querySelector('svg'), w: Math.round(c.getBoundingClientRect().width) })),
    };
  });
  console.log('      page:', JSON.stringify(r));
  await page.screenshot({ path: path.join(ROOT, '.scratch', 'streak-after.png') });
  const fl = await page.evaluate(() => { const ms = [...document.querySelectorAll('#dc-root div[style*="mask"]')]; const n = document.querySelector('#dc-root div[style*="font-size: 54px"]'); return { svgs: ms.filter(m => m.querySelector('svg path')).length, masksLeft: ms.filter(m => getComputedStyle(m).webkitMaskImage && getComputedStyle(m).webkitMaskImage !== 'none').length, numShown: n ? getComputedStyle(n).display !== 'none' : false, applied: !!window.__streakApplied }; });
  check('the flame is a vector (two SVG paths, no PNG mask left), the design\'s own sticker number is hidden; the page is fully applied the moment it is revealed', fl.svgs === 2 && fl.masksLeft === 0 && !fl.numShown && fl.applied, JSON.stringify(fl));
  // 5 + 6: the flame is alive, and the number sits inside it
  const live = await page.evaluate(async () => {
    const out = document.querySelector('[data-vector-flame="out"]'), inn = document.querySelector('[data-vector-flame="in"]'), n = document.querySelector('[data-streak-num]');
    const tf = () => [getComputedStyle(out).transform, getComputedStyle(inn).transform];
    const a = tf(); await new Promise(r => setTimeout(r, 700)); const b = tf(); await new Promise(r => setTimeout(r, 700)); const c = tf();
    const ri = inn.getBoundingClientRect(), tr = document.createRange(); tr.selectNodeContents(n); const rn = tr.getBoundingClientRect();
    return { a, b, c, anim: [getComputedStyle(out).animationName, getComputedStyle(inn).animationName], iter: getComputedStyle(out).animationIterationCount,
      num: n.textContent, inside: n.parentElement === inn, ncolor: getComputedStyle(n).color,
      within: rn.left >= ri.left - 1 && rn.right <= ri.right + 1 && rn.top >= ri.top && rn.bottom <= ri.bottom, fits: rn.width < ri.width * 0.8 };
  });
  const still = await page.evaluate(async () => {
    const out = document.querySelector('[data-vector-flame="out"]'), inn = document.querySelector('[data-vector-flame="in"]');
    const tf = () => [getComputedStyle(out).transform, getComputedStyle(inn).transform, getComputedStyle(out).animationName, getComputedStyle(inn).animationName, getComputedStyle(out).filter];
    const a = tf(); await new Promise(r => setTimeout(r, 900)); const b = tf();
    return { same: JSON.stringify(a) === JSON.stringify(b), names: a.slice(2, 4), filter: a[4] };
  });
  check('4: the fire has only a very slight, gentle animation (sway under 2.5% / 1 degree, slow 3 to 5s cycles) on both flames', still.names.join() === 'sk-live-out,sk-live-in' && !still.same, JSON.stringify(still));
  const sway = await page.evaluate(async () => { const out = document.querySelector('[data-vector-flame="out"]'); let lo = 9, hi = 0, sk = 0; for (let k = 0; k < 24; k++) { const m = getComputedStyle(out).transform.match(/matrix\(([^)]+)\)/); if (m) { const v = m[1].split(',').map(Number); lo = Math.min(lo, v[3]); hi = Math.max(hi, v[3]); sk = Math.max(sk, Math.abs(v[2])); } await new Promise((r) => setTimeout(r, 250)); } return { lo, hi, sk, dur: getComputedStyle(out).animationDuration }; });
  check('4: ...measured over 6 seconds the outer flame never changes size by more than 2.5%', sway.hi - sway.lo > 0.003 && sway.hi <= 1.025 && sway.sk < 0.02, JSON.stringify(sway));
  // the stars: ~14, each with its own timing, all outside the flame, each fading in and out forever
  const stars = await page.evaluate(async () => {
    const els = [...document.querySelectorAll('[data-sk-star]')];
    const cs = els.map((e) => getComputedStyle(e));
    const box = document.querySelector('[data-sk-stars]').parentElement.getBoundingClientRect(), S = window.__dcCanvasScale || 1;
    const centre = (e) => { const r = e.getBoundingClientRect(); return [(r.left + r.width / 2 - box.left) / S, (r.top + r.height / 2 - box.top) / S]; };
    const ops = []; for (let k = 0; k < 6; k++) { ops.push(els.map((e) => +getComputedStyle(e).opacity)); await new Promise((r) => setTimeout(r, 450)); }
    const before = els.map((e) => e.style.left + '|' + e.style.top);
    const oldSpark = [...document.querySelectorAll('#dc-root div[style*="sk-twinkle"], #dc-root div[style*="sk-ember"]')].filter((e) => e.getClientRects().length > 0 && !e.closest('[data-sk-stars]')).length;
    return { n: els.length, names: [...new Set(cs.map((c) => c.animationName))], iter: [...new Set(cs.map((c) => c.animationIterationCount))], durs: new Set(cs.map((c) => c.animationDuration)).size, delays: new Set(cs.map((c) => c.animationDelay)).size,
      outside: els.every((e) => { const [x, y] = centre(e); const dx = (x - 85) / 92, dy = (y - 104) / 108; return dx * dx + dy * dy > 0.85; }),
      varies: ops[0].map((_, i) => ops.some((o) => Math.abs(o[i] - ops[0][i]) > 0.05)).filter(Boolean).length, sizes: new Set(els.map((e) => e.style.width)).size, minSize: Math.min(...els.map((e) => parseFloat(e.style.width))), maxSize: Math.max(...els.map((e) => parseFloat(e.style.width))), oldSpark };
  });
  console.log('      stars:', JSON.stringify(stars));
  check('4 + round 12: 6 sparkles around the fire', stars.n === 6, String(stars.n));
  check('4: they are BIG: every sparkle is 20px or more on the 390-wide design (was 7 to 16), at least 6 different sizes up to 34px', stars.minSize >= 20 && stars.maxSize <= 34 && stars.sizes >= 4, JSON.stringify([stars.minSize, stars.maxSize, stars.sizes]));
  check('3: every star fades in and out forever (animation sk-star, infinite), each with its own duration and start time', stars.names.join() === 'sk-star' && stars.iter.join() === 'infinite' && stars.durs >= 5 && stars.delays >= 5, JSON.stringify(stars));
  check('3: they are really fading (opacity changes over time on most stars), different sizes, none on top of the flame, the old 3 sparkles and embers are gone', stars.varies >= 5 && stars.sizes >= 4 && stars.outside && stars.oldSpark === 0, JSON.stringify(stars));
  // round 12: the stars are UPRIGHT (never tilted) and laid out cleanly: fixed places, three on each side of the flame, mirrored, and they stay put
  const lay = await page.evaluate(async () => {
    const els = [...document.querySelectorAll('[data-sk-star]')], fl = document.querySelector('[data-vector-flame="out"]').getBoundingClientRect(), mid = fl.left + fl.width / 2;
    const kf = [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules]; } catch (e) { return []; } }).find((r) => r.name === 'sk-star');
    const rot = kf ? /rotate/.test(kf.cssText) : true;
    const c = () => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    const p0 = els.map((e) => e.style.left + e.style.top); await new Promise((r) => setTimeout(r, 2500)); const p1 = els.map((e) => e.style.left + e.style.top);
    const pts = c(); const L = pts.filter((p) => p[0] < mid), R = pts.filter((p) => p[0] > mid);
    const mirror = L.every((l) => R.some((r) => Math.abs((mid - l[0]) - (r[0] - mid)) < 40 && Math.abs(l[1] - r[1]) < 16));
    const onScreen = pts.every((p) => p[0] > 20 && p[0] < innerWidth - 20);
    return { rot, still: p0.join() === p1.join(), L: L.length, R: R.length, mirror, onScreen, pts: pts.map((p) => p.map(Math.round)) };
  });
  console.log('      layout:', JSON.stringify(lay));
  check('round 12: the stars are upright (no rotation in their animation, only a fade and a gentle grow) and stay in their places', !lay.rot && lay.still, JSON.stringify(lay));
  check('round 12: a clean, balanced layout: three on each side of the flame, mirrored left/right, all well inside the screen', lay.L === 3 && lay.R === 3 && lay.mirror && lay.onScreen, JSON.stringify(lay));
  const ss = require('fs').readFileSync(path.join(ROOT, 'app', 'streak-screen.tsx'), 'utf8');
  check('round 12: opening is not held up: the page starts loading at once (no blank screen while the sessions are read), the streak is handed in on every page load once the numbers are there', !/if \(!info\) return/.test(ss) && /onLoadEnd=\{\(\) => setLoads/.test(ss) && /injectJavaScript\(streakPageJs\(info\)\)/.test(ss));
  check('6: the streak number (2) is inside the flame, inside the cream belly, with room around it, and moves with the inner flame', live.num === '2' && live.inside && live.within && live.fits, JSON.stringify({ n: live.num, inside: live.inside, within: live.within, fits: live.fits }));
  const nudge = await page.evaluate(() => { const n = document.querySelector('[data-streak-num]'), inn = document.querySelector('[data-vector-flame="in"]'); const rg = document.createRange(); rg.selectNodeContents(n); const t = rg.getBoundingClientRect(), r = inn.getBoundingClientRect(); return { dx: (t.left + t.width / 2) - (r.left + r.width / 2), tf: n.style.transform }; });
  check('7: the number sits a little LEFT of the exact middle of the flame belly (looks centred; 2 to 6px left)', nudge.dx <= -2 && nudge.dx >= -6, JSON.stringify(nudge));
  check('6: the number is deep orange on cream (readable), not white on the orange', live.ncolor === 'rgb(232, 89, 12)', live.ncolor);
  await page.screenshot({ path: path.join(ROOT, '.scratch', 'streak-flame-crop.png'), clip: { x: 80, y: 190, width: 230, height: 250 } });
  check('words match: "Day 2 streak!" and not "Your streak starts today"', r.head === 'Day 2 streak!' && !/starts today/i.test(r.sub), r.head + ' / ' + r.sub);
  check('exactly the two streak days are orange circles with a white check; the rest are plain grey with no check', r.days.length === 7 && r.days.map(d => d.on).join() === '0,1,1,0,0,0,0' && r.days.every(d => (d.on === '1') === (d.bg.startsWith('linear-gradient') && d.check)), JSON.stringify(r.days));
  // 2: right from the first frame. A fresh page: the moment __streakApplied turns true (that is what reveals the page), everything is final.
  const p2 = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await p2.addInitScript(() => { window.ReactNativeWebView = { postMessage() {} }; });
  await p2.addInitScript(H.DC_VIEWPORT_JS + H.DC_NO_ZOOM_JS);
  await p2.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'streak.html')).href, { waitUntil: 'load' });
  await p2.evaluate(H.dcScaleFitJs('#ffffff') + streakPageJs(two));
  await p2.waitForFunction(() => window.__streakApplied === true, null, { timeout: 8000 });
  const f1 = await p2.evaluate(() => { const n = document.querySelector('[data-streak-num]'); const r = n.getBoundingClientRect(); return { fonts: document.fonts.status, scale: window.__dcCanvasScale, num: n.textContent, numTop: Math.round(r.top), numLeft: Math.round(r.left), head: document.querySelector('#dc-root div[style*="font-size: 29px"]').textContent, headFont: getComputedStyle(n).fontFamily.split(',')[0] }; });
  await p2.waitForTimeout(1500);
  const f2 = await p2.evaluate(() => { const n = document.querySelector('[data-streak-num]'); const r = n.getBoundingClientRect(); return { fonts: document.fonts.status, scale: window.__dcCanvasScale, num: n.textContent, numTop: Math.round(r.top), numLeft: Math.round(r.left), head: document.querySelector('#dc-root div[style*="font-size: 29px"]').textContent, headFont: getComputedStyle(n).fontFamily.split(',')[0] }; });
  check('2: at the moment the page is revealed the fonts are loaded, the page is scaled to the screen, and the number and headline are what they stay (the number only drifts with the slight sway of the flame, under 3px)', f1.fonts === 'loaded' && f1.scale > 0 && f1.num === f2.num && f1.head === f2.head && f1.scale === f2.scale && Math.abs(f1.numTop - f2.numTop) <= 3 && Math.abs(f1.numLeft - f2.numLeft) <= 3 && f1.num === '2' && f1.head === 'Day 2 streak!', JSON.stringify(f1) + ' vs ' + JSON.stringify(f2));
  await p2.close();
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
