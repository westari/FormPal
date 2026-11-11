#!/usr/bin/env node
/**
 * scripts/test-design-screens.js
 *
 * Create workout (createworkout.html), My workouts (myworkouts.html) and Log a session (logsessionv2.html): the REAL design
 * files, used as-is, with the EXACT injection the app ships (lib/designScreens.ts) and real data. Every interaction is done in
 * a real browser: typing, tapping results, steppers, remove, the calendar, bookmarks, tabs, search, the Cue box, Back, Save.
 * Screenshots: .scratch/ds-<screen>-*.png
 */
const path = require('path');
const { openDesign, catalog, DS, ROOT, EXERCISE_CATALOG } = require('./lib/design-harness.js');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const shot = (p, n) => p.screenshot({ path: path.join(ROOT, '.scratch', `ds-${n}.png`) });
const text = (p) => p.evaluate(() => document.getElementById('dc-root').innerText.replace(/\s+/g, ' '));
// click the smallest element whose own text matches
const clickText = (p, src) => p.evaluate((s) => {
  const r = new RegExp(s, 'i');
  const el = [...document.querySelectorAll('#dc-root div, #dc-root a, #dc-root span')].filter((e) => r.test((e.textContent || '').trim())).sort((a, b) => a.textContent.length - b.textContent.length)[0];
  if (!el) return false; el.click(); return true;
}, src.source);
const type = async (p, sel, v) => { await p.fill(sel, v); await p.dispatchEvent(sel, 'change'); await p.waitForTimeout(150); };
const cat = catalog();
const names = cat.map((c) => c.name);
const lastMsg = (m, t) => [...m].reverse().find((x) => x.type === t);
const anchor = (p, src, act = 'click') => p.evaluate((s) => { const a = [...document.querySelectorAll('#dc-root a')].find((x) => new RegExp(s, 'i').test(x.textContent)); a.click(); }, src);

// 14: the page-side search text is the SAME rule as lib/exerciseSearch.ts (the one every screen should use)
{
  require('./lib/ts-node-loader.js')();
  const ES = require('../lib/exerciseSearch.ts');
  const pageSearch = new Function(ES.EXERCISE_SEARCH_PAGE_JS + '; return dsSearch;')();
  const qs = ['g', 'G', 'p', 'pu', 'push', 'press', 'sq', 'squat', 'row', 'bench pr', 'close', 'grip', 'up', 'ro', 'x', '  curl ', 'single leg', 'dead', 'ba', 'bar', 'b', 'l', 'a', 'hqmmer', 'squt', 'pushp', 'bicp', 'deadlft', 'hamer', 'prss', 'gobl', 'hqm', 'hqmm', 'cur', 'pxs', 'sqt', 'dea'];
  let diff = 0, mid = 0;
  for (const q of qs) {
    const a = ES.searchExercises(names, q, 999), b = pageSearch(names, q);
    if (JSON.stringify(a) !== JSON.stringify(b)) diff++;
    const t = q.trim().toLowerCase();
    if (t && a.some((n) => !(' ' + n.toLowerCase().replace(/[-/_.()]+/g, ' ')).includes(' ' + t))) mid++;
  }
  check('14: the page-side search and lib/exerciseSearch.ts give identical answers on ' + qs.length + ' queries', diff === 0, diff + ' differ');
  check('14: no EXACT-tier result is ever a match in the middle of a word', ES.searchExercises(names, 'g', 999).every((n) => (' ' + n.toLowerCase().replace(/[-\/_.()]+/g, ' ')).includes(' g')), 'g');
  {
    const h = ES.searchExercises(names, 'hqmmer', 999);
    check('7: "hqmmer" (one wrong letter) still finds Hammer Curl', h.includes('Hammer Curl'), h.join(', '));
    check('7: "squt" finds the squats, "bicp" finds Bicep Curl, "deadlft" finds Deadlift', ES.searchExercises(names, 'squt', 999).some((n) => /Squat/.test(n)) && ES.searchExercises(names, 'bicp', 999).includes('Bicep Curl') && ES.searchExercises(names, 'deadlft', 999).includes('Deadlift'));
    const cu = ES.searchExercises(names, 'curl', 999), firstTypoIdx = cu.findIndex((n) => ES.matchTier(n, 'curl') === 2);
    check('7: exact and word-start matches always rank before typo matches', firstTypoIdx === -1 || cu.slice(0, firstTypoIdx).every((n) => ES.matchTier(n, 'curl') < 2) && cu.slice(firstTypoIdx).every((n) => ES.matchTier(n, 'curl') === 2), cu.slice(0, 8).join(', '));
    check('7: 1-2 letter queries are never fuzzy: "g", "gx", "xq" show no typo matches (g never shows Squat)', ['g', 'gx', 'xq', 'sq'].every((q) => ES.searchExercises(names, q, 999).every((n) => ES.matchTier(n, q) < 2)) && !ES.searchExercises(names, 'g', 999).some((n) => /Squat/.test(n) && !/^g|\sg/i.test(n)), '');
    {
      const h3 = ES.searchExercises(names, 'hqm', 999);
      check('12: "hqm" (3 letters, one wrong) already shows Hammer Curl', h3.includes('Hammer Curl'), h3.join(', '));
      check('12: from 3 letters: "bcp" is NOT forgiven for the wrong first letter / two wrong, but "bicp" and "hqm" are', !ES.searchExercises(names, 'xqm', 999).includes('Hammer Curl') && ES.searchExercises(names, 'bicp', 999).includes('Bicep Curl'));
      check('12: exact and word-start matches still rank before 3-letter typo matches', (() => { const r = ES.searchExercises(names, 'cur', 999); const first = r.findIndex((n) => ES.matchTier(n, 'cur') === 2); return first === -1 || r.slice(0, first).every((n) => ES.matchTier(n, 'cur') < 2); })());
    }
    check('7: a nonsense word of 4+ letters far from every name finds nothing', ES.searchExercises(names, 'zzzzqq', 999).length === 0);
  }
  check('14: "g" never finds Bodyweight Squat; "sq" finds the squats starting with Sq or with a later word Sq*', !ES.searchExercises(names, 'g', 999).includes('Bodyweight Squat') && ES.searchExercises(names, 'sq', 999).includes('Bodyweight Squat'));
}
(async () => {
  // ───────────────────────── Create workout ─────────────────────────
  console.log('--- Create workout ---');
  {
    const { browser, page, msgs, logs } = await openDesign('create', DS.createWorkoutData(cat));
    check('page posts ready with no errors', msgs.some((m) => m.type === 'ready') && !logs.some((l) => /pageerror|render error/.test(l)), logs.filter((l) => /error/i.test(l)).slice(0, 2).join(' | '));
    check('starts EMPTY (the design\'s demo Squat / Push-up workout is gone)', /No exercises yet/.test(await text(page)) && !/Squat|Push-up/.test(await text(page)));
    const fs = await page.evaluate(() => [...document.querySelectorAll('input')].map((i) => parseFloat(getComputedStyle(i).fontSize)));
    check('every input is at least 16px (no iOS zoom on focus); the 24px title input keeps its size', fs.every((f) => f >= 16) && fs.includes(24), fs.join(','));
    // 13: a clear "Add exercise" button in the empty card that opens the search
    const addBtn = await page.evaluate(() => { const b = document.querySelector('[data-ds-add]'); return b ? { text: b.textContent.trim(), w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height } : null; });
    check('13: the empty card has an "Add exercise" button (a real, tappable size)', !!addBtn && addBtn.text === 'Add exercise' && addBtn.w >= 120 && addBtn.h >= 40, JSON.stringify(addBtn));
    check('13: its helper line no longer points "above" at a search bar with no button', /Tap Add exercise to search/.test(await text(page)) && !/Search above/.test(await text(page)));
    await page.evaluate(() => document.querySelector('[data-ds-add]').click());
    await page.waitForTimeout(150);
    check('13: tapping Add exercise opens the search (the search box is focused)', await page.evaluate(() => document.activeElement && document.activeElement.placeholder === 'Search to add an exercise'));
    await shot(page, 'create-empty');
    // 14: the search rule: starts with first, then a later word starts with it, never mid-word
    await type(page, 'input[placeholder="Search to add an exercise"]', 'g');
    const gt = await text(page);
    const gNames0 = names.filter((n) => gt.includes(n)); const gNames = gNames0.filter((n) => !gNames0.some((o) => o !== n && o.includes(n) && o.length > n.length)); // 'Push-up' inside 'Close-grip Push-up' is not its own row
    const bad = gNames.filter((n) => !/(^|[\s\-\/])g/i.test(n));
    check('14: typing "g" shows only names where a word starts with g, and never Bodyweight Squat (g is mid-word there)', !gt.includes('Bodyweight Squat') && bad.length === 0 && gNames.length > 0, gNames.join(', ') + (bad.length ? '  BAD: ' + bad.join(', ') : ''));
    check('14: names that START with g come first (Goblet Squat before any later-word match)', gt.indexOf('Goblet Squat') > 0 && gNames.filter((n) => !/^g/i.test(n)).every((n) => gt.indexOf(n) > gt.indexOf('Goblet Squat')), gt.slice(0, 260));
    await type(page, 'input[placeholder="Search to add an exercise"]', 'hqmmer');
    check('7: in Create workout, typing "hqmmer" lists Hammer Curl', /Hammer Curl/.test(await text(page)), (await text(page)).slice(0, 160));
    await type(page, 'input[placeholder="Search to add an exercise"]', '');
    await type(page, 'input[placeholder="Search to add an exercise"]', 'curl');
    const found = await text(page);
    check('search runs over the real catalog (Bicep Curl is a result, demo-only names are not)', /Bicep Curl/.test(found) && !/Goblet squat|Glute bridge/.test(found), found.slice(0, 140));
    await clickText(page, /^Bicep Curl$/);
    await page.waitForTimeout(200);
    let t = await text(page);
    check('tapping a result adds it with the catalog\'s own sets and reps (Bicep Curl 3 x 10) and a weight stepper', /Bicep Curl/.test(t) && /Sets\s*3/.test(t) && /Reps per set\s*10/.test(t) && /Weight/.test(t) && /45 lb/.test(t), t.slice(0, 200));
    await type(page, 'input[placeholder="Search to add an exercise"]', 'push-up');
    await clickText(page, /^Push-up$/);
    await page.waitForTimeout(200);
    const weights = await page.evaluate(() => (document.getElementById('dc-root').innerText.match(/Weight/g) || []).length);
    check('a bodyweight exercise has no weight stepper (only the Bicep Curl has one)', weights === 1, `${weights} weight steppers`);
    // steppers: the "+" of the first card's Sets
    await page.evaluate(() => { const plus = [...document.querySelectorAll('#dc-root div')].filter((d) => d.style.cursor === 'pointer' && d.style.width === '36px' && d.querySelector('svg')); plus[1].click(); });
    await page.waitForTimeout(150);
    const cur = await page.evaluate(() => window.__athltCurrent);
    check('a stepper changes the real state (Bicep Curl sets 3 -> 4)', cur.items[0].n === 'Bicep Curl' && cur.items[0].sets === 4, JSON.stringify(cur.items[0]));
    const disabled = () => page.evaluate(() => { const a = [...document.querySelectorAll('#dc-root a')].find((x) => /Save workout/.test(x.textContent)); return getComputedStyle(a).pointerEvents; });
    check('Save is available with 1 or more exercises, even with NO name typed (it was stuck grey)', (await disabled()) === 'auto');
    const bg = await page.evaluate(() => { const a = [...document.querySelectorAll('#dc-root a')].find((x) => /Save workout/.test(x.textContent)); return getComputedStyle(a).backgroundColor; });
    check('...and the button is the dark active colour, not grey', bg === 'rgb(17, 17, 20)', bg);
    await type(page, 'input[placeholder="Name your workout"]', 'Arms and Chest');
    check('typing a name keeps it available', (await disabled()) === 'auto');
    check('the summary line is real ("2 exercises ...")', /2 exercises/.test(await text(page)));
    await shot(page, 'create-filled');
    await anchor(page, 'Save workout');
    await page.waitForTimeout(150);
    const sv = lastMsg(msgs, 'save');
    check('Save posts the name and the exact exercises (and the page never navigates)', sv && sv.name === 'Arms and Chest' && sv.items.length === 2 && sv.items[0].sets === 4 && page.url().includes('createworkout.html'), JSON.stringify(sv));
    const w = DS.workoutFromPage(sv, cat, 5, 1700000000000);
    check('...which becomes a real plan workout with real exercise ids', w.splitLabel === 'Arms and Chest' && w.exercises.length === 2 && w.exercises.every((e) => EXERCISE_CATALOG.some((c) => c.id === e.exerciseId)) && w.exercises[0].targetSets === 4 && w.id === 'custom-1700000000000', JSON.stringify(w.exercises.map((e) => e.exerciseId + ':' + e.targetSets + 'x' + e.targetReps)));
    await page.evaluate(() => document.querySelector('#dc-root div[aria-label="Remove"]').click());
    await page.waitForTimeout(150);
    check('the remove button removes an exercise', (await page.evaluate(() => window.__athltCurrent.items.length)) === 1);
    await clickText(page, /^Build with Cue$/);
    await page.waitForTimeout(250);
    await type(page, 'input[placeholder="e.g. a 30 minute leg day"]', '4x8 bodyweight squat and 3 sets of 12 push-ups');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const cu = await page.evaluate(() => window.__athltCurrent.items.map((i) => i.n + ':' + i.sets + 'x' + i.reps));
    check('the Cue box adds REAL exercises from what you type (4x8 Bodyweight Squat, 3 sets of 12 Push-up)', cu.includes('Bodyweight Squat:4x8') && cu.includes('Push-up:3x12'), cu.join(', '));
    await shot(page, 'create-cue');
    await page.evaluate(() => document.querySelector('#dc-root a[aria-label="Back"]').click());
    check('Back posts back and the page stays put', !!lastMsg(msgs, 'back') && page.url().includes('createworkout.html'));
    await browser.close();
  }

  // ───────────────────────── Log a session ─────────────────────────
  console.log('--- Log a session ---');
  {
    const now = new Date(2026, 10, 18, 9, 30); // Nov 18 2026
    const { browser, page, msgs, logs } = await openDesign('log', DS.logSessionData(cat, now));
    check('page posts ready with no errors', msgs.some((m) => m.type === 'ready') && !logs.some((l) => /pageerror|render error/.test(l)), logs.filter((l) => /error/i.test(l)).slice(0, 2).join(' | '));
    let t = await text(page);
    check('starts empty on Today (nothing picked, no demo Squat / Push-up list, no "Sep 12")', /Today/.test(t) && !/Sep/.test(t) && (await page.evaluate(() => window.__athltCurrent.items.length)) === 0);
    // 13: the main action is obvious: a clear "Log exercise" button that opens the search
    const logBtn = await page.evaluate(() => { const b = document.querySelector('[data-ds-log]'); if (!b) return null; const r = b.getBoundingClientRect(); return { text: b.textContent.trim(), w: r.width, h: r.height }; });
    check('13: a clear "Log exercise" button (a real, tappable size) sits under the search box', !!logBtn && logBtn.text === 'Log exercise' && logBtn.w >= 120 && logBtn.h >= 40, JSON.stringify(logBtn));
    await page.evaluate(() => document.querySelector('[data-ds-log]').click());
    await page.waitForTimeout(150);
    check('13: tapping Log exercise opens the search (the search box is focused)', await page.evaluate(() => document.activeElement && document.activeElement.placeholder === 'Search exercises'));
    // 14: the "Today" calendar is fully opaque (it was white at 74% with a blur, so the page showed through)
    await page.evaluate(() => { const d = [...document.querySelectorAll('#dc-root div')].find((x) => x.style.cursor === 'pointer' && /^Today/.test((x.textContent || '').trim())); d.click(); });
    await page.waitForTimeout(450);
    const calStyle = await page.evaluate(() => { const p = document.querySelector('div[style*="ls-cal"]'); if (!p) return null; const cs = getComputedStyle(p); return { bg: cs.backgroundColor, bf: cs.backdropFilter || cs.webkitBackdropFilter || 'none' }; });
    check('14: the calendar is fully opaque white (alpha 1, no blur): nothing shows through it', !!calStyle && (calStyle.bg === 'rgb(255, 255, 255)' || calStyle.bg === 'rgba(255, 255, 255, 1)') && /none/.test(calStyle.bf), JSON.stringify(calStyle));
    check('14: the calendar heading shows the real month (November 2026), not the frozen September of the design', /November 2026/.test(await text(page)) && !/September 2026/.test(await text(page)));
    await shot(page, 'log-calendar-open');
    await page.evaluate(() => { const d = [...document.querySelectorAll('#dc-root div')].find((x) => x.style.cursor === 'pointer' && /^Today/.test((x.textContent || '').trim())); d.click(); });
    await page.waitForTimeout(250);
    // 15: clear title + helper line, recent and popular chips to tap
    check('8: ONE clear title ("Log an exercise") and no grey helper text under it', /Log an exercise/.test(t) && !/What Did You Do/i.test(t) && !/Pick an exercise you did/.test(t) && !(await page.evaluate(() => !!document.getElementById('__ds_help'))), t.slice(0, 160));
    const chips = await page.evaluate(() => [...document.querySelectorAll('[data-ds-chip]')].map((c) => c.getAttribute('data-ds-chip')));
    check('8: with no history yet, a tidy list of 5 popular exercises sits under the search box (never empty)', chips.length === 5 && chips.includes('Bodyweight Squat'), chips.join(', '));
    check('15: they are real catalog exercises', chips.every((n) => names.includes(n)));
    check('8: the list is labelled "Popular exercises" until you have logged some', /popular exercises/i.test(t));
    check('8: it is a list (rows stacked in ONE card), not wrapped chips: every row is full width and rows are below each other', await page.evaluate(() => { const r = [...document.querySelectorAll('[data-ds-chip]')].map((e) => e.getBoundingClientRect()); return r.length > 1 && r.every((b, k) => k === 0 || b.top >= r[k - 1].bottom - 1) && r.every((b) => b.width > 300); }));
    await shot(page, 'log-empty');
    {
      const rb = await openDesign('log', DS.logSessionData(cat, now, ['Bicep Curl', 'Lunge', 'Dips']));
      const rt = await text(rb.page);
      const rows = await rb.page.evaluate(() => [...document.querySelectorAll('[data-ds-chip]')].map((e) => e.getAttribute('data-ds-chip')));
      check('8: with history, the list is your Recent exercises (newest first), as a tidy list', /recent exercises/i.test(rt) && rows.join() === 'Bicep Curl,Lunge,Dips' && !/popular/i.test(rt), rows.join(', '));
      await shot(rb.page, 'log-recent');
      await rb.browser.close();
    }
    await page.evaluate(() => document.querySelector('[data-ds-chip="Bodyweight Squat"]').click());
    await page.waitForTimeout(250);
    const afterChip = await page.evaluate(() => ({ items: window.__athltCurrent.items.map((i) => i.n), chipText: document.querySelector('[data-ds-chip="Bodyweight Squat"]').getAttribute('data-ds-on') }));
    check('15: tapping a chip picks that exercise (it shows in the list below with its sets and reps) and the chip shows a tick', afterChip.items.includes('Bodyweight Squat') && afterChip.chipText === '1', JSON.stringify(afterChip));
    await page.evaluate(() => document.querySelector('[data-ds-chip="Bodyweight Squat"]').click());
    await page.waitForTimeout(200);
    check('15: tapping it again un-picks it', !(await page.evaluate(() => window.__athltCurrent.items.map((i) => i.n))).includes('Bodyweight Squat'));
    await type(page, 'input[placeholder="Search exercises"]', 'pu');
    check('15: the chips hide while searching', await page.evaluate(() => getComputedStyle(document.getElementById('__ds_chips')).display === 'none'));
    await page.waitForTimeout(150);
    const body = await text(page);
    const iPull = body.indexOf('Pull-up'), iPush = body.indexOf('Push-up'), iCable = body.indexOf('Cable Pull-Through');
    check('search puts names that START with the text first (like Train)', iPull > 0 && iPush > 0 && iCable > 0 && Math.max(iPull, iPush) < iCable, body.slice(0, 200));
    await type(page, 'input[placeholder="Search exercises"]', 'row');
    await clickText(page, /^Barbell Row$/);
    await page.waitForTimeout(150);
    await type(page, 'input[placeholder="Search exercises"]', 'lunge');
    await clickText(page, /^Lunge$/);
    await page.waitForTimeout(200);
    const c1 = await page.evaluate(() => window.__athltCurrent);
    check('picking from the search adds real exercises with their own defaults', c1.items.length === 2 && c1.items.every((i) => i.sets >= 1 && i.reps >= 1 && names.includes(i.n)), JSON.stringify(c1.items));
    await shot(page, 'log-picked');
    await page.evaluate(() => [...document.querySelectorAll('#dc-root div')].find((d) => d.style.cursor === 'pointer' && /^Today$/.test(d.textContent.trim())).click());
    await page.waitForTimeout(250);
    const cal = await page.evaluate(() => [...document.querySelectorAll('#dc-root div')].filter((d) => /^\d{1,2}$/.test(d.textContent.trim()) && d.style.height === '38px').map((d) => ({ n: +d.textContent.trim(), cursor: d.style.cursor })));
    check('the calendar is the real month (Nov: 30 days); future days (after the 18th) are not selectable', cal.length === 30 && cal.filter((c) => c.n > 18).every((c) => c.cursor === 'default') && cal.filter((c) => c.n <= 18).every((c) => c.cursor === 'pointer'), `${cal.length} days`);
    await shot(page, 'log-calendar');
    await page.evaluate(() => [...document.querySelectorAll('#dc-root div')].find((d) => /^17$/.test(d.textContent.trim()) && d.style.height === '38px').click());
    await page.waitForTimeout(250);
    check('picking the 17th labels the day "Yesterday"', /Yesterday/.test(await text(page)));
    await page.evaluate(() => [...document.querySelectorAll('#dc-root div')].find((d) => d.style.cursor === 'pointer' && /^Yesterday$/.test(d.textContent.trim())).click());
    await page.waitForTimeout(250);
    await page.evaluate(() => [...document.querySelectorAll('#dc-root div')].find((d) => /^12$/.test(d.textContent.trim()) && d.style.height === '38px').click());
    await page.waitForTimeout(250);
    check('picking the 12th labels it "Thu, Nov 12"', /Thu, Nov 12/.test(await text(page)), (await text(page)).match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun), Nov \d+/)?.[0]);
    await clickText(page, /^Log with Cue$/);
    await page.waitForTimeout(250);
    await type(page, 'input[placeholder="e.g. 3 sets of 10 squats at 135"]', '3 sets of 10 push-ups');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    check('the Cue box logs REAL exercises (3 x 10 Push-up)', (await page.evaluate(() => window.__athltCurrent.items.map((i) => i.n + ':' + i.sets + 'x' + i.reps))).includes('Push-up:3x10'));
    await page.evaluate(() => document.querySelectorAll('#dc-root div[aria-label="Close"]')[0].click());
    await page.waitForTimeout(250);
    await anchor(page, 'Save session');
    await page.waitForTimeout(150);
    const sv = lastMsg(msgs, 'save');
    check('Save posts the picked day and the exact exercises (page does not navigate)', sv && sv.dayNum === 12 && sv.month === 10 && sv.year === 2026 && sv.items.length === 3 && page.url().includes('logsessionv2.html'), JSON.stringify({ d: sv && sv.dayNum, n: sv && sv.items.length }));
    const r = DS.entriesFromPage(sv, cat, now);
    check('...which become real session-log entries on that day (noon): reps = sets x reps, not form-judged', r.entries.length === 3 && new Date(r.ts).getDate() === 12 && new Date(r.ts).getHours() === 12 && r.entries.every((e) => e.formChecked === false && e.reps > 0 && EXERCISE_CATALOG.some((c) => c.id === e.exerciseId)), JSON.stringify(r.entries.map((e) => e.exerciseId + ':' + e.reps)));
    check('saving on Today uses the current time', DS.entriesFromPage({ ...sv, dayNum: 18 }, cat, now).ts === now.getTime());
    await page.evaluate(() => document.querySelector('#dc-root a[aria-label="Back"]').click());
    check('Back posts back', !!lastMsg(msgs, 'back'));
    await browser.close();
  }

  // ───────────────────────── My workouts ─────────────────────────
  console.log('--- My workouts ---');
  {
    const wk = [
      { id: 'a1', splitLabel: 'Upper Body', exercises: [{ displayName: 'Push-up', targetSets: 3 }, { displayName: 'Bicep Curl', targetSets: 3 }] },
      { id: 'b2', splitLabel: 'Leg Day', exercises: [{ displayName: 'Bodyweight Squat', targetSets: 4 }, { displayName: 'Lunge', targetSets: 3 }] },
      { id: 'c3', splitLabel: 'Arms and Chest', exercises: [{ displayName: 'Push-up', targetSets: 4 }] },
    ];
    const { browser, page, msgs, logs } = await openDesign('my', DS.myWorkoutsData(wk, ['b2']));
    check('page posts ready with no JS errors', msgs.some((m) => m.type === 'ready') && !logs.some((l) => /pageerror|render error/.test(l)));
    let t = await text(page);
    check('shows YOUR plan\'s workouts (no Push Day / Quick Core / Pull Day / Full Body Fast demo cards)', /Upper Body/.test(t) && /Leg Day/.test(t) && /Arms and Chest/.test(t) && !/Quick Core|Push Day|Pull Day|Full Body Fast/.test(t), t.slice(0, 160));
    check('there are three tabs: All / Mine / FormPal templates', /All\s*Mine\s*FormPal templates/.test(t), t.slice(0, 80));
    check('All also lists the FormPal templates, each labelled Template (6 of them)', ['Beginner full body', 'Upper body', 'Lower body', 'Push', 'Pull', 'Core'].every((n) => t.includes(n)) && (t.match(/Template · /g) || []).length === 6, (t.match(/Template · /g) || []).length + ' labelled');
    check('each card shows a real estimated length (3+3 sets -> 15 min; 4+3 -> 18 min)', /Upper Body\s*15 min/.test(t) && /Leg Day\s*18 min/.test(t), t.match(/Upper Body \d+ min/)?.[0]);
    await shot(page, 'my-all');
    await page.evaluate(() => document.querySelectorAll('#dc-root div[aria-label="Save"]')[0].click());
    await page.waitForTimeout(150);
    const sm = lastMsg(msgs, 'saved');
    check('tapping a bookmark posts the new saved list (a1 + b2) so the app can keep it', sm && sm.ids.slice().sort().join() === 'a1,b2', JSON.stringify(sm));
    await clickText(page, /^Mine$/);
    await page.waitForTimeout(200);
    t = await text(page);
    check('the Mine tab lists the user own workouts (all three) and no ready-made template', /Upper Body/.test(t) && /Leg Day/.test(t) && /Arms and Chest/.test(t) && !/Template · /.test(t) && !/Beginner full body/.test(t), t.slice(0, 200));
    await shot(page, 'my-mine');
    await clickText(page, /^FormPal templates$/);
    await page.waitForTimeout(200);
    t = await text(page);
    check('the FormPal templates tab lists only the 6 templates, none of the user own', ['Beginner full body', 'Upper body', 'Lower body', 'Push', 'Pull', 'Core'].every((n) => t.includes(n)) && !/Leg Day|Arms and Chest/.test(t), t.slice(0, 200));
    check('...and says what they are: ready-made basics for anyone, not tailored to you', /Ready-made basics for anyone\. Not tailored to you\./.test(t), t.slice(0, 160));
    await shot(page, 'my-templates');
    await page.evaluate(() => document.querySelectorAll('#dc-root div[aria-label="Save"]')[0].click());
    await page.waitForTimeout(150);
    const sm2 = lastMsg(msgs, 'saved');
    check('bookmarking a template saves it to Mine (its id is posted with the saved list)', sm2 && sm2.ids.some((i) => /^tpl-/.test(i)), JSON.stringify(sm2));
    await clickText(page, /^Mine$/);
    await page.waitForTimeout(200);
    t = await text(page);
    check('...and it now shows under Mine, still labelled Template', /Beginner full body/.test(t) && (t.match(/Template · /g) || []).length === 1, t.slice(0, 200));
    await page.evaluate(() => { const a = [...document.querySelectorAll('#dc-root a')].find((x) => /Beginner full body/.test(x.textContent)); a.click(); });
    const tm = lastMsg(msgs, 'openWorkout');
    check('tapping a template posts its template id (the app opens the preview for it)', tm && /^tpl-beginner-full$/.test(tm.id), JSON.stringify(tm));
    await clickText(page, /^All$/);
    await type(page, 'input[placeholder="Search your workouts"]', 'lunge');
    t = await text(page);
    check('search matches workout names AND their exercises (lunge -> Leg Day, never Arms and Chest)', /Leg Day/.test(t) && !/Arms and Chest/.test(t));
    await type(page, 'input[placeholder="Search your workouts"]', '');
    await page.evaluate(() => { const a = [...document.querySelectorAll('#dc-root a')].find((x) => /Leg Day/.test(x.textContent)); a.click(); });
    const om = lastMsg(msgs, 'openWorkout');
    check('tapping a card opens THAT workout (posts its id); the page does not navigate', om && om.id === 'b2' && page.url().includes('myworkouts.html'), JSON.stringify(om));
    await anchor(page, 'Create workout');
    check('the Create workout button posts create', !!lastMsg(msgs, 'create'));
    await page.evaluate(() => document.querySelector('#dc-root a[aria-label="Back"]').click());
    check('Back posts back', !!lastMsg(msgs, 'back'));
    await browser.close();
    const e = await openDesign('my', DS.myWorkoutsData([], []));
    const te = await text(e.page);
    check('with no workouts of your own, All still offers the templates to browse', /Beginner full body/.test(te) && !/Leg Day/.test(te), te.slice(0, 120));
    await clickText(e.page, /^Mine$/);
    await e.page.waitForTimeout(200);
    const te2 = await text(e.page);
    check('...and an empty Mine tab shows the design own empty state (create one)', /Create/i.test(te2) && !/Beginner full body/.test(te2), te2.slice(0, 120));
    await shot(e.page, 'my-empty');
    await e.browser.close();
  }
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
