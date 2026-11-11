#!/usr/bin/env node
/**
 * scripts/test-tabs.js
 * The tab bar: routes, layout and "real glass only", checked on the REAL source files.
 *   - app/(tabs)/_layout.tsx registers Home, Train, Plus (hidden), Progress, Profile and every one has its screen file
 *   - components/GlassTabBar.tsx: Home / Train / Progress / Profile together in ONE Liquid Glass capsule on the left, a gap,
 *     then the + alone on the right, bigger than the bar's items, also Liquid Glass; bar stays above the menu's blur
 *   - components/PlusMenu.tsx: blur of the page behind (no extra background), every action a Liquid Glass button, Cue is
 *     only its orb (no button, no border)
 *   - nothing in the bar or menu uses the old fake surfaces (GlassSurface / GlassButton / hand-painted gradients)
 *   - the geometry (lib/tabBarMetrics.ts): where everything lands on a 402-wide phone, and the screens clear the bar
 */
require('./lib/ts-node-loader.js')();
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TABS = path.join(ROOT, 'app', '(tabs)');
const M = require('../lib/tabBarMetrics.ts');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const layout = read('app', '(tabs)', '_layout.tsx');
const screens = [...layout.matchAll(/<Tabs\.Screen name="(\w+)"([^>]*)\/>/g)].map(m => ({ name: m[1], attrs: m[2] }));
check('the tab group registers Home, Train, Plus, Progress, Profile in that order', screens.map(s => s.name).join() === 'index,train,plus,progress,profile', screens.map(s => s.name).join());
for (const s of screens) {
  const f = path.join(TABS, s.name + '.tsx');
  check(`route "${s.name}" has app/(tabs)/${s.name}.tsx with a default export`, fs.existsSync(f) && /export default/.test(fs.readFileSync(f, 'utf8')));
}
check('Plus is hidden from the bar (it is a button now, not a page)', /name="plus" options=\{\{ href: null, lazy: true \}\}/.test(layout) && /Redirect/.test(read('app', '(tabs)', 'plus.tsx')));
check('the layout uses the glass bar (components/GlassTabBar), not NativeTabs', /tabBar=\{\(props\) => <GlassTabBar/.test(layout) && !/NativeTabs/.test(layout));
check('TAB_NAMES (logged at runtime as [TABS]) matches the registered routes', /TAB_NAMES = \['index', 'train', 'plus', 'progress', 'profile'\]/.test(layout));

const bar = read('components', 'GlassTabBar.tsx');
const tabs = [...bar.matchAll(/\{ name: '(\w+)',\s+label: '(\w+)'/g)].map(m => m[2]);
check('the bar lists Home, Train, Progress, Profile (and nothing else) in one place', tabs.join() === 'Home,Train,Progress,Profile', tabs.join());
check('the 4 tabs share ONE Liquid Glass capsule (one <LiquidGlass> capsule, the lens glass over it, the icons and labels on top of the lens so the glass never smears them)', (bar.match(/<LiquidGlass /g) || []).length === 2 && bar.indexOf('<LiquidGlass radius={TAB_BAR_H / 2}') < bar.indexOf('<Animated.View pointerEvents="none" style={[s.pill') && bar.indexOf('<Animated.View pointerEvents="none" style={[s.pill') < bar.indexOf('TABS.map') && bar.indexOf('TABS.map') < bar.indexOf('panHandlers'));
check('the + is its own real Liquid Glass button (LiquidGlassButton), outside the capsule', /<LiquidGlassButton[\s\S]*?plus/.test(bar.slice(bar.indexOf('panHandlers'))) && !/black|#000|#111114['"]\s*,\s*$/m.test(bar.slice(bar.indexOf('<LiquidGlassButton'), bar.indexOf('</LiquidGlassButton>')).replace(/tintColor=\{INK\}/g, '')));
check('order on screen: capsule, then a gap, then the + (flex row, capsule flex:1, the + last)', bar.indexOf('<LiquidGlass ') < bar.indexOf('<View style={{ width: TAB_BAR_GAP }}') && bar.indexOf('<View style={{ width: TAB_BAR_GAP }}') < bar.indexOf('<LiquidGlassButton'));
check('no fake surfaces in the bar or the menu (GlassSurface, GlassButton, gradients, blur used as glass)', ![bar, read('components', 'PlusMenu.tsx')].some(t => /GlassSurface|from '.\/GlassButton'|LinearGradient/.test(t)) && !/BlurView/.test(bar));
check('the bar is drawn above the menu\'s blur (menu first, bar after it in the same overlay)', bar.indexOf('<PlusMenu') < bar.indexOf('<View style={[s.row'));

// geometry on a 402pt-wide phone (iPhone 16 Pro): bar left, + right and bigger
const W = 402, capsuleW = W - 2 * M.TAB_BAR_SIDE - M.TAB_BAR_GAP - M.PLUS_SIZE;
const capsule = { x: M.TAB_BAR_SIDE, w: capsuleW }, plus = { x: M.TAB_BAR_SIDE + capsuleW + M.TAB_BAR_GAP, w: M.PLUS_SIZE };
console.log(`      402pt phone: capsule x ${capsule.x}..${capsule.x + capsule.w} (${M.TAB_BAR_H} tall, each of the 4 tabs ${((capsule.w - 12) / 4).toFixed(0)} wide), gap ${M.TAB_BAR_GAP}, + at x ${plus.x}..${plus.x + plus.w} (${M.PLUS_SIZE}x${M.PLUS_SIZE})`);
check('the + sits to the right of the capsule with the gap between, inside the screen edge margin', plus.x === capsule.x + capsule.w + M.TAB_BAR_GAP && plus.x + plus.w === W - M.TAB_BAR_SIDE);
check('the + is bigger than the bar and than any tab (72 vs 64 bar, tabs 52 tall)', M.PLUS_SIZE > M.TAB_BAR_H && M.PLUS_SIZE > M.TAB_BAR_H - 12);
check('each of the 4 tabs is wide enough for its label ("Progress" at 10.5pt is about 46pt)', (capsule.w - 12) / 4 >= 56, ((capsule.w - 12) / 4).toFixed(0) + 'pt');
check('screens scroll clear of the bar: the cover (110pt on a 34pt home-indicator phone) is at least the bar + margin', M.tabBarCover(34) >= M.tabBarBottom(34) + M.PLUS_SIZE && M.tabBarCover(0) >= 10 + M.PLUS_SIZE, `${M.tabBarCover(34)} / ${M.tabBarCover(0)}`);
for (const f of [['app', '(tabs)', 'index.tsx'], ['app', '(tabs)', 'train.tsx'], ['app', '(tabs)', 'progress.tsx'], ['app', '(tabs)', 'profile.tsx']]) {
  check(`${f[2]} uses the bar's own cover (tabBarCover) for its bottom clearance`, /tabBarCover/.test(read(...f)));
}

const menu = read('components', 'PlusMenu.tsx');
check('opening the + blurs the page behind (BlurView over the page), with NO background colour layer added', /<BlurView /.test(menu) && !/backgroundColor: 'rgba\(255/.test(menu.slice(0, menu.indexOf('const s = StyleSheet'))));
const actions = [...menu.matchAll(/\{ id: '(\w+)',\s+label: '([^']+)',\s+symbol: ('[^']+'|null)/g)].map(m => `${m[1]}:${m[3] === 'null' ? 'orb' : 'glass'}`);
check('actions top to bottom: Cue, form check, create workout, log, start workout (Cue is not stuck at the bottom)', actions.join() === 'cue:orb,form:glass,create:glass,log:glass,workout:glass', actions.join());
check('"Analyze a Video" is gone from the menu', !/analyze/i.test(menu));
const labels = [...menu.matchAll(/label: '([^']+)'/g)].map(m => m[1]);
check('short clear names (no "Quick form check")', labels.join() === 'Ask Cue,Form check,Create workout,Log session,Start workout' && labels.every(l => l.length <= 14), labels.join());
check('menu labels are regular weight in the system font (no fontFamily, weight 400)', /label: \{[^}]*fontWeight: '400'/.test(menu) && !/label: \{[^}]*fontFamily/.test(menu));
check('tapping outside fades the menu out smoothly (blur + actions animate back to 0 and are removed only when finished)', /else if \(mounted\)/.test(menu) && /toValue: 0, duration: CLOSE_MS/.test(menu) && /if \(finished\) setMounted\(false\)/.test(menu) && /onPress=\{onClose\}/.test(menu));
const orb = read('components', 'CueOrb.tsx');
check('the Cue orb in the menu animates like the other orbs (drifting glow + core, wobble, breathing, native driven)', (orb.match(/useDrift\(/g) || []).length >= 3 && /useNativeDriver: true/.test(orb) && !/useNativeDriver: false/.test(orb) && /CUE_ORB_ANIMATED_LAYERS/.test(orb) && require('../components/CueOrb.tsx').CUE_ORB_ANIMATED_LAYERS.length >= 4, String(require('../components/CueOrb.tsx').CUE_ORB_ANIMATED_LAYERS));
check('tab labels use the Apple system font (no fontFamily) at the tab bar size 10pt medium', /label:\s+\{ fontSize: 10, fontWeight: '500', letterSpacing: 0\.12 \}/.test(bar) && !/\n  label:[^\n]*fontFamily/.test(bar));
check('tabs show instantly: all built at launch (lazy false), kept attached behind the open one (detachInactiveScreens false), no fade between them (animation none: a fade let the dark navigator show through = the black screen)', /lazy: false/.test(layout) && /detachInactiveScreens=\{false\}/.test(layout) && /animation: 'none'/.test(layout) && !/animation: 'fade'/.test(layout) && /name="plus" options=\{\{ href: null, lazy: true \}\}/.test(layout));
check('Home, Progress and Profile pages reload at once when iOS kills their web view (no blank/black page left behind)', ['index', 'progress', 'profile'].every(f => /onContentProcessDidTerminate=\{\(\) => \{ hide\(\); webRef\.current\?\.reload\(\); \}\}/.test(read('app', '(tabs)', f + '.tsx'))));
check('every action button is real Liquid Glass (LiquidGlassButton)', /<LiquidGlassButton[\s\S]*?onPress=\{\(\) => go\(a\.route\)\}/.test(menu));
check('Cue is only its moving orb: no glass, no border, no background around it', /<CueOrb size=\{ORB\} halo=\{false\} \/>/.test(menu) && !/borderWidth|borderColor/.test(menu) && /orb:\s+\{ width: BTN, height: BTN, alignItems: 'center', justifyContent: 'center', overflow: 'visible' \}/.test(menu));
check('the menu opens the real screens (exercise-picker, workout, log-session, cue)', ['/exercise-picker', '/create-workout', '/workout', '/log-session', '/cue'].every(r => menu.includes(`route: '${r}'`)));
check('the + turns into an x while the menu is open (rotates 45 degrees)', /outputRange: \['0deg', '45deg'\]/.test(bar));

check('the + icon is thin (light weight, not semibold)', /name=\{'plus' as any\} size=\{26\} weight="light"/.test(bar) && !/weight="semibold"/.test(bar));
check('the Cue orb in the menu is a full clean orb: no halo disc, centred in the same 60 box as the glass buttons', /const BTN = 60;/.test(menu) && /const ORB = 48;/.test(menu) && /<CueOrb size=\{ORB\} halo=\{false\} \/>/.test(menu));
check('the bar and + are smaller than before (58 / 64, were 64 / 72), same layout', M.TAB_BAR_H === 58 && M.PLUS_SIZE === 64 && M.PLUS_SIZE > M.TAB_BAR_H);
check('ONE glass pill slides between tabs on a spring (not a square painted on each tab)', /Animated\.spring\(slide/.test(bar) && /translateX: slide/.test(bar) && (bar.match(/variant="clear"/g) || []).length === 1 && !/itemOn/.test(bar));
check('the pill starts on the current tab without sliding in from the side (first placement is instant)', /if \(!placed\.current\) \{ slide\.setValue\(idx \* itemW\)/.test(bar));

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
