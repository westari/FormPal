#!/usr/bin/env node
/**
 * scripts/test-muscle-map-back.js  (round 8, item 5)
 * The Progress tab's Muscle Map page: the design's white round back button is hidden and the app's standard Liquid Glass back button
 * (components/GlassBackButton.tsx) is drawn above the page in its place. Real progress.html + the shipped injection in Chromium (real clicks),
 * then the native side as source order.
 */
const fs = require('fs'), path = require('path');
const { openProgress, makeData, ROOT } = require('./lib/progress-harness.js');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');

(async () => {
  const { browser, page: p, msgs } = await openProgress(makeData());
  const maps = () => msgs.filter((m) => m.type === 'mapBack');
  check('on the Progress page itself nothing is reported (no back button there)', maps().every((m) => m.open === false) );
  const m0 = msgs.length;
  await p.evaluate(() => document.querySelector('#dc-root a[style*="padding: 18px 18px 14px"]').click());
  await p.waitForTimeout(150);
  const early = await p.evaluate(() => { const l = [...document.querySelectorAll('a[aria-label="Back"]')].find((a) => a.nextElementSibling && a.nextElementSibling.textContent.trim() === 'Muscle Map'); return { there: !!l, vis: l && getComputedStyle(l).visibility }; });
  check('the Muscle Map page is open and the design\'s own white back button is HIDDEN at once (never shown as a second button next to the glass one)', early.there && early.vis === 'hidden', JSON.stringify(early));
  check('the app is NOT told a position while the page is still sliding in (a position read mid-slide would be wrong)', msgs.slice(m0).filter((m) => m.type === 'mapBack' && m.open).length === 0);
  await p.waitForTimeout(700);
  const open = msgs.slice(m0).filter((m) => m.type === 'mapBack' && m.open);
  console.log('      mapBack:', JSON.stringify(open));
  check('once the page has settled the app is told it is open, with where the back button is (a 42px circle at the left, under the status bar)', open.length === 1 && open[0].w >= 40 && open[0].w <= 46 && open[0].l > 8 && open[0].l < 30 && open[0].t > 40, JSON.stringify(open));
  await p.screenshot({ path: path.join(ROOT, '.scratch', 'muscle-map-back.png') });
  // the app's tap comes back through __prMapBack and closes the page
  await p.evaluate(() => window.__prMapBack()); await p.waitForTimeout(600);
  const closed = await p.evaluate(() => ![...document.querySelectorAll('div')].some((d) => d.children.length === 0 && d.textContent.trim() === 'Muscle Map' && d.getBoundingClientRect().height > 0 && d.previousElementSibling && d.previousElementSibling.getAttribute('aria-label') === 'Back'));
  check('the glass button\'s tap (window.__prMapBack) goes back to the Progress page', closed);
  check('and the app is told the page is closed (so the glass button goes away)', maps().slice(-1)[0] && maps().slice(-1)[0].open === false, JSON.stringify(maps().slice(-2)));
  await browser.close();

  const pg = read('app/(tabs)/progress.tsx');
  check('app: the standard GlassBackButton is drawn above the page at the reported position (centred on where the design\'s button was), and fades in', /import GlassBackButton, \{ GLASS_BACK_SIZE \}/.test(pg) && /<GlassBackButton onPress=/.test(pg) && /mapBack\.l \+ mapBack\.w \/ 2 - GLASS_BACK_SIZE \/ 2/.test(pg) && /case 'mapBack'/.test(pg) && /mapBackFade/.test(pg));
  check('app: its tap goes back through the page (__prMapBack), with a light haptic', /window\.__prMapBack/.test(pg) && /Haptics\.selectionAsync\(\);\s*webRef\.current\?\.injectJavaScript\('window\.__prMapBack/.test(pg));
  const gb = read('components/GlassBackButton.tsx');
  check('it is the app\'s standard back button: real native glass (LiquidGlassButton), the design\'s own chevron', /LiquidGlassButton/.test(gb) && /BACK_ARROW/.test(gb));
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
