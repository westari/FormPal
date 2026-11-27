# Window B report (2026-11-22, round 2)

Branch work-b. I merged origin/overnight-build first (clean). I did not start a build, delete anything or push to main. I did not touch any done / complete screen (only what happens when you tap Continue on the form-check one, which is rep feedback navigation).

## 1. BUILD SAFETY (Swift I changed without compiling): re-read everything, nothing found that should fail, 5 small doubts listed

**How I checked:** I diffed every native file against the last build that was known good (master@23ea174, the Oct 8 phone build). That is 6 files: `ATHLTCameraModule.swift`, `ExerciseEngine.swift`, `ExerciseDefinition.swift`, `ExerciseDefinitionParser.swift`, `ExerciseRegistry.swift`, `src/index.ts`. I read every changed line for syntax, types, optionals, names and imports, and grepped each new name for its declaration (no duplicates, nothing missing).

**An important thing I realised:** the two failed CI runs only reported syntax errors in `ExerciseEngine.swift` (the lost-backslash strings). When Swift finds syntax errors in a file it does not type-check that file, so everything else I added to `ExerciseEngine.swift` has NEVER been type-checked by a compiler. That is why I re-read all of it, not only the latest change.

**What I confirmed exists and has the right type** (each one grepped):
- `Joint.init?(string:)` (ExerciseStandards.swift), used with `.compactMap(Joint.init(string:))` in the parser.
- `parseMetric(_:)` (private static in the same extension), used for the gate metric.
- `StartPositionGate` struct (declared at the end of ExerciseDefinition.swift) and the two new `ExerciseDefinition` init arguments with defaults; `check-swift-calls.js` passes (7 calls, labels and order fine).
- `SetupStatus(allJointsVisible:holdProgress:passed:hint:)` memberwise init; `positionGuidance(pose:missing:)`, `isNearFrameEdge`, `SETUP_JOINT_MIN_CONF` (Float), `setupPhaseState` / `SetupPhaseState.pending/.holding(startTime:)` (private enum used inside the same class, `if case .holding = ...` is already used elsewhere), `enginePhase == .setup`, `lastRepTime: Date`, `repEnterTime: Date`, `repTopValue`, `repMinAngle`, `primaryUnreliableFrames` / `primaryTotalFrames` (Int), `effectiveEnterThreshold`, `effectiveROMThreshold`, `MIN_FRAMES_AFTER_POSE_GAP`, `MIN_SWING_FRACTION`, `ATTEMPT_*` statics, `onAttemptMissed` callback type `((String, Double, Double) -> Void)?`.
- `ATHLTCameraModule.swift` imports `UIKit` (needed for `UIApplication`, `UIScreen`); `AVErrorRecordingSuccessfullyFinishedKey` and `AVFoundationErrorDomain` come from `AVFoundation` (imported).
- No name declared twice (`lastFinishedClipURL`, `currentClipURL`, `awakeTimer`, `awakeTicks`, `awakeObserver`, `repGateMin`, `repEnterTime`, `personLostLogged`, and every new function).
- The pod builds in Swift 5.9 language mode (`athlt-camera.podspec`), so Swift-6 concurrency complaints (UIApplication from a timer closure) are warnings, not errors.
- The earlier CI error `failed to produce diagnostic ... definition()`: the three expressions that were the likely cause (`?? NSNull()` and `?? "none"` inside `definition()`) are now in plain helper functions, and `test-build-safety.js` fails if one comes back. I re-read the rest of `definition()`: no new complex expression.
- All checks pass: `check-swift-strings.js` (16 files), `check-swift-calls.js`, `check-imports.js`, `test-build-safety.js`.

**Things I am NOT 100% sure about** (none is a known error; these are where a compiler could still surprise us):
1. **`startAwakeKeeper`**: a multi-statement closure `let assertAwake = { [weak self] (why: String) in ... }` with no declared return type, captured by a `Timer` closure. Fine in Swift 5.9, but it is the most "clever" code I added. If the build fails here, the fix is to give the closure an explicit `-> Void`.
2. **`UIApplication.shared` in a pod**: allowed unless the pod is built "app-extension-safe only". expo-keep-awake does the same, so I expect it is fine.
3. **The long `[REP-WAIT]` log string** (three concatenated string pieces, each with several `String(format:)` inside interpolations). The old build compiled a similar `[REP] rejected` message, but if the compiler says "expression too complex", split it into local `let` texts like I did for ATTEMPT-MISSED and REP-QUALITY.
4. **`size` in the recording-finished block**: `((try? FileManager.default.attributesOfItem(...))?[.size] as? NSNumber)?.intValue ?? 0`, a long chained optional on one line. I believe the types line up (`Int`), but it is a dense line.
5. **The new `ingest` branch** (person seen, metric not measurable, send a setup update): written with the exact same names and types as the lines just below it. No doubt about the types; the only unknown is behaviour on a real phone (it should show "Back up" / "Come closer" hints for a squat with the legs cut off).

## 2. PAYWALL: found and fixed (render before / after: `reports\paywall-before-after.png`)

I rendered both screens in real Chromium with the exact script the app injects (`DC_PAGE_INJECT`) at iPhone 15, 16, 15 Pro Max and 16 Pro Max (plus SE), next to the raw design files. I did not have your screenshot, so I worked from the renders.

**What was broken (cause: one blanket "speed-up" rule):** the app injects a rule into every design page that switches off all CSS masks and backdrop blur. Three pages are DRAWN with them:
- **Paywall plan card:** its metal ring is a masked gradient. Without the mask the whole Annual card turned into a grey gradient with dark text on it (hard to read).
- **Paywall X:** the design's own round X chip stayed on screen UNDER the native X button: two X buttons.
- **Pale strips:** when the page is scaled to fit a shorter phone, a lighter strip showed down both sides (and on Pro Max, strips and a band at the bottom).
- (the trial reminder and the gift offer have the same mask / blur problem, see 3.)

**Fix:**
- Those pages (trial reminder, paywall, gift offer) now keep their masks and blur (a flag set before the page loads). Everything else still gets the speed-up.
- The design's own X chip is hidden (kept invisible so the layout does not move).
- The page colour now continues behind the design, so there are no pale strips.
- **The X is gone. It is now the standard glass back button** (`GlassBackButton`, same as the workout preview), top-left, at the same position as every other page's back button. The paywall keeps its grey "Restore" top-right. Same for the gift offer.
- The paywall list scrolling under the faded footer ("Improve Your Rank" half hidden behind the plan card) is how the design works (an inner scroll list with a fade). I tried tightening the gaps, it showed ghost rows of the next features through the card, so I put it back as the design has it.
- Test: `scripts\test-paywall-screens.js` (renders the real files at 4 sizes: the phone keeps its fade mask, the rows start below where it has faded, the card rim keeps its mask, the design X is hidden, the standard back button is used and there is no `xmark` left).

## 3. Trial reminder overlap: fixed (screen left where it is)
Cause: the same blanket rule removed the mask that fades the phone mock out at the bottom. The phone ran down under "Remind me 2 days before" and cut it ("Rem|ind"). With the mask kept, the phone fades out completely before the two rows, the notification card keeps its frosted look, and the rows no longer overlap anything. Checked at all four sizes by the test above (first row top >= where the phone has faded out).

## 4. Demo video strip covered by a white card for about 5 s: fixed (needs your eyes on the phone)
Cause: the drawer's page (`instepdrawer.html`) took a few seconds to appear on a fresh screen, and its WebView is plain white until it paints. It was also only created once setup started, and loaded with the cache off.
Fix: (a) the strip (dark card, handle, "Demo video", exercise name) is drawn natively from the very first frame; (b) the page is created the moment the screen opens (not once setup starts) and stays invisible until it has loaded, so its white loading screen never shows; (c) cache on (a changed design file is a new asset URL with a new hash, so an old copy cannot be served); (d) the file is warmed at app start with the other design pages. Dragging the drawer open, the scrim and the pause logic are unchanged.
**Proof on the phone:** the log line `[DRAWER] demo page loaded N ms after the screen opened`. The strip should be there at once whatever N is.
Test: `scripts\test-formcheck-open-and-leave.js`. I cannot run a native WebView here, so this one is source checks plus that log line, not a screenshot.

## 5. Finish -> Continue flashes: fixed (needs your eyes on the phone)
Cause: Continue on the form-check done screen fades the done screen away over what is under it. Under it were the rep feedback page, then the Workout complete card, then the tab. The rep feedback page faded out (its own 160 ms animation), the Workout complete card showed for a moment, then the stack popped: a couple of screens flashing.
Fix: Continue now hides all the post-workout pages in the same frame (no fade, new `warmHideNow`) and then pops the stack back to the tabs, so the done screen fades away straight onto the tab he started from. The routes already have no transition. A real workout's Finish review path is untouched.
**Proof on the phone:** the log lines `[LEAVE] form check Continue ...` and `[warm:...] hidden INSTANTLY`.

## Tests
New: `test-paywall-screens.js`, `test-formcheck-open-and-leave.js`. Full suite run at the end (see my final message for the result).

## Not verified
- Nothing here has been seen on a phone. The paywall and trial reminder renders are real Chromium, not a WKWebView, so fonts and the glass back button will look slightly different.
- Items 4 and 5 are native-WebView / navigation behaviour I could only check in the source.
- The Swift is still not compiled (section 1 lists my doubts).

---
# Merge with Window A's onboarding work (2026-11-22)
- Merged origin/overnight-build into work-b. One conflict, `app/onboarding.tsx`, three places, all resolved so both sides work:
  1. Imports: both `GlassBackButton` (paywall / gift offer) and `OnbBackButton` (normal onboarding screens).
  2. WebView scripts: before load = `VIEWPORT_JS`, `CUE_ORB_JS`, `KEEP_FX_JS` (for trial reminder, paywall, gift offer) and the page's own before-load script; after load = the page script plus `ONB_SCROLL_REPORT_JS`. Both `KEEP_FX_JS` and `ONB_SCROLL_REPORT_JS` are injected.
  3. Header: Window A's wrapper that scrolls with the page (`headerY`, `onb-header-scroll`) around everything. Inside it: paywall and gift offer = glass back button (no X), plus Restore on the paywall, no progress bar there; every other screen = Window A's `OnbBackButton` with the progress bar.
- Whole test suite run: the only failure was my own `test-paywall-screens.js`, which looked for the old header text. Updated it (it now also checks that the scrolling header, `ONB_SCROLL_REPORT_JS`, `KEEP_FX_JS` and `OnbBackButton` are all there). It passes. TypeScript: only the old `opaque` WebView error is left.
- Nothing else touched. Not seen on a phone.

---
# Trial reminder and paywall, round 3 (2026-11-25)
Merged origin/overnight-build first (already up to date). Kept to the trial reminder, paywall, gift offer and their files (plus `lib/trialReminder.ts`, `package.json`, `GlassBackButton`). Pictures: `reports\paywall-round3.png` (paywall at the start, 3 s in, after the scroll, and on Pro Max).

## 1. Trial reminder title: done
The title is now just "We'll remind you before / your trial ends." The line "You're ready to start training!" is hidden (the design file itself is not edited, a small injected script hides that one line). Checked at iPhone 15, 16, 15 Pro Max and 16 Pro Max.

## 2. "Remind me 2 days / 1 day before" really works: done in code, NEEDS A NEW NATIVE BUILD
- **expo-notifications was NOT in the app** (not in package.json, not in node_modules, no notification code). I installed it (`npm install expo-notifications@~0.32.17 --legacy-peer-deps --save`, the version Expo SDK 54 wants). **The notifications module is native code, so the phone will only schedule real reminders after the next iOS Dev Build.** On the current build every call is a quiet no-op with a log line (`[TRIAL-REMINDER] ... not in this build`), nothing crashes.
- What it does (`lib/trialReminder.ts`): the page reports the pick (`remindpick:2` / `remindpick:1`, default 2 like the page). Tapping Continue on that screen asks iOS for notification permission. When he taps "Start free for 7 days" on the paywall (the moment the trial starts), it cancels any earlier trial reminder and schedules ONE local notification at the same time of day: 5 days later for "2 days before" ("Your free trial ends in 2 days"), 6 days later for "1 day before" ("Your free trial ends tomorrow"), body "Keep training with your plan, or cancel anytime in Settings before it renews." If he closes the paywall without starting the trial, nothing is scheduled. If notifications are refused, nothing is scheduled.
- The choice is one or the other (the design is a pick-one list), so one notification is scheduled.
- Test: `scripts\test-trial-reminder.js` (a fake notifications module: right dates, one notification, cancels the old one, asks permission, refused, module missing, plus the page really posts the pick when tapped).
- On the phone after the new build: pick "1 day", finish onboarding, and look for `[TRIAL-REMINDER] scheduled "Your free trial ends tomorrow" for <date>` in the log. To test fast, change `TRIAL_DAYS` in `lib/trialReminder.ts` temporarily.

## 3. Paywall
- **Top cut off, plain white: fixed.** The page sat below the status bar with a white strip above it. The strip is now the page's own top colour (#f4f4f7), so the page fills to the very top (paywall and gift offer).
- **Back button: now the real standard glass.** Before it used the "light" glass, which over a light page is just a white circle. `GlassBackButton` has a new `standard` look that uses the exact recipe of the camera Finish pill (`StandardGlass`: dark real glass, same fallback colour), chevron white. A test compares it with the Finish pill's values. I cannot show real Liquid Glass in my screenshots, so look at it on the phone.
- **Cue orb: now the shared one.** The paywall's own orb is replaced by the same orb drawing everything else uses (`cueOrbSvg` from `lib/cueOrb.ts`, with its glossy highlight and halo), kept in place if the page redraws.
- **The list: fixed.** It now starts at "as well as" with the rows after it hidden. About 5 seconds after the paywall appears (the app starts the clock when the paywall page becomes visible, not when it loads hidden in the background) the rest fades in and the list scrolls down smoothly (1.7 s, eased). A touch on the list cancels the wait and shows everything. Checked at the four sizes: at 3.5 s nothing has moved, then it scrolls in many small steps to the end.

## Tests
New: `test-trial-reminder.js` and `scripts/lib/paywall-harness.js` (pulls the app's real injected scripts out of onboarding.tsx so tests run the exact code). Full suite result in my final message.

## Not verified / honest limits
- No phone test. Real Liquid Glass and the real notification need the phone and the new build.
- The Swift side is unchanged this round, but the next iOS build now includes expo-notifications, so it is a bigger native change than the last one.
- Full suite: everything passes except `test-tab-headers.js` ("Home title is the live date": it expects a long date like "Thursday, November 12" and the Home header now shows "Wed, Nov 25"). That is Window A's Home header, not touched by me, so I left it for Window A.

---
# Round 10 (2026-11-25, evening): half reps, Guide vs number, form-check exit, onboarding, paywall
Merged origin/overnight-build first (clean). Pictures: `reports\paywall-round10.png`.

## 1. HALF REPS: no cross on the "new" build. Found: the log was written by the OLD native binary.
The attached log (`scripts\fixtures\shoulder-press-2026-11-25.log.txt`) has **no `[ATTEMPT-MISSED]` line, no `[REP-QUALITY]` line and no `[AWAKE] native` line**. Those three are printed only by the NEW native camera. It also says `expo-brightness is NOT in this build` and `expo-notifications is not in this build`. Both modules are in the Nov 16, Nov 22 and Nov 25 iOS builds (I checked the commits of the GitHub runs), so the binary on the phone is older than all of them. And the test session ran 19:21 to 19:27 UTC while the newest iOS Dev Build (run 45681813423) only finished at 19:26:48 UTC: it could not have been installed yet.
- **The JS is new, the native camera on the phone is still the old one.** So no cross could ever show. There is no half-rep bug in the new build to fix from this log.
- **Proof the cross works the moment the new native sends its event:** I replayed this very log through the mirror of the new native tracker: the 6 full reps get their checks and the half reps get crosses "Go lower" (5 of them in this window, none withheld). Test: `scripts\test-half-reps-newbuild.js`.
- **So nobody has to guess again:** the camera screen now prints, 8 seconds after it opens, `[BUILD] native camera: NEW build (...)` or `[BUILD] native camera: OLD build (no native [AWAKE] line arrived ...)`. After you install the new build, look for `NEW` in the log. If it says OLD, the install did not take.
- To install: GitHub Actions "iOS Dev Build" run 45681813423 (success) is the one to install.

## 2. The Guide and the number agree: done
In the log the Guide said "Step back further" (the camera's cue) while the number stayed 99-100. Now whenever the Guide shows a camera-problem line the number is capped at 55 and follows the line down at 12 points a second (a few seconds, never a cliff), and comes back slowly (6 a second) once the line is gone. A log line says it: `[CONFIDENCE] the Guide says "..." so the number is capped at 55`. The person-seen floor (25) still holds. Replay test in `test-half-reps-newbuild.js`; the old "never more than 6 points a second" tests now allow 12 while such a line is up.

## 3. Form check Done -> Continue flashing: fixed further
Last round I hid the warm pages at once. What still flashed was the recap screen's own native video (the "workout complete video screen"), which sits behind the page. Continue now also hides and pauses that video in the same frame (`repFeedbackSignal.onLeaveNow`) before the stack is popped. Proof on the phone: `[LEAVE] form check Continue ...` and `[warm:...] hidden INSTANTLY`. Test: `test-formcheck-open-and-leave.js`.

## 4. Onboarding
- **Back button = real glass, chevron nudged left:** the in-page imitation (a web page cannot draw Liquid Glass) is gone. The back button is the native standard glass (the camera Finish pill's recipe) on every onboarding page, and the chevron is moved 1.5 pt left in the shared back button.
- **No back button and no bar from "building your plan" onward:** generatePlan, planReady, trialTimeline, Save your progress and Try for free have neither. (Save your progress keeps one back button only inside its e-mail form, to get back to the sign-in choices; the paywall and gift offer keep theirs because it is how you leave them.)
- **Progress bar not glitchy any more:** it is flat and part of the page (it scrolls with it on the page's own frame, nothing tracks it). The back button does not track the scroll either: it fades away once the page has scrolled a little (it does not need to stay).
- **Try for free:** its header is gone, so the "moved down a lot" problem is gone with it.
- **Plan ready, Target card:** the arrow is now ALWAYS in the middle of the card. The whole card moves so the arrow points at the end of the line (it may reach past the chart card, only the screen edge stops it; on a very narrow screen the card gets a little smaller instead of the arrow sliding). Checked at 360, 390 and 430 wide for five goals.
- **"Your info" for a skipped onboarding:** skipped answers are blank (weight, height, age, experience and the goal row); the design's sample values (184 lb, 5'11", 27, Beginner, 195 lb) no longer leak through. The pencil on a blank row still opens the edit. Tested with nothing, some and all answers. Note (not changed, not asked): the big title above ("Your goal is to gain 0 lbs by Dec 2") still uses made-up defaults when nothing is answered.
- Tests: `test-onboarding-round10.js` (new), `test-onboarding-header.js` and `test-goal-target-marker.js` rewritten for the new behaviour.

## 5. Paywall
- **Back button hard to see:** it now sits inside a clear glass bubble (54 pt, real Liquid Glass "clear" with a soft shadow) around the standard glass button. Real glass cannot be shown in my screenshots: look at it on the phone.
- **Cue orb STILL old: found why.** The page runs a pass that freezes every short looping animation (to save battery); it froze the paywall's orb, so it sat still and looked like the old orb while the Home orb breathes and glows. The orb is now exempt, and the same orb rules the Home tab uses are re-applied after the page loads (my last round's static drawing is gone). The test checks the orb's animations are RUNNING (breathing, glow, morph) at four phone sizes; the picture strip shows the orb at three moments.
- **Auto-scroll too fast:** now 6 seconds, eased start and end, never faster than about 80 px a second (it was 1.7 s). A touch on the list cancels it and shows everything.
- **"Improve your rank" pokes out:** the rows after "as well as" are now hidden from the very first paint (a style set before the page loads, instead of waiting for the page's own script to find them), and fade in when the scroll starts.
- **Restore moves when you scroll:** the header no longer follows the page at all, so Restore (and the back button) stay exactly where they are.
- Checked at iPhone 15, 16, 15 Pro Max and 16 Pro Max: `test-trial-reminder.js` and `test-paywall-screens.js`.

## Not verified
- Nothing has been seen on a phone: real Liquid Glass (back buttons, the bubble), the form-check exit flash and the new build's crosses need your phone. The first thing to look for in the next log is the `[BUILD] native camera:` line.
- Full suite: everything passes except `test-tab-headers.js` (it expects a long Home date like "Thursday, November 12"; Home now shows "Wed, Nov 25": Window A's header, untouched by me). I updated three checks in Window A's `test-onboarding-r8.js` that pinned the old scrolling header and the old back button.


---
# Round 11 (2026-11-25, night): rep timing, missed reps, set bars, form check exit, app start, plan ready, paywall
Merged origin/overnight-build first (clean).

## IMPORTANT: the attached latest.log has NO camera session
It is a fresh Metro session (20:17 UTC) with only app start and the onboarding / trial reminder screens. No `[REP]`, `[ATTEMPT]`, `[COACH]`, `[ATTEMPT-MISSED]` or `[LEAVE]` lines. So I could NOT measure the real new-build delays or find the three silent reps in it (each Metro restart replaces the file). What I did instead: found the real causes in the code, proved them by replaying the three newest real camera logs we do have, fixed them, and added log lines that give the exact numbers next time. Send me the log of the camera session (before restarting Metro) and I will tune with real numbers.

## 1. Rep timing (check late, cross early)
- **Why the cross is early:** the engine reports a half rep the moment the stroke TURNS at its shallow bottom (`finishAttempt`: the arms have only started back up). A counted rep is reported only when the arms are back (exit line held for 3 frames, plus the start-position gate). So the cross always lands before the check would have.
- **Fix (JS, works at once through Metro, no build):** the cross is now HELD until the metric is back in the start zone (the top 40% of the way from the exit line to the start value: 73.6 for shoulder press), at most 1.1 s, then shown. A second event or a counted rep flushes a held cross, so nothing is lost (`lib/verdictTiming.ts`). In the replays the hold is only 0.1 to 0.2 s because the log has the metric just 3 times a second; on the phone it is measured properly.
- **Checks:** I cannot see from the code why they are later than before, and without a log I will not guess a number. Likely suspect: the new start-position gate (a counted rep waits until the elbows are back below the shoulders). I did not change it. Every verdict now logs `[TIMING] ...`, for example `[TIMING] cross shown N ms after the engine event, when the arms are back at the start position (metric X)`, so the next log gives the real delays.

## 2. Missed reps (major): found 4 ways a real attempt got NOTHING, all fixed
1. The Coach dropped a half-rep cross if it came within **1.2 s** of the verdict before it. Reps about 1.2 s apart = several silent reps in a row. Now 0.35 s (it only stops one stroke being judged twice).
2. A **counted** rep got no check while the camera's raw "step back" hint was up, even when the Guide itself ignored that hint (the metric kept flowing). That is "3 reps, no check, no cross, number unchanged". Now a counted rep always gets its check unless nobody is in the picture.
3. The engine **rejects** some reps (movement guard, gate, unreliable tracking) with no event at all. Now every stroke the screen's attempt detector sees end as missed or rejected, with no verdict from the engine within 1.3 s, gets its cross from the screen (reason from the detector: "Go lower" / "Go higher" / "Full movement"). Never silence (`lib/noSilentReps.ts`).
4. An unknown missed reason was also dropped silently: now it is a cross "Full movement".
- **If the camera truly cannot judge it** (the engine rejected a rep for unreliable tracking, or the rep path is cut): no cross, the number is capped at 45 at once (even while reps count) and the Guide says why ("Keep your whole body in view" / "Find more light" ...). Log: `[CAMERA] the engine rejected a rep: tracking unreliable ...`.
- **Proof by replay** (`scripts\test-verdict-flow.js`, three real logs): BEFORE, strokes with no verdict: Nov 25: 5 of 11 (2 in a row); Nov 16b: 5 of 19 (2 in a row); Nov 16: 2 of 13. AFTER: 0 in all three.
- A silent stroke logs `[SILENT] stroke #N ended with no verdict ... the screen gives it its cross`.

## 3. Set bars: pure white
The "hint of green / yellow" was the glass tinting the white fill (the fill was a child of the real glass pill, and real glass is tinted by the camera picture behind it). The fills are now plain views on TOP of the glass: pure #FFFFFF for done and current sets, the same white at 30% for upcoming sets. No colour is left in those styles (a test checks).

## 4. Form check Done: fixed for good (needs your eyes)
Cause: the exit (hide the pages, pop the stack) ran on Continue, while the done screen was already fading, so for a few frames the dark recap screen showed through. Now the exit runs BEHIND the done screen: about 1.3 s after it starts it fully covers everything (a new optional `onCovered` of the done screen) and the stack is popped then. Continue only fades the done screen away over the tab he started from. If Continue were tapped first, it does the exit itself.
- **Log lines to look for:** `[DONE] covering the screen under it: the caller may leave behind it now`, then `[LEAVE] form check exit behind the done screen: ...`, then `[warm:...] hidden INSTANTLY`. I could not check them: the attached log has none (no camera session).

## 5. App start: white screen for about 5 s
From the log: fonts ready 0.46 s after the app code started and the splash was hidden at once, but the tab pages (web views) were ready only at 5.7 s (Train) and 6.6 s (Profile). In between the screen showed empty white pages. Nothing is blocking the JS thread: the web views simply take that long to load and draw. Fix: the app's own splash (cream, not white) now stays until all four tab pages are drawn, with an 8 s backstop. `[LAUNCH] splash hidden N ms after ...` says when and why. Test: `test-app-start.js`. (The real fix for the slow pages themselves is a bigger job: say if you want it.)

## 6. Plan ready, Target card
- No target (he skipped the goal): the card shows a dash "–", not an empty box.
- The arrow now hovers just above the dot (its tip is 4 units above the dot's outer edge) instead of touching it; the card stays centred on the arrow.

## 7. Paywall
- **Back button real glass: found the real cause.** Real glass cannot be drawn inside a view whose opacity is animated, and the back button sat inside the page's fading container AND inside its own fade-in. The system drew a flat disc. The header is now a sibling of the fading page with no animated opacity anywhere around it (the normal onboarding back button too), and it is ONE standard glass button (the Finish pill's glass), no glass nested in glass. A soft shadow outside the glass makes it visible on the light page.
- **Auto-scroll not happening: made much more robust and visible.** The app asks the page 3 times after the paywall appears (the page ignores a repeat), the page finds its list itself if it was not ready, and it steps with a plain timer (requestAnimationFrame can be paused while a page is hidden in the pool). The page reports what it does. Look for `[PAYWALL] the paywall appeared ...` and `[PAYWALL] auto-scroll: asked: the list was found (scrolls N px), waiting 5 s` / `scrolling N px over 6 s` / `done`. If it still does not scroll, that log says why.
- **White at the bottom and sides when scrolling the whole screen: fixed.** The paywall and the gift offer no longer rubber-band (nothing to bounce: it is one full screen with its own inner list), and the page colour also lives on an oversized fixed backdrop plus `overscroll-behavior:none`, so anything drawn beyond the page is the page colour.
- Tests: `test-paywall-screens.js`, `test-trial-reminder.js` (iPhone 15, 16, 15 Pro Max, 16 Pro Max).

## Tests
New: `test-verdict-flow.js`, `test-app-start.js`. Updated for the new behaviour: `test-one-judge.js` (verdicts may now come 0.3 s apart, and from the screen's fallback cross), `test-movement-match.js`, `test-camera-hud-layout.js`, `test-paywall-screens.js`, `test-trial-reminder.js`, `test-onboarding-*`, `test-save-progress.js` (Save your progress has no back button / bar any more), `test-done-screen.js`, `test-formcheck-open-and-leave.js`, `test-goal-target-marker.js`.

## Not verified
- Nothing seen on a phone. Real glass, the exit flash, the splash and the paywall scroll need your phone. The first thing to send me is the camera-session log (the new `[TIMING]`, `[SILENT]`, `[CAMERA]`, `[LEAVE]`, `[PAYWALL]` lines).

---
# Round 12 (2026-11-27): one rep = one result, stop judging when walking to the phone, Guide words, black back arrow, smooth paywall scroll, plan ready dashes
Merged origin/overnight-build first (clean). The attached latest.log HAS a real camera session from the new native build this time (19:09:02 to 19:10:19, shoulder press), saved as `scripts/fixtures/shoulder-press-2026-11-27.log.txt`. Every camera fix below is proven by replaying it (`scripts/test-one-result.js`, BEFORE = round 11 code, AFTER = now).

## 1. Camera: what the log showed and what changed
The engine sent 16 "half rep" events. 9 were real half reps (the arms went down to 52-69). 7 were NOT reps: the arms only went down to 74.6-77.7, right after a check or cross, while settling back at the top (the engine ends a "stroke" after a turn of only about 4 degrees). The start position zone for shoulder press begins at 73.6, so the two groups are cleanly apart.

a) **Two "Go lower" for one half rep.** Two causes:
   - one of those small settling wobbles right after the cross fired a second cross (19:09:10.9, 13.3, 19.1, 35.2, 41.5, 46.9, 10:00.6);
   - the screen's own fallback ("no result came for this stroke") checked the wrong time: the stroke detector reports a stroke up to 2.5 s late, after the engine's cross was already shown, so it gave the same stroke a second cross (19:09:23.9, 19:10:02.7).
   Fix: a stroke must LEAVE the start position to be judged at all (engine events and the screen's own strokes). The fallback now checks whether anything was shown after the stroke's own low point, not after the late report. BEFORE: 7 strokes with two results. AFTER: 0.
b) **A half rep got nothing.** At 19:09:29.4 a real half rep (down to 55.7) came after a 5 s rest; Movement Match was low only because of the rest (no rhythm yet) and the Coach withheld it. Now a real half rep that went at least halfway down and came back up is shown even then (a resting wobble at the top still is not). BEFORE: 1 real half rep with no cross. AFTER: 0. Two quick dips at 19:09:38.9 and 40.5 got no engine event at all; the screen's fallback gives one of them its cross. I added a native log line `[ATTEMPT-DROPPED]` so the next log shows if the engine drops quick half reps for being too short (needs the next native build; it only adds a log line).
c) **Barely moving while a check / cross is showing fired feedback.** Same cause as the first part of a): those were the settling wobbles. They get nothing now and change nothing; the next real rep is judged normally (checked: every real half rep after a wobble still got its cross). Also, a held cross used the last metric reading from BEFORE the half rep (from the way down) and could show at the bottom of the rep; it now waits for a reading taken after the turn.
d) **Walking to the phone kept firing results** (19:10:06.7 "Full movement", 09.2 check, 12.3 and 14.9 "Go higher"). When he walks up, the camera loses his pose again and again (3 times in 2.8 s here, then loses him). One lost pose alone happens mid-set too (seen in 3 older logs) and is ignored. Rule: the pose lost twice within 3 s, or nobody in the picture = out of position: nothing is judged (a rep still counts, it just gets no check or cross), until he is clearly seen again for 1 s. A stroke whose pose was lost after its low also gets no guessed cross. BEFORE: 4 results while walking. AFTER: 0. It never stopped judging during the set.
- Result on this log: BEFORE 29 results, AFTER 17: all 7 counted reps get their check, all 9 real half reps get exactly one cross, nothing else.
- New log lines: `[ONE-RESULT] ...` (ignored wobble, stopped judging / judging again, no check or cross because out of position).
- Placeholders (from this log and the older ones, say if you want them tuned): start zone 73.6 (existing), "halfway down" 61.8, 2 pose losses in 3 s, 1 s clearly seen to come back.

## 2. Guide wording
- "Step into view" while setting up (Vision finds no body, he is at the phone, too close) now says **"Move back"**. The "too close" line during a set ("Back up") is also "Move back" now, one wording.
- "Turn sideways to the phone" is now **"Turn your side to the camera"**.
- **One line in the pill:** the pill was 240 pt wide, so its text room was only 174 pt and every 5-6 word line wrapped. It is now 316 pt (313 on the smallest iPhones) and the line is set to one line; it may shrink a little (never below 80%) only if a phone draws the text bigger than measured. Measured: the longest line, "Keep your whole body in view", fits on all six iPhone sizes (`test-guide-pill-one-line.js`).

## 3. Back button (onboarding and paywall)
Same real Liquid Glass, the arrow is now **black**. Where iOS has no glass, the flat fallback is a light disc so the black arrow still shows. (The workout / goal / muscle map back buttons are unchanged.)

## 4. Paywall auto-scroll: smooth
Cause of the choppiness: the old code moved the list in whole pixels from a timer that does not line up with the screen's frames, so in the slow start and end it stood still for a frame and then jumped (measured in Chromium: 43 frames standing still, up to 12.7 px off the curve). Now the rows glide with ONE eased CSS transition that the WebView runs on its own at the screen's frame rate (60 or 120), with sub-pixel steps; at the end the real scroll position is set to the same spot. Measured: every frame moves, 0 stalls, within 2.5 px of the eased curve, about 6 s, still waits 5 s first, a touch stops it exactly where it is (`test-paywall-smooth.js`).

## 5. Plan ready
- The "–" in the Target card is centred (it sat at the left of a 56 px box): now within 1 px of the card's centre.
- "Your info" rows with no answer show "–". Tapping the pencil still edits it; typing a value replaces the dash; leaving it empty keeps the dash.
- No goal weight: the title says "Your goal is to gain – lbs" (or "lose – lbs") instead of a made-up "0 lbs by Dec 4". With real numbers it is unchanged.

## Tests
New: `test-one-result.js` (the real 2026-11-27 log, BEFORE / AFTER for a, b, c, d), `test-paywall-smooth.js`, `test-guide-pill-one-line.js`. Updated for the new behaviour: `test-verdict-flow.js` (a stroke's result may come from its low point; the old window counted a duplicate cross as the answer), `test-half-reps-newbuild.js` (one of its 5 crosses was a settling wobble: 4 real ones remain), `test-movement-match.js` (reps counted while out of position are not judged on purpose; the pill line is one line), `test-confidence-truth.js`, `test-guide-coach-1113.js` (prints details), `test-setup-guide.js` ("Move back"), `test-onboarding-round10.js` (dashes, centred dash, title), `test-trial-reminder.js` (black arrow; the scroll is measured as what he sees), `test-workout-camera-start.js` ("Move back"). Full suite: 113 of 113 pass.

## Needs your phone
Everything in 1, 2 and 5 works through Metro (no build). The black arrow and the smooth scroll also work through Metro. Only the new `[ATTEMPT-DROPPED]` log line needs the next native build.


---
# Round 13 (2026-11-27, evening): cue direction audit, rep timing, small Guide pill, setup "Move back", onboarding lag, fixed back button, Save your progress, paywall, kept logs
Merged origin/overnight-build first (clean). The new latest.log (a shoulder press set, 20:22-20:23) is saved as `scripts/fixtures/shoulder-press-2026-11-27b.log.txt`.

## 1. Feedback audit: which way is "full range" (the big one)
**The bug:** the engine reports a half rep in terms of its own number (the "metric"), not the body: "the number never got down to the rep line" or "it never got back up to the start". For EVERY exercise the number falls while the rep is done, but for a squat that means going DOWN and for a shoulder press it means pressing UP (the upper arm's angle from straight up gets smaller). The app turned "number never got down" into "Go lower" for every exercise. That is backwards for 29 of the 56 exercises: all overhead presses, curls, rows, raises, pull-ups, crunch, the tricep extensions, the jumping jack. On your log every one of the 9 half presses said "Go lower".

**The fix:** the words now come from each exercise itself:
- a half rep short at the work end uses the exercise's own "not enough range" words (the same words the engine already puts on a counted rep that was too short: PRESS HIGHER, GO DEEPER, CURL HIGHER ...), so a short counted rep and a half rep always say the same thing;
- a rep that did not get back to the start uses a "back to start" word per exercise (new, e.g. "Lower to shoulders" for presses, "Stand tall" for squats);
- the same words are used by the screen's own backup cross and by the "why is it not counting" line (a bench press used to get "Go higher" there just because its name has "press" in it).

Other wrong meanings found and fixed:
- a seated chest press said "Go lower" on a short rep (now "Elbows further back"), and its "press all the way up" became "Go higher" (now "Lock arms out", right for bench and chest press);
- a step-up said "Go lower" (now "Bend knee more");
- a seated leg curl said "Curl higher" (now "Curl further");
- "Keep knees bent" (crunch) had become "Soften your knees", which means something else (now "Keep knees bent");
- "Stay upright" had become "Stand tall" on seated exercises (machine press, lat pulldown): now "Stay upright".

**Test:** `test-cue-direction.js` has its OWN list of which way each exercise is worked (written from how the exercise is done, not from the app's code) and fails if any short-rep, back-to-start or form-fault word points the wrong way, if any exercise is missing, or if a word is longer than 3 words. Before: wrong for 29 exercises. After: 0. Replaying your log: before 9 x "Go lower", after 9 x "Go higher".

The full table ("reps only" exercises show no check or cross, but have their words ready):

| Exercise | Full range (work end) | Half rep, short at the work end | Did not get back to the start | Other form faults (engine cue -> screen) | BEFORE (every exercise) |
|---|---|---|---|---|---|
| squat | down | Go lower | Stand tall | CHEST UP -> "Lift your chest" | Go lower / Go higher |
| pushup | down | Go lower | Lock arms out | HIPS DOWN -> "Hips lower"; HIPS UP -> "Hips higher" | Go lower / Go higher |
| lunge | down | Go lower | Stand tall | CHEST UP -> "Lift your chest" | Go lower / Go higher |
| shoulderPress | up | Go higher | Lower to shoulders | STAY UPRIGHT -> "Stay upright"; ARMS STRAIGHT UP -> "Arms straight up" | Go lower / Go higher |
| jumpingJack | up | Go higher | Arms down fully | JUMP WIDER -> "Jump wider" | Go lower / Go higher |
| curl | up | Curl higher | Straighten arms | FULL EXTENSION -> "Straighten arms"; KEEP ELBOW STILL -> "Keep elbow still"; STOP SWINGING -> "Too much swing" | Go lower / Go higher |
| hammerCurl | up | Curl higher | Straighten arms | FULL EXTENSION -> "Straighten arms"; KEEP ELBOW STILL -> "Keep elbow still"; STOP SWINGING -> "Too much swing" | Go lower / Go higher |
| concentrationCurl | up | Curl higher | Straighten arms | FULL EXTENSION -> "Straighten arms"; KEEP ELBOW STILL -> "Keep elbow still"; STOP SWINGING -> "Too much swing" | Go lower / Go higher |
| preacherCurl | up | Curl higher | Straighten arms | FULL EXTENSION -> "Straighten arms"; KEEP ELBOW STILL -> "Keep elbow still"; STOP SWINGING -> "Too much swing" | Go lower / Go higher |
| reverseCurl | up | Curl higher | Straighten arms | FULL EXTENSION -> "Straighten arms"; KEEP ELBOW STILL -> "Keep elbow still"; STOP SWINGING -> "Too much swing" | Go lower / Go higher |
| cableCurl | up | Curl higher | Straighten arms | FULL EXTENSION -> "Straighten arms"; KEEP ELBOW STILL -> "Keep elbow still"; STOP SWINGING -> "Too much swing" | Go lower / Go higher |
| gobletSquat | down | Go lower | Stand tall | CHEST UP -> "Lift your chest" | Go lower / Go higher |
| airSquat | down | Go lower | Stand tall | CHEST UP -> "Lift your chest" | Go lower / Go higher |
| frontSquat | down | Go lower | Stand tall | CHEST UP -> "Lift your chest" | Go lower / Go higher |
| backSquat | down | Go lower | Stand tall | CHEST UP -> "Lift your chest" | Go lower / Go higher |
| sumoSquat | down | Go lower | Stand tall | CHEST UP -> "Lift your chest" | Go lower / Go higher |
| kneePushup | down | Go lower | Lock arms out | HIPS DOWN -> "Hips lower"; HIPS UP -> "Hips higher" | Go lower / Go higher |
| inclinePushup | down | Go lower | Lock arms out | HIPS DOWN -> "Hips lower"; HIPS UP -> "Hips higher" | Go lower / Go higher |
| widePushup | down | Go lower | Lock arms out | HIPS DOWN -> "Hips lower"; HIPS UP -> "Hips higher" | Go lower / Go higher |
| diamondPushup | down | Go lower | Lock arms out | HIPS DOWN -> "Hips lower"; HIPS UP -> "Hips higher" | Go lower / Go higher |
| declinePushup | down | Go lower | Lock arms out | HIPS DOWN -> "Hips lower"; HIPS UP -> "Hips higher" | Go lower / Go higher |
| closegripPushup | down | Go lower | Lock arms out | HIPS DOWN -> "Hips lower"; HIPS UP -> "Hips higher" | Go lower / Go higher |
| overheadPress | up | Go higher | Lower to shoulders | STAY UPRIGHT -> "Stay upright"; ARMS STRAIGHT UP -> "Arms straight up" | Go lower / Go higher |
| arnoldPress | up | Go higher | Lower to shoulders | STAY UPRIGHT -> "Stay upright"; ARMS STRAIGHT UP -> "Arms straight up" | Go lower / Go higher |
| dumbbellShoulderPress | up | Go higher | Lower to shoulders | STAY UPRIGHT -> "Stay upright"; ARMS STRAIGHT UP -> "Arms straight up" | Go lower / Go higher |
| machineShoulderPress | up | Go higher | Lower to shoulders | STAY UPRIGHT -> "Stay upright"; ARMS STRAIGHT UP -> "Arms straight up" | Go lower / Go higher |
| chestPress | neither | Elbows further back | Lock arms out | PRESS ALL THE WAY UP -> "Lock arms out" | Go lower / Go higher |
| barbellBenchPress | down | Go lower | Lock arms out | PRESS ALL THE WAY UP -> "Lock arms out" | Go lower / Go higher |
| splitSquat | down | Go lower | Stand tall | CHEST UP -> "Lift your chest" | Go lower / Go higher |
| reverseLunge | down | Go lower | Stand tall | CHEST UP -> "Lift your chest" | Go lower / Go higher |
| stepUp | down | Bend knee more | Stand tall | CHEST UP -> "Lift your chest" | Go lower / Go higher |
| bulgarianSplitSquat | down | Go lower | Stand tall | CHEST UP -> "Lift your chest" | Go lower / Go higher |
| tricepPushdown | down | Straighten arms | Bend elbows more | KEEP ELBOWS IN -> "Tuck elbows in"; STAY UPRIGHT -> "Stay upright" | Go lower / Go higher |
| overheadTricepExtension | up | Straighten arms | Bend elbows more | KEEP ELBOWS IN -> "Tuck elbows in"; STAY UPRIGHT -> "Stay upright" | Go lower / Go higher |
| skullcrusher | up | Straighten arms | Bend elbows more | KEEP ELBOWS IN -> "Tuck elbows in" | Go lower / Go higher |
| bentOverRow | up | Pull higher | Straighten arms | STOP SWINGING -> "Too much swing" | Go lower / Go higher |
| barbellRow | up | Pull higher | Straighten arms | STOP SWINGING -> "Too much swing" | Go lower / Go higher |
| singleArmRow | up | Pull higher | Straighten arms | STOP SWINGING -> "Too much swing" | Go lower / Go higher |
| invertedRow | up | Pull higher | Straighten arms | STOP SWINGING -> "Too much swing" | Go lower / Go higher |
| tBarRow | up | Pull higher | Straighten arms | STOP SWINGING -> "Too much swing" | Go lower / Go higher |
| seatedCableRow (reps only) | neither | Pull to stomach | Straighten arms | SIT UP TALL -> "Sit up tall"; DRIVE ELBOWS BACK -> "Elbows back" | Go lower / Go higher |
| machineRow (reps only) | neither | Pull to stomach | Straighten arms | SIT UP TALL -> "Sit up tall"; DRIVE ELBOWS BACK -> "Elbows back" | Go lower / Go higher |
| romanianDeadlift | down | Go lower | Stand tall | STRAIGHTEN YOUR BACK -> "Straighten your back" | Go lower / Go higher |
| deadlift | down | Go lower | Stand tall | STRAIGHTEN YOUR BACK -> "Straighten your back" | Go lower / Go higher |
| goodMorning | down | Go lower | Stand tall | STRAIGHTEN YOUR BACK -> "Straighten your back" | Go lower / Go higher |
| kettlebellSwing | down | Go lower | Stand tall | STRAIGHTEN YOUR BACK -> "Straighten your back" | Go lower / Go higher |
| singleLegRDL | down | Go lower | Stand tall | STRAIGHTEN YOUR BACK -> "Straighten your back" | Go lower / Go higher |
| cablePullThrough (reps only) | down | Go lower | Stand tall | STRAIGHTEN YOUR BACK -> "Straighten your back" | Go lower / Go higher |
| lateralRaise | up | Lift higher | Lower arms fully | CONTROL IT, NO SWINGING -> "Too much swing"; RAISE OUT TO THE SIDES -> "Arms out wide" | Go lower / Go higher |
| frontRaise | up | Lift higher | Lower arms fully | CONTROL IT, NO SWINGING -> "Too much swing" | Go lower / Go higher |
| latPulldown (reps only) | down | Pull lower | Arms up fully | STAY UPRIGHT, NO SWINGING -> "Stay upright"; ELBOWS DOWN AND BACK, NOT OUT -> "Elbows back" | Go lower / Go higher |
| facePull (reps only) | neither | Pull further | Straighten arms | (none) | Go lower / Go higher |
| pullup | up | Pull higher | Straighten arms | STOP SWINGING -> "Too much swing" | Go lower / Go higher |
| legCurl (reps only) | neither | Curl further | Straighten legs | (none) | Go lower / Go higher |
| crunch | up | Full movement | Lie back down | KEEP KNEES BENT -> "Keep knees bent"; DON'T SWING ARMS -> "Don't swing arms" | Go lower / Go higher |
| dips | down | Go lower | Lock arms out | LOCK OUT AT TOP -> "Straighten arms" | Go lower / Go higher |

## 2. Rep timing
From the [TIMING] lines: the cross came 125-551 ms after the half rep turned (average 350). Cause: the app only gets the arm number about 2.5 times a second, and the held cross waited for a reading that showed the arms back, checked on a 0.2 s tick. Your arms were actually back about 0.2-0.3 s after the turn. Now the cross is checked the instant a reading arrives and lands 250 ms after the turn, unless a reading says the arms are still down at the bottom. Replay of both 11-27 logs: average 310 -> 241 ms and 288 -> 213 ms, worst 445 -> 297 and 552 -> 304 (the replay ticks every 50 ms; on the phone it is a timer, so 250 ms). The one at 304 ms is a half rep right after a rest: while Movement Match is still low, it waits for a reading that proves the arms came back up (so a resting wobble never gets a cross).

The check: the engine counts a press about 0.3 s after the arms are back (a start-position check, then 3 "confirm" frames at about 10 frames a second). For the five shoulder presses it now needs 2 confirm frames (the start-position check is what stops a rep counting mid-way), so the check lands about 0.1 s sooner. It is part of the exercise definition the app sends, so it works through Metro, but only the next log can prove it. Watch for a press counted twice ([REP] # lines closer than 0.8 s): if that happens, tell me and it goes back to 3. Test: `test-rep-timing.js`.

## 3. Guide pill
Back to the small pill (240 pt, as before). Every Guide line is now 3 words or fewer: "Turn sideways", "Hands in view" (was "Keep your hands in view"), "Body in view" (was "Keep your whole body in view"), "Move phone back" (was "Move your phone back"); the rest were already short ("Move back", "Step back further", "Hold still", "Find more light", "Face the phone", "Step into view", "Start your reps"). All fit on one line in the small pill (`test-guide-pill-one-line.js`).

## 4. Setup: "Move back" right away
From the log: from 20:22:26.7 Vision saw you, but the camera's own setup said "whole body not in view: missing wrists, hips" (too close) for seconds. The setup Guide only looked at whether the arm number was flowing, so it said "Hold still" (4.6 s of it in a replay of your log), and every line change also waited about 1.5 s to stay calm. Now: when Vision sees you but the camera's setup says joints are not in view, the line is "Move back", shown at once (no calm delay); never "Hold still" then. Replay: "Hold still" while too close 4.6 s -> 0 s, "Move back" within one 0.2 s tick (`test-setup-too-close.js`).

## 5. Onboarding lag (measured)
Measured in Chromium with the CPU slowed 6x like a phone (`test-onboarding-smooth.js`):
- The scripts the app injects into "building your plan" and the plan page (fit, polish, the header, scroll reporting, the Cue orb rule) cost nothing measurable: the page with none of them and with all of them use the same time (1681 vs 1741 ms busy per 6 s on "building your plan", 810 vs 827 on the plan page). So they are not what got slower.
- What DID change: while "building your plan" animated, the app also loaded the plan page, the trial reminder AND the paywall at the same time, and the hidden pages kept animating behind the goal graph. The paywall got heavier on Nov 22-25 (its blur effects and masks kept on, the breathing orb unfrozen). Measured: a hidden paywall keeps the CPU busy about 1765 ms every 6 s (5 animations running) while you look at the goal graph; paused, 4 ms.
- Fixes: (1) only the plan page loads during "building your plan"; the trial reminder and the paywall load once the goal graph has finished drawing (4.5 s) or as soon as you leave the plan page (Save your progress and Try for free come before them, so they are ready long before they are needed). (2) A loaded page that is not on screen pauses all its animations and resumes when it comes on screen. (3) The pages no longer report every scrolled frame to the app (that was only for the fading back button, now gone).
- Rank wheel (native, cannot be measured on the computer): two changes on Nov 27 made it heavier. Every shield got a shadow that follows the picture's shape, which the phone re-computes every frame while the wheel scales and fades the shields, and the wheel moved the shields from the JS thread on every frame. Now the shadow is drawn once and kept as a picture, and the shields' motion runs on the UI thread. Only your phone can show this one.

## 6. Onboarding back button
It stays fixed in place now: no fading, no moving when the page scrolls. The in-page progress bar is fixed too, so both stay put.

## 7. Save your progress
Added the title "Save your progress" at the top, and "FormPal" right next to the logo (the logo and the word are centred together). Nothing else changed. Checked in a real render (`test-save-progress.js`, screenshot `.scratch/save-progress.png`).

## 8. Paywall
- One background, edge to edge: the page had a faint blue / green glow and a grey-blue footer; on wider phones the sides showed that glow stretched. Now the page, its footer fade, the sides and the strip under the status bar are the same plain white. Measured from screenshots on 4 iPhone sizes: before, every edge pixel was off-white and most were bluish (e.g. 237,240,251); after, all white.
- The page never scrolls or moves: it was 28 px taller than the screen (a bottom padding meant for other pages), so it could move. It is now exactly the screen's height, overflow is off and the web view's own scrolling is off for the paywall. Only the list inside scrolls (`test-paywall-bg.js`).

## 9. Logs: old sessions are kept
`scripts/log-server.js` (started by `npm run dev`): when it starts, the previous latest.log is MOVED to `logs/session-YYYY-MM-DD_HH-MM-SS.log` (the time it was last written) instead of being wiped. A new app session (a reload) keeps the one before it the same way. Only the newest 20 session files are kept; latest.log works as before. Tested with the real server (`test-log-archive.js`). It takes effect the next time you run `npm run dev` from the main folder (after the merge).

## Tests
New: `test-cue-direction.js`, `test-rep-timing.js`, `test-setup-too-close.js`, `test-onboarding-smooth.js`, `test-paywall-bg.js`, `test-log-archive.js` (and `scripts/lib/onb-perf.js`). Updated: `test-guide-pill-one-line.js` (3 words, small pill), `test-save-progress.js` (title, word next to the logo).
Also updated for the new behaviour (they pinned the old, wrong words or the old fading back button): `test-attempts.js`, `test-one-judge.js`, `test-half-reps-newbuild.js`, `test-guide-coach-1113.js`, `test-one-result.js` (a half press says "Go higher"), `test-onboarding-header.js`, `test-onboarding-round10.js`, `test-onboarding-r8.js` (bar and back button fixed), `test-setup-guide.js`, `test-guide-truth.js` (3-word lines), `test-verdict-flow.js`, `test-trial-reminder.js`, `test-paywall-screens.js`. Full suite: 119 of 119 pass.

## Needs your phone (one test list)
1. Shoulder press half reps: the cross says "Go higher" and lands about when the arms are back; checks a little sooner. Send the log (watch for a press counted twice).
2. Setup standing close to the phone: "Move back" at once, never "Hold still".
3. Guide pill: small again, every line on one line.
4. Onboarding: rank wheel, "building your plan", goal graph: smooth again? Back button and bar stay put when a page scrolls.
5. Save your progress: title at the top, "FormPal" next to the logo.
6. Paywall: all white edge to edge; only the list scrolls.
7. After the merge, restart `npm run dev` once: logs/ should get a session-....log of the run before.
