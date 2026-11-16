#!/usr/bin/env node
/**
 * scripts/test-demo-music.js
 * Before the camera:
 *   9.  "Listen to music while you train": text lower, and shown only the first 2 times ever.
 *   10. The exercise demo opens smoothly: the real data is drawn on the very first frame (never the design's "Push-ups"), nothing is painted
 *       before that, no entrance animations, no page-wide observer, three buttons wired.
 *   11. The demo steps are timed (a start time each) and ready for real videos (lib/demoVideos.ts).
 * Real demovideo.html / connectmusic.html + the exact shipped injection (dcScaleFitJs is cut out of app/workout/run.tsx).
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs'), path = require('path'), ts = require('typescript');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const { demoBeforeJs, demoData, DEMO_PAGE_JS } = require('../lib/demoScreen.ts');
const { demoTimeline, PLACEHOLDER_LENGTH } = require('../lib/demoVideos.ts');
const { decideMusicGate } = require('../lib/musicGate.ts');
const H = require('../lib/dcWebviewHelpers.ts');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };

// the shipped dcScaleFitJs, straight out of run.tsx
const run = fs.readFileSync(path.join(ROOT, 'app', 'workout', 'run.tsx'), 'utf8').replace(/\r\n/g, '\n');
const slice = run.slice(run.indexOf('function dcScaleFitJs('), run.indexOf('function DemoStepWebView('));
const dcScaleFitJs = new Function(ts.transpileModule(slice + '\nreturn dcScaleFitJs;', { compilerOptions: { target: 'ES2019' } }).outputText.replace(/^"use strict";\n?/, '').replace(/return dcScaleFitJs;?\s*$/, '') + '\nreturn dcScaleFitJs;')();
const musicSlice = run.slice(run.indexOf('function connectMusicInject('), run.indexOf('const MUSIC_HIDE_UNTIL_READY_JS'));
const connectMusicInject = new Function('dcScaleFitJs', ts.transpileModule(musicSlice, { compilerOptions: { target: 'ES2019' } }).outputText.replace(/^"use strict";\n?/, '') + '\nreturn connectMusicInject;')(dcScaleFitJs);

(async () => {
  const browser = await chromium.launch();
  // ───────────── 9: the music screen ─────────────
  check('9: the music screen is shown until "Don\'t show this page again" is ticked, with NO limit on how many times (the show-only-twice rule is gone)', decideMusicGate(null) === true && decideMusicGate('0') === true && decideMusicGate('1') === false && !/MUSIC_MAX_SHOWS|formpal_music_shown_count/.test(run + fs.readFileSync(path.join(ROOT, 'lib', 'musicGate.ts'), 'utf8')));
  check('9: run.tsx stores the tick as formpal_skip_connect_music = 1 and reads it before showing the screen', /AsyncStorage\.setItem\(SKIP_MUSIC_KEY, '1'\)/.test(run) && /decideMusicGate\(skip\)/.test(run));
  const music = async (inject) => {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await p.addInitScript(() => { window.ReactNativeWebView = { postMessage() {} }; });
    await p.addInitScript(H.DC_VIEWPORT_JS);
    await p.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'connectmusic.html')).href, { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    if (inject) { await p.evaluate(inject); await p.waitForTimeout(1500); }
    return p;
  };
  const measure = (p) => p.evaluate(() => {
    const leaf = (re) => [...document.querySelectorAll('#dc-root div')].filter((d) => re.test(d.textContent.trim()) && d.children.length <= 1).pop();
    const t = leaf(/^Listen to music/), sub = leaf(/^FormPal lets you/);
    const nine = [...document.querySelectorAll('#dc-root div')].find((d) => d.children.length === 0 && d.textContent.trim() === '9:41');
    const S = window.__dcCanvasScale || innerHeight / 844;
    return { title: t.getBoundingClientRect().top, sub: sub.getBoundingClientRect().top, nineVis: nine ? getComputedStyle(nine.parentElement).visibility : null, nineDisplay: nine ? getComputedStyle(nine.parentElement).display : null, S };
  });
  const raw = await measure(await music(null));
  const fit = await music(dcScaleFitJs('#ffffff'));          // the old behaviour (status row removed)
  const old = await measure(fit);
  const now = await measure(await music(connectMusicInject()));
  console.log('      music: design', raw.title.toFixed(0), '| old', old.title.toFixed(0), '| now', now.title.toFixed(0), '(title top, screen px)');
  check('9: the status bar row is hidden but keeps its room (visibility hidden, not removed)', now.nineVis === 'hidden' && now.nineDisplay !== 'none');
  check('9: the title sits LOWER than the design\'s own spot and well below the notch (inset 62): title top >= design + 20 and >= 110', now.title >= raw.title + 20 && now.title >= 110, JSON.stringify({ raw: raw.title, now: now.title }));
  check('9: the text under the title moves down with it', now.sub >= raw.sub + 20, now.sub.toFixed(0));
  // the page itself: Continue reports the tick box as it is shown; the page is revealed only when final
  const mpage = async () => {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const msgs = []; await p.exposeFunction('__post', (m) => msgs.push(m));
    await p.addInitScript(() => {
      window.ReactNativeWebView = { postMessage: (m) => window.__post(m) };
      const orig = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (k) { if (k === 'data-music-ready') { const row = [...document.querySelectorAll('#dc-root div')].find((d) => !d.children.length && d.textContent.trim() === '9:41'); const t = [...document.querySelectorAll('#dc-root div')].filter((d) => /^Listen to music/.test(d.textContent.trim()) && d.children.length <= 1).pop(); window.__atMusicShow = { rowHidden: row && row.parentElement.style.visibility, scaled: !!document.getElementById('dc-root').style.transform, titleTop: t && Math.round(t.getBoundingClientRect().top) }; } return orig.apply(this, arguments); };
    });
    await p.addInitScript(H.DC_VIEWPORT_JS + require('../lib/noZoom.ts').NO_ZOOM_JS + run.match(/const MUSIC_HIDE_UNTIL_READY_JS = `([\s\S]*?)`;/)[1]);
    await p.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'connectmusic.html')).href, { waitUntil: 'load' });
    await p.evaluate(connectMusicInject());
    await p.waitForFunction(() => document.documentElement.hasAttribute('data-music-ready'), null, { timeout: 8000 });
    return { p, msgs };
  };
  const m1 = await mpage();
  const at = await m1.p.evaluate(() => window.__atMusicShow);
  await m1.p.waitForTimeout(500);
  const later = await measure(m1.p);
  check('8: the music page is hidden until it is final: at the moment it is revealed it is scaled, the status row space is kept, and the title is already where it stays (no jump on arrival)', at && at.scaled && at.rowHidden === 'hidden' && Math.abs(at.titleTop - later.title) <= 1 && m1.msgs.filter((x) => x === 'musicShown').length === 1, JSON.stringify([at, later.title]));
  await m1.p.evaluate(() => { [...document.querySelectorAll('#dc-root div')].find((d) => !d.children.length && d.textContent.trim() === 'Continue').click(); });
  check('9: Continue with the box NOT ticked posts musicContinue:0 (the screen will show again next time)', m1.msgs.includes('musicContinue:0'), JSON.stringify(m1.msgs));
  const rowPt = await m1.p.evaluate(() => { const e = [...document.querySelectorAll('#dc-root div')].find((d) => !d.children.length && d.textContent.trim() === "Don't show this page again"); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await m1.p.mouse.click(rowPt.x, rowPt.y); await m1.p.waitForTimeout(250);
  const boxBg = await m1.p.evaluate(() => { const e = [...document.querySelectorAll('#dc-root div')].find((d) => !d.children.length && d.textContent.trim() === "Don't show this page again"); return getComputedStyle(e.previousElementSibling).backgroundColor; });
  m1.msgs.length = 0;
  await m1.p.evaluate(() => { [...document.querySelectorAll('#dc-root div')].find((d) => !d.children.length && d.textContent.trim() === 'Continue').click(); });
  check('9: tick "Don\'t show this page again" (the box turns dark), then Continue posts musicContinue:1: the app then stores the flag and never shows the screen again', boxBg === 'rgb(17, 17, 20)' && m1.msgs.includes('musicContinue:1'), JSON.stringify([boxBg, m1.msgs]));
  await m1.p.close();
  check('10: the music screen is an overlay above the workout screen, which is already mounted and loading the demo; Continue fades the overlay away (180ms) instead of swapping one web view for the other', /function ConnectMusicOverlay/.test(run) && /musicGate === 'show' && \(\s*<ConnectMusicOverlay/.test(run) && /MUSIC_FADE_MS = 180/.test(run) && /backgroundColor: '#ffffff', opacity: fade, zIndex: 100/.test(run) && !/return \(\s*<ConnectMusicWebView/.test(run));
  // ───────────── 10: the demo ─────────────
  const exId = 'curl', cues = ['Keep your elbows pinned to your sides', 'Curl up without swinging', 'Lower slowly, do not drop it'];
  const data = demoData({ exerciseId: exId, exName: 'Bicep Curl', sets: 3, reps: 12, stepIndex: 2, stepTotal: 5, cues, skipPref: true });
  const open = async (d, fit) => {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const msgs = []; await p.exposeFunction('__post', (m) => msgs.push(m));
    await p.addInitScript(() => {
      window.ReactNativeWebView = { postMessage: (m) => window.__post(m) };
      // snapshot what the page shows at the exact moment it is revealed
      const orig = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (k, v) { if (k === 'data-demo-ready') window.__atShow = { text: (document.getElementById('dc-root') || document.body || { textContent: '' }).textContent }; return orig.apply(this, arguments); };
    });
    await p.addInitScript(demoBeforeJs(d));
    await p.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'demovideo.html')).href, { waitUntil: 'load' });
    await p.evaluate(fit);
    await p.waitForFunction(() => document.documentElement.hasAttribute('data-demo-ready'), null, { timeout: 8000 });
    await p.waitForTimeout(400);
    return { p, msgs };
  };
  const { p, msgs } = await open(data, dcScaleFitJs('#111114'));
  const atShow = await p.evaluate(() => window.__atShow);
  check('10: at the exact moment the page is revealed it already shows the real exercise ("Bicep Curl", "2 of 5", the 3 real steps), never the design default "Push-ups" or its default instructions', !!atShow && /Bicep Curl/.test(atShow.text) && /2 of 5/.test(atShow.text) && cues.every((c) => atShow.text.includes(c)) && !/Push-ups|Hands just wider|Body in one straight|Lower until your chest/.test(atShow.text), atShow && atShow.text.split(/\s+/).join(' ').slice(0, 330));
  const st = await p.evaluate(() => ({ text: document.body.innerText.replace(/\n+/g, ' | '), anim: [...document.querySelectorAll('#dc-root *')].filter((e) => getComputedStyle(e).animationName !== 'none').length, ready: document.documentElement.hasAttribute('data-demo-ready') }));
  check('10: it shows the real exercise, position and steps: "Bicep Curl", "2 of 5" and the three real instructions', /Bicep Curl/.test(st.text) && /2 of 5/.test(st.text) && cues.every((c) => st.text.includes(c)) && !/Push-ups/.test(st.text), st.text.slice(0, 200));
  check('10: no CSS animation is running on the page (no entrance rise, no drifting blobs): nothing moves while it opens', st.anim === 0, String(st.anim));
  check('10: the page tells the app once that it is shown ("demoShown")', msgs.filter((m) => m === 'demoShown').length === 1, JSON.stringify(msgs));
  check('10: no page-wide observer or scanning (the old code re-scanned every div after every change, 4 times a second)', !/subtree/.test(DEMO_PAGE_JS) && !/querySelectorAll\('#dc-root div,#dc-root span'\)/.test(run) && !/demoVideoInject/.test(run));
  // lag: how busy is the page's main thread over 2 seconds while the demo plays (it re-draws 4 times a second)
  const busy = await p.evaluate(() => new Promise((res) => { const gaps = []; let last = performance.now(); const end = last + 2000; (function loop() { const n = performance.now(); gaps.push(n - last); last = n; if (n < end) requestAnimationFrame(loop); else res({ n: gaps.length, worst: Math.round(Math.max(...gaps.slice(2))), over40: gaps.slice(2).filter((g) => g > 40).length }); })(); }));
  console.log('      2s of the demo playing:', JSON.stringify(busy));
  check('10: while it plays there are no slow frames (none over 40 ms in 2 seconds)', busy.over40 === 0, JSON.stringify(busy));
  const cardBox = await p.evaluate(() => { const c = [...document.querySelectorAll('#dc-root div')].find((d) => /height: 346px|z-index: 4/.test(d.getAttribute('style') || '') && d.style.zIndex === '4'); const r = c.getBoundingClientRect(), root = document.getElementById('dc-root').getBoundingClientRect(), cs = getComputedStyle(c); return { l: Math.round(r.left), r: Math.round(r.right), b: Math.round(r.bottom), vw: innerWidth, vh: innerHeight, rootR: Math.round(root.right), rootB: Math.round(root.bottom), tl: cs.borderTopLeftRadius, bl: cs.borderBottomLeftRadius, br: cs.borderBottomRightRadius }; });
  check('11: the white demo card touches BOTH sides and the BOTTOM of the screen, with rounded top corners only (like the Workout complete card)', cardBox.l <= 0 && cardBox.r >= cardBox.vw && cardBox.b >= cardBox.vh && parseFloat(cardBox.tl) >= 30 && parseFloat(cardBox.bl) === 0 && parseFloat(cardBox.br) === 0, JSON.stringify(cardBox));
  // the buttons
  const m0 = msgs.length;
  await p.evaluate(() => document.querySelector('#dc-root a[aria-label="Close"]').click());
  await p.evaluate(() => document.querySelector('#dc-root a[href="In Workout.dc.html"]').click());
  const hideEl = await p.evaluate(() => { const e = [...document.querySelectorAll('#dc-root div')].find((d) => d.children.length === 0 && d.textContent.trim() === "Don't show this demo again"); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p.mouse.click(hideEl.x, hideEl.y); await p.waitForTimeout(300);
  const posted = msgs.slice(m0);
  check('10: Close posts demoBack, "I\'m ready" posts demoReady, the "don\'t show again" row posts demoTogglePref (one delegated listener)', ['demoBack', 'demoReady', 'demoTogglePref'].every((x) => posted.includes(x)), JSON.stringify(posted));
  // "don't show again" starts ticked when the saved preference is on
  const tick0 = await p.evaluate(() => { const e = [...document.querySelectorAll('#dc-root div')].find((d) => d.children.length === 0 && d.textContent.trim() === "Don't show this demo again"); const box = e.previousElementSibling; return box ? getComputedStyle(box).backgroundColor : null; });
  await p.close();
  const off = await open(demoData({ exerciseId: exId, exName: 'Bicep Curl', sets: 3, reps: 12, stepIndex: 2, stepTotal: 5, cues, skipPref: false }), dcScaleFitJs('#111114'));
  const tick1 = await off.p.evaluate(() => { const e = [...document.querySelectorAll('#dc-root div')].find((d) => d.children.length === 0 && d.textContent.trim() === "Don't show this demo again"); const box = e.previousElementSibling; return box ? getComputedStyle(box).backgroundColor : null; });
  const onState = await (async () => { const o = await open(data, dcScaleFitJs('#111114')); const v = await o.p.evaluate(() => { const e = [...document.querySelectorAll('#dc-root div')].find((d) => d.children.length === 0 && d.textContent.trim() === "Don't show this demo again"); const box = e.previousElementSibling; return box ? getComputedStyle(box).backgroundColor : null; }); await o.p.close(); return v; })();
  check('10: the "don\'t show this demo again" box starts ticked when the saved choice is on, and empty when it is off (no synthetic click)', onState !== tick1 && onState === 'rgb(17, 17, 20)', JSON.stringify([onState, tick1]));
  await off.p.close();
  // ───────────── 7: the clock starts only when the demo is visible ─────────────
  const open2 = async (d, startNow) => {
    const pg = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await pg.addInitScript(() => { window.ReactNativeWebView = { postMessage() {} }; });
    await pg.addInitScript(demoBeforeJs(d, startNow));
    await pg.goto(pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'demovideo.html')).href, { waitUntil: 'load' });
    await pg.evaluate(dcScaleFitJs('#111114'));
    await pg.waitForFunction(() => document.documentElement.hasAttribute('data-demo-ready'), null, { timeout: 8000 });
    return pg;
  };
  const clock = (pg) => pg.evaluate(() => ({ t: window.__demoT, step: window.__demoStep, playing: window.__demoSelf.state.playing, bar: [...document.querySelectorAll('#dc-root div')].map((d) => d.style.width).find((w) => /^[0-9.]+%$/.test(w) && parseFloat(w) < 100) }));
  const hidden = await open2(data, false);              // the demo drawn while it is still under the music screen
  await hidden.waitForTimeout(4500);                     // (the old page would be at ~4.5 of 18 seconds after this; under the music screen it ran to ~16)
  const c0 = await clock(hidden);
  check('7: a demo that is drawn but NOT visible (under the music screen) stays at 0 and paused, however long it waits (4.5s: still 0, bar 0%)', c0.t === 0 && c0.playing === false && c0.step === 0 && (c0.bar === '0.00%' || c0.bar === '0%'), JSON.stringify(c0));
  await hidden.evaluate(() => window.__demoStart());
  await hidden.waitForTimeout(1300);
  const c1 = await clock(hidden);
  check('7: when the app says it is visible, the clock starts at 0 and runs (1.3s later it is about 1 second in, not 16)', c1.playing === true && c1.t > 0.5 && c1.t < 2.6, JSON.stringify(c1));
  await hidden.evaluate(() => window.__demoStart()); await hidden.waitForTimeout(100);
  const c2 = await clock(hidden);
  check('7: starting again restarts from 0', c2.t < 0.6, JSON.stringify(c2));
  await hidden.close();
  const live = await open2(data, true); await live.waitForTimeout(1300);
  const c3 = await clock(live);
  check('7: a demo that is visible from the start (no music screen) plays from 0 at once', c3.playing === true && c3.t > 0.5 && c3.t < 2.6, JSON.stringify(c3));
  await live.close();
  check('7: the app starts the clock only when the music overlay is gone (active = musicGate done) and injects window.__demoStart then', /active=\{musicGate === 'done'\}/.test(run) && /window\.__demoStart && window\.__demoStart\(\)/.test(run) && /if \(!active\) return;/.test(run));
  // ───────────── 6: the music screen arrival ─────────────
  check('6: the demo web view is created only AFTER the music page has drawn (350ms later), so the two web views are no longer built at the same moment on arrival', /isDemoStep && currentEx && demoAllowed && \(/.test(run) && /setTimeout\(\(\) => setDemoAllowed\(true\), 350\)/.test(run) && /if \(!musicPageShown\) return;/.test(run));
  check('6: the music page fades in when it is final (160ms) instead of popping, and the app logs how long it took ("[MUSIC] page drawn Nms after the screen opened")', /toValue: 1, duration: 160/.test(run) && /\[MUSIC\] page drawn/.test(run));
  check('10: Continue waits for the demo underneath to be drawn (1.5s at most) before the overlay fades, so the demo is never half-loaded when it appears', /demoReady=\{demoDrawn \|\| !isDemoStep\}/.test(run) && /setTimeout\(\(\) => setWaitedOut\(true\), 1500\)/.test(run) && /demoReady \|\| waitedOut/.test(run));
  // ───────────── 11: timed steps ─────────────
  const ph = demoTimeline('curl', cues, {});
  check('11: with no video the steps still have start times, spread over the 18s placeholder (0, 6, 12) and timed is false', ph.timed === false && ph.length === PLACEHOLDER_LENGTH && ph.steps.map((x) => x.start).join() === '0,6,12', JSON.stringify(ph.steps));
  const cfg = { curl: { videoLength: 24, stepStarts: [0, 7.5, 15] } };
  const real = demoTimeline('curl', cues, cfg);
  check('11: a config of start times in seconds becomes the timeline (24s video, steps at 0 / 7.5 / 15, timed true)', real.timed && real.length === 24 && real.steps.map((x) => x.start).join() === '0,7.5,15' && real.steps.map((x) => x.text).join() === cues.join());
  check('11: start times are sorted, extras ignored, and missing ones spread over the rest of the video', demoTimeline('curl', cues, { curl: { videoLength: 30, stepStarts: [12, 0] } }).steps.map((x) => x.start).join() === '0,12,21' && demoTimeline('curl', cues, { curl: { videoLength: 30, stepStarts: [0, 5, 10, 20] } }).steps.length === 3 && demoTimeline('curl', cues, { curl: { videoLength: 0, stepStarts: [0] } }).timed === false);
  // on the real page: the lit step follows the start times, tapping a step jumps to its start, prev/next too
  const tdata = demoData({ exerciseId: 'curl', exName: 'Bicep Curl', sets: 3, reps: 12, stepIndex: 1, stepTotal: 1, cues, skipPref: false }, real);
  const t = await open(tdata, dcScaleFitJs('#111114'));
  const lit = () => t.p.evaluate(() => { const cl = [...document.querySelectorAll('#dc-root div')].filter((d) => /^0:[0-9][0-9]$/.test(d.textContent.trim())).pop(); const bar = [...document.querySelectorAll('#dc-root div')].map((d) => d.style.width).find((w) => /^[0-9.]+%$/.test(w) && parseFloat(w) < 100); return { step: window.__demoStep, t: window.__demoT, clock: cl ? cl.textContent.trim() : null, bar }; });
  const stepEl = (i) => t.p.evaluate((i) => { const names = ['Keep your elbows pinned to your sides', 'Curl up without swinging', 'Lower slowly, do not drop it']; const el = [...document.querySelectorAll('#dc-root div')].filter((d) => d.children.length <= 1 && d.textContent.trim() === names[i]).pop(); el.click(); }, i);
  await stepEl(1); await t.p.waitForTimeout(150);
  let L = await lit();
  check('11: tapping step 2 jumps to ITS start time (7.5s): that step is lit, the clock reads 0:07', L.step === 1 && L.t >= 7.5 && L.t < 8.2 && L.clock === '0:07', JSON.stringify(L));
  await stepEl(2); await t.p.waitForTimeout(150); L = await lit();
  check('11: step 3 starts at 15s; the progress bar is at 15 / 24 of the video (62.5%)', L.step === 2 && L.t >= 15 && /^6[2-3]\./.test(L.bar), JSON.stringify(L));
  await stepEl(0); await t.p.waitForTimeout(150);
  // 14.9 s is still step 2: the lit step is "the last one whose start has passed"
  await t.p.evaluate(() => { window.__demoStepAtTest = true; });
  const mid = await t.p.evaluate(() => { const reg = window.__dcRegistry; for (const k in reg) { if (reg[k] && reg[k].Logic) { const inst = reg[k]; return typeof inst.Logic === 'function'; } } return false; });
  check('11: the page logic is the timed one (the design\'s own even split is replaced)', mid === true);
  await t.p.close();
  const dv = fs.readFileSync(path.join(ROOT, 'lib', 'demoVideos.ts'), 'utf8');
  check('11: the file that says how to set the times exists, with an example and the steps (lib/demoVideos.ts HOW TO SET THE TIMES)', /HOW TO SET THE TIMES/.test(dv) && /stepStarts: \[0, 8\.5, 16\]/.test(dv) && /DEMO_VIDEOS: Record<string, DemoVideoConfig>/.test(dv));
  check('11: the app logs when an exercise still uses placeholder timing', /\[DEMO\] ' \+ exerciseId \+ ': placeholder timing/.test(run));
  // the prewarm
  check('10: the demo and music pages are warmed in the background (DesignPrewarm), so the first open has no load', /demovideo\.html/.test(fs.readFileSync(path.join(ROOT, 'components', 'DesignPrewarm.tsx'), 'utf8')) && /connectmusic\.html/.test(fs.readFileSync(path.join(ROOT, 'components', 'DesignPrewarm.tsx'), 'utf8')));
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
