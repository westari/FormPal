#!/usr/bin/env node
/**
 * scripts/test-trial-reminder.js
 *
 * Ari 2026-11-25:
 *   1. Trial reminder: the title is just "We'll remind you before your trial ends." (no "You're ready to start training!").
 *   2. "Remind me 2 days before / 1 day before" must REALLY work: a real local notification (expo-notifications) 2 or 1 days before the trial ends.
 *      expo-notifications was NOT in the app: it is now in package.json, which needs a NEW native build (on the current build every call is a quiet no-op).
 *   3. Paywall: the page fills to the top, the back button is the standard glass one, the Cue orb is the shared one, and the feature list shows "as well as" first and
 *      scrolls by itself after about 5 s.
 * Rendered in real Chromium with the EXACT scripts the app injects, at iPhone 15, 16, 15 Pro Max and 16 Pro Max sizes.
 */
require('./lib/ts-node-loader.js')();
const fs = require('fs'); const path = require('path');
const TR = require('../lib/trialReminder.ts');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split('\r\n').join('\n');
const ob = read('app/onboarding.tsx');
const silent = () => {};

(async () => {
  console.log('--- the plan (pure) ---');
  const now = new Date('2026-12-01T10:00:00Z');
  const p2 = TR.trialReminderPlan({ now, daysBefore: 2 }), p1 = TR.trialReminderPlan({ now, daysBefore: 1 });
  check('2 days before a 7-day trial: fires 5 days from now, same time of day', p2 && p2.fireAt.toISOString() === '2026-12-06T10:00:00.000Z', p2 && p2.fireAt.toISOString());
  check('1 day before: fires 6 days from now', p1 && p1.fireAt.toISOString() === '2026-12-07T10:00:00.000Z', p1 && p1.fireAt.toISOString());
  check('the words say how long is left ("in 2 days" / "tomorrow") and the same line as the design\'s notification', p2.title === 'Your free trial ends in 2 days' && p1.title === 'Your free trial ends tomorrow' && /cancel anytime in Settings/.test(p2.body));
  check('nonsense or a time in the past gives no plan', TR.trialReminderPlan({ now, daysBefore: 0 }) === null && TR.trialReminderPlan({ now, daysBefore: 7 }) === null && TR.trialReminderPlan({ now, daysBefore: 2, trialDays: 2 }) === null);

  console.log('--- scheduling with a fake expo-notifications ---');
  const mkApi = (status, calls) => ({
    getPermissionsAsync: async () => ({ status }),
    requestPermissionsAsync: async () => { calls.push(['request']); return { status: status === 'denied-after' ? 'denied' : 'granted' }; },
    scheduleNotificationAsync: async (r) => { calls.push(['schedule', r]); return 'id1'; },
    cancelScheduledNotificationAsync: async (id) => { calls.push(['cancel', id]); },
    SchedulableTriggerInputTypes: { DATE: 'date' },
  });
  let calls = []; TR.__resetTrialReminder();
  check('the default pick is 2 (the page\'s own default)', TR.getTrialReminderPick() === 2);
  TR.setTrialReminderPick(1); check('the page\'s pick is remembered', TR.getTrialReminderPick() === 1);
  TR.setTrialReminderPick(5); check('a bad pick is ignored', TR.getTrialReminderPick() === 1);
  let r = await TR.scheduleTrialReminder({ now, api: mkApi('granted', calls), log: silent });
  const sched = calls.find((c) => c[0] === 'schedule');
  check('picked 1 day: ONE notification is scheduled, 6 days from now, as a date trigger', r.scheduled && calls.filter((c) => c[0] === 'schedule').length === 1 && sched[1].trigger.type === 'date' && sched[1].trigger.date.toISOString() === '2026-12-07T10:00:00.000Z', JSON.stringify(calls));
  check('an earlier trial reminder is cancelled first (never two), and it has a fixed id', calls[0][0] === 'cancel' && calls[0][1] === TR.TRIAL_REMINDER_ID && sched[1].identifier === TR.TRIAL_REMINDER_ID);
  calls = []; TR.setTrialReminderPick(2);
  r = await TR.scheduleTrialReminder({ now, api: mkApi('granted', calls), log: silent });
  check('picked 2 days: scheduled 5 days from now with "in 2 days"', r.scheduled && calls.find((c) => c[0] === 'schedule')[1].content.title === 'Your free trial ends in 2 days');
  calls = [];
  r = await TR.scheduleTrialReminder({ now, api: mkApi('undetermined', calls), log: silent });
  check('permission not asked yet: it asks, then schedules', r.scheduled && calls[0][0] === 'request' && calls.some((c) => c[0] === 'schedule'));
  calls = [];
  r = await TR.scheduleTrialReminder({ now, api: mkApi('denied-after', calls), log: silent });
  check('notifications refused: nothing is scheduled, and it says so', !r.scheduled && r.reason === 'denied' && !calls.some((c) => c[0] === 'schedule'));
  r = await TR.scheduleTrialReminder({ now, api: null, log: silent });
  check('the module is not in the build (current phone build): a quiet no-op, no crash', !r.scheduled && r.reason === 'not-in-build');
  const perm = await TR.askTrialReminderPermission(mkApi('undetermined', []), silent);
  check('Continue on the screen asks for permission', perm === 'granted');
  check('...and without the module that is a quiet no-op too', (await TR.askTrialReminderPermission(null, silent)) === 'unavailable');
  const lg = []; await TR.scheduleTrialReminder({ now, api: mkApi('granted', []), log: (m) => lg.push(m) });
  check('a log line proves it on the phone: [TRIAL-REMINDER] scheduled "..." for <date>', lg.some((l) => /^\[TRIAL-REMINDER\] scheduled ".*" for 20\d\d-/.test(l)));

  console.log('--- wiring ---');
  const pkg = JSON.parse(read('package.json'));
  check('expo-notifications is in package.json (this needs a NEW native build)', !!(pkg.dependencies && pkg.dependencies['expo-notifications']));
  check('the page reports the pick and the app remembers it (remindpick:N -> setTrialReminderPick)', ob.includes("m.indexOf('remindpick:') === 0") && ob.includes('setTrialReminderPick(Number(m.slice(11)))') && ob.includes("postMessage('remindpick:'"));
  check('Continue on the trial reminder asks for permission', /from === 'trialTimeline'\) \{ void askTrialReminderPermission\(\); setAppState\('webPaywall'\); \}/.test(ob));
  check('"Start free for 7 days" on the paywall schedules the reminder', /else \{ void scheduleTrialReminder\(\); void finishOnboarding\(\); \}/.test(ob));
  check('closing the paywall without starting the trial schedules nothing (the back path does not call it)', !/hasGiftOfferBeenShown\(\)\.then[^]{0,200}scheduleTrialReminder/.test(ob));

  console.log('--- rendered (real Chromium, the app\'s own injected scripts) ---');
  const { chromium } = require('playwright');
  const R = require('./lib/paywall-harness.js');
  const br = await chromium.launch();
  for (const s of R.sizes) {
    const open = async (file) => {
      const ctx = await br.newContext({ viewport: { width: s.w, height: s.h - s.top }, deviceScaleFactor: 1 }); const pg = await ctx.newPage();
      await pg.addInitScript('window.ReactNativeWebView={postMessage:function(m){(window.__posts=window.__posts||[]).push(m)}};window.__dcFitBoth=1;window.__dcKeepFx=1;');
      await pg.addInitScript(R.CUE_ORB_JS);
      await pg.goto('file://' + path.resolve(__dirname, '..', 'assets', 'app screens', file + '.html').split(path.sep).join('/'));
      await pg.waitForTimeout(1500); await pg.evaluate(R.DC); return { pg, ctx };
    };
    const t = await open('trialreminder'); await t.pg.evaluate(R.TRIAL); await t.pg.waitForTimeout(1500);
    const tr = await t.pg.evaluate(() => {
      const vis = (txt) => Array.from(document.querySelectorAll('#dc-root div')).filter((d) => !d.children.length && (d.textContent || '').trim() === txt).some((d) => getComputedStyle(d).display !== 'none');
      return { first: vis("You're ready to start training!"), t2: vis("We'll remind you before"), t3: vis('your trial ends.') };
    });
    check(`${s.n} trial reminder: "You're ready to start training!" is gone, the title is "We'll remind you before / your trial ends."`, !tr.first && tr.t2 && tr.t3, JSON.stringify(tr));
    // a tap on "Remind me 1 day before" reports the pick
    await t.pg.evaluate(() => { const sp = Array.from(document.querySelectorAll('#dc-root span')).find((e) => (e.textContent || '').trim() === 'Remind me 1 day before'); sp.click(); });
    await t.pg.waitForTimeout(300);
    const posts = await t.pg.evaluate(() => window.__posts || []);
    check(`${s.n} trial reminder: tapping "Remind me 1 day before" posts remindpick:1`, posts.includes('remindpick:1'), JSON.stringify(posts));
    await t.ctx.close();

    const w = await open('paywallv2'); await w.pg.evaluate(R.TIDY); await w.pg.waitForTimeout(2500);
    const st = await w.pg.evaluate(() => {
      const late = Array.from(document.querySelectorAll('[data-pw-late]'));
      const orb = document.querySelector('#dc-root [data-cue-orb-svg] svg');
      const scr = document.querySelector('#dc-root [data-scroll]');
      return { late: late.length, lateOp: late.map((e) => getComputedStyle(e).opacity), orb: !!orb, orbBox: orb ? Math.round(orb.getBoundingClientRect().width) : 0, top: scr.scrollTop };
    });
    check(`${s.n} paywall: at the start "as well as" shows and the rows after it are hidden`, st.late === 1 && st.lateOp.every((o) => o === '0') && st.top === 0, JSON.stringify(st));
    check(`${s.n} paywall: the Cue orb is the shared SVG orb (not the design's own)`, st.orb && st.orbBox > 30, JSON.stringify(st));
    await w.pg.evaluate('window.__pwAutoScroll()'); await w.pg.waitForTimeout(3500);
    const mid = await w.pg.evaluate(() => ({ top: document.querySelector('#dc-root [data-scroll]').scrollTop, op: getComputedStyle(document.querySelector('[data-pw-late]')).opacity }));
    check(`${s.n} paywall: 3.5 s after it appears nothing has moved yet (it waits about 5 s)`, mid.top === 0 && mid.op === '0', JSON.stringify(mid));
    const samples = []; for (let k = 0; k < 40; k++) { samples.push(await w.pg.evaluate(() => document.querySelector('#dc-root [data-scroll]').scrollTop)); await w.pg.waitForTimeout(100); }
    const end = await w.pg.evaluate(() => ({ top: document.querySelector('#dc-root [data-scroll]').scrollTop, max: (() => { const e = document.querySelector('#dc-root [data-scroll]'); return e.scrollHeight - e.clientHeight; })(), op: getComputedStyle(document.querySelector('[data-pw-late]')).opacity }));
    await w.pg.waitForTimeout(1500);
    const fin = await w.pg.evaluate(() => { const e = document.querySelector('#dc-root [data-scroll]'); return { top: e.scrollTop, max: e.scrollHeight - e.clientHeight, op: getComputedStyle(document.querySelector('[data-pw-late]')).opacity }; });
    check(`${s.n} paywall: after about 5 s it scrolls SMOOTHLY (many small steps, not one jump) to the end and the rest is visible`, fin.max > 100 && Math.abs(fin.top - fin.max) <= 2 && fin.op === '1' && samples.filter((v) => v > 0 && v < fin.max).length >= 5, JSON.stringify({ samples, end, fin }));
    await w.ctx.close();
  }
  await br.close();

  console.log('--- the paywall top, the back button ---');
  check('the page fills to the very top: the strip above the page (under the status bar) is the page\'s own colour, not white', ob.includes("const pageBg = (htmlKey === 'paywall' || htmlKey === 'giftOffer') ? '#f4f4f7' : '#ffffff';") && ob.includes('backgroundColor: pageBg'));
  const gb = read('components/GlassBackButton.tsx');
  check('the back button on the paywall and gift offer is the standard GlassBackButton with the STANDARD glass (the Finish pill\'s: dark real glass)', ob.includes('<GlassBackButton onPress') && ob.includes('scheme="standard"') && gb.includes("STANDARD_GLASS.colorScheme") && gb.includes('STANDARD_GLASS.fallbackColor'));
  const sg = read('components/StandardGlass.tsx'); const fcs = read('app/formcheck.tsx');
  check('...and that is the same recipe the camera Finish pill uses (dark scheme, fallback rgba(40,41,48,0.55))', /colorScheme: 'dark'/.test(sg) && sg.includes("rgba(40,41,48,0.55)") && /<LiquidGlassButton[^>]*\n[^\n]*onPress=\{\(\) => \{ hapticMain\(\); void handleStop\(\); \}\}[\s\S]{0,200}colorScheme="dark"[\s\S]{0,120}rgba\(40,41,48,0.55\)/.test(fcs));
  check('the auto-scroll starts when the paywall APPEARS (poolActive), not when its page loads hidden', ob.includes("if (htmlKey !== 'paywall') return;") && ob.includes('window.__pwAutoScroll && window.__pwAutoScroll()'));

  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
