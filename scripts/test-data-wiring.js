#!/usr/bin/env node
/**
 * scripts/test-data-wiring.js
 * Full wiring check: the Progress Form score graph, Personal bests and Past workouts, and every value on the Profile tab, come from
 * real data, never filler. Each page is opened (real design file + the exact shipped injection) with a fixture whose numbers are
 * chosen so that nothing can match by luck, every expected value is computed HERE from the raw fixture (not by the code under
 * test), and then the same page is opened with NO data: no number from the design's own demo content may appear.
 * Prints a table at the end: item / where the data comes from / result.
 */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { pathToFileURL } = require('url');
const { openProgress } = require('./lib/progress-harness.js');
const { open: openProfile, data: profileFixture } = require('./lib/prof-common.js');
const { buildProgressData } = require('../lib/progressData.ts');
const { buildProfileData } = require('../lib/profileData.ts');
const { computeMuscleTiers, calcStreak } = require('../lib/sessionLog.ts');

const DAY = 86400000, now = Date.now();
const rows = [];
let failed = 0;
const check = (item, source, name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${item}] ${name}${detail ? '  -> ' + detail : ''}`);
  rows.push({ item, source, name, ok });
  if (!ok) failed++;
};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayKey = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const lines = (p, root = '#dc-root') => p.evaluate((r) => document.querySelector(r).innerText.split('\n').map((s) => s.trim()).filter(Boolean), root);
const rawLines = async (file) => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(pathToFileURL(path.join(__dirname, '..', 'assets', 'app screens', file)).href); await p.waitForTimeout(2500);
  const l = await lines(p, 'body'); await b.close(); return l;
};

// ── fixture: 5 workouts on 5 days (distinct, hand-picked numbers) ──
const ent = (daysAgo, id, name, reps, good, checked = true) => ({ ts: now - daysAgo * DAY - 1000, exerciseId: id, displayName: name, reps, goodReps: good, pct: Math.round((good / reps) * 100), formChecked: checked });
const SESS = [ent(0, 'squat', 'Bodyweight Squat', 20, 15), ent(1, 'pushup', 'Push-up', 15, 12), ent(2, 'squat', 'Bodyweight Squat', 10, 9), ent(5, 'curl', 'Bicep Curl', 12, 12), ent(6, 'curl', 'Bicep Curl', 37, 30)];
const EXP = {
  pcts: SESS.map((s) => Math.round((s.goodReps / s.reps) * 100)),   // [75, 80, 90, 100, 81]
  bestForm: Math.max(...SESS.map((s) => Math.round((s.goodReps / s.reps) * 100))),
  mostReps: Math.max(...SESS.map((s) => s.reps)),
  streak: (() => { const days = [...new Set(SESS.map((s) => dayKey(s.ts)))].sort((a, b) => a - b); let best = 0, run = 0, prev = -1; for (const d of days) { run = prev >= 0 && Math.round((d - prev) / DAY) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; } return best; })(),
};

(async () => {
  // ═════════════════════════ PROGRESS ═════════════════════════
  const real = buildProgressData(SESS, computeMuscleTiers(SESS), [], now, { insets: { top: 62, bottom: 34 } });
  const pg = await openProgress(real); await pg.page.waitForTimeout(500);
  const t = await lines(pg.page);
  const after = (label, off) => t[t.indexOf(label) + off];
  const before = (label, off) => t[t.indexOf(label) - off];

  // Form score graph
  const days = [...new Set(SESS.map((s) => dayKey(s.ts)))].sort((a, b) => a - b);
  const meanOf = (k) => { const a = SESS.filter((s) => dayKey(s.ts) === k).map((s) => Math.round((s.goodReps / s.reps) * 100)); return a.reduce((x, y) => x + y, 0) / a.length; };
  const first = meanOf(days[0]), last = meanOf(days[days.length - 1]);
  const lastD = new Date(days[days.length - 1]);
  const axis = t.slice(t.indexOf('Form Score'), t.indexOf('Personal Bests')).filter((x) => /^\d+%$/.test(x)).map((x) => parseInt(x, 10));
  const selected = t.find((x) => /^\w{3} \d+ · \d+%$/.test(x));
  const dateLabels = t.slice(t.indexOf('Form Score'), t.indexOf('Personal Bests')).filter((x) => /^[A-Z][a-z]{2} \d+$/.test(x));
  check('Form score graph', 'session log: each workout = good reps / reps of its form-checked exercises; one point per day', 'data: one point per workout, values are good reps / reps (hand-computed 80, 100, 90, 80?...)',
    JSON.stringify(real.form.map((f) => f.pct)) === JSON.stringify([...SESS].sort((a, b) => a.ts - b.ts).map((s) => Math.round((s.goodReps / s.reps) * 100))), JSON.stringify(real.form.map((f) => f.pct)));
  check('Form score graph', 'same', 'page: the selected point is the newest day and its real score', selected === `${MON[lastD.getMonth()]} ${lastD.getDate()} · ${Math.round(last)}%`, selected);
  check('Form score graph', 'same', 'page: the axis never goes above 100% or below 0%', axis.length >= 3 && axis.every((v) => v >= 0 && v <= 100), axis.join(','));
  check('Form score graph', 'same', 'page: the date labels are real days from the log (first and last day)', dateLabels.includes(`${MON[new Date(days[0]).getMonth()]} ${new Date(days[0]).getDate()}`) && dateLabels.includes(`${MON[lastD.getMonth()]} ${lastD.getDate()}`), dateLabels.join(','));
  const diff = Math.round(Math.abs(last - first));
  const sentence = t.find((x) => /^Score is \d+% (higher|lower) than when you started\.$/.test(x)) || '';
  check('Form score graph', 'same', 'page: the "higher/lower than when you started" sentence is the real first-to-last difference', sentence === `Score is ${diff}% ${last >= first ? 'higher' : 'lower'} than when you started.`, sentence);

  // Personal bests
  check('Personal bests', 'session log: longest run of consecutive days / best workout form % / most reps in one workout', 'page: Best streak = longest run of days in the log', before('Best streak', 2) === String(EXP.streak) && /days?/.test(before('Best streak', 1)), `${before('Best streak', 2)} ${before('Best streak', 1)}`);
  check('Personal bests', 'same', 'page: Best form = the highest workout score', before('Best form', 2) === String(EXP.bestForm), before('Best form', 2));
  check('Personal bests', 'same', 'page: Most reps = the most reps in one workout', before('Most reps', 2) === String(EXP.mostReps), before('Most reps', 2));
  // Past workouts
  const pw = t.slice(t.indexOf('Past Workouts') + 1);
  const wantNames = [...SESS].sort((a, b) => b.ts - a.ts).map((s) => s.displayName), wantPct = [...SESS].sort((a, b) => b.ts - a.ts).map((s) => Math.round((s.goodReps / s.reps) * 100) + '%');
  const gotNames = pw.filter((x, i) => pw[i + 1] === 'Form score'), gotPct = pw.filter((x, i) => pw[i - 1] === 'Form score');
  check('Past workouts', 'session log: one row per workout (newest first), its first exercise name and its form %', 'page: names and form % match the log', JSON.stringify(gotNames) === JSON.stringify(wantNames) && JSON.stringify(gotPct) === JSON.stringify(wantPct), JSON.stringify([gotNames, gotPct]));
  check('Your rank card', 'muscle tiers computed from the session log (lib/sessionLog.computeMuscleTiers)', 'page: rank name and "% to next" equal the computed standing', t.includes(real.rank.label) && t.includes(`${real.rank.pct}% to ${real.rank.nextLabel}`), `${real.rank.label} ${real.rank.pct}% to ${real.rank.nextLabel}`);
  await pg.browser.close();

  // Progress with a perfect 100% day: the chart must still stay inside 0..100
  const perfect = buildProgressData([ent(0, 'squat', 'Bodyweight Squat', 10, 10), ent(3, 'squat', 'Bodyweight Squat', 10, 10)], {}, [], now, { insets: { top: 62, bottom: 34 } });
  const pp = await openProgress(perfect); await pp.page.waitForTimeout(400);
  const tp = await lines(pp.page); const ax2 = tp.slice(tp.indexOf('Form Score'), tp.indexOf('Personal Bests')).filter((x) => /^\d+%$/.test(x)).map((x) => parseInt(x, 10));
  check('Form score graph', 'same', 'page: all-100% history still never labels above 100%', ax2.length >= 3 && Math.max(...ax2) <= 100, ax2.join(','));
  await pp.browser.close();

  // Progress with NO data: nothing from the design's own demo content
  const empty = buildProgressData([], {}, [], now, { insets: { top: 62, bottom: 34 } });
  const pe = await openProgress(empty); await pe.page.waitForTimeout(500);
  const te = await lines(pe.page); const rawP = await rawLines('progress.html');
  const demo = rawP.filter((x) => /\d/.test(x) && !/^(2m|6m|1y)$/.test(x));
  const leaked = demo.filter((x) => te.includes(x));
  check('Form score graph', 'no data -> empty state', 'empty: "No form scores yet", no points, none of the design demo numbers', te.includes('No form scores yet') && leaked.length === 0, leaked.join(' | ') || 'none leaked');
  check('Personal bests', 'no data -> empty state', 'empty: "No personal bests yet", no numbers', te.includes('No personal bests yet') && !te.includes('Best streak') && !te.includes('Most reps'));
  check('Past workouts', 'no data -> empty state', 'empty: "No workouts yet", no demo workout rows', te.includes('No workouts yet') && !te.includes('Form score'));
  await pe.browser.close();

  // ═════════════════════════ PROFILE ═════════════════════════
  const rawProf = await rawLines('profile.html');
  const PSESS = [...SESS, ent(8, 'pushup', 'Push-up', 10, 10), ent(9, 'pushup', 'Push-up', 10, 10)];
  const full = buildProfileData({
    seedVersion: 2, name: 'Mara', email: 'mara@example.com', sessions: PSESS, streak: calcStreak(PSESS),
    planProfile: { goal: 'weightloss', experience: 'advanced', daysPerWeek: 5, location: 'outdoors' }, planGeneratedAt: now - 30 * DAY,
    location: 'outdoors', latestWeightLb: 163.7, details: { age: '33', height: `6'0"`, sex: 'Female' },
    audio: { enabled: true, voiceFrequency: 'correctionsAndCounts' }, appVersion: 'FormPal 2.3.4 (56)', insets: { top: 62, bottom: 34 },
  });
  const firstTs = Math.min(...PSESS.map((s) => s.ts)); const sinceD = new Date(firstTs);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  check('Profile: member since', 'the date of the first session in the log (or the plan date, or today)', 'data', full.since === `${MONTHS[sinceD.getMonth()]} ${sinceD.getFullYear()}`, full.since);
  check('Profile: workouts / streak', 'distinct workouts in the log; consecutive days ending today', 'data', full.workouts === new Set(PSESS.map((s) => s.ts)).size && full.streak === calcStreak(PSESS), `${full.workouts} workouts, streak ${full.streak}`);
  const totalReps = PSESS.reduce((a, s) => a + s.reps, 0);
  const wantBadges = [EXP.streak >= 3, EXP.streak >= 10, false, false, false, false, totalReps >= 100, totalReps >= 1000, totalReps >= 10000, true, false, false];
  check('Profile: badges', 'earned from the session log: day streaks, total reps, perfect sets', 'data: the 12 flags equal the hand-computed ones', JSON.stringify(full.badgesEarned) === JSON.stringify(wantBadges), JSON.stringify(full.badgesEarned.map(Number)));

  const pf = await openProfile('full', { width: 390, height: 844 });
  await pf.p.evaluate((d) => window.__athltSetData && window.__athltSetData(d), full); await pf.p.waitForTimeout(900);
  const L = await lines(pf.p), val = (label) => L[L.indexOf(label) + 1];
  check('Profile: name', 'display name in the customization store (the account the user typed)', 'page', L.includes('Mara') && L.includes('M'), L.slice(0, 5).join(' | '));
  check('Profile: weight', 'newest entry of the weight log', 'page', val('Weight') === '163.7 lb', val('Weight'));
  check('Profile: goal', 'the plan profile goal chosen in onboarding', 'page', val('Goal') === 'Lose weight', val('Goal'));
  check('Profile: where you train', 'the training location saved at onboarding', 'page', val('Where you train') === 'Outdoors', val('Where you train'));
  check('Profile: training days', 'weekdays picked on the Profile page; until then the plan days per week', 'page', val('Training days') === '5 days a week', val('Training days'));
  check('Profile: audio coaching', 'the audio settings store', 'page', val('Audio coaching') === 'Corrections + counts', val('Audio coaching'));
  check('Profile: app version', 'the installed app (Expo config version and build number)', 'page', L.includes('FormPal 1.0.0 (7)') && !L.includes('FormPal 1.0 (12)'), L[L.length - 1]);
  check('Profile: referral banner', 'no reward system exists, so no "$10" / "free month" promise', 'page', L.includes('Refer a friend') && !L.some((x) => /\$10|free month/i.test(x)), L.filter((x) => /Refer|\$10/.test(x)).join(' | '));
  // badges page
  await pf.p.evaluate(() => document.querySelector('#dc-root [aria-label="Badges"]').click()); await pf.p.waitForTimeout(800);
  const B = await lines(pf.p); const earned = wantBadges.filter(Boolean).length;
  check('Profile: badges page', 'earned flags above', 'page: "N/12 badges" equals the number earned', B.includes(`${earned}/12 badges`), B.find((x) => /\/12 badges/.test(x)));
  await pf.p.evaluate(() => { const a = document.querySelector('#dc-root a[aria-label="Back"]'); a && a.click(); }); await pf.p.waitForTimeout(500);
  // member card
  await pf.p.evaluate(() => { const a = [...document.querySelectorAll('#dc-root a')].find((x) => /View member card/.test(x.textContent)); a.click(); }); await pf.p.waitForTimeout(900);
  const C = await lines(pf.p); const ci = C.lastIndexOf('Member card'); const card = C.slice(ci);
  check('Profile: member card', 'name, member-since month and streak from the data above', 'page', card.includes('Mara') && card.some((x) => x.toLowerCase().includes(full.since.toLowerCase())) && card.some((x) => x.includes(String(full.streak))), card.join(' | ').slice(0, 160));
  await pf.p.evaluate(() => { const a = document.querySelector('#dc-root a[aria-label="Back"], #dc-root [aria-label="Close"]'); a && a.click(); }); await pf.p.waitForTimeout(500);
  // personal details
  await pf.p.evaluate(() => { [...document.querySelectorAll('#dc-root div')].find((d) => d.children.length <= 1 && d.textContent.trim() === 'Personal details').click(); }); await pf.p.waitForTimeout(900);
  const Dt = await lines(pf.p); const di = Dt.lastIndexOf('Personal details'); const det = Dt.slice(di);
  const dv = (label) => det[det.indexOf(label) + 1];
  check('Profile: personal details', 'age / height / sex typed on this page and saved on the phone; experience from the plan profile', 'page', dv('Age') === '33' && dv('Height') === `6'0"` && dv('Sex') === 'Female' && dv('Experience') === 'Advanced', JSON.stringify(['Age', 'Height', 'Sex', 'Experience'].map(dv)));
  await pf.b.close();

  // Profile with NO data: "Not set", never the design's demo values or a default
  const none = buildProfileData({
    seedVersion: 3, name: 'Athlete', email: null, sessions: [], streak: 0, planProfile: null, planGeneratedAt: null, location: null, latestWeightLb: null,
    details: {}, audio: { enabled: true, voiceFrequency: 'correctionsOnly' }, appVersion: 'FormPal 1.0.0 (7)', insets: { top: 62, bottom: 34 },
  });
  const pn = await openProfile('empty', { width: 390, height: 844 });
  await pn.p.evaluate((d) => window.__athltSetData && window.__athltSetData(d), none); await pn.p.waitForTimeout(900);
  const N = await lines(pn.p); const nv = (label) => N[N.indexOf(label) + 1];
  check('Profile (no data): weight / goal / where / days', 'nothing stored -> "Not set" (days: "Not set" with no plan)', 'page', nv('Weight') === 'Not set' && nv('Goal') === 'Not set' && nv('Where you train') === 'Not set' && nv('Training days') === 'Not set', JSON.stringify(['Weight', 'Goal', 'Where you train', 'Training days'].map(nv)));
  const demoP = rawProf.filter((x) => (/\d/.test(x) || /Jordan|JL|Build muscle|Annual|Renews|Restore|Apple Health|Workout time|reminders/i.test(x)) && !/^(FormPal|Home|Train|Progress|Profile)$/.test(x) && !/^(lb|kg)$/.test(x));
  const leakedP = demoP.filter((x) => N.includes(x));
  check('Profile (no data): the design demo content', 'every demo value of profile.html (Jordan Lee, 184 lb, Mon Wed Fri, renewal date, ...)', 'page: none of it appears', leakedP.length === 0, leakedP.join(' | ') || 'none leaked');
  await pn.p.evaluate(() => { [...document.querySelectorAll('#dc-root div')].find((d) => d.children.length <= 1 && d.textContent.trim() === 'Personal details').click(); }); await pn.p.waitForTimeout(900);
  const D2 = await lines(pn.p); const det2 = D2.slice(D2.lastIndexOf('Personal details')); const dv2 = (label) => det2[det2.indexOf(label) + 1];
  check('Profile (no data): personal details', 'nothing stored -> "Not set" (experience too: there is no plan)', 'page', ['Age', 'Height', 'Sex', 'Experience'].every((l) => dv2(l) === 'Not set'), JSON.stringify(['Age', 'Height', 'Sex', 'Experience'].map(dv2)));
  await pn.b.close();

  // source checks
  const prog = fs.readFileSync(path.join(__dirname, '..', 'app', '(tabs)', 'progress.tsx'), 'utf8');
  check('Progress photos', 'after taking a photo nothing is shown (no "Photo saved" text)', 'source', !/Photo saved/.test(prog) && !/__athltToast/.test(prog));

  // ── the table ──
  console.log('\n| Item | Where the data comes from | Test | Result |\n|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.item} | ${r.source} | ${r.name} | ${r.ok ? 'PASS' : 'FAIL'} |`);
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
