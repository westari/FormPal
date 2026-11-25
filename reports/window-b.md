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
