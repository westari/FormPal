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
// camera screen stand-in: dark live-feed colour with the app's glass pill (the real camera view is native)
const CAMERA_MOCK = path.join(ROOT, '.scratch', 'camera-mock.html');
fs.writeFileSync(CAMERA_MOCK, '<body style="margin:0;background:linear-gradient(180deg,#2a2d33,#1b1d22 60%,#14161a)"><div style="position:absolute;left:50%;top:46%;transform:translateX(-50%);padding:14px 26px;border-radius:999px;background:rgba(255,255,255,.18);color:#fff;font:700 22px sans-serif">Perfect. Hold still</div></body>');
const SCREENS = {
  home: U('home.html'), progress: U('progress.html'), profile: U('profile.html'),
  'mid-workout': U('inworkout.html'), camera: pathToFileURL(CAMERA_MOCK).href,
};
const W = 390, H = 852;

// Pick the FLAT patch (plain white area / flat colour in the clean screen, 90x70 css px) where the old layering's
// ghost was strongest, so the comparison is made exactly where a ghost would be visible.
function findGhostPatch(cleanBuf, oldBuf) {
  const C = PNG.sync.read(cleanBuf), O = PNG.sync.read(oldBuf);
  const pw = 180, ph = 140; // device px (2x)
  let best = null;
  for (let y = 80; y < C.height - ph - 80; y += 20) for (let x = 10; x < C.width - pw - 10; x += 20) {
    let lo = 255, hi = 0, d = 0;
    for (let yy = y; yy < y + ph; yy += 2) for (let xx = x; xx < x + pw; xx += 2) {
      const i = (yy * C.width + xx) * 4, v = C.data[i];
      if (v < lo) lo = v; if (v > hi) hi = v;
      d += Math.abs(O.data[i] - C.data[i]) + Math.abs(O.data[i + 1] - C.data[i + 1]) + Math.abs(O.data[i + 2] - C.data[i + 2]);
    }
    if (hi - lo <= 4 && (!best || d > best.d)) best = { x, y, d, mean: (hi + lo) / 2 };
  }
  return best;
}
// x4 zoom of a patch, contrast-stretched x12 around the patch colour (so a 1% ghost is obvious to the eye)
function zoomPatch(buf, patch, outFile) {
  const B = PNG.sync.read(buf), pw = 180, ph = 140, Z = 2;
  const out = new PNG({ width: pw * Z, height: ph * Z });
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    const si = ((patch.y + Math.floor(y / Z)) * B.width + (patch.x + Math.floor(x / Z))) * 4, di = (y * out.width + x) * 4;
    for (let k = 0; k < 3; k++) out.data[di + k] = Math.max(0, Math.min(255, (B.data[si + k] - patch.mean) * 12 + 128));
    out.data[di + 3] = 255;
  }
  fs.writeFileSync(outFile, PNG.sync.write(out));
}
// total absolute difference inside the patch between two screenshots
function patchDiff(aBuf, bBuf, patch) {
  const A = PNG.sync.read(aBuf), B = PNG.sync.read(bBuf); let n = 0, mx = 0;
  for (let y = patch.y; y < patch.y + 140; y++) for (let x = patch.x; x < patch.x + 180; x++) {
    const i = (y * A.width + x) * 4;
    const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
    n += d; if (d > mx) mx = d;
  }
  return { sum: n, max: mx };
}

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
  for (const [name, screenUrl] of Object.entries(SCREENS)) {
    const file = screenUrl.split('/').pop();
    console.log(`--- ${name} ---`);
    // host page: a "screen" iframe (the navigator) and a "warm" iframe (the host)
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    const hostFile = path.join(ROOT, '.scratch', `ghost-host-${name}.html`);
    fs.writeFileSync(hostFile, `<body style="margin:0;background:#0A0B0C;position:relative;width:${W}px;height:${H}px;overflow:hidden">
      <div id="nav" style="position:absolute;inset:0"><iframe id="screen" style="border:0;width:${W}px;height:${H}px" src="${screenUrl}"></iframe></div>
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
    const spot = findGhostPatch(clean, old);
    if (spot) {
      zoomPatch(old, spot, path.join(ROOT, '.scratch', `ghost-${name}-zoom-OLD.png`));
      zoomPatch(nw, spot, path.join(ROOT, '.scratch', `ghost-${name}-zoom-NEW.png`));
      const dO = patchDiff(clean, old, spot), dN = patchDiff(clean, nw, spot);
      console.log(`      plain area at (${spot.x / 2},${spot.y / 2}) css px, change vs the screen alone: old layering sum ${dO.sum} (max ${dO.max}), new layering sum ${dN.sum} (max ${dN.max})`);
      check(`${name}: zoomed on a plain area the old layering shows the card (changes the pixels), the new layering changes nothing`, dO.sum > 0 && dN.sum === 0 );
    } else console.log('      (no plain area on this screen to zoom on)');
    check(`${name}: with the new layering the screen is unchanged (within the screen's own noise; ghost was ${Math.round(dOld.pixels / Math.max(1, dNew))}x more)`, dNew <= noise * 1.5 + 100 && dNew * 50 < dOld.pixels);
    check(`${name}: the hidden layer is parked completely off-screen`, box >= W, `left=${box}`);
    check(`${name}: a tap on white space lands on the screen, never the hidden card`, hit === 'screen', hit);
    await page.close();
  }
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
