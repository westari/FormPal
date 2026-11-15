#!/usr/bin/env node
/**
 * scripts/test-name-clip.js
 * The workout name in the Today card ("My workout") sits in a box with overflow hidden and a tight line height, which cut the tail of
 * the "y" at the bottom. Checked on Train and Home with the shipped injection: the glyphs of the text (with their descenders) are inside
 * the box's visible area, and the box grew downward without moving anything (the next line stays where it was).
 */
const path = require('path');
const { openHome } = require('./lib/home-harness.js');
const open = require('./lib/train-open.js');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const MEASURE = (sel) => {
  const el = [...document.querySelectorAll('div')].find((d) => sel(d));
  if (!el) return null;
  const cs = getComputedStyle(el), r = el.getBoundingClientRect(), S = window.__dcCanvasScale || (innerHeight / 844);
  // the glyph box of the text: the inline box (font ascent + descent), which is where a descender is drawn
  const rg = document.createRange(); rg.selectNodeContents(el); const t = rg.getBoundingClientRect();
  const vis = r.bottom - (parseFloat(cs.paddingBottom) || 0) * 0 ; // the padding box bottom is the clip edge
  return { text: el.textContent.trim(), glyphBottom: t.bottom, clipBottom: r.bottom, pb: cs.paddingBottom, mb: cs.marginBottom, ov: cs.overflow, S };
};
(async () => {
  // Train: the planned workout is "My workout" (as in the log: today = My workout)
  const ex = (n) => ({ exerciseId: 'squat', displayName: n, targetSets: 3, targetReps: 10, restSeconds: 60, currentVariationId: 'squat' });
  const now = new Date(2026, 10, 15, 12);
  const plan = { id: 'p', profile: { goal: 'general', experience: 'beginner', daysPerWeek: 7, location: 'gym' }, splitType: 'fullBody', currentWorkoutIndex: 0, generatedAt: now.getTime() - 20 * 86400000, progressionState: {}, workouts: [{ id: 'w1', sessionNumber: 1, splitLabel: 'My workout', rationale: '', exercises: [ex('Squat')], completed: false }] };
  const { b, p } = await open(plan, [], now);
  const t = await p.evaluate(`(${MEASURE})((d) => d.textContent.trim() === 'My workout' && getComputedStyle(d).fontSize === '22px')`);
  check('6: Train Today card: the name box has room below the text (padding 5px, pulled back up by 5px so nothing moves)', t && t.pb === '5px' && t.mb === '-5px' && t.ov === 'hidden', JSON.stringify(t));
  check('6: Train: the descender of the "y" is inside the visible box', t && t.glyphBottom <= t.clipBottom + 0.5, JSON.stringify(t));
  await b.close();
  const h = await openHome({ inset: 62 });
  await h.page.evaluate(() => { const d = [...document.querySelectorAll('div')].find((x) => x.style.maxWidth === '236px' && x.style.fontSize === '27px'); d.textContent = 'My workout'; });
  const m = await h.page.evaluate(`(${MEASURE})((d) => d.style.maxWidth === '236px' && d.style.fontSize === '27px')`);
  check('6: Home Today card: same room below the name', m && m.pb === '6px' && m.mb === '-6px', JSON.stringify(m));
  check('6: Home: the descender of the "y" is inside the visible box', m && m.glyphBottom <= m.clipBottom + 0.5, JSON.stringify(m));
  await h.browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
