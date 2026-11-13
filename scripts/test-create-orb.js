#!/usr/bin/env node
/**
 * scripts/test-create-orb.js
 * Create workout / My workouts / Log a session use the ONE shared Cue orb (lib/cueOrb.ts: the glossy Home orb, no blend-mode texture
 * layer, no blurred blobs), not the design file's own textured one. Real createworkout.html + the shipped injection, both orbs (the
 * "Build with Cue" button and the open sheet's title orb). Screenshot: .scratch/cw2.png
 */
const { openDesign, catalog } = require('./lib/design-harness.js');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
(async () => {
  const h = await openDesign('create', { catalog: catalog() }); const p = h.page;
  const probe = () => p.evaluate(() => {
    const orbs = [...document.querySelectorAll('div[style*="hm-orb-breathe"]')];
    return { style: !!document.getElementById('__cue_orb'), n: orbs.length,
      textured: orbs.filter((o) => [...o.querySelectorAll('div[style*="mix-blend-mode"]')].some((x) => getComputedStyle(x).display !== 'none')).length,
      blurred: orbs.filter((o) => [...o.querySelectorAll('div[style*="filter: blur"]')].some((x) => getComputedStyle(x).filter !== 'none')).length };
  });
  const a = await probe();
  check('9: the shared Cue orb style is installed on Create workout', a.style);
  check('9: the "Build with Cue" button orb has no texture layer and no blurred blobs (the old look)', a.n >= 1 && a.textured === 0 && a.blurred === 0, JSON.stringify(a));
  await p.evaluate(() => { const e = [...document.querySelectorAll('div')].find((d) => d.textContent.trim() === 'Build with Cue' && !d.querySelector('div')); e.click(); });
  await p.waitForTimeout(800);
  const b = await probe();
  check('9: the orb in the open "Build with Cue" sheet is the shared one too', b.n >= 2 && b.textured === 0 && b.blurred === 0, JSON.stringify(b));
  await p.screenshot({ path: '.scratch/cw2.png' });
  await h.browser.close();
  for (const k of ['my', 'log']) { const g = await openDesign(k, k === 'my' ? { created: [], made: [], templates: [], templateNote: '', saved: [] } : { catalog: catalog(), now: Date.now(), recent: [] }, { withData: false }); const s = await g.page.evaluate(() => !!document.getElementById('__cue_orb')); check('9: the same shared orb style is on ' + k, s); await g.browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
