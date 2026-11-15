/**
 * lib/coachTuning.ts
 *
 * EVERY threshold of Movement Match, Camera confidence, the Guide and the Coach, in ONE place (docs/movement-match.md).
 * !! ALL NUMBERS ARE PLACEHOLDERS !! reasoned first guesses, not measured. Do a real set and send the log: the [MOVE-MATCH],
 * [GUIDE], [COACH] and [CONFIDENCE] lines carry the numbers to set these from.
 */

export const MOVEMENT_MATCH = {
  windowSec: 10,            // PLACEHOLDER: how much recent movement the score looks at
  gridSec: 0.25,            // resample step
  maxInterpSec: 1.0,        // a gap longer than this stays a gap (never invented)
  minSamples: 6,            // fewer samples than this in the window = no data (score 0, "blind")
  // the exercise's path band, in rep spans R = |top - rom|
  bandBelowLow: 0.7,        // PLACEHOLDER: the path band reaches this many R below the exercise's low line (the lower of enter and rom)
  bandAboveTop: 0.25,
  // parts
  swingHysteresis: 0.2,     // a turn is real when the value moved this fraction of R
  swingMin: 0.3,            // a swing smaller than this (in R) is not counted as a movement
  motionFullR: 2.0,         // 2R of real swings in the window = motion 100
  rangeFullR: 0.8,          // a 10-90 percentile spread of 0.8R = range 100
  rhythmMinSec: 4,          // needs this much data before rhythm is used
  rhythmLagMinSec: 1.0,     // rep rhythm: ~1 to 6 s per rep
  rhythmLagMaxSec: 6.0,
  rhythmAcfLow: 0.15,       // autocorrelation peak mapped 0.15 -> 0, 0.70 -> 100
  rhythmAcfHigh: 0.70,
  rhythmMinPairs: 8,
  // weights (sum 1)
  wMotion: 0.25, wRhythm: 0.25, wRange: 0.30, wPosition: 0.20,
  // gates
  ampGateLowR: 0.15,        // spread under this (in R) = shuffling: score 0
  ampGateHighR: 0.40,       // from this spread the gate is fully open
  outGateFree: 0.05,        // up to this share of samples OFF the path is free (tracking glitches)
  outGateZero: 0.20,        // ...from this share the score is 0 (reaching for the phone, arms dropped, wandering off)
  // verdicts
  high: 55,                 // >= this = "trying this exercise"
  low: 35,                  // < this = "not trying"
  minTryingSec: 2,          // trying must hold this long before the Coach or a "stuck" verdict trusts it (a single reach is not a set)
  moveNowSec: 2.5,          // PLACEHOLDER: "moving right now" looks only at this many recent seconds (the 10 s score still remembers reps after you stop)
  moveNowIqrR: 0.2,         // PLACEHOLDER: ...and the middle half of those readings must spread at least this many rep spans (a rest with a spike does not count)
  repEvidenceFloor: 40,     // a rep the engine really counted is evidence of this exercise: for one window after it the score is at least this ("unsure", never LOW), so a counted rep after a pause still gets its check / X
  // path cuts
  cutGapSec: 0.9,           // the samples stop for this long while the value is in the top (or bottom) zone = the camera lost the joints there
  cutLongSec: 2.0,           // a gap this long counts double
  cutTopZoneR: 0.8,         // "near the top": within this many R below top
  cutBottomZoneR: 0.3,      // "near the bottom": within this many R above the exercise's low line (the lower of enter and rom)
  cutWindowSec: 12,
  cutMinEvents: 2,
  logEverySec: 3,           // [MOVE-MATCH] at most this often (also when the score moves by logDelta)
  logDelta: 10,
};

export const CONFIDENCE = {
  stuckAfterSec: 5,         // trying (Movement Match HIGH) with no rep counted for this long ...
  stuckAttempts: 2,         // ... or this many attempts that did not count
  stuckStart: 78,           // PLACEHOLDER: the cap when it starts (below 80)
  stuckFallPerSec: 3,       // ... then it keeps falling
  stuckFloor: 15,
  countingFloor: 90,        // trying AND reps counting: 90-100
  countRecentSec: 7,        // a rep counts as "counting" for this long (about 2 reps of rhythm)
  releaseSec: 8,            // once it has started falling it only recovers when a rep counts, or the user has not been trying for this long (no flicker back to 100 in a pause)
  cutCap: 70,               // the rep path is cut at an end: capped straight away while trying
  logEverySec: 2,
  logDelta: 8,
};

export const GUIDE = {
  minShowSec: 2.5,          // a Guide line stays up at least this long
  changeConfirmSec: 1.5,    // a different line (or none) must be wanted this long, without a break, before it replaces the one shown
  firstShowConfirmSec: 0.4, // a line shows after being wanted this long (so a one-frame blip never flashes)
  minTryingSec: 2,          // Movement Match must have been HIGH this long before a stuck diagnosis is trusted
  cuePersistSec: 1.5,       // the camera's own "step back / no person" signal must hold this long before the words or the number react (it flickers while you stand still)
  logEverySec: 4,
};

export const COACH = {
  minMatchForVerdict: 55,   // no check / X unless Movement Match is at least this (HIGH)
  oneVerdictPerSec: 1.2,    // an X for a missed stroke never comes closer than this after another verdict (a counted rep always gets its check)
  minAttemptStrokeR: 0.4,   // PLACEHOLDER: a stroke smaller than this many rep spans (R) is a wiggle, not a half rep: no X (Ari: standing still got "Go lower")
  attemptMinMatch: 35,      // an X for a missed stroke needs Movement Match at least this (not LOW); HIGH is no longer needed when the stroke itself is big (a half rep dips the score)
};
