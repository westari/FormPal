#!/usr/bin/env node
/**
 * scripts/test-rep-feedback-r10.js  (round 10, item 6)
 * Rep feedback: "Rep 1 of 8"; Next rep goes to the right rep's moment and the scrub bar never jumps backwards (a seek's stale times are ignored,
 * the seek goes a little before the rep and never to the very end of the clip); All sets remembers the rep and Back from it returns to that rep.
 * Real repfeedback.html + the shipped page code (lib/repFeedbackInject.ts) in Chromium; the app side as source order.
 */
require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
const fs = require('fs'), path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { repFeedbackInject } = require('../lib/repFeedbackInject.ts');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };

const REPS = [3, 6, 9, 12, 15, 18, 21, 29.9].map((t, i) => ({ timeSec: t, what: 'Rep text ' + (i + 1) + '.' }));
async function open(browser, startIdx) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const msgs = []; await page.exposeFunction('__post', (m) => { try { msgs.push(JSON.parse(m)); } catch {} });
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (m) => window.__post(m) }; });
  await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await page.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'repfeedback.html')).href, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  await page.evaluate(repFeedbackInject({ exerciseName: 'Squat', hasVideo: true, reps: REPS, startIdx }));
  await page.waitForTimeout(1800);
  await page.evaluate(() => window.__fpSetDuration(30));
  return { page, msgs };
}
const tag = (page) => page.evaluate(() => [...document.querySelectorAll('#dc-root span')].map((e) => e.textContent.trim()).find((t) => /^Rep \d+ of \d+$/.test(t)) || null);
const bar = (page) => page.evaluate(() => { const f = [...document.querySelectorAll('#dc-root div')].find((d) => d.style.getPropertyPriority && d.style.getPropertyValue('width') && /%$/.test(d.style.getPropertyValue('width')) && d.style.getPropertyPriority('width') === 'important'); return f ? parseFloat(f.style.width) : null; });
const nextBtn = (page) => page.evaluate(() => { const e = [...document.querySelectorAll('#dc-root div')].find((d) => d.children.length === 0 && /^(Next rep|Finish review|Finish)$/.test(d.textContent.trim())); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: e.textContent.trim() }; });

(async () => {
  const browser = await chromium.launch();
  const { page, msgs } = await open(browser, 0);
  check('the tag says "Rep 1 of 8" (the total too)', (await tag(page)) === 'Rep 1 of 8', String(await tag(page)));
  const pill = await page.evaluate(() => { const t = [...document.querySelectorAll('#dc-root span')].find((e) => /^Rep \d+ of \d+$/.test(e.textContent.trim())); const r = t.parentElement.getBoundingClientRect(); return { h: r.height, w: r.width, fs: getComputedStyle(t).fontSize, wrap: r.height < 40 }; });
  check('it is clear and easy to see: a bigger pill (30px tall, 15px words, one line), not the design\'s tiny 22px / 11.5px', pill.h >= 28 && pill.fs === '15px' && pill.wrap, JSON.stringify(pill));
  check('the page tells the app which rep is shown (repShown 0)', msgs.some((m) => m.type === 'repShown' && m.idx === 0));
  await page.screenshot({ path: path.join(ROOT, '.scratch', 'rep-feedback-r10.png') });

  // Next rep
  let b = await nextBtn(page); check('the button says Next rep', b.text === 'Next rep', b.text);
  const m0 = msgs.length;
  await page.mouse.click(b.x, b.y); await page.waitForTimeout(200);
  const seek1 = msgs.slice(m0).find((m) => m.type === 'seek');
  check('Next rep shows "Rep 2 of 8" and its text', (await tag(page)) === 'Rep 2 of 8' && /Rep text 2/.test(await page.evaluate(() => document.body.innerText)), String(await tag(page)));
  check('and seeks to the RIGHT rep: a little before rep 2 (6s - 1.5s = 4.5s) so the rep plays', seek1 && Math.abs(seek1.timeSec - 4.5) < 0.01, JSON.stringify(seek1));
  const afterSeek = await bar(page);
  check('the bar is at the new place at once (4.5 / 30 = 15%)', Math.abs(afterSeek - 15) < 0.6, String(afterSeek));
  // the player still reports its OLD time for a moment: the bar must not go back
  await page.evaluate(() => { window.__fpSetCurrentTime(3.1); window.__fpSetCurrentTime(3.2); window.__fpSetCurrentTime(3.3); });
  check('STALE TIMES: the old times the player still reports for a moment do NOT pull the bar back (the bar-jumps-backwards bug)', Math.abs((await bar(page)) - 15) < 0.6, String(await bar(page)));
  await page.evaluate(() => window.__fpSetCurrentTime(4.7));
  check('as soon as the player reports a time near the target the bar follows playback again', Math.abs((await bar(page)) - (4.7 / 30) * 100) < 0.6, String(await bar(page)));
  await page.evaluate(() => window.__fpSetCurrentTime(5.6));
  check('and keeps following', Math.abs((await bar(page)) - (5.6 / 30) * 100) < 0.6, String(await bar(page)));

  // near the end of the video
  for (let i = 0; i < 5; i++) { b = await nextBtn(page); await page.mouse.click(b.x, b.y); await page.waitForTimeout(120); }
  check('Next rep five more times: "Rep 7 of 8"', (await tag(page)) === 'Rep 7 of 8', String(await tag(page)));
  const m1 = msgs.length;
  b = await nextBtn(page); await page.mouse.click(b.x, b.y); await page.waitForTimeout(200);
  const seekEnd = msgs.slice(m1).find((m) => m.type === 'seek');
  check('the LAST rep (counted at 29.9s of a 30s clip): the seek goes to 28.4s (a rep before the end), never to the last half second where the clip would end and loop to the start', seekEnd && seekEnd.timeSec <= 29.5 && Math.abs(seekEnd.timeSec - 28.4) < 0.01, JSON.stringify(seekEnd));
  b = await nextBtn(page); check('on the last rep the button says Finish review', /Finish/.test(b.text), b.text);
  await page.evaluate(() => window.__fpSetCurrentTime(1.0)); // a very old time right after the seek
  check('the bar stays near the end after the last Next rep (not thrown back to 3%)', (await bar(page)) > 90, String(await bar(page)));
  await page.waitForTimeout(1400);
  await page.evaluate(() => window.__fpSetCurrentTime(2.0));
  check('if the player never catches up (a seek that failed), after 1.2s the real time wins again so the bar is never stuck', (await bar(page)) < 10, String(await bar(page)));
  await page.close();

  // coming back from All sets: open on rep 5
  const { page: p2, msgs: m2 } = await open(browser, 4);
  check('opening on rep 5 (coming back from All sets): the tag says "Rep 5 of 8" and the rep 5 text is shown, not rep 1', (await tag(p2)) === 'Rep 5 of 8' && /Rep text 5/.test(await p2.evaluate(() => document.body.innerText)), String(await tag(p2)));
  const s5 = m2.find((m) => m.type === 'seek');
  check('and the video goes to rep 5 (15s - 1.5s = 13.5s), not the start', s5 && Math.abs(s5.timeSec - 13.5) < 0.01, JSON.stringify(s5));
  await p2.close();
  const { page: p3, msgs: m3 } = await open(browser, 0);
  check('opening normally (rep 1) sends no seek: the video and the bar start at the very beginning, as before', !m3.some((m) => m.type === 'seek'));
  await p3.close();
  await browser.close();

  // ── the app side ──
  const rf = read('app/rep-feedback.tsx'), rc = read('app/recap.tsx'), sg = read('lib/repFeedbackSignal.ts');
  check('app: the rep feedback remembers the rep shown (repShown) and hands it over with "All sets" (repFeedbackSignal.repIdx)', /msg\.type === 'repShown'/.test(rf) && /repFeedbackSignal\.repIdx = currentRep\.current/.test(rf) && /repIdx: number/.test(sg));
  check('app: coming back from All sets re-opens the rep feedback on that rep (startRep param -> the page opens on it)', /startRepRef\.current = repFeedbackSignal\.repIdx/.test(rc) && /startRep: String\(startRepRef\.current\)/.test(rc) && /startIdx: Math\.max\(0, parseInt\(startRep \?\? '0', 10\) \|\| 0\)/.test(rf) && /startRepRef\.current = 0;/.test(rc));
  check('app (round 11): All sets opens as a NORMAL screen transition: it slides in from the right over the rep feedback (the top layer, a push with parallax), the rep feedback goes only after the slide, so the summary page is never seen in between', /repFeedbackSignal\.onOpenAllSets\?\.\(\);[\s\S]{0,260}setTimeout\(\(\) => router\.back\(\), SLIDE_IN_MS \+ 80\)/.test(rf) && /repFeedbackSignal\.onOpenAllSets = \(\) => \{ allSetsFromRepFeedback\.current = true; setView\('allsets'\); setFinishing\(true\); \}/.test(rc) && /KINDS: WarmKind\[\] = \['recap', 'ranks', 'repfeedback', 'allsets'\]/.test(read('components/WarmSurfaces.tsx')) && /allsets: false/.test(read('components/WarmSurfaces.tsx')));
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
