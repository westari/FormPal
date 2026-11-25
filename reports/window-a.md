# Window A report (round 11)

Branch work-a. I ran git fetch and merged origin/overnight-build first. I did not edit `app/onboarding.tsx`.

## 1. Calendar: a popover under the date arrow: DONE
- It is a small popover again, attached to the arrow beside the date ("Wednesday, November 25 ⌄"): it hangs about 12px under that row, 14px in from each side, with a small pointer on its top edge sitting exactly under the arrow. It is not a panel from the top of the screen any more. The page tells the app where the arrow is, and the popover grows out of that point.
- Font: the month title now uses no custom font family, so iOS shows its own system font (SF Pro), weight 600, 20px, like the app's other titles. (The old code named the family; now there is nothing to get wrong.)
- Instant: it was laggy because opening changed Home's state, which re-rendered the whole Home screen first, and only then did an effect start the animation. Now Home holds the calendar by a ref and calls `toggle()`: the slide is started inside that very call on the native driver, Home does not re-render at all, the month only changes when you press an arrow, and the status bar is left alone. It opens in 170ms and closes in 120ms.
- Light liquid glass kept (same native view, light scheme, no dark tint, soft shadow). The popover never fades: it appears by moving (a fade over native glass makes it flat) and waits far above the screen when closed.
- NEEDS YOUR PHONE: how fast it feels.

## 2. Practice exercise search: DONE in code (a normal iOS search)
- Last round the bar appeared at the bottom and the page scrolled on the first letter. Now: a tap on the page's search box opens the app's bar exactly on top of it (same place, same look). It slides up with the keyboard, using the keyboard's own duration, on the native driver. The matching exercises are listed in a card right above the bar; each row opens that exercise's form check. When it closes the bar slides back down onto the page's box.
- The page does not move, scroll, re-render or receive the text at all. Its own box is only hidden while the app's bar is on top of it (so it never shows twice). Tested on the real page after a real tap: scroll position, canvas scale and height are unchanged.
- NEEDS YOUR PHONE. The log line is `[TRAIN] search opened: the bar is on the page's own box and rises with the keyboard`.

## 3. Muscle maps: DONE
- The Progress tab's map now has the same dark outlines as Create Workout's: one drawing function (`bodyMapParts` in `lib/bodyMapSvg.ts`) and one ink (`MAP_INK`) drive both. Ranked muscles keep their tier colours on the Progress map. Tested on the real Progress page.
- Create Workout's map, more polished: a soft light card, each figure lifted by a gentle shadow, small FRONT / BACK labels, muscles ease to dark when picked, and a dark pill that names the chosen group (tap the pill to clear it) instead of a sentence. Figures stay big (142 x 250).

## 4. Exclamation marks: DONE
"Form check complete!" and "Weight logged!" on the done screens. (Workout complete, Session logged and Workout created have none; say if you want them too.)

## 5. All sets: DONE in code (a normal screen push)
- It had been a fade that cross-faded with the rep feedback leaving. It is now a normal push: All sets slides in from the right over the screen you are on, the screen under it moves back a little (parallax), and Back slides it out again. When it opens from the rep feedback, the rep feedback stays under it until the slide is over and only then goes, so the summary page is never seen in between. Rep 5 -> All sets -> Back still returns to rep 5.
- All the other post-workout pages still fade. This reverses the old "no sideways motion" rule for All sets only, because you asked for a normal transition.
- NEEDS YOUR PHONE.

## 6. Edit sheet lag: measured; fix applied for the part I could not measure
- I measured the two Edit sheets that live inside web pages (Home's "My workout" card and the Train tab card), on the real pages in Chromium with the phone's slower CPU (4x and 6x): the sheet starts to move within 6ms (26 to 34ms at 4x), no long task, about 12 nodes changed, and no frame over 17ms while it slides. They are not the cause (`scripts/measure-edit-sheet.js` prints the numbers).
- That leaves the native sheet on the workout preview (pencil on an exercise). I cannot measure phone drawing off the phone, but I found a real cost in it: the sheet had a blurred shadow and a rounded clip (`overflow: hidden`) on a view that moves, and iOS redraws both on every frame of the slide. Now there is no clip and no blurred shadow (the dimmed screen behind separates it), and the sheet is drawn once and only moved (`shouldRasterizeIOS`). The earlier fixes stay (the slide starts inside the tap; the cards do not redraw).
- Two log lines will prove the cause on your phone if it still lags: `[PREVIEW] edit sheet: pencil tapped, slide started Nms after the tap` and `[PREVIEW] edit sheet: screen redrawn Nms after the tap`. Send me both.

## 7. Onboarding Bronze icon: DONE
- The Bronze file is the right picture (the plain shield); the wheel drew every shield at one fixed width and height, which stretched the square ones (Bronze to Champion's tall shape) and relied on a resize setting that is not reliable on every build. Now each shield is drawn at its own proportions: Bronze to Platinum are square (206 x 206), Champion keeps its taller shape (203 x 288), worked out from each picture's real size (`lib/fitInBox.ts`), with the resize setting also in the style. The wheel opens at the start with Bronze in the middle.
- NEEDS YOUR PHONE: if Bronze still looks like Champion there, send a screenshot: the code and the files are right, so it would be something I cannot see from here.

## 8. Save Your Progress: DONE
- The REAL FormPal logo: I searched the repo first. The only logo files in it are the old ATHLT picture and the plain app-icon disc. Your logo is in your Downloads folder as `formpallogo.html`; I rendered its own shapes (the four viewfinder corners and the person with dumbbells) into `assets/images/formpal-logo.png` (white on transparent, 1012 x 1012), and it matches the image you attached. The screen shows that file; the drawn placeholder and wordmark are gone.
- Background: a dark GYM scene drawn in code (`components/onboarding/GymBackground.tsx`): the back wall in low light with a warm spotlight, a two-shelf dumbbell rack, weight plates at the sides, kettlebells and a rubber floor with soft lines, fading into near-black under the buttons. No space.
- The Apple logo is 26 (was 18). No back button except on the e-mail form (kept).
- Edited only `SaveProgressScreen.tsx` plus new files (`GymBackground.tsx`, the logo file) and the logo component.

## Tests
New: `test-round11.js`, `scripts/measure-edit-sheet.js` (numbers, not a pass/fail test). Rewritten: `test-calendar-drop`, `test-train-search`. Updated: `test-glass-same`, `test-home-header-taps`, `test-progress-map`, `test-create-starter`, `test-save-progress`, `test-done-screen`, `test-slide`, `test-rep-feedback-r10`, `test-round7`.
`npx tsc --noEmit`: no new errors in files I touched.

## Blocked commands
- `rm scripts/measure-preview-open.js`: it is an empty stub I created and abandoned (the hook blocked deleting it). It is unused; please delete it.

## Files for you to delete (I did not)
`scripts/measure-preview-open.js` (above), `components/onboarding/SpaceBackground.tsx` (no longer used), plus the earlier list: `components/DoneScreen.tsx`, `components/SavedCheck.tsx`, `lib/doneTimeline.ts` (check first), the `scripts/_*.js` scratch files, `train_wk_webkit.png`, the unused `SessionLogReview` and `handleReviewDone` in `app/formcheck.tsx`, the unused `NotificationBanner` and `nq` styles in `app/onboarding.tsx`, and `lib/progressBodyMap.ts`.

## Questions
- Item 4: do you want the exclamation mark on the other done titles too?
- Item 6: if the preview sheet still lags, send the two `[PREVIEW]` log lines.
- Item 7: if Bronze still looks wrong, send a screenshot.
