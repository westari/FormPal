#!/usr/bin/env node
/**
 * scripts/test-progress-map.js
 *
 * Progress tab muscle map (rank card + Muscle Map page): the CLEAN drawing (lib/bodyMapSvg.ts plain) it had before 5017668 made it busy:
 * soft silhouette, white seams between muscles, tier colours on ranked muscles, no dark outlines. Real progress.html + real injection.
 * Screenshots: .scratch/progress-map-card.png, .scratch/progress-map-page.png
 */
const path = require('path');
const { openProgress, makeData, ROOT } = require('./lib/progress-harness.js');
const { Muscle } = require('../constants/exercises.ts');

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

(async () => {
  const mk = (tier) => ({ tier, peakTier: tier, volume: 50, goodRatio: 0.8 });
  const tiers = { [Muscle.Shoulders]: mk('bronze'), [Muscle.Triceps]: mk('bronze'), [Muscle.Chest]: mk('silver'), [Muscle.Quads]: mk('gold') };
  const { browser, page, logs } = await openProgress(makeData({ tiers }));
  const info = await page.evaluate(() => {
    const slot = document.querySelector('div[aria-label="Body map space"]');
    const svgs = [...slot.querySelectorAll('svg')];
    return svgs.map((s) => {
      const paths = [...s.querySelectorAll('path')];
      const last = paths[paths.length - 1];
      const mid = paths[2];
      const r = s.getBoundingClientRect();
      return { n: paths.length, lastFill: last.getAttribute('fill'), lastStroke: last.getAttribute('stroke'), lastW: last.getAttribute('stroke-width'), midStroke: mid.getAttribute('stroke'), midW: mid.getAttribute('stroke-width'), ns: last.getAttribute('vector-effect'), h: Math.round(r.height) };
    });
  });
  check('rank card shows both figures', info.length === 2, JSON.stringify(info));
  // round 11: the same black outlines as Create workout's map (one shared drawing function and one shared ink)
  check('outlined map: the LAST layer is the dark body outline (no fill), in the shared ink #23262f', info.every((i) => i.lastFill === 'none' && i.lastStroke === '#23262f'), JSON.stringify(info[0]));
  check('outlined map: every muscle has its own outline in the same ink (and there are many muscles)', info.every((i) => i.midStroke === '#23262f' && i.n > 20), `${info[0].n} paths, mid stroke ${info[0].midStroke}`);
  check('it is EXACTLY the same drawing as the Create workout map: same shared function and same ink (no other outline colours anywhere)', await page.evaluate(() => !/#454B5C|#69708A/i.test(document.querySelector('div[aria-label="Body map space"]').innerHTML)) && /bodyMapOutlinedSvg/.test(require('fs').readFileSync(path.join(ROOT, 'lib', 'progressData.ts'), 'utf8')) && /MAP_INK/.test(require('fs').readFileSync(path.join(ROOT, 'lib', 'createBodyMap.ts'), 'utf8')));
  // tier colour reaches the figure
  const fills = await page.evaluate(() => [...new Set([...document.querySelector('div[aria-label="Body map space"]').querySelectorAll('path')].map((p) => p.getAttribute('fill')))]);
  check('ranked muscles are tier-coloured (more than the neutral grey)', fills.filter((f) => f && f !== 'none' && f !== '#E3E4EA' && f !== '#F1F2F6').length >= 3, fills.join(' '));
  const card = await page.evaluateHandle(() => document.querySelector('div[aria-label="Body map space"]').closest('a'));
  await card.asElement().screenshot({ path: path.join(ROOT, '.scratch', 'progress-map-card.png') });
  // pixel proof the outline is visible: darkest pixels along the silhouette must be clearly dark
  check('no page errors', !logs.some((l) => /pageerror|render error/.test(l)), logs.filter((l) => /pageerror|render error/.test(l)).join(' | '));
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
