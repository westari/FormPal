#!/usr/bin/env node
/**
 * scripts/test-home-cue.js
 * Home tab Cue card on the REAL home.html with the EXACT injection the app ships.
 *   a) the design's white card is back behind the "This week" card
 *   b) the orb has no square layer around it (no blend-mode texture, no blurred full-size layers) and nothing but the
 *      orb is painted inside its 44x44 box: the corner pixels equal the card colour
 * Screenshot: .scratch/home-cue-after.png
 */
const path = require('path');
const { PNG } = require('pngjs');
const { openHome, ROOT } = require('./lib/home-harness.js');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

(async () => {
  const { browser, page } = await openHome({ inject: true });
  await page.evaluate(() => { document.querySelector('div[style*="margin: -26px 8px 0"]').closest('[data-scroll]').scrollTop = 120; });
  await page.addStyleTag({ content: '*{animation-play-state:paused!important}' });
  await page.waitForTimeout(300);
  const card = await page.evaluate(() => {
    const el = document.querySelector('div[style*="margin: -26px 8px 0"]'); const c = getComputedStyle(el);
    const week = [...document.querySelectorAll('div')].find((d) => d.textContent.trim().startsWith('This week') && d.getBoundingClientRect().height > 100 && d.getBoundingClientRect().height < 220);
    return { bg: c.backgroundImage, shadow: c.boxShadow, z: c.zIndex, r: el.getBoundingClientRect().toJSON(), wr: week ? week.getBoundingClientRect().toJSON() : null };
  });
  check('Cue card has the design\'s white gradient background again', /linear-gradient/.test(card.bg) && /255, 255, 255/.test(card.bg), card.bg.slice(0, 70));
  check('Cue card has the design\'s shadow again', card.shadow !== 'none' && /rgba/.test(card.shadow), card.shadow.slice(0, 50));
  check('the card is layered behind the This week card (its top edge tucks under it)', card.wr && card.r.top < card.wr.bottom, `card top ${Math.round(card.r.top)} < week bottom ${card.wr && Math.round(card.wr.bottom)}`);
  const orb = await page.evaluate(() => {
    const w = document.querySelector('div[style*="hm-orb-breathe"]');
    const shown = (sel) => [...w.querySelectorAll(sel)].filter((e) => getComputedStyle(e).display !== 'none');
    const blur = [...w.querySelectorAll('div')].filter((e) => getComputedStyle(e).filter !== 'none').length;
    return { blend: shown('[style*="mix-blend-mode"]').length, blur, bg: getComputedStyle(w).backgroundImage, sh: getComputedStyle(w).boxShadow, rect: w.getBoundingClientRect().toJSON() };
  });
  check('orb: no blend-mode texture layer, no blurred full-size layers, no box on its wrapper', orb.blend === 0 && orb.blur === 0 && orb.bg === 'none' && orb.sh === 'none', JSON.stringify(orb));
  const buf = await page.screenshot({ clip: { x: orb.rect.x - 2, y: orb.rect.y - 2, width: orb.rect.width + 4, height: orb.rect.height + 4 } });
  const img = PNG.sync.read(buf);
  const px = (x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
  // a square tint would show as a hard step exactly at the 44px box edge: compare each pixel just outside the box
  // with the one just inside it, along the corner stretches of all four edges (the soft round glow changes slowly)
  const d = (a, b) => Math.max(...a.map((v, k) => Math.abs(v - b[k])));
  let step = 0;
  const W = img.width, Hh = img.height;
  for (let t = 3; t <= 10; t++) {
    step = Math.max(step, d(px(1, t), px(3, t)), d(px(W - 2, t), px(W - 4, t)), d(px(1, Hh - 1 - t), px(3, Hh - 1 - t)), d(px(W - 2, Hh - 1 - t), px(W - 4, Hh - 1 - t)),
      d(px(t, 1), px(t, 3)), d(px(W - 1 - t, 1), px(W - 1 - t, 3)), d(px(t, Hh - 2), px(t, Hh - 4)), d(px(W - 1 - t, Hh - 2), px(W - 1 - t, Hh - 4)));
  }
  check('orb: no hard edge at its 44px box (nothing square is painted around the orb)', step <= 4, `largest step across the box edge ${step}`);
  const el = await page.$('div[style*="margin: -26px 8px 0"]');
  const bb = await el.boundingBox();
  await page.screenshot({ path: path.join(ROOT, '.scratch', 'home-cue-after.png'), clip: { x: 0, y: Math.max(0, bb.y - 140), width: 390, height: Math.min(844 - Math.max(0, bb.y - 140), bb.height + 170) } });
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
