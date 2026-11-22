#!/usr/bin/env node
/**
 * scripts/test-create-starter.js
 * Create workout is not just a search bar: a small tappable body map (round 8: the Progress tab's muscle map, front and back; the six groups Chest, Back, Legs, Shoulders, Arms, Core) shows that group's REAL
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
    const lit = [...new Set([...st.querySelectorAll('[data-grp]')].filter((c) => c.getAttribute('fill') === '#111114').map((c) => c.getAttribute('data-grp')))];
    const chips = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'].map((g) => ({ t: g, has: st.querySelectorAll('[data-grp="' + g + '"]').length, on: lit.includes(g) }));
    const rows = [...st.querySelectorAll('[data-cw-row]')].map((r) => r.firstChild.textContent);
    const heading = [...st.children].find((c) => /Popular| exercises$/.test(c.textContent) && c.children.length === 0);
    const r = st.getBoundingClientRect();
    return { chips, rows, heading: heading && heading.textContent, vis: getComputedStyle(st).display !== 'none', left: Math.round(r.left), width: Math.round(r.width), vw: innerWidth };
  });
  let s = await state();
  check('the empty Create workout shows the starter: the body map (all six groups tappable) and the Popular list (not an empty screen)', s && s.vis && s.chips.every((c) => c.has > 0) && s.heading === 'Popular' && s.rows.join() === data.popular.join(), JSON.stringify(s));
  check('round 8: the map is SMALL (about 150px tall), front and back side by side, inside the phone width, and it replaces the chips (no chips, no circles)', await page.evaluate(() => { const m = document.querySelector('[data-cw-map]'); const r = m.getBoundingClientRect(); return r.height <= 160 && r.right <= innerWidth && m.querySelectorAll('svg').length === 2 && !document.querySelector('[data-cw-chip]'); }));
  check('round 8: it is the Progress tab muscle map style: a pale silhouette, a dark body outline, thin muscle outlines (same colours)', await page.evaluate(() => { const svg = document.querySelector('[data-cw-map] svg'); const paths = [...svg.querySelectorAll('path')]; const sil = paths[0], outline = paths[paths.length - 1]; return sil.getAttribute('fill') === '#F1F2F6' && outline.getAttribute('stroke') === '#454B5C' && outline.getAttribute('fill') === 'none' && paths.slice(1, -1).every((p) => p.getAttribute('stroke') === '#69708A'); }));
check('it fits the phone width (no sideways overflow)', s && s.left >= 0 && s.left + s.width <= s.vw && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await shot('create-starter-popular');
  // round 7: order and no circles
  const lay = await page.evaluate(() => {
    const top = (e) => e ? Math.round(e.getBoundingClientRect().top) : null;
    const search = document.querySelector('input[placeholder="Search to add an exercise"]');
    const add = document.querySelector('[data-ds-add]'), st = document.querySelector('[data-cw-starter]');
    const circles = [...st.querySelectorAll('*')].filter((e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return r.width > 0 && r.width < 40 && Math.abs(r.width - r.height) < 2 && /50%|9999|14px|10px/.test(cs.borderRadius) && cs.backgroundColor !== 'rgba(0, 0, 0, 0)'; }).length;
    return { search: top(search.parentElement), add: top(add), starter: top(st), circles };
  });
  check('round 7: the "Add exercise" card is RIGHT UNDER the search bar and the starter block comes after it (not above it)', lay.add > lay.search && lay.add < lay.starter && lay.starter - lay.add < 400, JSON.stringify(lay));
  check('round 7: the starter rows have NO little circles (a plain plus or check)', lay.circles === 0 && await page.evaluate(() => document.querySelectorAll('[data-cw-row] [data-cw-mark]').length > 0), JSON.stringify(lay));
  for (const g of DS.CREATE_GROUPS) {
    await page.evaluate((id) => document.querySelector('[data-grp="' + id + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true })), g.id); await page.waitForTimeout(350);
    s = await state();
    const want = data.groups[g.id].slice(0, 8);
    check(`chip "${g.label}" turns dark and lists that group's real exercises (${want.length}${data.groups[g.id].length > 8 ? ' of ' + data.groups[g.id].length : ''})`, s.chips.filter((c) => c.on).map((c) => c.t).join() === g.id && s.heading === g.label + ' exercises' && s.rows.join() === want.join(), s.rows.join(', '));
  }
  await shot('create-starter-core');
  // "Show all"
  await page.evaluate(() => document.querySelector('[data-grp=\"legs\"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))); await page.waitForTimeout(300);
  const more = await page.evaluate(() => !!document.querySelector('[data-cw-more]'));
  if (more) { await page.evaluate(() => document.querySelector('[data-cw-more]').click()); await page.waitForTimeout(300); s = await state(); check('"Show all" lists the whole group', s.rows.join() === data.groups.legs.join(), String(s.rows.length)); }
  // add from the list
  await page.evaluate(() => document.querySelector('[data-grp=\"chest\"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))); await page.waitForTimeout(300);
  const first = (await state()).rows[0];
  await page.evaluate(() => document.querySelector('[data-cw-row="0"]').click()); await page.waitForTimeout(500);
  const cur = await page.evaluate(() => (window.__athltCurrent || { items: [] }).items.map((i) => i.n));
  check('tapping an exercise adds it to the workout (and its button turns into a check)', cur.join() === first && await page.evaluate(() => !!document.querySelector('[data-cw-row="0"] path[d^="M2.6"]')), cur.join() + ' / ' + first);
  await shot('create-starter-added');
  const order2 = await page.evaluate(() => { const picked = [...document.querySelectorAll('div')].find((d) => /^1$/.test(d.textContent.trim()) && d.style.fontSize === '12.5px'); const st = document.querySelector('[data-cw-starter]'); const search = document.querySelector('input[placeholder="Search to add an exercise"]'); return { picked: picked ? Math.round(picked.getBoundingClientRect().top) : null, starter: Math.round(st.getBoundingClientRect().top), search: Math.round(search.getBoundingClientRect().top) }; });
  check('round 7: a picked exercise shows right under the search bar, ABOVE the starter block', order2.picked != null && order2.picked > order2.search && order2.picked < order2.starter, JSON.stringify(order2));
  await page.evaluate(() => document.querySelector('[data-cw-row="0"]').click()); await page.waitForTimeout(400);
  check('tapping it again takes it out', (await page.evaluate(() => window.__athltCurrent.items.length)) === 0);
  // chip off again -> Popular
  await page.evaluate(() => document.querySelector('[data-grp=\"chest\"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))); await page.waitForTimeout(300);
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
