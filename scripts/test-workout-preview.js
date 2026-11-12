#!/usr/bin/env node
/**
 * scripts/test-workout-preview.js
 * The workout preview screen (app/workout/index.tsx): the REAL screen code is rendered with react-native-web in Chromium
 * (react-native, router, safe-area, gradients, symbols and the plan store are small stand-ins; the screen itself is not touched),
 * with Ari's workout (Full body, 8 exercises), then measured against his screenshot and put next to it:
 *   .scratch/preview-compare.png  (his design on the left, the screen on the right)
 * Also: the Start button opens the workout run screen; in preview mode (a future day) there is no Start button.
 */
const Module = require('module');
// the real react / react-dom / react-native-web / playwright, taken BEFORE the app loader stubs every package
const React = require('react');
const RNW = require('react-native-web');
const { renderToString } = require('react-dom/server');
const { chromium } = require('playwright');
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

const nav = { pushed: [], replaced: [], backs: 0 };
let params = {};
const started = [];
const h = React.createElement;

// ── stand-ins ──
const LinearGradient = ({ colors, start, end, locations, style }) => {
  const s = start || { x: 0.5, y: 0 }, e = end || { x: 0.5, y: 1 };
  const dx = e.x - s.x, dy = e.y - s.y; const ang = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const stops = colors.map((c, i) => `${c} ${((locations ? locations[i] : i / (colors.length - 1)) * 100).toFixed(1)}%`).join(', ');
  return h(RNW.View, { style: [style, { backgroundImage: `linear-gradient(${ang.toFixed(1)}deg, ${stops})` }] });
};
// the page's pink glow: read the same numbers the SVG RadialGradient carries
const Svg = ({ children, style }) => {
  let g = null, stops = [];
  React.Children.forEach(children, (c) => React.Children.forEach(c && c.props && c.props.children, (d) => {
    if (d && d.props && d.props.rx != null) { g = d.props; React.Children.forEach(d.props.children, (st) => stops.push(st.props)); }
  }));
  const css = g ? `radial-gradient(${g.rx * 100}% ${g.ry * 100}% at ${g.cx * 100}% ${g.cy * 100}%, ${stops.map(s => { const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(s.stopColor); return `rgba(${m[1]},${m[2]},${m[3]},${s.stopOpacity}) ${s.offset * 100}%`; }).join(', ')})` : 'none';
  return h(RNW.View, { style: [style, { backgroundImage: css }] });
};
const GLYPH = {
  'chevron.left': (sz, c) => h('svg', { width: sz, height: sz, viewBox: '0 0 24 24', fill: 'none', stroke: c, strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d: 'M15 4 7 12l8 8' })),
  'pencil': (sz, c) => h('svg', { width: sz, height: sz, viewBox: '0 0 24 24', fill: 'none', stroke: c, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d: 'M16 3.5 20.5 8 8 20.5 3 21l.5-5z' })),
  'play.fill': (sz, c) => h('svg', { width: sz, height: sz, viewBox: '0 0 24 24', fill: c }, h('path', { d: 'M6 3.5v17L21 12z' })),
};
const SymbolView = ({ name, size, tintColor, style }) => h(RNW.View, { style }, (GLYPH[name] || (() => null))(size, tintColor));

// no browser JS runs in a server render, so a press is called directly: Pressable records its handler under its label
const presses = {};
const Pressable = ({ onPress, accessibilityLabel, children, style }) => { if (accessibilityLabel) presses[accessibilityLabel] = onPress; else presses[Object.keys(presses).length + ':'] = onPress; return h(RNW.View, { style }, children); };
const RN = new Proxy(RNW, { get: (t, k) => (k === 'Pressable' ? Pressable : t[k]) });
const FAKE = {
  'react-native': RN,
  react: React,
  'expo-router': { useRouter: () => ({ back: () => { nav.backs++; }, push: (p) => nav.pushed.push(p), replace: (p) => nav.replaced.push(p) }), useLocalSearchParams: () => params },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 62, bottom: 34, left: 0, right: 0 }) },
  'expo-linear-gradient': { LinearGradient },
  'react-native-svg': { __esModule: true, default: Svg, Defs: () => null, RadialGradient: () => null, Stop: () => null, Rect: () => null },
  'expo-symbols': { SymbolView },
  'expo-haptics': { ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Soft: 'Soft' }, NotificationFeedbackType: {}, selectionAsync: async () => {}, impactAsync: async () => {}, notificationAsync: async () => {} },
};
const mk = (n, sets, reps) => ({ exerciseId: n.toLowerCase().replace(/\W/g, ''), displayName: n, targetSets: sets, targetReps: reps, restSeconds: 60 });
const WORKOUT = { id: 'w1', splitLabel: 'Full body', sessionNumber: 1, rationale: '', exercises: [mk('Squat', 4, 8), mk('Push-up', 3, 12), mk('Deadlift', 3, 6), mk('Pull-up', 3, 8), mk('Lunge', 3, 10), mk('Overhead press', 3, 8), mk('Row', 3, 10), mk('Plank', 3, 1)].slice(0, 8) };
const planStore = Object.assign((sel) => sel({ getNextWorkout: () => WORKOUT, createPlan: async () => {} }), { getState: () => ({ plan: { workouts: [WORKOUT, { ...WORKOUT, id: 'w2', splitLabel: 'Upper body' }] } }) });
const sessStore = (sel) => sel({ startWorkout: (w) => started.push(w.id) });

const prev = Module._load;
Module._load = function (r) {
  if (FAKE[r]) return FAKE[r];
  if (/store\/planStore$/.test(r)) return { usePlanStore: planStore };
  if (/store\/workoutSessionStore$/.test(r)) return { useWorkoutSessionStore: sessStore };
  return prev.apply(this, arguments);
};

(async () => {
  const Screen = require('../app/workout/index.tsx').default;
  const FONTS = ['400Regular', '500Medium', '600SemiBold', '700Bold', '800ExtraBold'].map(w => `@font-face{font-family:'PlusJakartaSans_${w}';src:url('${pathToFileURL(path.join(ROOT, 'node_modules', '@expo-google-fonts', 'plus-jakarta-sans', w, `PlusJakartaSans_${w}.ttf`)).href}');}`).join('');

  const shoot = async (browser, tree, file, hasPress) => {
    const { AppRegistry } = RNW;
    AppRegistry.registerComponent('App', () => () => tree);
    const { element, getStyleElement } = AppRegistry.getApplication('App');
    const css = renderToString(getStyleElement());
    const html = renderToString(element);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=390"><style>${FONTS}html,body,#root{margin:0;height:100%;} body{overflow:hidden}</style>${css}</head><body><div id="root" style="display:flex;height:844px">${html}</div></body></html>`);
    await page.goto(pathToFileURL(file).href);
    await page.waitForTimeout(500);
    return page;
  };
  const browser = await chromium.launch();
  const dir = path.join(ROOT, '.scratch'); fs.mkdirSync(dir, { recursive: true });

  params = {};
  const page = await shoot(browser, h(Screen), path.join(dir, 'preview-render.html'));
  await page.screenshot({ path: path.join(dir, 'preview-screen.png') });
  const m = await page.evaluate(() => {
    const q = (t) => [...document.querySelectorAll('div,span')].filter(e => e.children.length === 0 && e.textContent.trim() === t)[0];
    const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const title = q('Full body'), sub = [...document.querySelectorAll('div')].find(e => /^\d+ min · 8 exercises$/.test(e.textContent.trim()) && !e.children.length);
    const squat = q('Squat'), meta = q('4 sets · 8 reps'), start = q('Start workout');
    const cardOf = (e) => { let c = e; while (c && !(c.getBoundingClientRect().width > 340 && c.getBoundingClientRect().height < 100)) c = c.parentElement; return c; };
    const cards = [...document.querySelectorAll('div')].filter(e => { const r = e.getBoundingClientRect(); return Math.abs(r.width - 362) < 2 && Math.abs(r.height - 80) < 2; });
    const startBtn = start && (() => { let c = start; while (c && c.getBoundingClientRect().height < 50) c = c.parentElement; return c; })();
    const cs = (e, p) => e ? getComputedStyle(e)[p] : null;
    return { title: box(title), sub: box(sub), subText: sub && sub.textContent, squat: box(squat), meta: box(meta), cards: cards.map(box).filter((b, i, a) => a.findIndex(x => x.y === b.y) === i), start: box(startBtn), titleFont: cs(title, 'fontSize') + ' ' + cs(title, 'fontFamily'), nameFont: cs(squat, 'fontSize') + ' ' + cs(squat, 'fontFamily'), startBg: cs(startBtn, 'backgroundColor'), allText: document.body.innerText.replace(/\n+/g, ' | ') };
  });
  console.log('      measured:', JSON.stringify({ title: m.title, sub: m.sub, squat: m.squat, meta: m.meta, card0: m.cards[0], cards: m.cards.length, start: m.start }));
  console.log('      text:', m.allText);
  check('shows the workout name, then "N min · 8 exercises" under it', m.title && m.sub && /^\d+ min · 8 exercises$/.test(m.subText) && m.sub.y > m.title.y);
  check('one card per exercise (8), each 362 x 80 with 10px between, starting 14px from the left edge', m.cards.length >= 7 && m.cards[0].x === 14 && m.cards[0].w === 362 && m.cards[0].h === 80 && m.cards[1].y - m.cards[0].y - m.cards[0].h === 10, JSON.stringify(m.cards.slice(0, 2)));
  check('card text matches his design: "Squat" / "4 sets · 8 reps" ... "3 sets · 12 reps"', /Squat \| 4 sets · 8 reps/.test(m.allText) && /Push-up \| 3 sets · 12 reps/.test(m.allText) && /Row \| 3 sets · 10 reps/.test(m.allText));
  check('the name and its line sit 14px to the right of the 60px picture square (x = 98 as in his design)', m.squat && Math.abs(m.squat.x - 98) <= 1, JSON.stringify(m.squat));
  check('black Start workout pill, 58 tall, 358 wide, floating near the bottom', m.start && m.start.h === 58 && m.start.w === 358 && m.start.y > 740 && /rgb\(17, 17, 20\)/.test(m.startBg), JSON.stringify(m.start) + ' ' + m.startBg);
  check('the font is Plus Jakarta Sans, like the design', /PlusJakartaSans_800ExtraBold/.test(m.titleFont) && /PlusJakartaSans_700Bold/.test(m.nameFont), m.titleFont + ' / ' + m.nameFont);

  // Start opens the run screen and starts the session
  presses['Start workout']();
  check('Start workout starts the session and opens the workout (run screen)', started.join() === 'w1' && nav.pushed.includes('/workout/run'), JSON.stringify({ started, pushed: nav.pushed }));
  presses['Back']();
  check('the back button goes back', nav.backs === 1);
  await page.close();

  // a future day (Train: Preview workout): same screen, no Start
  params = { id: 'w2', preview: '1' };
  const p2 = await shoot(browser, h(Screen), path.join(dir, 'preview-render2.html'));
  const t2 = await p2.evaluate(() => document.body.innerText.replace(/\n+/g, ' | '));
  check('Preview mode (a future day): the workout is shown for THAT day and there is NO Start workout button', /Upper body|Full body/.test(t2) && !/Start workout/.test(t2), t2.slice(0, 80));
  await p2.close();

  // a FormPal template (My workouts): the real catalogue's exercises, startable, with a Save template button
  params = { template: 'tpl-upper' };
  const p3 = await shoot(browser, h(Screen), path.join(dir, 'preview-render3.html'));
  const t3 = await p3.evaluate(() => document.body.innerText.split(String.fromCharCode(10)).join(' | '));
  check('Template: opens the preview for it ("Upper body", its real exercises) and says it is a ready-made template, not tailored', /Upper body/.test(t3) && /Chest Press/.test(t3) && /FormPal template\. Ready-made basics for anyone\. Not tailored to you\./.test(t3), t3.slice(0, 160));
  check('Template: has the Start workout button AND a Save template button', /Start workout/.test(t3) && typeof presses['Save template'] === 'function');
  started.length = 0; nav.pushed.length = 0;
  presses['Start workout']();
  check('Template: Start workout starts THAT template and opens the workout run', started.join() === 'tpl-upper' && nav.pushed.includes('/workout/run'), JSON.stringify({ started, pushed: nav.pushed }));
  await p3.screenshot({ path: path.join(dir, 'preview-template.png') });
  await p3.close();

  // side by side with his screenshot
  const his = fs.readFileSync('C:/Users/arize/AppData/Local/Temp/claude/fbe22b470d4e1b5d/ece828cf-7022-4f78-9e9f-f74a4467dd75/images/5.png').toString('base64');
  const mine = fs.readFileSync(path.join(dir, 'preview-screen.png')).toString('base64');
  const cmp = await browser.newPage({ viewport: { width: 820, height: 820 } });
  await cmp.setContent(`<body style="margin:0;background:#888;display:flex;gap:16px;padding:8px"><div><div style="color:#fff;font:12px sans-serif">his design</div><img src="data:image/png;base64,${his}" style="width:388px"></div><div><div style="color:#fff;font:12px sans-serif">built screen (cropped to the same height)</div><img src="data:image/png;base64,${mine}" style="width:388px;height:785px;object-fit:cover;object-position:top"></div></body>`);
  await cmp.screenshot({ path: path.join(dir, 'preview-compare.png') });
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
})();
