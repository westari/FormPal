#!/usr/bin/env node
/**
 * scripts/test-done-screen.js
 * The one done screen: Ari's assets/app screens/greatjobanimation.html used as it is, for everything that finishes.
 *  - the words: title per situation and a REAL line under it (lib/doneInfo.ts)
 *  - the page: the design's animations untouched, the stand-in screen see-through, the words replaced, scaled, held until final
 *  - the flows: who calls it, and in which order
 */
require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const I = require('../lib/doneInfo.ts');
const { DONE_BEFORE_JS, DONE_PREP_JS, doneStartJs, doneLineJs, DONE_WASH_MS, BRACKET_SIDE_GAP, BRACKET_TOP_GAP } = require('../lib/doneAnimationPage.ts');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };

// ── the titles ──
check('titles by situation: Workout complete / Form check complete / Session logged / Workout created / Weight logged', JSON.stringify(I.DONE_TITLES) === JSON.stringify({ workout: 'Workout complete', formCheck: 'Form check complete', logged: 'Session logged', created: 'Workout created', weight: 'Weight logged' }));

// ── the real lines ──
check('workout: reps and clean-rep %, time, and the week: "27 reps, 89% clean in 12 min. 3 of 4 this week."', I.workoutDoneLine({ reps: 27, goodReps: 24, scored: true, durationSec: 720, week: { count: 3, goal: 4 } }) === '27 reps, 89% clean in 12 min. 3 of 4 this week.', I.workoutDoneLine({ reps: 27, goodReps: 24, scored: true, durationSec: 720, week: { count: 3, goal: 4 } }));
check('workout: a new personal best form replaces the week line: "New best form: 92%."', I.workoutDoneLine({ reps: 20, goodReps: 18, scored: true, newBestPct: 92, week: { count: 1, goal: 4 } }) === '20 reps, 90% clean. New best form: 92%.');
check('workout: the goal reached says so; extras are a bonus; under a minute shows no time; an unscored workout shows reps only', I.workoutDoneLine({ reps: 10, goodReps: 0, scored: false, durationSec: 40, week: { count: 5, goal: 4 } }) === '10 reps. Weekly goal reached: 4 of 4, +1 bonus.');
check('workout: one rep is "1 rep"; the week line never says "8 of 4" (capped)', /^1 rep, 100% clean\./.test(I.workoutDoneLine({ reps: 1, goodReps: 1, scored: true })) && I.weekLine({ count: 8, goal: 4 }) === 'Weekly goal reached: 4 of 4, +4 bonus.');
check('form check: its own exercise, reps and clean %: "Goblet Squat: 8 reps, 75% clean."; no reps says so', I.formCheckDoneLine({ exerciseName: 'Goblet Squat', reps: 8, goodReps: 6 }) === 'Goblet Squat: 8 reps, 75% clean.' && /no reps were counted/.test(I.formCheckDoneLine({ exerciseName: 'Goblet Squat', reps: 0, goodReps: 0 })));
check('logged session: exercises, reps and the week: "3 exercises, 24 reps. 3 of 4 this week."', I.loggedDoneLine({ exercises: 3, reps: 24, week: { count: 3, goal: 4 } }) === '3 exercises, 24 reps. 3 of 4 this week.' && I.loggedDoneLine({ exercises: 1, reps: 1 }) === '1 exercise, 1 rep.');
check('created workout: its name, exercises and length: "My workout: 4 exercises, about 22 min. It is next in your plan."', I.createdDoneLine({ name: 'My workout', exercises: 4, minutes: 22 }) === 'My workout: 4 exercises, about 22 min. It is next in your plan.');
check('weight: the new weight and the change since last time (down / up / same / first weigh-in, lb or kg)', I.weightDoneLine({ weightLb: 178.4, prevLb: 182.1 }) === '178.4 lb, down 3.7 lb since last time.' && I.weightDoneLine({ weightLb: 183, prevLb: 182.1 }) === '183.0 lb, up 0.9 lb since last time.' && I.weightDoneLine({ weightLb: 180, prevLb: 180 }) === '180.0 lb, the same as last time.' && I.weightDoneLine({ weightLb: 180 }) === '180.0 lb. Your first weigh-in.' && /kg/.test(I.weightDoneLine({ weightLb: 180, prevLb: 185, kg: true })));
const DAY = 86400000, base = Date.now() - 10 * DAY;
const ent = (i, pct) => ({ ts: base + i * DAY, exerciseId: 'squat', displayName: 'Squat', reps: 10, goodReps: pct / 10, pct, formChecked: true });
check('new best form: true only if it beats every EARLIER workout (and there is one)', I.isNewBestForm([ent(0, 70), ent(1, 80), ent(2, 90)], base + 2 * DAY).best === true && I.isNewBestForm([ent(0, 90), ent(1, 80)], base + DAY).best === false && I.isNewBestForm([ent(0, 90)], base).best === false);
check('no filler anywhere: no line is a generic phrase ("great job", "nice work", "well done", "you did it")', !/great job|nice work|well done|you did it|awesome/i.test(read('lib/doneInfo.ts').replace(/^\s*\*.*$/gm, '').replace(/\/\/.*$/gm, '')));

// ── the design file is Ari's, untouched ──
const f = 'assets/app screens/greatjobanimation.html';
let dirty = true; try { cp.execSync(`git diff --quiet HEAD -- "${f}"`, { cwd: ROOT }); dirty = false; } catch { dirty = true; }
check('the design file greatjobanimation.html is used as it is (no edits: git sees no change)', !dirty);

// ── the page ──
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const msgs = []; await page.exposeFunction('__post', (m) => msgs.push(m));
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (m) => window.__post(m) }; });
  await page.addInitScript(DONE_BEFORE_JS);
  await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());     // (offline, like a phone with no network)
  await page.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'greatjobanimation.html')).href, { waitUntil: 'load' });
  // held until final
  const early = await page.evaluate(() => ({ go: document.documentElement.hasAttribute('data-go'), state: getComputedStyle(document.querySelector('a')).animationPlayState }));
  check('before the words are in, the design\'s animations are held (paused): nothing plays on the first frame', early.go === false && early.state === 'paused', JSON.stringify(early));
  await page.evaluate(DONE_PREP_JS);
  await page.waitForTimeout(500);
  const spare = await page.evaluate(() => ({ go: document.documentElement.hasAttribute('data-go'), state: getComputedStyle(document.querySelector('a')).animationPlayState }));
  check('round 7 SPARE: the page is loaded and fitted ("doneReady") but STILL held: nothing plays until the app asks, so the app can start it at once with no loading', msgs.includes('doneReady') && !msgs.includes('doneShown') && spare.go === false && spare.state === 'paused', JSON.stringify([msgs, spare]));
  await page.evaluate(doneStartJs('Form check complete', 'Goblet Squat: 8 reps, 75% clean.'));
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-go'), null, { timeout: 5000 });
  const t0 = Date.now();
  const st = await page.evaluate(() => {
    const box = document.body.firstElementChild, divs = [...box.querySelectorAll('div')];
    const title = divs.find((d) => /font-size: 30px/.test(d.getAttribute('style') || '')), sub = divs.find((d) => /font-size: 18.5px/.test(d.getAttribute('style') || '')), fake = divs.find((d) => /nw-press/.test(d.getAttribute('style') || ''));
    const bg = (e) => getComputedStyle(e).backgroundColor;
    return { title: title.textContent, sub: sub.textContent, bodyBg: bg(document.body), htmlBg: bg(document.documentElement), boxBg: bg(box), fakeVis: getComputedStyle(fake).visibility, tf: box.style.transform, play: getComputedStyle(box.querySelector('a')).animationPlayState, anims: divs.filter((d) => getComputedStyle(d).animationName !== 'none').map((d) => getComputedStyle(d).animationName) };
  });
  check('the title and the grey line are the real ones for this moment ("Form check complete" and its numbers)', st.title === 'Form check complete' && st.sub === 'Goblet Squat: 8 reps, 75% clean.', JSON.stringify([st.title, st.sub]));
  check('the design\'s stand-in screen (its grey backdrop and fake "Done" button) is see-through / hidden, so the wash sweeps over the REAL screen', st.bodyBg === 'rgba(0, 0, 0, 0)' && st.htmlBg === 'rgba(0, 0, 0, 0)' && st.boxBg === 'rgba(0, 0, 0, 0)' && st.fakeVis === 'hidden', JSON.stringify([st.bodyBg, st.boxBg, st.fakeVis]));
  check('the design\'s own animations run untouched once it is final: the wash (nw-wash), the brackets (nw-bracket), the title (nw-focus), the line and the button (nw-rise)', st.play === 'running' && ['nw-wash', 'nw-bracket', 'nw-focus', 'nw-rise'].every((n) => st.anims.includes(n)), JSON.stringify(st.anims));
  check('the 390 x 844 canvas is scaled to the screen', /scale\(1\)/.test(st.tf), st.tf);
  check('"doneShown" is posted once, when it is final', msgs.filter((m) => m === 'doneShown').length === 1, JSON.stringify(msgs));
  await page.waitForTimeout(600);
  const wash = await page.evaluate(() => { const w = [...document.body.firstElementChild.children].find((d) => /nw-wash/.test(d.getAttribute('style') || '')); const b = getComputedStyle(w, '::before'); const m = /matrix\(([^,]+),/.exec(b.transform); return { clip: getComputedStyle(w).clipPath, name: b.animationName, dur: b.animationDuration, will: b.willChange, scale: m ? parseFloat(m[1]) : null, wbg: getComputedStyle(w).backgroundColor }; });
  check('round 7 WASH: ~0.6s in the wash is growing (a transform scale between 0 and its end), not finished and not a clip-path (the phone draws a transform smoothly on the GPU)', wash.clip === 'none' && wash.name === 'nw-wash-grow' && wash.will === 'transform' && wash.scale > 0.05 && wash.scale < 2.45 && wash.wbg === 'rgba(0, 0, 0, 0)', JSON.stringify(wash));
  check('round 7 WASH: a little slower than the design (1000ms, the design is 700ms)', wash.dur === '1s' && DONE_WASH_MS === 1000, wash.dur);
  await page.waitForTimeout(2900);
  const br = await page.evaluate(() => {
    const box = document.body.firstElementChild, S = parseFloat(/scale\(([\d.]+)\)/.exec(box.style.transform)[1]);
    const title = [...box.querySelectorAll('div')].find((d) => /font-size: 30px/.test(d.getAttribute('style') || ''));
    const rg = document.createRange(); rg.selectNodeContents(title); const t = rg.getBoundingClientRect();
    const b = [...box.querySelectorAll('div')].filter((d) => /nw-bracket/.test(d.getAttribute('style') || '')).map((d) => d.getBoundingClientRect());
    // the corner point of a bracket is 2px inside its 28px box (and 26px along for the far side)
    const tl = b[0], tr = b[1], bl = b[2];
    return { gapL: (t.left - (tl.left + 2 * S)) / S, gapR: ((tr.left + 26 * S) - t.right) / S, gapTop: ((t.top + t.height / 2) - (tl.top + 2 * S)) / S - 11, gapBottom: ((bl.top + 26 * S) - (t.top + t.height / 2)) / S - 11, w: t.width / S };
  });
  check('round 7 BRACKETS: they sit closer around the title text: sideways about ' + BRACKET_SIDE_GAP + 'px (the design: about 33), up and down about ' + BRACKET_TOP_GAP + 'px (the design: about 31), the same on every side', Math.abs(br.gapL - BRACKET_SIDE_GAP) < 2.5 && Math.abs(br.gapR - BRACKET_SIDE_GAP) < 2.5 && br.gapTop < 24 && br.gapBottom < 24 && br.gapTop > 12, JSON.stringify(br));
  const btn = await page.evaluate(() => { const a = document.querySelector('a'); const r = a.getBoundingClientRect(); return { op: parseFloat(getComputedStyle(a).opacity), x: r.x + r.width / 2, y: r.y + r.height / 2, text: a.textContent.trim() }; });
  check('about 3 seconds in the Continue button is there (about 2.7s in the design)', btn.op === 1 && btn.text === 'Continue', JSON.stringify(btn));
  await page.screenshot({ path: path.join(ROOT, '.scratch', 'done-screen.png') });
  await page.mouse.click(btn.x, btn.y); await page.waitForTimeout(200);
  check('Continue posts "doneContinue" (and does not navigate the page)', msgs.includes('doneContinue') && page.url().includes('greatjobanimation.html'), JSON.stringify(msgs));
  // round 7: the grey line may arrive later (the screen starts at once)
  const p2 = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const msgs2 = []; await p2.exposeFunction('__post', (m) => msgs2.push(m));
  await p2.addInitScript(() => { window.ReactNativeWebView = { postMessage: (m) => window.__post(m) }; });
  await p2.addInitScript(DONE_BEFORE_JS);
  await p2.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await p2.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'greatjobanimation.html')).href, { waitUntil: 'load' });
  await p2.evaluate(DONE_PREP_JS); await p2.waitForTimeout(400);
  await p2.evaluate(doneStartJs('Workout complete', '', true));
  await p2.waitForFunction(() => document.documentElement.hasAttribute('data-go'), null, { timeout: 5000 });
  const early2 = await p2.evaluate(() => { const sub = [...document.body.firstElementChild.querySelectorAll('div')].find((d) => /font-size: 18.5px/.test(d.getAttribute('style') || '')); return { text: sub.textContent, disp: getComputedStyle(sub).display }; });
  check('round 7 LATER LINE: the screen starts at once with the title and an empty, still-visible grey line (the app fills it in when it is worked out)', msgs2.includes('doneShown') && early2.text === '' && early2.disp !== 'none', JSON.stringify(early2));
  await p2.evaluate(doneLineJs('27 reps, 89% clean in 12 min. 3 of 4 this week.')); await p2.waitForTimeout(100);
  const late2 = await p2.evaluate(() => [...document.body.firstElementChild.querySelectorAll('div')].find((d) => /font-size: 18.5px/.test(d.getAttribute('style') || '')).textContent);
  check('round 7 LATER LINE: the real line fills in', late2 === '27 reps, 89% clean in 12 min. 3 of 4 this week.', late2);
  const p3 = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await p3.addInitScript(() => { window.ReactNativeWebView = { postMessage: () => {} }; });
  await p3.addInitScript(DONE_BEFORE_JS);
  await p3.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await p3.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'greatjobanimation.html')).href, { waitUntil: 'load' });
  await p3.evaluate(DONE_PREP_JS); await p3.waitForTimeout(400);
  await p3.evaluate(doneLineJs('A line that arrived before the start'));   // (the line can be ready before the page has started)
  await p3.evaluate(doneStartJs('Session logged', '', true)); await p3.waitForTimeout(150);
  const early3 = await p3.evaluate(() => [...document.body.firstElementChild.querySelectorAll('div')].find((d) => /font-size: 18.5px/.test(d.getAttribute('style') || '')).textContent);
  check('round 7 LATER LINE: a line that is ready before the page starts is not lost', early3 === 'A line that arrived before the start', early3);
  await p3.evaluate(doneLineJs('')); await p3.waitForTimeout(100);
  check('round 7 LATER LINE: if the line cannot be worked out it is left out (hidden), never a blank gap with stale words', await p3.evaluate(() => getComputedStyle([...document.body.firstElementChild.querySelectorAll('div')].find((d) => /font-size: 18.5px/.test(d.getAttribute('style') || ''))).display === 'none'));
  await browser.close();

  // ── the flows (source order) ──
  const rc = read('app/recap.tsx'), rf = read('app/rep-feedback.tsx'), cw = read('app/create-workout.tsx'), ls = read('app/log-session.tsx'), pg = read('app/(tabs)/progress.tsx'), host = read('components/DoneHost.tsx'), lay = read('app/_layout.tsx');
  check('the host is mounted ONCE at the top of the app (above every screen and the tab bar), and it is Ari\'s html in a transparent web view with a success haptic when the title appears', /<DoneHost \/>/.test(lay) && /greatjobanimation\.html/.test(host) && /opaque: false/.test(host) && /hapticSuccess\(\)/.test(host) && /zIndex: 1000/.test(host));
  check('FLOW real workout: done screen FIRST ("Workout complete" + reps, time, best or week), then rep feedback / the recap behind it (the warm pages wait for it)', /DONE_TITLES\.workout/.test(rc) && /workoutDoneLine\(/.test(rc) && /useState\(!isHistoryMode && !isLoggedMode && !isPractice\)/.test(rc) && /const mayShow = \(isFocused \|\| finishing\) && !doneIntro;/.test(rc) && /await persistRef\.current/.test(rc));
  check('FLOW real workout: Today\'s progress > Done goes to the streak page (with the week row), then the photo prompt if due, then Home', /router\.replace\(\{ pathname: '\/streak-screen', params: \{ count: String\(streakCount\), dest \} \} as any\)/.test(rc) && /leaveToTabs\(router, dest\)/.test(read('app/streak-screen.tsx')));
  check('FLOW form check: rep feedback FIRST (no done screen at the start), then "Form check complete" with its own reps, then Home', /isPractice\)/.test(rc) && /DONE_TITLES\.formCheck/.test(rf) && /formCheckDoneLine\(/.test(rf) && /router\.dismissAll\(\)/.test(rf) && !/DoneScreen/.test(rf));
  check('FLOW logged session: "Session logged" with exercises, reps and the week, then Today\'s progress', /DONE_TITLES\.logged/.test(ls) && /loggedDoneLine\(/.test(ls) && /currentWeek\(\)/.test(ls) && /mode: 'logged'/.test(ls) && !/SavedCheck/.test(ls));
  check('FLOW created workout: "Workout created" with its name, exercises and length, then back', /DONE_TITLES\.created/.test(cw) && /createdDoneLine\(/.test(cw) && /router\.back\(\)/.test(cw) && !/SavedCheck/.test(cw));
  check('FLOW weight: "Weight logged" with the new weight and the change since last time (the page\'s own moment is gone)', /DONE_TITLES\.weight/.test(pg) && /weightDoneLine\(/.test(pg) && /prevLb/.test(read('lib/progressInject.ts')) && !/self\.setState\(\{ weigh: false, logged: true/.test(read('lib/progressInject.ts')));
  const rf0 = rf.slice(rf.indexOf("if (msg.type === 'finishReview')") > 0 ? rf.indexOf("msg.type === 'finishReview'") : 0);
  check('round 7 NO AUTO-CONTINUE: the only timer that can leave is a safety net for a page that never loads; it is cleared the moment the page is shown, so it can never continue for the user', /DONE_NEVER_LOADED_MS/.test(host) && /if \(!shownRef\.current\)/.test(host) && /m === 'doneShown'\) \{[\s\S]{0,200}timers\.current\.forEach\(clearTimeout\)/.test(host) && /m === 'doneContinue'\) \{\s*if \(shownRef\.current\) leave\(\);/.test(host));
  check('round 7 IMMEDIATE: a spare page is loaded after launch and after each use; showDone only sets the words and plays it (no loading wait)', /DONE_SPARE_AFTER_MS/.test(host) && /onSpent=\{\(\) => setGen/.test(host) && /doneStartJs\(/.test(host) && /fade\.setValue\(1\); setLive\(true\);/.test(host));
  check('round 7 FORM CHECK: the white rep feedback card STAYS under the done screen (it is hidden only when Continue is tapped, together with leaving)', /onContinue: \(\) => \{ warmDeactivate\('repfeedback'\); router\.dismissAll\(\); \}/.test(rf) && !/warmDeactivate\('repfeedback'\);\s*setPracticeDone/.test(rf) && !/setPracticeDone/.test(rf));
  check('round 7 WEIGHT: the done screen is shown in the same moment as Submit (before the save), with the unit read ahead', /showDone\(\{ title: DONE_TITLES\.weight[\s\S]{0,600}logWeight\(/.test(pg) && /unitsKgRef/.test(pg));
  check('nothing uses DoneScreen.tsx or SavedCheck.tsx any more (they can be deleted)', ![rc, rf, cw, ls, pg, host, lay].some((s) => /import .*DoneScreen|import .*SavedCheck/.test(s)));
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
