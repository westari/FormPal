#!/usr/bin/env node
/**
 * scripts/test-calendar-drop.js
 * Home's calendar (components/CalendarSheet.tsx, rebuilt 2026-11-22), rendered with react-native-web in Chromium at phone size (390x844)
 * over a busy page that looks like Home. Liquid Glass is replaced by a FULLY CLEAR layer (the worst case), so what is measured is what
 * the calendar itself does. Also checks the glass standard (components/StandardGlass.tsx) is exactly the Finish pill's glass.
 * Screenshots: .scratch/cal-open.png, .scratch/cal-closed.png
 */
const Module = require('module');
const React = require('react');
const RNW = require('react-native-web');
const { renderToString } = require('react-dom/server');
const { chromium } = require('playwright');
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const path = require('path'), fs = require('fs');
const { pathToFileURL } = require('url');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const h = React.createElement;
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');

const ClearGlass = ({ style, children }) => h(RNW.View, { style: [style, { backgroundColor: 'rgba(255,255,255,0)' }], testID: 'clear-glass' }, children); // (the real glass holds the month inside it)
const FAKE = {
  'react-native': new Proxy(RNW, { get: (t, k) => (k === 'useWindowDimensions' ? () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }) : t[k]) }),
  react: React,
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 62, bottom: 34, left: 0, right: 0 }) },
  'expo-symbols': { SymbolView: ({ style }) => h(RNW.View, { style }) },
  'expo-status-bar': { StatusBar: () => null },
};
const prev = Module._load;
Module._load = function (r) {
  if (FAKE[r]) return FAKE[r];
  if (/\/LiquidGlass$/.test(r)) return { __esModule: true, default: ClearGlass, LiquidGlassButton: ClearGlass };
  return prev.apply(this, arguments);
};

(async () => {
  const Cal = require('../components/CalendarSheet.tsx').default;
  const browser = await chromium.launch();
  const dir = path.join(ROOT, '.scratch'); fs.mkdirSync(dir, { recursive: true });
  const stamps = [Date.now(), Date.now() - 86400000 * 3, Date.now() - 86400000 * 10];
  const Behind = () => h(RNW.View, { style: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#eeeef1' } },
    h(RNW.Text, { style: { position: 'absolute', left: 26, top: 130, fontSize: 40, fontWeight: '800', color: '#111114' } }, 'Sunday, Nov 15'),
    h(RNW.View, { style: { position: 'absolute', left: 14, top: 222, width: 362, height: 50, borderRadius: 25, backgroundColor: '#fff' } }, h(RNW.Text, { style: { fontSize: 20, fontWeight: '700', color: '#111', margin: 14 } }, 'Energy Feeling strong')),
    h(RNW.Text, { style: { position: 'absolute', left: 26, top: 300, fontSize: 36, fontWeight: '800', color: '#111114' } }, 'Today'),
    h(RNW.View, { style: { position: 'absolute', left: 14, top: 360, width: 362, height: 420, borderRadius: 28, backgroundColor: '#fff' } }, h(RNW.Text, { style: { fontSize: 50, fontWeight: '800', color: '#000', margin: 40 } }, 'My workout 8888 8888')));
  const shoot = async (open, file) => {
    const { AppRegistry } = RNW;
    const tree = h(RNW.View, { style: { flex: 1 } }, h(Behind), h(Cal, { open, onClose: () => {}, timestamps: stamps }));
    AppRegistry.registerComponent('App', () => () => tree);
    const { element, getStyleElement } = AppRegistry.getApplication('App');
    const css = renderToString(getStyleElement()), html = renderToString(element);
    fs.writeFileSync(file + '.html', `<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=390"><style>html,body,#root{margin:0;height:100%;} body{overflow:hidden;font-family:-apple-system,Helvetica,Arial}</style>${css}</head><body><div id="root" style="display:flex;height:100%">${html}</div></body></html>`);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(file + '.html').href); await page.waitForTimeout(300);
    await page.screenshot({ path: file + '.png' });
    return page;
  };
  const csrc = read('components/CalendarSheet.tsx');
  const p = await shoot(true, path.join(dir, 'cal-open'));
  const m = await p.evaluate(() => {
    const card = document.querySelector('[data-testid="calendar-drop"]'); if (!card) return null;
    const r = card.getBoundingClientRect();
    const spots = [[60, 140], [60, 232], [60, 330], [300, 250], [200, 370]].map(([x, y]) => { const el = document.elementFromPoint(x, y); return card.contains(el) || el === card; });
    const days = [...card.querySelectorAll('div')].filter((d) => /^\d{1,2}$/.test((d.textContent || '').trim()) && d.children.length === 0).length;
    const outside = document.querySelector('[data-testid="calendar-outside"]');
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), w: Math.round(r.width), vw: innerWidth, vh: innerHeight, spots, days, text: card.innerText.replace(/\n+/g, ' | ').slice(0, 90), outsideBg: getComputedStyle(outside).backgroundColor, dimmed: [...document.querySelectorAll('div')].filter((d) => /rgba\(17, 17, 20, 0\.[0-9]+\)/.test(getComputedStyle(d).backgroundColor) && d.getBoundingClientRect().height > 300).length };
  });
  console.log('      open:', JSON.stringify(m));
  check('3: ONE panel hangs from the very top of the screen, full width, its top edge above the screen (only the bottom corners show), and ends well above the bottom', m && m.left === 0 && m.w === 390 && m.top < 0 && m.bottom > 300 && m.bottom < m.vh - 150, JSON.stringify(m && [m.left, m.w, m.top, m.bottom]));
  check('3: the panel (not the page) is what you touch and see at every spot where the page had text', m && m.spots.every(Boolean), JSON.stringify(m && m.spots));
  check('3: the month, the "days trained" line and all days of the month are there', m && /\d+ days? trained|No workouts/.test(m.text) && m.days >= 28, m && m.text);
  check('3: nothing is dimmed or blurred: the layer that catches an outside tap is transparent', m && /rgba\(0, 0, 0, 0\)|transparent/.test(m.outsideBg) && m.dimmed === 0, JSON.stringify(m && [m.outsideBg, m.dimmed]));
  // 1: the glass standard is the Finish pill's glass
  const sg = read('components/StandardGlass.tsx'), fc = read('app/formcheck.tsx');
  const finish = /<LiquidGlassButton[\s\S]{0,400}?<Text style=\{s\.finishTxt\}>Finish/.exec(fc);
  const fin = finish && { scheme: /colorScheme="(\w+)"/.exec(finish[0])[1], fallback: /fallbackColor="([^"]+)"/.exec(finish[0])[1], tint: /tintColor=/.test(finish[0]), variant: /variant=/.test(finish[0]) };
  const std = { scheme: /colorScheme: '(\w+)'/.exec(sg)[1], fallback: /fallbackColor: '([^']+)'/.exec(sg)[1], variant: /variant: '(\w+)'/.exec(sg)[1] };
  check('1: the glass standard is EXACTLY the Finish pill glass (same colour scheme, same fallback fill, "regular" variant = the LiquidGlass default, no tint)', !!fin && fin.scheme === std.scheme && fin.fallback === std.fallback && !fin.tint && !fin.variant && std.variant === 'regular', JSON.stringify([fin, std]));
  check('1: the standard has no tint option, so nothing can drift from the Finish look', !/tintColor: /.test(sg) && /'tintColor'/.test(sg));
  check('3 (round 10): the calendar panel is the native glass view in the LIGHT scheme (no dark tint), and uses no blur, no gradient imitation and no white base', /<LiquidGlass radius=\{RADIUS\}/.test(csrc) && /colorScheme: 'light'/.test(csrc) && !/BlurView|backdropFilter|GlassSurface|LinearGradient|StandardGlass/.test(csrc) && !/<Modal/.test(csrc));
  check('3 (round 10): dark text on the light glass, system font, and a soft shadow under the panel', /const INK = '#111114'/.test(csrc) && /Platform\.select\(\{ ios: 'System'/.test(csrc) && /boxShadow: '0 16px 32px/.test(csrc) && !/PlusJakarta|Bricolage/.test(csrc));
  check('3: it slides with the native driver (smooth), opens in about 340ms and closes in about 260ms', /CAL_OPEN_MS = 340/.test(csrc) && /CAL_CLOSE_MS = 260/.test(csrc) && !/useNativeDriver: false/.test(csrc));
  check('3: a tap on a day closes it, a tap outside closes it, the date tap toggles it (Home)', /onPress=\{c\.day != null \? onClose/.test(csrc) && /onPress=\{onClose\} accessibilityLabel="Close calendar"/.test(csrc) && /setCalOpen\(o => !o\)/.test(read('app/(tabs)/index.tsx')));
  check('3: right on the first open: the panel is always mounted (the native glass exists and has painted before it is opened), parked above the screen, and no parent fades or clips it (round 8)', !/WARM_MS|parkedWarm/.test(csrc) && /useRef\(new Animated\.Value\(open \? 1 : 0\)\)/.test(csrc) && !/opacity: /.test(/panel: \{[^}]*\}/.exec(csrc)[0]));
  await p.close();
  const c = await shoot(false, path.join(dir, 'cal-closed'));
  const hid = await c.evaluate(() => { const card = document.querySelector('[data-testid="calendar-drop"]'); const out = document.querySelector('[data-testid="calendar-outside"]'); const r = card && card.getBoundingClientRect(); return { there: !!card, bottom: r ? Math.round(r.bottom) : null, outPe: out ? getComputedStyle(out).pointerEvents : null, rootPe: card ? getComputedStyle(card.parentElement).pointerEvents : null }; });
  check('3: closed: the panel is built but parked ABOVE the screen (its bottom edge is off the top), and touches go straight through', hid.there && hid.bottom <= 0 && hid.outPe === 'none' && hid.rootPe === 'none', JSON.stringify(hid));
  await c.close();
  // today's circle: centred in its cell, the number exactly in the middle of the circle
  const o2 = await shoot(true, path.join(dir, 'cal-open2'));
  const circ = await o2.evaluate(() => {
    const card = document.querySelector('[data-testid="calendar-drop"]'); const today = card.querySelector('[data-testid="calendar-today"]');
    const t = [...today.querySelectorAll('div')].find((d) => d.children.length === 0 && /^\d+$/.test(d.textContent.trim())); const cell = today.parentElement;
    const rg = document.createRange(); rg.selectNodeContents(t); const rt = rg.getBoundingClientRect(), rw = today.getBoundingClientRect(), rc = cell.getBoundingClientRect();
    return { dx: (rt.left + rt.width / 2) - (rw.left + rw.width / 2), dy: (rt.top + rt.height / 2) - (rw.top + rw.height / 2), cx: (rw.left + rw.width / 2) - (rc.left + rc.width / 2), cy: (rw.top + rw.height / 2) - (rc.top + rc.height / 2), w: Math.round(rw.width), h: Math.round(rw.height) };
  });
  check('3: today is circled: a true circle (38 x 38), centred in its cell, the number exactly in its middle (within 1.5px)', circ.w === 38 && circ.h === 38 && Math.abs(circ.dx) <= 1.5 && Math.abs(circ.dy) <= 1.5 && Math.abs(circ.cx) <= 0.6 && Math.abs(circ.cy) <= 0.6, JSON.stringify(circ));
  await o2.close(); await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
