# Window B report, 2026-11-15 (Ari's phone test)

Branch `work-b`. `git merge origin/overnight-build` ran first (clean).

## Which native build did the phone run?

**The OLD Oct 8 build again.** The log has no `[AWAKE] native` line and no `[REP-QUALITY]` line (both come from native code written after Oct 8). Everything below is JavaScript, so it works on that build. The Swift fixes from earlier rounds still need an "iOS Dev Build" run on `overnight-build` (not `master`).

## The camera (1 to 3)

**1. Half reps still got no X: done (replayed on this log).**
Replaying this log (`scripts/fixtures/shoulder-press-2026-11-15.log.txt`) with the previous code: 8 reps, **0 X in 61 seconds**. Two causes in the attempt detector:
- **Smoothing flattened the half reps.** It took the median of the last 3 readings. This log only has about 2.5 readings a second, so 3 readings span 1.2 seconds. A half rep that reads 65, 69, 72, 61, 66, 80, 64 became 66, 66, 66: no stroke, so no attempt, so no X. Now it only smooths readings from the last 250 ms (still 3 readings at the 10-a-second feed, 1 at the slow feed).
- **One rep "covered" several strokes.** A stroke was called "counted" if any rep had happened in the 500 ms before its low. So a half rep right after a full rep got "counted" and no X. Now each engine rep belongs to exactly one stroke and only to a stroke that is around when the rep fires.
Result on the same log: 21 strokes found, 8 counted (= the 8 reps), 13 missed; every missed stroke Movement Match calls real gets an X. Every real rep still gets its check.
**What the X says:** in this log the top was reached every time (85 to 89) and the short end was the bottom (lows 61 to 70 with the line at 50), so the words are "Go lower". "Go higher" appears when the top is short (a synthetic test covers it). If you meant "arms not all the way up", the data says the opposite for these reps; tell me what the arm position was and I will check.
I cannot promise every half rep: the feed is 2.5 readings a second and a fast stroke is only 3 readings.

**2. Guide and a check at the same time: done.** While a check or X is on screen (`feedback` is set) the live Guide is hidden; it comes back when the verdict is gone. Tested on the source rule (the phone shows it).

**3. The Guide repeated one tip for ever: done.** The Guide keeps an ordered list of causes per situation (`tipOrder`). If the same tip has shown 5 seconds (placeholder, `GUIDE.tipRotateSec`) and the situation is still there, it moves to the next. "Step back further" then "Keep your hands in view", "Move your phone back", "Find more light", "Put your phone at chest height", then round again. Replay of a 40-second "step back" problem: 6.6 s, 11.6 s, 16.6 s, 21.6 s, 26.6 s ... each tip about 5 s. Every tip is a plain Guide line.

## Form checks are practice (4): done

A solo form check (`mode formCheck`: not a workout, not logged, not history) is practice:
- Ends with "Form check complete" (the Done screen and the Workout complete page title).
- Keeps the rep feedback. **Finish** on the last rep goes straight home: no Today's progress, no streak.
- Saved with `kind: 'practice'` on the session entry. `getAllSessions()` keeps that field (Window A lists by it).
- Never changes ranks, the muscle map or streaks: every aggregate (`computeMuscleTiers`, credit totals, overall scores, `calcStreak`, the streak page) skips practice entries (`realSessions`). Tested for real with a fake storage: 300 practice reps change nothing.
- **Rep counter (mode repCounter) is NOT practice.** It is not form-judged but it is a real log (half credit). Tell me if you want it practice too.

## One shared DoneScreen (5): done

`components/DoneScreen.tsx` (timeline in `lib/doneTimeline.ts`, pure and tested). White background, green circle that draws itself slowly (0 to 0.75 s), the check draws inside (0.65 to 1.05 s), success haptic when the check ends (1.05 s), title fades up in the system font (SF Pro) semibold, optional grey line, about 1.5 s plus a 0.2 s hold, tap to skip. Variants: `small` (check + title), `workout` (check + "Workout complete" + reps counting up live), `streak` (flame grows, "3-day streak", "Come back tomorrow to keep it going."). Props: `variant, title?, subtitle?, reps?, streak?, onFinish, haptic?`. Window A can use `<DoneScreen variant="small" title="Workout saved" onFinish={...} />`. I could only check it by tests and `tsc`; the look needs your phone.

## The new flow (6, 7, 8)

- **6. Done:** workout ends -> DoneScreen "workout" -> Workout complete / rep feedback -> Today's progress (fills up live) -> Done -> DoneScreen "streak" (real number) -> progress-photo prompt if one is due -> Home. The Workout complete page only shows after the first Done screen (the pages wait, because they are drawn above everything). The old workout-complete haptic is gone (the Done screen fires it: one haptic, not two). `/streak-screen` (the week-row page) is no longer in this flow; it still opens from the streak pill on the tabs.
- **7. White wash removed completely** (no wash view, no timers, no constants).
- **8. Today's progress back button** is now the normal Liquid Glass back button (same one as the other pages); the design's white one is hidden.

## Today's progress numbers (9, 10): done

- **9.** Reps rows are gone. Back to the old compact small rows in %, each saying what it is progress toward: "Shoulders +18.7% to Silver", "Triceps +7.5% to Silver" (top rank reads "+x% Top rank"). Same math as before (the same muscle gain numbers). More than 3 muscles use the old packed layout (one small row each, the body map shrinks to fit). The fill-up still works: the % counts up from 0.0, rows appear one after another, muscles light up.
- **10.** The overall rank % and the "average of all 11 muscles" text are gone, and so are the header rank and the overall row. The overall only shows when it really ranks up, as a big moment: "Overall: Bronze → Silver!" with a big rank emblem (tested with a synthetic rank-up; real rank-ups need all muscles at Silver, so I could not make one from real data). The bottom summary card (note, Done) is unchanged.

## Also fixed / found

- Two old tests changed because their rules changed (the 11-13 replay test now checks the flat rest only; the wiggle test uses a real 7-degree wiggle).
- `.scratch` still has my scratch files and the two earlier `edit-tlt*.js` scripts (see below).

## Tests

New: `test-half-reps-1115.js` (replay + tip rotation + Guide hidden), `test-done-flow.js` (DoneScreen timeline, flow wiring, practice rules with real storage). Rewritten: `test-fill-up.js` (real design file: rows in %, no overall text, rank-up moment, fill-up, tap skip). Updated: `test-muscle-ranks.js`, `test-guide-coach-1113.js`, `test-haptics-screens.js`, `test-movement-match.js`, `test-warm-surfaces.js`. Real log saved as `scripts/fixtures/shoulder-press-2026-11-15.log.txt`. `npx tsc --noEmit`: the same 28 old errors, none new.
Not provable here (needs your phone): the DoneScreen look and haptic, the Liquid Glass back button, the Guide hiding during a check, the feel of the half-rep X timing.

## Phone test (JS parts are live now)

1. Do 3 full reps then 3 half reps (stop short on purpose): a check on each full rep, an X on each half rep, and the Guide never shows while a check or X is up.
2. Stand where the camera cannot see your hands for 15 seconds: the Guide changes its tip about every 5 seconds.
3. Finish a real workout: Done screen (check draws, reps count up, buzz) -> Workout complete -> rep feedback -> Finish -> Today's progress fills up -> Done -> streak screen (flame) -> Home.
4. Do a form check from the camera: "Form check complete", rep feedback, Finish -> Home with nothing in Today's progress, and your streak and ranks unchanged.

## Questions for Ari

- Half reps: the data says the bottom was short ("Go lower"). If you wanted "Go higher", tell me what you did with your arms.
- Is a rep counter (not a form check) meant to stay a real log? I left it counting.

## Blocked command (the hook stopped it): for Ari to run if wanted

- `rm -f .scratch/runall.out` (deleting my own old test-output scratch file; I wrote to `.scratch/runall2.out` instead).
- Still open from before: delete `.scratch\edit-tlt*.js`, Window A's `scripts\test-home-clean.js`, `train_wk_webkit.png`; optional `git rm lib\screenHaptics.ts`. My scratch files in `.scratch` (`runall*.sh/out`, `replay13.js`, `recap-edit.js`, `mr-edit.js`, `fix-test-mr*.js`, `summary-before.js`, `recap-title.js`, `ad.bak`, `ad.new`, `mr-old.ts`, `blockOld.js`) can go too.

Window B HQ: Fixed half-rep X, tip rotation, practice form checks, DoneScreen flow and %-rows.
