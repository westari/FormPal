#!/usr/bin/env node
/**
 * scripts/test-home-clean.js
 *
 * Home tab "hyper-clean" pass (lib/homeClean.ts + app/(tabs)/index.tsx), run in
 * headless Chromium against the REAL assets/app screens/home.html with the EXACT
 * injection the app ships (HOME_SCALE_FIT_JS + buildHomeInjectJs).
 *
 * Checks every rule of the spec against the live DOM (computed styles), proves
 * the interactive logic still works (Start / Cue / Progress / Recent / the
 * artboard's own energy picker + edit sheet), and that "8 of 4 workouts" can no
 * longer happen. Screenshots: .scratch/home-before.png, .scratch/home-after.png
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const Module = require('module');
const origLoad = Module._load;
Module._load = function (req) { if (/constants\/api$/.test(req)) return { MYPAL_API_URL: 'http://localhost/none' }; return origLoad.apply(this, arguments); };
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const home = require('../app/(tabs)/index.tsx');
const clean = require('../lib/homeClean.ts');

const TOP = `(re) => { const m = [...document.querySelectorAll('div,span,a')].filter(d => re.test((d.textContent||'').trim())); return m.find(e => !(e.parentElement && re.test((e.parentElement.textContent||'').trim()))); }`;
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

const now = Date.now();
const plan = { id: 'p', profile: { goal: 'general', experience: 'beginner', daysPerWeek: 4, location: 'gym' }, currentWorkoutIndex: 0,
  workouts: [{ id: 'w', splitLabel: 'Upper Body', exercises: [{}, {}, {}, {}] }] };
// 8 workouts today-ish (this week), each its own ts
const sessions = Array.from({ length: 8 }, (_, i) => ({ ts: now - i * 60000, exerciseId: 'shoulderPress', displayName: 'Shoulder Press', reps: 10, goodReps: 8, pct: 80, formChecked: true }));
const file = pathToFileURL(path.join(ROOT, 'assets', 'app screens', 'home.html')).href;

async function open(withClean, sess) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 852 }, deviceScaleFactor: 2 });
  const msgs = [];
  await page.exposeFunction('__post', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
  await page.addInitScript(() => { window.ReactNativeWebView = { postMessage: (d) => window.__post(d) }; });
  await page.goto(file, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  await page.evaluate(home.HOME_SCALE_FIT_JS);
  if (withClean) await page.evaluate(home.buildHomeInjectJs(plan, sess, 47, 34));
  await page.waitForTimeout(1500);
  // freeze the artboard's own entrance animations for stable measuring
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
  await page.waitForTimeout(300);
  return { browser, page, msgs };
}

(async () => {
  // ── before ──
  {
    const { browser, page } = await open(false, sessions);
    await page.screenshot({ path: path.join(ROOT, '.scratch', 'home-before.png') });
    const shadows = await page.evaluate(() => [...document.querySelectorAll('div,a')].filter(e => getComputedStyle(e).boxShadow !== 'none').length);
    console.log(`      before: ${shadows} elements carry box-shadows`);
    await browser.close();
  }
  // ── after ──
  const { browser, page, msgs } = await open(true, sessions);
  await page.screenshot({ path: path.join(ROOT, '.scratch', 'home-after.png') });
  for (const [i, y] of [[2, 560], [3, 99999]]) {
    await page.evaluate((yy) => { const sc = document.querySelector('[data-scroll]'); sc.scrollTop = yy; }, y);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(ROOT, '.scratch', `home-after-${i}.png`) });
  }
  await page.evaluate(() => { document.querySelector('[data-scroll]').scrollTop = 0; });
  await page.waitForTimeout(150);
  const info = await page.evaluate(() => {
    const S = window.__dcCanvasScale || 1;
    const rootL = document.querySelector('[data-hc="root"]').getBoundingClientRect().left / S;
    const root = document.querySelector('[data-hc="root"]');
    const cs = (el) => getComputedStyle(el);
    const rect = (el) => { const r = el.getBoundingClientRect(); return { l: r.left / S - rootL, r: r.right / S - rootL, t: r.top / S, b: r.bottom / S, w: r.width / S, h: r.height / S }; };
    const cards = [...document.querySelectorAll('[data-hc="card"]')];
    const pills = [...document.querySelectorAll('[data-hc="pill"]')];
    const tagged = [...document.querySelectorAll('[data-hc]')];
    return {
      S,
      rootBg: root && cs(root).backgroundColor,
      cards: cards.map(c => ({ bg: cs(c).backgroundColor, sh: cs(c).boxShadow, bw: cs(c).borderTopWidth, bc: cs(c).borderTopColor, r: cs(c).borderTopLeftRadius, rect: rect(c), txt: c.innerText.replace(/\s+/g, ' ').slice(0, 30) })),
      pills: pills.map(c => ({ bg: cs(c).backgroundColor, sh: cs(c).boxShadow, r: cs(c).borderTopLeftRadius, txt: c.innerText.replace(/\s+/g, ' ').slice(0, 24) })),
      anyShadowOnTagged: tagged.filter(e => /^(card|pill|dotpill|thumb|iconbtn|chip|stk\d|seal|dot-on|dot-off|ftrack|ffill)$/.test(e.getAttribute('data-hc')) && cs(e).boxShadow !== 'none').length,
      allShadows: [...document.querySelectorAll('div,a')].filter(e => cs(e).boxShadow !== 'none' && e.closest('[data-hc-root-skip]') == null).map(e => (e.innerText || '').slice(0, 12)).length,
      secs: ['sec1', 'sec'].flatMap(k => [...document.querySelectorAll(`[data-hc="${k}"]`)].map(e => ({ txt: e.innerText.trim().slice(0, 20), pt: parseFloat(cs(e).paddingTop), pl: parseFloat(cs(e).paddingLeft), top: rect(e).t }))),
      stack: (() => { const s = document.querySelector('[data-hc="stack"]'); return s && { h: rect(s).h, kids: [...s.children].map(k => ({ tf: cs(k).transform, sh: cs(k).boxShadow })) }; })(),
      meta: [...document.querySelectorAll('[data-hc="meta"]')].map(e => ({ txt: e.innerText.slice(0, 22), c: cs(e).color })),
      pillText: [...document.querySelectorAll('[data-hc="pill-sub"],[data-hc="pill-main"]')].map(e => ({ txt: e.innerText, c: cs(e).color, fs: cs(e).fontSize })),
      titles: ['Today', 'Progress', 'Recent Workouts', 'Learn The Moves'].map(t => { const e = [...document.querySelectorAll('div,span')].filter(d => d.textContent.trim() === t).pop(); return { t, fw: e && cs(e).fontWeight }; }),
      week: (() => { const e = [...document.querySelectorAll('div,span')].filter(d => /^\d+ of \d+ workouts$/.test((d.textContent || '').trim())); return e.length ? e[e.length - 1].textContent.trim() : null; })(),
      dots: [...document.querySelectorAll('[data-hc="dot-on"],[data-hc="dot-off"]')].filter(d => cs(d).display !== 'none').map(d => ({ on: d.getAttribute('data-hc') === 'dot-on', bg: cs(d).backgroundColor })),
      fill: (() => { const f = document.querySelector('[data-hc="ffill"]'); return f && cs(f).backgroundColor; })(),
      scrollPad: parseFloat(cs(document.querySelector('[data-scroll]')).paddingBottom) * S,
      learnThumbR: (() => { const t = [...document.querySelectorAll('[data-hc="thumb"]')]; return t.map(x => cs(x).borderTopLeftRadius); })(),
    };
  });
  const rgb = (c) => c.replace(/\s/g, '');
  check('background is #F2F2F7', rgb(info.rootBg) === 'rgb(242,242,247)', info.rootBg);
  check(`all ${info.cards.length} cards are pure white`, info.cards.length >= 8 && info.cards.every(c => rgb(c.bg) === 'rgb(255,255,255)'), info.cards.map(c => c.txt).join(' | '));
  check('pills are pure white', info.pills.length >= 3 && info.pills.every(c => rgb(c.bg) === 'rgb(255,255,255)'), info.pills.map(p => p.txt).join(' | '));
  check('NO shadow on any card / pill / thumbnail / button / chip / dot', info.anyShadowOnTagged === 0, `${info.anyShadowOnTagged} found`);
  check('every card has a 1px hairline instead (zinc-200)', info.cards.every(c => c.bw === '1px' && /228, 228, 231/.test(c.bc)), info.cards[0].bc);
  check('one radius system: cards 16px', info.cards.every(c => c.r === '16px'), [...new Set(info.cards.map(c => c.r))].join());
  check('one radius system: pills fully round', info.pills.every(p => parseFloat(p.r) >= 20), [...new Set(info.pills.map(p => p.r))].join());
  check('one radius system: thumbnails 12px', info.learnThumbR.length >= 5 && info.learnThumbR.every(r => r === '12px'), [...new Set(info.learnThumbR)].join());
  const lefts = info.cards.filter(c => !/^Squat|^Push|^Pull|^Dead|^Shoulder|^Full|^Upper/.test(c.txt) || true).map(c => Math.round(c.rect.l * 10) / 10);
  const fullWidth = info.cards.filter(c => c.rect.w > 300);
  check('standard 20px outer margin: every full-width card sits at x=20 and ends 20 from the edge', fullWidth.length >= 3 && fullWidth.every(c => Math.abs(c.rect.l - 20) < 0.6 && Math.abs(390 - c.rect.r - 20) < 0.6), fullWidth.map(c => `${c.rect.l.toFixed(1)}..${c.rect.r.toFixed(1)}`).join(' '));
  check('section titles share the 20px left margin', info.secs.every(s => Math.abs(s.pl - 20) < 0.6), info.secs.map(s => `${s.txt}:${s.pl}`).join(' | '));
  const gaps = info.secs.filter(s => s.pt >= 50).map(s => s.pt);
  check('main sections breathe: 56px above Progress / Recent Workouts / Learn The Moves (was 44)', gaps.length === 3 && gaps.every(g => Math.abs(g - 56) < 0.6), gaps.join());
  check('hero stack is a short, flat, tidy preview (<= 120px tall, no rotation, no shadow)', info.stack && info.stack.h <= 120 && info.stack.kids.slice(0, 3).every(k => (k.tf === 'none' || /matrix\(1, 0, 0, 1/.test(k.tf)) && k.sh === 'none'), JSON.stringify(info.stack && { h: info.stack.h, tf: info.stack.kids.map(k => k.tf) }));
  check('secondary header pills: small + light grey (zinc-500)', info.pillText.length >= 4 && info.pillText.every(p => rgb(p.c) === 'rgb(113,113,122)' && parseFloat(p.fs) <= 12), info.pillText.map(p => `${p.txt}:${p.fs}`).join(' '));
  check('meta text is muted grey (zinc-500)', info.meta.length >= 5 && info.meta.every(m => rgb(m.c) === 'rgb(113,113,122)'), info.meta.map(m => m.txt).join(' | '));
  check('titles are bold', info.titles.every(t => parseInt(t.fw) >= 600), info.titles.map(t => `${t.t}:${t.fw}`).join(' '));
  check('"8 workouts done, goal 4" shows "4 of 4 workouts" (never "8 of 4")', info.week === '4 of 4 workouts', info.week);
  check('week dots: 4 dots, all active (accent) when the goal is met', info.dots.length === 4 && info.dots.every(d => d.on && rgb(d.bg) === 'rgb(46,125,255)'), JSON.stringify(info.dots.map(d => d.on)));
  check('ONE accent colour: form bar uses it', rgb(info.fill) === 'rgb(46,125,255)', info.fill);
  check('content clears the floating tab bar (scroll bottom padding >= safe area + 49 + 24)', info.scrollPad >= 34 + 49 + 24 - 1, `${info.scrollPad.toFixed(0)}pt`);
  console.log(`      after: ${info.allShadows} elements still carry any box-shadow (the artboard's own sheets/pickers/orb, not cards)`);
  await browser.close();

  // ── goal / done logic ──
  for (const [done, goal, want] of [[2, 4, '2 of 4 workouts'], [8, 4, '4 of 4 workouts'], [3, 6, '3 of 6 workouts'], [0, 3, '0 of 3 workouts']]) {
    const sess = Array.from({ length: done }, (_, i) => ({ ts: now - i * 60000, exerciseId: 'shoulderPress', displayName: 'Shoulder Press', reps: 5, goodReps: 5, pct: 90, formChecked: true }));
    plan.profile.daysPerWeek = goal;
    const r = await open(true, sess);
    const w = await r.page.evaluate(() => { const e = [...document.querySelectorAll('div,span')].filter(d => /^\d+ of \d+ workouts$/.test((d.textContent || '').trim())); return e.length ? e[e.length - 1].textContent.trim() : null; });
    const dots = await r.page.evaluate(() => [...document.querySelectorAll('[data-hc="dot-on"],[data-hc="dot-off"]')].filter(d => getComputedStyle(d).display !== 'none').map(d => d.getAttribute('data-hc') === 'dot-on'));
    check(`${done} done / goal ${goal} -> "${want}" and ${Math.min(done, goal)} of ${goal} dots lit`, w === want && dots.length === goal && dots.filter(Boolean).length === Math.min(done, goal), `${w} dots=${dots.map(Number).join('')}`);
    await r.browser.close();
  }
  plan.profile.daysPerWeek = 4;

  // ── interactive logic still works ──
  {
    const { browser, page, msgs } = await open(true, sessions);
    const click = (sel) => page.evaluate((s) => { const e = typeof s === 'string' ? document.querySelector(s) : null; if (e) e.click(); return !!e; }, sel);
    await page.evaluate(() => [...document.querySelectorAll('span,div')].filter(d => d.textContent.trim() === 'Start workout').pop().click());
    check('Start workout still posts "start"', msgs.some(m => m.type === 'start'));
    await click('a[href="Cue.dc.html"]');
    check('Chat with Cue still posts "cue"', msgs.some(m => m.type === 'cue'));
    await click('a[href="Progress.dc.html"]');
    check('Recent Workouts header still posts "progress"', msgs.some(m => m.type === 'progress'));
    await page.evaluate(() => document.querySelector('a[href="Workout Recap v2.dc.html"]').click());
    check('a recent workout card still posts "recap" with its ts', msgs.some(m => m.type === 'recap' && m.ts));
    // the artboard's own sheets: energy picker + edit sheet
    await page.evaluate(() => document.querySelector('[data-hc="pill-sub"]').closest('[data-hc="pill"]').click());
    await page.waitForTimeout(400);
    const picker = await page.evaluate(() => /Feeling strong|Low energy|Tired|Great|Normal/i.test(document.body.innerText) && !!document.querySelector('[style*="width: 206px"]'));
    check("the Energy pill still opens the artboard's own picker", picker);
    await page.evaluate(() => document.querySelector('[style*="position: absolute; inset: 0; z-index: 30"]')?.click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('a[aria-label="Edit workout"]').click());
    await page.waitForTimeout(500);
    const edit = await page.evaluate(() => !!document.querySelector('[style*="max-height: 620px"]'));
    check("the edit (pencil) button still opens the artboard's own edit sheet", edit);
    await page.screenshot({ path: path.join(ROOT, '.scratch', 'home-edit-sheet.png') });
    await browser.close();
  }

  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
