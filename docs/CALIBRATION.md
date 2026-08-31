# Exercise calibration

How to set an exercise's thresholds from **real measured movement** instead of
guessed placeholders. Every `PLACEHOLDER` threshold in
`constants/exerciseDefinitions.ts` should eventually go through this.

---

## What the thresholds are

For each exercise the rep engine tracks one **metric** (an angle, a normalized
gap, a ratio…). Every metric in this app is set up as **decreasing-at-work**:
the value is **high at rest / the top of the rep** and **low at the bottom**.

| field | meaning |
|---|---|
| `topAngle` | the resting value. Feeds the settle gate and the "returned to start" resume check. |
| `repEnterThreshold` | metric drops **below** this on the way down → a rep starts (`inRep`). |
| `repExitThreshold` | metric rises **above** this on the way back up → the rep completes and counts. |
| `goodROMThreshold` | if the rep's deepest value (its min) is **at or below** this, it's a full-range rep; above it → flagged with `insufficientROMCue`. |

### Hysteresis — why enter and exit differ

`repEnterThreshold` and `repExitThreshold` are **different values with a gap
between them** (`enter < exit`). Without a gap, a metric hovering right at one
threshold — from tracking jitter or a pause mid-rep — flips the count on and
off repeatedly. With the gap, the metric has to travel a real distance down
(past `enter`) **and** a real distance back up (past `exit`) before another rep
can register. A good rule: the gap is **~15–20% of the rep's full range**.

---

## The calibration log

The form-check screen synthesizes a clean line for every rep (see
`lib/calibLog.ts`). In the log you'll see:

```
[CALIB] rep 1  min=0.42 max=1.95 range=1.53 dur=1.82s  → COUNTED (rom=OK, cue=GOOD)
        [thr in use: enter=0.95 exit=1.30 goodROM=0.85 top=1.50]
[CALIB] rep 2  min=0.51 max=1.93 range=1.42 dur=1.6s   → COUNTED (rom=OK, cue=GOOD)
[CALIB] rep dropped — tracking unreliable for 11/17 frames (65%)
```

and at the end of the set:

```
[CALIB-SUMMARY] 6 reps counted  |  rest/max avg=1.94 range[1.90–1.98]  |  bottom/min avg=0.44 range[0.38–0.53]  |  swing avg=1.50 range[1.39–1.58]  |  dur avg=1.7s
[CALIB-SUGGEST] topAngle=1.88  repEnterThreshold=1.04  repExitThreshold=1.31  goodROMThreshold=0.74   (enter/exit gap = hysteresis; goodROM flags reps shallower than ~80% depth)
```

- `min` = the deepest point of the rep (bottom). `max` = the resting value the
  rep started/ended at (top). `range` = `max - min`. `dur` = seconds.
- `[CALIB-SUGGEST]` is a first-pass threshold set computed from the measured
  averages. Read it, sanity-check it against the raw numbers, then set it (or
  adjust — see below).

Every frame's raw metric value is also in the log as `[METRIC] … value=…` so
you can see the full trajectory if a rep looks wrong.

---

## Getting the log out

There's a **Share logs** control in three places, so it's reachable wherever
the analysis lands:

1. **Live form-check screen** — under the Stop button, while tracking.
2. **Session-log review** — the screen shown right after you Stop ("Share").
3. **Recap / verdict screen** — "Share Logs" (bottom of the page). This one
   also runs the raw buffer through the synthesizer, so a **video-analysis**
   run gets the same `[CALIB]` lines and suggestion.

Share → paste the text back here.

---

## The workflow

### 1. Clean reps

Turn on the exercise, do **5–10 slow, full-range, textbook reps**. Stop.
Read `[CALIB-SUMMARY]`:

- `rest/max` → your real `topAngle` region.
- `bottom/min` → how deep a full rep actually goes.
- `swing` → the full range one rep covers.
- Check the per-rep `range[lo–hi]` spread. Tight (reps within ~10% of each
  other) = a clean signal, trust it. Wide = noisy metric, be conservative or
  reconsider whether the exercise is trackable at all.

### 2. Bad reps

Do **3–5 deliberately bad reps**: half-depth, using momentum, cut short.
Read those `[CALIB]` lines:

- Their `min` should sit **clearly above** the good reps' `min`. That gap is
  where `goodROMThreshold` goes — below the good reps' worst `min`, above the
  bad reps' best `min`. If the two overlap, the metric can't tell a shallow
  rep from a full one and a ROM cue will misfire.
- Their `range` will be smaller — good for confirming the enter/exit band.

### 3. Set the thresholds

From good-rep averages (`avgMax`, `avgMin`, `avgRange = avgMax − avgMin`):

| threshold | formula | why |
|---|---|---|
| `topAngle` | just below the **lowest** observed `max` | a real rest always clears it |
| `repEnterThreshold` | `avgMax − 0.60 × avgRange` | ~60% of the way down — every full rep crosses it, resting jitter doesn't |
| `repExitThreshold` | `repEnterThreshold + 0.18 × avgRange` | the hysteresis gap |
| `goodROMThreshold` | `avgMin + 0.20 × avgRange`, then nudge toward the **bad reps' min** | a full rep's min is below it; a shallow rep's min is above it |

`[CALIB-SUGGEST]` already does exactly this — use it as the starting point and
adjust `goodROMThreshold` once you've seen where the bad reps land.

### 4. Re-test

Set the values, reload, do a mixed set (good + bad). Confirm: every full rep
counts, `rom=OK` on the good ones, `rom=SHORT` + the cue on the shallow ones,
no double counts, no drops. Iterate if needed.

---

## Notes / limits

- **Rejected reps** (`[CALIB] rep dropped — tracking unreliable …`) are a
  *tracking* problem, not a threshold problem — the rep was detected fine and
  then discarded because joint confidence was too low for too much of the rep.
  That's the native reliability gate; it has a per-exercise override
  (`repReliabilityMaxUnreliableFraction`) which is a **native / EAS-build**
  change, not a threshold.
- **Inactivity suppression** locking out the rest of a set: also native
  (`inactivityRepGapSec`, default 8s).
- If good and bad reps **don't separate** in the log no matter how you tune —
  the motion is inside the pose model's noise floor for that joint set, and
  the exercise should be dropped rather than shipped flaky (see the removed
  Russian twist).

## Reload vs build

| change | where |
|---|---|
| any threshold in `exerciseDefinitions.ts` (`topAngle` / `repEnter` / `repExit` / `goodROM` / `formChecks` values) | **reload** |
| adding a whole new exercise definition | **reload** (engine is built from the JSON def; `setExercise` "unknown exercise" NSLog is harmless) |
| the `[CALIB]` synthesizer + Share buttons | **reload** |
| `repReliabilityMaxUnreliableFraction`, `inactivityRepGapSec`, `missingPersonGraceFrames`, `exitConfirmFrames`, any `ExerciseEngine.swift` gate | **EAS build** |
