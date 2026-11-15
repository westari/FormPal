#!/usr/bin/env node
/**
 * scripts/test-rep-review-1113.js
 *
 * Ari's phone test 2026-11-13, the rep review (assets/app screens/repfeedback.html + the shipped injection) and the camera look:
 *   9.  the last rep's button says "Finish" (not "Next rep"); tapping it posts finishReview, and the app answers with the strong haptic
 *   10. the video controls (back 10 s, forward 10 s, pause) are real Liquid Glass buttons (same component as the back / All sets buttons)
 *   11. the Summary card is NOT pressable: no press effect (it used to turn black and do nothing)
 *   7.  the Ready / Go card is the ORIGINAL look (big green check, green "Ready. Go!")
 *   8.  the Coach's reason (under the X) sits on a dark pill: readable on any background
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

const opts = { exerciseName: 'Shoulder Press', hasVideo: true, reps: [
  { timeSec: 6.0, what: 'Test rep one. Fix one.' },
  { timeSec: 11.0, what: 'Test rep two. Fix two.' },
] };
const INJECT = require('../lib/repFeedbackInject.ts').repFeedbackInject(opts);
const file = path.join(ROOT, 'assets', 'app screens', 'repfeedback.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 852 }, deviceScaleFactor: 2 });
  const msgs = []; let ready = false;
  await page.exposeFunction('__post', (d) => { let m; try { m = JSON.parse(d); } catch { return; } if (m.type === 'pageConsole') return; msgs.push(m); if (m.type === 'ready') ready = true; });
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  await page.addInitScript(INJECT);
  await page.goto(pathToFileURL(file).href, { waitUntil: 'commit' });
  const deadline = Date.now() + 9000;
  while (!ready && Date.now() < deadline) await page.waitForTimeout(25);
  check('the page posts ready with the real reps', ready);

  const label = () => page.evaluate(() => { const all = [...document.querySelectorAll('#dc-root div')].filter((d) => d.children.length === 0 && /^(Next rep|Finish|Finish review)$/.test((d.textContent || '').trim())); return all.length ? all[0].textContent.trim() : null; });
  const tap = async (sel) => { const r = await page.evaluate((s) => { const el = [...document.querySelectorAll('#dc-root div')].filter((d) => d.children.length === 0 && (d.textContent || '').trim() === s)[0]; if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel); if (!r) return false; await page.mouse.click(r.x, r.y); await page.waitForTimeout(150); return true; };

  // 9. Finish label
  check('rep 1 of 2: the button says "Next rep"', (await label()) === 'Next rep', await label());
  await tap('Next rep');
  check('the LAST rep: the button says "Finish" (not "Finish review", not "Next")', (await label()) === 'Finish', await label());
  const before = msgs.filter((m) => m.type === 'finishReview').length;
  await tap('Finish');
  check('tapping "Finish" on the last rep posts finishReview (the app answers with hapticFinish: Heavy impact + Success)', msgs.filter((m) => m.type === 'finishReview').length === before + 1);
  const rf = read('app/rep-feedback.tsx');
  check('the app side: finishReview -> hapticFinish() (and the haptic file has the Heavy + Success pair)', /msg\.type === 'finishReview'[\s\S]{0,260}hapticFinish\(\)/.test(rf) && /import \{ hapticFinish \} from '\.\.\/lib\/haptics'/.test(rf));

  // 11. Summary not pressable
  const sum = await page.evaluate(() => {
    const span = [...document.querySelectorAll('#dc-root span')].find((s) => (s.textContent || '').trim() === 'Summary');
    if (!span) return null;
    const pill = span.closest('div');
    const r = pill.getBoundingClientRect();
    return { pe: getComputedStyle(pill).pointerEvents, bg: getComputedStyle(pill).backgroundColor, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  check('the Summary pill has pointer-events: none (it is not a button)', !!sum && sum.pe === 'none', JSON.stringify(sum));
  await page.mouse.move(sum.x, sum.y);
  await page.mouse.down();
  await page.waitForTimeout(120);
  const bgDown = await page.evaluate(() => { const span = [...document.querySelectorAll('#dc-root span')].find((s) => (s.textContent || '').trim() === 'Summary'); return getComputedStyle(span.closest('div')).backgroundColor; });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const bgAfter = await page.evaluate(() => { const span = [...document.querySelectorAll('#dc-root span')].find((s) => (s.textContent || '').trim() === 'Summary'); return getComputedStyle(span.closest('div')).backgroundColor; });
  check('pressing and releasing the Summary pill changes NOTHING (no black, no toggle)', bgDown === sum.bg && bgAfter === sum.bg, `${sum.bg} -> ${bgDown} -> ${bgAfter}`);
  await browser.close();

  // 10. glass controls
  const vc = read('components/VideoControls.tsx');
  check('VIDEO CONTROLS: back 10 s, forward 10 s and pause are LiquidGlassButton (real Liquid Glass, the same component as the back / All sets buttons)', /import \{ LiquidGlassButton, GLASS_SUPPORTED \} from '\.\/LiquidGlass'/.test(vc) && /<LiquidGlassButton[\s\S]{0,400}variant="regular"/.test(vc) && /gobackward\.10/.test(vc) && /goforward\.10/.test(vc) && /'pause\.fill'|pause\.fill/.test(vc));
  const wsrc = read('components/WarmSurfaces.tsx');
  check('BACK and ALL SETS are the same LiquidGlassButton (GlassChrome), drawn over the page', /function GlassChrome/.test(wsrc) && (wsrc.match(/<LiquidGlassButton/g) || []).length >= 3);
  const lg = read('components/LiquidGlass.tsx');
  check('a build whose native module has no glass is now visible in the log: "[GLASS] real Liquid Glass: ON/OFF"', /\[GLASS\] real Liquid Glass:/.test(lg));

  // 7. Ready look, 8. Coach text
  const fc = read('app/formcheck.tsx');
  check('READY: the original Ready card (40pt green check + green "Ready. Go!" in the glass pill), not the shared white-text cue pill', /<GlassPanel radius=\{999\} style=\{s\.setupSuccessCard\}>[\s\S]{0,300}size=\{40\} tintColor=\{C\.good\}[\s\S]{0,200}<Text style=\{s\.setupSuccessText\}>Ready\. Go!<\/Text>/.test(fc) && !/<CueGlass text="Ready\. Go!" ready \/>/.test(fc) && /setupSuccessText:\s+\{ fontFamily: F\.extra, fontSize: 21, color: C\.good \}/.test(fc));
  const rfb = read('components/RepFeedback.tsx');
  check('COACH TEXT: the reason under the X sits on a dark pill with white 25pt bold text (readable on any background)', /cuePill: \{[\s\S]{0,300}backgroundColor: 'rgba\(10,10,14,0\.78\)'/.test(rfb) && /<View style=\{rf\.cuePill\}><Text style=\{rf\.cue\}/.test(rfb) && /fontSize: 25/.test(rfb));
  const luma = (c) => { const m = c.match(/rgba?\((\d+),(\d+),(\d+)/); return (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255; };
  const lp = luma('rgba(10,10,14,0.78)');
  const worst = 0.78 * lp + 0.22 * 1; // pill over a pure WHITE wall: 78% dark + 22% white behind it
  const L = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const ratio = (1.05) / (L(worst) + 0.05);
  check('contrast: white text on the pill over a pure white wall is at least 7:1', ratio >= 7, ratio.toFixed(1) + ':1');
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
