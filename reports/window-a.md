# Window A report (round 10)

Branch work-a. I ran git fetch and merged origin/overnight-build first. I did not edit `app/onboarding.tsx` (Window B owns it).

## 1. Calendar glass: DONE (light glass)
- Same native glass view as before (`LiquidGlassView` through `components/LiquidGlass.tsx`), now with the LIGHT colour scheme and no dark tint (the tab bar's settings: variant "regular", fallback `rgba(255,255,255,0.82)`). Text, arrows and the dot are dark on it; today is a dark circle with a white number again; the status bar goes dark while it is open.
- A soft shadow (`boxShadow`) under the panel's bottom edge lifts it off the white page. It is drawn outside the panel, so it cannot clip or flatten the glass (nothing above the glass fades or clips it, as before).
- Why not the "clear" variant: it has no frosting, so the page's own text and cards would show through crisp, right under the month grid, and be hard to read. "Regular" in the light scheme is the real frosted glass the tab bar uses. It is one constant (`CAL_GLASS` in `components/CalendarSheet.tsx`) if you want to try "clear".
- NEEDS YOUR PHONE: how it looks over your Home page.

## 2. Train "Missed": DONE
- A day is only missed after it ends. Today's card never says "Missed" now. If today is a rest day and an earlier day's workout was missed, today's card shows that workout with the label "Today" and the button "Do it today". The red "Missed" tag stays on the earlier day's own card (also with "Do it today").

## 3. Create Workout muscle map: DONE
- Bigger: each figure is about 142 x 250 (was 86 x 150), so muscles are easy to tap.
- One shared muscle map: the drawing function `bodyMapParts` in `lib/bodyMapSvg.ts` (also behind the Progress tab and the after-workout screens). Create Workout uses it outlined with a dark ink on every muscle and the body, with each muscle tagged by its group so a tap picks it. The old separate copy of the drawing is gone.
- Please check this: you wrote "the same map as the Progress tab (black outlines on everything)". The Progress tab's own map on the Progress page is drawn clean (soft grey, white seams, no dark lines). I followed "black outlines on everything" for Create Workout, and made both come from the one shared function. I did not change the Progress tab's look because you love it. If you meant the Progress tab should get outlines too, it is one flag.

## 4. Weight done screen: DONE
- Tapping Continue now buzzes (a light haptic, like every main button) on the done screens. The title is "Weight logged" (no exclamation mark in the app; if you see "!" on your phone, tell me where).

## 5. Done screen brackets: DONE
- Only the bracket ends changed: each bracket's two arms are shorter (about 6 long instead of 13 on each side of the corner). The corner, the curve, the positions, the timing and the whole animation are exactly as before. Painted bracket is 17 x 17 (was 24 x 24); at least 28px stays clear between the top and bottom brackets (tested). The no-overlap test through the whole animation still passes.

## 6. Rep feedback: DONE
- "Rep 1 of 8": the tag shows the total, in a bigger pill (30px tall, 15px words).
- Next rep went to the wrong place and the bar jumped back because: (1) the player keeps reporting its OLD time for a moment after a seek, and each of those old times moved the bar back; (2) the rep time is when the rep was counted (its end), so near the end of the clip the video hit the end and looped to the start. Fix: old times are ignored after a seek until the player reaches the target (or 1.2s passes); the seek goes 1.5s before the rep so the rep plays, and never to the last half second. Tested on the real page.
- All sets opens cleanly: the All sets page is put on screen under the rep feedback first (same trick as Finish review), then the rep feedback leaves, so the summary page no longer flashes in between.
- Rep 5 -> All sets -> Back lands on rep 5 (the page reports the rep, All sets remembers it, coming back opens on it and the video goes to it). Opening normally still starts at rep 1 with no seek.
- NEEDS YOUR PHONE: the All sets opening and the rep 5 round trip (they depend on the real screens; I tested the page parts and the order of the app code).

## 7. Save Your Progress: DONE
- New look from your reference: a dark space screen (stars, the curved lit edge of a planet with a glint and a thin flare, drawn in code, no image), the FormPal logo in the middle, a white "Continue with Apple" pill, a grey "Continue with email" pill, "Privacy policy" and "Terms of service" under them. A small "Last used" tag sits on the button you used last (remembered on the phone). Back button (dark version), progress bar and the temporary Skip are kept. The email form is restyled dark. Sign-in code is unchanged.
- No Google button: Google sign-in is not built (the old instruction was "No Google for now"), and a button that does nothing is worse than none. The two checkbox sentences are gone; the footer links are plain text because the project has no privacy or terms address yet.
- The FormPal logo: there is no logo file in the project except the app icon, which is a plain dark disc. I drew a white disc with a small dot plus "FormPal" in the heavy font (`components/onboarding/FormPalLogo.tsx`). When you have the real logo, only that one file changes.
- New files: `SpaceBackground.tsx`, `FormPalLogo.tsx`. Edited: only `SaveProgressScreen.tsx`.

## Tests
New: `test-rep-feedback-r10.js`, `test-save-progress.js`. Updated: `test-glass-same`, `test-calendar-drop`, `test-home-header-taps`, `test-train-missed`, `test-train-schedule`, `test-create-starter`, `test-done-screen`.
`npx tsc --noEmit`: no new errors in files I touched.

## Blocked commands
None.

## Files for you to delete (I did not)
Same as before: `components/DoneScreen.tsx`, `components/SavedCheck.tsx`, `lib/doneTimeline.ts` (check first), the `scripts/_*.js` scratch files, `train_wk_webkit.png`, the unused `SessionLogReview` and `handleReviewDone` in `app/formcheck.tsx`, the unused `NotificationBanner` and `nq` styles in `app/onboarding.tsx`, and `lib/progressBodyMap.ts` (unused copy of the outlined drawing).

## Questions
- Item 3: should the Progress tab's own map also get the dark outlines, or only Create Workout?
- Item 1: want to try the "clear" glass variant on your phone?
- Item 7: send me the real FormPal logo when you have it.
