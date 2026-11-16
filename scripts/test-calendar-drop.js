#!/usr/bin/env node
/**
 * scripts/test-calendar-drop.js
 * Home's calendar (components/CalendarSheet.tsx), rendered with react-native-web in Chromium at phone size (390x844) over a busy page that
 * looks like Home. The phone screenshot showed the real Liquid Glass letting the pills, "Today" and the workout card show through the
 * calendar. Liquid Glass is replaced here by a FULLY CLEAR layer (the worst case), so what is measured is what the calendar itself does:
 * a near-solid base under the glass, the card inside the screen, hanging from the arrow, nothing of the page showing through, 6 rows at most.
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

const ClearGlass = ({ style }) => h(RNW.View, { style: [style, { backgroundColor: 'rgba(255,255,255,0)' }], testID: 'clear-glass' });
const FAKE = {
  'react-native': new Proxy(RNW, { get: (t, k) => (k === 'useWindowDimensions' ? () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }) : t[k]) }),
  react: React,
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 62, bottom: 34, left: 0, right: 0 }) },
  'expo-symbols': { SymbolView: ({ style }) => h(RNW.View, { style }) },
};
const prev = Module._load;
Module._load = function (r) {
  if (FAKE[r]) return FAKE[r];
  if (/\/LiquidGlass$/.test(r)) return { __esModule: true, default: ClearGlass };
  return prev.apply(this, arguments);
};

(async () => {
  const Cal = require('../components/CalendarSheet.tsx').default;
  const browser = await chromium.launch();
  const dir = path.join(__dirname, '..', '.scratch'); fs.mkdirSync(dir, { recursive: true });
  const stamps = [Date.now(), Date.now() - 86400000 * 3, Date.now() - 86400000 * 10];
  // a busy page behind it, like Home: big text where the calendar will sit
  const Behind = () => h(RNW.View, { style: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#eeeef1' } },
    h(RNW.Text, { style: { position: 'absolute', left: 26, top: 130, fontSize: 40, fontWeight: '800', color: '#111114' } }, 'Sunday, Nov 15'),
    h(RNW.View, { style: { position: 'absolute', left: 14, top: 222, width: 362, height: 50, borderRadius: 25, backgroundColor: '#fff' } }, h(RNW.Text, { style: { fontSize: 20, fontWeight: '700', color: '#111', margin: 14 } }, 'Energy Feeling strong')),
    h(RNW.Text, { style: { position: 'absolute', left: 26, top: 300, fontSize: 36, fontWeight: '800', color: '#111114' } }, 'Today'),
    h(RNW.View, { style: { position: 'absolute', left: 14, top: 360, width: 362, height: 420, borderRadius: 28, backgroundColor: '#fff' } }, h(RNW.Text, { style: { fontSize: 50, fontWeight: '800', color: '#000', margin: 40 } }, 'My workout 8888 8888')));
  const shoot = async (open, file) => {
    const { AppRegistry } = RNW;
    const tree = h(RNW.View, { style: { flex: 1 } }, h(Behind), h(Cal, { open, onClose: () => {}, timestamps: stamps, anchor: { top: 205, cx: 296 } }));
    AppRegistry.registerComponent('App', () => () => tree);
    const { element, getStyleElement } = AppRegistry.getApplication('App');
    const css = renderToString(getStyleElement()), html = renderToString(element);
    fs.writeFileSync(file + '.html', `<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=390"><style>html,body,#root{margin:0;height:100%;} body{overflow:hidden;font-family:-apple-system,Helvetica,Arial}</style>${css}</head><body><div id="root" style="display:flex;height:100%">${html}</div></body></html>`);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(file + '.html').href); await page.waitForTimeout(300);
    await page.screenshot({ path: file + '.png' });
    return page;
  };
  const p = await shoot(true, path.join(dir, 'cal-open'));
  const m = await p.evaluate(() => {
    const card = document.querySelector('[data-testid="calendar-drop"]'); if (!card) return null;
    const r = card.getBoundingClientRect(), base = document.querySelector('[data-testid="calendar-base"]');
    if (!base) { const spots0 = [[60, 232], [60, 330], [120, 420], [200, 480], [150, 500]].map(([x, y]) => { const el = document.elementFromPoint(x, y); return card.contains(el) || el === card; }); const days0 = [...card.querySelectorAll('div')].filter((d) => /^\d{1,2}$/.test((d.textContent || '').trim()) && d.children.length === 0).length; return { r: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], vw: innerWidth, vh: innerHeight, alpha: null, spots: spots0, days: days0, text: card.innerText.split(String.fromCharCode(10)).join(' | ').slice(0, 90), glassBelowBase: false }; }
    const bg = getComputedStyle(base).backgroundColor, a = bg.startsWith('rgba') ? parseFloat(bg.split(',')[3]) : 1;
    // what is on top at the spots where the page's own text sits (the card must cover them)
    const spots = [[60, 232], [60, 330], [120, 420], [200, 480], [150, 500]].map(([x, y]) => { const el = document.elementFromPoint(x, y); return card.contains(el) || el === card; });
    const days = [...card.querySelectorAll('div')].filter((d) => /^\d{1,2}$/.test((d.textContent || '').trim()) && d.children.length === 0).length;
    return { r: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], vw: innerWidth, vh: innerHeight, alpha: a, spots, days, text: card.innerText.replace(/\n+/g, ' | ').slice(0, 90), glassBelowBase: (() => { const kids = [...base.parentElement.children]; return kids.indexOf(base) < kids.findIndex((k) => k.getAttribute('data-testid') === 'clear-glass'); })() };
  });
  console.log('      open:', JSON.stringify(m));
  check('1: the calendar is drawn at phone size, inside the screen (14px each side), hanging just under the date (top ~211)', m && m.r[0] === 14 && m.r[2] === 362 && m.r[1] >= 205 && m.r[1] <= 225 && m.r[1] + m.r[3] < m.vh - 150, JSON.stringify(m && m.r));
  const csrc = fs.readFileSync(path.join(__dirname, '..', 'components', 'CalendarSheet.tsx'), 'utf8'), bsrc = fs.readFileSync(path.join(__dirname, '..', 'components', 'GlassTabBar.tsx'), 'utf8');
  const glassProps = (src, re) => { const m = re.exec(src); return m ? { variant: /variant="(\w+)"/.exec(m[0])[1], scheme: /colorScheme="(\w+)"/.exec(m[0])[1], fallback: /fallbackColor="([^"]+)"/.exec(m[0])[1], tint: /tintColor=/.test(m[0]) } : null; };
  const calG = glassProps(csrc, /<LiquidGlass radius=\{28\}[^>]*>/), barG = glassProps(bsrc, /<LiquidGlass radius=\{TAB_BAR_H \/ 2\}[^>]*>/);
  check('1: the calendar uses the EXACT Liquid Glass settings of the tab bar (same component, variant "regular", colour scheme "light", same fallback colour), with no tint', !!calG && !!barG && calG.variant === barG.variant && calG.scheme === barG.scheme && calG.fallback === barG.fallback && !calG.tint, JSON.stringify([calG, barG]));
  check('1: NO white base and NO frost: there is no base layer in the card and no white tint or blur layer anywhere (the glass itself softens what is behind)', m && m.glassBelowBase === false && !/calendar-base|s\.base|base:/.test(csrc) && !/tintColor="rgba\(255/.test(csrc) && !/BlurView|backdropFilter/.test(csrc), JSON.stringify(m && [m.glassBelowBase]));
  const fonts = await p.evaluate(() => { const card = document.querySelector('[data-testid="calendar-drop"]'); const t = [...card.querySelectorAll('div')].filter((d) => d.children.length === 0 && d.textContent.trim().length > 0); const fam = [...new Set(t.map((d) => getComputedStyle(d).fontFamily.split(',')[0].replace(/["']/g, '')))]; return { fam, weights: [...new Set(t.map((d) => getComputedStyle(d).fontWeight))], colors: [...new Set(t.map((d) => getComputedStyle(d).color))] }; });
  check('1: text is the system font (no custom font family; SF Pro on the phone), clean weights 500 to 700, dark text for contrast', /fontFamily: SYS/.test(csrc) && /Platform\.select\(\{ ios: 'System'/.test(csrc) && !/PlusJakarta|Bricolage/.test(csrc) && !/fontWeight: '800'|fontWeight: '900'/.test(csrc) && /const INK = '#111114'/.test(csrc), JSON.stringify(fonts));
  const pop = await p.evaluate(() => {
    const card = document.querySelector('[data-testid="calendar-drop"]'), caret = document.querySelector('[data-testid="calendar-caret"]'), outside = document.querySelector('[data-testid="calendar-outside"]');
    const cr = card.getBoundingClientRect(), kr = caret.getBoundingClientRect();
    return { caretCx: Math.round(kr.left + kr.width / 2), caretTop: Math.round(kr.top), cardTop: Math.round(cr.top), outsideBg: getComputedStyle(outside).backgroundColor, outsideTop: Math.round(outside.getBoundingClientRect().top), dimmed: [...document.querySelectorAll('div')].filter((d) => /rgba\(17, 17, 20, 0\.[0-9]+\)/.test(getComputedStyle(d).backgroundColor) && d.getBoundingClientRect().height > 300).length };
  });
  check('1: a little pointer sits on the top edge, centred under the date arrow (x 296), with its tip above the card', Math.abs(pop.caretCx - 296) <= 2 && pop.caretTop < pop.cardTop, JSON.stringify(pop));
  check('1: NO dim and NO blur on the rest of the screen: the layer that catches an outside tap is fully transparent and nothing big is tinted', /rgba\(0, 0, 0, 0\)|transparent/.test(pop.outsideBg) && pop.dimmed === 0, JSON.stringify(pop));
  const src = fs.readFileSync(path.join(__dirname, '..', 'components', 'CalendarSheet.tsx'), 'utf8');
  check('1: it opens and closes fast (about 200ms / 150ms) with the native driver', /CAL_OPEN_MS = 200/.test(src) && /CAL_CLOSE_MS = 150/.test(src) && !/useNativeDriver: false/.test(src) && !/<Modal/.test(src) && /@callstack|LiquidGlass/.test(src));
  check('1: the card (not the page) is what you touch and see at every spot where the page had text', m && m.spots.every(Boolean), JSON.stringify(m && m.spots));
  check('1: the month, "days trained" line and all 30 days of November are there', m && /\d+ days? trained|No workouts/.test(m.text) && m.days >= 28, m && m.text);
  await p.close();
  const c = await shoot(false, path.join(dir, 'cal-closed'));
  const gone = await c.evaluate(() => !document.querySelector('[data-testid="calendar-drop"]'));
  check('1: closed: nothing of the calendar is left on the page (no card, no dim layer)', gone);
  await c.close(); await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
