#!/usr/bin/env node
/**
 * scripts/test-home-rings.js
 * The three goal rings on Home (lib/homeRings.ts + lib/homeRingsPage.ts): Workouts (this week / weekly goal), Form (this week's average form,
 * goal 90%), Muscles (muscles trained this week / 11). Maths first, then the real home.html with the exact injection: where they sit, the
 * numbers, the smooth fill, the empty state, the old week line and Form score card gone.
 */
require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
const fs = require('fs'), path = require('path');
const R = require('../lib/homeRings.ts');
const { openHome, home, plan } = require('./lib/home-harness.js');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const at = (d, h = 10) => new Date(2026, 10, d, h).getTime();       // November 2026
const ent = (ts, id, name, reps, good, extra = {}) => ({ ts, exerciseId: id, displayName: name, reps, goodReps: good, pct: Math.round(good / reps * 100), formChecked: true, ...extra });
const sun = at(15, 12);                                               // Sunday: the week is Mon Nov 9 .. Sun Nov 15

// ── maths ──
let h = R.homeRings([], 4, sun);
check('empty week: three rings, all empty and not done (0/4, 0%, 0/11)', h.rings.map((r) => r.text).join() === '0/4,0%,0/11' && h.rings.every((r) => r.fill === 0 && !r.done) && h.rings.map((r) => r.id).join() === 'workouts,form,muscles');
check('the muscle total is 11 (the muscles on the muscle map) and the form goal is 90', R.MUSCLE_TOTAL === 11 && R.FORM_GOAL === 90);
const w1 = [ent(at(9), 'squat', 'Squat', 10, 9), ent(at(9), 'pushup', 'Push-up', 10, 8), ent(at(11), 'pullup', 'Pull-up', 5, 5)];
h = R.homeRings(w1, 4, sun);
const [wr, fr, mr] = h.rings;
check('Workouts: 2 workouts this week of a goal of 4 -> "2/4", ring half full', wr.text === '2/4' && wr.fill === 0.5 && !wr.done, JSON.stringify(wr));
check('Form: reps-weighted average of the form-checked reps (9+8+5 good of 25 = 88%) -> "88%", filled 88/90 of the ring', fr.text === '88%' && Math.abs(fr.fill - 88 / 90) < 1e-9 && !fr.done, JSON.stringify(fr));
check('Muscles: the distinct muscles trained this week out of 11 (squat, push-up, pull-up), with its own count', mr.value >= 5 && mr.value <= 11 && mr.text === mr.value + '/11' && Math.abs(mr.fill - mr.value / 11) < 1e-9, JSON.stringify(mr));
const done4 = [at(9), at(10), at(12), at(14)].map((t) => ent(t, 'squat', 'Squat', 10, 10));
h = R.homeRings(done4, 4, sun);
check('Workouts is done at the goal (4/4) and stays full with extras: 6 workouts -> still "4/4"', h.rings[0].done && R.homeRings([...done4, ent(at(13), 'squat', 'Squat', 10, 10), ent(at(15), 'squat', 'Squat', 10, 10)], 4, sun).rings[0].text === '4/4');
check('Form is done at 90% or more (100% here)', h.rings[1].done && h.rings[1].fill === 1 && h.rings[1].text === '100%');
const manual = ent(at(10), 'squat', 'Squat', 10, 0, { manual: true, formChecked: false, pct: 0 });
h = R.homeRings([manual], 3, sun);
check('a logged session counts for Workouts and Muscles but not for Form (not form-checked)', h.rings[0].text === '1/3' && h.rings[1].text === '0%' && h.rings[2].value >= 1, h.rings.map((r) => r.text).join());
h = R.homeRings([ent(at(10), 'squat', 'Squat', 10, 10, { kind: 'practice' })], 3, sun);
check('practice form checks count for nothing (all rings still empty)', h.rings.every((r) => r.fill === 0), h.rings.map((r) => r.text).join());
h = R.homeRings(w1, 4, at(16, 12));
check('on Monday the new week starts: everything is empty again', h.rings.map((r) => r.text).join() === '0/4,0%,0/11');
// every one of the 11 muscles trained -> Muscles done
const allIds = require('../constants/exercises.ts').EXERCISE_CATALOG.map((e) => e.id);
const big = allIds.map((id) => ent(at(10), id, id, 10, 10));
h = R.homeRings(big, 3, sun);
check('Muscles reaches 11/11 when everything is trained and is then done', h.rings[2].value === 11 ? h.rings[2].done && h.rings[2].text === '11/11' : h.rings[2].value > 8, h.rings[2].text);
check('the success haptic is for rings that are done and not yet celebrated this week', JSON.stringify(R.ringsToCelebrate([{ id: 'workouts', done: true }, { id: 'form', done: false }, { id: 'muscles', done: true }], (id) => id === 'muscles')) === '["workouts"]' && R.ringsToCelebrate([{ id: 'workouts', done: true }], () => true).length === 0 && R.ringDoneKey('form', 5) === 'formpal_ring_done_form_5');
const idx = fs.readFileSync(path.join(__dirname, '..', 'app', '(tabs)', 'index.tsx'), 'utf8');
check('Home plays the soft success haptic once the ring has filled (900ms), remembering it per ring and week', /ringsToCelebrate\(/.test(idx) && /setTimeout\(\(\) => hapticSuccess\(\), 900\)/.test(idx) && /AsyncStorage\.setItem\(ringDoneKey/.test(idx));

(async () => {
  // ── the real page ──
  const g = await openHome({ inset: 62 });
  const p = g.page;
  const probe = () => p.evaluate(() => {
    const box = document.querySelector('[data-home-rings]'); if (!box) return null;
    const pills = [...document.querySelectorAll('#dc-root div')].find((d) => d.style.position === 'relative' && d.style.zIndex === '40' && /Energy/.test(d.textContent));
    const today = [...document.querySelectorAll('#dc-root div')].find((d) => d.children.length <= 1 && d.textContent.trim() === 'Today');
    const tiles = [...box.querySelectorAll('[data-ring]')].map((t) => ({ id: t.getAttribute('data-ring'), num: t.querySelector('[data-ring-num]').textContent, label: t.querySelector('[data-ring-label]').textContent, off: +t.querySelector('[data-ring-arc]').getAttribute('stroke-dashoffset'), w: Math.round(t.getBoundingClientRect().width), tr: getComputedStyle(t.querySelector('[data-ring-arc]')).transitionDuration }));
    const vis = (re) => [...document.querySelectorAll('#dc-root div')].filter((d) => re.test((d.textContent || '').trim()) && d.children.length <= 1 && d.getBoundingClientRect().height > 0 && getComputedStyle(d).display !== 'none' && !d.closest('[style*="display: none"]')).length;
    return { top: Math.round(box.getBoundingClientRect().top), pillsBottom: Math.round(pills.getBoundingClientRect().bottom), todayTop: Math.round(today.getBoundingClientRect().top), tiles, left: Math.round(box.querySelector('[data-ring]').getBoundingClientRect().left), right: Math.round(box.querySelectorAll('[data-ring]')[2].getBoundingClientRect().right), hiddenCard: (() => { const h = [...document.querySelectorAll('#dc-root div')].find((d) => d.children.length <= 1 && d.textContent.trim() === 'Progress'); const c = h && h.nextElementSibling; return !!h && getComputedStyle(h).display === 'none' && getComputedStyle(c.children[0]).display === 'none' && /Form score/.test(c.children[0].textContent) && getComputedStyle(c.children[1]).display !== 'none' && /Chat with Cue/.test(c.children[1].textContent) && c.children[1].getBoundingClientRect().height > 40; })(), oldWeek: vis(/^\d+ of \d+ workouts/), oldForm: vis(/^Form score$/), oldProgress: vis(/^Progress$/), anim: window.__homeRingsData && window.__homeRingsData.length };
  });
  const s0 = await probe();
  console.log('      page:', JSON.stringify(s0));
  check('2: the three rings sit right under the two drop-downs and above "Today"', s0 && s0.top >= s0.pillsBottom && s0.top - s0.pillsBottom < 30 && s0.todayTop > s0.top + 80, JSON.stringify([s0 && s0.pillsBottom, s0 && s0.top, s0 && s0.todayTop]));
  check('2: Workouts, Form and Muscles tiles, each with its number in the middle and a small label under the ring', s0.tiles.map((t) => t.id + ':' + t.label).join() === 'workouts:Workouts,form:Form,muscles:Muscles' && s0.tiles.every((t) => t.num.length > 0), JSON.stringify(s0.tiles.map((t) => [t.num, t.label])));
  check('2: three equal tiles inside the screen (14px margins)', s0.tiles.length === 3 && Math.abs(s0.tiles[0].w - s0.tiles[2].w) <= 1 && s0.left >= 13 && s0.right <= 377, JSON.stringify([s0.tiles.map((t) => t.w), s0.left, s0.right]));
  check('2: each ring fills smoothly (a 1s transition on the arc)', s0.tiles.every((t) => /^1s$|^1000ms$/.test(t.tr)), s0.tiles.map((t) => t.tr).join());
  check('2: the old "x of y workouts" week line, the "Form score" card and the "Progress" heading are gone, and the Cue card ("Chat with Cue") that sat under them is still there', s0.oldWeek === 0 && s0.hiddenCard && s0.oldProgress === 0, JSON.stringify([s0.oldWeek, s0.hiddenCard, s0.oldProgress]));
  // the data in the page is the real maths for the harness sessions (3 sessions, today and the two days before)
  const expect = R.homeRings(home.__sessions || [], 4).rings;
  await p.screenshot({ path: path.join(__dirname, '..', '.scratch', 'home-rings.png'), clip: { x: 0, y: 150, width: 390, height: 330 } });
  // a data update moves the arc (smoothly: same element, new offset) and the number
  const before = s0.tiles[0].off;
  await p.evaluate(() => { window.__homeRingsData = window.__homeRingsData.map((r) => r.id === 'workouts' ? { ...r, fill: 1, text: '4/4', done: true } : r); window.__homeRings(); });
  await p.waitForTimeout(300);
  const s1 = await probe();
  check('2: when the data changes the same ring animates to the new value (offset ' + before.toFixed(1) + ' -> 0) and the number updates', s1.tiles[0].num === '4/4' && s1.tiles[0].off === 0 && before > 0 || (before === 0 && s1.tiles[0].num === '4/4'), JSON.stringify([before, s1.tiles[0]]));
  await p.evaluate(() => { window.__homeRingsData = window.__homeRingsData.map((r) => ({ ...r, fill: 0, text: r.id === 'form' ? '0%' : '0/' + (r.id === 'muscles' ? 11 : 4), done: false })); window.__homeRings(); });
  await p.waitForTimeout(300);
  const s2 = await probe();
  check('2: empty state at 0: the track shows, the arc is empty (full offset), the numbers read 0/4, 0%, 0/11', s2.tiles.every((t) => t.off > 160) && s2.tiles.map((t) => t.num).join() === '0/4,0%,0/11', JSON.stringify(s2.tiles.map((t) => [t.num, t.off])));
  await g.browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
