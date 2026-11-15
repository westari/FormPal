# Window B report, 2026-11-15 (second round: one judge)

Branch `work-b`. `git merge origin/overnight-build` ran first (already up to date).

## Which native build did the phone run?

**The OLD Oct 8 build** (no `[AWAKE] native` and no `[REP-QUALITY]` line in the log). The newest `latest.log` is still the 18:39 UTC session I replayed last time; it has no new camera session. Part 1, bugs 7 to 10 are JavaScript and work now. Part 2 (half reps) is Swift and arrives with the next iOS Dev Build on `overnight-build`.

## PART 1 - ONE JUDGE (JS, works today): done

1. **The Coach shows a check or X ONLY from native events.** In `app/formcheck.tsx` the attempt detector's handler is now `(_evs) => { /* nothing on screen */ }`. Removed: its power to show an X, add a soft rep, and take a counted rep back. The Coach (`lib/guideCoach.ts`) now has two sources only: `native` (a counted rep: a check, or an X with its form reason) and `missed` (a half rep from the engine, Part 2). A check or X is created in exactly two places in the screen (the rep listener and the missed-attempt listener). One verdict per event; a missed stroke is also withheld if a verdict was shown in the last 1.2 s, so an X and a check can never land 0.1 s apart.
2. **Movement Match and the Guide are unchanged** (setup tips, tip rotation, hidden during a verdict). The attempt detector still runs and feeds Movement Match's path-cut signal and the log lines.
3. **Proof, by replaying Ari's newest log** (`scripts/test-one-judge.js`, also the older 11-13 log): every counted rep gets exactly one verdict; no two verdicts closer than 1.2 s unless both are counted reps; no verdict at a moment Movement Match calls "not trying"; no X while the arms rest flat; only native sources judge. On the 11-15 log: 8 reps, 8 check verdicts, 7 half-rep X (all "Go lower": the bottom was short, the top was reached every time).

## PART 2 - HALF REPS IN THE ENGINE (Swift, next build): written, NOT compiled

4. **`ExerciseEngine.swift`**: a small stroke tracker (`trackAttempt`, `finishAttempt`, `resetAttemptTracker`) runs on every trusted frame while the engine waits at the top (after the suppressed and pose-gap guards). A stroke starts when the metric falls 15% of the range below its running top and ends when it rises 15% of the range above its low. If it covered at least **35% of the exercise's range (|topAngle - goodROM|)**, lasted 3+ frames and 0.25 s+, and never went below the enter line (so it never became a rep), it fires ONE `onAttemptMissed(reason, reached, needed)` at the moment the stroke ends. `reason` is `short_bottom` (low never reached the enter line) or `short_top` (the stroke began from a peak lower than topAngle minus 20% of the range); whichever end is further from its line, as a share of the range. A stroke below 35% is noise: no event. The tracker is reset when a rep starts and while a rep is in progress. **All five numbers are placeholders**, labelled in the code and in the log line `[ATTEMPT-MISSED] ...` (tune them from that line).
   Note: I measure the stroke against the exercise's own range, not the running top. Early in a set the running top is small and tiny wobbles looked like a big share of it.
   `ATHLTCameraModule.swift`: new event `onAttemptMissed` in the Events list, wired from the engine, sends `reason`, `reached`, `needed`, `timestamp`.
5. **JS shows it through the same verdict path as a counted rep** (`addAttemptMissedListener` in `modules/athlt-camera/src/index.ts`): X + "Go higher" (`short_top`) or "Go lower" (`short_bottom`), after the same rules as a rep (Movement Match not LOW, no frame hint up, one verdict per 1.2 s). **On the old build the event never arrives (the listener is safe on a build without it) and nothing shows for half reps.** Replay with the event switched off: 0 half-rep X, all 8 reps still get their check.
6. **Mirror and checks.** `scripts/lib/missed-attempt-mirror.js` is a line-for-line JS copy of the Swift tracker. Tests: a half rep fires one `short_bottom` (reached 62, needed 50) when the stroke ends, a low-start stroke fires `short_top` ("Go higher"), a full rep fires nothing, a small wiggle fires nothing, one garbled frame fires nothing, standing still fires nothing, two half reps give two events, a half rep right after a full rep still fires. Static checks on the Swift: the five constants in the Swift equal the mirror's (the test reads them from the Swift file), event name matches in the Swift Events list, `sendEvent` and the JS listener, argument order `onAttemptMissed?(reason, reached, needed)` matches the module closure and the dictionary keys, brackets balance in the new block and the module wiring, the call sits after the suppressed / pose-gap guards, both reset functions clear the tracker.
   **Honest limits:** nothing was compiled (Windows). A device log only has the metric about 2.5 times a second (the engine sees about 30), so the replay adds each rep's own `bottom=` from the `[REP]` line as a frame 0.6 s before the line; the phone will see strokes the replay cannot. `short_top` needs a stroke to start lower than 80% of the way up; for presses it will mostly be `short_bottom`.

## BUGS

7. **Rep feedback -> Finish loop: fixed (cause found in code, not reproduced on a phone).** My last round made the recap call `router.replace('/(tabs)/')` while the rep feedback screen was still on top, then the rep feedback screen also did `router.back()`. The replace swapped the rep feedback screen, the back popped to the recap ("Form check complete"), and the recap's focus handler plus the warm rep-feedback page started it again. Now: the recap passes `practice=1` to the rep feedback screen; on Finish, a practice session leaves from there with ONE `router.dismissAll()` straight home (no replace, no back), behind a `leaving` guard so a second tap or second message does nothing (the guard also protects the real-workout Finish). The recap no longer navigates on Finish.
8. **Guide wording: done.** New line "Back up". The camera's own "too close" / "Back up" hints say "Back up"; a person who was in the picture a moment ago and is now lost reads as too close: "Back up". "Step into view" is only for nobody in the picture (never seen). "Step back further" stays for "step back into frame" and is the next tip in the rotation.
9. **Top-of-screen overlap: fixed.** Cause (from the screenshot and the code): in the workout screen the Camera confidence label and pill (`top = safe area + 56`) sat exactly where the set bars (`+56`) and the scorecard (`+80`) are. Now everything is measured from the top safe area with fixed offsets: top bar, set bars (+56), scorecard glass pill (+78), then ONE row at +134 with the timer capsule and a compact Camera confidence capsule side by side, and the framing box starts at +184 (it used to start at +160, under the row). In the solo form check the big confidence block (+56 to +147) now pushes the framing box down on short phones (it overlapped on an SE). `scripts/test-camera-layout.js` checks 6 phone sizes (SE to Pro Max): no two boxes overlap, the row fits with margins.
10. **The white panel is real Liquid Glass: done in code.** The scorecard is a glass pill (white text), the timer a glass capsule (the white tab with the notches is gone), the confidence a glass capsule. They use `LiquidGlass` where the build has it, and the same blur-glass pill the Guide uses where it does not (never a flat white card). I could not see it on a phone. The `[GLASS] real Liquid Glass: ON/OFF` log line from last round tells you which one your build draws.

DONE SCREENS: **not touched** (components/DoneScreen.tsx, lib/doneTimeline.ts unchanged).

## Tests

New: `test-one-judge.js` (replays, Swift static checks, mirror), `test-camera-layout.js`. Updated: `test-movement-match.js` (one-judge wiring, "Back up"), `test-guide-coach-1113.js`, `test-half-reps-1115.js`, `test-done-flow.js` (practice Finish), `test-haptics-screens.js`, `scripts/lib/pipeline.js` (the attempt detector no longer judges; the mirror does). Whole suite run: all pass. `npx tsc --noEmit`: the same 28 old errors, none new.

## Phone test

1. (Old build) Do 3 full reps and 3 half reps: every full rep gets one check; no X at all for the half reps; nothing appears when you stand still; never an X and a check together.
2. (After the new build) The same, and each half rep now gets one X: "Go lower" or "Go higher". Send the log lines `[ATTEMPT-MISSED]` so I can set the 35% line from your real numbers.
3. Start a workout set: the set bars, scorecard, timer and "Camera" confidence all show with nothing on top of anything.
4. Do a form check, open the rep feedback, tap Finish: you go Home once, no "Form check complete" again.
5. Stand too close: "Back up". Stand away from the phone: "Step into view".

## Questions for Ari

- The confidence capsule in the workout screen says "Camera 87%" (short, to fit the row); solo form check keeps "Camera confidence". OK?

## Blocked commands

None this round. Still open from before: `rm -f .scratch/runall.out` (my scratch file), delete `.scratch\edit-tlt*.js`, Window A's `scripts\test-home-clean.js`, `train_wk_webkit.png`; optional `git rm lib\screenHaptics.ts`. My scratch files in `.scratch` can go too.

Window B HQ: One judge now, half-rep event written in Swift, loop and overlap fixed.
