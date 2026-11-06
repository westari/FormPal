#!/usr/bin/env node
/**
 * scripts/test-cue-orb.js
 *
 * Cue's orb looks the same everywhere (lib/cueOrb.ts). WebKit (closest to the phone), the REAL design files with
 * the exact injection each screen ships:
 *   Home         the Home stylesheet (HIDE_FAKE_CHROME_CSS, built from CUE_ORB_CSS)
 *   Cue chat     app/cue.tsx:        DC_VIEWPORT_JS + CUE_ORB_JS
 *   Meet Cue     app/onboarding.tsx: VIEWPORT_JS + CUE_ORB_JS  (all DC pages)
 * plus the native orb (components/CueOrb.tsx draws cueOrbSvg()) next to the web one.
 * Screenshots: .scratch/cue-orb-*.png, side by side in .scratch/cue-orb-compare.png
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const Module = require('module'); const orig = Module._load;
Module._load = function (r) { if (/constants\/api$/.test(r)) return { MYPAL_API_URL: 'http://localhost/none' }; return orig.apply(this, arguments); };
const fs = require('fs');
const path = require('path'); const { pathToFileURL } = require('url'); const { webkit } = require('playwright');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const { CUE_ORB_JS, cueOrbSvg } = require('../lib/cueOrb.ts');
const home = require('../app/(tabs)/index.tsx');
const helpers = require('../lib/dcWebviewHelpers.ts');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const U = (f) => pathToFileURL(path.join(ROOT, 'assets', 'app screens', f)).href;
const FREEZE = '*{animation-play-state:paused!important;animation-delay:-1s!important}';

const ORB = () => [...document.querySelectorAll('div[style*="hm-orb-breathe"]')].map(e => {
  const r = e.getBoundingClientRect();
  const tex = [...e.querySelectorAll('div')].filter(d => /mix-blend-mode/.test(d.getAttribute('style') || ''));
  const blur = [...e.querySelectorAll('div')].filter(d => /filter: blur/.test(d.getAttribute('style') || ''));
  return { w: Math.round(r.width), bg: getComputedStyle(e).backgroundImage, shadow: getComputedStyle(e).boxShadow,
    texHidden: tex.length > 0 && tex.every(d => getComputedStyle(d).display === 'none'), blurOff: blur.length > 0 && blur.every(d => getComputedStyle(d).filter === 'none'),
    x: r.x, y: r.y, h: r.height };
});

(async () => {
  const b = await webkit.launch();
  async function open(file, init, after) {
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 4, isMobile: true })).newPage();
    await p.exposeFunction('__post', () => {});
    await p.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
    if (init) await p.addInitScript(init);
    await p.goto(U(file)); await p.waitForTimeout(2200);
    if (after) await after(p);
    await p.addStyleTag({ content: FREEZE });
    await p.waitForTimeout(300);
    return p;
  }
  const snap = async (p, name) => {
    await p.evaluate(() => { const e = [...document.querySelectorAll('div[style*="hm-orb-breathe"]')].find(x => { const r = x.getBoundingClientRect(); return r.width >= 28 && r.width <= 80 && Math.abs(r.width - r.height) < 3; }); if (e) e.scrollIntoView({ block: 'center' }); });
    await p.waitForTimeout(200);
    const o = (await p.evaluate(ORB)).filter(x => x.w >= 28 && x.w <= 80 && Math.abs(x.w - x.h) < 3 && x.y >= 0 && x.y < 840).sort((a, c) => c.w - a.w)[0];
    const buf = await p.screenshot({ clip: { x: Math.max(0, o.x - 14), y: Math.max(0, o.y - 14), width: o.w + 28, height: o.h + 28 } });
    fs.writeFileSync(path.join(ROOT, '.scratch', `cue-orb-${name}.png`), buf);
    return o;
  };

  // BEFORE: the bare design orbs (textured)
  for (const f of ['cue.html', 'meetcue.html']) {
    const p = await open(f, null);
    const o = (await p.evaluate(ORB))[0];
    check(`BEFORE ${f}: the design's own orb has its texture layer and blurred blobs ON`, !o.texHidden && !o.blurOff);
    await snap(p, `before-${f.replace('.html', '')}`);
    await p.context().close();
  }
  // AFTER
  {
    const p = await open('cue.html', helpers.DC_VIEWPORT_JS + CUE_ORB_JS);
    await snap(p, 'cue'); const all = await p.evaluate(ORB);
    check('Cue chat: clean Cue orb (texture layer off, blurred blobs off, no wrapper background)', all.length > 0 && all.every(x => x.texHidden && x.blurOff && x.bg === 'none'), JSON.stringify(all[0]));
    await p.context().close();
  }
  {
    const p = await open('meetcue.html', CUE_ORB_JS);
    await snap(p, 'meetcue'); const all = await p.evaluate(ORB);
    check('Meet Cue (onboarding): same clean orb', all.length > 0 && all.every(x => x.texHidden && x.blurOff && x.bg === 'none'));
    await p.context().close();
  }
  {
    const plan = { id: 'p', profile: {}, currentWorkoutIndex: 0, workouts: [{ id: 'w', splitLabel: 'Upper Body', exercises: [{}] }] };
    const p = await open('home.html', null, async (pp) => { await pp.evaluate(home.HOME_SCALE_FIT_JS); await pp.evaluate(home.buildHomeInjectJs(plan, [], 62, 34)); await pp.waitForTimeout(1500); });
    await snap(p, 'home'); const all = await p.evaluate(ORB);
    check('Home: same clean orb (now from the shared CUE_ORB_CSS)', all.length > 0 && all.every(x => x.texHidden && x.blurOff && x.bg === 'none'));
    await p.context().close();
  }
  // the page injection re-installs itself if the page removes it (the design bundle replaces <html> after load)
  {
    const p = await open('cue.html', helpers.DC_VIEWPORT_JS + CUE_ORB_JS);
    const had = await p.evaluate(() => !!document.getElementById('__cue_orb'));
    await p.evaluate(() => { const s = document.getElementById('__cue_orb'); if (s) s.remove(); });
    await p.waitForTimeout(400);
    check('the style puts itself back if the page removes it', had && await p.evaluate(() => !!document.getElementById('__cue_orb')));
    await p.context().close();
  }
  // native orb (SVG) next to the web orbs, same size
  {
    const p = await (await b.newContext({ viewport: { width: 520, height: 220 }, deviceScaleFactor: 3 })).newPage();
    const png = (n) => 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, '.scratch', `cue-orb-${n}.png`)).toString('base64');
    await p.setContent(`<body style="margin:0;background:#eeeef1;display:flex;gap:18px;align-items:center;padding:18px;font:11px sans-serif">
      <div><img src="${png('home')}" style="height:150px"><br>Home (web)</div>
      <div><img src="${png('cue')}" style="height:150px"><br>Cue chat (web)</div>
      <div><div style="width:150px;height:150px">${cueOrbSvg().replace('<svg ', '<svg width="150" height="150" ')}</div>Native (plus menu)</div></body>`);
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(ROOT, '.scratch', 'cue-orb-compare.png') });
    const buf = await p.screenshot({ clip: { x: 18 + 150 + 18 + 150 + 18 + 75, y: 18 + 112, width: 4, height: 4 } });
    const im = PNG.sync.read(buf); const i = (6 * im.width + 6) * 4;
    check('native orb draws a blue body (not blank)', im.data[2] > 220 && im.data[0] < 190, `rgb(${im.data[0]},${im.data[1]},${im.data[2]})`);
    await p.context().close();
  }
  await b.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
