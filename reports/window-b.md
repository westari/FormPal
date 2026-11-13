# Window B report, 2026-11-13 (Ari's phone test)

Branch `work-b`. `git merge origin/overnight-build` ran first (clean).

## Which native build did the phone run?

**The OLD Oct 8 build again** (master at 23ea174). The log has no `[AWAKE] native` line and no `[REP-QUALITY]` line; both come from native code written after Oct 8. So none of the native work (keep-awake keeper, video fix, expo-brightness, REP-QUALITY) was on the phone. Everything below that is JS runs on both builds. Next build: run "iOS Dev Build" on `overnight-build`, not `master`.

**Movement Match is NOT broken on the old build.** The log has 78 `[MOVE-MATCH]` lines: score 0 while he stood still, 82 to 96 TRYING while he pressed. So "Movement Match is not firing on the phone" is not what the log shows. What happened is below (item 6).

## The Guide and the Coach (items 1 to 6)

All six replayed on this log with `scripts/test-guide-coach-1113.js` (13 checks, all pass) plus the old suites.

1. **Before Ready the Guide showed only stars: done.** Cause (found in code, not on the phone): last round I gave the card a fixed 88% width and made the text `flex: 1`. Inside the setup panel (which has no width of its own) the text collapsed to zero width. The live Guide (different container) was fine, which matches what you saw. The card is content-sized again with a minimum width. I could not render React Native layout here, so this is a code diagnosis; the test checks the source rules and the phone will show it.
2. **"Step back further" while you did not move, and confidence rising by itself: done.** The camera's own "step back / no person" signal flickers while you stand still: the log shows it on at 01:06:38 and off at 01:06:41, the number fell 100 to 35 and rose back to 100, and the Guide said "Step back further" for 4 seconds. That signal now only counts after it has held 1.5 seconds, for both the words and the number (`createCueHold`, placeholder). A real loss of you (3 s) still shows. Tested: a 1.4 s flicker never reaches the screen, a 3 s one does.
3. **~3 full reps with no checks: done as far as the log shows.** In this log every counted rep (9 of 9) got its check or the form X, so the Coach was not skipping them. One real gap fixed: a counted rep could be held back if another verdict had appeared in the last 1.2 s; now a counted rep always gets its check. If it happened on a rep the engine did NOT count (your bottom at 62 to 66 with the line at 50), that is not a counted rep: it now gets the "Go lower" X (see 5), because the engine cannot count it.
4. **Standing still got "Go lower": done.** That X (01:07:02) came from a 0.37 rep-span wiggle after your 3rd rep, while the 10 s Movement Match still remembered the reps (score 87). A stroke under 0.4 of a rep span is now never an X (`minAttemptStrokeR`, placeholder), and the log shows why: `[COACH] withheld: the stroke was tiny`. Movement Match LOW still blocks every verdict.
5. **Half reps got no X: done.** The attempt detector was throwing real half reps out: "ignored ... too slow to be a rep (12.4s)" because it counted the rest before the stroke as part of the stroke, and "stays up near the top" for lows of 73 (limit was 71.75). Fixed both (stroke length is the rise plus the drop; low limit 0.95 of the range) and an X no longer needs the 10 s score to be HIGH when the stroke is a real size (a half rep dips that score). Outcomes resolve after 0.6 s (was 1.5 s), so the X is not late. On the replay a real half rep (low 73, high 85) now gets "Go lower". I cannot promise EVERY half rep: the camera feed in this log is about 2.5 readings a second, and a fast stroke is only 3 readings.
6. **10 seconds of trying, Guide silent: done.** Two causes. (a) For "the camera sees the whole path, the strokes are just short" the Guide was told to stay silent; it now says "Keep your hands in view" (hands exercises) or "Keep your whole body in view". That is the one honest nudge when no exact cause is found; the log line says "no exact cause found, general framing nudge". (b) The stuck clock ran while you stood still, because the 10 s score remembers reps. A new `movingNow` signal (last 2.5 s) means a rest is never "stuck". Replay: when stuck and moving the Guide is never silent for more than 1 s; when still there is no stuck line.

## Camera look (7, 8)

7. **Ready / Go look: done, but check it is the look you meant.** The code had changed from the original card (big green check, green "Ready. Go!") to the shared white-text cue pill on Nov 3. I restored the original card (40pt green check, green 21pt bold text, glass pill). If you meant a different earlier look, tell me which day.
8. **Coach text readable on any background: done.** The reason under the X now sits on a dark pill (78% near-black, thin light rim) with 25pt white bold text. Contrast over a pure white wall: 10.3 to 1.

## Rep feedback (9 to 11)

9. **"Finish" and the strong haptic: done.** The last rep's button says "Finish" (the others say "Next rep"). Tapping it fires `hapticFinish()`: impact Heavy plus notification Success, the one exception to the soft-haptics rule (lib/haptics.ts). Playwright proves the label and that the tap posts `finishReview`; the haptic itself needs your hand.
10. **Liquid Glass controls: done for the video controls; the back and All sets buttons already were.** Back 10 s, forward 10 s and pause now use `LiquidGlassButton` (real Liquid Glass, same component as the back and All sets buttons). Those two buttons were already real glass in `WarmSurfaces.tsx`. If they still look flat, the phone's native build has no glass: the app now logs `[GLASS] real Liquid Glass: ON/OFF` at start, so the next log settles it (then the fix is a new build, not code). On a build without glass the video controls keep the old blur disc rather than a flat grey one.
11. **Summary card not pressable: done.** Reproduced first: one tap turned it from rgb(244,244,246) to rgb(17,17,20) (black). It now has `pointer-events: none`; the same tap changes nothing.

## Finish to Today's progress (12)

12. **White wash then live fill-up: done, about 2 seconds.** After Finish: a white wash sweeps up the screen (700 ms, drawn in `WarmSurfaces.tsx`), and when it covers the screen (380 ms) Today's progress starts to fill for 1.5 s: rows appear one after another, reps count up, "to Gold" counts down, bars slide forward, the header number and the overall bar rise, muscles light up one after another on the body. A tap anywhere skips to the end and does nothing else (it cannot press Done). The page waits empty until the wash arrives; if the app never starts it, it starts itself after 4.5 s. Playwright (real page): armed state is empty, half way the numbers are between empty and final, it ends at the exact final numbers, a tap on Done during the fill only skips. Screenshots in `.scratch/fill-mid.png`, `.scratch/fill-end.png`. The wash itself is React Native and only provable on the phone.

## Ranks, clearer (13, 14)

13. **Rows in reps: done.** "Shoulders  +28 reps · 122 to Silver" with a bar (the bar is the muscle's progress to its own next rank, moving from where it was to where it is). 1 to 3 muscles are one per line; 4 to 6 sit two per line; more than 6: the six biggest show (the note says "and N more moved up"). Only good reps count and logged reps stay half credit (the reps are the muscle volume after minus before, the same numbers the ranks use).
14. **Overall has its own section: done.** "Overall rank: Bronze", its bar, "+X% today" on the right, and the small line "The average of all 11 muscles. Train the gray ones to raise it." The body shows every muscle with any good reps bright (in its own rank colour) and every untrained muscle grey. Math untouched.

## Also fixed (found while reading the log)

- **Orphan-clip adoption (last round) copied 19 old clips, about 240 MB, from July to October into permanent storage** (log 01:01:01). It now only adopts clips from the last 30 days (what the 30-day clean-up keeps). The video itself worked this time: `[VIDEO] stop: camera returned a clip`, and the rep feedback page had the video.
- The screen stayed awake this whole session (98 s of tracking, `[AWAKE]` lines every 15 s). The earlier dimming is still unexplained; the native keep-awake needs the new build.
- Two old tests changed because their rules changed: a "tiny wiggle" in `test-attempts.js` (it swung 0.45 of a range, the size of a real half rep) is now a true 7-degree wiggle.

## Tests

- New: `scripts/test-guide-coach-1113.js` (replays this log), `scripts/test-fill-up.js` (the fill-up, 31 checks on the real design file), `scripts/test-rep-review-1113.js` (Finish label, Summary pill, glass controls, Ready look, Coach pill). Real log saved as `scripts/fixtures/shoulder-press-2026-11-13.log.txt`.
- Updated: `test-muscle-ranks.js`, `test-setup-guide.js`, `test-movement-match.js`, `test-attempts.js`, `test-workout-video.js`.
- `npx tsc --noEmit`: same 28 old errors, none new.

## Phone test (after the build, JS parts are live now)

1. Open the camera: the setup line shows words (not only stars) from the first second.
2. Stand still 10 s after Go: no "Step back" line, the number does not swing.
3. Do 3 full reps: a check on each. Do 3 half reps (arms only half way down): an X on each with "Go lower".
4. Press hard for 10 s with nothing counting (arms stay high): a Guide line appears.
5. Last rep review: button says Finish, tap it: you feel a strong thump, a white wash rises, the numbers fill up, tap skips.
6. Look at the video controls and the top buttons: send me the log line `[GLASS] real Liquid Glass:`.

## Questions for Ari (end)

- Item 7: is the original Ready card (green check, green text) the look you meant, or an earlier one?
- Items 12 to 14 changed a design file's page by injection only (the .html is untouched); more than 6 muscles in one workout shows the six biggest. OK?

## Blocked (hook blocks deletes): list for Ari to delete

- `.scratch\edit-tlt*.js` (two scripts), Window A's `scripts\test-home-clean.js`, the `.scratch` folder, `train_wk_webkit.png`. Optional: `git rm lib\screenHaptics.ts`.
- `.scratch\runall.sh`, `.scratch\runall.out`, `.scratch\replay13.js`, `.scratch\summary-before.js`, `.scratch\fix-test-mr*.js` (my scratch files).

HQ: Fixed Guide, Coach, rep review, fill-up animation and rank rows; Ready look needs your check.
