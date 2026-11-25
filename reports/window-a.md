# Window A report (round 9)

Branch work-a. I ran git fetch and merged origin/overnight-build first. I did not touch the trial reminder, paywall or gift offer screens.

## 1. Onboarding top bar: DONE (moved INTO the page)

Why it glitched: the back button and progress bar were drawn by the app above the web page, and moved with the page by a message sent each frame. A message always arrives after the page has already moved, so the bar trailed, jittered and drifted over the text on a fast flick. That cannot be made perfect, so I did what you said: the bar is now part of the page.

What changed:
- On every design-page onboarding screen except the three left alone (see below), the back button and progress bar are built inside the page, placed at the top of the document. They scroll with the page on the very same frame, so there is nothing to lag.
- Same place and size as before: 40px round back button 17px from the left, a 4px progress bar next to it, same fill (the real progress). A tap on back goes back; the app can still move the progress.
- If the page ever rebuilds itself and the bar disappears, it is put back.
- The native app-drawn bar is no longer drawn for those pages, so nothing is left to trail.
- The list question screens (native) were already inside their scroll view from last round and are unchanged. Screens that do not scroll look the same.

Proof (`scripts/test-onboarding-header.js`, runs the real shipped code on the real plan-ready page, which scrolls 1066px on a short phone):
- Fast flick: 200 big scroll jumps (40 to 400px each), sampled every frame: the bar is exactly where the page puts it every time (worst error 0.000px).
- Real mouse-wheel flicks up and down, sampled every frame: worst error 0.000px.
- Scrolled down 400px, the bar is off the top with the page, not floating over text. At the top it does not sit on any text.
- Checked on the plan-ready, starting-point, good-hands and form-confidence pages: one bar, same spot.

One trade-off, honestly: a web page cannot hold a real native Liquid Glass view, so on these design pages the back button is a light round button (white, soft shadow, the same chevron) instead of real glass. On the native onboarding screens it is still the standard glass button. If you would rather keep real glass on the design pages, the only exact way is a bar that stays fixed at the top with the page starting below it (it would not scroll away, and the page would be about 50px shorter). Tell me if you want that instead.

Left alone on purpose (another window owns them): the trial reminder, paywall and gift offer keep their own bar exactly as it was, including its scroll-follow. If that trailing shows up there, it needs the same change from that window.

## 2. Goal graph target marker: DONE

This is the "Estimated progress" graph on the plan-ready screen ("TARGET 160 lb").

What was wrong, found by measuring:
- The badge was placed with a hand-made scale that ignores how the picture really fits its box (a 300 by 190 picture in a wider box is centred with empty bands at the sides). It landed 20 to 40px off, and on a long label it ran past the card's right edge.
- For muscle gain the design's own dot and triangle sit at x 256, which is on the line but not at its end (the line runs on to x 292).

Fix: the end point is read off the line itself (its last point). The end dot and the little triangle are drawn exactly on it, and the badge is placed from the picture's real screen transform, centred over the end and kept inside the card (if it has to shift left near the right edge, the triangle still points at the exact end). It is placed again on every pass, on resize, and when the web font arrives.

Proof (`scripts/test-goal-target-marker.js`): five targets (lose 200 to 160, lose 300 to 99.5, gain 150 to 195, gain 120 to 1000, same weight 160 to 160) on three phone widths (360, 390, 430), both falling and rising lines. For each: the end dot is within 0.6px of the line's last point, the triangle tip is directly above it, the badge sits on the triangle and fully inside the card, the start dot is on the first point. With the old code the same test fails 21 times; with the fix it passes.

Honest limit: the line's shape is the design's own fixed curve (it does not stretch with the number). The marker follows its end for any weight and date, as asked.

## Tests
New: `test-onboarding-header.js`, `test-goal-target-marker.js`, helper `scripts/lib/onboarding-extract.js` (pulls the shipped page code out of `onboarding.tsx` so tests run the real thing). Updated: `test-onboarding-r8.js`.
`npx tsc --noEmit`: no new errors (the one in `onboarding.tsx` is the old `opaque` on a web view).

## Blocked commands
None.

## Files for you to delete (I did not)
Same list as last time: `components/DoneScreen.tsx`, `components/SavedCheck.tsx`, `lib/doneTimeline.ts` (check first), the `scripts/_*.js` scratch files, `train_wk_webkit.png`, the unused `SessionLogReview` and `handleReviewDone` in `app/formcheck.tsx`, and the unused `NotificationBanner` and `nq` styles in `app/onboarding.tsx`.

## Questions
- Item 1: are you fine with a light round back button (not real glass) on the design-page onboarding screens, so it can scroll with the page exactly? If not, I can do the fixed glass bar with the page below it.
