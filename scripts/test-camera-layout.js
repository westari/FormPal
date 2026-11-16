#!/usr/bin/env node
/**
 * scripts/test-camera-layout.js
 *
 * The top of the camera screen (Ari 2026-11-16), top to bottom, nothing overlapping on any iPhone size:
 *   WORKOUT: top bar buttons > progress bar (Liquid Glass, rounded ends) > timer (Liquid Glass) > the big Camera confidence block (same as the solo form check)
 *   SOLO:    top bar buttons > the big Camera confidence block
 * The "Set 1 of 3" / "Next: ..." text is gone. The numbers are read from app/formcheck.tsx.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'formcheck.tsx'), 'utf8').split('\r\n').join('\n');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const num = (re) => parseFloat(re.exec(src)[1]);
const BAR_TOP = num(/HUD_BAR_TOP = ([0-9.]+)/), BAR_H = num(/HUD_BAR_H = ([0-9.]+)/);
const TIMER_H = num(/HUD_TIMER_H = ([0-9.]+)/), TIMER_W = num(/HUD_TIMER_W = ([0-9.]+)/);
const CONF_H = num(/CONF_BLOCK_H = ([0-9.]+)/);
const TIMER_TOP = BAR_TOP + BAR_H + 10, CONF_TOP = TIMER_TOP + TIMER_H + 10, GUIDE_TOP = CONF_TOP + CONF_H + 8;
const TOPBAR = [8, 52];
const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

check('the constants in the file are what the layout is built from (timer = bar + 10, confidence = timer + 10, guide box = confidence + 8)', /HUD_TIMER_TOP = HUD_BAR_TOP \+ HUD_BAR_H \+ 10/.test(src) && /HUD_CONF_TOP = HUD_TIMER_TOP \+ HUD_TIMER_H \+ 10/.test(src) && /HUD_GUIDE_TOP = HUD_CONF_TOP \+ CONF_BLOCK_H \+ 8/.test(src));
const phones = [['iPhone SE (375x667)', 375, 667, 20], ['iPhone 12 mini (375x812)', 375, 812, 50], ['iPhone 14 (390x844)', 390, 844, 47], ['iPhone 15 Pro (393x852)', 393, 852, 59], ['iPhone 16 Pro (402x874)', 402, 874, 62], ['iPhone 15 Pro Max (430x932)', 430, 932, 59]];
for (const [name, W, H, top] of phones) {
  const barW = Math.min(W * 0.86, 420), cx = W / 2;
  const boxes = {
    topBar: { l: 0, r: W, t: top + TOPBAR[0], b: top + TOPBAR[1] },
    progressBar: { l: cx - barW / 2, r: cx + barW / 2, t: top + BAR_TOP, b: top + BAR_TOP + BAR_H },
    timer: { l: cx - TIMER_W / 2, r: cx + TIMER_W / 2, t: top + TIMER_TOP, b: top + TIMER_TOP + TIMER_H },
    confidence: { l: cx - 130, r: cx + 130, t: top + CONF_TOP, b: top + CONF_TOP + CONF_H },
    guideBox: { l: 30, r: W - 30, t: top + GUIDE_TOP, b: H - 120 },
  };
  const names = Object.keys(boxes); const bad = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (hit(boxes[names[i]], boxes[names[j]])) bad.push(names[i] + ' x ' + names[j]);
  check(`WORKOUT ${name}: top bar, progress bar, timer, Camera confidence and the framing box never overlap`, bad.length === 0, bad.join(', '));
  check(`WORKOUT ${name}: the framing box keeps at least 40% of the screen height (${Math.round(boxes.guideBox.b - boxes.guideBox.t)} of ${H})`, boxes.guideBox.b - boxes.guideBox.t >= H * 0.4);
  const soloGuideTop = Math.max(H * 0.16, top + 56 + CONF_H + 8);
  check(`SOLO ${name}: the confidence block (${top + 56} to ${top + 56 + CONF_H}) is below the top bar (${top + TOPBAR[1]}) and above the framing box (${Math.round(soloGuideTop)})`, top + 56 > top + TOPBAR[1] && top + 56 + CONF_H < soloGuideTop);
}
check('the WORKOUT confidence block is the SAME component and look as the solo one (the big label + pill, no compact variant)', !/compact/.test(src.slice(src.indexOf('function TrackingMeter'), src.indexOf('// ─── Screen'))) && /top=\{hudActive \? insets\.top \+ HUD_CONF_TOP : insets\.top \+ 56\}/.test(src));
check('"Set 1 of 3" and "Next: ..." text are gone from the camera screen', !/Set \{completedSets \+ 1\} of/.test(src) && !/Next: \{nextLabel\}/.test(src));
check('the progress bar is a REAL Liquid Glass capsule with rounded ends (HudGlass radius 999) and rounded segment tracks', /<View style=\{\[wh\.barWrap/.test(src) && /<HudGlass radius=\{999\} style=\{wh\.barGlass\}>/.test(src) && /segTrack: \{[^}]*borderRadius: 999/.test(src) && /segFill:\s+\{[^}]*borderRadius: 999/.test(src));
check('the timer is under the bar, in Liquid Glass', /<HudGlass radius=\{999\} style=\{wh\.timerCapsule\}>/.test(src) && /timerWrap, \{ top: insets\.top \+ HUD_TIMER_TOP \}|\[wh\.timerWrap, \{ top: insets\.top \+ HUD_TIMER_TOP \}\]/.test(src));
check('HudGlass = real Liquid Glass where the build has it, the blur glass pill otherwise (never a flat white card)', /return <LiquidGlass radius=\{radius\} variant="regular" colorScheme="dark"/.test(src) && /return <GlassPanel radius=\{radius\} style=\{style\}>/.test(src));
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
