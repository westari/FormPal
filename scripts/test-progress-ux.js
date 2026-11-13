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
  await p.addInitScript(H.DC_VIEWPORT_JS + H.DC_NO_ZOOM_JS + H.CONSOLE_FORWARD_JS + H.DC_SETTLE_JS + dcLogicPatchJs(INJ.PROGRESS_LOGIC_EXT) + INJ.PROGRESS_DOM_JS + require('../lib/haptics.ts').HAPTIC_PAGE_JS + require('../lib/loggedTile.ts').LOGGED_TILE_JS);
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  const data = makeData(); const now = Date.now(), DAY = 86400000;
  data.photos = [0, 1, 2].map(i => ({ id: 'p' + i, ts: now - i * 9 * DAY, pose: ['front', 'side', 'back'][i % 3], thumb: png(['#c0392b', '#2980b9', '#27ae60'][i % 3]) }));
  data.insets = { top: 62, bottom: 34 };
  // form scores spread over 14 months: 7 different days, at -400 -300 -200 -100 -50 -20 -5 days
  const FORM_DAYS = [-400, -300, -200, -100, -50, -20, -5];
  data.form = FORM_DAYS.map((d, i) => ({ ts: now + d * DAY, pct: 60 + i * 4 }));
  { const t = new Date(now), tk = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); data.weight = data.weight.filter(w => w.d !== tk); } // nothing logged today yet
  const frameImg = png('#8e44ad');
  data.workouts = [0, 1, 2, 3].map(i => ({ ts: now - i * DAY, name: ['Upper Body', 'Lower Body', 'Full Body', 'Core'][i], when: ['Today', 'Yesterday', '2 days ago', '3 days ago'][i] + ' · 24 min', form: 90 - i, formPct: 90 - i, reps: 40, sets: 4, thumb: i < 2 ? frameImg : null, muscle: 'chest', fallback: frameImg.replace('8e44ad', 'cccccc'), logged: i === 2, body: i === 2 ? require('../lib/bodyMapSvg.ts').loggedBodySvg(['chest', 'triceps', 'shoulders'], { chest: { tier: 'gold', peakTier: 'gold', volume: 1, goodRatio: 1 } }) : null }));
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
  const mm = await p.evaluate(() => ({ svgs: document.querySelectorAll('#dc-root div[aria-label="Body map space"][style*="height: 300px"] svg').length, text: (document.getElementById('dc-root').innerText.match(/(Work on|Train to find).*/) || [''])[0], oneLine: (() => { const e = document.querySelector('[data-athlt-weak]'); if (!e) return null; const r = e.getBoundingClientRect(); return { h: Math.round(r.height), lh: parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.3 }; })() }));
  check('12. Muscle Map: the body map and ONE short line ("Work on triceps this week") are there', mm.svgs >= 2 && /^(Work on .+ this week|Train to find your weak spot)$/.test(mm.text.trim()) && mm.oneLine && mm.oneLine.h < mm.oneLine.lh * 1.6, JSON.stringify(mm));

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
  check('13. Log weight: the last weight shows small ("Last: 182.1 lb")', s0 && s0.last === 'Last: 182.1 lb', s0 && s0.last);
  await shot('ux_weight_empty');
  const submitTap = () => tapAt(`() => [...document.querySelectorAll('#dc-root div[style*="z-index: 60"] a')].find(a => /Submit/.test(a.innerText))`);
  await submitTap(); await p.waitForTimeout(400);
  check('13. Log weight: Submit with nothing typed does nothing', msgs.filter(m => m.type === 'logWeight').length === posts0 && !!(await sheet()) && !(await p.evaluate(() => document.getElementById('__athlt_logged'))));
  const key = (k) => tapAt(`() => [...document.querySelectorAll('#dc-root div[style*="z-index: 60"] div[style*="cursor: pointer"]')].find(d => (d.querySelector('div') ? d.querySelector('div').textContent.trim() : '') === '${k}')`);
  // 13. haptics from the page: ONE per press, the right kind
  const hz = () => msgs.filter(m => m.type === 'haptic').map(m => m.kind);
  let h0 = hz().length;
  await key('9'); await p.waitForTimeout(120); await key('⌫'); await p.waitForTimeout(150);
  check('13 haptics: each keypad key (and delete) is exactly ONE selection haptic', hz().slice(h0).join() === 'select,select', hz().slice(h0).join());
  for (const k of ['1', '7', '8', '.', '4']) await key(k);
  await p.waitForTimeout(250);
  const s1 = await sheet();
  check('13. Log weight: the keypad fills the field (178.4)', s1 && s1.field === '178.4', JSON.stringify(s1 && s1.field));
  await shot('ux_weight_typed');

  // ── 14. weight logged moment ──
  h0 = hz().length;
  await submitTap();
  await p.waitForTimeout(700);
  check('13 haptics: Submit that saves the weight is ONE success haptic (it replaces the Submit press own)', hz().slice(h0).join() === 'success', hz().slice(h0).join());
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

  // ── 5. the insight line sits at the TOP of the weight graph ──
  const lay = await p.evaluate(() => {
    const goal = (document.querySelector('[data-athlt-statlbl]') || {}).parentElement;
    const row = goal && goal.parentElement;
    const svg = [...document.querySelectorAll('#dc-root svg')].find(s => s.querySelector('path[fill="url(#pgWt)"]'));
    const pill = [...document.querySelectorAll('#dc-root *')].filter(d => d.textContent.trim() === '2m' && ![...d.children].some(c => c.textContent.trim() === '2m'))[0];
    if (!row || !svg || !pill) return null;
    const r = row.getBoundingClientRect(), c = svg.getBoundingClientRect(), pl = pill.getBoundingClientRect();
    return { rowTop: Math.round(r.top), rowBottom: Math.round(r.bottom), chartTop: Math.round(c.top), pillBottom: Math.round(pl.bottom), text: row.textContent.trim().slice(0, 40) };
  });
  console.log('      insight line:', JSON.stringify(lay), JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('#dc-root div')].filter(d => /since|Same weight/.test(d.textContent) && d.children.length <= 3 && d.textContent.length < 70).map(d => d.textContent.trim().slice(0, 30) + '|' + d.style.justifyContent + '|' + d.children.length).slice(0, 5))));
  const stat = await p.evaluate(() => { const lbl = document.querySelector('[data-athlt-statlbl]'); if (!lbl) return null; const goal = lbl.parentElement, row = goal.parentElement; const big = goal.querySelector('span'); const orb = row.children[0]; const anim = [orb, ...orb.querySelectorAll('*')].map(e => getComputedStyle(e).animationName).filter(n => n && n !== 'none'); return { big: big.textContent.trim(), bigSize: getComputedStyle(big).fontSize, label: lbl.textContent.trim(), orbW: Math.round(orb.getBoundingClientRect().width), anims: anim.length, bright: getComputedStyle(orb).filter, shadow: getComputedStyle(orb).boxShadow, labelSize: getComputedStyle(lbl).fontSize, labelColor: getComputedStyle(lbl).color, bigColor: getComputedStyle(big).color, oneLine: Math.abs(lbl.getBoundingClientRect().top - big.getBoundingClientRect().top) < 8 }; });
  console.log('      stat:', JSON.stringify(stat));
  check('4. The Cue insight is back UNDER the graph (below the chart, above the Log button), not at the top', lay && lay.rowTop >= lay.chartTop + 100, JSON.stringify(lay));
  check('4. The Cue stat is small: "5.8 lb" and "down since Oct 2" are the same size (13px), one line', stat && /^\d+(\.\d)? lb$/.test(stat.big) && stat.bigSize === '13px' && /^(down|up) since /.test(stat.label) && stat.labelSize === '13px' && stat.oneLine, JSON.stringify(stat));
  const orbs = await p.evaluate(() => [...document.querySelectorAll('#dc-root div[style*="hm-orb-breathe"]')].map(o => { const layers = [o, ...o.querySelectorAll('*')].filter(e => (e.getAttribute('style') || '').includes('hm-orb')); return { w: Math.round(o.getBoundingClientRect().width), breathe: getComputedStyle(o).animationName, moving: layers.filter(e => getComputedStyle(e).animationName !== 'none').length, of: layers.length, bg: getComputedStyle(o).backgroundImage, shadow: getComputedStyle(o).boxShadow, blend: [...o.querySelectorAll('div')].filter(e => getComputedStyle(e).mixBlendMode !== 'normal' && getComputedStyle(e).display !== 'none').length }; }));
  console.log('      every Cue orb on the page:', JSON.stringify(orbs));
  check('3. EVERY Cue orb on Progress (Muscle map, Weight, Form score) is the shared new orb: all its layers animated, no background / glow box behind it, no texture layer', orbs.length >= 2 && orbs.every(o => o.moving === o.of && o.breathe !== 'none' && o.bg === 'none' && o.shadow === 'none' && o.blend === 0), JSON.stringify(orbs));
  check('5. "down since Oct 2" is black, like the number (not grey)', stat && stat.labelColor === 'rgb(17, 17, 20)' && stat.bigColor === 'rgb(17, 17, 20)', stat && stat.labelColor + ' / ' + stat.bigColor);
  check('4. The orb beside it is the same small size as that line (about 20px), still MOVING, and has no glow / background behind it', stat && stat.orbW >= 18 && stat.orbW <= 22 && stat.anims >= 3 && stat.shadow === 'none', JSON.stringify(stat));
  await shot('ux_insight_stat');

  // 13. segment controls, buttons and scrolling
  { const hp = hz().length; await tapAt(`() => [...document.querySelectorAll('#dc-root *')].filter(d => d.textContent.trim() === '6m' && ![...d.children].some(c => c.textContent.trim() === '6m'))[0]`); await p.waitForTimeout(250);
    check('13 haptics: a range pill (2M/6M/1Y) is ONE selection haptic', hz().slice(hp).join() === 'select', hz().slice(hp).join()); }
  { const hp = hz().length; await p.evaluate(() => { const sc = document.querySelector('#dc-root div[data-scroll]'); sc.scrollTop = 400; sc.dispatchEvent(new Event('scroll')); });
    await p.touchscreen.tap(1, 1).catch(() => {}); await p.waitForTimeout(100);
    const sw = hz().slice(hp).length; check('13 haptics: scrolling makes no haptic', sw <= 1 && !hz().slice(hp).some(k => k !== 'light'), hz().slice(hp).join()); }
  // ── 7. Form score 2M / 6M / 1Y / All filter the real data by date ──
  await tapAt(`() => document.querySelector('#dc-root a[aria-label="Back"]') || [...document.querySelectorAll('#dc-root a')].find(x => x.querySelector('path[d^="M19 12H5"]'))`).catch(() => {});
  await p.waitForTimeout(600);
  const formPoints = () => p.evaluate(() => {
    const svgs = [...document.querySelectorAll('#dc-root svg')].filter(s => s.getAttribute('viewBox') === '0 0 287 190' && !s.querySelector('path[fill="url(#pgWt)"]'));
    const svg = svgs[0]; if (!svg) return null;
    return { points: svg.querySelectorAll('g').length, labels: [...svg.parentElement.parentElement.querySelectorAll('div')].filter(d => /^\d+%$/.test(d.textContent.trim())).length };
  });
  const pillOf = (label) => `() => [...document.querySelectorAll('#dc-root *')].filter(d => d.textContent.trim().toLowerCase() === '${label}' && ![...d.children].some(c => c.textContent.trim().toLowerCase() === '${label}'))[1]`;
  const expectDays = (days) => FORM_DAYS.filter(d => d >= -days).length;
  const res = {};
  for (const [label, days] of [['2m', 61], ['6m', 183], ['1y', 365], ['all', 99999]]) {
    await tapAt(pillOf(label)); await p.waitForTimeout(350);
    res[label] = await formPoints();
  }
  console.log('      form chart points by range:', JSON.stringify(Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v && v.points]))), 'expected 3,4,6,7');
  check('7. Form score ranges filter the real data by date: 2M shows the 3 days in the last 61, 6M the 4 in 183, 1Y the 6 in 365, All the 7', res['2m'] && res['2m'].points === expectDays(61) && res['6m'].points === expectDays(183) && res['1y'].points === expectDays(365) && res['all'].points === expectDays(99999) && expectDays(61) === 3 && expectDays(183) === 4 && expectDays(365) === 6, JSON.stringify(Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v && v.points]))));
  await shot('ux_form_ranges');

  // ── 3. edit today's weight (and 2, 4) ──
  const lbl = await p.evaluate(() => [...document.querySelectorAll('#dc-root a')].map(a => a.innerText.trim()).filter(t => /weight$/.test(t) && t.length < 30));
  check('3. After logging, the card button says "Edit today\'s weight"', lbl.includes("Edit today's weight"), JSON.stringify(lbl));
  const ico = await p.evaluate(() => { const a = [...document.querySelectorAll('#dc-root a')].find(x => /Edit today's weight/.test(x.innerText)); const pth = a.querySelector('svg path'); return { d: pth.getAttribute('d'), plusLike: /^M8 2\.5v11/.test(pth.getAttribute('d')) }; });
  check('5. After logging today the button shows a pencil (not the +)', !ico.plusLike && /^M10\.8 2\.6/.test(ico.d), ico.d);
  await tapAt(`() => [...document.querySelectorAll('#dc-root a')].find(a => /Edit today's weight/.test(a.innerText))`);
  await p.waitForTimeout(900);
  const e0 = await sheet();
  check('3. Edit opens the sheet with today\'s weight already in the field, titled "Edit today\'s weight", and "Last" is the one before today', e0 && e0.field === '178.4' && e0.title === "Edit today's weight" && e0.last === 'Last: 182.1 lb', JSON.stringify(e0));
  for (let i = 0; i < 5; i++) await key('⌫');
  for (const k of ['1', '7', '9', '.', '2']) await key(k);
  await p.waitForTimeout(200);
  const nPosts = msgs.filter(m => m.type === 'logWeight').length;
  await submitTap(); await p.waitForTimeout(800);
  const lg2 = await p.evaluate(() => { const e = document.getElementById('__athlt_logged'); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; });
  check('3. Saving the edit shows the new number and REPLACES today\'s entry (one send, same date)', /179\.2/.test(lg2 || '') && msgs.filter(m => m.type === 'logWeight').length === nPosts + 1 && msgs.filter(m => m.type === 'logWeight').pop().dateKey === post.dateKey, lg2);
  // 4. it fades away: sample the overlay's opacity every frame after it starts leaving
  await p.waitForTimeout(1050);
  await p.evaluate(() => window.__probe(() => { const e = document.getElementById('__athlt_logged'); return { has: !!e, op: e ? parseFloat(getComputedStyle(e).opacity) : -1, sheet: !!document.querySelector('#dc-root div[style*="z-index: 60"]') }; }));
  await p.waitForTimeout(1200);
  const fr = await p.evaluate(() => window.__stop());
  const ops = fr.filter(r => r.has).map(r => r.op);
  const mid = ops.filter(o => o > 0.05 && o < 0.95).length;
  console.log('      fade frames: overlay opacity by frame', ops.map(o => o.toFixed(2)).join(' ').slice(0, 160));
  check('4. After the moment it FADES back to Progress over several frames (not one jump), and is gone at the end', mid >= 3 && !fr[fr.length - 1].has && !fr[fr.length - 1].sheet, `${mid} in-between frames`);
  const same = await p.evaluate(() => (window.__athltData.weight || []).filter(w => { const t = new Date(); return w.d === t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); }).map(w => w.w));
  check('3. Only ONE entry exists for today and it is the edited one', same.length === 1 && same[0] === 179.2, JSON.stringify(same));

  // ── 7. the time-aware rule: 2.5% of the last weight + 1% per week since it, at most 20% ──
  const allowed = await p.evaluate(() => ({ y200: window.__athltSanityAllowed(200, 1), m200: window.__athltSanityAllowed(200, 30), w200: window.__athltSanityAllowed(200, 7), long: window.__athltSanityAllowed(200, 400), zero: window.__athltSanityAllowed(200, 0) }));
  console.log('      allowed change for 200 lb:', JSON.stringify(allowed));
  check('7. 200 lb logged yesterday: about 5.3 lb is allowed, so +10 lb asks "Are you sure?"', Math.abs(allowed.y200 - 5.286) < 0.05 && 10 > allowed.y200, String(allowed.y200));
  check('7. 200 lb logged a month ago: about 13.6 lb is allowed, so +10 lb does NOT ask', Math.abs(allowed.m200 - 13.57) < 0.1 && 10 <= allowed.m200, String(allowed.m200));
  check('7. The allowance grows by 1% a week (200 lb: 7 days = 7 lb), starts at 2.5% (5 lb), and is capped at 20% (40 lb)', Math.abs(allowed.w200 - 7) < 0.01 && Math.abs(allowed.zero - 5) < 0.01 && allowed.long === 40, JSON.stringify(allowed));

  // ── 2. far from the last weight: "Are you sure?" (placeholder rule: more than 15%) ──
  await tapAt(`() => [...document.querySelectorAll('#dc-root a')].find(a => /Edit today's weight/.test(a.innerText))`);
  await p.waitForTimeout(800);
  for (let i = 0; i < 5; i++) await key('⌫');
  for (const k of ['4', '0', '0']) await key(k);
  await p.waitForTimeout(200);
  const hzN = msgs.filter(m => m.type === 'haptic').length, np = msgs.filter(m => m.type === 'logWeight').length;
  await submitTap(); await p.waitForTimeout(500);
  const cf = await p.evaluate(() => { const e = document.getElementById('__athlt_confirm'); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; });
  console.log('      confirm:', cf);
  const cbox = await p.evaluate(() => { const c = document.querySelector('#__athlt_confirm .cf-card').getBoundingClientRect(); return { mid: Math.round(c.top + c.height / 2), vh: window.innerHeight, top: Math.round(c.top), bottom: Math.round(c.bottom) }; });
  check('6. The "Are you sure?" box is in the middle of the screen (not at the bottom behind the tab bar)', Math.abs(cbox.mid - cbox.vh / 2) < cbox.vh * 0.15 && cbox.bottom < cbox.vh - 110, JSON.stringify(cbox));
  await shot('ux_confirm_mid');
  check('2. 400 lb after 182.1 lb asks "Are you sure?" with the difference, and saves NOTHING yet', /Are you sure\?/.test(cf || '') && /217\.9 lb different from last time/.test(cf || '') && /Fix/.test(cf) && /Yes, it's right/.test(cf) && msgs.filter(m => m.type === 'logWeight').length === np, cf);
  check('2. The Submit that ends in "Are you sure?" makes exactly ONE haptic, the warning', msgs.filter(m => m.type === 'haptic').slice(hzN).map(m => m.kind).join() === 'warning', msgs.filter(m => m.type === 'haptic').slice(hzN).map(m => m.kind).join());
  await shot('ux_confirm');
  await tapAt(`() => document.querySelector('#__athlt_confirm [data-cf="fix"]')`); await p.waitForTimeout(400);
  const fx = await sheet();
  check('2. "Fix" goes back to the sheet with what was typed still there', fx && fx.field === '400' && !(await p.evaluate(() => document.getElementById('__athlt_confirm'))) && msgs.filter(m => m.type === 'logWeight').length === np, JSON.stringify(fx && fx.field));
  for (let i = 0; i < 3; i++) await key('⌫');
  for (const k of ['1', '8', '0']) await key(k);
  await p.waitForTimeout(200);
  const w1 = msgs.filter(m => m.type === 'haptic').length;
  await submitTap(); await p.waitForTimeout(500);
  check('2. A normal change (179.2 to 180) does not ask', !(await p.evaluate(() => document.getElementById('__athlt_confirm'))) && msgs.filter(m => m.type === 'logWeight').length === np + 1 && msgs.filter(m => m.type === 'haptic').slice(w1).map(m => m.kind).join() === 'success');
  await p.waitForTimeout(2600);
  // a far weight confirmed with "Yes" is saved
  await tapAt(`() => [...document.querySelectorAll('#dc-root a')].find(a => /Edit today's weight/.test(a.innerText))`);
  await p.waitForTimeout(800);
  for (let i = 0; i < 5; i++) await key('⌫');
  for (const k of ['2', '0']) await key(k);
  await submitTap(); await p.waitForTimeout(400);
  await tapAt(`() => document.querySelector('#__athlt_confirm [data-cf="yes"]')`); await p.waitForTimeout(500);
  check('2. "Yes, it\'s right" saves the far weight (20 lb)', msgs.filter(m => m.type === 'logWeight').pop().weightLb === 20 && !!(await p.evaluate(() => document.getElementById('__athlt_logged'))));
  await p.waitForTimeout(2800);

  // ── 16 / 17. past workouts: the picture, and the tap ──
  const rows = await p.evaluate(() => [...document.querySelectorAll('#dc-root div[role="img"][aria-label$=" video"]')].map(e => ({ img: (e.style.backgroundImage || '').slice(0, 30), size: e.style.backgroundSize })));
  console.log('      past workout boxes:', JSON.stringify(rows));
  check('16. Past workouts show their video frame (a picture), not the flat icon, when they have one', rows.length >= 2 && /^url\("?data:image/.test(rows[0].img) && rows[0].size === 'cover' && rows[1].size === 'cover', JSON.stringify(rows));
  check('16. A workout with no video still shows the muscle icon tile (never a black box)', rows.length >= 4 && /linear-gradient|data:image/.test((await p.evaluate(() => document.querySelectorAll('#dc-root div[role="img"][aria-label$=" video"]')[3].style.backgroundImage))) , '');
  const lg8 = await p.evaluate(() => [...document.querySelectorAll('#dc-root div[role="img"][aria-label$=" video"]')].map(e => { const m = e.querySelector('[data-athlt-logged]'); return m ? m.innerText.trim() : ''; }));
  console.log('      logged tiles by workout:', JSON.stringify(lg8));
  check('8. A workout typed in by hand shows a "Session logged" tile with a logged icon (not a video frame); the camera ones do not', lg8[2] === 'Session logged' && !lg8[0] && !lg8[1] && !lg8[3], JSON.stringify(lg8));
  const tileEl = (await p.$$('#dc-root div[role="img"][aria-label$=" video"]'))[2];
  await tileEl.scrollIntoViewIfNeeded();
  await tileEl.screenshot({ path: path.join(ROOT, '.scratch', 'flow', 'ux_logged_tile_el.png') });
  const tileBg = await p.evaluate(() => { const e = document.querySelectorAll('#dc-root div[role="img"][aria-label$=" video"]')[2]; const cs = getComputedStyle(e); return { image: cs.backgroundImage, color: cs.backgroundColor }; });
  check('8. The Session logged tile is a flat LIGHT card (no gradient, not the old dark grey)', tileBg.image === 'none' && tileBg.color === 'rgb(242, 243, 247)', JSON.stringify(tileBg));
  const body8 = await p.evaluate(() => { const e = document.querySelectorAll('#dc-root div[role="img"][aria-label$=" video"]')[2]; const f = e.querySelector('[data-athlt-body]'); const fills = f ? [...f.querySelectorAll('path')].map(x => x.getAttribute('fill')) : []; const name = [...e.querySelectorAll('*')].find(x => x.textContent.trim() === 'Full Body' && !x.querySelector('*')); return { svg: !!(f && f.querySelector('svg')), paths: fills.length, lit: fills.filter(c => c && !/^#(E3E4EA|F1F2F6)$/i.test(c)).length, goldLit: fills.some(c => /^#d?[0-9a-f]{6}$/i.test(c) && c.toLowerCase() === '#d6a043'), label: (e.querySelector('[data-athlt-label]') || {}).textContent, nameColor: name ? getComputedStyle(name).color : null }; });
  console.log('      logged tile body:', JSON.stringify(body8));
  check('8. The Session logged tile shows a small body outline with the trained muscles lit in colour and the rest neutral grey', body8.svg && body8.paths > 10 && body8.lit >= 1 && body8.lit < body8.paths / 2, JSON.stringify(body8));
  check('8. ...with the small "Session logged" label, and the workout name is dark (readable on the light card)', body8.label === 'Session logged' && body8.nameColor === 'rgb(17, 17, 20)', JSON.stringify(body8));
  const inner = await p.evaluate(() => { const e = document.querySelectorAll('#dc-root div[role="img"][aria-label$=" video"]')[2]; return [...e.querySelectorAll('*')].filter(x => /gradient/.test(getComputedStyle(x).backgroundImage)).length; });
  check('4. Session logged tile: no gradient anywhere inside it either (the design shade over the name is gone)', inner === 0, String(inner));
  const play = await p.evaluate(() => [...document.querySelectorAll('#dc-root div[role="img"][aria-label$=" video"]')].map(e => [...e.children].filter(c => c.querySelector && c.querySelector('svg') && !c.hasAttribute('data-athlt-logged') && getComputedStyle(c).display !== 'none').length));
  check('8. The Logged tile has NO play icon; camera tiles keep theirs', play[2] === 0 && play[0] === 1 && play[1] === 1, JSON.stringify(play));
  await shot('ux_logged_tile');
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
