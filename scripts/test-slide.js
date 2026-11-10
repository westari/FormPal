#!/usr/bin/env node
/**
 * scripts/test-slide.js
 * The post-workout page changes (Workout complete -> rep feedback -> back, All sets, muscle page) are ONE normal iOS slide:
 * the new page slides in from the right, the page under it shifts left by a third of a screen and back, and the native
 * navigator adds no animation of its own on top (the stacked animations were the sideways fade).
 */
const fs = require('fs');
const path = require('path');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const w = read('components/WarmSurfaces.tsx'), l = read('app/_layout.tsx');
check('the page that opens slides in from the right (translateX from the screen width to 0, ease-out)', /tx\.setValue\(screenW\)[\s\S]{0,200}Animated\.timing\(tx, \{ toValue: 0, duration: SLIDE_IN_MS, easing: Easing\.out\(Easing\.cubic\)/.test(w));
check('closing slides it back out to the right', /Animated\.timing\(tx, \{ toValue: screenW, duration: SLIDE_OUT_MS/.test(w));
check('the page underneath follows the covering page: -30% of the screen when it is fully on top, 0 when it is gone', /inputRange: \[0, screenW\], outputRange: \[-screenW \* PARALLAX, 0\]/.test(w) && /const PARALLAX = 0\.3/.test(w));
// the interpolation itself, on the real numbers
const screenW = 390, P = 0.3, at = (tx) => -screenW * P * (1 - Math.min(1, Math.max(0, tx / screenW)));
check('math: covering page parked -> under page at 0; half way -> -58px; fully in -> -117px', at(screenW) === 0 && Math.round(at(screenW / 2)) === -58 && Math.round(at(0)) === -117, [at(screenW), at(screenW / 2), at(0)].map(Math.round).join(' / '));
check('a soft edge shadow is on the sliding page', /pushEdge: \{ shadowColor: '#000'/.test(w));
check('the native navigator adds NO animation of its own to recap and rep-feedback (no double motion)', /name="recap" options=\{\{ animation: 'none' \}\}/.test(l) && /name="rep-feedback" options=\{\{ animation: 'none' \}\}/.test(l));
check('no page uses a fade for these changes any more (the only fade left is workout/run, which was asked for)', !/animation: 'fade'/.test(l.replace(/<Stack\.Screen name="workout\/run"[^\n]*\n/, '')));
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
