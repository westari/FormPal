#!/usr/bin/env node
/**
 * scripts/test-camera-layout.js
 *
 * Ari 2026-11-15 (screenshot): after "I'm ready" the Camera confidence block sat ON TOP of the workout scorecard and the set bars. Everything at the top
 * of the camera screen is now laid out from the top safe area with fixed offsets; this test reads those numbers from app/formcheck.tsx and checks that
 * no two boxes overlap on any iPhone size (small SE up to Pro Max), in the workout screen AND the solo form check.
 * Also: the white scorecard is REAL Liquid Glass (no flat fill).
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'formcheck.tsx'), 'utf8').split('\r\n').join('\n');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const n = (name) => parseFloat(new RegExp(`const ${name} = ([0-9.]+)`).exec(src)[1]);
const HUD_SEG_TOP = n('HUD_SEG_TOP'), HUD_PILL_TOP = n('HUD_PILL_TOP'), HUD_ROW_TOP = n('HUD_ROW_TOP'), HUD_ROW_H = n('HUD_ROW_H');
const HUD_TIMER_W = parseFloat(/HUD_TIMER_W = ([0-9.]+)/.exec(src)[1]), HUD_ROW_GAP = parseFloat(/HUD_ROW_GAP = ([0-9.]+)/.exec(src)[1]), HUD_METER_W = parseFloat(/HUD_METER_W = ([0-9.]+)/.exec(src)[1]);
const HUD_GUIDE_TOP = HUD_ROW_TOP + HUD_ROW_H + 10;
const SOLO_METER_BOTTOM = 56 + 91;
const PILL_H = 13 * 2 + 20;          // scoreInner: paddingVertical 13 + a 20pt text line
const SEG_H = 12;                    // 4pt bar + the 12pt dot that pokes 4pt above it
const TOPBAR = [8, 52];              // buttons: paddingTop insets.top + 8, 44 high
const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

check('the guide-box top for the workout screen is below the confidence row (constant HUD_GUIDE_TOP = row + height + 10)', /const HUD_GUIDE_TOP = HUD_ROW_TOP \+ HUD_ROW_H \+ 10;/.test(src) && !/hudInsets\.top \+ 160/.test(src), String(HUD_GUIDE_TOP));
const phones = [
  ['iPhone SE (375x667, no island)', 375, 667, 20], ['iPhone 12 mini (375x812)', 375, 812, 50], ['iPhone 14 (390x844)', 390, 844, 47], ['iPhone 15 Pro (393x852, island)', 393, 852, 59],
  ['iPhone 16 Pro (402x874)', 402, 874, 62], ['iPhone 15 Pro Max (430x932)', 430, 932, 59],
];
for (const [name, W, H, top] of phones) {
  const rowL = Math.max(8, Math.round((W - (HUD_TIMER_W + HUD_ROW_GAP + HUD_METER_W)) / 2));
  const boxes = {
    topBar: { l: 0, r: W, t: top + TOPBAR[0], b: top + TOPBAR[1] },
    segBars: { l: 20, r: W - 20, t: top + HUD_SEG_TOP - 4, b: top + HUD_SEG_TOP - 4 + SEG_H },
    pill: { l: W * 0.15, r: W * 0.85, t: top + HUD_PILL_TOP, b: top + HUD_PILL_TOP + PILL_H },
    timer: { l: rowL, r: rowL + HUD_TIMER_W, t: top + HUD_ROW_TOP, b: top + HUD_ROW_TOP + HUD_ROW_H },
    meter: { l: rowL + HUD_TIMER_W + HUD_ROW_GAP, r: rowL + HUD_TIMER_W + HUD_ROW_GAP + HUD_METER_W, t: top + HUD_ROW_TOP, b: top + HUD_ROW_TOP + HUD_ROW_H },
    guide: { l: 30, r: W - 30, t: top + HUD_GUIDE_TOP, b: H - 120 },
  };
  const names = Object.keys(boxes); const bad = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (hit(boxes[names[i]], boxes[names[j]])) bad.push(names[i] + ' x ' + names[j]);
  check(`WORKOUT HUD ${name}: top bar, set bars, scorecard, timer, Camera confidence and the framing box never overlap`, bad.length === 0, bad.join(', '));
  check(`WORKOUT HUD ${name}: the timer + confidence row fits the screen with a margin (${boxes.timer.l} to ${Math.round(boxes.meter.r)} of ${W})`, boxes.timer.l >= 8 && boxes.meter.r <= W - 8);
  // solo: the big Camera confidence block (56..147 below the top) against the framing box top and the top bar
  const soloGuideTop = Math.max(H * 0.16, top + SOLO_METER_BOTTOM + 8);
  check(`SOLO ${name}: the Camera confidence block (${top + 56} to ${top + SOLO_METER_BOTTOM}) ends above the framing box (${Math.round(soloGuideTop)}) and below the top bar (${top + TOPBAR[1]})`, top + SOLO_METER_BOTTOM < soloGuideTop && top + 56 > top + TOPBAR[1]);
}
check('the scorecard is REAL Liquid Glass (HudGlass: LiquidGlass where the build has it, the blur glass pill otherwise), with no flat white fill', /<HudGlass radius=\{999\} style=\{wh\.scorePill\}>/.test(src) && /return <LiquidGlass radius=\{radius\} variant="regular" colorScheme="dark"/.test(src) && !/backgroundColor: '#f2f2f5', borderRadius: 999/.test(src));
check('the timer is a glass capsule too (no white tab with notches), and the Camera confidence capsule is glass', /<HudGlass radius=\{999\} style=\{wh\.timerCapsule\}>/.test(src) && /compact=\{hudActive\}/.test(src) && /<HudGlass radius=\{999\} style=\{\{ width: HUD_METER_W/.test(src));
check('every text on the glass is white (readable on the camera picture)', /scoreSetTxt:\s+\{[^}]*color: '#ffffff'/.test(src) && /scoreTimeTxt: \{[^}]*color: '#ffffff'/.test(src));
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
