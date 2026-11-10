#!/usr/bin/env node
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..');
const H = require('../lib/dcWebviewHelpers.ts');
const { dcLogicPatchJs, athltSetDataJs } = require('../lib/dcLogicPatch.ts');
const INJ = process.env.INJECT_FILE ? require(path.resolve(process.env.INJECT_FILE)) : require('../lib/progressInject.ts');
const { makeData } = require('./lib/progress-harness.js');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const OLD = !!process.env.INJECT_FILE;

const png = (c) => 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="90" height="120"><rect width="90" height="120" fill="${c}"/><circle cx="45" cy="45" r="20" fill="#fff"/></svg>`).toString('base64');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const msgs = [];
  await p.exposeFunction('__post', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
  await p.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  await p.addInitScript(H.DC_VIEWPORT_JS + H.DC_NO_ZOOM_JS + H.CONSOLE_FORWARD_JS + H.DC_SETTLE_JS + dcLogicPatchJs(INJ.PROGRESS_LOGIC_EXT) + INJ.PROGRESS_DOM_JS);
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  const data = makeData(); const now = Date.now(), DAY = 86400000;
  data.photos = [0, 1, 2].map(i => ({ id: 'p' + i, ts: now - i * 9 * DAY, pose: ['front', 'side', 'back'][i % 3], thumb: png(['#c0392b', '#2980b9', '#27ae60'][i % 3]) }));
  data.insets = { top: 62, bottom: 34 };
  const frameImg = png('#8e44ad');
  data.workouts = [0, 1, 2].map(i => ({ ts: now - i * DAY, name: ['Upper Body', 'Lower Body', 'Full Body'][i], when: ['Today', 'Yesterday', '2 days ago'][i] + ' · 24 min', form: 90 - i, formPct: 90 - i, reps: 40, sets: 4, thumb: i < 2 ? frameImg : null, muscle: 'chest', fallback: frameImg.replace('8e44ad', 'cccccc') }));
  await p.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'progress.html')).href, { waitUntil: 'commit' });
  const t0 = Date.now(); let pushed = false;
  while (!(await p.evaluate(() => document.documentElement.hasAttribute('data-pready')).catch(() => false)) && Date.now() - t0 < 25000) { if (!pushed && msgs.some(m => m.type === 'needData')) { pushed = true; await p.evaluate(athltSetDataJs(data)); } await p.waitForTimeout(50); }
  await p.waitForTimeout(900);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  // per-frame probe: from "now" until stop, one record per animation frame
  await p.evaluate(() => {
    window.__probe = (fn) => { window.__rows = []; window.__on = true; const t = performance.now(); (function loop() { if (!window.__on) return; try { window.__rows.push(Object.assign({ t: Math.round(performance.now() - t) }, fn())); } catch (e) { window.__rows.push({ t: -1, err: String(e) }); } requestAnimationFrame(loop); })(); };
    window.__stop = () => { window.__on = false; return window.__rows; };
  });
  const tapAt = async (finder) => {
    const pt = await p.evaluate(`(() => { const e = (${finder})(); e.scrollIntoView({ block: 'center' }); return 1; })()`);
    await p.waitForTimeout(250);
    const r = await p.evaluate(`(() => { const e = (${finder})(); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await p.touchscreen.tap(r.x, r.y);
  };
  const gapsOf = async (fn) => {
    await p.evaluate(() => { window.__gaps = []; window.__g = true; let last = performance.now(); (function l() { const n = performance.now(); window.__gaps.push(Math.round(n - last)); last = n; if (window.__g) requestAnimationFrame(l); })(); });
    await fn();
    return await p.evaluate(() => { window.__g = false; return window.__gaps; });
  };
  const shot = (n) => p.screenshot({ path: path.join(ROOT, '.scratch', 'flow', n + '.png') });
  fs.mkdirSync(path.join(ROOT, '.scratch', 'flow'), { recursive: true });

  // ── 12. Muscle Map opens smoothly ──
  const g12 = await gapsOf(async () => {
    await tapAt(`() => document.querySelector('#dc-root a[style*="padding: 18px 18px 14px"]')`);
    await p.waitForTimeout(1100);
  });
  const worst = Math.max(...g12.slice(3));
  console.log(`      Muscle Map open (4x slower CPU): slowest frame ${worst}ms (it was ~440ms before)`);
  check('12. Muscle Map: opening never stalls a frame for long (slowest frame under 200ms at 4x slower CPU)', worst < 200, 'slowest ' + worst + 'ms');
  const mm = await p.evaluate(() => ({ svgs: document.querySelectorAll('#dc-root div[aria-label="Body map space"][style*="height: 300px"] svg').length, text: (document.getElementById('dc-root').innerText.match(/(Target your|Train a few exercises).*/) || [''])[0] }));
  check('12. Muscle Map: the body map and the "Target your ..." line are there', mm.svgs >= 2 && /(Target your .+ this week|Train a few exercises to see your weakest muscle)/.test(mm.text), JSON.stringify(mm));

  await shot('ux_musclemap');
  await tapAt(`() => document.querySelector('#dc-root a[aria-label="Back"]') || [...document.querySelectorAll('#dc-root a')].find(x => x.querySelector('path[d^="M19 12H5"]'))`);
  await p.waitForTimeout(700);

  // ── 13. Log weight sheet ──
  const posts0 = msgs.filter(m => m.type === 'logWeight').length;
  await tapAt(`() => [...document.querySelectorAll('#dc-root a')].find(a => /Log weight/.test(a.innerText))`);
  await p.waitForTimeout(900);
  const sheet = () => p.evaluate(() => {
    const sh = document.querySelector('#dc-root div[style*="z-index: 60"]'); if (!sh) return null;
    const num = sh.querySelector('div[style*="font-size: 52px"]');
    const cs = getComputedStyle(num, '::after');
    return { title: [...sh.querySelectorAll('div')].map(d => d.children.length === 0 ? d.textContent.trim() : '').find(t => /weight/i.test(t) && t.length < 30), field: num.textContent, curW: cs.width, curAnim: cs.animationName, last: (document.getElementById('__athlt_wlast') || {}).textContent, submitBg: getComputedStyle([...sh.querySelectorAll('a')].find(a => /Submit/.test(a.innerText))).backgroundColor };
  });
  const s0 = await sheet();
  console.log('      sheet:', JSON.stringify(s0));
  check('13. Log weight: title is "Enter today\'s weight"', s0 && s0.title === "Enter today's weight", s0 && s0.title);
  check('13. Log weight: the number field starts EMPTY (no 0, no old weight)', s0 && s0.field === '', JSON.stringify(s0 && s0.field));
  check('13. Log weight: a blinking cursor sits in the field', s0 && s0.curW === '3px' && s0.curAnim === 'pg-blink', `${s0 && s0.curW} ${s0 && s0.curAnim}`);
  check('13. Log weight: the last weight shows small ("Last: 181.2 lb")', s0 && s0.last === 'Last: 181.2 lb', s0 && s0.last);
  await shot('ux_weight_empty');
  const submitTap = () => tapAt(`() => [...document.querySelectorAll('#dc-root div[style*="z-index: 60"] a')].find(a => /Submit/.test(a.innerText))`);
  await submitTap(); await p.waitForTimeout(400);
  check('13. Log weight: Submit with nothing typed does nothing', msgs.filter(m => m.type === 'logWeight').length === posts0 && !!(await sheet()) && !(await p.evaluate(() => document.getElementById('__athlt_logged'))));
  const key = (k) => tapAt(`() => [...document.querySelectorAll('#dc-root div[style*="z-index: 60"] div[style*="cursor: pointer"]')].find(d => (d.querySelector('div') ? d.querySelector('div').textContent.trim() : '') === '${k}')`);
  for (const k of ['1', '7', '8', '.', '4']) await key(k);
  await p.waitForTimeout(250);
  const s1 = await sheet();
  check('13. Log weight: the keypad fills the field (178.4)', s1 && s1.field === '178.4', JSON.stringify(s1 && s1.field));
  await shot('ux_weight_typed');

  // ── 14. weight logged moment ──
  await submitTap();
  await p.waitForTimeout(700);
  const lg = await p.evaluate(() => { const e = document.getElementById('__athlt_logged'); return e ? { text: e.innerText.replace(/\s+/g, ' ').trim(), sheet: !!document.querySelector('#dc-root div[style*="z-index: 60"]') } : null; });
  console.log('      moment:', JSON.stringify(lg));
  check('14. After Submit a "weight logged" moment shows the NEW number and the change since last time', lg && /Weight logged/.test(lg.text) && /178\.4/.test(lg.text) && /Down 3\.7 lb since last time/.test(lg.text), lg && lg.text);
  const post = msgs.filter(m => m.type === 'logWeight').pop();
  check('14. The weight was saved (sent to the app once)', msgs.filter(m => m.type === 'logWeight').length === posts0 + 1 && post.weightLb === 178.4, JSON.stringify(post));
  await shot('ux_weight_logged');
  await p.waitForTimeout(2200);
  const after = await p.evaluate(() => ({ moment: !!document.getElementById('__athlt_logged'), sheet: !!document.querySelector('#dc-root div[style*="z-index: 60"]'), chartText: [...document.querySelectorAll('#dc-root svg text')].map(t => t.textContent).join(' '), now: [...document.querySelectorAll('#dc-root div')].filter(d => /· 178\.4/.test(d.textContent || '') && (d.textContent || '').length < 30).length }));
  check('14. Then it returns to Progress by itself, with the updated graph (178.4 on it)', !after.moment && !after.sheet && /178\.4/.test(after.chartText + ' ' + after.now), JSON.stringify(after).slice(0, 160));
  await shot('ux_weight_back');

  // ── 16 / 17. past workouts: the picture, and the tap ──
  const rows = await p.evaluate(() => [...document.querySelectorAll('#dc-root div[role="img"][aria-label$=" video"]')].map(e => ({ img: (e.style.backgroundImage || '').slice(0, 30), size: e.style.backgroundSize })));
  console.log('      past workout boxes:', JSON.stringify(rows));
  check('16. Past workouts show their video frame (a picture), not the flat icon, when they have one', rows.length >= 2 && /^url\("?data:image/.test(rows[0].img) && rows[0].size === 'cover' && rows[1].size === 'cover', JSON.stringify(rows));
  check('16. A workout with no video still shows the muscle icon tile (never a black box)', rows.length >= 3 && /linear-gradient|data:image/.test((await p.evaluate(() => document.querySelectorAll('#dc-root div[role="img"][aria-label$=" video"]')[2].style.backgroundImage))) , '');
  const openAt = msgs.filter(m => m.type === 'openWorkout').length;
  await p.evaluate(() => window.__probe(() => ({ op: [...document.querySelectorAll('#dc-root div[role="img"][aria-label$=" video"]')].map(e => { let n = e; for (let i = 0; i < 6 && n; i++, n = n.parentElement) { if (n.tagName === 'A') return parseFloat(getComputedStyle(n).opacity); } return 1; })[0] })));
  await tapAt(`() => document.querySelector('#dc-root div[role="img"][aria-label$=" video"]')`);
  await p.waitForTimeout(300);
  const rowsOp = (await p.evaluate(() => window.__stop())).map(r => r.op);
  check('17. Tapping a past workout is answered at once (one open sent, the row dims in the same moment)', msgs.filter(m => m.type === 'openWorkout').length === openAt + 1 && Math.min(...rowsOp) < 0.9, 'opacity ' + Math.min(...rowsOp));

  // ── 15. Photos compare: empty slot ──
  await tapAt(`() => [...document.querySelectorAll('#dc-root a, #dc-root div')].filter(e => /Progress Photos/.test(e.innerText || '') && (e.innerText || '').length < 30).sort((a, b) => a.innerText.length - b.innerText.length)[0]`);
  await p.waitForTimeout(900);
  const cmp = await p.evaluate(() => {
    const slots = [...document.querySelectorAll('#dc-root div[style*="aspect-ratio: 3 / 4"][style*="border-radius: 20px"]')];
    return slots.map(s => { const r = s.getBoundingClientRect(), pl = s.querySelector('[data-athlt-plus]'); const pr = pl && pl.getBoundingClientRect(); const vis = [...s.children].filter(c => getComputedStyle(c).display !== 'none' && c !== pl && c.getBoundingClientRect().width > 0).length; return { filled: /url\(/.test(s.style.background || ''), plus: !!pl, dx: pr ? Math.round((pr.x + pr.width / 2) - (r.x + r.width / 2)) : null, dy: pr ? Math.round((pr.y + pr.height / 2) - (r.y + r.height / 2)) : null, size: pr ? Math.round(pr.width) : 0, otherVisible: vis }; });
  });
  console.log('      compare slots:', JSON.stringify(cmp));
  const empties = cmp.filter(c => !c.filled);
  check('15. Compare: an empty slot has NO old icon and one centred plus (same as All photos)', empties.length >= 1 && empties.every(c => c.plus && c.otherVisible === 0 && Math.abs(c.dx) <= 1 && Math.abs(c.dy) <= 1 && Math.abs(c.size - 26) <= 1.2), JSON.stringify(cmp));
  check('15. Compare: a slot with a photo has no plus on it', cmp.filter(c => c.filled).every(c => !c.plus));
  await shot('ux_compare');
  await b.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
