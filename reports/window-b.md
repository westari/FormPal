# Window B report (2026-11-16)

Phone still runs the OLD Oct 8 native build. Everything below is JS (live on Metro) unless it says "needs the new build".

## Part 0 - why the builds failed
Runs 43758159307 and 43747908863 (commit 384038b), step 11 EAS local build. Two kinds of error:
1. **Swift syntax errors in `ExerciseEngine.swift`**: the ATTEMPT-MISSED and REP-QUALITY log lines had lost the backslashes in their `\(...)` interpolations, so the compiler read the text after the string as code. Fixed (the lines now build their text in plain variables first).
2. **`ATHLTCameraModule.swift:141 failed to produce diagnostic for expression`** inside `definition()`: the `?? NSNull()` / `?? "none"` expressions inside Expo's result builder crash the type-checker. Fixed: moved into three plain helper functions above `definition()` (`clipValue`, `clipName`, `stopResultDict`).
- Other things checked: `check-swift-strings.js` (16 Swift files clean), `check-swift-calls.js`, `check-imports.js`, and a new rule in `test-build-safety.js` that fails if `definition()` ever gets a `?? NSNull()` / `as Any?` again.
- **Is overnight-build ready to build? Yes**, as far as anything outside Apple's compiler can tell. I cannot run Xcode on Windows, so this is "every error CI showed is fixed and every static check passes", not a guarantee.

## Part 1 - camera confidence (items 2, 3): done
- Cause confirmed in the log: the old meter capped the number at 35 whenever a hint was showing, so it went 100 -> 35 -> 100 with nothing changing for the camera. Replay of the newest log, BEFORE: min 5, moves of 47 points in 1 s, 4 dips below 50 while he stood still / counted reps.
- Now: the number comes only from what the camera sees (metric samples, pose gaps, low-confidence rejections, the "trying but nothing counts" rule). Hints never set it. It is slew-limited to 6 points a second while tracking (45 a second in setup, 30 when nobody is there). Reps counting keeps it at 90+.
- AFTER on the same log: biggest move 6 points in a second, 90+ during the whole set. If it drops, the Guide names the reason within about 1.5 s.
- Tests: `test-confidence-truth.js`, `test-live-tracking.js`.

## Part 2 - Guide said untrue things (item 4): done
- "Lower your hands" and "Keep your hands in view" came from path-cut memory: the 12 s Movement Match window kept a top/bottom "cut" long after his hands were back, and a person-lost gap was read as hands-lost.
- Now every Guide line has an evidence table entry (`GUIDE_EVIDENCE` in `lib/guideCoach.ts`), shows only after its evidence has been present about 1 s, hides about 0.5 s after the evidence is gone, and cuts count only while fresh (hands 4 s, frame edge 1.5 s). Lines the old build cannot prove are removed.
- AFTER on the newest log: the Guide is silent during the set (before: "Step back further", "Keep your hands in view", "Lower your hands").

## Part 3 - Ready/Go and false checks (items 5, 6, 7)
- **5 done.** Ready/Go fired 1 s after native passed while his arms hung at his sides (metric about 20, the path starts at about 30). Go now needs native setup passed AND body steady about 1 s AND the body on the exercise path. Real-log replay: old rule Go at +1.0 s, new rule waits about 34 s, until his arms reach the path before the first rep.
- **6 done.** Reaching for the phone gave a check because a counted rep still got a check without asking Movement Match. A rep whose bottom is off the exercise path is now withheld (replay: rep #7 withheld). A counted rep does not force Movement Match up any more.
- **7 confirmed.** Replaying the newest log through the JS mirror of the Swift tracker: `onAttemptMissed` fires for his half reps. Verdicts: X "Go lower" at 44.1, 51.3, 55.3, 57.7 and 63.8 s; the missed attempts are `bottom-short` (low 59 to 69 against an enter line of 50). Real counted reps got checks at 37.0, 38.4, 46.2, 47.5, 58.9, 60.1 s. On the OLD build these X marks do not appear (no onAttemptMissed in the old binary), that comes with the new build.

## Part 4 - practice history title (item 8): done
Opening a past form check from Progress -> Form checks now says "Form check complete" (when every entry in that session has `kind: 'practice'`). A real workout keeps "Workout complete". Test in `test-done-flow.js`.

## Part 5 - new camera screen: done in code, not seen on a phone
Built to Ari's image from `lib/cameraHudLayout.ts` (one layout for workout and solo, all positions from the safe areas):
- Top-left round glass back, top-right three round glass buttons (sound, flash, flip), all 38 pt.
- Set bar: glass track, one rounded segment per set, finished and current sets bright white with a soft green glow, upcoming dim (workout only).
- Glass timer pill with stopwatch icon (workout only).
- White corner brackets, 42 pt arms, 3 pt, 20 pt radius, 31 pt from the sides.
- ONE centre glass pill: Guide line on top, under it the info icon, the % and the green bar. No "Camera confidence" label; tapping the info icon opens a short explanation that closes by itself after 9 s. The Guide is hidden while a check / X shows.
- Rep count at the bottom centre: number 92 pt bold, "/ 10" 26 pt grey. Solo: no "/ 10".
- Demo video drawer kept at the bottom. The Coach check / X is drawn in a band under the pill and above the count (it shrinks on short phones).
- Tests: `test-camera-hud-layout.js` runs six phone sizes, workout and solo (SE, 13 mini, 15, 16 Pro, 15 Pro Max, 16 Pro Max): no overlaps, inside the safe areas, check / X band at least 55% size.
- Side-by-side screenshots (my layout in Chromium next to your image): `.scratch\hud-compare.png`, six sizes: `.scratch\hud-sizes.png`.

### Differences I could not match
1. Real Liquid Glass cannot render in a browser. The screenshots use blur and a light fill; on the phone it is the system material (same as the tab bar), so it will look different from my screenshots, closer to your image.
2. Font: your image is SF Pro. My screenshot machine is Windows and has no SF Pro, so the screenshot shows a fallback font. The app itself uses the system font (SF Pro) for these pieces.
3. The flash button icon: your image shows a camera with a slash. SF Symbols has no "camera.slash", so I kept the lightning-bolt-slash for flash (the function did not change). Tell me if you want a different symbol.
4. Your image has no stop button. A stop button is needed to end the set, so I kept it, smaller (60 pt), on the rep count's row at the right edge. The count stays centred.
5. The rep count sits higher than in your image (about 28 pt) so it clears the demo drawer's peek strip, which your image does not show.
6. Floor exercises: the pill rotates with the phone like the old cue did; the set bar and brackets do not.
7. Confidence bar turns green from 75 (was 95), so it reads green while reps count, as in your image. White between 36 and 74, orange at 35 or less. These are my numbers, not from a log.

## Not verified
- None of the new screen has been seen on a real phone or with real glass. Please send one screenshot of it at the end.
- Swift changes (onAttemptMissed, clip fix, keep-awake keeper, whole-body setup) only work after the new iOS build.

## Suggestions (not done, not asked)
- A single unit test file per screen is getting long; later split `test-live-tracking.js`.
