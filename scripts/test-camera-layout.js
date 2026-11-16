#!/usr/bin/env node
/**
 * scripts/test-camera-layout.js
 *
 * The camera screen's old top-stack test (Ari 2026-11-16, first version) is replaced by Ari's new design: the layout numbers now live in
 * lib/cameraHudLayout.ts and scripts/test-camera-hud-layout.js checks six phone sizes. This file keeps the checks that still apply.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'formcheck.tsx'), 'utf8').split('\r\n').join('\n');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };

check('"Set 1 of 3" and "Next: ..." text are gone from the camera screen', !/Set \{completedSets \+ 1\} of/.test(src) && !/Next: \{nextLabel\}/.test(src));
check('the set bar is a REAL Liquid Glass track (HudGlass) with one rounded segment per set', /<HudGlass radius=\{layout\.bar\.height \/ 2\}/.test(src) && /Array\.from\(\{ length: targetSets \}\)/.test(src));
check('the timer is a Liquid Glass pill under the bar', /<HudGlass radius=\{layout\.timer\.height \/ 2\}/.test(src));
check('HudGlass = real Liquid Glass where the build has it, the blur glass pill otherwise (never a flat white card)', /return <LiquidGlass radius=\{radius\} variant="regular" colorScheme="dark"/.test(src) && /return <GlassPanel radius=\{radius\} style=\{style\}/.test(src));
check('the workout and the solo form check use the SAME confidence pill component', src.split('\n').filter((l) => l.trim() === '<TrackingMeter').length === 1);
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
