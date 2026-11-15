# Window A report: Ari's phone test (11 items)

Branch: work-a. Merged origin/overnight-build first. The dev log in C:\Users\arize\gym app\logs\latest.log is still the old session (2026-11-15 18:39, 1889 lines, nothing about the calendar, streak, Create workout, preview or demo), so there was nothing in it for this round. I did not touch any check / saved / complete animation screens.

## Result by number

| # | Item | Status |
|---|---|---|
| 1 | Home calendar glitched | Done. Cause found from the screenshot. The glass look needs your phone |
| 2 | Streak screen glitches on open, number glitches | Done |
| 3 | Fire must not move; 12 to 16 fading stars | Done (14 stars) |
| 4 | Cleaner streak screen | Done |
| 5 | Create workout: muscle chips + Popular | Done |
| 6 | Workout preview content too high | Done |
| 7 | Preview back button not Liquid Glass | Done (new shared glass back button) |
| 8 | Edit sheet looks bad: use Home's Edit Workout look | Done. Not seen on a phone (see limits) |
| 9 | Music screen: text too high; only first 2 times | Done |
| 10 | Demo screen glitchy and laggy on first open | Done in code; needs your phone for the feel |
| 11 | Demo steps timed, ready for real videos | Done; how to set the times is below |

## 1. The calendar

What was broken in your screenshot: the calendar card was see-through. Real Liquid Glass is clear by nature, so the page behind it (the Energy and Training pills, "Today", the big "My workout" card) showed straight through the month grid and the numbers, which made it unreadable. The card itself was in the right place under the date.

Fix (components/CalendarSheet.tsx): a solid near-white base now sits under the glass, so nothing behind can show through; the glass on top (the real Liquid Glass, lightly tinted) only adds its edge light and depth. Same drop-down from the arrow, same grow-out animation, closes with a fade and leaves nothing behind.

Test (scripts/test-calendar-drop.js): the component is drawn at 390x844 over a page that looks like Home, with the glass replaced by a fully clear layer (the worst case). Open: card at x 14, width 362, top at 211 just under the date, solid base under the glass, the card (not the page) is on top at every spot where the page had text, all 30 days of November, "3 days trained". Closed: no card and no dim layer left. Screenshots: .scratch/cal-open.png and cal-closed.png.

Limit: Liquid Glass itself only draws on your phone build, so how the glass edge looks I can not show.

## 2, 3, 4. Streak screen

- Right from the first frame: the page is now only revealed when the fonts are loaded, the page is scaled to the screen and two frames have been drawn. Before, it could be shown while the font was still loading (the number and headline changed shape) or before the scale was applied. The test loads a fresh page and checks that at the moment it is revealed, the fonts are loaded, the scale is set, and the number, headline and their positions are exactly what they stay afterwards. The wait for the page is 4 seconds at most (was 2.4).
- The fire does not move: my flame animation is removed. Test: no animation on either flame, same transform 0.9s apart, no shadow filter.
- Stars: 14 small stars around the flame, 7 to 16px, five warm colours. Each has its own length (2.6 to 4.8s) and its own start time, fades in and out forever, and every time it fades out it comes back at a NEW place (never on top of the flame; kept above the headline). The design's old 3 big sparkles and the rising embers are hidden. Respects "reduce motion" (static dim stars).
- Cleaner: no heavy shadow under the flame, the glow behind it halved, the week row is a flat white pill with a hairline (the orange day circles lost their glow), the Continue button shadow is light.

## 5. Create workout

Under the search box there is now a row of six chips (Chest, Back, Legs, Shoulders, Arms, Core, all on one line) and a "Popular" list (8 real exercises) shown by default. Tap a chip and its exercises show (8, with "Show all N" for the rest); tap an exercise to add it (its + becomes a check; tap again removes it); tap the chip again for Popular. Typing in the search hides this and shows the search results as before; clearing brings it back. Real catalogue only: each group lists the exercises that mainly train it first (popular first, then A to Z), then the ones that also train it. Core has only one exercise that mainly trains it (Sit-up), so the rest of its list is squats and push-ups that also work the core. That is the catalogue's own data; adding core-only exercises to the catalogue would fix it. Test: scripts/test-create-starter.js (23 checks).

## 6, 7, 8. Workout preview

- 6: the header now starts 14px below the notch (`Math.max(inset, 47) + 14`): the back button at y 76 on a phone with a 62 inset, was 56.
- 7: new shared component components/GlassBackButton.tsx: real Liquid Glass (the same LiquidGlassButton as the tab bar and + button), 40px, chevron. Use it on any other native screen that needs a back button.
- 8: the pencil sheet is rebuilt from Home's Edit Workout design (numbers read from your home design file): floating white sheet 8px from the sides and bottom with 40px corners, grab bar, 20px bold title (the exercise name) with the round grey close button, grey rounded rows (#f6f6f8, 20px corners) for Sets and Reps with white 36px round minus/plus buttons, and the black 54px "Done" pill (was "Save"). It still saves sets and reps. Limit: the sheet is a native Modal, so my web renderer can not draw it; I checked the numbers and wiring in code, not a picture. Please look at it once.
- Tests: scripts/test-workout-preview.js (title position, glass back button, sheet numbers).

## 9. Music screen

- The text was too high because the fake status bar row of the design was being removed from the page, which pulled everything up by 50px under the notch. It is now hidden but keeps its room (same for the demo screen), plus 28px more, so the title is at 118 (the design's own spot is 90, it was right under the notch).
- Shown only the first 2 times ever: the number of times is stored on the device (`formpal_music_shown_count`); lib/musicGate.ts decides (shown 0 or 1 times: show; 2 or more: skip). "Don't show this page again" still skips it at once. To see it again for testing, clear the app data.

## 10. Demo screen

Causes: the design's default text ("Push-ups", "3 sets · 12 reps", its three default instructions) was painted first and swapped by hand a moment later (that is the glitch), and a MutationObserver re-scanned every div on the page after every change while the page redraws 4 times a second (that is the lag).

Now (lib/demoScreen.ts): the real exercise and steps go in through the design's own logic (the same method Home and Train use) BEFORE the first draw; nothing is painted until that data is in and the page is scaled (so the first visible frame is final); the page's entrance animations and drifting colour blobs are off; the three buttons (close, I'm ready, don't show again) use one delegated click listener, no observer, no scanning. The "don't show again" box starts ticked from the saved choice without a fake click. The demo and music pages are also loaded invisibly in the background at launch (DesignPrewarm), so the first open has no file load.
Test (scripts/test-demo-music.js): at the exact moment of reveal the page shows "Bicep Curl", "2 of 5" and the 3 real steps and none of the design defaults; no animation running; "demoShown" posted once; 2 seconds of playing with no frame over 40ms (worst 18ms); the three buttons post the right messages.
Limit: I measured Chromium, not the phone; the feel on the phone needs your check. Log lines: `[DEMO] shown with the real data`, `[MUSIC] screen shown (N of 2)`.

## 11. Demo ready for real videos

Every instruction step has a START TIME in seconds; the lit step is always "the last step whose start time has passed"; tapping a step jumps to its start time; the progress bar and the clock follow. With no video it uses a placeholder timeline: 18 seconds with the steps spread evenly (0, 6, 12 for 3 steps), and the app logs `[DEMO] <exercise>: placeholder timing ...` for each one.

HOW TO SET THE TIMES (also written at the top of lib/demoVideos.ts): open lib/demoVideos.ts and add one line per exercise in `DEMO_VIDEOS`, keyed by the exercise id:

    pushup: { videoLength: 24, stepStarts: [0, 8.5, 16] },

`videoLength` is the video's length in seconds; `stepStarts` has one start second per instruction, in the order the instructions are shown (the order of getDemoCues in lib/demoCues.ts). Times are sorted for you, extra ones are ignored, missing ones are spread over the rest of the video. Nothing else changes. Putting the video file itself into the grey "Drop demo video frame" box is the next step; the timing needs no change then.

## Tests

New: test-calendar-drop, test-create-starter, test-demo-music. Updated: test-streak, test-workout-preview, test-launch-speed (earlier). The whole suite was run at the end: everything passes except scripts/test-rep-feedback-injection.js (Window B's; it needs an untracked .scratch file and failed before my changes too). test-design-screens was updated because Create workout now shows a Popular list. `npx tsc --noEmit` shows no errors in files I touched.

## Things I touched outside my area

- app/workout/run.tsx (the music and demo screens you asked for): the demo uses the new logic, the music gate counts shows, the status row fix.
- components/DesignPrewarm.tsx: two more pages warmed.

## Questions

- Core chip: only one exercise (Sit-up) mainly trains core. OK to show the others that also work the core, or do you want core-only exercises added to the catalogue?
- Music screen: "first 2 times ever" counts each time it is shown. If you want it counted per workout finished instead, say so.

## Blocked commands

One command was blocked by the hook as "deletes or discards files": `rm -f .scratch/suite.out 2>/dev/null; (for f in scripts/test-*.js; do ... done; echo ALLDONE) > .scratch/suite2.out 2>&1 &` (the `rm -f` of my own scratch output file before starting a test run). Nothing was deleted; I ran the test loop without it, writing to a new file.

## Files for you to delete (I never delete)

`.scratch\` (folder), `scripts\_dbg.js`, `scripts\_hdr.js`, `scripts\_hdr2.js`, `scripts\_ux_explore.js`, `scripts\_ux_prof.js`, `scripts\_ux_prof2.js`, `train_wk_webkit.png`
