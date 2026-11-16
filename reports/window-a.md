# Window A report: Ari's phone test, round 5 (7 items)

Branch: work-a. Merged origin/overnight-build first. I did not touch the check / "complete" screens or the camera / in-workout screens.

## Result by number

| # | Item | Status |
|---|---|---|
| 1 | Calendar: real Liquid Glass, no white, system font | Done. The glass look needs your phone |
| 2 | Three goal rings on Home; old week line and Form score card removed | Done |
| 3 | Weekly goal stepper in Profile | Done |
| 4 | Progress: hard edge under Past workouts and Personal bests | Done |
| 5 | Edit sheet laggy | Done in code. Needs your phone to feel |
| 6 | Music screen arrival glitch: real cause | Done. Cause from the log, partly an inference (see below) |
| 7 | Demo clock already at ~16 of 18s | Done |

## 1. Calendar, 4th try

I took everything white out. The popover now uses the exact same LiquidGlass settings as the tab bar (`variant="regular"`, `colorScheme="light"`, the same fallback colour, no tint). There is no base layer, no frost, no blur layer. The pointer is a small piece of the same glass. Position, pointer and speed (200ms open, 150ms close) are unchanged. Text uses the system font (SF Pro: `fontFamily: 'System'`, no custom font), weights 500 to 700 (no 800), dark text (#111114), secondary text darker than before (#55555f) for contrast, larger day numbers (17).
Test (scripts/test-calendar-drop.js) compares the calendar's glass props with the tab bar's in the source and fails if a base, tint or blur layer comes back.
Honest limit: with real glass and no white behind it, how readable the numbers are depends on what is under it. If the busy parts of Home show through too much, the one safe lever is the text colour, not a white card. Please look at it on the phone.

## 2. Goal rings

Three white tiles right under the two drop-downs (the same soft white style as the pills), each with a ring, its number in the middle and a small label under it:
- Workouts: this week's workouts / the weekly goal (lib/weeklyGoal.ts), e.g. 2/4. Camera and logged count, practice doesn't.
- Form: this week's average form (reps-weighted over form-checked exercises), goal 90%. Ring is full at 90%.
- Muscles: muscles trained this week out of the 11 on the muscle map.
The week is Monday to Sunday. Each ring fills in 1 second. At 0 the track shows and the number reads 0/4, 0%, 0/11. The first time each ring completes in a week there is a soft success haptic (after the fill, 900ms), remembered per ring and week on the device. The old "Progress" heading, the "x of y workouts" line and the Form score card are hidden.
Files: lib/homeRings.ts (maths), lib/homeRingsPage.ts (the page side). Test: scripts/test-home-rings.js (maths, position under the drop-downs, equal tiles, fill transition, empty state, old card hidden, haptic rule). Screenshot: .scratch/home-rings.png.
Note: Muscles counts every muscle an exercise credits, secondary ones too, so a few exercises can already reach many of the 11.

## 3. Weekly goal stepper

Profile > Weekly goal now opens the design's own stepper page (the one Weight uses): a big number with - and +, "4 workouts a week", 1 to 7 (stops at both ends). The number is stored as that many picked days (that is what lib/weeklyGoal.ts counts), so Home's rings follow it. Test: scripts/test-weekly-goal.js (taps - and + on the real page, limits 1 and 7).

## 4. Progress hard edge

Cause: the Personal bests and Past workouts rows scroll sideways, and a sideways scroller also clips whatever spills below it. The cards' soft shadows spill about 30px, so the shadow was cut by a straight line at the bottom of the row: the grey to white step. Fix: each row gets 46px more room at the bottom and gives it back with a negative margin (nothing moves; the empty-state card keeps its place). Test: scripts/test-progress-edge.js looks at the actual pixels under each row, with and without data; before the fix it failed (a step at the row's old bottom edge), after it no pixel row steps by more than 3 levels.

## 5. Edit sheet lag

Cause: the sheet was a React Native Modal. Opening a Modal makes iOS build and present a whole new native screen while the sheet slides, and that is the stutter. It is now part of the screen itself, mounted from the start (hidden, off-screen), so opening only plays two native animations (the background fade and the slide). It is the last layer on the screen, so the background covers the Start button too, and while closed it lets every touch through. Lighter shadow too. Same look as before. Test: scripts/test-workout-preview.js. Limit: I can not time a native animation here.

## 6. Music screen arrival: the real cause

What the log shows (2026-11-16 15:21): `[MUSIC] screen shown` at 21:36.736 and the demo drawn at 21:37.246, 0.5s later. So the music web view and the demo web view were created at the same moment, together with the screen change, sharing one web engine and the JS thread. My logs did not record when the music page itself drew, so the exact stall is an inference, not a measurement. What I changed, all aimed at that:
- The demo web view is now created only after the music page has drawn (350ms later), so only one page loads at a time on arrival.
- The music page fades in (160ms) when it is final, instead of popping from white.
- New log line to measure it next time: `[MUSIC] page drawn Nms after the screen opened`. Send me that line if it still glitches.
- Going to the demo (item 10 from last round): Continue waits for the demo underneath to be drawn (1.5s at most), then fades the overlay.

## 7. Demo clock bug

Cause: the design starts its clock the moment it is drawn, and I draw it under the music screen, so it ran to about 16 of 18 seconds before you saw it. Now the clock is held at 0 and paused until the app says the demo is visible (the music screen is gone), then it starts at 0. Test: drawn but not visible for 4.5 seconds stays at 0 and paused; after the start call it is about 1.25s in after 1.3s; starting again restarts at 0; a demo with no music screen plays from 0 at once.

## Tests

The whole suite was run at the end: everything passes except scripts/test-rep-feedback-injection.js (Window B's, needs an untracked .scratch file, failed before my changes). test-home-cue also needed updating (it expected the Cue card tucked under the old week card). New: test-home-rings, test-progress-edge. Updated: test-calendar-drop, test-weekly-goal, test-workout-preview, test-demo-music, test-home-clean (it asserted the old week line), home-harness.

## Questions

- Calendar: if the real glass is hard to read over Home, do you want me to darken the numbers further, or put the calendar at a different spot on the screen?
- Rings: should Muscles count only the main muscle of each exercise (stricter) instead of every muscle an exercise credits?

## Blocked commands

None this round.

## Files for you to delete (I never delete)

`.scratch\` (folder), `scripts\_dbg.js`, `scripts\_hdr.js`, `scripts\_hdr2.js`, `scripts\_ux_explore.js`, `scripts\_ux_prof.js`, `scripts\_ux_prof2.js`, `train_wk_webkit.png`
