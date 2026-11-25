#!/usr/bin/env node
/**
 * scripts/test-save-progress.js  (round 10, item 7)
 * "Save your progress" rebuilt to Ari's reference: a dark space screen (stars + the lit edge of a planet), the FormPal logo in the middle, pill buttons
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
const RN = new Proxy(RNW, { get: (t, k) => (k === 'useWindowDimensions' ? () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }) : t[k]) });
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
    return { __esModule: true, default: el('svg'), Defs: el('defs'), LinearGradient: el('linearGradient'), RadialGradient: el('radialGradient'), Stop: el('stop'), Rect: el('rect'), Circle: el('circle'), Ellipse: el('ellipse'), Path: el('path') }; })(),
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
    return { txt, apple: btn('Continue with Apple'), email: btn('Continue with email'), logo: rect(find('FormPal')), priv: rect(find('Privacy policy')), terms: rect(find('Terms of service')), stars, hasSvg: !!svg, root: [...document.querySelectorAll('div')].map((d) => getComputedStyle(d).backgroundColor).find((c) => c === 'rgb(13, 13, 17)') || 'none', back: (txt.match(/BACKBTN-(\w+)/) || [])[1] };
  });
  console.log('      ', JSON.stringify({ apple: m.apple && m.apple.r, email: m.email && m.email.r, logo: m.logo, root: m.root }));
  check('the screen is dark (a near-black root), not white: the space background is drawn (stars and a planet edge in an svg)', m.hasSvg && m.stars >= 30 && m.root === 'rgb(13, 13, 17)', JSON.stringify([m.hasSvg, m.stars, m.root]));
  check('the FormPal logo is there (mark + "FormPal"), a little below the middle (like the reference)', !!m.logo && m.logo.t > 844 * 0.45 && m.logo.t < 844 * 0.62 && Math.abs((m.logo.l + m.logo.r) / 2 - 195 - 20) < 40, JSON.stringify(m.logo));
  check('the buttons: "Continue with Apple" is white and "Continue with email" is the grey one, both full-width pills about 60px tall, apple above email', !!m.apple && !!m.email && m.apple.bg === 'rgb(255, 255, 255)' && /rgba\(255, 255, 255, 0\.14\)/.test(m.email.bg) && m.apple.r.h >= 56 && m.email.r.h >= 56 && m.apple.r.b < m.email.r.t && Math.abs(m.apple.r.w - 350) < 2, JSON.stringify([m.apple, m.email]));
  check('they sit at the bottom of the screen, with the footer links ("Privacy policy", "Terms of service") under them', m.email.r.b < m.priv.t && m.priv.t > 844 * 0.8 && m.terms.l > m.priv.r && m.terms.t === m.priv.t, JSON.stringify([m.email.r.b, m.priv, m.terms]));
  check('no Google button (Google sign-in is not built, a dead button is worse than none), and the old checkbox sentences are gone', !/Google/.test(m.txt) && !/I agree to FormPal|Send me tips/.test(m.txt));
  check('round 11: Save your progress has NO back button and NO progress bar in its normal view (from building the plan onward there is no going back); only the e-mail form keeps a back button', read('components/onboarding/SaveProgressScreen.tsx').includes('{emailMode ? <OnbBackButton') && !read('components/onboarding/SaveProgressScreen.tsx').includes('progress != null && ('));
  await browser.close();
  const src = read('components/onboarding/SaveProgressScreen.tsx');
  check('"Last used": the method used is remembered on the phone after a successful sign-in and shown as a small tag on that button', /LAST_SIGNIN_KEY = 'formpal_last_signin'/.test(src) && (src.match(/rememberLast\('(apple|email)'\)/g) || []).length === 2 && /lastUsed === 'apple'/.test(src) && /lastUsed === 'email'/.test(src) && /Last used/.test(src));
  check('sign-in itself is unchanged: Apple -> Supabase signInWithIdToken, email -> signUp / signInWithPassword, then handleAuthed (push or pull the cloud data) and onAdvance', /signInWithIdToken\(\{\s*provider: 'apple'/.test(src) && /supabase\.auth\.signUp\(\{ email, password \}\)/.test(src) && /signInWithPassword\(\{ email, password \}\)/.test(src) && /const handleAuthed = async/.test(src) && /onAdvance\(\);\n  \};/.test(src));
  check('only the allowed files changed: the screen, plus new SpaceBackground and FormPalLogo (app/onboarding.tsx is not touched by this round)', /import SpaceBackground/.test(src) && /import FormPalLogo/.test(src));
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
