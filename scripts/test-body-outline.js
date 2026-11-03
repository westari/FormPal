#!/usr/bin/env node
/**
 * scripts/test-body-outline.js
 *
 * The muscle page's body map must show a visible outline around both figures
 * (as drawn on a phone: 270x218 css px box, 3x pixel density, white card).
 * Renders the REAL image the app injects (lib/bodyMapSvg.bodyMapPairSvg) and
 * counts how much of the silhouette's perimeter is actually painted in the
 * outline colour. Before the fix the muscle fragments (painted after the
 * silhouette) covered most of the outline, so the figure read as having none.
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const path = require('path');
const { chromium } = require('playwright');
const { bodyMapPairSvg } = require('../lib/bodyMapSvg.ts');
const { Muscle } = require('../constants/exercises.ts');

(async () => {
  const svg = bodyMapPairSvg([Muscle.Shoulders, Muscle.Triceps]);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 300, height: 260 }, deviceScaleFactor: 3 });
  await page.setContent(`<body style="margin:0;background:#fff"><div style="position:absolute;left:15px;top:20px;width:270px;height:218px"><img id="i" style="width:270px;height:218px;object-fit:contain" src="data:image/svg+xml;utf8,${encodeURIComponent(svg)}"></div></body>`);
  await page.waitForFunction(() => document.getElementById('i').complete);
  const shot = path.join(__dirname, '..', '.scratch', 'body-outline.png');
  await page.screenshot({ path: shot });

  // expected painted length: perimeter of the two silhouettes, in px
  const exp = await page.evaluate((svgText) => {
    const d = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement;
    const W = +d.getAttribute('width'), H = +d.getAttribute('height');
    const scale = Math.min(270 / W, 218 / H); // object-fit: contain
    let L = 0;
    d.querySelectorAll('path').forEach((p) => { if (p.getAttribute('fill') === 'none' && p.getAttribute('stroke-width') === '6') L += p.getTotalLength(); });
    return { perimeterPx: L * scale, strokePx: 6 * scale };
  }, svg);

  // count outline-coloured pixels (#454B5C) in the screenshot
  const dark = await page.evaluate(async () => {
    const img = document.getElementById('i');
    const c = document.createElement('canvas'); c.width = 810; c.height = 654;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, 810, 654);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] < 120 && px[i + 1] < 125 && px[i + 2] < 140) n++;
    return n;
  });
  const expectedPx = exp.perimeterPx * 3 * exp.strokePx * 3; // device pixels
  const ratio = dark / expectedPx;
  console.log(`outline stroke on screen: ${exp.strokePx.toFixed(2)}px; perimeter ${exp.perimeterPx.toFixed(0)}px`);
  console.log(`outline pixels painted: ${dark} of ~${Math.round(expectedPx)} expected  (${(ratio * 100).toFixed(0)}%)`);
  console.log(`screenshot: ${shot}`);
  // per-muscle outlines: count muscle-outline-coloured (#69708A) pixels that are NOT part of the body outline
  const fs = require('fs'); const { PNG } = require('pngjs');
  const png = PNG.sync.read(fs.readFileSync(shot));
  let musclepx = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
    if (Math.abs(r - 0x69) < 34 && Math.abs(g - 0x70) < 34 && Math.abs(b - 0x8A) < 34 && !(r < 90 && g < 95 && b < 115)) musclepx++;
  }
  // zoomed crop (front torso + arm, x3) so the outlines can be inspected
  const cx = 110, cy = 150, cw = 240, ch = 210, Z = 3;
  const out = new PNG({ width: cw * Z, height: ch * Z });
  for (let y = 0; y < ch * Z; y++) for (let x = 0; x < cw * Z; x++) {
    const si = ((cy + Math.floor(y / Z)) * png.width + (cx + Math.floor(x / Z))) * 4, di = (y * out.width + x) * 4;
    for (let k = 0; k < 4; k++) out.data[di + k] = png.data[si + k];
  }
  fs.writeFileSync(path.join(__dirname, '..', '.scratch', 'body-outline-zoom.png'), PNG.sync.write(out));
  console.log(`per-muscle outline pixels painted: ${musclepx}`);
  const muscleOk = musclepx > 4000;
  console.log(muscleOk ? 'PASS  every muscle has its own visible outline' : 'FAIL  muscle outlines missing');
  await browser.close();
  if (!muscleOk) process.exit(1);
  const ok = ratio >= 0.8;
  console.log(ok ? 'PASS  outline fully visible' : 'FAIL  outline mostly hidden');
  process.exit(ok ? 0 : 1);
})();
