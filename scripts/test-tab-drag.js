#!/usr/bin/env node
/**
 * scripts/test-tab-drag.js
 * The tab bar's press-and-drag (components/GlassTabBar.tsx + lib/tabDrag.ts), like the iOS 26 bar:
 *   press -> the glass lens lifts under the finger; drag -> it follows (rubber band at the ends, stretch with speed); each tab it
 *   crosses lights up and ticks once; let go -> that tab opens. A quick tap is the same gesture.
 * The maths runs for real under node; the gesture wiring is checked on the source (a phone is needed to feel the glass).
 */
require('./lib/ts-node-loader.js')();
global.__DEV__ = false;
const fs = require('fs'), path = require('path');
const D = require('../lib/tabDrag.ts');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };
const bar = fs.readFileSync(path.join(__dirname, '..', 'components', 'GlassTabBar.tsx'), 'utf8');

const W = 70, PAD = 6;   // a 402pt phone: each tab about 70pt wide
check('which tab is under the finger (edges included, never outside 0..3)', [10, 75, 77, 146, 147, 300, 400, -20].map(x => D.tabIndexAt(x, W, PAD)).join() === '0,0,1,2,2,3,3,0', [10, 75, 77, 146, 147, 300, 400, -20].map(x => D.tabIndexAt(x, W, PAD)).join());
check('the lens is centred on the finger between the tabs', D.lensLeft(PAD + W * 1.5, W, PAD) === W, String(D.lensLeft(PAD + W * 1.5, W, PAD)));
check('past the ends the lens rubber-bands: it follows only a part of the pull and never more than the limit', D.lensLeft(PAD - 200, W, PAD) === -D.RUBBER_MAX && D.lensLeft(PAD + W * 4 + 300, W, PAD) === 3 * W + D.RUBBER_MAX && D.lensLeft(PAD + W / 2 - 10, W, PAD) > -D.RUBBER_MAX && D.lensLeft(PAD + W / 2 - 10, W, PAD) < 0);
check('it stretches with finger speed (more speed, more stretch) up to a limit, and not at rest', D.lensStretch(0) === 1 && D.lensStretch(0.5) > D.lensStretch(0.1) && D.lensStretch(50) === 1 + D.STRETCH_MAX && D.lensStretch(-0.5) === D.lensStretch(0.5));
check('the lifted lens is bigger than the resting highlight (it stands out of the bar)', D.LENS_SCALE_X > 1 && D.LENS_SCALE_Y > 1.2);
// a drag from Home to Profile
const path1 = [10, 60, 100, 150, 200, 250, 290, 310];
let hover = D.tabIndexAt(path1[0], W, PAD), ticks = 0; const seen = [hover];
for (const x of path1.slice(1)) { const i = D.tabIndexAt(x, W, PAD); if (i !== hover) { hover = i; ticks++; seen.push(i); } }
check('dragging Home -> Profile highlights Home, Train, Progress, Profile in order and ticks once per tab crossed (3)', seen.join() === '0,1,2,3' && ticks === 3, seen.join() + ' / ' + ticks);
check('letting go on Profile opens Profile; letting go back on the open tab opens nothing new', D.releaseTarget(310, W, PAD, 0).open === 3 && D.releaseTarget(30, W, PAD, 0).open === null);
check('a quick tap on Train opens Train (same gesture, no drag)', D.releaseTarget(100, W, PAD, 0).open === 1);
// wiring
check('the bar uses a PanResponder on a layer above the tabs (the tabs themselves do not take touches)', /PanResponder\.create/.test(bar) && /\{\.\.\.pan\.panHandlers\}/.test(bar) && /<View style=\{\[StyleSheet\.absoluteFill, s\.items\]\} pointerEvents="none">/.test(bar));
check('touch down: the lens lifts with a spring and glides under the finger', /onPanResponderGrant[\s\S]*Animated\.spring\(lift, \{ toValue: 1, \.\.\.LIFT_SPRING/.test(bar) && /Animated\.spring\(slide, \{ toValue: lensLeft\(L\.startX/.test(bar));
check('moving: the lens follows the finger (setValue, no lag), stretches with speed, ticks once per new tab', /slide\.setValue\(lensLeft\(x/.test(bar) && /stretch\.setValue\(lensStretch\(g\.vx\)\)/.test(bar) && /if \(i !== L\.hover\) \{ L\.hover = i; setHover\(i\); Haptics\.selectionAsync\(\); \}/.test(bar));
check('icon + label colour follows the LENS position (cross-fade by distance), so a tab goes dark only as the lens arrives, on a tap and on a drag', /slide\.interpolate\(\{ inputRange: \[\(i - 0\.85\)/.test(bar) && /opacity: near/.test(bar) && /opacity: far/.test(bar));
check('letting go: the lens settles on the tab with a spring, lifts back down, and that tab opens', /onPanResponderRelease[\s\S]*releaseTarget\(/.test(bar) && /Animated\.spring\(lift, \{ toValue: 0, \.\.\.SETTLE_SPRING/.test(bar) && /openTabRef\.current\(TABS\[target\]\.name\)/.test(bar));
check('the lens is drawn OUTSIDE the glass capsule so it can stand out of the bar while lifted', bar.indexOf('</LiquidGlass>') < bar.indexOf('s.pill') && /variant="clear"/.test(bar));
check('VoiceOver still works: every tab is an accessible button with its own tap action', /accessibilityRole="button"/.test(bar) && /onAccessibilityTap=\{\(\) => openTab\(t\.name\)\}/.test(bar));
check('the spring numbers are labelled as estimates in lib/tabDrag.ts (Apple publishes none)', /ESTIMATE/.test(fs.readFileSync(path.join(__dirname, '..', 'lib', 'tabDrag.ts'), 'utf8')));
const crit = (sp) => sp.damping >= 2 * Math.sqrt(sp.stiffness * sp.mass) * 0.99; // damping ratio >= 1: no overshoot, no rocking
check('NO wobble: every spring the lens uses is critically damped (damping ratio >= 1) and clamped, so it glides to the tab and stops', crit(D.LIFT_SPRING) && crit(D.SETTLE_SPRING) && D.LIFT_SPRING.overshootClamping === true && D.SETTLE_SPRING.overshootClamping === true && !/damping: 1[0-9],/.test(bar), JSON.stringify([D.LIFT_SPRING, D.SETTLE_SPRING]));
{ // simulate the settle spring: from a tab 71 px away, the position never goes past the target
  const k = D.SETTLE_SPRING.stiffness, c = D.SETTLE_SPRING.damping, m = D.SETTLE_SPRING.mass; let x = 0, v = 0, maxX = 0; const T = 71;
  for (let t = 0; t < 3; t += 0.001) { const a = (-k * (x - T) - c * v) / m; v += a * 0.001; x += v * 0.001; maxX = Math.max(maxX, x); }
  check('simulated: the lens settles on the next tab (71 px away) without ever passing it', maxX <= T + 0.01 && Math.abs(x - T) < 0.5, 'max ' + maxX.toFixed(2) + ' end ' + x.toFixed(2));
}
check('the open tab icon and label are drawn ABOVE the lens glass (the glass no longer smears them)', bar.indexOf('s.pill') < bar.indexOf('style={s.itemHit}') && bar.indexOf('style={s.itemHit}') < bar.indexOf('panHandlers'));
{ // the colour maths from components/GlassTabBar.tsx, on a 71 px tab: Home -> Profile
  const W = 71, near = (i, x) => Math.max(0, 1 - Math.abs(x - i * W) / (0.85 * W));
  check('Home -> Profile: when the tap lands the lens is still on Home, so Profile is NOT dark yet (0) and Home still is (1)', near(3, 0) === 0 && near(0, 0) === 1);
  check('...Profile only starts to darken once the lens is within 0.85 of a tab of it, and is fully dark when the lens is on it', near(3, 3 * W - 0.9 * W) === 0 && near(3, 3 * W - 0.4 * W) > 0.5 && near(3, 3 * W) === 1);
  check('...the tabs in between (Train, Progress) flash dark only for the moment the lens is on them', near(1, 1 * W) === 1 && near(1, 2 * W) === 0 && near(2, 1 * W) === 0);
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
