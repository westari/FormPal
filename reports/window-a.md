# Window A report: Ari's phone test, round 4 (12 items)

Branch: work-a. Merged origin/overnight-build first. I did not touch the check / "complete" screens or the camera screens.
Things in your live feedback that are NOT in this prompt (the form-check coach giving no X marks, the guide being slow and saying "keep your hands in view", a great-job screen after rep feedback, and the camera screen layout) are camera work (Window B) or the done screen Window B is building, so I left them. Short answer to your question: the missing X marks are not about a dev build. A dev build is only needed for native code (Swift); the rep judging runs in JS, so a JS fix would show on reload. It needs its own proper pass in Window B.

## Result by number

| # | Item | Status |
|---|---|---|
| 1 | Calendar popover (real glass, pointer, no blur/dim, fast) | Done. The glass look needs your phone |
| 2 | Learn the moves page | Done |
| 3 | Streak glitch on open | Done (3 fixes). Needs your phone |
| 4 | Bigger, fewer sparkles; gentle fire | Done (7 sparkles) |
| 5 | Glass back button arrow | Done |
| 6 | "My workout" font and size | Done |
| 7 | Edit sheet background fade | Done |
| 8 | Music screen arrival glitch | Done |
| 9 | "Don't show again" works; twice-rule removed | Done |
| 10 | Music to demo glitch | Done |
| 11 | Demo card touches sides and bottom | Done |
| 12 | Weekly goal (lib/weeklyGoal.ts, Home line, Profile) | Done |

## 1. Calendar (3rd try)

What I got wrong before: a full-height layer under the card was tinted (a dim) and the card had a big soft shadow, which is the "blur over the bottom half". Both are gone. It is now a small popover:
- Real Liquid Glass (the same LiquidGlass component as the tab bar), frosted with a white tint over a light base so the numbers stay readable. The base is 84% white: the earlier fully clear glass let the page show through the numbers. If you want it clearer, it is one number in components/CalendarSheet.tsx (`base`).
- A small pointer on the top edge, centred under the date's arrow (measured at the arrow's x), so it is attached.
- No dim, no blur on the rest of the screen. A fully transparent layer only catches a tap outside it (the header stays tappable, so the arrow closes it too).
- Opens in 200ms, closes in 150ms, native driver, grows out of the pointer.
Test: scripts/test-calendar-drop.js (draws it at 390x844 over a Home-like page, worst case clear glass): position, pointer x and tip above the card, transparent outside layer and nothing big tinted, timings, closed leaves nothing.
Limit: real glass draws only on your phone build.

## 2. Learn the moves

The arrow beside "Learn The Moves" was a link to a file that does not exist, so the page said "asset not found". Home now posts "moves" and opens the new page (app/learn-moves.tsx), built from the My workouts design file itself (same layout, cards and search), titled "Learn the moves", with all 56 exercises. Filter chips: All, Bodyweight, Dumbbell, Barbell, Machine, Chest, Back, Legs, Shoulders, Arms, Core. Each chip shows exactly that set (tested against the catalogue). Search works. Tapping an exercise opens its form check (`/formcheck?exercise=<id>`). The Create button and bookmarks are hidden on this page. Test: scripts/test-learn-moves.js (22 checks). Note: only 6 exercises are bodyweight-only in the catalogue's own data.

## 3 and 4. Streak

- Glitch on open, three causes fixed: (a) the page was revealed in one hard frame; it now fades in over 180ms; (b) the fonts are loaded by name (the three weights the page uses) before the reveal, because the fonts are only fetched when text that uses them is drawn, so "fonts ready" could be true too early; (c) I found a real bug of mine: a 30px sparkle matched the selector for the week circles ("width: 30px; height: 30px"), which could break the week row. Excluded now.
- Sparkles: 7 (was 14), 20 to 34px (was 7 to 16), each fades in and out forever with its own timing and comes back somewhere else. The centre of the icon (the number in the flame) is unchanged.
- Fire: a very slight breathing only (under 2% size, under 0.5 degree), 3.4 to 4.6s cycles. Measured over 6 seconds: size changes by 2%.
- Test: scripts/test-streak.js.

## 5, 6, 7. Workout preview

- 5: the glass back button draws the same arrow as the design files' back buttons (the path `M8.2 1.8 1.8 8.5l6.4 6.7`, 10x17, 2.4 stroke, round ends) instead of the system chevron.
- 6: the title is the normal title font (Plus Jakarta Sans Bold, like the tab titles; it was ExtraBold) at 34 (was 25), shrinks to fit a long name. "10 min · 1 exercise" is 18 (was 13.5).
- 7: the Modal's own slide moved the dim layer up the screen (the hard moving edge). Now the Modal has no animation; the whole background is one full-screen layer that only fades (220ms) on open and on Done, and only the sheet slides. Tests: scripts/test-workout-preview.js (code checks: I can not draw a native Modal in the web renderer, please look once).

## 8, 9, 10, 11. Music and demo

- 8: the music page is hidden until it is final (scaled, status-row space kept, title already in place; measured the same at reveal and 0.5s later).
- 9: "Don't show this page again": Continue now reads the tick box as it is shown. Tested on the real page: unticked gives `musicContinue:0`, ticked gives `musicContinue:1`, and the app stores `formpal_skip_connect_music = 1` and never shows the screen again. The show-only-twice rule is removed (lib/musicGate.ts is now just the tick).
- 10: the two web views were swapped one for the other (the glitch). The music screen is now a white overlay on top of the workout screen, which is already loading the demo underneath; Continue fades the overlay out in 180ms and the demo is simply there.
- 11: the demo's white card now spans the full width and reaches the bottom, rounded top corners only (36px), square bottom. Measured: left 0, right 390, bottom 844.
- Test: scripts/test-demo-music.js.

## 12. Weekly goal

- lib/weeklyGoal.ts (pure, tested): the goal is the number of workouts a week. It starts from the plan's days per week; if you pick days in Profile, the number of days you picked is the goal. No plan and no pick: 3. The week is Monday to Sunday. Camera workouts and logged sessions count, practice form checks (kind: 'practice') do not. The count caps at the goal, extras show as a bonus: "4 of 4 workouts · +4 bonus", never "8 of 4".
- Home's week line uses it (the old code counted from Sunday against a fixed 4).
- Profile: "Training days" is renamed "Weekly goal" and reads "4 workouts a week". Tapping it opens the same day picker with a new title ("Weekly goal") and text ("Pick the days you plan to train. The number of days is your weekly goal"). Saving a pick changes the goal everywhere. I kept the weekday picker as the way to edit because it already saves; if you want a number stepper instead, tell me.
- Tests: scripts/test-weekly-goal.js (week bounds, goal rules, counting, cap and bonus, Home line, Profile row and page), test-data-wiring and test-profile-slide updated.
- Not done here: the rings (you are designing them).

## Tests

The whole suite was run at the end: everything passes except scripts/test-rep-feedback-injection.js (Window B's, needs an untracked .scratch file, failed before my changes). test-home-clean was updated: it asserted the old "8 of 4". New: test-learn-moves, test-weekly-goal. Updated: test-calendar-drop, test-streak, test-workout-preview, test-demo-music, test-data-wiring, test-profile-slide.

## Questions

- Calendar glass: is the white frosting right, or do you want it clearer (less white)?
- Weekly goal editing: the weekday picker, or a number stepper?

## Blocked commands

None this round.

## Files for you to delete (I never delete)

`.scratch\` (folder), `scripts\_dbg.js`, `scripts\_hdr.js`, `scripts\_hdr2.js`, `scripts\_ux_explore.js`, `scripts\_ux_prof.js`, `scripts\_ux_prof2.js`, `train_wk_webkit.png`
