# Window A report: Ari's phone test (14 items)

Branch: work-a. Merged origin/overnight-build first (already up to date). Read the newest session of the dev log.

## Result by number

| # | Item | Status |
|---|---|---|
| 1 | Remove the date line under every tab header | Done |
| 2 | Home header is the live date with a grey calendar icon; tap opens the full calendar | Done |
| 3 | Blank screen for ~10s when opening the app | Done in code. Cause found in the log. Needs your phone to confirm the new number |
| 4 | Train laggy on tap, Progress white on first tap | Done in code. Cause found in the log. Needs your phone to confirm |
| 5 | Streak fire animated | Done |
| 6 | Streak number back inside the fire, clean | Done |
| 7 | Tap the fire on Home opens the streak screen | Done |
| 8 | New "Session logged" thumbnail: light card, small lit body, label | Done |
| 9 | Build with Cue uses the shared new orb | Done |
| 10 | "Workout saved" screen: white wash, drawing check, haptic, close in ~1s | Done in code. Not run on a phone |
| 11 | "FormPal templates" is now "Templates"; the tabs fit with no sideways scroll | Done |
| 12 | Practice Exercises search looks cut off when focused | Done |
| 13 | New Start workout icon in the plus menu | Done (play.fill) |
| 14 | Cue orb in the plus menu a bit smaller | Done (48 to 42) |

## What I found in the log (items 3 and 4)

Newest session, first launch (times are after the app's JS started):

- +0.8s tab bar mounted. The tab visits were planned for +0.35s and +0.8s, but "TRAIN focused" only came at +4.1s. The cover also lifted at +4.1s. The visits ran 3.7s late.
- Why late: the JS thread and the web engine were busy with a big hidden recap page (it said "warm" at +2.4s), the clip catch-up (100+ "adopted a clip" lines in 0.7s, one time only) and the three design warm-ups that start at +2.5s. All of that ran at the same time as the four tab pages.
- Train and Profile only began loading at +4.2s. Their pages were ready at +6.0s ("progress first open: shown -> ready 1907ms").
- Second finding, this is the one behind "Progress is white on first tap": the tab visits ran once per app run. After every workout recap the whole tabs screen is rebuilt (log at 01:04:12 and 01:11:04: "layout mounted", "TRAIN mounted" again). Nobody visited the tabs again, so the next first tap loaded the page in front of you: "progress first open: shown -> ready 1656ms". At 01:11:21 iOS also killed the Train web view while all this was loading, and the next Train tap took 3.4s ("train shown again 3410ms").
- Normal revisits are fine: 13 to 35 ms in the same log. The big numbers like 30267ms are time spent away, not lag.

What I changed:

- New gate in lib/launchGate.ts. The hidden recap page and the Create workout / My workouts / Log a session warm-ups wait for it. It opens 1.8s after the tab visits finish, with an 8s backstop. A recap that a screen asks for early is never held back.
- The tab visits now start at 60ms (was 350ms) and run in 90ms steps. The planned cover time is 390ms (was 760ms).
- The tab visits now run every time the tab bar is built, not once per app run. So after a workout recap all four pages are loaded again behind a short cover.
- The tab pages already sit on the page colour (#eeeef1), so a page that is still loading is grey, not white.

What to look for in the next log (this is how I prove it on your phone):

- `[TAB-LAG] cover lifted ~400ms after the tab bar mounted` (was about 3300ms late).
- `[TAB-LAG] progress first open: shown -> ready` and `profile first open` should be about 0 to 300ms. They were 1656 to 1907ms.
- After a workout recap, the same lines should show again and a tap on Train/Progress right after should read `shown again ~20ms`.

What I can not see: the time before the app's JS starts (iOS launch, splash, loading the bundle from the dev server). The log starts at JS start. If a white screen still shows before the first `[session] start` line time, that part is not in my code. The 100+ clip adoption is one-time and is Window B's file (lib/sessionVideo.ts); I did not change it.

Tests: scripts/test-launch-speed.js (source and timing checks, gate unit test), scripts/test-tabs.js updated.

## Headers (items 1 and 2)

- No date line under any title now. Home, Train, Progress and Profile share one header: same font, weight, spacing and left edge, same vertical centre (all four measured at the same y in a real browser, 22px left, centre 148px).
- Home's title is the live date ("Thursday, November 12", worked out on the phone each time) with a small grey calendar icon beside it. The date is 23px, not 30px: at 30px it does not fit next to the streak chip. It is "as big as fits, 30px at most". Train, Progress and Profile are the full 30px.
- Tapping the date or the icon opens a full calendar (components/CalendarSheet.tsx). Nothing like it existed, so I built one: a white sheet, one month at a time with arrows, today ringed, a dot on every day you trained, "N days trained" under the month, Done button.
- Tests: scripts/test-tab-headers.js (measures all four), scripts/test-home-header-taps.js (real clicks on the date, icon, fire chip and number; plus the month grid maths).

## Streak (items 5, 6, 7)

- Why the fire never moved: the page-fit code switches off every animation inside these pages (`#dc-root * { animation: none !important }`). That also killed the design's own sparkles and rising embers. I put the animation back with inline `!important` for the flame and for the design's endless sparkles and embers. The outer flame sways and breathes (3.4s), the inner flame flickers faster (2.2s). It respects "reduce motion".
- Number: it sits inside the cream belly of the flame, deep orange (#e8590c) on cream, 46px for 1 to 2 digits, smaller for 3+. It is a child of the inner flame, so it moves with it and never looks stuck on. I viewed the screenshot: it reads clearly and does not touch the edges.
- Home: tapping the fire chip (the flame or the number) opens the streak screen the same way Train does, and back returns to Home.
- Tests: scripts/test-streak.js (flame animation names and changing transforms, number inside the flame, number colour), scripts/test-home-header-taps.js.

## Session logged thumbnail (item 8)

Light flat card (#f2f3f7, no gradient), a small body (front or back, whichever side has more of the session's muscles) with the muscles that session trained lit in their current rank colour (bronze if unranked), a small "Session logged" label. The workout name on the card is now dark so it can be read. Camera workouts keep their video frame. Works on Home and Progress, and the narrow list rows get a smaller label.
Test: scripts/test-progress-ux.js (flat light colour, body present with lit muscles, label, dark name, no play icon, no gradient).

## Create workout, My workouts, Search (items 9 to 12)

- 9: The design's own orb was drawn with its texture layers. Create workout, My workouts and Log a session now use the one shared Cue orb (lib/cueOrb.ts), on the Build with Cue button and in the open sheet. Test: scripts/test-create-orb.js.
- 10: components/SavedCheck.tsx redone, used by "Workout saved" and "Session logged": a white panel with a curved top sweeps up (0 to 300ms), a green ring draws itself, then the check draws itself (to 620ms), the words fade up (to 780ms), then it leaves at 1000ms. The success haptic still plays when Save is pressed (in the screens). I could not run React Native here, so the test (scripts/test-create-saved.js) checks the source and the timeline order. Please look at it on the phone once.
- 11: "FormPal templates" is "Templates" (tab and heading). Tabs are 34px tall, 12.5px text, 5px gaps: all four fit in one row (last one ends at 360 of 390px), no sideways scroll. Test: scripts/test-design-screens.js.
- 12: Cause: the keyboard shortens the visible area but the Train page stayed 844 tall, so the bottom of it (the search box and results) sat behind the keyboard and could not scroll up. Now the page is only as tall as what is visible while the keyboard is up, and the tapped box scrolls above the keyboard. Keyboard simulated by shrinking the window to 508px: the box is inside the visible area, results appear and fit. With the keyboard down the page is 844 again. Test: scripts/test-train-search-keyboard.js. I also fixed scripts/test-train-phone.js, which looked for the canvas by its old fixed height.

## Plus menu (items 13 and 14)

- Start workout now uses the SF Symbol `play.fill`. Alternative if you do not like it: `bolt.fill` or `figure.run` (one word in components/PlusMenu.tsx).
- Cue orb is 42 (was 48).

## Tests

Whole suite run. Everything passes except scripts/test-rep-feedback-injection.js (Window B's: it needs an untracked .scratch file, failed before my changes too). `npx tsc --noEmit` shows no errors in files I touched; the errors it prints are in ar-experiment, calibrate, formcheck and onboarding (not mine).

## Things I touched outside my area

- components/WarmSurfaces.tsx (Window B's): the layers only mount after the launch gate or when a screen activates them. The state still says recap is wanted from app start (test-warm-surfaces still checks that).
- Nothing in lib/sessionVideo.ts this time.

## Questions (answer when you can)

- Home date at 23px is smaller than the 30px titles on the other tabs because of the streak chip. If you want it bigger, the choice is to drop the chip's number or let the date wrap on two lines. Which one?
- Is `play.fill` OK for Start workout?

## Blocked commands (a hook blocked these as "deletes or discards files"; nothing was deleted, I redid the edits with the Edit/Write tools)

1. `python - <<'EOF' ... EOF` (a python heredoc that added the flame animation and number checks to scripts/test-streak.js) followed by `node scripts/test-streak.js | tail -12`. Blocked as a delete command. Nothing was deleted.
2. `sed -i "s/const ro = out.getBoundingClientRect(), ri = inn.getBoundingClientRect(), rn = n.getBoundingClientRect();/.../" scripts/test-streak.js && node scripts/test-streak.js ...` (a one-line text swap in the same test). Blocked the same way. Nothing was deleted.

## Files for you to delete (I never delete)

`.scratch\` (folder), `scripts\_dbg.js`, `scripts\_hdr.js`, `scripts\_hdr2.js`, `scripts\_ux_explore.js`, `scripts\_ux_prof.js`, `scripts\_ux_prof2.js`, `train_wk_webkit.png`
