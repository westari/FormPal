#!/usr/bin/env node
/**
 * scripts/test-save-progress.js  (round 10, item 7)
 * "Save your progress" (round 11): a dark GYM screen (back wall, dumbbell rack, barbells, kettlebells; not space), the REAL FormPal logo, pill buttons
 * at the bottom (white Apple, grey email), footer links, a "Last used" tag on the button used last. Rendered with react-native-web in Chromium at
 * 390 x 844 (the sign-in code is replaced by stubs; the screen's own layout and drawing are the real ones). Screenshot: .scratch/save-progress.png
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

const noop = () => {};
// (react-native-web's Image preloads in the browser and shows nothing in a static render, so a plain <img> stands in for it)
const FakeImage = ({ source, style, testID }) => h('img', { src: source && source.uri, 'data-testid': testID, style: { objectFit: 'contain', ...RNW.StyleSheet.flatten(style) } });
const RN = new Proxy(RNW, { get: (t, k) => (k === 'useWindowDimensions' ? () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }) : k === 'Image' ? FakeImage : t[k]) });
const FAKE = {
  'react-native': RN, react: React,
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) },
  'expo-symbols': { SymbolView: ({ name, style }) => h(RNW.View, { style, 'data-symbol': name }) },
  'expo-apple-authentication': { signInAsync: noop, AppleAuthenticationScope: {} },
  '../../constants/supabase': { supabase: { auth: {} } },
  '../../lib/formpalSync': { saveOnboardingAnswersToCloud: noop, loadAllUserDataFromCloud: noop },
  '../../lib/planStorage': { savePlan: noop, saveProfile: noop },
  '../../lib/sessionLog': { SESSION_LOG_KEY: 'k' },
  '../../lib/haptics': { impactAsync: noop, selectionAsync: noop, ImpactFeedbackStyle: { Medium: 1 } },
  '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: () => Promise.resolve(null), setItem: () => Promise.resolve() } },
  // react-native-svg replaced by plain svg elements (the web build of the real library does not render in this setup); the screen's own drawing code is the real one
  'react-native-svg': (() => { const el = (tag) => ({ children, style, pointerEvents, ...p }) => h(tag, { ...p, style: tag === 'svg' ? { position: 'absolute', left: 0, top: 0 } : undefined }, children);
    return { __esModule: true, default: el('svg'), Defs: el('defs'), LinearGradient: el('linearGradient'), RadialGradient: el('radialGradient'), Stop: el('stop'), Rect: el('rect'), Circle: el('circle'), Ellipse: el('ellipse'), Path: el('path'), G: el('g'), Line: el('line') }; })(),
  '../../assets/images/formpal-logo.png': { uri: pathToFileURL(path.join(ROOT, 'assets', 'images', 'formpal-logo.png')).href },
  './OnbBackButton': { __esModule: true, default: ({ scheme }) => h(RNW.Text, { style: { width: 34, height: 34, fontSize: 1, color: '#0d0d11' } }, 'BACKBTN-' + scheme) },
};
const prev = Module._load;
Module._load = function (r) { if (FAKE[r]) return FAKE[r]; return prev.apply(this, arguments); };

(async () => {
  const Screen = require('../components/onboarding/SaveProgressScreen.tsx').default;
  const browser = await chromium.launch();
  const { AppRegistry } = RNW;
  AppRegistry.registerComponent('App', () => () => h(Screen, { topInset: 47, progress: 0.9, answers: {}, onAdvance: noop, onBack: noop }));
  const { element, getStyleElement } = AppRegistry.getApplication('App');
  const css = renderToString(getStyleElement()), html = renderToString(element);
  const file = path.join(ROOT, '.scratch', 'save-progress.html'); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=390"><style>html,body,#root{margin:0;height:100%;} body{overflow:hidden;font-family:-apple-system,Helvetica,Arial}</style>${css}</head><body><div id="root" style="display:flex;height:100%">${html}</div></body></html>`);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(file).href); await page.waitForTimeout(300);
  await page.evaluate(() => { document.querySelectorAll('div').forEach((d) => { if (d.style.opacity === '0') d.style.opacity = '1'; }); }); // (the screen fades in on a phone; show the end state)
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(ROOT, '.scratch', 'save-progress.png') });
  const m = await page.evaluate(() => {
    const txt = document.body.innerText.replace(/\s+/g, ' ');
    const find = (t) => [...document.querySelectorAll('div')].find((d) => d.children.length === 0 && d.textContent.trim() === t);
    const rect = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
    const btn = (t) => { const e = find(t); let p = e; for (let i = 0; i < 4 && p; i++, p = p.parentElement) { const cs = getComputedStyle(p); if (parseFloat(cs.borderTopLeftRadius) > 20 && p.getBoundingClientRect().height >= 50) return { r: rect(p), bg: cs.backgroundColor }; } return null; };
    const svg = document.querySelector('svg');
    const stars = svg ? [...svg.querySelectorAll('circle')].filter((c) => +c.getAttribute('r') < 2 && c.getAttribute('fill') === '#ffffff').length : 0;
    const rects = svg ? svg.querySelectorAll('rect').length : 0;
    const lg = document.querySelector('[data-testid="formpal-logo"]');
    return { txt, apple: btn('Continue with Apple'), email: btn('Continue with email'), logo: lg ? { ...rect(lg), nat: lg.naturalWidth } : null, rects, priv: rect(find('Privacy policy')), terms: rect(find('Terms of service')), stars, hasSvg: !!svg, root: [...document.querySelectorAll('div')].map((d) => getComputedStyle(d).backgroundColor).find((c) => c === 'rgb(12, 12, 16)') || 'none', back: (txt.match(/BACKBTN-(\w+)/) || [])[1] };
  });
  console.log('      ', JSON.stringify({ apple: m.apple && m.apple.r, email: m.email && m.email.r, logo: m.logo }));
  check('the background is a dark GYM drawing (a dumbbell rack, barbells, kettlebells, a floor), not space: many drawn shapes, a near-black base, no star field', m.hasSvg && m.rects >= 30 && m.root === 'rgb(12, 12, 16)' && m.stars < 5, JSON.stringify([m.hasSvg, m.rects, m.root, m.stars]));
  check('the logo is the REAL FormPal logo image (assets/images/formpal-logo.png, 132px), loaded, sitting a little below the middle and centred; no drawn placeholder or wordmark', !!m.logo && m.logo.nat === 1012 && Math.abs(m.logo.w - 132) < 1 && m.logo.t > 844 * 0.42 && m.logo.t < 844 * 0.56 && Math.abs((m.logo.l + m.logo.r) / 2 - 195) < 2 && !/FormPal/.test(m.txt.replace(/BACKBTN-\w+/, '')), JSON.stringify(m.logo));
  check('the buttons: "Continue with Apple" is white and "Continue with email" is the grey one, both full-width pills about 60px tall, apple above email', !!m.apple && !!m.email && m.apple.bg === 'rgb(255, 255, 255)' && /rgba\(255, 255, 255, 0\.14\)/.test(m.email.bg) && m.apple.r.h >= 56 && m.email.r.h >= 56 && m.apple.r.b < m.email.r.t && Math.abs(m.apple.r.w - 350) < 2, JSON.stringify([m.apple, m.email]));
  check('they sit at the bottom of the screen, with the footer links ("Privacy policy", "Terms of service") under them', m.email.r.b < m.priv.t && m.priv.t > 844 * 0.8 && m.terms.l > m.priv.r && m.terms.t === m.priv.t, JSON.stringify([m.email.r.b, m.priv, m.terms]));
  check('NO back button on the sign-in choices (it is only on the e-mail form), and no progress bar', m.back === undefined && !/BACKBTN/.test(m.txt));
  check('no Google button (Google sign-in is not built, a dead button is worse than none), and the old checkbox sentences are gone', !/Google/.test(m.txt) && !/I agree to FormPal|Send me tips/.test(m.txt));
  await browser.close();
  const src = read('components/onboarding/SaveProgressScreen.tsx');
  check('"Last used": the method used is remembered on the phone after a successful sign-in and shown as a small tag on that button', /LAST_SIGNIN_KEY = 'formpal_last_signin'/.test(src) && (src.match(/rememberLast\('(apple|email)'\)/g) || []).length === 2 && /lastUsed === 'apple'/.test(src) && /lastUsed === 'email'/.test(src) && /Last used/.test(src));
  check('sign-in itself is unchanged: Apple -> Supabase signInWithIdToken, email -> signUp / signInWithPassword, then handleAuthed (push or pull the cloud data) and onAdvance', /signInWithIdToken\(\{\s*provider: 'apple'/.test(src) && /supabase\.auth\.signUp\(\{ email, password \}\)/.test(src) && /signInWithPassword\(\{ email, password \}\)/.test(src) && /const handleAuthed = async/.test(src) && /onAdvance\(\);\n  \};/.test(src));
  check('the Apple logo is a normal size (26, was 18) and the screen uses the gym background and the real logo (no space background left in use)', /name="apple\.logo" size=\{26\}/.test(src) && /import GymBackground/.test(src) && /import FormPalLogo/.test(src) && !/SpaceBackground/.test(src));
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
