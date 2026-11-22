# Window A report (round 7, Ari's phone test)

Branch work-a. I ran git fetch and merged origin/overnight-build first.

Every item is done in code and tested as far as this computer can test it. What needs your phone is written under each item.

## 1. The glass standard: DONE
- The Finish pill's glass is now one shared piece: `components/StandardGlass.tsx` (`StandardGlass`, `StandardGlassButton`, `STANDARD_GLASS`). It is the exact recipe of the Finish pill: real Liquid Glass, "regular", dark colour scheme, no tint, fallback fill `rgba(40,41,48,0.55)`. White text on it.
- I did not touch the camera screen. A test (`test-calendar-drop.js`) reads the Finish pill's props from `formcheck.tsx` and fails if the standard ever drifts from them.
- Use it for all new glass from now on. The calendar uses it already.

## 2. Goal pages: DONE
- The back button and the title are now the first thing INSIDE the scroll view, so they scroll away with the page. No pinned bar, no border.
- "What counts" is removed from the page and from the data (`lib/goalDetail.ts`).

## 3. Calendar, started over: DONE in code
- New `components/CalendarSheet.tsx`. Tap the date: ONE panel of the glass standard slides down from the very top of the screen (top corners are above the screen, only the bottom corners show), with the month grid. Tap a day, tap outside, or tap the date again and it slides back up. No dim.
- Today is a white circle, exactly centred in its cell and the number exactly centred in the circle (tested to under 1px).
- First open: right after Home appears, the panel is drawn on screen but invisible for 0.8 seconds, so the real glass has painted once, then it parks above the screen. The old problem was a glass view that was built at the first tap and showed its plain colour for a moment.
- Smooth: slides with the native driver, 340ms open, 260ms close. The status bar turns light while it is open.
- NEEDS YOUR PHONE: how the dark glass looks over the white Home page, and the first open. If the glass is too grey over the white page, tell me.

## 4. Train tab, missed workouts: DONE
- A planned day this week that you did not train now shows the normal workout card (same as My Workout) with a soft orange "Missed" tag in the corner and a black "Do it today" button. The button opens that workout with its Start button.
- If today is a rest day, today's card is the missed workout (the oldest one). If today has a workout, today's workout stays first and the missed one stays on its own day card.
- Missed workouts clear at the start of each new week (Monday). Days from earlier weeks show the small "Missed" card with no button.
- A workout done on a rest day (or a second one on a training day) makes up the oldest missed one, so it stops showing.
- A day that had a workout planned never says "Rest day".
- How I decided WHICH workout was missed: the plan is a queue and `currentWorkoutIndex` is the next one. The next planned day gets that one and each earlier planned day steps one back. This is my rule, because the plan has no weekdays saved. Tell me if you want a different rule.
- Tests: `test-train-missed.js` (data and the real Train page).

## 5. Create Workout: DONE
- "Add exercise" and the exercises you picked now sit right under the search bar. "Start from a muscle group" and Popular come after them.
- No little circles: the rows have a plain grey plus (a plain dark check once added). The six group buttons stay in one row.
- Tests: `test-create-starter.js`.

## 6. Done screens: DONE in code
- Immediate: a spare copy of Ari's page is loaded and fitted (paused, invisible) 2.5 seconds after the app starts, and a fresh spare is made after each use. So the done screen only sets the words and plays. No loading wait.
- The grey line can arrive late: the screen starts at once, and the real line (reps and clean %, week count, new best) fills in when it is worked out. Used by workout and logged session. Weight is instant (the weight before it comes with the message).
- Weight: the done screen shows in the same moment as Submit (before the save).
- Form check: the white rep feedback card stays. Before, it was hidden before the done screen showed, which exposed what was behind it. Now it is hidden only when you tap Continue.
- No auto-continue. There WAS a bug: a 6.5 second timer was set when the screen opened and was never cancelled, so it continued on its own. Now the only timer is a safety net for a page that never loads (5 seconds), and it is cancelled the moment the page is shown. Continue is the design's own button; the screen stays until you press it.
- Wash: the design clips a growing circle (the phone draws that on the main thread, which is choppy). It is now the same circle as a layer that grows with a transform (the GPU draws it), and it takes 1000ms instead of 700ms. The design file itself is not edited; this is injected.
- Brackets: they now sit about 18px from the text sideways and about 20px above and below (the design had about 33 and 31). They are measured from the real words, so a long title and a short one both fit.
- Other screens: workout, logged session, created workout and weight all use the same host.
- NEEDS YOUR PHONE: whether the wash is now smooth, and whether it feels slow enough. The speed is `DONE_WASH_MS` in `lib/doneAnimationPage.ts`.

## 7. All sets then Back: DONE
- When All sets was opened from the rep feedback, Back goes back to the rep feedback, not to the complete screen. All sets opened from the summary still goes back to the summary. Phone log line: `recap: All sets back -> returning to the rep feedback`.

## 8. Edit sheet lag on the workout preview: DONE in code
- The sheet's two animations now start inside the tap itself, not from an effect after the screen has been drawn again. The cards are memoised so opening the sheet does not draw them again. Closing starts at once too.
- NEEDS YOUR PHONE: that it feels instant. If it still lags I will measure it with a log.

## 9. Music screen entrance: DONE
- The page eases up 14 points while it fades in, 420ms, native driver. It starts only when the page is final, as before.

## 10. Session log screen removed: DONE (please check I meant the right one)
- I read "session log screen" as the SESSION LOG review screen (the debug page with Share and Done that opened after Finish on the camera). Finish now goes straight to the next screen.
- The log is still collected exactly as before and saved quietly (every line is in the session buffer and goes to the dev log). One line says how much was kept: `[SESSION-LOG] N lines kept quietly`.
- I did NOT remove the "Log a session" screen (where you type a workout in). If you meant that one, tell me.

## Tests
New: `test-train-missed.js`, `test-round7.js`. Rewritten: `test-calendar-drop.js`. Updated: `test-goal-pages`, `test-create-starter`, `test-done-screen`, `test-log-saved`, `test-demo-music`, `test-progress-ux` (earlier), and others the full run showed.
`npx tsc --noEmit`: no new errors in files I touched. Old errors elsewhere are not mine (`formcheck.tsx` lines, `calibrate`, `ar-experiment`, `drillLibrary`, `opaque` on web views).

## Blocked commands
None.

## Files for you to delete (I did not)
- `components/DoneScreen.tsx`, `components/SavedCheck.tsx` (no longer used)
- `lib/doneTimeline.ts` (check first, possibly unused)
- `scripts/_dbg.js`, `scripts/_hdr.js`, `scripts/_hdr2.js`, `scripts/_ux_explore.js`, `scripts/_ux_prof.js`, `scripts/_ux_prof2.js`, `train_wk_webkit.png`
- In `app/formcheck.tsx` the `SessionLogReview` component and `handleReviewDone` are now unused (kept so the camera file changed as little as possible).

## Questions
- Item 10: did you mean the debug SESSION LOG review screen (I removed it) or the "Log a session" screen?
- Item 3: is dark glass over the white Home page what you want? It is the Finish pill's glass exactly, as you asked.
- Item 4: is my rule for which workout was missed fine?
