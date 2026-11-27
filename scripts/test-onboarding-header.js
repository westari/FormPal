#!/usr/bin/env node
/**
 * scripts/test-onboarding-header.js  (round 9, item 1)
 * The onboarding PROGRESS BAR is PART OF THE PAGE on the design-page screens (round 10: the BACK BUTTON is real native Liquid Glass again, fixed, and fades away when the page scrolls): it scrolls with the page on the very same frame,
 * so it cannot trail, jitter or drift over the text. Real onboarding pages (the shipped scale-to-fit code + the shipped header code, extracted from
 * app/onboarding.tsx) in Chromium. A fast flick = many large scroll jumps and real mouse-wheel flicks, sampled on every frame.
 */
require('./lib/ts-node-loader.js')(); global.__DEV__ = false;
const fs = require('fs'), path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const E = require('./lib/onboarding-extract.js').load();
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const esc = (s) => JSON.stringify(s).slice(1, -1);

(async () => {
  const browser = await chromium.launch();
  const { computeGoalPlan } = require('../lib/onboardingGoals.ts');
  const a = { weight: 200, goalWeight: 160, mainGoal: 'Lose fat / Lose weight', age: 30, height: `5'11"`, experience: 'Beginner' };
  const goal = computeGoalPlan(a);
  const raw = fs.readFileSync(path.join(ROOT, 'assets', 'app screens', 'planisreadynow.html'), 'utf8');
  const planFile = path.join(ROOT, '.scratch', 'plan-ready-hdr.html'); fs.mkdirSync(path.dirname(planFile), { recursive: true });
  fs.writeFileSync(planFile, raw.replace('{{HEADER}}', esc(E.planReadyHeaderText(goal))).replace('{{SUBLINE}}', esc('Starting today')));

  const open = async (file, { w = 390, h = 700, progress = 0.62, extra = '' } = {}) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const msgs = []; await page.exposeFunction('__post', (m) => msgs.push(m));
    await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (m) => window.__post(m) }; });
    await page.addInitScript(E.VIEWPORT_JS);
    await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
    await page.waitForSelector('#dc-root', { timeout: 15000 });
    await page.evaluate(E.DC_PAGE_INJECT); if (extra) await page.evaluate(extra);
    await page.evaluate(E.onbHeaderJs(progress, false));
    await page.waitForTimeout(1500);
    return { page, msgs };
  };

  // ── the plan-ready page: a tall page that really scrolls (on a 700px tall phone) ──
  const { page, msgs } = await open(planFile, { extra: E.planReadyInject(a) });
  const info = await page.evaluate(() => ({ n: document.querySelectorAll('#__onb_hdr').length, scrollable: document.documentElement.scrollHeight - innerHeight, parent: document.getElementById('__onb_hdr').parentElement.tagName, pos: getComputedStyle(document.getElementById('__onb_hdr')).position, fill: document.getElementById('__onb_prog').style.width }));
  check('the bar is in the page exactly once, placed absolutely (not fixed) in the document, so it belongs to the page and scrolls with it', info.n === 1 && info.parent === 'BODY' && info.pos === 'absolute', JSON.stringify(info));
  check('the page really scrolls here (tall page on a short phone), so the test means something', info.scrollable > 150, 'scrolls ' + info.scrollable + 'px');
  check('the progress bar shows the real progress (62%)', info.fill === '62%', info.fill);
  const geo = await page.evaluate(() => { const t = document.getElementById('__onb_prog').parentElement.getBoundingClientRect(); return { hasBack: !!document.getElementById('__onb_back'), trackL: t.left, trackH: t.height, trackTop: t.top }; });
  check('the page has NO back button of its own any more (a web page cannot draw real Liquid Glass: the back button is native), and the progress track is 4px tall, where it always was (starts 66px in, centred on the old button row: 29px from the top)', !geo.hasBack && geo.trackH === 4 && Math.abs(geo.trackL - 66) < 1 && Math.abs((geo.trackTop + 2) - 29) < 0.6, JSON.stringify(geo));
  const text0 = await page.evaluate(() => { const h = document.getElementById('__onb_hdr').getBoundingClientRect(); const hits = [...document.querySelectorAll('#dc-root div,#dc-root span,#dc-root p,#dc-root a')].filter((e) => { if (e.children.length) return false; if (!(e.textContent || '').trim()) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > h.top + 3 && r.top < h.bottom - 3 && r.right > h.left && r.left < h.right; }).map((e) => e.textContent.trim().slice(0, 30)); return hits; });
  check('at the top of the page the bar does not sit on any text', text0.length === 0, JSON.stringify(text0));

  // fast flick 1: jumps of 40-400px every frame, up and down, 200 frames, sampled in the same frame
  const run1 = await page.evaluate(async () => {
    const h = document.getElementById('__onb_hdr'), max = document.documentElement.scrollHeight - innerHeight; let worst = 0, n = 0, y = 0, dir = 1;
    for (let i = 0; i < 200; i++) {
      y += dir * (40 + Math.random() * 360); if (y > max) { y = max; dir = -1; } if (y < 0) { y = 0; dir = 1; }
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(r));
      const top = h.getBoundingClientRect().top, want = 12 - window.scrollY;
      worst = Math.max(worst, Math.abs(top - want)); n++;
    }
    return { worst, n };
  });
  check('FAST FLICK (200 big jumps, sampled every frame): the bar is exactly where the page puts it every time (worst error ' + run1.worst.toFixed(3) + 'px)', run1.n === 200 && run1.worst < 0.5, JSON.stringify(run1));
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200);
  // fast flick 2: real mouse wheel flicks (what a finger fling is), sampled by a frame loop running the whole time
  await page.evaluate(() => { window.__samples = []; window.__stop = false; const h = document.getElementById('__onb_hdr'); (function loop() { window.__samples.push([window.scrollY, h.getBoundingClientRect().top]); if (!window.__stop) requestAnimationFrame(loop); })(); });
  await page.mouse.move(200, 400);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(25); }
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -900); await page.waitForTimeout(25); }
  await page.waitForTimeout(500);
  const run2 = await page.evaluate(() => { window.__stop = true; const s = window.__samples; let worst = 0, moved = new Set(); for (const [y, t] of s) { worst = Math.max(worst, Math.abs(t - (12 - y))); moved.add(Math.round(y)); } return { frames: s.length, worst, distinctScrollPositions: moved.size }; });
  check('REAL WHEEL FLICKS up and down (' + run2.frames + ' frames, ' + run2.distinctScrollPositions + ' different scroll positions): the bar never trails the page (worst ' + run2.worst.toFixed(3) + 'px)', run2.frames > 20 && run2.distinctScrollPositions >= 3 && run2.worst < 0.5, JSON.stringify(run2));
  // scrolled down: the bar has gone up with the page, nothing floats over the text
  await page.evaluate(() => window.scrollTo(0, 400)); await page.waitForTimeout(100);
  const down = await page.evaluate(() => document.getElementById('__onb_hdr').getBoundingClientRect().bottom);
  check('scrolled down 400px the bar is gone off the top with the page (not floating over the text)', down < 0, String(down));
  // the header never catches a tap (pointer-events none): the native glass back button sits above the page
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(100);
  check('the header strip does not catch taps (pointer-events none), so the page underneath stays tappable', await page.evaluate(() => getComputedStyle(document.getElementById('__onb_hdr')).pointerEvents) === 'none');
  await page.evaluate(() => window.__onbSetProgress(0.8)); check('the app can move the progress later (page.__onbSetProgress)', await page.evaluate(() => document.getElementById('__onb_prog').style.width) === '80%');
  await page.screenshot({ path: path.join(ROOT, '.scratch', 'onb-header-top.png'), clip: { x: 0, y: 0, width: 390, height: 260 } });
  await page.evaluate(() => document.getElementById('__onb_hdr').remove()); await page.waitForTimeout(700);
  check('if the page rebuilds itself and the bar disappears it is put back', await page.evaluate(() => document.querySelectorAll('#__onb_hdr').length) === 1);
  await page.close();

  // ── a one-screen page (does not scroll) and a second tall one: the bar is in the same place ──
  for (const key of ['startingpoint', 'goodhandsv2', 'formconfidence']) {
    const f = path.join(ROOT, 'assets', 'app screens', key + '.html');
    const { page: p2 } = await open(f, { h: 844 });
    const g = await p2.evaluate(() => { const w = document.getElementById('__onb_prog_wrap'); if (!w) return null; const r = w.getBoundingClientRect(); return { l: r.left, t: r.top, n: document.querySelectorAll('#__onb_hdr').length, back: !!document.getElementById('__onb_back') }; });
    check(`${key}: the progress bar is there, once, at the same place (54px from the left, 27px from the top of the page), and there is no web back button`, !!g && g.n === 1 && !g.back && Math.abs(g.l - 54) < 1 && Math.abs(g.t - 27) < 1.5, JSON.stringify(g));
    await p2.close();
  }

  // ── the app side (source order) ──
  const ob = read('app/onboarding.tsx');
  check('app: the back button is NATIVE real glass (OnbBackButton) on every in-page screen, in a header that is a SIBLING of the fading page (no animated opacity around real glass), it goes away once the page has scrolled (no tracking of the scroll), and the native bar is drawn only where the page has none', ob.includes('<OnbBackButton onPress') && ob.includes('(noHeader || !headerOn || backHidden) ? null : (') && ob.includes('{!inPageHeader && progress != null && (') && !ob.includes('translateY: headerY') && !ob.includes('backFade'));
  check('app: the page\'s back tap goes back (onbback -> onBack), handled before anything that could advance', /if \(m === 'onbback'\) \{ Haptics\.selectionAsync\(\); onBack\(\); return; \}/.test(ob) && ob.indexOf("m === 'onbback'") < ob.indexOf("if (m === '__tap' || m === '__tick')"));
  check('app: the page scroll report is injected on every page (it only drives the back button fade, it no longer moves anything)', ob.includes("onbHeaderJs(progress ?? null, !isDcPage) + '\\n' + ONB_SCROLL_REPORT_JS : ONB_SCROLL_REPORT_JS)") && ob.includes('const hide = (Number(m.slice(10)) || 0) > 12;'));
  check('app: no back button and no bar from "building your plan" onward (generatePlan, planReady, trialTimeline), and the two native screens after them have none either', ob.includes("const ONB_NO_HEADER_KEYS: string[] = ['generatePlan', 'planReady', 'trialTimeline'];") && ob.includes('!ONB_INPAGE_HEADER_EXCLUDE.includes(htmlKey) && !noHeader') && !read('components/onboarding/TryForFreeScreen.tsx').includes('<OnbBackButton onPress') && !read('components/onboarding/TryForFreeScreen.tsx').includes('progress != null &&') && !/emailMode ? <OnbBackButton/.test('') && read('components/onboarding/SaveProgressScreen.tsx').includes('{emailMode ? <OnbBackButton'));
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
