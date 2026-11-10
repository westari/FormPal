#!/usr/bin/env node
/**
 * scripts/test-train-phone.js  (Train tab, Ari's phone test)
 *   1. the main workout card shows its picture, 2. the streak flame shows and the pill is pressable,
 *   3. tapping another day animates smoothly (measured main-thread cost),
 *   4. the search box does not zoom / rescale the screen, and search lists matching REAL exercises, starts-with first.
 * Run against the shipped injection (TRAIN_BEFORE) + real data in WebKit; the animation cost in Chromium (CPU throttle).
 * Screenshots: .scratch/train-phone-*.png
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const Module = require('module'); const orig = Module._load;
Module._load = function (r) { if (/constants\/api$/.test(r)) return { MYPAL_API_URL: 'http://localhost/none' }; if (r === 'expo-asset') return { Asset: {} }; return orig.apply(this, arguments); };
const path = require('path'); const { pathToFileURL } = require('url');
const { webkit, chromium } = require('playwright');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const train = require('../app/(tabs)/train.tsx');
const { buildTrainData } = require('../lib/trainData.ts');
const { athltSetDataJs } = require('../lib/dcLogicPatch.ts');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const URL_ = pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'traintab.html')).href;
const now = new Date(2026, 10, 5, 14, 0, 0);
const ex = (id, name, s, r) => ({ exerciseId: id, displayName: name, targetSets: s, targetReps: r, restSeconds: 60, currentVariationId: id });
const plan = { id: 'p', profile: {}, currentWorkoutIndex: 1, workouts: [
  { id: 'w0', splitLabel: 'Lower Body', exercises: [ex('squat', 'Bodyweight Squat', 3, 12)] },
  { id: 'w1', splitLabel: 'Upper Body', exercises: [ex('pushup', 'Push-up', 3, 12), ex('pullup', 'Pull-up', 3, 6)] },
  { id: 'w2', splitLabel: 'Full Body', exercises: [ex('squat', 'Bodyweight Squat', 3, 12)] }] };
const at = (d, h = 9) => { const x = new Date(now); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); return x.getTime(); };
const sessions = [1, 2, 3].map(d => ({ ts: at(d), exerciseId: 'squat', displayName: 'Bodyweight Squat', reps: 10, goodReps: 9, pct: 90, formChecked: true }));
const INS = { top: 62, bottom: 34 };
const data = { ...buildTrainData(plan, sessions, INS, now) };

async function open(eng, { width = 402, height = 874, before = train.TRAIN_BEFORE } = {}) {
  const b = await eng.launch();
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const msgs = [];
  await p.exposeFunction('__post', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
  await p.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  await p.addInitScript(before);
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.goto(URL_, { waitUntil: 'commit' });
  let pushed = false; const t0 = Date.now();
  while (!msgs.some(m => m.type === 'ready') && Date.now() - t0 < 25000) { if (!pushed && msgs.some(m => m.type === 'needData')) { pushed = true; await p.evaluate(athltSetDataJs(data)); } await p.waitForTimeout(50); }
  await p.waitForTimeout(700);
  return { b, ctx, p, msgs };
}
const railOf = `[...document.querySelectorAll('div[data-scroll]')].find(x => x.style.overflowX === 'auto' && x.children.length === 7)`;

(async () => {
  // ── 1 + 2: picture and flame ──
  {
    const { b, p, msgs } = await open(webkit);
    const r = await p.evaluate(`(() => {
      const rail = ${railOf};
      const photo = [...rail.children[5].querySelectorAll('div')].find(d => /rotate[(]6deg[)]/.test(d.getAttribute('style') || ''));
      const masks = [...document.querySelectorAll('div[role="img"][aria-label="Streak"]')];
      const my = [...document.querySelectorAll('a[href^="Workout Preview"]')].map(a => [...a.querySelectorAll('div')].find(d => /rotate[(]6deg[)]/.test(d.getAttribute('style') || '')));
      const img = (el) => el ? getComputedStyle(el).backgroundImage : '';
      const msk = (el) => getComputedStyle(el).webkitMaskImage || getComputedStyle(el).maskImage || '';
      return { photo: img(photo), masks: masks.map(m => msk(m)), my: my.map(e => img(e)), hdr: masks[0].getBoundingClientRect().toJSON() };
    })()`);
    const real = (s) => /^url\("(blob:|data:image\/[a-z]+;base64,)/.test(s);
    console.log('      photo:', r.photo.slice(0, 30), '| flame mask:', r.masks[0].slice(0, 30), '| my workouts:', r.my.map(x => x.slice(0, 14)).join(','));
    check('the main workout card\'s picture is a real image (not the truncated data: URI)', real(r.photo), r.photo.slice(0, 40));
    check('the My Workouts cards\' pictures too', r.my.length === 3 && r.my.every(real), JSON.stringify(r.my.map(x => x.slice(0, 20))));
    check('the streak flame is a real mask image in the header and every day', r.masks.length >= 8 && r.masks.every(real), r.masks[0].slice(0, 40));
    const box = r.hdr;
    const shot = PNG.sync.read(await p.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } }));
    let orange = 0; for (let i = 0; i < shot.data.length; i += 4) if (shot.data[i] > 200 && shot.data[i + 1] < 190 && shot.data[i + 2] < 120) orange++;
    check('the flame is actually painted orange in the header (pixels checked)', orange > 40, orange + ' orange pixels');
    await p.screenshot({ path: path.join(ROOT, '.scratch', 'train-phone-top.png') });
    const h = await p.evaluateHandle(`[...${railOf}.children[5].querySelectorAll('div')].find(d => /rotate[(]6deg[)]/.test(d.getAttribute('style') || ''))`);
    const cs = PNG.sync.read(await h.asElement().screenshot());
    const seen = new Set(); for (let i = 0; i < cs.data.length; i += 16) seen.add((cs.data[i] >> 3) + ',' + (cs.data[i + 1] >> 3) + ',' + (cs.data[i + 2] >> 3));
    check('the card picture is painted (many colours in its area, not one flat grey)', seen.size > 12, seen.size + ' colour buckets');
    const pill = await p.evaluate(`(() => { const m = document.querySelector('div[role="img"][aria-label="Streak"]'); const pill = m.parentElement; const r = pill.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, cur: getComputedStyle(pill).cursor }; })()`);
    await p.touchscreen.tap(pill.x, pill.y); await p.waitForTimeout(300);
    check('the streak pill is pressable (cursor pointer, opens the streak screen)', pill.cur === 'pointer' && msgs.some(m => m.type === 'nav' && m.to === 'streak'), JSON.stringify(msgs.filter(m => m.type === 'nav')));
    await b.close();
  }
  // ── 4: keyboard / zoom ──
  {
    const { b, p } = await open(webkit);
    const info = await p.evaluate(() => { const i = document.querySelector('input[placeholder^="Search"]'); return { fs: parseFloat(getComputedStyle(i).fontSize), meta: document.querySelector('meta[name=viewport]').content }; });
    check('the search input is 16px (iOS does not zoom a 16px input)', info.fs >= 16, info.fs + 'px');
    check('the viewport scale is locked', /maximum-scale=1/.test(info.meta) && /user-scalable=no/.test(info.meta));
    const canvas = () => p.evaluate(`(() => { const r = [...document.querySelectorAll('div')].find(d => d.style.width === '390px' && d.style.height === '844px'); const b = r.getBoundingClientRect(); return { w: Math.round(b.width), S: window.__dcCanvasScale }; })()`);
    const before = await canvas();
    await p.evaluate(() => { const i = document.querySelector('input[placeholder^="Search"]'); i.scrollIntoView({ block: 'center' }); });
    await p.setViewportSize({ width: 402, height: 874 - 336 }); await p.waitForTimeout(900);
    const kb = await canvas();
    console.log('      canvas before / with keyboard:', JSON.stringify(before), JSON.stringify(kb));
    check('opening the keyboard does NOT rescale the screen (it zoomed out before)', kb.w === before.w && kb.S === before.S, `width ${before.w} -> ${kb.w}, scale ${before.S} -> ${kb.S}`);
    await p.setViewportSize({ width: 402, height: 874 }); await p.waitForTimeout(500);
    const back = await canvas();
    check('closing it puts everything back exactly', back.w === before.w && back.S === before.S);
    await b.close();
  }
  // ── 4b: search ──
  {
    const { b, p, msgs } = await open(webkit);
    const type = async (t) => {
      await p.evaluate(() => { const i = document.querySelector('input[placeholder^="Search"]'); i.scrollIntoView({ block: 'center' }); });
      await p.waitForTimeout(150);
      const si = await p.evaluate(() => { const r = document.querySelector('input[placeholder^="Search"]').getBoundingClientRect(); return { x: r.x + 30, y: r.y + r.height / 2 }; });
      await p.touchscreen.tap(si.x, si.y); await p.keyboard.press('Control+A'); await p.keyboard.press('Backspace');
      if (t) await p.keyboard.type(t); await p.waitForTimeout(350);
    };
    const names = () => p.evaluate(() => [...document.querySelectorAll('[aria-label="Check form"]')].map(bn => { let e = bn; for (let i = 0; i < 4 && e; i++, e = e.parentElement) { const n = e.querySelector('div[style*="font-size: 15px"]'); if (n) return n.textContent.trim(); } return ''; }));
    const { EXERCISE_CATALOG } = require('../constants/exercises.ts');
    const all = EXERCISE_CATALOG.map(e => e.displayName);
    const lo = (x) => x.toLowerCase();
    await type('s');
    const s = await names();
    const starts = all.filter(n => lo(n).startsWith('s'));
    console.log('      "s" ->', s.join(' | '));
    check('typing "S" lists exercises STARTING with S first, then the ones containing S', s.length >= 8 && s.slice(0, Math.min(starts.length, s.length)).every(n => lo(n).startsWith('s')) && s.every(n => lo(n).includes('s')), s.join(' | '));
    check('...and every result is a real catalogue exercise (no demo / filler rows)', s.every(n => all.includes(n)), s.filter(n => !all.includes(n)).join());
    const firstNon = s.findIndex(n => !lo(n).startsWith('s'));
    check('...with the starts-with group strictly before the contains group', firstNon === -1 || s.slice(firstNon).every(n => !lo(n).startsWith('s')));
    await p.screenshot({ path: path.join(ROOT, '.scratch', 'train-phone-search-s.png') });
    await type('ro');
    const ro = await names();
    console.log('      "ro" ->', ro.join(' | '));
    check('"ro": names starting with "ro" first, then names containing it', ro.length >= 3 && lo(ro[0]).startsWith('ro') && ro.every(n => lo(n).includes('ro')) && ro.every(n => all.includes(n)), ro.join(' | '));
    await type('push');
    const pu = await names();
    check('"push": only real push exercises', pu.length >= 3 && pu.every(n => /push/i.test(n)) && pu.every(n => all.includes(n)), pu.join(' | '));
    await type('qqq');
    check('no match -> the design\'s own empty message, no rows', (await names()).length === 0 && /No exercises match that/.test(await p.evaluate(() => document.body.innerText)));
    await type('lunge');
    await p.evaluate(`document.querySelectorAll('[aria-label="Check form"]')[0].click()`); await p.waitForTimeout(200);
    check('Check form on a result opens that exact exercise', msgs.some(m => m.type === 'practice' && m.id === 'lunge'), JSON.stringify(msgs.filter(m => m.type === 'practice')));
    await b.close();
  }
  // ── 3: day tap animation ──
  {
    const cb = await chromium.launch();
    const ctx = await cb.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const msgs = [];
    await p.exposeFunction('__post', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
    await p.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
    await p.addInitScript(train.TRAIN_BEFORE);
    await p.goto(URL_, { waitUntil: 'commit' });
    let pushed = false; const t0 = Date.now();
    while (!msgs.some(m => m.type === 'ready') && Date.now() - t0 < 25000) { if (!pushed && msgs.some(m => m.type === 'needData')) { pushed = true; await p.evaluate(athltSetDataJs(data)); } await p.waitForTimeout(50); }
    await p.waitForTimeout(800);
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await p.evaluate(() => { window.__fr = []; window.__long = 0; window.__jsFrames = 0; try { new PerformanceObserver(l => l.getEntries().forEach(e => { window.__long += e.duration; })).observe({ entryTypes: ['longtask'] }); } catch (e) {} let last = performance.now(); window.__rec = true; (function loop() { const n = performance.now(); window.__fr.push(n - last); last = n; if (window.__rec) requestAnimationFrame(loop); })(); });
    // count how many times script writes scrollLeft during the jump (the old animation wrote it every frame)
    await p.evaluate(`(() => { const rail = ${railOf}; window.__writes = 0; const d = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft'); Object.defineProperty(rail, 'scrollLeft', { get() { return d.get.call(this); }, set(v) { window.__writes++; d.set.call(this, v); }, configurable: true }); })()`);
    const pt = await p.evaluate(() => { const c = [...document.querySelectorAll('div')].find(d => d.style.height === '76px'); const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.evaluate(() => { window.__fr = []; window.__long = 0; });
    await p.touchscreen.tap(pt.x, pt.y);
    await p.waitForTimeout(1300);
    const res = await p.evaluate(`(() => { window.__rec = false; const f = window.__fr.filter(x => x > 0).sort((a, b) => a - b); const rail = ${railOf}; return { frames: f.length, p95: f[Math.floor(f.length * 0.95)] || 0, max: f[f.length - 1] || 0, long: Math.round(window.__long), left: rail.scrollLeft, writes: window.__writes }; })()`);
    console.log(`      day jump (6x slower CPU): frames ${res.frames}, p95 frame ${res.p95.toFixed(0)}ms, worst ${res.max.toFixed(0)}ms, long-task time ${res.long}ms, script scroll writes ${res.writes}, ended at scrollLeft ${res.left.toFixed(0)}`);
    check('the jump still lands on the tapped day (first card, centred)', res.left >= 0 && res.left < 80, 'scrollLeft ' + res.left.toFixed(0));
    check('the animation is not driven by script writing the scroll position every frame (<= 2 writes)', res.writes <= 2, res.writes + ' writes');
    check('no long main-thread task during the animation (< 150ms total)', res.long < 150, res.long + 'ms');
    await cb.close();
  }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
