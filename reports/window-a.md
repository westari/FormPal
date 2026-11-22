# Window A report (round 8, Ari's phone test)

Branch work-a. I ran git fetch and merged origin/overnight-build first.

All eight items are done in code and tested as far as this computer can test them. What needs your phone is written under each item.

## 1. Calendar: now the Finish pill's real glass, shown side by side

I traced exactly how the Finish pill draws its glass, and put the calendar on the same thing.

Finish pill (`app/formcheck.tsx`):
`LiquidGlassButton` -> `LiquidGlass` (`components/LiquidGlass.tsx`) -> the native view `LiquidGlassView` from `@callstack/liquid-glass` (Apple's UIGlassEffect), with `effect="regular"`, `colorScheme="dark"`, no tint.

Calendar (`components/CalendarSheet.tsx`):
`StandardGlass` (`components/StandardGlass.tsx`) -> `LiquidGlass` -> the same native `LiquidGlassView`, `effect="regular"`, `colorScheme="dark"`, no tint.

A new test (`scripts/test-glass-same.js`) proves it. It replaces the native module with a recorder, runs the real `LiquidGlass.tsx` as if on an iPhone with iOS 26, builds the Finish pill from the real props in `formcheck.tsx`, renders the calendar open, and compares:

| | Finish pill | Calendar |
|---|---|---|
| native view | LiquidGlassView | LiquidGlassView (one, for the whole panel) |
| effect | regular | regular |
| colour scheme | dark | dark |
| tint | none | none |
| fallback fill | rgba(40,41,48,0.55) | rgba(40,41,48,0.55) |
| interactive (touch shimmer) | true | false |

Why it looked like an imitation, and what I changed:
- Last round the glass was a separate layer under the month, and its parent had `overflow: hidden`, a corner radius and an `opacity` that I faded for the first-open trick. A native glass view inside a faded or clipped parent draws as a plain colour. That is the most likely cause of "not liquid glass at all".
- Now the panel IS the glass view, with the month inside it (the same way the word "Finish" is inside the Finish pill). Nothing above it fades, clips or masks it (a test checks the wrapper has no opacity, overflow, corner radius or mask). The first-open trick that needed the opacity is gone; the panel is always mounted, parked above the screen, so the native view exists before the first open.
- The one difference is `interactive` (the shimmer when you touch it). I left it off on the calendar so a day tap is never taken by the glass. The look (effect, scheme, tint) is identical.

NEEDS YOUR PHONE: I cannot see real Liquid Glass here. If it still looks flat on the phone, the next thing I would check is the log line `[GLASS] real Liquid Glass: ON` at app start. Also, dark glass over the white Home page will look grey, because glass shows what is behind it and the page behind is white (the Finish pill sits over the camera picture).

## 2. Train "Missed" tag: DONE
Plain iOS system red (#FF3B30), 11.5px, 22px tall, on the design's own white pill. Tested on the real page (computed colour `rgb(255, 59, 48)`).

## 3. Create Workout "Start from a muscle group": DONE
- It is now a small tappable body map, front and back side by side (150px tall), in the same style as the Progress tab muscle map: pale silhouette, dark body outline, thin muscle outlines, same colours. Code: `lib/createBodyMap.ts`.
- Tap a muscle and that group's muscles turn dark and its real exercise list shows below ("Chest exercises" and so on). Tap it again to clear. The six groups are the same as before: chest, back, legs, shoulders, arms, core (arms = biceps, triceps, forearms; back = lats, traps, lower back; legs = quads, hamstrings, glutes, calves; shoulders include rear delts; core = abs).
- No chips, no circles, no plus-sign circles. The exercise rows keep the plain plus / check from last round.

## 4. Practice exercise search jump and flicker: DONE in code
- Cause: the page's own search box took focus, so iOS shifted the whole page and the page re-laid itself out when the keyboard came up.
- Fix: the page's search box can no longer take focus (read only). Tapping it opens a docked search bar drawn by the app. It rises with the keyboard by a native transform (on the UI thread), fades in with it (no flash at the bottom), and a tap outside closes it. What you type goes into the design's own search, so the results list is the design's own.
- Tested on the real page: after a real tap, the scroll position, canvas scale, canvas height and page height are all identical, and nothing in the page has focus.
- One honest detail: when you type the first letter, the page does ONE smooth scroll so the results sit above the keyboard (otherwise they would be hidden behind it). Before that, nothing moves.
- NEEDS YOUR PHONE: that it feels right. Log line: `[TRAIN] search bar opened (docked above the keyboard)`.

## 5. Muscle map back button: DONE
- On the Progress tab's Muscle Map page the design's white round button is hidden and the app's standard Liquid Glass back button (`GlassBackButton`) is drawn above the page in its place, fading in after the page's slide-in. Tapping it goes back through the page.
- I did only the Muscle Map page. Past Workouts and Progress Photos on that tab still have the design's white back button. Say so if you want those the same.

## 6. Weight log done screen: DONE
- Submit no longer closes the weight screen. The weight screen STAYS on screen, the done screen's wash sweeps over it, and only when you tap Continue does the weight screen close back to Progress. Progress is never seen in between. A second Submit tap does nothing.

## 7. Done screen brackets: DONE
- Back to the design's own bracket animation, exactly: same keyframes, 1620ms, 1050ms delay, same shake. The only change is where they end: closer to the words (about 18px sideways, 20px up and down).
- Why round 7 looked tangled: I had moved the end places closer but left the design's start offsets, so the left and right brackets started in the wrong places and crossed. Now each bracket starts exactly where the design starts it and unfolds to the closer end place.
- Proof: the test steps through the whole animation every 60ms and checks no two brackets ever overlap. With the round 7 values the same check finds 26 overlaps; now it finds 0.

## 8. Onboarding: DONE
- Back button next to the progress bar: the standard Liquid Glass back button on every onboarding screen (question steps, the Connect Health header, all the design-page screens, the five native screens, and the dark intro). It sits in the same 34 x 34 box as before so the progress bar does not move. The X buttons on the paywall and gift offer are left alone (they are close buttons).
- Removed the native "Don't miss a session" notification screen. Connect Health goes straight to the ready-to-build screen, Back returns to Connect Health, and the ready-to-build page is still prewarmed one screen early.
- "We want you to try FormPal for free" is in.
- Progress bar scrolls away:
  - Question steps with lists: the back button, progress bar and question are now the first thing inside the scroll view, so they scroll away with the options. The Continue button stays at the bottom.
  - Design-page screens (web pages): the page tells the app how far it scrolled and the header (back button and progress bar) moves up with it. Only the page's main scroll counts.
  - Screens that do not scroll are unchanged.
- NEEDS YOUR PHONE: the web-page version follows the scroll through a message each frame, so it may trail the page by a frame on a fast flick.

## Problem I hit and how I fixed it
My first edit script for `onboarding.tsx` matched the wrong place and duplicated a big block. I kept a copy of the broken file in my scratch folder and restored the file from git (it had no other changes), then redid the edit correctly. Nothing of yours was lost.

## Tests
New: `test-glass-same.js`, `test-train-search.js`, `test-muscle-map-back.js`, `test-onboarding-r8.js`. Rewritten or updated: `test-calendar-drop`, `test-home-header-taps`, `test-train-missed` (red tag), `test-create-starter` (body map), `test-done-screen` (brackets, no tangle), `test-progress-ux` (weight screen stays, Muscle Map back), `test-train`, `test-train-phone`, `test-train-search-keyboard` (they typed into the page's search box, which now hands over to the app's docked bar). The full suite passes except `test-rep-feedback-injection.js`, which was already failing (it needs an untracked file in `.scratch`).
`npx tsc --noEmit`: no new errors in files I touched (the only one in `onboarding.tsx` is the old `opaque` on a web view).

## Blocked commands
None.

## Files for you to delete (I did not)
- `components/DoneScreen.tsx`, `components/SavedCheck.tsx` (no longer used)
- `lib/doneTimeline.ts` (check first, possibly unused)
- `scripts/_dbg.js`, `scripts/_hdr.js`, `scripts/_hdr2.js`, `scripts/_ux_explore.js`, `scripts/_ux_prof.js`, `scripts/_ux_prof2.js`, `train_wk_webkit.png`
- In `app/formcheck.tsx`: `SessionLogReview` and `handleReviewDone` (unused since last round)
- In `app/onboarding.tsx`: `NotificationBanner` and the `nq` styles are no longer used (the notification screen is gone)

## Questions
- Item 1: if the calendar still looks flat on the phone, send me the `[GLASS]` log line from app start.
- Item 5: do you want Past Workouts and Progress Photos on the Progress tab to get the glass back button too?
