#!/usr/bin/env node
/**
 * scripts/test-slide.js
 * UPDATE: Workout complete (recap) and All sets now open with a plain FADE (no sideways motion at all); rep feedback and the
 * muscle page keep the one normal iOS slide described below.
 * The post-workout page changes (Workout complete -> rep feedback -> back, All sets, muscle page) are ONE normal iOS slide:
 * the new page slides in from the right, the page under it shifts left by a third of a screen and back, and the native
 * navigator adds no animation of its own on top (the stacked animations were the sideways fade).
 */
const fs = require('fs');
const path = require('path');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n'); // files can be CRLF or LF
const w = read('components/WarmSurfaces.tsx'), l = read('app/_layout.tsx');
check('a slide page (rep feedback / muscle page) slides in from the right (translateX from the screen width to 0, ease-out)', /tx\.setValue\(screenW\)[\s\S]{0,200}Animated\.timing\(tx, \{ toValue: 0, duration: SLIDE_IN_MS, easing: Easing\.out\(Easing\.cubic\)/.test(w));
check('closing slides it back out to the right', /Animated\.timing\(tx, \{ toValue: screenW, duration: SLIDE_OUT_MS/.test(w));
check('the page underneath follows the covering page: -30% of the screen when it is fully on top, 0 when it is gone', /inputRange: \[0, screenW\], outputRange: \[-screenW \* PARALLAX, 0\]/.test(w) && /const PARALLAX = 0\.3/.test(w));
// the interpolation itself, on the real numbers
const screenW = 390, P = 0.3, at = (tx) => -screenW * P * (1 - Math.min(1, Math.max(0, tx / screenW)));
check('math: covering page parked -> under page at 0; half way -> -58px; fully in -> -117px', at(screenW) === 0 && Math.round(at(screenW / 2)) === -58 && Math.round(at(0)) === -117, [at(screenW), at(screenW / 2), at(0)].map(Math.round).join(' / '));
check('the post-workout pages (recap, rep feedback, the muscle page / Finish review) are FADE pages; ALL SETS (round 11, Ari: a clean normal screen transition) slides in like a pushed screen', /export const FADES[^=]*= \{ recap: true, allsets: false, ranks: true, repfeedback: true \}/.test(w));
check('a fading page opens by animating opacity 0 -> 1 with the sideways position pinned at 0 (never a translate)', /FADES\[k\]\) \{[\s\S]{0,200}tx\.setValue\(0\);\s*fade\.setValue\(0\);\s*setShown\(true\);\s*Animated\.timing\(fade, \{ toValue: 1, duration: FADE_IN_MS/.test(w));
check('a fading page closes by fading out (All sets), not by sliding', /FADES\[k\] && SLIDES_OUT\[k\]\) Animated\.timing\(fade, \{ toValue: 0, duration: FADE_OUT_MS/.test(w));
check('a fading page never moves the page under it (it does not register a sliding value)', /if \(!FADES\[k\]\) TX\[k\] = tx/.test(w));
check('the layer\'s OWN opacity is always a plain number (never switched between an animated value and a number: that left the Workout complete card on top of rep feedback); the fade is on an inner view; no slide shadow on a fading page', /\{ opacity: shown && !beneathHidden \? 1 : LAYER_OPACITY_HIDDEN, transform:/.test(w) && /<Animated\.View style=\{\[StyleSheet\.absoluteFill, FADES\[k\] \? \{ opacity: fade \} : null\]\}>/.test(w) && !/opacity: shown && !beneathHidden \? \(FADES/.test(w) && /\{!FADES\[k\] \? <LinearGradient pointerEvents=\"none\"[^\n]*style=\{edgeStyles\.pushEdge\}/.test(w));
check('the glass back / All sets buttons are drawn OUTSIDE the animated-opacity view (siblings of the faded page, never inside it)', (() => { const a = w.indexOf('</Animated.View>\n      {shown && overlay'); const g = w.indexOf('<GlassChrome k={k} c={chrome} />'); const open = w.indexOf('<Animated.View style={[StyleSheet.absoluteFill, FADES[k]'); return open > 0 && a > open && g > a; })());
check('round 12: the soft edge on the sliding page is a STATIC gradient strip, not a live shadow (a blurred shadow on a moving full-screen view is redrawn every frame: the All sets lag)', /pushEdge: \{ position: 'absolute', top: 0, bottom: 0, left: -16, width: 16 \}/.test(w) && !/shadowRadius/.test(w.slice(w.indexOf('const edgeStyles'), w.indexOf('const edgeStyles') + 600)) && /useNativeDriver: true \}\)\.start\(\);\n        \}\n      \}/.test(w));
check('the native navigator adds NO animation of its own to recap and rep-feedback (no double motion)', /name="recap" options=\{\{ animation: 'none' \}\}/.test(l) && /name="rep-feedback" options=\{\{ animation: 'none' \}\}/.test(l));
check('no page uses a fade for these changes any more (the only fade left is workout/run, which was asked for)', !/animation: 'fade'/.test(l.replace(/<Stack\.Screen name="workout\/run"[^\n]*\n/, '')));
{
  // round 13: the All sets slide, from the phone log (20:23:32): the slide started 25ms after the tap with the page already warm and ready, but at the
  // same moment (1) the recap video was paused and faded out under the two moving pages and (2) the page re-sent the video tile's place, which rebuilt
  // the clipped, rounded video frame under the page during the slide.
  const r = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', 'recap.tsx'), 'utf8');
  check('round 13: All sets slides in over the video WITHOUT pausing or fading it during the slide: it is paused once the page fully covers it (after SLIDE_IN_MS), no fade', /view === 'allsets' && isFocused\) \{[\s\S]{0,700}setTimeout\(\(\) => \{\s*videoPlayer\.pause\(\); videoFade\.setValue\(0\);[\s\S]{0,200}\}, SLIDE_IN_MS \+ 60\);\s*return \(\) => clearTimeout\(t\);/.test(r));
  check('round 13: the same tile place sent again changes nothing (no rebuild under the page during the slide)', /setTileRect\(\(c\) => \(m\.none \? null : c && c\.l === m\.l && c\.t === m\.t/.test(r));
  check('round 13: the video frame under the tile is ONE rounded image (its own corner radius), no rounded clipping view around it', /<ExpoImage source=\{thumb\} style=\{\{ position: 'absolute', left: tileRect\.l, [^}]*borderRadius: 22/.test(r) && !/borderRadius: 22, overflow: 'hidden', backgroundColor: '#18181c'/.test(r));
  check('round 13: the soft edge strip is always mounted on a sliding page (nothing is created as the slide starts)', /\{!FADES\[k\] \? <LinearGradient/.test(w));
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
check('8: while rep feedback (transparent over the video) is up, the page under it is hidden at once, not after a delay (no Workout complete card flashing behind it)', w.includes("if (coverKind === 'repfeedback') { setBeneathHidden(true); return; }"));
check('7: the live cue under the check / X uses the same font as the rest of the camera screen (PlusJakartaSans), not Bricolage', (() => { const r = read('components/RepFeedback.tsx'); return r.includes("fontFamily: 'PlusJakartaSans_700Bold'") && !/Bricolage/.test(r); })());
