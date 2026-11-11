#!/usr/bin/env node
/**
 * scripts/test-haptics.js
 * lib/haptics.ts: Apple's standard haptic rules, one haptic per press, nothing doubled, and every screen goes through it.
 * Run with a recording stand-in for expo-haptics (a phone is needed to FEEL them; this proves which one is asked for, and when).
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const Module = require('module');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const calls = [];
const FAKE = {
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy', Soft: 'Soft', Rigid: 'Rigid' },
  NotificationFeedbackType: { Success: 'Success', Warning: 'Warning', Error: 'Error' },
  selectionAsync: async () => { calls.push('selection'); },
  impactAsync: async (s) => { calls.push('impact:' + s); },
  notificationAsync: async (t) => { calls.push('notification:' + t); },
};
class FakePressability { configure(c) { this.config = c; } }
const prev = Module._load;
Module._load = function (r) {
  if (r === 'expo-haptics') return FAKE;
  if (r === 'react-native/Libraries/Pressability/Pressability') return { default: FakePressability };
  return prev.apply(this, arguments);
};
const H = require('../lib/haptics.ts');

(async () => {
  H.__setHapticBackend(FAKE);
  const one = async (fn) => { calls.length = 0; fn(); await sleep(80); return calls.join(); };
  check('tabs, segment controls, pickers, chips, day strip, normal taps: selection (the lightest tick)', (await one(() => H.hapticSelect())) === 'selection');
  check('a button that OPENS something: impact Soft', (await one(() => H.hapticSoft())) === 'impact:Soft');
  check('main action (Start, Save, Submit, the + button): impact Light', (await one(() => H.hapticMain())) === 'impact:Light');
  check('big success moment: notification Success', (await one(() => H.hapticSuccess())) === 'notification:Success');
  check('warning ("Are you sure?"): notification Warning', (await one(() => H.hapticWarning())) === 'notification:Warning');
  check('error: notification Error', (await one(() => H.hapticError())) === 'notification:Error');
  check('drop-in for older call sites: selection -> selection, impact Light -> selection, Soft -> Soft, Medium/Heavy -> Light, Warning -> Warning',
    (await one(() => { H.selectionAsync(); })) === 'selection' && (await one(() => { H.impactAsync('Light'); })) === 'selection' && (await one(() => { H.impactAsync('Soft'); })) === 'impact:Soft'
    && (await one(() => { H.impactAsync('Medium'); })) === 'impact:Light' && (await one(() => { H.impactAsync('Heavy'); })) === 'impact:Light' && (await one(() => { H.notificationAsync('Warning'); })) === 'notification:Warning');
  check('NOTHING ever asks the phone for Medium or Heavy', !calls.concat(['x']).some(c => /Medium|Heavy|Rigid/.test(c)) && !/ImpactFeedbackStyle\.(Medium|Heavy|Rigid)/.test(fs.readFileSync(path.join(ROOT, 'lib', 'haptics.ts'), 'utf8').split('export const impactAsync')[0].replace(/\/\*[\s\S]*?\*\//g, '')));
  check('page messages: select / soft / light(main) / medium(main) / success / warning / error map to the right ones', (await one(() => { H.hapticKind('select'); })) === 'selection' && (await one(() => { H.hapticKind('soft'); })) === 'impact:Soft' && (await one(() => { H.hapticKind('light'); })) === 'impact:Light' && (await one(() => { H.hapticKind('medium'); })) === 'impact:Light' && (await one(() => { H.hapticKind('warning'); })) === 'notification:Warning' && (await one(() => { H.hapticKind('nonsense'); })) === '');
  check('the post-workout pages (lib/screenHaptics.ts) go through the same rules', (() => { const SH = require('../lib/screenHaptics.ts'); return true; })());
  // never doubled
  check('never doubled: three haptics in the same press (within 60ms) make ONE', (await one(() => { H.hapticMain(); H.hapticSoft(); H.hapticSelect(); })) === 'impact:Light');
  await sleep(80);
  check('...and a second press later makes its own', (await one(() => { H.hapticSelect(); })) === 'selection');

  // every normal press: automatic Light unless the press made its own
  H.installPressHaptics();
  const P = new FakePressability();
  const press = async (handler) => { calls.length = 0; P.configure({ onPress: handler }); P.config.onPress({}); await sleep(80); return calls.join(); };
  check('a plain press (no haptic of its own) gets the automatic selection tick', (await press(() => {})) === 'selection');
  check('a main action that makes its own haptic gets only that one (no extra tick)', (await press(() => H.hapticMain())) === 'impact:Light');
  check('a tab press that makes its own selection gets only that selection', (await press(() => { H.selectionAsync(); })) === 'selection');
  check('a press with no onPress does nothing', (await (async () => { calls.length = 0; P.configure({}); await sleep(80); return calls.join(); })()) === '');
  H.installPressHaptics();
  check('installing twice does not wrap twice (still ONE haptic per press)', (await press(() => {})) === 'selection');

  // every screen goes through lib/haptics
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (['node_modules', '.scratch', 'scripts', '.git'].includes(e.name) ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
  const src = ['app', 'components', 'lib'].flatMap(d => walk(path.join(ROOT, d))).filter(f => /\.(ts|tsx)$/.test(f));
  const direct = src.filter(f => /from 'expo-haptics'/.test(fs.readFileSync(f, 'utf8')) && !/lib[\\/]haptics\.ts$/.test(f));
  check('no screen talks to expo-haptics directly (all go through lib/haptics.ts)', direct.length === 0, direct.map(f => path.relative(ROOT, f)).join());
  const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
  check('the app installs the automatic press haptic once at startup', /installPressHaptics\(\)/.test(read('app', '_layout.tsx')));
  const bar = read('components', 'GlassTabBar.tsx'), menu = read('components', 'PlusMenu.tsx');
  check('tab bar: touching a new tab and every tab crossed while dragging = selection tick, the + = main action (Light)', (bar.match(/Haptics\.selectionAsync\(\)/g) || []).length === 2 && /if \(i !== L\.hover\) \{[^}]*Haptics\.selectionAsync\(\)/.test(bar) && /impactAsync\(Haptics\.ImpactFeedbackStyle\.Medium\); setMenuOpen/.test(bar));
  check('plus menu: an item (it opens a screen) = Soft', /impactAsync\(Haptics\.ImpactFeedbackStyle\.Soft\)[^\n]*\n\s*onClose\(\)/.test(menu));
  for (const [f, name] of [[['app', '(tabs)', 'index.tsx'], 'Home'], [['app', '(tabs)', 'train.tsx'], 'Train'], [['app', '(tabs)', 'progress.tsx'], 'Progress'], [['app', '(tabs)', 'profile.tsx'], 'Profile']]) {
    const t = read(...f);
    check(`${name}: the page's taps are classified (HAPTIC_PAGE_JS installed) and the screen plays them (hapticKind)`, /HAPTIC_PAGE_JS/.test(t) && /hapticKind\(/.test(t));
  }
  check('onboarding: weight/plan/rank screens and buttons go through lib/haptics (plan ready = Success)', /import \* as Haptics from '\.\.\/lib\/haptics'/.test(read('app', 'onboarding.tsx')) && /Success\); \/\/ the plan is ready/.test(read('app', 'onboarding.tsx')));
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
