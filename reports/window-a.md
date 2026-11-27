# Window A report (round 12)

Branch work-a. I ran git fetch and merged origin/overnight-build first. I did not edit `app/onboarding.tsx` or the GlassBackButton.

## 1. Calendar grows out of the arrow: DONE
- It now grows out of the arrow's point: it starts at 12% size at the pointer and scales up to full size in 250ms (closing takes 180ms), on the native driver. The month inside fades in as it grows.
- The fade is on the content INSIDE the glass, never on the glass itself (a fade on a parent makes native glass flat). Everything else (place, pointer, font, size) is unchanged.
- Why it used to "spawn in": the start value was only given to the native side on the first open, so the first frame showed it full size. Now it is handed over when the screen mounts, so the first frame is the tiny one.
- Tested: `scripts/test-calendar-drop.js` passes. NEEDS YOUR PHONE: how smooth it feels.

## 2. Streak page: DONE
- Lag: the screen used to wait for your saved sessions first, and only then start loading the page from nothing. Now the page starts loading the moment the screen opens, at the same time as the sessions are read. The streak is handed to the page as soon as both are ready. It is still only shown once it has the real numbers (no "Day 1" flash).
- Stars: they used to tilt 14 degrees while fading (looked sideways) and jumped to random places (bunched up or odd spots). Now there are 6, upright, in fixed balanced places: 3 on each side of the flame, mirrored (small high, big middle, mid low). Each only fades and gently grows in place, each on its own timing.
- Tested: `scripts/test-streak.js` passes (upright, still, 3 + 3 mirrored, on screen). Screenshot: `.scratch/streak-stars-r12.png`.

## 3. Missed day icon: DONE
- A missed day on the Train tab's week strip and in the calendar now shows its own small icon under the day, in the same spot as the rest-day moon: a small red circle with a white cross.
- A missed day never shows the moon or the fire icon.
- Tested: `scripts/test-train-missed.js` passes.

## 4. Create Workout muscle map: DONE
- Taps are instant now. Before, every tap waited for the page's next pass (about 40ms), then rebuilt the whole card (re-reading both big drawings), and the colour faded in over 180ms under a shadow filter that had to be redrawn. Now the map is built once. A tap changes the muscle colours, the pill and the list right inside the tap (measured: 0.3ms). There is no fade and no shadow filter. `touch-action: manipulation` is set so iOS never waits for a double-tap.
- Clean shapes: the shapes came from a traced image (straight-line pieces with tiny noise slivers), so with outlines they looked hand-drawn. Now every shape is a smooth curve through the same points. The tiny slivers (2 to 5 point specks along the thighs and shoulders) are left out, and the body outline gets one gentle smoothing pass. Outlines are an even width on screen everywhere: 1.1px on muscles, 1.8px on the body.
- The Progress map is drawn by the same function, so it got the same clean shapes and stays identical.
- Tested: `test-create-starter.js` (taps, instant, built once, smooth, even) passes, and so do `test-progress-map.js`, `test-muscle-ranks.js` and `test-muscle-map-back.js`.

## 5. Form checks list: DONE
- The Progress tab shows only the 2 newest form checks, then a "View all" row.
- "View all" opens a new screen (`app/form-checks.tsx`) with the full list in the same style. Tapping a row opens that form check, the same way as before.
- Tested: `scripts/test-practice-sessions.js` passes.

## 6. All sets slide: DONE in code
- The lag came from the soft shadow on the left edge of the sliding page. A blurred shadow on a full-screen view that moves gets recomputed by iOS on every frame. It is now a fixed 16px gradient strip that looks the same and costs nothing to draw.
- The white base and video frame behind the page also stay ready while the page is parked, so nothing is built in the same frame the slide starts.
- Same 320ms native-driver slide.
- Tested: `test-slide.js`, `test-warm-surfaces.js` and `test-layering.js` pass. NEEDS YOUR PHONE: how smooth it feels.

## 7. Rank wheel / reel icons always keep their shape: DONE
- The squished Champion under "Bronze I" was in the rank reveal reel. All rank icons, in both the wheel and the reel, now go through one small component (`RankShield`). It sizes each icon from the image's real width and height, fitted inside its box, with no stretch and no animated filter. Tapping or scrolling can no longer change the shape.
- Tested: `scripts/test-round11.js` (Champion is 54x76 in the reel, its real proportions) passes.

## 8. Save Your Progress: DONE
- The drawn gym background is gone. It is now a plain dark gradient (dark grey at the top to near-black at the bottom). The real FormPal logo stays. The button says "Continue with Email".
- Tested: `scripts/test-save-progress.js` and `scripts/test-round11.js` pass.

## Checks
- Full test suite: 110 test files run. 109 pass. The one failure is `test-rep-feedback-injection.js`: it is an old test that needs a scratch file which no longer exists, and it has nothing to do with this round. (`test-body-outline.js` ends on a PASS line and is fine.)
- TypeScript: no errors in any file I changed. The errors that remain were already there in files I did not touch (drillLibrary, formcheck, calibrate, ar-experiment, onboarding, cueApi).

## For your phone (one pass)
1. Home: open and close the calendar. It should grow out of the arrow smoothly.
2. Tap the streak icon. It should open fast, with 6 upright stars, 3 on each side.
3. Train tab + calendar: a missed day has a small red icon under it.
4. Create Workout: tap muscles. They should turn dark instantly, with clean, smooth outlines. Then check the Progress map looks the same.
5. Progress: the Form checks list shows 2 rows plus "View all", which opens the full list.
6. Finish a workout, then tap All sets. The slide should be smooth.
7. Onboarding rank wheel and rank reveal: the Champion icon is never squished.
8. Save Your Progress: a dark gradient background, the logo, and "Continue with Email".

## Blocked / for you to delete
- `rm scripts/measure-preview-open.js` (an empty stub from round 11; the hook blocks rm).
- `components/onboarding/GymBackground.tsx` and `components/onboarding/SpaceBackground.tsx` are no longer used.
