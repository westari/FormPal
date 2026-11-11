#!/usr/bin/env node
/**
 * scripts/test-progress-empty.js
 * An EMPTY Progress tab (no sessions at all): everyone starts at Bronze 0%. Real progress.html + the real injection.
 */
const { openProgress, makeData } = require('./lib/progress-harness.js');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
(async () => {
  const data = makeData({ form: [], weights: [] });
  data.hasSessions = false; data.workouts = [];
  const { browser, page } = await openProgress(data);
  const txt = await page.evaluate(() => document.getElementById('dc-root').innerText.replace(/\s+/g, ' '));
  const card = await page.evaluate(() => { const a = document.querySelector('#dc-root a[style*="padding: 18px 18px 14px"]'); return a ? a.innerText.replace(/\s+/g, ' ') : null; });
  console.log('      rank card:', card);
  check('an empty Progress tab never says "Unranked"', !/unranked/i.test(txt));
  check('...nor "Train to earn your first rank"', !/earn your first rank/i.test(txt));
  check('the rank card shows Bronze, with its progress to Silver (0%)', card && /Bronze/.test(card) && /Silver/.test(card), card);
  await page.screenshot({ path: '.scratch/progress-empty.png' });
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
})();
