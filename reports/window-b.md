# Window B report, 2026-11-16 (make the next build work, then the Guide tells the truth)

Branch `work-b`. `git merge origin/overnight-build` ran first (clean).
Native build in the newest log (`latest.log`, 20:18 UTC session): still the **old Oct 8 build** (no `[AWAKE] native`, no `[REP-QUALITY]`).

## PART 1 - make the next build work: done. I found and fixed a build-breaker.

**The build-breaker (1):** two Swift log lines I wrote earlier had lost their backslashes when I edited them from a shell script. `"[ATTEMPT-MISSED] (def.id) (reason) reached=(String(format: "%.1f", reached)) ..."` and the `[REP-QUALITY]` line were not valid Swift (the inner quotes end the string). The first build would have failed there. Both lines are rewritten (the number text is built in separate lets first, then one clean string with `\( )`). I then wrote a Swift lexer (`scripts/check-swift-strings.js`) that walks every Swift file (strings, `\( )` interpolation, nested strings, comments, brackets) and flags "code that starts with a printf format" (the signature of a lost backslash). It flags the old lines and passes the fixed files; a test proves it catches the bug.

**1. Swift reviewed as the compiler** (`git diff 23ea174..HEAD`, the Oct 8 commit the phone runs, 6 Swift files, 407 lines). What I checked:
- **Types and optionals:** `Double`/`Float` mixes (`pose[$0]?.confidence ?? 0` against `SETUP_JOINT_MIN_CONF: Float`, the same pattern the file already used), `Date`/`timeIntervalSince`, `Int` in `NSLog` (`%d` changed to `%ld` for the byte count), `String(format:)` arguments, `lastRepTime` is a `Date`.
- **Fixed:** `lastFinishedClipURL?.absoluteString ?? NSNull()` (a `String?` with an `NSNull` default can fail to type-check inside a dictionary): now `(x as Any?) ?? NSNull()`, the same pattern the file already uses for `currentVideoTimeSec`. Two places.
- **Argument labels and order:** `scripts/check-swift-calls.js` reads the 24 parameters of `ExerciseDefinition.init` and checks all 7 `ExerciseDefinition(...)` calls: labels exist, no duplicates, declared order, required arguments present (a duplicate `phantomGuardFraction` once broke a build; the registry comment about it is just a comment now). New params `startPositionGate` and `setupExtraJoints` have defaults and sit last.
- **Closures:** `onAttemptMissed` is `((_ reason: String, _ reached: Double, _ needed: Double) -> Void)?`; the call `onAttemptMissed?(reason, reached, needed)` and the module closure `{ [weak self] reason, reached, needed in ... }` match; `guard let self` is used the same way as elsewhere. The keep-awake `assertAwake` closure (`[weak self] (why: String) in`), `Timer.scheduledTimer(...) { _ in ... }`, `NotificationCenter.addObserver(forName:object:queue:using:)` (returns `NSObjectProtocol`, stored as one).
- **Parser:** `parseMetric(md)`, `Joint.init(string:)` (it exists, handles `leftHip` etc.), `gate.metric.measure(pose:)` returns `Double?`, `Metric.normalizedVerticalGap` exists, JSON keys `startPositionGate` / `startMin` / `peakMax` / `setupExtraJoints` match `constants/exerciseDefinitions.ts`.
- **Imports:** the module already imports `UIKit`, `AVFoundation`, `Vision`; the podspec links UIKit; `AVErrorRecordingSuccessfullyFinishedKey` and `AVFoundationErrorDomain` come from AVFoundation.
- **Events registered:** every `sendEvent("x")` (7 names: `onDebugLog`, `onRepDetected`, `onAttemptMissed`, `onSetupStatus`, `onCalibrationStatus`, `onCameraState`, `onDebugStats`) is in `Events(...)`, and every JS listener uses a registered name (tested).
- **Threading:** all `UIApplication` / `UIScreen` calls are inside `DispatchQueue.main.async` (the 4-second timer and the become-active observer run on main); `handleMovieFinished` runs on the inference queue as before; the stop path hands the keeper's teardown to main.
- **Brackets:** balanced in every file (the lexer).
- **Not provable here:** an actual compile (Windows). Swift 5.9 mode, so concurrency issues would only be warnings. Honest risk: a type-inference surprise in one of the long `+` string concatenations; none looks risky after the rewrite.

**2. Workflow, app.json, package.json (checked, `scripts/test-build-safety.js`, 16 checks):** workflow is `workflow_dispatch` only, macos-26 / Xcode 26, `npm install --legacy-peer-deps`, then `eas build --platform ios --profile development --local`; the flaky "downloadPlatform" step retries 3 times and never fails the run. `app.json` has `expo-camera` and `./plugins/withoutAppleSignIn` in the plugin list (the Sign In with Apple strip plugin is still there and removes the `com.apple.developer.applesignin` entitlement), camera and microphone descriptions are present. New native modules are at Expo SDK 54 versions (`expo-brightness ~14.0.8`, `expo-camera ~17.0.10`, `expo-keep-awake ~15.0.8`, `expo-apple-authentication ~8.0.8`) and are in `package-lock.json`. The removed `@dr.pogodin/*` packages are not imported anywhere. `scripts/check-imports.js` checked all 40 imported packages against `package.json`. `eas.json` development profile is a dev client.

**3. JS calls into native are safe on both builds:** every native function goes through `callNative` (a function the build does not have returns the fallback), every event listener through `safeListen` (never throws; `onAttemptMissed` simply never arrives on the old build). `expo-brightness` is loaded inside try/catch. `expo-keep-awake` and `expo-apple-authentication` are already in the old binary (the old log shows both). I added `[BRIGHTNESS]` log lines so the next log says whether brightness works.

**4. "First run on the new build" checklist:** `docs/first-run-new-build.md` (table of the log line for each native fix: `[AWAKE] native`, `[ATTEMPT-MISSED]`, `[REP-QUALITY]`, `[SETUP] whole body`, `[REP-GATE]`, `[TRACK]`, `[ACTIVITY]`, `[VIDEO]`, `[BRIGHTNESS]`, `[GLASS]`, `[GUIDE] ... evidence`, and what to send if the build or the camera fails).

## PART 2 - the Guide must tell the truth: done (replayed on the newest log)

5. **A tip comes from evidence.** In your 20:18 session (half reps, hands in view) the Guide said "Keep your hands in view" three times because of a fallback I added earlier: "you are trying, nothing counts, no exact cause, so say something". That fallback is removed. Now (`lib/guideCoach.ts`): 
   - "Keep your hands in view": only when the metric samples really stop near the TOP of the stroke (hands or arms lost there), or the camera rejected a rep and the poorly seen joints are the elbow / wrist (the native "tracking unreliable" line names the joints and their best confidence; I now read them).
   - "Keep your whole body in view" / "Step back further" / "Back up": the person is lost, the path is cut at the bottom or at both ends, or the poorly seen joints are hips / knees / ankles.
   - "Find more light": a rep was rejected and even the best joint confidence was under 0.45.
   - Every joint seen and the strokes just short: the Guide stays quiet; the decision says so ("every joint is seen all through the stroke; the strokes are just short (a form problem, the Coach's job)"). The Coach's half-rep X (new build) handles it.
   - Every `[GUIDE]` line now ends with its evidence: `[GUIDE] says "Keep your hands in view" because real camera problem, evidence: the metric samples stopped 2 time(s) near the TOP of the stroke in 12 s (hands / arms lost there)`.
   **Honest limit:** the old build does not send per-wrist confidence, so on it the "hands" evidence is the path cut at the top and the low-quality rejection (which names joints). A per-joint wrist confidence field in the engine's debug stats would be the next native addition; I did not add more Swift to a build that is about to compile for the first time.
6. **A real problem is spoken in about 3 seconds.** The old route needed "trying, then nothing counted for 5 s, then 2 s of trying" before any tip. Now a proven cause speaks after the evidence has held 1.0 s (`GUIDE.evidenceHoldSec`, placeholder) plus the Guide's 0.4 s confirm. A single clear loss of the hands (a gap of 1.2 s or more near the top, was 2.0 s) now counts straight away (`cutLongSec`, placeholder). Replay: hands lost at the top, first gap at 3.3 s, the Guide speaks at 4.7 s (1.4 s later); low-quality reject at 9 s, tip at 10.5 s.
7. **Proof:** `scripts/test-guide-truth.js`: your two real logs (the 18:39 set and the 20:18 set, saved as fixtures) give no hands / step back / light tip during the half reps; synthetic: hands lost at the top, person lost, low quality on arms, on hips, on everything, each gives the right tip with its evidence; plain half reps give a completely quiet Guide.

## PART 3 - workout camera screen top: done

8. Top to bottom, each offset measured from the top safe area (so nothing overlaps on any iPhone): top bar buttons, then the progress bar (a real Liquid Glass capsule with rounded ends, one rounded segment per set, moved down to 66), then the timer in a Liquid Glass capsule, then the big "Camera confidence" block, the same label + pill as the solo form check. The "Set 1 of 3" and "Next / last exercise" text is gone, and the compact capsule I tried last round is gone. The framing box starts below the confidence block. `scripts/test-camera-layout.js` checks 6 phone sizes (SE to Pro Max): no two boxes overlap, and the framing box keeps at least 40% of the screen. Where the build has no native glass, the same blur-glass pill the Guide uses is drawn. Not seen on a phone.

## PART 4 - after a form check: done

9. **Finish on the rep feedback of a form check** now hides the page, shows the existing `DoneScreen` small variant ("Nice work", a placeholder until your design), and when it finishes goes Home with one `router.dismissAll()`. There is one `dismissAll` in the file, a `leaving` guard stops a second tap or message, and the done screen calls `onFinish` once, so no loop. DoneScreen itself is untouched.

## Tests

New: `test-build-safety.js` (16 checks, runs the three static checkers), `test-guide-truth.js`; scripts `check-swift-strings.js`, `check-swift-calls.js`, `check-imports.js`. Rewritten: `test-camera-layout.js`. Updated: `test-done-flow.js`, `test-workout-video.js` (the new `as Any?` form). Whole suite: all pass. `npx tsc --noEmit`: the same 28 old errors, none new.

## Phone test (after the build)

1. Build installs and opens. Open the camera: `[GLASS] real Liquid Glass: ON`, `[AWAKE] native: ...` lines.
2. Half reps with your hands in view: an X ("Go lower") on each half rep, and the Guide says nothing. Cover your hands at the top: the Guide says "Keep your hands in view" in about 3 seconds.
3. A workout set: progress bar and timer glass capsules, then the big Camera confidence block, nothing overlapping.
4. Form check, rep feedback, Finish: "Nice work" then Home, once.
5. Send the log (see `docs/first-run-new-build.md`).

## Questions for Ari

None blocking. (The 35% half-rep line and the 1 s evidence hold are placeholders; send the `[ATTEMPT-MISSED]` and `[GUIDE]` lines.)

## Blocked commands

None this round. Still open: `rm -f .scratch/runall.out` (my scratch file), delete `.scratch\edit-tlt*.js`, Window A's `scripts\test-home-clean.js`, `train_wk_webkit.png`; optional `git rm lib\screenHaptics.ts`. My scratch files in `.scratch` can go too.

Window B HQ: Found and fixed two build-breaking Swift lines, Guide now needs evidence, glass workout top, done screen.
