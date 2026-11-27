#!/usr/bin/env node
/**
 * scripts/test-calendar-drop.js  (round 11)
 * Home's calendar (components/CalendarSheet.tsx) is a POPOVER attached to the date's arrow, not a panel from the top of the screen. Rendered with
 * react-native-web in Chromium at phone size (390x844) over a page that looks like Home. Liquid Glass is replaced by a fully clear layer (the worst case).
 * What is measured: where it hangs (right under the arrow, with a pointer at the arrow's x), its size, its font, that it is parked off-screen when closed, that
 * it uses no opacity anywhere above the glass, and that it opens without Home re-rendering (an imperative handle, the animation started in the call itself).
 * Screenshot: .scratch/cal-popover.png
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

const ClearGlass = ({ style, children }) => h(RNW.View, { style: [style, { backgroundColor: 'rgba(255,255,255,0)' }], testID: 'clear-glass' }, children);
const FAKE = {
  'react-native': new Proxy(RNW, { get: (t, k) => (k === 'useWindowDimensions' ? () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }) : t[k]) }),
  react: React,
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
  const dir = path.join(ROOT, '.scratch'); fs.mkdirSync(dir, { recursive: true });
  const stamps = [Date.now(), Date.now() - 86400000 * 3, Date.now() - 86400000 * 10];
  const Behind = () => h(RNW.View, { style: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#eeeef1' } },
    h(RNW.Text, { style: { position: 'absolute', left: 22, top: 118, fontSize: 24, fontWeight: '800', color: '#111114' } }, 'Wednesday, November 25  v'),
    h(RNW.View, { style: { position: 'absolute', left: 14, top: 222, width: 362, height: 50, borderRadius: 25, backgroundColor: '#fff' } }),
    h(RNW.Text, { style: { position: 'absolute', left: 26, top: 300, fontSize: 36, fontWeight: '800', color: '#111114' } }, 'Today'));
  const csrc = read('components/CalendarSheet.tsx');
  const tree = h(RNW.View, { style: { flex: 1 } }, h(Behind), h(Cal, { timestamps: stamps }));
  const { AppRegistry } = RNW;
  AppRegistry.registerComponent('App', () => () => tree);
  const { element, getStyleElement } = AppRegistry.getApplication('App');
  const css = renderToString(getStyleElement()), html = renderToString(element);
  const file = path.join(dir, 'cal-popover.html');
  fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=390"><style>html,body,#root{margin:0;height:100%;} body{overflow:hidden;font-family:-apple-system,Helvetica,Arial}</style>${css}</head><body><div id="root" style="display:flex;height:100%">${html}</div></body></html>`);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(file).href); await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="calendar-drop"]'), caret = document.querySelector('[data-testid="calendar-caret"]');
    const cs = getComputedStyle(card);
    // the layout place (a transform does not change it): where it hangs when it is open
    const title = [...card.querySelectorAll('div')].find((d) => d.children.length === 0 && /^[A-Z][a-z]+ 20\d\d$/.test(d.textContent.trim()));
    const days = [...card.querySelectorAll('div')].filter((d) => /^\d{1,2}$/.test((d.textContent || '').trim()) && d.children.length === 0).length;
    const ts = cs.transform; const m6 = /matrix\(([^)]+)\)/.exec(ts); const ty = m6 ? parseFloat(m6[1].split(',')[5]) : null;
    const tc = getComputedStyle(title);
    return { top: card.offsetTop, left: card.offsetLeft, w: card.offsetWidth, h: card.offsetHeight, caretCx: caret.offsetLeft + caret.offsetWidth / 2, caretTop: caret.offsetTop, ty, titleFam: tc.fontFamily, titleW: tc.fontWeight, titleSize: tc.fontSize, days, origin: cs.transformOrigin, outsidePe: getComputedStyle(document.querySelector('[data-testid="calendar-outside"]')).pointerEvents };
  });
  console.log('      ', JSON.stringify(m));
  check('1: it is a POPOVER, not a panel from the top: it hangs under the date block (about 12px below the arrow\'s row), 14px in from each side, a normal card size (not full height)', m.top > 150 && m.top < 260 && m.left === 14 && m.w === 362 && m.h > 300 && m.h < 460, JSON.stringify([m.top, m.left, m.w, m.h]));
  check('1: a small pointer sits on its top edge, centred on the arrow (the arrow is at x 250 here: 250 - 14 = 236 inside the card)', Math.abs(m.caretCx - 236) <= 1 && m.caretTop < 0, JSON.stringify([m.caretCx, m.caretTop]));
  check('1: the month title is in the app\'s normal font (no custom family: iOS shows SF Pro) at the weight of the other titles (600)', /^(-apple-system|system-ui|BlinkMacSystemFont|Helvetica|Arial|"?Segoe|sans-serif)/i.test(m.titleFam) || !/Jakarta|Bricolage|Plus/i.test(m.titleFam), m.titleFam);
  check('1: the title weight is 600, 20px', m.titleW === '600' && m.titleSize === '20px', JSON.stringify([m.titleW, m.titleSize]));
  check('1: the month, the "days trained" line and all days are there', m.days >= 28);
  check('1: closed: it is parked far above the screen (a transform, not opacity) and touches go straight through', m.ty <= -2000 && m.outsidePe === 'none', JSON.stringify([m.ty, m.outsidePe]));
  check('1: transform origin at the pointer, so it grows out of the arrow', /px 0px$/.test(m.origin), m.origin);
  // the same calendar as it looks when open: take the park off
  await page.evaluate(() => { const c = document.querySelector('[data-testid="calendar-drop"]'); c.style.transform = 'none'; });
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(dir, 'cal-popover.png'), clip: { x: 0, y: 90, width: 390, height: 520 } });
  const shot = await page.evaluate(() => { const r = document.querySelector('[data-testid="calendar-drop"]').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
  check('1: open, it is a card in the upper part of the page, nowhere near the top edge of the screen', shot.top > 150 && shot.bottom < 700 && shot.left === 14 && shot.right === 376, JSON.stringify(shot));
  // source
  check('1: LIGHT real glass (the native view through LiquidGlass, light scheme, no dark tint) with a soft shadow; no blur or imitation', /colorScheme: 'light'/.test(csrc) && /boxShadow: '0 18px 34px/.test(csrc) && !/BlurView|backdropFilter|GlassSurface|LinearGradient|StandardGlass/.test(csrc) && !/<Modal/.test(csrc));
  const popStyle = /style=\{\[s\.pop, .*\]\}/.exec(csrc)[0], popCss = /pop: \{.*\}/.exec(csrc)[0];
  check('1: NO opacity anywhere above the glass (a faded parent turns native glass flat): the popover moves, it never fades', !/opacity/.test(popStyle) && !/opacity|overflow/.test(popCss) && /translateY: ty/.test(popStyle));
  const idx = read('app/(tabs)/index.tsx');
  check('2: INSTANT: Home holds it by a ref and calls toggle(): Home does not re-render to open it', /const calRef = useRef<CalendarHandle>\(null\)/.test(idx) && !/setCalOpen|const \[calOpen/.test(idx) && /calRef\.current\?\.toggle\(/.test(idx));
  const tg = csrc.slice(csrc.indexOf('toggle: (a, tapAt) => {'), csrc.indexOf('prime: (a) =>'));
  check('round 13: the grow starts FIRST in toggle (before any state change) and never waits a frame (the first open used to wait one frame to move to the arrow)', tg.indexOf('play(1)') > 0 && tg.indexOf('play(1)') < tg.indexOf('setState(true)') && tg.indexOf('play(1)') < tg.indexOf('setYm(') && !/requestAnimationFrame\(\(\) => play/.test(csrc));
  check('round 13: the place is known before the first tap: the page reports the arrow at load (calendarAnchor) and Home hands it over (prime), so the first open is already in place', /type: 'calendarAnchor'/.test(read('lib/tabHeader.ts')) && /msg\.type === 'calendarAnchor'.*calRef\.current\?\.prime\(/.test(idx));
  check('round 13: the month grid is built only when the month changes (useMemo), not on open/close', /const month = useMemo\(\(\) => \(/.test(csrc) && /\[ym, weeks, monthCount, play, setState\]\)/.test(csrc) && /\{month\}/.test(csrc));
  check('round 13: the dev log for the phone: [CAL] open: tap->message, message->animation start, start->next frame, total', /\[CAL\] open: tap->message/.test(csrc) && /tapAt\)/.test(idx));
  check('round 12: it GROWS out of the arrow point: scale from 0.12 at the pointer (transform origin) to 1 with the month fading in, 250ms open / 180ms close, one native-driver animation, the value handed to the native side at mount, no layout measuring, no status bar change', /CAL_OPEN_MS = 250/.test(csrc) && /CAL_CLOSE_MS = 180/.test(csrc) && /CAL_START_SCALE = 0\.12/.test(csrc) && /outputRange: \[CAL_START_SCALE, 1\]/.test(csrc) && /<Animated\.View style=\{\{ opacity: fadeIn \}\}/.test(csrc) && /toValue: 0, duration: 0, useNativeDriver: true/.test(csrc) && !/onLayout/.test(csrc) && !/StatusBar/.test(csrc));
  check('round 12: the fade is on the month INSIDE the glass, never on a parent of the glass', csrc.indexOf('<Animated.View style={{ opacity: fadeIn }}') > csrc.indexOf('<LiquidGlass radius={RADIUS}'));
  check('2: the arrow on the page still flips (the chevron is told when it opens and closes) and leaving Home closes it', /window\.__fpChevron && window\.__fpChevron\(\$\{open\}\)/.test(idx) && /calRef\.current\?\.close\(\)/.test(idx));
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
