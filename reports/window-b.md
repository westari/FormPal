# Window B report (2026-11-22)

Branch work-b. I merged origin/overnight-build first (clean). Phone is still on the OLD Oct 8 native build (log: "expo-brightness is NOT in this build", old setup lines). I did not start a build, delete anything or push to main.

## 1. My Workout camera: "Step into view", number never started, Guide silent - found, fixed (JS now, Swift on the new build)

**What the log shows** (`C:\Users\arize\gym app\logs\latest.log`, 16:42:15 to 16:42:56, goblet squat in My Workout; saved as `scripts\fixtures\workout-goblet-2026-11-22.log.txt`):
- The camera opened, the setup Guide said "Step into view" once, and then for 40 seconds there is no `[METRIC]` line, no `[SETUP-TRACE]` line and no other Guide line. The same day's solo shoulder press has all of them within 5 seconds.

**Is it a workout-only bug? No, I could not find any workout-only code.** I checked the whole start path (starting the camera, the setup listener, the Ready gate, the meter input): none of it reads the workout settings. A test now fails if anyone ever adds that. The real difference between the two tests is the EXERCISE: goblet squat vs shoulder press.

**Cause (two parts):**
1. Native only sends a setup update when it can measure the rep metric (`ExerciseEngine.ingest`: `guard let angle = measure(pose)`). A squat needs the legs. If a person is in the picture but the legs are cut off or too weak, native sends NOTHING.
2. The screen then kept the last thing native said, "Get in frame" ("Step into view"), and treated that as "nobody there": the number was 0 and the Guide never changed. The screen also never read Vision's own "a person is in the picture" signal during setup (it only listened while tracking).

**Honest limit:** the log cannot tell "he was not seen at all" from "he was seen but the legs were not measurable": both print nothing. The fix covers the second case and makes the next log tell the two apart (new `[SETUP-SEEN]` line).

**Fix, works on the old build (JS):**
- During setup the screen now reads Vision's `personDetected` (it arrives about once a second even when native is silent).
- A person seen = the stale "Get in frame" hint is dropped, the number is at least 25, and the Guide says "Step back further" (his legs are cut off or he is too close) instead of staying on "Step into view".
- Nobody seen = 0 and "Step into view", as before.

**Fix, needs the new build (Swift):** when a person is seen but the metric cannot be measured during setup, native now sends a setup update with a real hint ("Back up", "Come closer"...). I could not compile it on Windows; the string/bracket/call/import checks pass. It uses the same names as the code right below it.

**Tests:** `scripts\test-workout-camera-start.js` (new): the log has no metric lines; before = number 0 and "Step into view", after = 25 and "Step back further"; workout and solo share one start path; the wiring and the Swift change are in place.

## 2. Confidence never 0 while a person is seen: done
- The lowest the on-screen number goes while Vision sees a person is **25** (setup and tracking). It goes to 0 only when nobody is in the picture (it still walks down to 0 then; tested).
- Three places: the meter target (`lib/liveTracking.ts`), the on-screen number (`app/formcheck.tsx`), and the confidence module's own floor (15 to 25, `lib/coachTuning.ts`). 25 is the number you gave me.

## 3. Set bars: white, no green: done
Done and current sets are bright white with a soft WHITE glow, upcoming sets are dim glass, same separate glass pills. The only green left on the screen is the confidence bar, as in your design. (A test fails if the set glow turns green again.)

## 4. Timer icon: changed to the SF Symbol "timer", but I cannot show you a real side-by-side
- I changed `stopwatch` (size 16) to `timer` (size 15, medium weight, same medium weight as the "0:00" text next to it). "timer" is the cleaner outline at small sizes: a plain circle with a short hand and a small crown, fewer details than "stopwatch".
- **I cannot render real SF Symbols on this Windows machine**, and a drawn imitation would be a fake comparison, so there is no honest picture to put here. Look at it on the phone. If you still prefer another one, it is one word in one place (`name="timer"` in `app/formcheck.tsx`, the line with the timer text): `clock` (a plain round clock face) or `stopwatch` (the old one). Tell me which and I will switch it.

## 5. Half reps after the new build: confirmed from the code and a replay; phone test list below
**What will happen on the new build:**
- The new native engine watches every frame. When a stroke starts like a rep and does not count, it sends `onAttemptMissed` (log line `[ATTEMPT-MISSED]` with reason, reached, needed). The screen turns it into ONE verdict: a red X, with the Coach's word under it: "Go lower" (bottom too short) or "Go higher" (top too short).
- The word is the Coach's, shown on the X. The Guide does NOT speak then: by design the Guide only talks about camera problems, and it is hidden while an X is on screen. So you get the X and "Go lower", not a separate Guide line.
- While it is working, the camera number stays high (reps being judged = the camera sees you), and an X is not shown if a "step back" hint is up (the camera obviously cannot see the stroke).

**Proof from your newest log (shoulder press, 16:39, old build, JS mirror of the new native code):** 6 reps counted (checks) and 8 half reps got an X "Go lower". On the old build none of those 8 X marks appear. That is expected.

**Phone test list for after the new build** (install the new iOS build from GitHub Actions first; I did not start it):
1. Solo form check, shoulder press, stand 2 to 3 metres back. Setup should pass, "Ready. Go!" should come only once you are in position. Say if it comes too early.
2. Do 3 full reps: 3 checks, the count goes 1, 2, 3, the camera number stays 90+.
3. Do 3 half reps (stop high, do not go down far enough): each gets an X and "Go lower" (or "Go higher"). The count does not go up. The number does not fall. Say if an X is missing or late.
4. Stand still for 10 seconds after Go: nothing happens, no check. After 6 seconds with no rep you get "Start your reps" once.
5. Start a My Workout with a squat (goblet squat). Stand so your legs are cut off (too close): you should see "Step back further", the number at 25 or more (not 0), and a hint from native. Then step back until your whole body shows: it should pass and say Ready.
6. Walk out of the picture: the number goes to 0 and the Guide says to step back in. Come back: it recovers.
7. In a My Workout: the set bars are white pills (no green), "Finish" pill works, the timer icon looks clean.
8. Screen should stay on the whole time (the new keep-awake). Check the video clip plays in rep feedback.
9. Send me the log (`latest.log`) after step 3 and step 5: I want the `[ATTEMPT-MISSED]` and `[SETUP-SEEN]` lines.

## What I changed
- `lib/liveTracking.ts`, `lib/coachTuning.ts`, `lib/guideCoach.ts`, `app/formcheck.tsx`, `modules/athlt-camera/ios/ExerciseEngine.swift`.
- Tests: new `test-workout-camera-start.js`; `test-camera-hud-layout.js` updated for white bars and the `timer` symbol.
- New fixture `scripts\fixtures\workout-goblet-2026-11-22.log.txt`.

## Not verified
- Nothing here was seen on a phone. The Swift change is not compiled.
- I could not reproduce the My Workout bug on a device, only from the log and the code.
