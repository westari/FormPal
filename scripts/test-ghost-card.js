#!/usr/bin/env node
/**
 * scripts/test-ghost-card.js
 *
 * The preloaded Workout Complete card must be 100% invisible while it waits.
 *
 * Renders the REAL home / progress / profile design files as the "screen", with
 * the REAL preloaded Workout Complete page (shipped scaffold + data, fully
 * warmed up, white card with its text) layered the way the host lays it out:
 *
 *   OLD  host above the navigator, hidden layer at opacity 0.01  -> REPRODUCES
 *        the ghost (screenshot differs from the screen alone)
 *   NEW  host BEHIND the navigator, hidden layer opacity 0, parked off-screen,
 *        no pointer events (the constants WarmSurfaces.tsx actually uses)
 *        -> pixel-identical to the screen alone, and a tap lands on the screen.
 *
 * Screenshots: .scratch/ghost-<screen>-{old,new,clean}.png
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { PNG } = require('pngjs');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const WARM = require('../components/WarmSurfaces.tsx');
const recap = require('../lib/recapInject.ts');

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const U = (f) => pathToFileURL(path.join(ROOT, 'assets', 'app screens', f)).href;
const SCREENS = { home: 'home.html', progress: 'progress.html', profile: 'profile.html' };
const W = 390, H = 852;

function diff(a, b) {
  const A = PNG.sync.read(a), B = PNG.sync.read(b);
  let n = 0, max = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
    if (d > 0) { n++; if (d > max) max = d; }
  }
  return { pixels: n, max };
}

(async () => {
  const browser = await chromium.launch();
  for (const [name, file] of Object.entries(SCREENS)) {
    console.log(`--- ${name} ---`);
    // host page: a "screen" iframe (the navigator) and a "warm" iframe (the host)
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    const hostFile = path.join(ROOT, '.scratch', `ghost-host-${name}.html`);
    fs.writeFileSync(hostFile, `<body style="margin:0;background:#0A0B0C;position:relative;width:${W}px;height:${H}px;overflow:hidden">
      <div id="nav" style="position:absolute;inset:0"><iframe id="screen" style="border:0;width:${W}px;height:${H}px" src="${U(file)}"></iframe></div>
      <div id="host" style="position:absolute;inset:0"><iframe id="warm" style="border:0;width:${W}px;height:${H}px" src="${U('workoutrecap.html')}"></iframe></div></body>`);
    await page.goto(pathToFileURL(hostFile).href);
    await page.waitForTimeout(2500);
    const frames = page.frames();
    const screenFrame = frames.find(f => f.url().includes(file));
    // freeze the screen's own animations so a pixel diff can only come from the hidden card
    await screenFrame.addStyleTag({ content: '*{animation:none!important;transition:none!important;caret-color:transparent!important}' });
    const warm = frames.find(f => f.url().includes('workoutrecap'));
    await warm.evaluate(WARM.BASE_JS.recap);
    await warm.waitForFunction(() => window.__fpFitted && document.querySelectorAll('#dc-root div').length > 8, null, { timeout: 8000 });
    await warm.evaluate(recap.recapDataJs({ totalReps: 20, moves: 2, pct: 88, hasFormData: true, durationSec: 600, overview: 'GHOST-CHECK overview text', hasVideo: false }));
    await page.waitForTimeout(500);
    check(`${name}: preloaded card is fully rendered (white card, real text)`, await warm.evaluate(() => /GHOST-CHECK/.test(document.body.innerText)));

    const setLayout = (mode) => page.evaluate(({ mode, z, op, W }) => {
      const nav = document.getElementById('nav'), host = document.getElementById('host');
      nav.style.cssText = 'position:absolute;inset:0;z-index:0';
      if (mode === 'clean') { host.style.display = 'none'; return; }
      host.style.display = '';
      if (mode === 'old') { host.style.cssText = 'position:absolute;inset:0;z-index:1000;opacity:0.01'; return; }
      // new: host behind the navigator, layer transparent + parked + no pointer events
      host.style.cssText = `position:absolute;inset:0;z-index:${z};pointer-events:none;opacity:${op};transform:translateX(${W}px)`;
    }, { mode, z: WARM.HOST_Z_HIDDEN, op: WARM.LAYER_OPACITY_HIDDEN, W });

    await setLayout('clean');
    const clean = await page.screenshot({ path: path.join(ROOT, '.scratch', `ghost-${name}-clean.png`) });
    await setLayout('old');
    const old = await page.screenshot({ path: path.join(ROOT, '.scratch', `ghost-${name}-old.png`) });
    const dOld = diff(clean, old);
    // Chromium rounds a 1% layer to (almost) nothing; the phone's compositor showed it. So prove the
    // method itself can see a ghost (same layering at 6%), and report what 1% does here.
    console.log(`      old layering at 1%: ${dOld.pixels} pixels differ in Chromium (the phone showed it faintly)`);
    await page.evaluate(() => { document.getElementById('host').style.opacity = '0.06'; });
    const faint = diff(clean, await page.screenshot({ path: path.join(ROOT, '.scratch', `ghost-${name}-old6.png`) }));
    check(`${name}: REPRODUCED a ghost with the old layering (host above the screen, faint): the card shows through`, faint.pixels > 100, `${faint.pixels} pixels differ (6% opacity), max channel diff ${faint.max}`);
    await setLayout('new');
    const nw = await page.screenshot({ path: path.join(ROOT, '.scratch', `ghost-${name}-new.png`) });
    const box = await page.evaluate(() => document.getElementById('host').getBoundingClientRect().left);
    const hit = await page.evaluate(() => { const e = document.elementFromPoint(200, 400); return e && e.closest('#nav') ? 'screen' : (e && e.closest('#host') ? 'WARM CARD' : (e ? e.tagName : 'none')); });
    await setLayout('clean');
    const clean2 = await page.screenshot({ path: path.join(ROOT, '.scratch', `ghost-${name}-clean2.png`) });
    // the screens themselves redraw a few thousand pixels between any two shots (live images), so
    // the yardstick is that noise floor, not zero
    const noise = diff(clean, clean2).pixels;
    const dNew = diff(clean2, nw).pixels;
    console.log(`      screen alone vs screen alone: ${noise}px (noise floor)   old layering vs screen: ${dOld.pixels}px   new layering vs screen: ${dNew}px`);
    check(`${name}: with the new layering the screen is unchanged (within the screen's own noise; ghost was ${Math.round(dOld.pixels / Math.max(1, dNew))}x more)`, dNew <= noise * 1.5 + 100 && dNew * 50 < dOld.pixels);
    check(`${name}: the hidden layer is parked completely off-screen`, box >= W, `left=${box}`);
    check(`${name}: a tap on white space lands on the screen, never the hidden card`, hit === 'screen', hit);
    await page.close();
  }
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
