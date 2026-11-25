/**
 * The camera screen's layout (lib/cameraHudLayout.ts) on six iPhone sizes, workout and solo: nothing overlaps, everything sits inside the
 * safe areas, the rep count and the demo drawer's peek stay clear, and the Coach's check / X has room under the centre pill.
 * Also checks that app/formcheck.tsx really draws from that layout (not from loose numbers).
 */
require('./lib/ts-node-loader.js')();
const fs = require('fs'); const path = require('path');
const L = require('../lib/cameraHudLayout.ts');
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail && !ok ? '   -> ' + detail : '')); if (!ok) failed++; }

const PEEK = 56;
const PHONES = [
  { n: 'iPhone SE (3rd gen) 375x667', w: 375, h: 667, top: 20 },
  { n: 'iPhone 13 mini 375x812', w: 375, h: 812, top: 50 },
  { n: 'iPhone 15 393x852', w: 393, h: 852, top: 59 },
  { n: 'iPhone 16 Pro 402x874', w: 402, h: 874, top: 62 },
  { n: 'iPhone 15 Pro Max 430x932', w: 430, h: 932, top: 59 },
  { n: 'iPhone 16 Pro Max 440x956', w: 440, h: 956, top: 62 },
];
const apart = (aBottom, bTop) => aBottom <= bTop;

for (const p of PHONES) {
  for (const solo of [false, true]) {
    const tag = p.n + (solo ? ' solo' : ' workout');
    const l = L.hudLayout({ width: p.w, height: p.h, insetTop: p.top, peekHeight: PEEK, solo });
    const btnBottom = l.buttons.top + L.HUD_BTN;
    const frameBottomY = p.h - l.frame.bottom;
    const pillBottomMax = l.pill.top + l.pill.maxHeight;
    const countTop = l.count.top, countBottom = l.count.top + l.count.height;
    const stopTop = p.h - l.stop.bottom - l.stop.height, stopLeft = p.w - l.stop.right - l.stop.width;
    // 2-digit count with "/ 10" at the largest size: digits about 0.62 em of 92 pt, "/ 10" about 46 pt, gap 12
    const countHalfW = (2 * 0.62 * 92 + 12 + 46) / 2;
    check(tag + ': the buttons sit under the top safe area', l.buttons.top >= p.top);
    if (!solo) {
      check(tag + ': buttons, set bar, timer and brackets stack top to bottom with no overlap', apart(btnBottom, l.bar.top) && apart(l.bar.top + l.bar.height, l.timer.top) && apart(l.timer.top + l.timer.height, l.frame.top), JSON.stringify({ btnBottom, bar: l.bar.top, timer: l.timer.top, frame: l.frame.top }));
    } else {
      check(tag + ': the brackets start under the buttons (no set bar or timer in a solo form check)', apart(btnBottom, l.frame.top));
    }
    check(tag + ': the centre pill (even two guide lines + the confidence row) fits inside the brackets, above the rep count', l.pill.top >= l.frame.top && apart(pillBottomMax, frameBottomY), JSON.stringify({ pillTop: l.pill.top, pillBottomMax, frameBottomY }));
    check(tag + ': the brackets end above the rep count', apart(frameBottomY, countTop), JSON.stringify({ frameBottomY, countTop }));
    check(tag + ': the rep count stays above the demo drawer peek (56 pt) with a gap', apart(countBottom, p.h - PEEK));
    check(tag + ': the Finish pill is on the count row, right of the count, and clear of the brackets and the drawer', stopLeft > p.w / 2 + countHalfW && stopTop >= frameBottomY && apart(stopTop + l.stop.height, p.h - PEEK), JSON.stringify({ stopLeft, need: p.w / 2 + countHalfW }));
    check(tag + ': the Coach check / X has a band under the pill and above the count, inside the brackets', l.orb.top >= l.pill.top + 52 && l.orb.top + l.orb.height <= frameBottomY + 0.5 && l.orb.height > 0, JSON.stringify(l.orb));
    check(tag + ': the check / X needs to shrink to at most 55% on this phone (it never covers the pill or the count)', l.orb.scale >= 0.55, 'scale ' + l.orb.scale.toFixed(2));
    check(tag + ': the pill is centred EXACTLY (equal space left and right of a fixed width) and fits the width', Math.abs(l.pill.left * 2 + l.pill.width - p.w) <= 1, JSON.stringify(l.pill));
    check(tag + ': the pill is near the TOP of the brackets (within 14 pt), out of the way of the body', l.pill.top - l.frame.top <= 14 && l.pill.top >= l.frame.top);
  }
}

// the real screen draws from the layout
const fc = fs.readFileSync(path.join(__dirname, '..', 'app', 'formcheck.tsx'), 'utf8');
check('formcheck: ONE layout object feeds the brackets, the set bar, the timer, the pill, the count, the stop button and the Coach check / X',
  /const hud = hudLayout\(/.test(fc) && /layout=\{hud\}/.test(fc) && /area=\{hud\.orb\}/.test(fc) && /hud\.stop\.bottom/.test(fc) && /layout\.bar\.top/.test(fc) && /layout\.timer\.top/.test(fc) && /layout\.pill\.top/.test(fc) && /layout\.count\.top/.test(fc));
check('formcheck: the Guide is hidden while a Coach check / X is on screen (the pill keeps only its confidence row)', /isTracking && !feedback \? guideTrack : null/.test(fc));
check('formcheck: no separate "Camera confidence" label any more; the info icon explains the number', !/Camera confidence<\/Text>/.test(fc) && /What camera confidence means/.test(fc) && /setInfoOpen/.test(fc));
check('formcheck: the solo rep count is 3 / 10 like the workout (target = the exercise default reps), same RepCount component', fc.includes('total={target}') && fc.includes('defaultReps ?? 10') && fc.includes('total={targetReps}'));
check('formcheck: each set is its OWN glass pill with gaps; finished AND current sets are bright WHITE with a soft white glow (no green), upcoming dim', fc.includes('const on = i <= completedSets;') && fc.includes('wh.setGlow') && fc.includes("setGlow:  { shadowColor: '#FFFFFF'") && !fc.includes("setGlow:  { shadowColor: '#34C759'") &&fc.includes('gap: HUD_BAR_GAP') && L.HUD_BAR_HEIGHT <= 20);
check('formcheck: the timer pill uses the real SF Symbol timer (SymbolView), no custom drawing', fc.includes('<SymbolView name="timer"') && !fc.includes('stopwatchPath'));
check('formcheck: NO record button any more (no white ring + black dot); a small glass Finish pill finishes the set', !fc.split('const wh = StyleSheet.create')[0].includes('stopCircleInner') && fc.includes('<Text style={s.finishTxt}>Finish</Text>') && fc.includes('void handleStop()'));
check('formcheck: the Cue stars (blue sparkle) sit LEFT of the Guide text inside the pill', fc.indexOf('<Image source={SPARKLE_DUO} style={s.pillStars} />') > 0 && fc.indexOf('<Image source={SPARKLE_DUO} style={s.pillStars} />') < fc.indexOf('<Text style={s.pillGuide}'));
check('formcheck: Ready. Go! sits at the pill height (up with it)', fc.includes('paddingTop: hud.pill.top'));
check('formcheck: Start your reps is wired once (createStartReps), never reset', fc.includes('createStartReps') && fc.includes('startRepsEngine.tick') && !fc.includes('startRepsEngine.reset'));
check('formcheck: the demo video drawer is still there', /instepdrawer\.html/.test(fc) && /DRAWER_PEEK_HEIGHT/.test(fc));
check('formcheck: the five glass pieces are real Liquid Glass (HudGlass / LiquidGlassButton), never a flat card', (fc.match(/<HudGlass/g) || []).length >= 4 && (fc.match(/<LiquidGlassButton/g) || []).length >= 4);
check('formcheck: brackets are 42 pt arms, 3 pt thick, 20 pt radius', /const SIZE = 42, BW = 3, R = 20;/.test(fc));
// round 10 (2026-11-25): the set bars are pure white, no colour
const setLines = fc.split('\n').filter((l) => /^\s+(setGlow|setFill|setFillOn|setFillOff):/.test(l));
check('set bars: done and current = pure white (#FFFFFF), upcoming = the same white dimmed; the fills are plain views drawn ON TOP of the glass, never children of it (a child of real glass is tinted by the picture behind: the hint of green / yellow)', setLines.length === 4 && fc.includes("setFillOn:  { backgroundColor: '#FFFFFF' }") && fc.includes("setFillOff: { backgroundColor: 'rgba(255,255,255,0.30)' }") && fc.includes('<HudGlass radius={layout.bar.height / 2} style={{ flex: 1, height: layout.bar.height }} />') && fc.includes('<View pointerEvents="none" style={[wh.setFill, on ? wh.setFillOn : wh.setFillOff]} />'));
check('set bars: no green or yellow colour in the set bar styles (only white and rgba 255,255,255)', setLines.every((l) => !/#(?!FFFFFF)[0-9a-f]{3,6}/i.test(l) && !/rgba\((?!255,255,255)/.test(l)) && !fc.includes('34C759'));
console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
process.exit(failed ? 1 : 0);
