# Window A report: Ari's phone test (13 items)

Branch: work-a. Merged origin/overnight-build first. Read the newest session of the dev log (2026-11-15, session start 18:39:48).
I did not touch the "Workout saved", "Session logged", weight or photo check screens.

## Result by number

| # | Item | Status |
|---|---|---|
| 1 | App takes 10+ seconds to open; cover must lift on a hard timeout | Done in code. Cause found in the log. Needs your phone to confirm the new time |
| 2 | Done after a workout takes ~5s to show Home | Done in code. Cause found. Needs your phone to confirm |
| 3 | Train flashes on first tap | Done in code. Cause found. Needs your phone to confirm |
| 4 | Home date as big as the other titles (shorten the month if it does not fit) | Done |
| 5 | Down-arrow instead of the calendar icon; flips up; calendar drops down from it in real Liquid Glass | Done. The glass look needs your phone (Chromium has no Liquid Glass) |
| 6 | The "y" in "My workout" cut off on the Today card | Done (Train and Home) |
| 7 | Streak number nudged left | Done |
| 8 | Schedule: Missed vs Rest, no two rest days in a row, plan day pattern | Done |
| 9 | Start workout always opens a real workout | Done |
| 10 | My workouts: test that everything is wired | Done, 21 checks, all pass. Nothing was broken |
| 11 | Logged-session cards: no muscle map, clean simple card | Done |
| 12 | Form checks are practice: not in Recent/Past workouts, not in streaks or the calendar; own "Form checks" list in Progress | Done on my side. Needs Window B's `kind: 'practice'` on the entry (see below) |
| 13 | Other plus-menu icons slightly bigger so they match Start workout | Done |

## 1. The 10+ second open (real cause from the log)

The log of the cold start:

- 18:39:48.74 last line of the app code loading (modules built).
- 18:40:16.80 the first screen ("layout mounted"). **28 seconds with no log line at all.**
- After that, everything is fast: tab bar mounted, pages ready about 2.9s later.

So the 28 seconds is spent before any screen draws, with the loading screen up. Nothing in my tab code runs in that gap. The only thing the root layout waits for is the fonts (`useFonts`, nine font files): `if (!fontsLoaded && !fontError) return null`, and the loading screen is held until then. On a dev build the font files come over the network from your computer, which fits a long silent wait. I can not prove from the log that it is the fonts (no line says when they finished), so this is the most likely cause, not a proven one.

What I changed:

- app/_layout.tsx: the first screen now waits for fonts at most 1.5s (`FONT_WAIT_MS`), then shows the app and hides the loading screen. If the fonts are late, text uses the system font until they arrive. New log lines tell us the truth next time: `[LAUNCH] first screen allowed Nms after the app code started | fonts: loaded / NOT loaded yet` and `[LAUNCH] fonts loaded Nms ...`. If the first number is about 1500 and fonts say "NOT loaded", fonts were the cause.
- The saved plan is loaded into the plan store at app start.
- Launch cover (components/GlassTabBar.tsx): it now lifts when the four tab pages are drawn, with a **hard stop at 2.5s** after the tab bar mounted (`LAUNCH_COVER_MAX_MS`), a plain timer that does not depend on any page. Before, it lifted at about 1s while pages were still loading, so you saw an empty Home load.
- Bug in my last gate: the "launch gate" that holds back the big hidden pages had its 8s backstop timer start when the code loaded. With the 28s gap it had already run out, so the hidden recap page loaded at the same time as the tabs (log: `[warm:recap] warm` at +0.9s). The backstop now starts when the tab bar mounts.

What to look for in the next log: `[LAUNCH] ...` lines, then `[TAB-LAG] cover lifted Nms ... | all four pages ready: yes` (about 2000-2500ms or less).

## 2. Done takes ~5s

In the log, Done at 18:49:57.607 is followed by `[TABS] layout mounted`, `[TRAIN] mounted`, `home shown again | page already visible: NO (it is loading again)`, a 1070ms cover, pages ready 1 to 2s later. Cause: after a form check or workout the stack is [tabs, picker/workout, recap]. Done called `router.replace('/(tabs)/')`, which builds a SECOND tabs screen on top, so all four web pages loaded again from scratch.

Fix: lib/leaveToTabs.ts uses `router.dismissTo(...)`, which goes back to the tabs that are still there underneath, with all four pages already loaded. Used by the recap Done (form check), the streak screen's Continue and the progress photo screen's finish. (app/recap.tsx, app/streak-screen.tsx and app/progress-photo-screen.tsx are one-line changes.) If `dismissTo` is missing or throws it falls back to the old replace. I can not run the router here; the test checks the code path and the fallback. On your phone the log should show no `layout mounted` after Done.

## 3. Train flash on first tap

Cause in the log: when the cover lifted (+1.0s), the Train page had not even started loading (`TRAIN web view load start` at +2.0s, ready at +2.9s). A tap on Train in that window showed a half-drawn page. Same after a workout (item 2). Fix: each tab reports when its page is drawn (lib/tabReady.ts; also when iOS kills it). The launch cover waits for all four (hard stop 2.5s). A tap on a tab that is not drawn yet shows the page-coloured cover until it is (hard stop 1.5s). Normal revisits are unchanged (13 to 35ms in the log).

## 4 and 5. Home header, down-arrow and calendar

- The date is now 30px like the other titles. If the long month does not fit next to the streak chip it becomes "Sunday, Nov 15"; for the very longest days the weekday is shortened too ("Wed, Jan 7") so it still stays 30px. Tested for every day of the year at the Home width: 30px, one line, clear of the chip, every day.
- The calendar picture is replaced by a simple grey down-arrow beside the date. Tapping the date or the arrow flips it up and drops the calendar down from the header (components/CalendarSheet.tsx): a Liquid Glass card (the same LiquidGlass component as the tab bar) under the date that grows out of the arrow's position (not a sheet from the bottom). Month with small arrows, today in a dark circle, a dot on every day you trained, "N days trained". Tapping the arrow again, the dim area below, or leaving Home closes it.
- Honest limits: Liquid Glass only draws on your phone build (the page and the arrow flip are tested; the glass look is not). I built the "like Bevel" look from the description, not from a picture.

## 6. The cut-off "y"

The workout name box on the Today card has `overflow: hidden` (for the "..." when the name is long) and a tight line height. I can not reproduce the cut in Chromium; I measured that the "y" tail sat only about 5px inside the box edge, which iOS WebKit rounds differently. Fix: the box grows 5px downward (6px on Home) and moves back up by the same amount, so nothing else shifts. Test checks the padding and that the glyph bottom is inside the box. Needs a look on the phone.

## 7. Streak number

Moved 4px left (measured 3.8px left of the exact middle of the flame belly).

## 8. Train schedule

- A day you did not train that the plan had a workout for now says "Missed". "Rest day" only appears on the plan's own rest days. Days before the plan existed say "No workout".
- The plan itself has no weekdays (it is a queue of workouts), so the week is laid out from its days per week (lib/trainData.ts `trainingWeekdays`): 1: Wed. 2: Mon, Thu. 3: Mon, Wed, Fri. 4: Mon, Tue, Thu, Sat. 5: Mon, Tue, Thu, Fri, Sat. 6: Mon to Sat. 7: every day. With 4, 5, 6 or 7 days a week there are never two rest days in a row. With 3 days a week one weekend pair is unavoidable (4 rest days into 3 gaps); with 1 or 2 days there are longer stretches. This is a new rule: it means a plan day does not move to the next day anymore. If today is a rest day in the pattern, today shows "Rest day" with "Train anyway", and tomorrow shows the next workout.
- The design's rest card has "Rest day" typed in; the Train page now changes that title to "Missed" for missed days.
- Tests: scripts/test-train-schedule.js (pattern, strip, the real page), test-train.js, test-plan-edit.js updated (5 days a week so Thursday and Friday are both training days).

## 9. Start workout always opens a workout

Cause: the plan store was only filled when something loaded it. Nothing did at app start, so the first Start workout read an empty store and showed "No workout scheduled - generate a test plan" even with a full plan saved. Fix: the plan is loaded into the store at app start and when the preview opens; the preview shows a blank page of the same colour while loading, then the workout asked for, else the plan's next workout, else a starter from Templates ("Beginner full body"). The old message screen and its "Generate a Test Plan" button are deleted. Note: it is the plan's NEXT workout on a rest day too (that is what "Train anyway" does). The starter is only used when there is no plan workout at all. Tests: scripts/test-workout-preview.js (no plan -> starter, can be started; loading -> blank; message gone from the code).

## 10. My workouts wiring

scripts/test-my-workouts-wiring.js clicks everything on the real page with real data: the 4 tabs (right cards under the right headings), all 9 cards from the picture and from the name (18 taps, each opens its own id), all 9 bookmarks (save, un-save, never open the card), bookmark floats to the top of its section, search (match, no match, clear), Create workout, Back; then checks the app side sends each to a real route (back, /create-workout, /workout?template=, /workout?id=, saved list stored on the device) and that all 6 templates open real workouts. All pass. I found nothing broken.

## 11. Logged-session card

Muscle map removed. The card is a flat light card with a simple icon, the workout name and "Session logged". Removed the helper that drew the map (`loggedBodySvg`).

## 12. Form checks are practice

- `SessionEntry.kind?: 'workout' | 'practice'` added (lib/sessionLog.ts) with `isPractice`, `workoutSessions`, `practiceSessions`. **Window B's change was not in the branch yet, so I defined the field myself as `kind: 'practice'`. Window B must write exactly that.**
- Practice never counts toward: the streak (calcStreak, Home chip, Train, Progress, streak page), Train's week strip and calendar, Home's calendar dots, Recent workouts (Home), Past workouts, personal bests and the form chart (Progress), Profile's member-since, workouts and badges.
- Progress has a new small "Form checks" list below Past workouts (newest 12: name, when, reps and form %). A row opens that form check's recap (the same screen a past workout opens; it shows its video and rep feedback when they were saved). Hidden when there are none.
- Not changed (you did not ask): practice reps still count toward muscle ranks.
- Tests: scripts/test-practice-sessions.js (data for Home, Train, Progress, Profile, the streak page, plus the real Progress page and a tap on a row).

## 13. Plus menu icons

The play triangle is a solid shape so it looks bigger. The other icons are 30 (were 26); Start workout stays 26.

## Tests

Whole suite run and every failure from my changes fixed. The only failing test is scripts/test-rep-feedback-injection.js (Window B's; it needs an untracked .scratch file; it failed before my changes too). `npx tsc --noEmit` shows no errors in files I touched.

New tests: test-launch-speed (rewritten), test-home-header-taps, test-tab-headers (366 days), test-train-schedule, test-train-search-keyboard (last round), test-my-workouts-wiring, test-practice-sessions, test-name-clip, test-create-orb. Updated: test-streak, test-tabs, test-train, test-plan-edit, test-train-phone, test-workout-id, test-workout-preview, test-progress-ux.

## What only your phone can show

1 / 2 / 3 timings, the Liquid Glass calendar look, the "y" cut, the font swap at launch. Send the next `[LAUNCH]` and `[TAB-LAG]` lines.

## Things I touched outside my area

- app/recap.tsx (Window B): the one line in Done that leaves to the tabs (and an import).
- components/WarmSurfaces.tsx: (last round) layers wait for the launch gate.

## Questions

- Rest-day rule: is "Rest day today, workout moves to the next training day" what you want for plans with fewer than 7 days a week? (It is what you asked for; I want to be sure it does not feel like a plan day disappeared.)
- Font swap: if the fonts are late at launch, native screens may keep the system font until the next start. Is that OK, or do you prefer the app to wait longer?

## Blocked commands

None this round.

## Files for you to delete (I never delete)

`.scratch\` (folder), `scripts\_dbg.js`, `scripts\_hdr.js`, `scripts\_hdr2.js`, `scripts\_ux_explore.js`, `scripts\_ux_prof.js`, `scripts\_ux_prof2.js`, `train_wk_webkit.png`
