# Movement Match, the Guide and the Coach

Written BEFORE the code (2026-11-11). Every number here is a PLACEHOLDER (a reasoned first guess) and lives in ONE file,
`lib/coachTuning.ts`. After a real set, the `[MOVE-MATCH]` / `[GUIDE]` / `[COACH]` / `[CONFIDENCE]` log lines give the real numbers to set.

## The four words (Ari's words; used in code, comments and logs)

| word | what it is |
|---|---|
| **THE GUIDE** | The live line with the Cue stars. Its ONLY job: get the camera able to SEE the user so reps can be detected (where to stand, where the phone goes, light). Setup only. NEVER form advice. |
| **THE COACH** | The check / X with a reason on each rep. Its ONLY job: form feedback on reps the camera actually saw. NEVER setup advice. |
| **MOVEMENT MATCH** | A 0-100 score of how much the user's motion looks like THIS exercise (are they trying it?). Separate from whether a rep passes. |
| **CAMERA CONFIDENCE** | How well the camera can see what it needs to count reps. |

## What was broken (the live shoulder-press tests)

* Confidence read 100 while no rep counted. It only checked the parts it could see, not whether the whole rep path was seen.
* Half reps got no X.
* The Guide said form words ("Go lower", "Hands to shoulders") while nothing counted, and the Coach said the same words.
* Lines such as "Step back into" and "Lower to your shoulders" meant nothing to a first-time user.
* Suspected cause: the hands leave the frame at lockout, so the counter never sees the top of the rep.

## Signals (the same for every exercise)

Every one of the 56 catalogue exercises streams the same line from the camera, `[METRIC] <id> value= enter= exit= rom= top=`, about three
times a second. A rep is: the value starts near `top`, dips below `enter`, and comes back above `exit`. So one generic model covers all
exercises, using each exercise's OWN numbers from `constants/exerciseDefinitions.ts` (the signature, `lib/exerciseSignature.ts`).
Exercises that share a calibration shape (same metric kind and numbers: all curls, all squats...) share the same signature numbers.

Other lines used: `[REP-TRACE] angle=` (samples during a rep), `[ACTIVITY] suppressed ... metric=`, `[TRACK] person lost / back`,
`[REP] #n` (a counted rep), `[REP] rejected ... tracking unreliable` (low joint quality), and the camera events: native setup hint,
`personDetected`, `trackingCue`, `outOfPlaneCue`.

`R` = the rep span = |top - rom|. The PATH BAND = from `enter - 0.7R` up to `top + 0.25R`: values outside it are not this exercise's path
(arms dropped to the side while reaching for the phone).

## 1. Movement Match (0-100) = how much it looks like THIS exercise

Computed over the last 10 seconds of the value (resampled to a 0.25s grid; gaps stay gaps). Four parts, each 0-100:

* **motion**: how much of the movement is real swings (a swing is >= 0.3R) INSIDE the path band, over 2R of swing = full.
* **rhythm**: a repeating rhythm. Autocorrelation of the value over lags 1-6 seconds; a clear peak = 100. Needs >= 4 seconds of data; before
  that the other parts are re-weighted (a single big clean stroke is already "trying").
* **range**: how much range compared with a real rep: the 10th to 90th percentile spread of the in-band values over 0.8R = full.
* **position**: roughly the exercise's body position: share of samples in the path band, the value visiting the start zone (above `exit`),
  and a person being present.

`score = 0.25 motion + 0.25 rhythm + 0.30 range + 0.20 position`, then two gates multiply it:

* the **amplitude gate**: a spread under 0.15R scores 0 and rises to full at 0.4R (shuffling in place, walking: tiny swings),
* the **path gate**: if less than ~25% of the samples are inside the path band it falls to 0 (reaching for the phone, arms dropped).

`>= 55` is HIGH ("trying this exercise"), `< 35` is LOW, in between is "unsure" (treated as not trying: no Coach, no "stuck").
Not trying (standing still, grabbing the phone, walking, adjusting the camera) scores low. Half reps score HIGH (they are trying).

### Path coverage (can the camera see the WHOLE rep path?)

A **path cut** is a gap of 0.9s or more in the samples with the value near the TOP of the path before the gap (hands leaving the frame at
lockout) or near the BOTTOM (feet or hips out of frame), where the value is different when the samples come back. Two cuts in 12 seconds
(or one of 2 seconds+) = the path is cut at that end. A "person lost" event is a cut of the whole frame (too close / out of the picture).

## 2. The rules (identical for every exercise)

1. **Movement Match LOW**: no Coach (no check, no X). The Guide only gives a setup line if the user is not in position yet.
2. **Movement Match HIGH and reps counting**: camera confidence 90-100. The Coach gives a check or an X on EVERY attempt, with a form
   reason on every X. A half rep is an X: "Go higher" (or "Go lower").
3. **Movement Match HIGH but no rep counted for 5 seconds (or 2 attempts)**: camera confidence drops below 80 and keeps falling (-3 a
   second, to a floor of 15), never near 100. The Guide gives the REAL setup fix, picked from WHY it cannot count (below). If the reason is
   only that the strokes are short (the camera sees the whole path fine), the Guide stays silent: that is the Coach's job, on each X.
4. **Camera confidence never reads 80+ while the user is clearly trying and no reps count.** It measures whether the camera can see the
   WHOLE rep path (a cut path caps it at 70 straight away), not just this frame.
5. The Guide and the Coach have separate word lists and never say the same thing (a test enforces it).

### Picking the Guide line (the real reason it cannot count)

In this order: nobody in the picture -> "Step into the picture"; the person is cut at the frame edge / too close -> "Move your phone
back"; the TOP of the path is cut -> "Keep your hands in view" (hands exercises) or "Move your phone back"; the BOTTOM is cut -> "Keep your
whole body in view"; the camera rejected reps for low joint quality in the dark -> "Find more light"; wrong angle ->
"Stand sideways to the phone" / "Face the phone"; the phone too low or high -> "Put your phone at chest height"; nothing found -> silent.

## 3. Words

Every line makes sense to someone who has never used the app: one line, starts with a capital letter, no broken phrases.

* **Coach**: 2-3 words ("Go higher", "Too much swing", "Slow down"). Never says where to stand or where the phone goes.
* **Guide**: short plain setup sentences ("Move your phone back"). Never says how to move. The card keeps the old layout (stars left, text
  beside). If a line cannot fit on one line the stars grow to match two lines.

## 4. Logs

* `[MOVE-MATCH]` the score and its four parts, the rhythm period and any path cut.
* `[GUIDE]` what it said and why.
* `[COACH]` the check or X, and why.
* `[CONFIDENCE]` the number, what the camera sees, and which cap is holding it down.

## 5. Proof

`scripts/test-movement-match.js` replays Ari's real logs (Nov 8, 10, 11) and synthetic cases (standing still, grabbing the phone, walking,
half reps, full reps, hands out of frame at the top, too close) and prints a before / after table of what the Guide, Coach and confidence
did. It also builds a signature for EVERY exercise in the catalogue and checks the same rules on each, and checks the word lists.

## Addendum: a counted rep is evidence

A rep the engine really counted (or the app counted itself) lifts Movement Match to at least 40 ("unsure", never LOW) for the next 10
seconds (`repEvidenceFloor`). Without it, the first counted rep after a pause (the window had almost no movement in it yet) was scored LOW and
got no check (seen in the 2026-11-10 log). It never makes a stroke "HIGH" on its own, so it cannot start a "stuck" verdict or an X for an
uncounted stroke.

## Decisions made while building (change them if you disagree)

* **Adapting is off.** The attempt detector used to learn "this person's range" after three short strokes and count them as reps. A half rep
  must always get an X, so it is switched off (`adaptMaxShortFraction: 0`).
* **The Guide stays silent when the strokes are only short.** The camera sees the whole path fine, so there is no setup fix; the Coach already
  speaks on every X. Confidence still falls (rule 3).
* **Reps that cannot be judged** (rep-counter exercises) get no check / X at all, as before.
