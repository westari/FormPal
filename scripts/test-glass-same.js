#!/usr/bin/env node
/**
 * scripts/test-glass-same.js  (round 8, item 1)
 * Proves the calendar panel is drawn by the SAME native glass view with the SAME settings as the camera screen's Finish pill.
 * The native module (@callstack/liquid-glass, Apple's UIGlassEffect) is replaced by a recorder that notes every prop it is given; the real
 * components/LiquidGlass.tsx runs on top of it as if on an iPhone with iOS 26 (Platform.OS "ios", glass supported). Then:
 *   - the Finish pill is built from the real props written in app/formcheck.tsx (read from the source) and rendered through LiquidGlassButton
 *   - the calendar panel (components/CalendarSheet.tsx) is rendered open
 * and the glass views they hand to the native module are compared.
 * Also checks nothing above the calendar's glass can turn it flat (no opacity / overflow / mask on any parent), and that it holds the month inside it.
 */
const Module = require('module');
const React = require('react');
const RNW = require('react-native-web');
const { renderToString } = require('react-dom/server');
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const h = React.createElement;

const calls = []; // every native glass view that got drawn: { tag, props }
let tag = 'none';
const NativeGlass = (props) => { calls.push({ tag, effect: props.effect, colorScheme: props.colorScheme, tintColor: props.tintColor, interactive: props.interactive, radius: (props.style && [].concat(props.style).map((x) => x && x.borderRadius).find((x) => x != null)) }); return h(RNW.View, { style: props.style, testID: 'native-glass' }, props.children); };
const RN = new Proxy(RNW, { get: (t, k) => (k === 'Platform' ? { OS: 'ios', select: (o) => (o.ios !== undefined ? o.ios : o.default) } : k === 'useWindowDimensions' ? () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }) : t[k]) });
const FAKE = {
  'react-native': RN, react: React,
  '@callstack/liquid-glass': { LiquidGlassView: NativeGlass, isLiquidGlassSupported: true },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 62, bottom: 34, left: 0, right: 0 }) },
  'expo-symbols': { SymbolView: ({ style }) => h(RNW.View, { style }) },
  'expo-status-bar': { StatusBar: () => null },
};
const prev = Module._load;
Module._load = function (r) { if (FAKE[r]) return FAKE[r]; return prev.apply(this, arguments); };

const LG = require('../components/LiquidGlass.tsx');
const Cal = require('../components/CalendarSheet.tsx').default;
const SG = require('../components/StandardGlass.tsx');

// the Finish pill exactly as app/formcheck.tsx writes it
const fc = read('app/formcheck.tsx');
const fin = /<LiquidGlassButton[\s\S]{0,400}?<Text style=\{s\.finishTxt\}>Finish/.exec(fc);
check('the Finish pill is found in app/formcheck.tsx (a LiquidGlassButton)', !!fin);
const finProps = { colorScheme: /colorScheme="(\w+)"/.exec(fin[0])[1], fallbackColor: /fallbackColor="([^"]+)"/.exec(fin[0])[1], hasVariant: /variant=/.test(fin[0]), hasTint: /tintColor=/.test(fin[0]) };

check('GLASS_SUPPORTED is true in this setup (the real native path, not the flat fallback)', LG.GLASS_SUPPORTED === true);
tag = 'finish';
renderToString(h(LG.LiquidGlassButton, { onPress: () => {}, radius: 20, colorScheme: finProps.colorScheme, fallbackColor: finProps.fallbackColor, style: { width: 80, height: 40 } }, h(RNW.Text, null, 'Finish')));
tag = 'calendar';
const html = renderToString(h(RNW.View, { style: { flex: 1 } }, h(Cal, { open: true, onClose: () => {}, timestamps: [Date.now()] })));
tag = 'none';

const F = calls.find((c) => c.tag === 'finish'), C = calls.filter((c) => c.tag === 'calendar');
console.log('      Finish  :', JSON.stringify(F));
console.log('      Calendar:', JSON.stringify(C));
check('the Finish pill goes through the native glass view (effect + colour scheme given to it)', !!F && !!F.effect && !!F.colorScheme);
check('the calendar panel goes through the SAME native glass view: exactly one native glass view is drawn for the whole panel', C.length === 1);
check('same native view and material: LiquidGlassView with the same effect ("regular") as the Finish pill', C.length === 1 && C[0].effect === F.effect && F.effect === 'regular');
check('round 10: the look is the LIGHT scheme on purpose (dark glass over the white Home page read as gray): the calendar is "light", the Finish pill stays "dark"', C.length === 1 && C[0].colorScheme === 'light' && F.colorScheme === 'dark' && finProps.colorScheme === 'dark');
check('same tint: none on either (the Finish pill has no tint, so neither has the calendar)', C.length === 1 && C[0].tintColor === undefined && F.tintColor === undefined && !finProps.hasTint && !finProps.hasVariant);
check('the fallback fill (only used where there is no real glass) is the light one (the tab bar glass fill)', /fallbackColor: 'rgba\(255,255,255,0\.82\)'/.test(read('components/CalendarSheet.tsx')));

// what sits above the glass could flatten it: nothing may (no opacity, no overflow, no mask on any parent of the native view)
const csrc = read('components/CalendarSheet.tsx');
const panelStyle = /panel: \{[^}]*\}/.exec(csrc)[0];
check('no parent of the calendar glass fades, clips or masks it: no opacity, no overflow, no borderRadius, no mask on the panel wrapper, and nothing in its animated style but the slide', !/opacity|overflow|mask/.test(panelStyle) && /style=\{\[s\.panel, \{ top: -BLEED, transform: \[\{ translateY: slide \}\] \}\]\}/.test(csrc) && !/opacity: parkedWarm|WARM_MS/.test(csrc));
check('the month is INSIDE the glass view (as the word is inside the Finish pill): the native glass view contains the title and the days', /<LiquidGlass radius=\{RADIUS\}[^>]*style=\{\[s\.inner/.test(csrc) && /<\/LiquidGlass>/.test(csrc) && /native-glass[^]*November|native-glass[^]*Nov|native-glass[^]*January|native-glass[^]*December/.test(html.replace(/<[^>]+>/g, (m) => (/data-testid="native-glass"/.test(m) ? m : ''))));
check('it is not a blur or an imitation: no BlurView, no backdropFilter, no hand-painted gradient glass in the calendar', !/BlurView|backdropFilter|GlassSurface|expo-blur|LinearGradient/.test(csrc));
console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
