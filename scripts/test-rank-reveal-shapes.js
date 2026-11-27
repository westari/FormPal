#!/usr/bin/env node
/**
 * scripts/test-rank-reveal-shapes.js  (round 13)
 * The rank reveal after the wheel (assets/app screens/rankrevealreel.html, the onboarding's 'rankReveal' step): every shield in the reel keeps its REAL shape.
 * The design file carried its own small copies of the 7 shields; its Champion copy was squashed to 150 x 120 (the real picture, assets/ranks/champion.png,
 * is 226 x 320: taller than wide, with its crown), so the Champion row right under Bronze looked squished. That one picture is replaced by the real one
 * (scaled to 106 x 150). Checked on the real packed file, run as the app runs it (the rank set before load), at the EXACT moment the rank lands and after.
 * Screenshots: .scratch/rank-reveal-landing.png, .scratch/rank-reveal-after.png
 */
const path = require('path'), fs = require('fs');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const pngWH = (b) => [b.readUInt32BE(16), b.readUInt32BE(20)];
const REAL = {};
for (const k of ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'champion']) { const [w, h] = pngWH(fs.readFileSync(path.join(ROOT, 'assets', 'ranks', k + '.png'))); REAL[k] = w / h; }

(async () => {
  const browser = await chromium.launch();
  for (const key of ['bronze', 'silver']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await page.addInitScript((k) => {
      window.__FORMPAL_RANK_KEY = k; window.ReactNativeWebView = { postMessage() {} };
      // catch the exact moment of the landing: the reel's land() puts the rr-land animation on the row
      window.__landAt = null;
      new MutationObserver((ms) => { for (const m of ms) if (m.target.style && /rr-land/.test(m.target.style.animation || '') && !window.__landAt) window.__landAt = performance.now(); })
        .observe(document, { attributes: true, attributeFilter: ['style'], subtree: true });
    }, key);
    await page.goto(pathToFileURL(process.env.REVEAL_FILE || path.join(ROOT, 'assets', 'app screens', 'rankrevealreel.html')).href);
    await page.waitForFunction(() => window.__landAt, null, { timeout: 15000 });
    const measure = () => page.evaluate(() => {
      const imgs = [...document.querySelectorAll('img')].filter((i) => i.getBoundingClientRect().height > 0 && getComputedStyle(i.closest('[style]') || i).opacity !== '0');
      return imgs.map((i) => {
        const r = i.getBoundingClientRect(), fit = getComputedStyle(i).objectFit;
        // what is really painted: the picture's own proportions inside the box (object-fit: contain) — the box is square, so this is the shape on screen
        const nat = i.naturalWidth / i.naturalHeight;
        const shown = fit === 'contain' || fit === 'scale-down' ? nat : r.width / r.height;
        const row = i.parentElement; const name = (row.textContent || '').trim().split(/\s+/)[0];
        return { name, nat: +nat.toFixed(3), shown: +shown.toFixed(3), fit, top: Math.round(r.top), sx: +(r.width / r.height).toFixed(3), visible: r.bottom > 0 && r.top < innerHeight };
      }).filter((x) => x.visible);
    });
    const atLand = await measure();
    await page.screenshot({ path: path.join(ROOT, '.scratch', key === 'bronze' ? 'rank-reveal-landing.png' : 'rank-reveal-landing-silver.png') });
    await page.waitForTimeout(1600);
    const after = await measure();
    if (key === 'bronze') await page.screenshot({ path: path.join(ROOT, '.scratch', 'rank-reveal-after.png') });
    const keyOf = (n) => (n || '').toLowerCase();
    const bad = (list) => list.filter((x) => { const k = Object.keys(REAL).find((rk) => keyOf(x.name).startsWith(rk)); const want = k ? REAL[k] : null; return want == null || Math.abs(x.shown - want) > 0.02 || x.sx !== 1; });
    // which shields are on screen at that moment (the Champion row sits right under Bronze)
    console.log(`      ${key}: at landing:`, atLand.map((x) => x.name + ' ' + x.shown).join(', '));
    const champ = atLand.find((x) => /^champion/i.test(x.name)) || after.find((x) => /^champion/i.test(x.name));
    if (key === 'bronze') check('the Champion shield is on screen right under Bronze at the moment the rank lands', !!champ, JSON.stringify(atLand.map((x) => x.name)));
    check(`${key}: AT THE MOMENT the rank lands, every visible shield is at its real shape (Champion ${REAL.champion.toFixed(3)} wide per tall, the others square), boxes never stretched`, atLand.length >= 3 && bad(atLand).length === 0, JSON.stringify(bad(atLand)));
    check(`${key}: and after the landing bounce, the same`, after.length >= 3 && bad(after).length === 0, JSON.stringify(bad(after)));
    if (champ) check(`${key}: the Champion picture in the reel is the real one: 106 x 150 (taller than wide), was 150 x 120`, Math.abs(champ.nat - 106 / 150) < 0.01, String(champ.nat));
    await page.close();
  }
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
