#!/usr/bin/env node
/**
 * scripts/test-learn-moves.js
 * "Learn the moves": the My workouts page listing every catalogue exercise, with filter chips; tapping one opens its form check. The arrow next
 * to "Learn The Moves" on Home used to navigate the page to a dead file ("asset not found"); it now posts "moves" and the app opens this page.
 */
const fs = require('fs'), path = require('path');
const { openDesign, EXERCISE_CATALOG, DS } = require('./lib/design-harness.js');
const { openHome } = require('./lib/home-harness.js');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
(async () => {
  // Home: the arrow
  const h = await openHome({ inset: 62 });
  const before = h.msgs.length;
  await h.page.evaluate(() => { const a = [...document.querySelectorAll('a[href="Train.dc.html"]')].find((x) => /Learn/i.test(x.textContent)); a.click(); });
  await h.page.waitForTimeout(250);
  check('2: tapping "Learn The Moves" on Home posts "moves" and does not navigate the page (no more "asset not found")', h.msgs.slice(before).some((m) => m.type === 'moves') && h.page.url().includes('home.html'), JSON.stringify(h.msgs.slice(before)));
  await h.browser.close();
  const app = read('app/(tabs)/index.tsx'), lm = read('app/learn-moves.tsx');
  check('2: Home opens /learn-moves, which exists', /msg\.type === 'moves'\) \{ router\.push\('\/learn-moves'/.test(app) && fs.existsSync(path.join(__dirname, '..', 'app', 'learn-moves.tsx')));
  check('2: it uses the My workouts design file itself', /myworkouts\.html/.test(lm) && /learnMovesBeforeJs/.test(lm));
  const data = DS.learnMovesData(EXERCISE_CATALOG);
  check('2: the data lists EVERY exercise of the catalogue once', data.items.length === EXERCISE_CATALOG.length && new Set(data.items.map((i) => i.id)).size === EXERCISE_CATALOG.length, data.items.length + ' of ' + EXERCISE_CATALOG.length);
  const g = await openDesign('learn', data);
  const p = g.page, msgs = g.msgs;
  const cards = () => p.evaluate(() => { const gr = document.querySelector('#dc-root div[style*="grid-template-columns"]'); return [...gr.children].filter((c) => !c.hasAttribute('data-ds-sec')).map((c) => (c.querySelector('div[style*="font-size: 16px"]') || {}).textContent.trim()); });
  const chips = () => p.evaluate(() => [...document.querySelectorAll('[data-learn-chip]')].map((e) => ({ t: e.textContent.trim(), top: Math.round(e.getBoundingClientRect().top), right: Math.round(e.getBoundingClientRect().right), on: getComputedStyle(e).backgroundColor === 'rgb(17, 17, 20)' })));
  const click = async (label) => { await p.evaluate((l) => [...document.querySelectorAll('[data-learn-chip]')].find((e) => e.textContent.trim() === l).click(), label); await p.waitForTimeout(400); };
  const body = await p.evaluate(() => document.body.innerText.split(String.fromCharCode(10)).join(' | '));
  const visibleLinks = await p.evaluate(() => [...document.querySelectorAll('#dc-root a')].filter((a) => getComputedStyle(a).display !== 'none').map((a) => a.textContent).join(' '));
  check('2: it looks like My workouts: same page, new title "Learn the moves", search "Search moves", no Create workout button', /Learn the moves/.test(body) && !/My Workouts/.test(body) && !!(await p.$('input[placeholder="Search moves"]')) && !/Create workout/i.test(visibleLinks), body.slice(0, 80));
  let all = await cards();
  check('2: All lists every exercise', all.length === EXERCISE_CATALOG.length, String(all.length));
  const c = await chips();
  check('2: the filter chips: All, Bodyweight, Dumbbell, Barbell, Machine, Chest, Back, Legs, Shoulders, Arms, Core, all inside the screen', c.map((x) => x.t).join() === 'All,Bodyweight,Dumbbell,Barbell,Machine,Chest,Back,Legs,Shoulders,Arms,Core' && c.every((x) => x.right <= 380), JSON.stringify(c.map((x) => [x.t, x.top])));
  const wantEq = (eq) => EXERCISE_CATALOG.filter((e) => (eq === 'bodyweight' ? e.equipment.length === 0 : e.equipment.map(String).includes(eq))).map((e) => e.displayName).sort();
  for (const [lab, id] of [['Bodyweight', 'bodyweight'], ['Dumbbell', 'dumbbell'], ['Barbell', 'barbell'], ['Machine', 'machine']]) {
    await click(lab);
    const got = (await cards()).slice().sort(), want = wantEq(id);
    check(`chip ${lab}: exactly the ${want.length} ${lab.toLowerCase()} exercises, and the chip turns dark`, got.join() === want.join() && (await chips()).filter((x) => x.on).map((x) => x.t).join() === lab, got.length + ' vs ' + want.length);
  }
  for (const grp of ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core']) {
    await click(grp);
    const got = (await cards()).slice().sort(), want = EXERCISE_CATALOG.filter((e) => e.muscleGroups.map(String).includes(grp.toLowerCase())).map((e) => e.displayName).sort();
    check(`chip ${grp}: exactly the ${want.length} exercises that work ${grp.toLowerCase()}`, got.join() === want.join(), got.length + ' vs ' + want.length);
  }
  await click('All');
  await p.fill('input[placeholder="Search moves"]', 'squat'); await p.waitForTimeout(400);
  all = await cards();
  check('search: "squat" finds squats', all.length >= 3 && all.some((n) => /squat/i.test(n)), all.slice(0, 4).join());
  await p.fill('input[placeholder="Search moves"]', ''); await p.waitForTimeout(300);
  const b0 = msgs.length;
  await p.evaluate(() => { const gr = document.querySelector('#dc-root div[style*="grid-template-columns"]'); gr.children[0].querySelector('a[href^="#open-"]').click(); });
  const first = EXERCISE_CATALOG.slice().sort((a, b) => a.displayName.localeCompare(b.displayName))[0];
  const om = msgs.slice(b0).find((m) => m.type === 'openMove');
  check('tapping an exercise posts its id, and the app opens its form check (/formcheck?exercise=id)', om && om.id === first.id && lm.includes('/formcheck?exercise='), JSON.stringify(om));
  const b1 = msgs.length;
  await p.evaluate(() => document.querySelector('#dc-root a[aria-label="Back"]').click());
  check('back posts back', msgs.slice(b1).some((m) => m.type === 'back'));
  await p.screenshot({ path: path.join(__dirname, '..', '.scratch', 'learn-moves.png') });
  await g.browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
