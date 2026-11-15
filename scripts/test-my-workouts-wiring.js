#!/usr/bin/env node
/**
 * scripts/test-my-workouts-wiring.js
 * My workouts: EVERY tab, EVERY card (picture and name), EVERY bookmark and every button is really wired. Real myworkouts.html with the
 * shipped injection and real data (a plan with repeated workouts, one workout made in Create workout, the 6 templates); every control
 * is clicked and what the page posts is checked, then the app side (app/my-workouts.tsx) is checked to send each post somewhere real.
 */
const fs = require('fs'), path = require('path');
const { openDesign, DS } = require('./lib/design-harness.js');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const WT = require('../lib/workoutTemplates.ts');
const ex = (n, s) => ({ displayName: n, targetSets: s });
const wk = [
  { id: 'a1', splitLabel: 'Upper Body', exercises: [ex('Push-up', 3), ex('Bicep Curl', 3)] },
  { id: 'b2', splitLabel: 'Leg Day', exercises: [ex('Bodyweight Squat', 4), ex('Lunge', 3)] },
  { id: 'a1-again', splitLabel: 'Upper Body', exercises: [ex('Push-up', 3), ex('Bicep Curl', 3)] },
  { id: 'custom-1', splitLabel: 'Arms and Chest', exercises: [ex('Push-up', 4)] },
];
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// page-side helpers (run inside the page)
const CARD_NAME = (x) => ((x.querySelector('div[style*="font-size: 16px"]') || {}).textContent || '').trim();
const GRID = () => document.querySelector('#dc-root div[style*="grid-template-columns"]');

(async () => {
  const data = DS.myWorkoutsData(wk, []);
  const byName = {};
  [...data.created, ...data.made, ...data.templates].forEach((c) => { byName[c.name] = c.id; });
  const { browser, page, msgs } = await openDesign('my', data);
  const last = (t) => [...msgs].reverse().find((m) => m.type === t);
  const cards = () => page.evaluate(`(() => { const nm = ${CARD_NAME}; const g = (${GRID})(); return [...g.children].filter((c) => !c.hasAttribute('data-ds-sec')).map((c) => ({ name: nm(c) })); })()`);
  const tabsNow = () => page.evaluate(() => [...document.querySelectorAll('#dc-root div')].filter((e) => /^(All|Created by you|Made for you|Templates)$/.test((e.textContent || '').trim()) && e.style.borderRadius === '999px').map((e) => e.textContent.trim()));
  const heads = () => page.evaluate(() => [...document.querySelectorAll('#dc-root [data-ds-sec]')].map((h) => h.getAttribute('data-ds-sec')));
  const clickTab = async (label) => { await page.evaluate((l) => { [...document.querySelectorAll('#dc-root div')].find((e) => e.textContent.trim() === l && e.style.borderRadius === '999px').click(); }, label); await page.waitForTimeout(350); };
  const all = await cards();
  check('page is ready and shows every card (1 created + 2 made + 6 templates = 9)', msgs.some((m) => m.type === 'ready') && all.length === 9, String(all.length));

  // tabs
  check('the four tabs exist: All, Created by you, Made for you, Templates', (await tabsNow()).join('|') === 'All|Created by you|Made for you|Templates', (await tabsNow()).join('|'));
  const expectTabs = { 'Created by you': ['Arms and Chest'], 'Made for you': ['Upper Body', 'Leg Day'], Templates: WT.WORKOUT_TEMPLATES.map((t) => t.name) };
  for (const [tab, names] of Object.entries(expectTabs)) {
    await clickTab(tab);
    const got = (await cards()).map((c) => c.name);
    check(`tab "${tab}" shows exactly its ${names.length} card(s) under its own heading`, got.slice().sort().join() === names.slice().sort().join() && (await heads()).join() === tab, got.join(', '));
  }
  await clickTab('All');
  check('tab "All" shows all nine under the three headings', (await cards()).length === 9 && (await heads()).join('|') === 'Created by you|Made for you|Templates');

  // every card opens ITS workout, from the picture and from the name
  let openBad = [];
  for (const c of all) {
    for (const which of ['picture', 'name']) {
      const before = msgs.length;
      await page.evaluate(`(() => { const nm = ${CARD_NAME}; const g = (${GRID})(); const card = [...g.children].find((x) => !x.hasAttribute('data-ds-sec') && nm(x) === ${JSON.stringify(c.name)}); const links = card.querySelectorAll('a[href^="#open-"]'); links[${which === 'picture' ? 0 : 1}].click(); })()`);
      const m = msgs.slice(before).find((x) => x.type === 'openWorkout');
      if (!(m && m.id === byName[c.name])) openBad.push(c.name + '/' + which + ' -> ' + JSON.stringify(m));
    }
  }
  check('all 9 cards open their OWN workout id, from both the picture and the name (18 taps)', openBad.length === 0, openBad.join(' | '));

  // every bookmark: toggles on and off, posts the saved list, never opens the workout
  let bookBad = [];
  for (const c of all) {
    const before = msgs.length;
    const tap = () => page.evaluate(`(() => { const nm = ${CARD_NAME}; const g = (${GRID})(); const card = [...g.children].find((x) => !x.hasAttribute('data-ds-sec') && nm(x) === ${JSON.stringify(c.name)}); card.querySelector('[aria-label="Save"]').click(); })()`);
    await tap(); await page.waitForTimeout(250);
    const m1 = msgs.slice(before).filter((x) => x.type === 'saved').pop();
    const opened = msgs.slice(before).some((x) => x.type === 'openWorkout');
    const ok1 = m1 && m1.ids.includes(byName[c.name]) && !opened;
    await tap(); await page.waitForTimeout(250);
    const m2 = msgs.slice(before).filter((x) => x.type === 'saved').pop();
    const ok2 = m2 && !m2.ids.includes(byName[c.name]);
    if (!(ok1 && ok2)) bookBad.push(c.name + ' ' + JSON.stringify([m1, m2, opened]));
  }
  check('all 9 bookmarks save, un-save, and never open the card', bookBad.length === 0, bookBad.join(' | '));
  // bookmarking floats the card to the top of ITS section
  await page.evaluate(`(() => { const nm = ${CARD_NAME}; const g = (${GRID})(); const card = [...g.children].filter((x) => !x.hasAttribute('data-ds-sec')).find((x) => nm(x) === 'Core'); card.querySelector('[aria-label="Save"]').click(); })()`);
  await page.waitForTimeout(350);
  const tpl = await page.evaluate(`(() => { const nm = ${CARD_NAME}; const g = (${GRID})(); const kids = [...g.children]; const i = kids.findIndex((x) => x.getAttribute('data-ds-sec') === 'Templates'); return kids.slice(i + 1).map(nm); })()`);
  check('a bookmarked card floats to the top of its own section (Core first under Templates)', tpl[0] === 'Core', tpl.join(', '));
  check('the page posts the bookmark list (Core)', last('saved').ids.join() === byName.Core, last('saved').ids.join());

  // search
  const type = async (v) => { await page.fill('input[placeholder="Search your workouts"]', v); await page.waitForTimeout(350); };
  await type('lunge');
  const names = (await cards()).map((c) => c.name);
  check('search "lunge" finds Leg Day (by its exercise) and nothing unrelated', names.includes('Leg Day') && !names.includes('Arms and Chest'), names.join(', '));
  await type('zzzz');
  check('a search with no match shows the empty line', /No workouts match that search/.test(await page.evaluate(() => document.body.innerText)));
  await type('');
  check('clearing the search brings all nine back', (await cards()).length === 9);

  // buttons
  const b0 = msgs.length;
  await page.evaluate(() => { [...document.querySelectorAll('#dc-root a')].find((a) => /Create Workout/i.test(a.textContent) || /Create Workout/i.test(a.getAttribute('href') || '')).click(); });
  check('the Create workout button posts "create"', msgs.slice(b0).some((m) => m.type === 'create'));
  const b1 = msgs.length;
  await page.evaluate(() => document.querySelector('#dc-root a[aria-label="Back"]').click());
  check('the back button posts "back"', msgs.slice(b1).some((m) => m.type === 'back'));
  await browser.close();

  // the app side: each post goes somewhere real
  const app = read('app/my-workouts.tsx'), prev = read('app/workout/index.tsx');
  check('app: back -> router.back()', /m\.type === 'back'\) router\.back\(\)/.test(app));
  check('app: create -> /create-workout, and that screen exists', /'\/create-workout'/.test(app) && fs.existsSync(path.join(__dirname, '..', 'app', 'create-workout.tsx')));
  check('app: a template opens /workout?template=<id>, a plan or created workout /workout?id=<id>, and the preview reads both', /isTemplateId\(String\(m\.id\)\) \? \{ template: String\(m\.id\) \} : \{ id: String\(m\.id\) \}/.test(app) && /template \? templateWorkout\(template\)/.test(prev) && /plan\?\.workouts\.find\(w => w\.id === id\)/.test(prev));
  check('app: bookmarks are saved on the device under the saved-workouts key (and read back on focus)', /m\.type === 'saved'.*AsyncStorage\.setItem\(SAVED_KEY/.test(app) && /AsyncStorage\.getItem\(SAVED_KEY\)/.test(app));
  check('all 6 templates open a real workout (4+ exercises from the catalogue)', WT.WORKOUT_TEMPLATES.every((t) => { const w = WT.templateWorkout(t.id); return w && w.exercises.length >= 4; }));
  check('My workouts is reached from Train "My Workouts"', /my-workouts/.test(read('app/(tabs)/train.tsx')));
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
