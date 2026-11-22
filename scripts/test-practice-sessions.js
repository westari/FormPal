#!/usr/bin/env node
/**
 * scripts/test-practice-sessions.js
 * Form checks are PRACTICE, not workouts. A session entry with kind: 'practice' (saved by the form-check flow):
 *   - never shows in Recent workouts (Home) or Past workouts (Progress), and has no card on Train's week strip
 *   - never counts toward the streak (Home, Train, Progress, the streak page, Profile) or the workout calendar
 *   - never counts toward Profile's member-since, workouts, or badges
 *   - has its own small "Form checks" list in Progress below Past workouts; a row opens that form check's recap
 * Data checks on the shipped builders, plus the real Progress page (real progress.html + the shipped injection).
 */
const { openProgress, makeData } = require('./lib/progress-harness.js');
const SL = require('../lib/sessionLog.ts');
const { buildProgressData } = require('../lib/progressData.ts');
const { buildProfileData } = require('../lib/profileData.ts');
const { streakInfo } = require('../lib/streakInfo.ts');
const { athltSetDataJs } = require('../lib/dcLogicPatch.ts');
const Module = require('module'); const orig = Module._load;
Module._load = function (r) { if (/constants\/api$/.test(r)) return { MYPAL_API_URL: 'x' }; if (r === 'expo-asset') return { Asset: {} }; return orig.apply(this, arguments); };
const { buildTrainData } = require('../lib/trainData.ts');
const home = require('../app/(tabs)/index.tsx');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const DAY = 86400000;
const now = new Date(2026, 10, 15, 12).getTime();
const at = (daysAgo, h = 9) => { const d = new Date(now - daysAgo * DAY); d.setHours(h, 0, 0, 0); return d.getTime(); };
const ent = (ts, name, extra = {}) => ({ ts, exerciseId: 'squat', displayName: name, reps: 10, goodReps: 9, pct: 90, formChecked: true, ...extra });
// a real workout 3 days ago, practice today and yesterday (a form check on each of the last two days), practice 6 days ago
const sessions = [
  ent(at(3), 'Real Workout Squat'),
  ent(at(0), 'Practice Pushup Today', { kind: 'practice', exerciseId: 'pushup' }),
  ent(at(1), 'Practice Curl Yesterday', { kind: 'practice', exerciseId: 'curl' }),
  ent(at(6), 'Practice Lunge Old', { kind: 'practice', exerciseId: 'lunge' }),
];
(async () => {
  check('helpers: isPractice / workoutSessions / practiceSessions split the log', SL.isPractice(sessions[1]) && !SL.isPractice(sessions[0]) && SL.workoutSessions(sessions).length === 1 && SL.practiceSessions(sessions).length === 3);
  check('12: the streak ignores practice (practice today + yesterday do not make a streak; only the workout 3 days ago exists)', SL.calcStreak(sessions, now) === 0 && SL.calcStreak([...sessions, ent(at(0, 10))], now) === 1, String(SL.calcStreak(sessions, now)));
  const si = streakInfo(sessions, now, 0);
  check('12: the streak page ignores practice (count 0, today not done)', si.count === 0 && !si.trainedToday, JSON.stringify(si));

  // Train: the week strip
  const plan = { id: 'p', profile: { goal: 'general', experience: 'beginner', daysPerWeek: 7, location: 'gym' }, splitType: 'fullBody', currentWorkoutIndex: 0, generatedAt: now - 30 * DAY, progressionState: {},
    workouts: [{ id: 'w0', sessionNumber: 1, splitLabel: 'Full body A', rationale: '', exercises: [{ exerciseId: 'squat', displayName: 'Squat', targetSets: 3, targetReps: 10, restSeconds: 60, currentVariationId: 'squat' }], completed: false }] };
  const td = buildTrainData(plan, sessions, { top: 62, bottom: 34 }, new Date(now));
  check('12: Train has no "done" card for a practice day (today is still the planned workout, yesterday is Missed, not done)', !td.days[5].done && td.days[5].name === 'Full body A' && !td.days[4].done && (td.days[4].missed || td.days[4].tag === 'Missed') && td.streak === 0, td.days.map((d) => d.short + ':' + (d.done ? 'done' : (d.missed || d.tag) ? 'missed' : d.rest ? 'rest' : 'plan')).join(' '));
  check('12: the 3-days-ago workout IS a done card', td.days[2].done === true);

  // Progress data
  const pd = buildProgressData(sessions, {}, [], now, { insets: { top: 62, bottom: 34 } });
  check('12: Past workouts lists only the real workout', pd.workouts.length === 1 && /Real Workout/.test(pd.workouts[0].name), pd.workouts.map((w) => w.name).join());
  check('12: the Form checks list has the 3 practice sets, newest first, with name, when and reps/form', pd.practice.length === 3 && /Today/.test(pd.practice[0].name) && /Old/.test(pd.practice[2].name) && /10 reps · 90% form/.test(pd.practice[0].meta), JSON.stringify(pd.practice[0]));
  check('12: personal bests, the form chart and the streak come from workouts only', pd.rank.streak === 0 && pd.bests.every((b) => b.kind !== 'streak' || b.value === '1') && pd.form.length === 1, JSON.stringify({ streak: pd.rank.streak, form: pd.form.length }));

  // Profile
  const pr = buildProfileData({ seedVersion: 1, name: 'Ari', email: null, sessions, streak: SL.calcStreak(sessions, now), planProfile: null, planGeneratedAt: null, location: null, latestWeightLb: null, details: {}, audio: { enabled: true, voiceFrequency: 'correctionsOnly' }, appVersion: '1', now });
  const raw = JSON.stringify(pr);
  check('12: Profile counts 1 workout (the real one), not 4', /"workouts":"?1\b/.test(raw) || pr.workouts === 1 || pr.stats?.workouts === 1 || /\b1 workout/i.test(raw), raw.slice(0, 0) + (pr.workouts ?? ''));

  // Home: Recent workouts
  const js = home.buildHomeInjectJs(null, sessions, 62, 34);
  check('12: Home\'s Recent workouts never lists a practice set', !/Practice (Pushup|Curl|Lunge)/.test(js) && /Real Workout Squat/.test(js));
  check('12: Home\'s streak chip says 0 (practice does not count)', /textContent = '0'/.test(js));

  // The real Progress page
  const data = makeData(); Object.assign(data, pd, { form: data.form, weight: data.weight, hasSessions: true });
  const { browser, page, msgs } = await openProgress(data);
  await page.waitForTimeout(500);
  const sec = await page.evaluate(() => {
    const s = document.querySelector('[data-athlt-formchecks]'); if (!s) return null;
    const heads = [...document.querySelectorAll('#dc-root div')].filter((d) => d.children.length === 0 && /^(Past Workouts|Form checks)$/.test(d.textContent.trim()));
    const pastTop = heads.find((h) => h.textContent === 'Past Workouts').getBoundingClientRect().top, fcTop = heads.find((h) => h.textContent === 'Form checks').getBoundingClientRect().top;
    return { text: s.innerText.replace(/\n+/g, ' | '), rows: s.querySelectorAll('[data-fc-ts]').length, below: fcTop > pastTop, w: Math.round(s.getBoundingClientRect().width) };
  });
  console.log('      Form checks section:', JSON.stringify(sec));
  check('12: the Progress page shows a "Form checks" list BELOW Past workouts, one row per practice set', sec && sec.rows === 3 && sec.below && /Practice Pushup Today/.test(sec.text) && /Today · 10 reps · 90% form/.test(sec.text) && /Yesterday · 10 reps/.test(sec.text), sec && sec.text);
  const past = await page.evaluate(() => [...document.querySelectorAll('#dc-root div[role="img"][aria-label$=" video"]')].map((e) => e.getAttribute('aria-label')));
  check('12: Past workouts on the page show no practice set', past.every((a) => !/Practice/.test(a)), JSON.stringify(past));
  const before = msgs.length;
  await page.evaluate(() => document.querySelector('[data-fc-ts]').click());
  const m = msgs.slice(before).find((x) => x.type === 'openWorkout');
  check('12: tapping a Form checks row opens that form check (its recap, with the rep feedback)', m && m.ts === pd.practice[0].ts, JSON.stringify(m));
  await page.screenshot({ path: require('path').join(__dirname, '..', '.scratch', 'form-checks.png') });
  // none: the section is hidden
  const none = Object.assign({}, data, { practice: [] });
  await page.evaluate(athltSetDataJs(none)); await page.waitForTimeout(500);
  check('12: with no practice sets the section is hidden', await page.evaluate(() => { const s = document.querySelector('[data-athlt-formchecks]'); return !s || getComputedStyle(s).display === 'none'; }));
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
