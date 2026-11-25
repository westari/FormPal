#!/usr/bin/env node
/**
 * scripts/test-formcheck-open-and-leave.js
 *
 * Ari 2026-11-22:
 *   4. Form check: the demo video strip at the bottom was covered by a white card for about 5 seconds when the screen opened. The drawer's page
 *      (instepdrawer.html) loads late and its WebView is white until it paints. Now: the strip is drawn natively from the first frame, the page loads hidden
 *      behind it from the moment the screen opens (not only once setup starts), the file is warmed at app start, and the page shows once loaded.
 *   5. After Finish review -> Continue a couple of screens flashed before the tab appeared. The done screen fades away over what is underneath, but the rep feedback
 *      page faded out and then the Workout complete card showed for a moment (each its own animation). Now everything underneath is hidden in the same frame and the
 *      stack is popped back to the tabs (the tab he started from).
 * A WebView cannot be run here, so these are source checks plus the log lines that prove it on the phone.
 */
const fs = require('fs'); const path = require('path');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  -> ' + detail : ''}`); if (!ok) failed++; };
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split('\r\n').join('\n');
const fc = read('app/formcheck.tsx'), rf = read('app/rep-feedback.tsx'), ws = read('components/WarmSurfaces.tsx'), dpw = read('components/DesignPrewarm.tsx');

console.log('--- 4. the demo strip is there from the first frame ---');
const dStart = fc.indexOf("{phase !== 'review' && (\n        <Animated.View\n          style={{\n            position: 'absolute', left: 0, right: 0, bottom: 0, height: DRAWER_HEIGHT,");
const dEnd = fc.indexOf('{/* ── Post-session debug log review', dStart);
const drawer = dStart > 0 ? fc.slice(dStart, dEnd) : '';
check('the drawer is mounted from the first frame (any phase but the review), not only once setup has started', dStart > 0 && !/stopButtonActive &&/.test(fc.slice(Math.max(0, dStart - 60), dStart + 20)));
check('a native strip (DrawerPeekPlaceholder: dark card, handle, "Demo video", exercise chip) is drawn under the page', drawer.includes('<DrawerPeekPlaceholder') && fc.includes('Demo video</Text>') && fc.includes("backgroundColor: '#111114'"));
check('the page is HIDDEN (opacity 0) until it has loaded, so its white loading screen never shows', drawer.includes("opacity: drawerReady ? 1 : 0") && drawer.includes('onLoadEnd') && !/backgroundColor: '#ffffff'/.test(drawer));
check('the page is cached (a changed design file is a new asset URL with a new hash)', /cacheEnabled\s*\n\s*\/>/.test(drawer) && !/cacheEnabled=\{false\}/.test(drawer));
check('a log line tells how long the page took: [DRAWER] demo page loaded N ms after the screen opened', fc.includes("[DRAWER] demo page loaded '"));
check('the drawer file is warmed at app start (DesignPrewarm)', dpw.includes("instepdrawer.html"));
check('opening and dragging the drawer still work (pan handler, drawerY, scrim untouched)', drawer.includes('drawerPanResponder.panHandlers') && drawer.includes('translateY: drawerY') && fc.includes("outputRange: [0.6, 0]"));

console.log('--- 5. Finish -> Continue goes straight back, no flashes ---');
const oc = rf.indexOf('onContinue: () => {', rf.indexOf('title: DONE_TITLES.formCheck'));
const ocLine = rf.slice(oc, rf.indexOf('\n', oc));
check("Continue hides every warm page at once (warmHideNow) and then pops the stack with dismissAll", /warmHideNow\(\['repfeedback', 'recap', 'ranks', 'allsets'\]\); repFeedbackSignal\.onLeaveNow\?\.\(\); router\.dismissAll\(\)/.test(ocLine) && read('app/recap.tsx').includes('repFeedbackSignal.onLeaveNow = () => { try { videoFade.stopAnimation(); videoFade.setValue(0); videoPlayer.pause();'), ocLine);
check('...it no longer fades the rep feedback page out first (warmDeactivate then dismissAll)', !/warmDeactivate\('repfeedback'\); router\.dismissAll/.test(ocLine));
check('WarmSurfaces: warmHideNow marks the layers and a marked layer is parked in the same frame (no fade, no slide)', /export function warmHideNow\(kinds: WarmKind\[\]\)/.test(ws) && /const instant = !!instantHide\[k\]; instantHide\[k\] = false;/.test(ws) && /if \(instant\) \{[^\n]*park\(\); \}\n\s*else if \(FADES\[k\] && SLIDES_OUT\[k\]\)/.test(ws));
check('a page that was not on screen cannot leave a stale "instant" mark that makes a later normal hide instant', /setTimeout\(\(\) => \{ instantHide\[k\] = false; \}, 800\)/.test(ws));
check('the routes themselves have no transition (animation none), so nothing slides while the stack pops', /name="recap" options=\{\{ animation: 'none' \}\}/.test(read('app/_layout.tsx')) && /name="rep-feedback" options=\{\{ animation: 'none' \}\}/.test(read('app/_layout.tsx')));
check('a log line proves it on the phone: [LEAVE] ... and [warm:...] hidden INSTANTLY', rf.includes("[LEAVE] form check Continue") && ws.includes('hidden INSTANTLY'));
check('a real workout\'s Finish review path is untouched (muscle page, no dismissAll)', /repFeedbackSignal\.onFinishReview\?\.\(\);\n\s*warmDeactivate\('repfeedback'\);\n\s*router\.back\(\);/.test(rf));

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
