#!/usr/bin/env node
/**
 * scripts/test-paywall-bg.js  (Ari 2026-11-27)
 *   - "The sides show a bluish colour that doesn't match the white page. Make the whole screen one matching background, edge to edge."
 *   - "The whole page must not scroll or move. Only the ranks list scrolls."
 * Real paywallv2.html in Chromium with the EXACT scripts the app injects (scripts/lib/paywall-harness.js), at iPhone 15, 16, 15 Pro Max and 16 Pro Max sizes.
 * Pixels are read from a screenshot: the left and right edge strips, top to bottom, and the empty parts of the page. PW_SRC=<old onboarding.tsx> shows BEFORE.
 */
const path = require('path'); const fs = require('fs');
const { chromium } = require('playwright');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  -> ' + detail : ''}`); if (!ok) failed++; };

(async () => {
  const R = require('./lib/paywall-harness.js');
  const br = await chromium.launch();
  for (const s of R.sizes) {
    const ctx = await br.newContext({ viewport: { width: s.w, height: s.h - s.top }, deviceScaleFactor: 1 }); const pg = await ctx.newPage();
    await pg.addInitScript('window.ReactNativeWebView={postMessage:function(){}};window.__dcFitBoth=1;window.__dcKeepFx=1;'); await pg.addInitScript(R.CUE_ORB_JS); await pg.addInitScript(R.EARLY);
    await pg.goto('file://' + path.resolve(__dirname, '..', 'assets', 'app screens', 'paywallv2.html').split(path.sep).join('/'));
    await pg.waitForTimeout(1500); await pg.evaluate(R.DC); await pg.evaluate(R.TIDY); await pg.waitForTimeout(2000);
    const shot = path.join(__dirname, '..', '.scratch', `paywall-bg-${s.w}${process.env.PW_SRC ? '-before' : ''}.png`);
    await pg.screenshot({ path: shot });
    // read pixels in the page itself from the screenshot (a canvas)
    const px = await pg.evaluate(async ({ b64, w, h }) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const at = (i, j) => Array.from(x.getImageData(i, j, 1, 1).data.slice(0, 3));
      const strips = []; for (let j = 4; j < h - 4; j += 12) { strips.push(at(2, j), at(w - 3, j)); }
      return { strips, emptyTop: at(Math.round(w / 2), 18), emptyBottom: at(Math.round(w / 2), h - 6) };
    }, { b64: fs.readFileSync(shot).toString('base64'), w: s.w, h: s.h - s.top });
    const notWhite = px.strips.filter((p) => p.some((v) => v < 253));
    const blueish = px.strips.filter((p) => p[2] - p[0] >= 3);
    console.log(`  ${s.n}: edge pixels not white ${notWhite.length} of ${px.strips.length}${notWhite.length ? ' e.g. ' + JSON.stringify(notWhite.slice(0, 3)) : ''}; bluish ${blueish.length}; top ${px.emptyTop}, bottom ${px.emptyBottom}`);
    if (process.env.PW_SRC) { await ctx.close(); continue; }
    check(`${s.n}: the whole screen is ONE background: both edge strips are plain white top to bottom, no bluish tint, and so are the empty top and bottom of the page`, notWhite.length === 0 && blueish.length === 0 && px.emptyTop.every((v) => v >= 253) && px.emptyBottom.every((v) => v >= 253), JSON.stringify({ n: notWhite.slice(0, 4), t: px.emptyTop, b: px.emptyBottom }));
    // the page does not scroll; the list does
    const sc = await pg.evaluate(async () => {
      const list = document.querySelector('#dc-root [data-scroll]');
      const docMax = document.scrollingElement.scrollHeight - innerHeight;
      window.scrollTo(0, 400); const afterScrollTo = window.scrollY;
      return { docMax, afterScrollTo, listMax: list.scrollHeight - list.clientHeight, ov: getComputedStyle(document.documentElement).overflowY + '/' + getComputedStyle(document.body).overflowY };
    });
    await pg.mouse.move(s.w / 2, 30); await pg.mouse.wheel(0, 600); await pg.waitForTimeout(300);
    const top = await pg.evaluate(() => ({ y: window.scrollY, list: document.querySelector('#dc-root [data-scroll]').scrollTop }));
    await pg.mouse.move(s.w / 2, (s.h - s.top) * 0.4); await pg.mouse.wheel(0, 300); await pg.waitForTimeout(400);
    const list = await pg.evaluate(() => ({ y: window.scrollY, list: document.querySelector('#dc-root [data-scroll]').scrollTop }));
    check(`${s.n}: the PAGE never scrolls (nothing to scroll, scrolling is off, a scroll stays at 0); the LIST inside it still scrolls`, sc.afterScrollTo === 0 && top.y === 0 && list.y === 0 && list.list > 0 && sc.listMax > 0 && /hidden/.test(sc.ov), JSON.stringify({ sc, top, list }));
    await ctx.close();
  }
  await br.close();
  if (!process.env.PW_SRC) {
    const ob = fs.readFileSync(path.join(__dirname, '..', 'app', 'onboarding.tsx'), 'utf8');
    check('the app: the paywall web view does not scroll (scrollEnabled off) and has no bounce; the strip under the status bar is the same white', ob.includes("scrollEnabled={htmlKey !== 'paywall'}") && ob.includes("bounces={isDcPage && htmlKey !== 'paywall' && htmlKey !== 'giftOffer'}") && ob.includes("const pageBg = htmlKey === 'giftOffer' ? '#f4f4f7' : '#ffffff';"));
  }
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
