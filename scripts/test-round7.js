#!/usr/bin/env node
/**
 * scripts/test-round7.js
 * Round 7 items that are code-order checks (React Native cannot run under node; the phone log lines named here prove them live):
 *  7. All sets then Back returns to the rep feedback it was opened from
 *  8. the Edit sheet on the workout preview opens instantly (its animations start in the tap itself, the cards are not redrawn)
 *  9. the music page has a small smooth entrance
 * 10. the SESSION LOG review screen is gone from the flow, the log is still collected
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\r\n').join('\n');
let failed = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`); if (!ok) failed++; };

// ── 7 ──
const rc = read('app/recap.tsx');
check('7: opening All sets from the rep feedback remembers it (a flag set when the rep feedback asked for All sets)', /repFeedbackSignal\.openAllSets = false;\s*allSetsFromRepFeedback\.current = true;/.test(rc));
check('7: All sets opened from the summary page forgets it (Back there still goes to the summary)', /msg\.type === 'viewAllSets'\) \{ allSetsFromRepFeedback\.current = false; setView\('allsets'\); \}/.test(rc));
check('7: Back from All sets (closeAllSets) goes BACK to the rep feedback when it came from there, once, and not to the complete screen', /msg\.type === 'closeAllSets'\) \{\s*setView\('summary'\);[\s\S]{0,300}if \(allSetsFromRepFeedback\.current\) \{ allSetsFromRepFeedback\.current = false;[\s\S]{0,200}onWebMsg\.current\(\{ type: 'viewRepFeedback' \}\)/.test(rc));
check('7: the phone log proves it: "[LAG] recap: All sets back -> returning to the rep feedback" (then the rep-feedback MOUNT line)', rc.includes('recap: All sets back -> returning to the rep feedback'));

// ── 8 ──
const wp = read('app/workout/index.tsx');
check('8: the sheet\'s two native animations start INSIDE openEdit (the tap), before the screen is drawn again, not from an effect after it', /const runSheet = \(to: 0 \| 1\) =>/.test(wp) && /const openEdit = useCallback\(\(i: number\) => \{[\s\S]{0,200}runSheet\(1\);[\s\S]{0,700}setEditing\(i\);/.test(wp) && !/useEffect\(\(\) => \{\s*const to = editing != null/.test(wp));
check('8: closing (Done, the X, the grab bar, the dim) starts the closing animation at once too', /const closeEdit = \(\) => \{ runSheet\(0\); setEditing\(null\); \};/.test(wp) && !/setEditing\(null\)/.test(wp.replace('const closeEdit = () => { runSheet(0); setEditing(null); };', '')));
check('8: the exercise cards are memoised (opening the sheet does not draw them again) and the open handler never changes', /const ExCard = React\.memo\(function ExCard/.test(wp) && /onEdit=\{openEdit\}/.test(wp) && /useCallback\(\(i: number\) =>/.test(wp));
check('8 (round 11): the sliding sheet is cheap to draw: no overflow clip and no blurred shadow on it (both are redrawn every frame while it moves), and it is rasterised once (shouldRasterizeIOS)', /<Animated\.View shouldRasterizeIOS[^>]*testID="edit-sheet"/.test(wp) && !/overflow: 'hidden'/.test(wp.slice(wp.indexOf('  sheet: {'), wp.indexOf('grabHit'))) && !/boxShadow/.test(wp.slice(wp.indexOf('  sheet: {'), wp.indexOf('grabHit'))));
check('8 (round 11): the phone log proves the cause next time: "[PREVIEW] edit sheet: pencil tapped, slide started Nms after the tap" and "screen redrawn Nms after the tap"', /\[PREVIEW\] edit sheet: pencil tapped, slide started/.test(wp) && /\[PREVIEW\] edit sheet: screen redrawn/.test(wp));
check('8: still two native-driver animations of 220ms, no Modal', /SHEET_MS = 220/.test(wp) && !/<Modal/.test(wp) && (wp.match(/useNativeDriver: true/g) || []).length >= 2);

// ── 9 ──
const run = read('app/workout/run.tsx');
check('9: the music page eases in: it rises a few points while it fades in, 420ms, native driver (small and smooth)', /MUSIC_ENTER_MS = 420/.test(run) && /MUSIC_ENTER_RISE = 14/.test(run) && /Animated\.timing\(pageFade, \{ toValue: 1, duration: MUSIC_ENTER_MS, easing: Easing\.out\(Easing\.cubic\), useNativeDriver: true \}\)/.test(run) && /translateY: pageFade\.interpolate\(\{ inputRange: \[0, 1\], outputRange: \[MUSIC_ENTER_RISE, 0\] \}\)/.test(run));
check('9: it starts only when the page is final (musicShown), as before, so nothing jumps', /m === 'musicShown'\) \{[\s\S]{0,400}MUSIC_ENTER_MS/.test(run));

// ── 10 ──
const fc = read('app/formcheck.tsx');
const stop = fc.slice(fc.indexOf('const handleStop = useCallback'), fc.indexOf('const handleReviewDone'));
check('10: Finish no longer opens the SESSION LOG review screen: handleStop goes straight to the next screen', !/setPhase\('review'\)/.test(stop) && /doNavigate\(navParams\);\s*\}, \[doNavigate, returnTo, repCounterOnly\]\);/.test(stop));
check('10: nothing else switches to the review phase', !/setPhase\('review'\)/.test(fc));
check('10: the log is still collected quietly (every line pushed to the session buffer and the dev log), with one line saying how much was kept: "[SESSION-LOG] N lines kept quietly"', /sessionLogRef\.current\.push\(e\.message\)/.test(fc) && /\[SESSION-LOG\] \$\{sessionLogRef\.current\.length\} lines kept quietly/.test(stop) && /console\.log\('\[DEBUG\]', e\.message\)/.test(fc));
console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
