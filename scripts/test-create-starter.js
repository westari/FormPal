#!/usr/bin/env node
/**
 * scripts/test-create-starter.js
 * Create workout is not just a search bar: six muscle-group chips (Chest, Back, Legs, Shoulders, Arms, Core) show that group's REAL
 * exercises, and a short "Popular" list shows by default. Real createworkout.html + the shipped injection + the real catalogue.
 */
const { openDesign, catalog, EXERCISE_CATALOG } = require('./lib/design-harness.js');
const DS = require('../lib/designScreens.ts');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
(async () => {
  const cat = catalog();
  const real = new Set(EXERCISE_CATALOG.map((e) => e.displayName));
  const data = DS.createWorkoutData(cat);
  check('data: six groups, each with real catalogue exercises only', DS.CREATE_GROUPS.map((g) => g.label).join() === 'Chest,Back,Legs,Shoulders,Arms,Core' && DS.CREATE_GROUPS.every((g) => data.groups[g.id].length >= 3 && data.groups[g.id].every((n) => real.has(n))), DS.CREATE_GROUPS.map((g) => g.id + ':' + data.groups[g.id].length).join(' '));
  check('data: Popular is a short list (about 8) of real exercises', data.popular.length >= 6 && data.popular.length <= 8 && data.popular.every((n) => real.has(n)), data.popular.join(', '));
  check('data: the first exercises of a group are the ones that MAINLY train it (Chest starts with Push-up, Chest Press...; Arms with the curls), then the ones that also train it',  data.groups.chest.slice(0, 3).every((n) => EXERCISE_CATALOG.find((e) => e.displayName === n).muscleGroups[0] === 'chest') && /Curl/.test(data.groups.arms.slice(0, 5).join()) && data.groups.back.slice(0, 5).every((n) => EXERCISE_CATALOG.find((e) => e.displayName === n).muscleGroups[0] === 'back'));
check('data: every group exercise really trains that group in the catalogue', DS.CREATE_GROUPS.every((g) => data.groups[g.id].every((n) => EXERCISE_CATALOG.find((e) => e.displayName === n).muscleGroups.map(String).includes(g.id))));
  const { browser, page, msgs, logs } = await openDesign('create', data);
  const shot = (n) => page.screenshot({ path: require('path').join(__dirname, '..', '.scratch', n + '.png') });
  const state = () => page.evaluate(() => {
    const st = document.querySelector('[data-cw-starter]'); if (!st) return null;
    const chips = [...st.querySelectorAll('[data-cw-chip]')].map((c) => ({ t: c.textContent, on: getComputedStyle(c).backgroundColor === 'rgb(17, 17, 20)' }));
    const rows = [...st.querySelectorAll('[data-cw-row]')].map((r) => r.firstChild.textContent);
    const heading = [...st.children].find((c) => /Popular| exercises$/.test(c.textContent) && c.children.length === 0);
    const r = st.getBoundingClientRect();
    return { chips, rows, heading: heading && heading.textContent, vis: getComputedStyle(st).display !== 'none', left: Math.round(r.left), width: Math.round(r.width), vw: innerWidth };
  });
  let s = await state();
  check('the empty Create workout shows the starter: 6 chips and the Popular list (not an empty screen)', s && s.vis && s.chips.map((c) => c.t).join() === 'Chest,Back,Legs,Shoulders,Arms,Core' && s.heading === 'Popular' && s.rows.join() === data.popular.join(), JSON.stringify(s));
  check('the six chips sit on ONE row', await page.evaluate(() => { const t = [...document.querySelectorAll('[data-cw-chip]')].map((c) => Math.round(c.getBoundingClientRect().top)); return new Set(t).size === 1 && document.querySelector('[data-cw-chip="core"]').getBoundingClientRect().right <= innerWidth - 10; }));
check('it fits the phone width (no sideways overflow)', s && s.left >= 0 && s.left + s.width <= s.vw && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await shot('create-starter-popular');
  for (const g of DS.CREATE_GROUPS) {
    await page.evaluate((id) => document.querySelector('[data-cw-chip="' + id + '"]').click(), g.id); await page.waitForTimeout(350);
    s = await state();
    const want = data.groups[g.id].slice(0, 8);
    check(`chip "${g.label}" turns dark and lists that group's real exercises (${want.length}${data.groups[g.id].length > 8 ? ' of ' + data.groups[g.id].length : ''})`, s.chips.filter((c) => c.on).map((c) => c.t).join() === g.label && s.heading === g.label + ' exercises' && s.rows.join() === want.join(), s.rows.join(', '));
  }
  await shot('create-starter-core');
  // "Show all"
  await page.evaluate(() => document.querySelector('[data-cw-chip="legs"]').click()); await page.waitForTimeout(300);
  const more = await page.evaluate(() => !!document.querySelector('[data-cw-more]'));
  if (more) { await page.evaluate(() => document.querySelector('[data-cw-more]').click()); await page.waitForTimeout(300); s = await state(); check('"Show all" lists the whole group', s.rows.join() === data.groups.legs.join(), String(s.rows.length)); }
  // add from the list
  await page.evaluate(() => document.querySelector('[data-cw-chip="chest"]').click()); await page.waitForTimeout(300);
  const first = (await state()).rows[0];
  await page.evaluate(() => document.querySelector('[data-cw-row="0"]').click()); await page.waitForTimeout(500);
  const cur = await page.evaluate(() => (window.__athltCurrent || { items: [] }).items.map((i) => i.n));
  check('tapping an exercise adds it to the workout (and its button turns into a check)', cur.join() === first && await page.evaluate(() => !!document.querySelector('[data-cw-row="0"] path[d^="M2.6"]')), cur.join() + ' / ' + first);
  await shot('create-starter-added');
  await page.evaluate(() => document.querySelector('[data-cw-row="0"]').click()); await page.waitForTimeout(400);
  check('tapping it again takes it out', (await page.evaluate(() => window.__athltCurrent.items.length)) === 0);
  // chip off again -> Popular
  await page.evaluate(() => document.querySelector('[data-cw-chip="chest"]').click()); await page.waitForTimeout(300);
  check('tapping the chosen chip again goes back to Popular', (await state()).heading === 'Popular');
  // search stays and takes over
  await page.fill('input[placeholder="Search to add an exercise"]', 'squat'); await page.waitForTimeout(500);
  const typing = await page.evaluate(() => ({ starter: getComputedStyle(document.querySelector('[data-cw-starter]')).display, text: document.body.innerText }));
  check('search still works: typing hides the starter and shows real results', typing.starter === 'none' && /squat/i.test(typing.text), typing.starter);
  await page.fill('input[placeholder="Search to add an exercise"]', ''); await page.waitForTimeout(500);
  check('clearing the search brings the starter back', (await state()).vis);
  check('no page errors', !logs.some((l) => /pageerror/.test(l)), logs.filter((l) => /pageerror/.test(l)).join());
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
