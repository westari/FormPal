import Foundation

// ─── Rep result ───────────────────────────────────────────────────────────────

struct RepResult {
    let good:            Bool
    let cue:             String
    let primaryAngle:    Double
    let totalReps:       Int
    let goodReps:        Int
    let formValues:      [String: Double]
    let planarityLog:    String   // one-liner: ratio/reference/pass per check
    let planarityPassed: Bool
}

// ─── Setup status (emitted during SETUP phase) ────────────────────────────────

struct SetupStatus {
    let allJointsVisible: Bool
    let holdProgress:     Double
    let passed:           Bool
    let hint:             String
}

// ─── Calibration status (emitted passively during ACTIVE tracking) ───────────

struct CalibrationStatus {
    let repsCompleted: Int
    let repsNeeded:    Int
    let passed:        Bool
}

// ─── Debug stats (emitted every frame in ACTIVE phase) ───────────────────────

struct EngineDebugStats {
    let primaryAngle:  Double
    let phase:         String
    let isReady:       Bool
    let formMetrics:   [String: Double]
    let outOfPlaneCue: String?   // nil = in-plane; non-nil = foreshortening hint
}

// ─── Internal phases ──────────────────────────────────────────────────────────

private enum EnginePhase { case setup, active }
private enum RepPhase    { case waitingForReady, atTop, inRep }

private enum SetupPhaseState {
    case pending
    case holding(startTime: Date)
}

private enum ActivityState { case active, suppressed }

// ─── The exercise engine ──────────────────────────────────────────────────────
//
// Two-phase design:
//
//   SETUP (enginePhase = .setup):
//     Checks requiredJoints visibility + edge margin.
//     Requires a 2-second continuous hold before passing.
//     Rep counting does NOT run. Emits onSetupUpdate every frame.
//
//   ACTIVE (enginePhase = .active):
//     Rep counting starts immediately — no separate ready gate (removed; it
//     could get stuck indefinitely on exercises whose rest position didn't
//     cleanly satisfy its angle-range+confidence condition). The settle gate
//     (hasSettled, in runStateMachine's .atTop case) is the only thing left
//     preventing the initial walk-in/arm-raise from counting as a rep.
//     If def.calibration != nil, the first repsNeeded VALID completed reps also
//     feed the calibration sample buffers in the background (see completeRep /
//     feedPassiveCalibration); once collected, repEnter/repExit thresholds
//     swap to derived per-user values for every rep after that point. This
//     used to be a separate CALIBRATION phase that blocked rep counting and
//     readiness for repsNeeded slow reps — now it rides along on real reps.
//     Returns to SETUP if all required joints missing for ≥ 3 seconds.
//
// Rep logic (ACTIVE only):
//   atTop  → metric < repEnterThreshold → inRep  (track minimum)
//   inRep  → metric > repExitThreshold  → count rep → atTop
//
// Validity gate:
//   Before evaluating form: checks that repMetric can be measured on the exit frame.
//   Uses kMinConf (0.25) via repMetric.measure(), not readyGate.minConfidence (0.30).
//   Low-confidence rep → emits "ADJUST POSITION", not counted as good.
//   Logs [VALID] FAIL with which joints dropped below kMinConf.
//
// Phantom-rep guard:
//   Requires repEnterValue − peakAngle > 30% of (repEnterValue − goodROMThreshold).
//   Rejects pose-noise dips that immediately pop back above exitThreshold.
//   Logs [REP] rejected for any phantom.
//
// Form-over-ROM priority:
//   Checks with priority ≥ FORM_OVERRIDE_ROM_PRIORITY override the insufficientROMCue
//   even when goodROM is false. Handles cases where bad posture distorts the 2D angle
//   (e.g. elbow drift makes a curled arm look shallower than it really is).

final class ExerciseEngine {

    private let def: ExerciseDefinition

    // ── Engine and rep phases ────────────────────────────────────────────────
    private var enginePhase: EnginePhase = .setup
    private var repPhase:    RepPhase    = .waitingForReady
    private var repMinAngle: Double      = 999
    // Peak metric value seen while in .atTop — used as the movement baseline for the
    // phantom-rep guard. Using the actual top position (not the entry-threshold crossing)
    // makes the guard robust to frames where the metric returns nil at the bottom of the
    // rep (elbow confidence drops below kMinConf), which would otherwise leave repMinAngle
    // equal to repEnterValue and produce movement=0 on every rep.
    private var repTopValue:  Double     = 0
    // Kept for log only — the metric value at the moment we crossed enterThreshold.
    private var repEnterValue: Double    = 0

    // Backward compat: modules that check isSetupComplete still work.
    var isSetupComplete: Bool { enginePhase != .setup }

    // ── Rep counters ─────────────────────────────────────────────────────────
    private(set) var totalReps = 0
    private(set) var goodReps  = 0

    // ── Ready gate: REMOVED ───────────────────────────────────────────────────
    // A separate angle-range+confidence gate used to block all rep tracking
    // until it opened. Removed — see the note in ingest()'s ACTIVE-phase block.
    // The settle gate (hasSettled, below) is the only gate left.

    // ── Setup ────────────────────────────────────────────────────────────────
    private var setupPhaseState: SetupPhaseState = .pending
    private var setupLossStart:  Date? = nil

    private static let SETUP_HOLD_DURATION:   TimeInterval = 2.0
    // FIX 2a — was 3.0. Once SETUP has genuinely confirmed the rep metric is
    // trackable (see runSetupCheck's FIX 1 gate), a few seconds of Vision
    // dropping the person is a flicker, not a walk-away. A real departure is
    // still caught, just after a longer, less trigger-happy wait; the gentle
    // "Step back into frame" cue (activeTrackingCue) fills the gap in the
    // meantime instead of silently bouncing to the setup screen.
    private static let LEAVE_TIMEOUT:         TimeInterval = 6.0
    // 0.30 → 0.25 (= kMinConf). FIX 1's setup gate now means "the rep metric
    // is computable" — and the metric math itself gates joints at kMinConf, so
    // a stricter setup floor just made side-on setups (marginal shoulder/wrist
    // ~0.25-0.35) fail to lock on when the very next frame could count a rep.
    private static let SETUP_JOINT_MIN_CONF:  Float        = 0.25
    private static let SETUP_EDGE_MARGIN:     Double       = 0.05

    // FIX 2b — a single edge-adjacent / weak frame no longer nukes
    // framesSincePoseGap (which would open a ~0.5s window where no rep can
    // register). Only POSE_GAP_CONFIRM_FRAMES consecutive bad frames count as
    // a genuine gap; shorter blips just don't advance the settle count that
    // frame. See the ingest() ACTIVE path.
    private var poseGapStreak: Int = 0
    private var noPoseStreak:  Int = 0   // consecutive measure()==nil frames (handleNoPose)
    private static let POSE_GAP_CONFIRM_FRAMES: Int = 3

    // FIX — the SETUP 2s hold tolerates this many consecutive "not trackable"
    // frames before it resets. Marginal tracking (face pull side-on: the elbow
    // confidence oscillating around the 0.30 floor) was breaking the all-or-
    // nothing hold every 1-2 frames, so it never reached 2s and setup never
    // passed. A real repositioning still exceeds this and restarts the hold.
    private var setupHoldBadFrames: Int = 0
    private static let SETUP_HOLD_TOLERANCE: Int = 6

    // Gentle "I'm losing track of you" coaching shown DURING reps (looser than
    // SETUP's positionGuidance): speaks up only after a sustained weak stretch,
    // clears fast on recovery, never gates counting. Read directly by
    // ATHLTCameraModule.maybeEmitDebugStats and surfaced as onDebugStats.trackingCue.
    private(set) var activeTrackingCue: String? = nil
    private var trackWeakFrames: Int = 0
    private var trackGoneFrames: Int = 0
    private static let LOSING_TRACK_ENTER_FRAMES: Int = 10  // ~1s of weak tracking

    // ── Calibration (passive — fed from real completed reps, see completeRep) ──
    //
    // ROOT CAUSE (session-to-session feedback inconsistency, highest-priority
    // report): 5 exercises (curl, squat, shoulderPress, lunge, frontRaise) had
    // def.calibration set, which after just 2 reps REPLACED the carefully
    // tuned, real-device-log-derived repEnter/repExitThreshold with values
    // derived from THAT session's first 2 reps alone. Two reps is a tiny,
    // noise-prone sample with zero outlier rejection — a slightly-off opening
    // pair shifts the rep-boundary window for the entire rest of the session,
    // which can shift which frames get scanned for repMinAngle (the value
    // goodROM compares against a FIXED, non-derived threshold). Same physical
    // rep, different session, different opening reps → different verdict.
    // This was the real mechanism — NOT the Universal Quality Engine's
    // baseline (confirmed separately: its signals only ever reach [UNIV] logs,
    // never the user-visible verdict — see onRepCompleted's wiring in
    // ATHLTCameraModule.swift, which sends onRepDetected BEFORE calling
    // universalEngine.onRepCompleted at all).
    //
    // FIX: effectiveEnterThreshold/effectiveExitThreshold below now ALWAYS use
    // the static, tuned def values — never the per-session derived ones. This
    // makes rep-boundary detection behave identically to every other exercise
    // in the app (none of which have def.calibration), and removes the only
    // per-session-varying input into what a "same movement" verdict depends
    // on. The sample-collection code below is left in place (harmless,
    // unused) rather than deleted, in case per-user adaptation is revisited
    // later with a larger sample and outlier rejection — but it no longer
    // affects behavior.
    private var calibRestBuf:      [Double] = []   // top/rest value per sampled rep
    private var calibPeakAngles:   [Double] = []   // bottom/peak value per sampled rep
    private var calibRepCount:     Int      = 0
    private var calibDerivedEnter: Double?  = nil
    private var calibDerivedExit:  Double?  = nil

    // ── Active thresholds ──────────────────────────────────────────────────────
    // All three are now always the static, per-exercise-tuned values — see the
    // ROOT CAUSE comment above for why calibDerivedEnter/Exit are intentionally
    // never read here anymore.
    private var effectiveEnterThreshold: Double { def.repEnterThreshold }
    private var effectiveExitThreshold:  Double { def.repExitThreshold  }
    private var effectiveROMThreshold:   Double { def.goodROMThreshold }

    // ── Form-over-ROM priority ────────────────────────────────────────────────
    // Checks at priority ≥ this value override the ROM cue when goodROM is false.
    // Curl: elbow_drift=4, lean_back=5 → both override "CURL HIGHER".
    private static let FORM_OVERRIDE_ROM_PRIORITY: Int = 4

    // ── Form check accumulators (reset each rep) ──────────────────────────────
    private var accumMax:    [String: Double] = [:]
    private var accumMin:    [String: Double] = [:]
    private var atBottomVal: [String: Double] = [:]
    // Diagnostic counter — see accumulate()'s doc comment below.
    private var confDrops:   [String: Int]    = [:]
    // Tracking-reliability gate counters — see the phantom-guard-adjacent
    // gate in runStateMachine's .inRep completion path for how these are used.
    private var primaryUnreliableFrames: Int = 0
    private var primaryTotalFrames:      Int = 0
    // DIAGNOSTIC (glute bridge investigation — 178/178 frames unreliable,
    // 100%, on-device): the rejection message only ever reported the
    // aggregate pass/fail count, never the actual per-joint confidence
    // Vision was producing — no way to tell "Vision found this person but
    // wasn't confident" from "Vision essentially found nothing" without
    // this. Min/max confidence seen per referenced joint across the whole
    // (possibly-rejected) rep, reset alongside the counters above.
    private var primaryJointConfMin: [Joint: Float] = [:]
    private var primaryJointConfMax: [Joint: Float] = [:]

    // ── Planarity / foreshortening gate ───────────────────────────────────────
    // calibratedSegmentRefs: max segmentLengthRatio per check learned during calibration.
    // planarityMinRatios: minimum ratio observed during the current rep (most foreshortened).
    private(set) var calibratedSegmentRefs: [String: Double] = [:]
    private var planarityMinRatios:         [String: Double] = [:]

    // ── Debounce / inactivity ─────────────────────────────────────────────────
    private var lastRepTime:       Date = .distantPast
    private var lastValidPoseTime: Date = .distantPast
    private let inactivityTimeout: TimeInterval = 2.5

    // ── Pose-gap settle (step-out-of-frame protection) ────────────────────────
    // A frame can pass the repMetric's confidence gate (kMinConf) while the
    // person is only PARTIALLY visible (stepping toward the frame edge) —
    // confidence isn't a perfect proxy for positional accuracy, especially
    // during rapid pose transitions. A single such frame can spuriously enter
    // a rep or corrupt repMinAngle before the person is confirmed fully gone
    // (notePersonMissing) or handleNoPose's inactivityTimeout (2.5s) resets
    // anything — a quick step-out-and-back can slip through both.
    // framesSincePoseGap resets to 0 on ANY invalid/missing-pose frame (see
    // handleNoPose) and must reach MIN_FRAMES_AFTER_POSE_GAP of consecutive
    // valid frames before a rep is allowed to ENTER or COMPLETE — same
    // consecutive-frame-hysteresis pattern already used for the ready gate,
    // settle gate, and resume counter elsewhere in this file, applied here to
    // give Vision a moment to re-settle after any pose disruption.
    private var framesSincePoseGap: Int = 0
    private static let MIN_FRAMES_AFTER_POSE_GAP: Int = 5  // ~0.5s at ~10fps effective rate

    // ── Missing-person grace period (Issue 2 core fix) ────────────────────────
    // ROOT CAUSE (tricep zero reps, log-confirmed: settle succeeds, then every
    // single rep hits "[ACTIVITY] rep abandoned — person left frame" with the
    // user never actually leaving): notePersonMissing's in-progress-rep
    // abandonment fired on the FIRST single frame Vision's whole-body
    // detector returned zero observations — no debounce at all, the only
    // transition in this file with that property (see EXIT_CONFIRM_FRAMES'
    // doc comment for the identical class of bug already fixed on the
    // completion side). A single missed Vision frame is not rare during any
    // fast or self-occluding movement — tricep pushdown's forearm crossing
    // down in front of the torso at the bottom of the rep is exactly that,
    // and it happens on every rep at the exact moment repPhase == .inRep,
    // so every single rep got killed before it could ever complete.
    // Genuinely walking away is NOT one frame — it's sustained. Require
    // def.missingPersonGraceFrames consecutive missing-person frames before
    // abandoning, same order of magnitude as exitConfirmFrames. This does not
    // reopen the ORIGINAL bug this logic was written to fix (a stale
    // repMinAngle silently producing a bogus completion after a step-out) —
    // that bug was about completing with corrupted data, and completion is
    // separately protected by framesSincePoseGap (reset to 0 on ANY missing
    // frame, requiring MIN_FRAMES_AFTER_POSE_GAP clean frames before a rep
    // can complete) — abandonment and completion are independent gates here.
    //
    // REGRESSION FOLLOW-UP: the flat 3-frame default (~0.3s) was STILL not
    // enough for tricep specifically — a log showed Vision losing the whole
    // person for MORE than 3 consecutive frames from the forearm-crossing-
    // torso self-occlusion alone. Made this a per-exercise override
    // (def.missingPersonGraceFrames, see ExerciseDefinition.swift) rather
    // than raising the global default again — same lesson as
    // exitConfirmFrames: a single flat constant kept needing conflicting
    // values for different exercises, so it's per-exercise now. Default
    // stays 3 for exercises tracked at normal distance; tricepVariant()
    // overrides it up (see exerciseDefinitions.ts).
    private var consecutiveMissingFrames: Int = 0

    // ── Walk-away / inactivity suppression ───────────────────────────────────
    // Suppresses rep counting and cues when the user walks toward the camera
    // (approach) or has been idle after finishing a set (inactivity).
    // Resumes automatically when the user returns to the exercise start position.
    private var activityState:           ActivityState = .active
    private var suppressionReason:       String        = ""
    private var torsoRefBaseline:        Double?       = nil  // max ref seen in first TORSO_BASELINE_FRAMES
    private var torsoRefBaselineFrames:  Int           = 0
    private var torsoRefCurrent:         Double        = 0.0
    private var resumeConsecFrames:      Int           = 0
    private var approachConsecFrames:    Int           = 0

    private static let APPROACH_SCALE_FACTOR:  Double = 1.35  // torso >35% above baseline → approaching
    private static let APPROACH_RELEASE_MULT:  Double = 1.15  // must drop to <15% above baseline to resume
    private static let INACTIVITY_REP_GAP_SEC: Double = 8.0   // idle gap after last rep before suppression
    private static let TORSO_BASELINE_FRAMES:  Int    = 60    // ~2s at 30fps to establish baseline
    private static let RESUME_CONSEC_FRAMES:   Int    = 15    // ~0.5s in start zone to resume
    private static let APPROACH_ENTER_FRAMES:  Int    = 8     // ~0.27s consecutive to suppress on approach

    // ── Settle gate ───────────────────────────────────────────────────────────
    // Prevents the first arm-raise into starting position from being counted as a rep.
    // Root cause: raising arms from ~1.1 → 2.0 is a 0.9-unit swing, which passes the
    // phantom-rep guard (requires only ~0.2 units for seated row). The settle gate holds
    // rep counting until the metric has been stably above exitThreshold for SETTLE_FRAMES.
    // Once settled, hasSettled stays true for the session — no re-settling between reps.
    private var hasSettled:             Bool   = false
    private var settledTopFrames:       Int    = 0
    // Highest angle seen so far while !hasSettled — a fallback "rest" reading
    // for exercises where the user never fully returns above exitThreshold
    // between reps (see the resync fix in runStateMachine's .atTop case).
    private var settleCandidateTop:     Double = -.infinity
    // Diagnostic only — see the resync log's doc comment in runStateMachine.
    private var preSettleFrameCount:    Int    = 0

    private static let SETTLE_FRAMES: Int = 8   // ~0.27s at 30fps

    // ── Settle-anchor floor (per-exercise, opt-in) ────────────────────────────
    // ROOT CAUSE this closes (lat pulldown reading a press-like low start as
    // its own "rest" position): BOTH settle paths above will happily lock in
    // repTopValue from WHATEVER value the metric happened to be at — the
    // resync path in particular settles the instant angle first dips below
    // effectiveEnterThreshold, using settleCandidateTop, which for someone
    // starting their motion near the BOTTOM of this exercise's range (e.g. a
    // press performed in the lat-pulldown exercise slot, hands starting at
    // shoulder height instead of overhead) could be a value barely above
    // effectiveEnterThreshold itself — nowhere near a genuine "starting at
    // rest" reading, but accepted anyway because the mechanism was only ever
    // built to protect against ARM-RAISE NOISE before a real exercise begins,
    // not to verify the exercise's actual starting position is correct.
    // def.settleAnchorMinFraction (nil for every exercise except lat pulldown
    // — see latPulldownVariant()) requires the settle candidate to sit at
    // least this fraction of the way from goodROMThreshold up to topAngle
    // before EITHER path is allowed to commit; if not met, hasSettled stays
    // false and the engine keeps waiting — a motion that never reaches a
    // genuine starting position for this exercise simply never counts,
    // which is the explicit intended behavior (a press should not register
    // as a pulldown). nil preserves every other exercise's existing
    // behavior exactly — this is strictly opt-in, never applied by default.
    private func settleCandidateAcceptable(_ candidate: Double) -> Bool {
        guard let frac = def.settleAnchorMinFraction else { return true }
        let minRequired = effectiveROMThreshold + (def.topAngle - effectiveROMThreshold) * frac
        return candidate >= minRequired
    }

    // Throttled to ~1/sec — without this, someone performing an entirely
    // different motion (e.g. a genuine press) in this exercise's slot would
    // fail settleCandidateAcceptable() every single frame indefinitely,
    // flooding the debug log. settleCandidateTop keeps updating via max()
    // regardless (see the caller), so a later genuine overhead position is
    // still picked up the moment it occurs — this only throttles the log.
    private func logSettleRejection(candidate: Double, timestamp: Date) {
        let now = timestamp.timeIntervalSinceReferenceDate
        guard now - lastSettleRejectLogTime >= 1.0 else { return }
        lastSettleRejectLogTime = now
        let minRequired = effectiveROMThreshold + (def.topAngle - effectiveROMThreshold) * (def.settleAnchorMinFraction ?? 0)
        let msg = "[SETTLE] rejected — candidate=\(String(format: "%.3f", candidate)) " +
                  "required>=\(String(format: "%.3f", minRequired)) " +
                  "— not a genuine starting position for this exercise, still waiting"
        NSLog("[Engine] [%@] %@", def.id, msg)
        onDebugLog?(msg)
    }

    // ── Exit confirmation (CORE double-count fix) ────────────────────────────
    // ROOT CAUSE, applies to every exercise, not a per-exercise threshold problem:
    // the .inRep completion check (`angle > effectiveExitThreshold` below) fired
    // on a SINGLE frame with zero debounce — the only transition anywhere in this
    // state machine that didn't already have the same consecutive-frame
    // confirmation pattern used everywhere else (SETTLE_FRAMES, MIN_FRAMES_AFTER_
    // POSE_GAP, RESUME_CONSEC_FRAMES, APPROACH_ENTER_FRAMES all require multiple
    // consecutive frames before acting — completion alone acted on frame one).
    // A single anomalous frame — Vision jitter, a brief sticking-point wobble
    // mid-press, a 2D foreshortening blip as the limb rotates — that transiently
    // reads back above exitThreshold WHILE THE PERSON IS STILL MID-REP completes
    // the rep immediately using whatever partial repMinAngle had been reached so
    // far, resets to .atTop, and then the person's continued real motion (still
    // pressing up, then coming back down) enters and completes a SECOND time —
    // exactly "one rep counted going up, one counted coming back down" for what
    // was physically one repetition. Widening per-exercise hysteresis (the fixes
    // already tried for tricep/hinge) only shrinks the window this can happen in;
    // it doesn't close it, because the bug isn't about HOW FAR apart enter/exit
    // are, it's about a single frame being trusted at all. Requiring the metric
    // to hold above exitThreshold for def.exitConfirmFrames consecutive frames
    // before completing — hard reset on any dip back down, since that's still-
    // genuine continued rep motion, not noise — closes this for every exercise
    // at once. This does NOT catch a genuine multi-frame PAUSE well above
    // exitThreshold mid-rep before the person presses again — that's real,
    // ambiguous user behavior (arguably two attempts), not a bug, and no
    // debounce window can distinguish that from two real reps without more
    // information than this engine has.
    //
    // REGRESSION, FOUND AND FIXED: a prior pass weakened this globally from 3
    // to 2 frames "preemptively," reasoning kettlebellSwing (an explicitly
    // ballistic movement) might not sustain above exitThreshold for a full
    // 0.3s. That was never confirmed on-device, and it directly caused the
    // double-counting to come back on shoulder press/tricep — the exact
    // exercises this gate exists for. The dwell requirement is now
    // per-exercise (def.exitConfirmFrames, see ExerciseDefinition.swift),
    // defaulting to 3 (the value that actually closed the reported bug) for
    // every exercise; kettlebellSwing alone overrides it down. Never weaken
    // the DEFAULT to accommodate one exercise's hypothetical edge case again —
    // override that one exercise instead.
    private var exitConfirmCount: Int = 0

    // ── Form-check reliability floor (CORE false-cue fix) ────────────────────
    // ROOT CAUSE (tricep "KEEP ELBOWS IN when the elbow isn't moving", and the
    // same class of misfire possible on any exercise's throughoutMax/Min form
    // check): Metric.measure() gates every joint at kMinConf (0.25) — the same
    // floor already proven, in this exact codebase, to be too permissive for
    // anything comparing two readings against each other (see
    // UniversalQualityEngine's symmetryMinConf=0.6, added after a device log
    // showed a 0.39-0.56-confidence occluded joint producing a noisy angle that
    // looked like a real left/right difference against a well-tracked side).
    // throughoutMax/Min accumulation has the identical shape of problem: it's
    // effectively "is any single frame across the whole rep worse than X" — one
    // low-but-passing-confidence frame (motion blur, brief partial occlusion)
    // can permanently corrupt accumMax for that rep even if every other frame
    // was fine, and unlike a single-value check, there's no later frame that
    // can undo a bad max/min once recorded. Reusing the SAME validated 0.6
    // floor (not a new guessed number) specifically for form-check measurement
    // — repMetric/dataIsValid keep using kMinConf unchanged, since that gate's
    // job (basic rep-tracking availability) is different from this one's
    // (trusting a value enough to accumulate it into a rep-long max/min).
    private static let FORM_CHECK_MIN_CONF: Float = 0.6

    // ── Receding (walking away) suppression ──────────────────────────────────
    // ROOT CAUSE (tricep "gave an X when I walked away to get my phone"):
    // updateActivityState's approach check only ever watches for torsoRef
    // GROWING (walking closer) — there was never a matching check for it
    // SHRINKING (walking away). Tricep also has suppressApproachDetection=true
    // (needed because leaning into a cable stack inflates torsoRef the same way
    // approaching does), which left it with NO walk-away protection at all
    // beyond the 8s inactivity timer — and tricep's own repMetric (forearm angle
    // from vertical) is geometrically close to what a normal arm swings through
    // while walking, so a walk-away within 8s of the last rep can read as a real
    // one. Fix mirrors the existing approach check but for a large, sustained
    // SHRINK, and is intentionally NOT gated behind suppressApproachDetection —
    // that flag exists for the GROWING false-positive (hinge/tricep's own motion
    // can inflate torsoRef), a different failure mode than receding. Deliberately
    // conservative threshold: this codebase's own foreshortening checks
    // (segmentLengthRatio, e.g. squat's 0.75 minRatio) show normal exercise-
    // induced shrink tops out around 25-30% — RECEDE_SCALE_FACTOR (0.5, i.e. the
    // torso must collapse to LESS THAN HALF baseline) sits well beyond that, so
    // it should stay quiet during real reps even for torso-rotating exercises.
    // Not device-verified for this exact scenario — send a log if it misfires
    // on a real rep (too sensitive) or doesn't catch a real walk-away (too
    // conservative) and it'll be tuned from real numbers instead of reasoned margin.
    private var recedeConsecFrames: Int = 0
    private static let RECEDE_SCALE_FACTOR: Double = 0.5

    // FOLLOW-UP (shoulder press: walking away still counted 2 phantom reps
    // before suppression caught up): recede was sharing APPROACH_ENTER_FRAMES
    // (8 frames, ~0.8s) with the approach check. During that ~0.8s BEFORE
    // recede confirms, a real arm swing from walking can complete 1-2 phantom
    // reps if it happens to cross the exercise's own enter/exit thresholds —
    // plausible within well under a second. Approach needs a longer
    // confirmation window because it has to distinguish "slightly closer,
    // still exercising" from "genuinely walked closer," a subtle difference.
    // Recede doesn't have that problem: by the time torsoRef has ALREADY
    // collapsed past RECEDE_SCALE_FACTOR (50% — a large, conservative
    // amplitude chosen specifically to stay clear of normal exercise
    // variance), the change itself is already unambiguous, so it can afford
    // to confirm faster without materially raising false-positive risk.
    // Halving the window is a reasoned, not device-verified, tradeoff — send
    // a log if 2 fewer phantom reps still slip through before this catches up.
    private static let RECEDE_ENTER_FRAMES: Int = 4

    // ── Per-frame log throttle ────────────────────────────────────────────────
    private var lastFrameLogTime:    Double = 0
    private var lastActivityLogTime: Double = 0
    private var lastSettleRejectLogTime: Double = 0

    // ── Callbacks ─────────────────────────────────────────────────────────────
    var onRepDetected:       ((RepResult)        -> Void)?
    var onDebugStats:        ((EngineDebugStats) -> Void)?
    var onSetupUpdate:       ((SetupStatus)      -> Void)?
    var onCalibrationUpdate: ((CalibrationStatus) -> Void)?
    // Arbitrary diagnostic message — wired to sendEvent("onDebugLog") in ATHLTCameraModule.
    // Used for [METRIC], [VALID], [GATE], [REP] logs so they reach JS/Metro on Windows.
    var onDebugLog:          ((String) -> Void)?
    // Lets UniversalQualityEngine veto a GOOD verdict using signals this engine
    // has no primitive for (velocity/jerk over time — ExerciseEngine only ever
    // sees instantaneous per-frame angles). Wired in ATHLTCameraModule to call
    // universalEngine.onRepCompleted(...) and return its swing-override cue.
    // Called from completeRep() BEFORE goodReps increments, so the counter and
    // the sent verdict can never disagree — see the ROOT CAUSE comment there.
    // Returns non-nil to force isGood=false with that cue; nil leaves the
    // ROM/form-check verdict as computed.
    var checkSwingOverride:  ((_ peakValue: Double, _ repNumber: Int, _ repEndTime: Date) -> String?)?
    // ─────────────────────────────────────────────────────────────────────────

    init(definition: ExerciseDefinition) {
        self.def = definition
    }

    // Full reset — clears everything including setup and calibration.
    func reset() {
        enginePhase           = .setup
        repPhase              = .waitingForReady
        totalReps             = 0
        goodReps              = 0
        setupPhaseState       = .pending
        setupLossStart        = nil
        lastValidPoseTime     = .distantPast
        lastFrameLogTime      = 0
        resetCalibrationState(keepDerived: false)
        resetRepState()
        resetActivityState()
        resetSettleState()
        resetTrackingHealth()
    }

    // Partial reset — resets rep counters but keeps enginePhase and calibration-derived thresholds.
    // Used when startTracking() is called after setup/calibration already passed.
    func resetForTracking() {
        repPhase              = .waitingForReady
        totalReps             = 0
        goodReps              = 0
        setupLossStart        = nil
        lastValidPoseTime     = .distantPast
        lastFrameLogTime      = 0
        resetRepState()
        resetActivityState()
        resetSettleState()
        resetTrackingHealth()
    }

    // FIX 2 — the flicker-tolerance + live-cue counters.
    private func resetTrackingHealth() {
        poseGapStreak     = 0
        noPoseStreak      = 0
        setupHoldBadFrames = 0
        trackWeakFrames   = 0
        trackGoneFrames   = 0
        activeTrackingCue = nil
    }

    // ─── Per-frame entry point ────────────────────────────────────────────────

    func ingest(pose: Pose, timestamp: Date) {
        if enginePhase == .active { setupLossStart = nil }
        // Vision found a person this frame (ingest is only called when it did —
        // see ATHLTCameraModule's results.isEmpty guard) — clear the missing-
        // person grace counter. See consecutiveMissingFrames's doc comment.
        consecutiveMissingFrames = 0

        guard let angle = def.repMetric.measure(pose: pose) else {
            handleNoPose(timestamp: timestamp)
            return
        }

        // FIX 3: throttled per-frame metric log via onDebugLog (~3/sec).
        // Replaces the old NSLog-only frame log that was invisible on Windows.
        // Shows live metric value vs thresholds — essential for diagnosing exercises
        // (like push-up) where zero reps suggests the metric never crosses the
        // enter threshold. Compare value vs enter: if value stays well above enter,
        // the geometry or thresholds are wrong.
        let now = timestamp.timeIntervalSinceReferenceDate
        if now - lastFrameLogTime >= 0.33 {
            lastFrameLogTime = now
            let stateLabel: String
            switch repPhase {
            case .waitingForReady: stateLabel = "waiting"
            case .atTop:           stateLabel = "up"
            case .inRep:           stateLabel = "down"
            }
            let msg = "[METRIC] \(def.id) value=\(String(format: "%.4f", angle)) " +
                      "enter=\(String(format: "%.4f", effectiveEnterThreshold)) " +
                      "exit=\(String(format: "%.4f", effectiveExitThreshold)) " +
                      "rom=\(String(format: "%.4f", effectiveROMThreshold)) " +
                      "top=\(def.topAngle) " +
                      "state=\(stateLabel) phase=\(phaseLabel())"
            onDebugLog?(msg)
        }

        switch enginePhase {
        case .setup:
            runSetupCheck(pose: pose, timestamp: timestamp)
            onDebugStats?(EngineDebugStats(primaryAngle: angle, phase: "setup",
                                           isReady: false, formMetrics: [:], outOfPlaneCue: nil))
            return

        case .active:
            break
        }

        // ── ACTIVE phase ──────────────────────────────────────────────────────
        lastValidPoseTime = timestamp

        // ROOT CAUSE (squat still corrupting reps after stepping back into frame):
        // framesSincePoseGap only reset on a fully-nil pose (handleNoPose) or a
        // confirmed-gone person (notePersonMissing) — but someone stepping back
        // INTO frame passes through a window where their joints are still only
        // PARTIALLY visible at the frame edge, with confidence that can still
        // clear kMinConf (0.25) despite the reading being positionally garbage.
        // That frame never counted as a "gap" at all, so the settle-after-gap
        // protection never engaged for the exact scenario it was built for —
        // same class of bug as the lateral-raise asymmetry check (confidence
        // above the floor isn't the same as a reliable reading). Treat an edge-
        // adjacent repMetric joint exactly like a pose gap.
        // def.edgeGuardEnabled == false (floor exercises: crunch/sit-up) skips
        // ONLY this edge reset — the person lies across the whole frame with a
        // knee/shoulder legitimately near an edge every rep, and this was
        // deleting the deep frames of every rep after the first (see the field's
        // doc comment in ExerciseDefinition.swift). A real missing pose still
        // resets framesSincePoseGap via handleNoPose/notePersonMissing.
        // FIX 2b — a SINGLE edge-adjacent frame no longer nukes framesSincePoseGap
        // (which opens a ~0.5s window where no rep can register). It takes
        // POSE_GAP_CONFIRM_FRAMES consecutive edge-adjacent frames to count as a
        // real gap; a 1-2 frame flicker just doesn't advance the settle count
        // that frame. Once SETUP has genuinely confirmed the rep metric is
        // trackable (FIX 1), brief flickers are noise, not a walk-away.
        let edgeBad = def.edgeGuardEnabled &&
            isNearFrameEdge(pose: pose, joints: def.repMetric.referencedJoints())
        if edgeBad {
            poseGapStreak += 1
            if poseGapStreak >= Self.POSE_GAP_CONFIRM_FRAMES { framesSincePoseGap = 0 }
        } else {
            poseGapStreak = 0
            framesSincePoseGap = min(framesSincePoseGap + 1, Self.MIN_FRAMES_AFTER_POSE_GAP + 100)
        }

        // Gentle live "losing track" cue during reps (looser than SETUP): only
        // after a sustained weak stretch, clears fast on recovery, never gates
        // counting. Surfaced as onDebugStats.trackingCue.
        // A valid pose reached ingest → clear the no-pose streak and drop the
        // cue immediately; it only comes back if the metric stays unreliable
        // for LOSING_TRACK_ENTER_FRAMES straight (below).
        trackGoneFrames = 0
        noPoseStreak = 0
        activeTrackingCue = nil
        if isMetricReliable(def.repMetric, pose: pose, minConf: Self.FORM_CHECK_MIN_CONF) {
            trackWeakFrames = max(0, trackWeakFrames - 2)
            if trackWeakFrames == 0 { activeTrackingCue = nil }
        } else if def.edgeGuardEnabled {
            // Floor exercises (edgeGuardEnabled == false) track weakly by
            // nature every rep — don't nag them (see notePersonMissing).
            trackWeakFrames = min(trackWeakFrames + 1, Self.LOSING_TRACK_ENTER_FRAMES + 10)
            if trackWeakFrames >= Self.LOSING_TRACK_ENTER_FRAMES {
                activeTrackingCue = "Step back into frame"
            }
        }

        accumulate(pose: pose)
        trackSegmentReferences(pose: pose)
        updateActivityState(pose: pose, angle: angle, timestamp: timestamp)

        // REMOVED: the ready gate (isReady/consecutivePassFrames/READY_ENTER_FRAMES
        // etc.) used to block runStateMachine entirely until a separate
        // angle-range+confidence condition held for 8 frames on top of the settle
        // gate below. On exercises whose real resting position didn't cleanly
        // satisfy that condition (tricep pushdown, shoulder press) it could get
        // stuck indefinitely — "stand still to activate" that never resolved.
        // Tracking now starts immediately on entering ACTIVE. Rep ENTRY is gated
        // by two things inside runStateMachine's .atTop case: the settle gate
        // (hold above exitThreshold for SETTLE_FRAMES before the first rep can
        // enter — replaces what the ready gate did) and activityState ==
        // .suppressed (walk-away/approach/receding/inactivity — see
        // updateActivityState). The suppression check is a genuine block now;
        // it silently was not for a while (see the guard's own comment) —
        // that's why suppression-related fixes kept not holding.
        runStateMachine(pose: pose, angle: angle, timestamp: timestamp)

        let snapshot      = currentMetricSnapshot(pose: pose)
        let outOfPlaneCue = currentOutOfPlaneCue(pose: pose)
        onDebugStats?(EngineDebugStats(primaryAngle: angle, phase: phaseLabel(),
                                       isReady: true, formMetrics: snapshot,
                                       outOfPlaneCue: outOfPlaneCue))
    }

    func notePersonMissing(timestamp: Date) {
        if enginePhase == .active {
            // Abandon any in-progress rep once Vision has found no person at all
            // for def.missingPersonGraceFrames consecutive frames — see that
            // field's doc comment (ExerciseDefinition.swift) for the root
            // cause this replaced (a single-frame, zero-debounce abandon that
            // was killing every tricep rep). A sustained gap is still treated
            // as unambiguous; this only filters a brief, exercise-normal miss.
            consecutiveMissingFrames = min(consecutiveMissingFrames + 1, def.missingPersonGraceFrames + 5)

            // FLOOR EXERCISES (edgeGuardEnabled == false: sit-up) lose the WHOLE
            // person for a stretch at the top of EVERY rep — folded up, filmed
            // from the floor. That vanish is part of the rep, not a walk-away,
            // so for these: no "come back in frame" nag, and NEVER bounce back
            // to the setup screen (the user can't be accidentally walking off
            // mid sit-up; a genuinely abandoned set is still caught by
            // inactivity suppression). Everything else keeps the old behaviour.
            let forgiveFloorLoss = !def.edgeGuardEnabled

            if !forgiveFloorLoss {
                trackGoneFrames = min(trackGoneFrames + 1, 200)
                if trackGoneFrames >= 6 { activeTrackingCue = "Step back into frame" }
            }

            if repPhase == .inRep, consecutiveMissingFrames >= def.missingPersonGraceFrames {
                repPhase = .atTop
                resetRepState()
                let msg = "[ACTIVITY] rep abandoned — person left frame (\(consecutiveMissingFrames) consecutive missing frames)"
                NSLog("[Engine] [%@] %@", def.id, msg)
                onDebugLog?(msg)
            }

            if setupLossStart == nil { setupLossStart = timestamp }
            let gone = timestamp.timeIntervalSince(setupLossStart!)
            if gone >= Self.LEAVE_TIMEOUT, !forgiveFloorLoss {
                NSLog("[Engine] [%@] Person gone %.1fs — returning to SETUP", def.id, gone)
                enginePhase           = .setup
                setupPhaseState       = .pending
                setupLossStart        = nil
                repPhase              = .waitingForReady
                resetCalibrationState(keepDerived: false)
                onSetupUpdate?(SetupStatus(allJointsVisible: false, holdProgress: 0.0,
                                           passed: false, hint: "Get back in frame"))
            }
        } else {
            if case .holding = setupPhaseState {
                NSLog("[Engine] [%@] Setup: person left — hold reset", def.id)
                setupPhaseState = .pending
            }
            onSetupUpdate?(SetupStatus(allJointsVisible: false, holdProgress: 0.0,
                                       passed: false, hint: "Get in frame"))
        }
        handleNoPose(timestamp: timestamp)
    }

    // ─── Setup phase ──────────────────────────────────────────────────────────

    private func runSetupCheck(pose: Pose, timestamp: Date) {
        guard def.cameraSetup != nil else {
            transitionFromSetup()
            onSetupUpdate?(SetupStatus(allJointsVisible: true, holdProgress: 1.0,
                                       passed: true, hint: ""))
            return
        }

        // FIX 1 — "ready" now means "I can COUNT this exercise's reps", not "a
        // body is in frame". The gate is the REP METRIC's own joints, checked
        // exactly the bestSide/average/minimum/maximum way counting checks them
        // (isMetricReliable) — so ONE visible side is enough, mirroring how the
        // rep FSM actually works. The old gate used a hand-authored
        // cameraSetup.requiredJoints list that frequently demanded BOTH sides
        // (face pull, curl, squat, lat pulldown…) — impossible from a side-on
        // angle where the far limb is occluded, so setup never passed and 0
        // reps counted (confirmed by a side-on face-pull video log: near arm
        // 0.6-0.75 conf, far arm stuck ~0.12, setup waiting on the far arm
        // forever). measure() already succeeded (ingest guards on it before
        // calling this), so this is purely the confidence + edge check.
        let metricReliable = isMetricReliable(def.repMetric, pose: pose,
                                              minConf: Self.SETUP_JOINT_MIN_CONF)
        // Same edge-margin guard the ACTIVE path uses, on the same joints —
        // and only PRESENT joints trip it (isNearFrameEdge skips anything below
        // kMinConf), so an occluded far limb can't block. Floor exercises
        // (edgeGuardEnabled == false) opt out, consistent with ACTIVE.
        let edgeClear = !def.edgeGuardEnabled ||
            !isNearFrameEdge(pose: pose, joints: def.repMetric.referencedJoints())

        let allVisible = metricReliable && edgeClear
        let missingJoints: [Joint] = allVisible ? [] :
            def.repMetric.referencedJoints().filter {
                (pose[$0]?.confidence ?? 0) < Self.SETUP_JOINT_MIN_CONF
            }

        var holdProgress: Double = 0.0

        if allVisible {
            setupHoldBadFrames = 0
            switch setupPhaseState {
            case .pending:
                NSLog("[Engine] [%@] Setup: all joints visible — starting %.0fs hold",
                      def.id, Self.SETUP_HOLD_DURATION)
                // NSLog-only messages in this function are invisible on Windows (no
                // Xcode/Console) — the same failure mode that made a whole video
                // analysis pass show zero trace of anything. Mirrored to onDebugLog
                // so recap.tsx's debug panel actually shows SETUP transitions.
                onDebugLog?("[SETUP] \(def.id) rep metric trackable — starting \(Int(Self.SETUP_HOLD_DURATION))s hold " +
                            "at timestamp=\(timestamp.timeIntervalSince1970)")
                for joint in def.repMetric.referencedJoints() {
                    let conf = pose[joint]?.confidence ?? 0
                    NSLog("[Engine] [%@]   %@: conf=%.2f x=%.2f y=%.2f",
                          def.id, "\(joint)", conf,
                          Double(pose[joint]?.x ?? 0), Double(pose[joint]?.y ?? 0))
                }
                setupPhaseState = .holding(startTime: timestamp)
                holdProgress    = 0.0

            case .holding(let start):
                let elapsed = timestamp.timeIntervalSince(start)
                holdProgress = min(1.0, elapsed / Self.SETUP_HOLD_DURATION)
                // Per-frame trace of the hold timer itself — this is the direct
                // test of the timestamp-mismatch hypothesis: elapsed should climb
                // smoothly to 2.0 in lockstep with real frames arriving. A negative
                // or wildly jumping value here means the timestamp fed into
                // engine.ingest() is still broken, not the settle/rep logic below it.
                onDebugLog?("[SETUP-TRACE] \(def.id) elapsed=\(String(format: "%.4f", elapsed)) " +
                            "holdProgress=\(String(format: "%.2f", holdProgress)) " +
                            "start=\(start.timeIntervalSince1970) now=\(timestamp.timeIntervalSince1970)")
                if elapsed >= Self.SETUP_HOLD_DURATION {
                    NSLog("[Engine] [%@] Setup PASSED", def.id)
                    onDebugLog?("[SETUP] \(def.id) PASSED — entering ACTIVE")
                    onSetupUpdate?(SetupStatus(allJointsVisible: true, holdProgress: 1.0,
                                               passed: true, hint: ""))
                    transitionFromSetup()
                    return
                }
            }
        } else {
            setupHoldBadFrames += 1
            if case .holding(let start) = setupPhaseState,
               setupHoldBadFrames < Self.SETUP_HOLD_TOLERANCE {
                // Brief flicker during the hold (marginal joint confidence) —
                // keep the 2s timer running rather than restarting it. The next
                // good frame's .holding case picks up where it left off.
                holdProgress = min(1.0, timestamp.timeIntervalSince(start) / Self.SETUP_HOLD_DURATION)
                onDebugLog?("[SETUP-TRACE] \(def.id) hold flicker \(setupHoldBadFrames)/\(Self.SETUP_HOLD_TOLERANCE) " +
                            "— missing [\(missingJoints.map { "\($0)" }.joined(separator: ","))], timer held")
            } else {
                if case .holding = setupPhaseState {
                    NSLog("[Engine] [%@] Setup: hold broken — missing [%@]",
                          def.id, missingJoints.map { "\($0)" }.joined(separator: ","))
                    onDebugLog?("[SETUP] \(def.id) hold broken — missing [\(missingJoints.map { "\($0)" }.joined(separator: ","))]")
                } else {
                    onDebugLog?("[SETUP-TRACE] \(def.id) pending — missing [\(missingJoints.map { "\($0)" }.joined(separator: ","))]")
                }
                setupPhaseState = .pending
                holdProgress    = 0.0
            }
        }

        // Hint: if the rep signal is trackable but a tracked joint sits on the
        // frame edge, say so directly; otherwise hand positionGuidance the
        // joints that are actually too weak so it can coach on framing.
        let hint: String = allVisible ? ""
            : (metricReliable ? "Back up a bit"
                              : positionGuidance(pose: pose, missing: missingJoints))
        onSetupUpdate?(SetupStatus(allJointsVisible: allVisible, holdProgress: holdProgress,
                                   passed: false, hint: hint))
    }

    // Called when setup passes — goes straight to ACTIVE. If def.calibration is
    // configured, its sample buffers are reset here but collection now happens
    // passively off real completed reps (see feedPassiveCalibration) instead of
    // a separate blocking phase.
    //
    // BUG FIX: this used to leave activityState/torsoRefBaseline untouched, which only
    // matters the FIRST time (both already start clean from reset()). But when a user
    // steps fully out of frame for ≥LEAVE_TIMEOUT, notePersonMissing() force-returns
    // enginePhase to .setup WITHOUT touching activityState or the torso baseline. If
    // they re-pass SETUP at a different distance/angle, the stale pre-departure
    // baseline could permanently block the resume check (torsoOk never satisfied) —
    // and if they'd left while already suppressed, that state carried over too, so
    // isReady/rep counting could stay silently gated after they were clearly back.
    // Resetting here guarantees every entry into ACTIVE starts from a clean baseline.
    private func transitionFromSetup() {
        resetActivityState()
        // DEFENSIVE FIX (investigating Issue 1 — "stop mid-session and
        // restart" double-counting): this already resets activityState for
        // exactly this reason ("Resetting here guarantees every entry into
        // ACTIVE starts from a clean baseline" — see the comment above this
        // function), but settle/rep state was NOT included. A stop that's
        // long enough to trip notePersonMissing's LEAVE_TIMEOUT (3s) returns
        // enginePhase to .setup WITHOUT clearing hasSettled/settleCandidateTop
        // or repMinAngle/repTopValue/exitConfirmCount — a real gap, though not
        // yet confirmed as THE mechanism behind the reported double-count
        // (no on-device log of this exact sequence yet — see the report).
        // Closing it regardless since stale settle/rep state surviving a
        // SETUP round-trip is clearly not intended, matching how
        // resetActivityState() is already handled here.
        resetSettleState()
        resetRepState()
        if let config = def.calibration {
            calibRepCount   = 0
            calibRestBuf    = []
            calibPeakAngles = []
            NSLog("[Engine] [%@] Entering ACTIVE — calibrating silently over first %d reps",
                  def.id, config.repsNeeded)
            onCalibrationUpdate?(CalibrationStatus(repsCompleted: 0,
                                                   repsNeeded: config.repsNeeded,
                                                   passed: false))
        }
        enginePhase = .active
    }


    // Same edge-margin concept as missingSetupJoints, applied during ACTIVE
    // tracking — see the framesSincePoseGap call site in ingest() for why.
    private func isNearFrameEdge(pose: Pose, joints: [Joint]) -> Bool {
        for joint in joints {
            guard let p = pose[joint], p.confidence >= kMinConf else { continue }
            let x = Double(p.x), y = Double(p.y)
            if x < Self.SETUP_EDGE_MARGIN || x > 1 - Self.SETUP_EDGE_MARGIN ||
               y < Self.SETUP_EDGE_MARGIN || y > 1 - Self.SETUP_EDGE_MARGIN {
                return true
            }
        }
        return false
    }

    // Real-time positioning coaching for SETUP. Works off the pose Vision
    // already produced this frame: the bounding box of every joint it can see
    // (not just the required ones), plus a coarse facing estimate from
    // shoulder-width vs torso-height. Returns "" when there's nothing useful
    // to say (all required joints visible, or the frame's fine) — the JS side
    // then shows the static one-line instruction.
    //
    // `missing` is the required-joint list that failed the visibility/edge
    // check (see missingSetupJoints). Empty `missing` short-circuits to "" so
    // "all visible → just hold still" behaviour is unchanged.
    private func positionGuidance(pose: Pose, missing: [Joint]) -> String {
        if missing.isEmpty { return "" }

        let facing = def.cameraSetup?.facing ?? .any
        // Size/edge/facing heuristics only make sense for an upright, full-body
        // exercise. Floor exercises (.any) legitimately have a short vertical
        // span and a body running edge-to-edge — skip those checks for them.
        let standing = facing != .any

        var xs: [Double] = []
        var ys: [Double] = []
        for j in Joint.allCases {
            guard let p = pose[j], p.confidence >= Self.SETUP_JOINT_MIN_CONF else { continue }
            xs.append(Double(p.x)); ys.append(Double(p.y))
        }
        guard xs.count >= 3 else { return "Get in frame" }

        let minX = xs.min()!, maxX = xs.max()!
        let minY = ys.min()!, maxY = ys.max()!
        let spanX = maxX - minX, spanY = maxY - minY
        let cx = (minX + maxX) / 2

        if standing {
            // Whole visible body is small → too far away.
            if spanY < 0.42 && spanX < 0.55 { return "Come closer" }
            // Body runs off an edge → too close / partly cut off. Vision's y
            // increases upward, so y≈1 is the top of the frame.
            if minY < 0.04 || maxY > 0.97 || minX < 0.03 || maxX > 0.97 {
                return "Back up"
            }
        }

        // Off to one side (mirror-safe: centre-relative, no left/right).
        if cx < 0.28 || cx > 0.72 { return "Move to the middle" }

        // Facing the wrong way — coarse: broad shoulders vs a short torso reads
        // as "facing the camera", very narrow reads as "side-on".
        if standing,
           let ls = pose[.leftShoulder], ls.confidence >= Self.SETUP_JOINT_MIN_CONF,
           let rs = pose[.rightShoulder], rs.confidence >= Self.SETUP_JOINT_MIN_CONF {
            let shoulderW = abs(Double(ls.x) - Double(rs.x))
            let shoulderY = (Double(ls.y) + Double(rs.y)) / 2
            var torsoH = 0.30
            if let lh = pose[.leftHip], lh.confidence >= Self.SETUP_JOINT_MIN_CONF,
               let rh = pose[.rightHip], rh.confidence >= Self.SETUP_JOINT_MIN_CONF {
                torsoH = max(0.05, abs(shoulderY - (Double(lh.y) + Double(rh.y)) / 2))
            }
            let ratio = shoulderW / torsoH
            if facing == .camera && ratio < 0.28 { return "Face the camera" }
            if facing == .side   && ratio > 0.58 { return "Turn sideways" }
        }

        return "Get fully in frame"
    }

    // ─── Passive calibration ──────────────────────────────────────────────────
    //
    // Reps count from the very first one on static thresholds — there is no
    // blocking calibration step. If def.calibration is configured, the first
    // repsNeeded VALID completed reps (see completeRep) also feed these sample
    // buffers in the background; once collected, finishCalibration() derives
    // per-user repEnter/repExit thresholds that apply to every rep after that
    // point. Called with the same top/bottom values used for the [REP] log.
    private func feedPassiveCalibration(topValue: Double, peakValue: Double) {
        guard let config = def.calibration,
              calibDerivedEnter == nil,
              calibRepCount < config.repsNeeded else { return }

        calibRestBuf.append(topValue)
        calibPeakAngles.append(peakValue)
        calibRepCount += 1
        NSLog("[Engine] [%@] Passive calib sample %d/%d — top=%g peak=%g",
              def.id, calibRepCount, config.repsNeeded, topValue, peakValue)

        let passed = calibRepCount >= config.repsNeeded
        onCalibrationUpdate?(CalibrationStatus(repsCompleted: calibRepCount,
                                               repsNeeded: config.repsNeeded,
                                               passed: passed))
        if passed { finishCalibration(config: config) }
    }

    // Tracks the maximum segment-length ratio seen for each planarity check — the
    // most in-plane (side-on) moment becomes the per-user reference used later to
    // judge foreshortening. Runs every ACTIVE frame (previously only during the
    // blocking CALIBRATION phase, which delayed the reference by repsNeeded reps).
    private func trackSegmentReferences(pose: Pose) {
        for check in def.planarityChecks where check.enabled {
            if let v = Metric.segmentLengthRatio(jointA: check.jointA, jointB: check.jointB)
                             .measure(pose: pose) {
                calibratedSegmentRefs[check.id] = max(calibratedSegmentRefs[check.id] ?? 0, v)
            }
        }
    }

    private func finishCalibration(config: CalibrationConfig) {
        // One sample per real rep now (not a continuous per-frame buffer), so just
        // require at least one of each — calibRepCount already guarantees repsNeeded.
        guard !calibPeakAngles.isEmpty, !calibRestBuf.isEmpty else {
            NSLog("[Engine] [%@] Calib: insufficient data — using static thresholds", def.id)
            enginePhase = .active
            onCalibrationUpdate?(CalibrationStatus(repsCompleted: calibRepCount,
                                                   repsNeeded: config.repsNeeded,
                                                   passed: true))
            return
        }

        let avgPeak = calibPeakAngles.reduce(0, +) / Double(calibPeakAngles.count)
        let avgRest = calibRestBuf.reduce(0, +)    / Double(calibRestBuf.count)
        let range   = avgRest - avgPeak

        // Reject if range is less than 10% of rest value (not enough movement detected).
        guard avgRest > 0, range / avgRest > 0.10 else {
            NSLog("[Engine] [%@] Calib: range too small (%.4f / %.4f) — using static thresholds",
                  def.id, range, avgRest)
            enginePhase = .active
            onCalibrationUpdate?(CalibrationStatus(repsCompleted: calibRepCount,
                                                   repsNeeded: config.repsNeeded,
                                                   passed: true))
            return
        }

        calibDerivedEnter = avgRest - range * config.enterFraction
        calibDerivedExit  = avgRest - range * config.exitFraction

        NSLog("[Engine] [%@] Calib DONE: rest=%g peak=%g range=%g → enter=%g exit=%g ROM=%g (absolute)",
              def.id, avgRest, avgPeak, range,
              calibDerivedEnter!, calibDerivedExit!, def.goodROMThreshold)

        if !calibratedSegmentRefs.isEmpty {
            let segLog = calibratedSegmentRefs.sorted { $0.key < $1.key }
                .map { "\($0.key)=\(String(format: "%.3f", $0.value))" }
                .joined(separator: "  ")
            NSLog("[Engine] [%@] Calib planarity refs: %@", def.id, segLog)
        }

        enginePhase = .active
        onCalibrationUpdate?(CalibrationStatus(repsCompleted: calibRepCount,
                                               repsNeeded: config.repsNeeded,
                                               passed: true))
    }

    private func resetCalibrationState(keepDerived: Bool) {
        calibRestBuf    = []
        calibPeakAngles = []
        calibRepCount   = 0
        if !keepDerived {
            calibDerivedEnter   = nil
            calibDerivedExit    = nil
            calibratedSegmentRefs = [:]
        }
    }

    // ─── State machine ────────────────────────────────────────────────────────

    private func runStateMachine(pose: Pose, angle: Double, timestamp: Date) {
        switch repPhase {

        case .waitingForReady:
            repPhase = .atTop

        case .atTop:
            // Settle gate: block rep entry until the metric has held above exitThreshold for
            // SETTLE_FRAMES consecutive frames. Prevents the initial arm-raise into starting
            // position from registering as a rep (the motion crosses enter/exit thresholds with
            // enough swing to pass the phantom-rep guard).
            // hasSettled stays true once set — no re-settling between reps or rest periods.
            //
            // ROOT CAUSE (PRIORITY 1A, "ready flickers on early, then rep counting breaks for
            // the whole session"): repTopValue = max(repTopValue, angle) used to run
            // UNCONDITIONALLY, every frame, even BEFORE hasSettled — including frames while the
            // user is still walking into position / adjusting after SETUP passes but before they've
            // actually held still. A single anomalous reading during that window (e.g. an arm mid-
            // swing while getting set) could permanently inflate repTopValue, since it only ever
            // grows (max, never reset until the session restarts). repTopValue feeds the phantom-
            // rep guard's required-movement calculation (required = |repTopValue - goodROM| * 0.30)
            // — an inflated repTopValue makes `required` larger for every subsequent rep, and if
            // inflated enough, NO real rep can ever move far enough to clear it again. Every later
            // rep gets silently logged as "[REP] rejected ... (phantom)" — exactly "misses almost
            // every subsequent rep" for the rest of the session.
            // FIX: only start accumulating repTopValue AFTER hasSettled, seeded from the exact
            // frame settling was confirmed — discards whatever noise came before it.
            //
            // ROOT CAUSE #1 (curl/shoulder press/tricep "doesn't count until you pause and
            // go again"): SETTLE_FRAMES required 8 CONSECUTIVE frames above exitThreshold
            // with no other way to satisfy it. A user who starts their first rep immediately
            // drops below exitThreshold before accumulating 8 frames, and the .atTop case
            // returns immediately while !hasSettled — that first rep motion is entirely
            // ignored, and every following rep hits the identical problem: permanently stuck
            // until the user happens to pause with 8 clean consecutive frames between reps.
            //
            // ROOT CAUSE #2 (why the first fix — "resync on return above exitThreshold" —
            // still didn't work for curl): that fix STILL required the metric to climb back
            // above effectiveExitThreshold at least once to ever check the resync condition.
            // A continuous-tempo lifter who doesn't fully re-extend between reps (very common
            // real form — keeping tension on, not locking out every rep) may NEVER produce a
            // frame where the metric climbs back that high, so neither the original 8-frame
            // hold NOR the "resync on return" fix could ever fire — both gated on the exact
            // same condition (reaching exitThreshold) that this user's real tempo never hits.
            //
            // REAL FIX: don't require reaching back up to exitThreshold at all. Track the
            // highest angle seen so far (settleCandidateTop) as a standing "best available
            // rest reading," and the MOMENT the user shows a genuine, deliberate descent past
            // effectiveEnterThreshold — strong evidence on its own that this is real exercise
            // motion, not noise — settle immediately using that tracked peak as repTopValue.
            // Critically, this does NOT `return`: it falls through to the entry-check below in
            // the SAME frame, so this first rep is actually COUNTED instead of being wasted as
            // a silently-ignored "primer."
            if !hasSettled {
                preSettleFrameCount += 1
                settleCandidateTop = max(settleCandidateTop, angle)
                // Per-frame trace — same diagnostic purpose as .inRep's own
                // trace above, covering the PRE-settle window instead: shows
                // exactly what angle values the engine saw before it locked
                // in a "rest" anchor, which is what determines whether that
                // anchor was ever genuinely at rest or (the bug this was
                // added to catch) already mid-motion.
                onDebugLog?("[SETTLE-TRACE] \(def.id) angle=\(String(format: "%.4f", angle)) " +
                            "settleCandidateTop=\(String(format: "%.4f", settleCandidateTop)) " +
                            "framesSeen=\(preSettleFrameCount)")

                if angle > effectiveExitThreshold {
                    settledTopFrames = min(settledTopFrames + 1, Self.SETTLE_FRAMES + 2)
                    if settledTopFrames >= Self.SETTLE_FRAMES {
                        if settleCandidateAcceptable(angle) {
                            hasSettled  = true
                            repTopValue = angle
                            let msg = "[SETTLE] top stable (value=\(String(format: "%.3f", angle))) — rep counting active"
                            NSLog("[Engine] [%@] %@", def.id, msg)
                            onDebugLog?(msg)
                        } else {
                            logSettleRejection(candidate: angle, timestamp: timestamp)
                        }
                    }
                } else {
                    // Graceful decay for single-frame noise (don't hard-reset on one bad frame).
                    settledTopFrames = max(0, settledTopFrames - 1)
                }

                if !hasSettled, angle < effectiveEnterThreshold {
                    if settleCandidateAcceptable(settleCandidateTop) {
                        hasSettled  = true
                        repTopValue = settleCandidateTop
                        // DIAGNOSTIC (lat pulldown "rep 1 top=27.6 vs later reps 171/175"
                        // investigation): framesSeen tells you how many .atTop frames were
                        // actually observed before this anchor was locked in. A very low
                        // number (a handful) means the user's first descent started before
                        // the engine ever saw a genuine "arms up" reading — settleCandidateTop
                        // is legitimately whatever low value it happened to see, not a
                        // tracking/joint bug. A high number with a still-low top would point
                        // to something else (bad tracking) instead — send this line if it
                        // recurs and that distinguishes the two.
                        let msg = "[SETTLE] resynced on first real rep attempt " +
                                  "(top≈\(String(format: "%.3f", settleCandidateTop)) framesSeen=\(preSettleFrameCount)) — rep counting active"
                        NSLog("[Engine] [%@] %@", def.id, msg)
                        onDebugLog?(msg)
                    } else {
                        logSettleRejection(candidate: settleCandidateTop, timestamp: timestamp)
                    }
                }

                guard hasSettled else { return }
                // Falls through below using this SAME frame — if we just settled via the
                // resync path (angle already < effectiveEnterThreshold), the entry check
                // immediately below will correctly recognize this frame as a real rep entry.
            }

            repTopValue = max(repTopValue, angle)

            // CORE FIX (suppression was silently inert): activityState ==
            // .suppressed must block a NEW rep from entering. It never did —
            // see the ROOT CAUSE note above updateActivityState below. Every
            // walk-away/approach/receding "fix" that shipped before this
            // (suppressApproachDetection, recede detection) only ever updated
            // this variable and logged messages; nothing downstream ever
            // read it to actually stop a rep. That is why those fixes never
            // held — there was nothing wired to hold. This is the wiring.
            guard activityState != .suppressed else { return }

            // framesSincePoseGap gate: don't trust a rep ENTRY on a frame that just
            // recovered from a pose gap (step-out-of-frame, occlusion) — see the
            // var's doc comment. A garbled edge-of-frame reading could otherwise
            // spuriously dip below effectiveEnterThreshold and start a phantom rep.
            if framesSincePoseGap >= Self.MIN_FRAMES_AFTER_POSE_GAP, angle < effectiveEnterThreshold {
                repPhase      = .inRep
                repMinAngle   = angle
                repEnterValue = angle
                resetRepAccumulators()
                NSLog("[Engine] [%@] Rep entered — metric=%g top=%g (enter=%.4f)",
                      def.id, angle, repTopValue, effectiveEnterThreshold)
            }

        case .inRep:
            // Per-frame metric trace — DIAGNOSTIC for comparing what the video-
            // file path actually samples per rep against what live capture
            // sampled for the identical set (see the "video path phantom-
            // rejects real reps" investigation). Logged for every frame across
            // the whole .inRep window, which is bounded to roughly one rep's
            // real duration (a couple of seconds) even on a live session, so
            // this can't flood the log the way a continuous per-frame trace
            // over the whole session would. Logged BEFORE the pose-gap guard
            // below so a skipped/gated frame still shows up here — otherwise
            // "gaps" in the sampled range would be invisible in this trace.
            onDebugLog?("[REP-TRACE] \(def.id) angle=\(String(format: "%.4f", angle)) " +
                        "repMinAngle=\(String(format: "%.4f", repMinAngle)) " +
                        "framesSincePoseGap=\(framesSincePoseGap)")

            // Same framesSincePoseGap gate as entry, applied to BOTH the min-angle
            // tracking and the completion check — a garbled post-gap frame must not
            // corrupt repMinAngle (the recorded depth) even if it doesn't complete
            // a rep outright. Skip this frame entirely until settled.
            guard framesSincePoseGap >= Self.MIN_FRAMES_AFTER_POSE_GAP else { return }

            if angle < repMinAngle {
                repMinAngle = angle
                snapshotAtBottom(pose: pose)
            }
            guard angle > effectiveExitThreshold else {
                // Dropped back at/below exit before confirming — still genuinely
                // mid-rep, not a real return to rest. Reset the confirm count.
                exitConfirmCount = 0
                return
            }

            // CORE double-count fix — see exitConfirmCount's doc comment above.
            // Require the metric to hold above exit for several consecutive
            // frames (def.exitConfirmFrames, per-exercise) before trusting this
            // as a genuine return-to-rest, not a single-frame spike mid-rep.
            exitConfirmCount += 1
            guard exitConfirmCount >= def.exitConfirmFrames else { return }
            exitConfirmCount = 0

            do {
                guard timestamp.timeIntervalSince(lastRepTime) >= def.minRepInterval else {
                    NSLog("[Engine] [%@] Debounce — skip", def.id)
                    repPhase = .atTop
                    return
                }

                // ─ Phantom-rep guard ──────────────────────────────────────────────────
                // Rejects noise dips: a real rep must travel at least def.phantomGuardFraction
                // (default 30%, per-exercise override — see ExerciseDefinition.swift) of the
                // range from the pre-rep top to the goodROM target.
                //
                // Uses repTopValue (max seen in .atTop) not repEnterValue (crossing point)
                // because at the BOTTOM of the rep the pose metric often returns nil (elbow
                // confidence < kMinConf while close to the floor), so runStateMachine never
                // runs and repMinAngle stays equal to repEnterValue. repTopValue is always
                // well above enterThreshold (~0.40 vs 0.17), giving a real movement reading
                // even when nil frames swallow the bottom of the rep.
                let movement = repTopValue - repMinAngle
                let required = max(abs(repTopValue - effectiveROMThreshold) * def.phantomGuardFraction, 0.01)

                // SECOND GUARD (early-fire double-count root cause — shoulder press
                // reported, structural to any exercise with a similar threshold shape):
                // `required` above is scaled from repTopValue, which ALREADY banks the
                // entire repTopValue→effectiveEnterThreshold gap for free — for shoulder
                // press that gap alone (topAngle 84 → repEnterThreshold 68 = 16) already
                // clears `required` (≈8.7 at the default 30% fraction) by itself. That
                // means simply ENTERING the rep, immediately followed by a brief
                // foreshortening/noise bounce back above exitThreshold — exactly the kind
                // of blip exitConfirmFrames' consecutive-frame hold is supposed to filter,
                // but a genuine multi-frame plateau isn't distinguishable from noise by
                // frame-count alone — passes this guard and completes a bogus, shallow
                // "rep" using whatever shallow repMinAngle had been reached so far. The
                // person's real press motion is still in progress (angle still below
                // effectiveEnterThreshold), so the very next frame re-enters .inRep and
                // correctly completes a SECOND time when they actually finish — one
                // physical rep counted twice, first one early/shallow, second one real.
                // Measuring a SECOND required-movement floor from effectiveEnterThreshold
                // instead of repTopValue closes this: it can't be satisfied merely by
                // crossing into the rep, only by genuinely continuing past that point.
                // ANDed with (not replacing) the existing repTopValue-based guard above,
                // so no already-working exercise gets a weaker guard than before — this
                // can only reject MORE, never fewer, of what already passed.
                let movementPastEntry = effectiveEnterThreshold - repMinAngle
                let requiredPastEntry = max(abs(effectiveEnterThreshold - effectiveROMThreshold) * def.phantomGuardFraction, 0.01)

                guard movement >= required, movementPastEntry >= requiredPastEntry else {
                    let msg = "[REP] rejected — movement=\(String(format: "%.4f", movement)) " +
                              "(start=\(String(format: "%.4f", repTopValue)) peak=\(String(format: "%.4f", repMinAngle))) " +
                              "required=\(String(format: "%.4f", required)) " +
                              "movementPastEntry=\(String(format: "%.4f", movementPastEntry)) " +
                              "requiredPastEntry=\(String(format: "%.4f", requiredPastEntry)) (phantom)"
                    NSLog("[Engine] [%@] %@", def.id, msg)
                    onDebugLog?(msg)
                    repPhase = .atTop
                    return
                }

                // ─ Tracking-reliability gate (log-confirmed bug, this round) ───────────
                // ROOT CAUSE (lat pulldown "walked away to get phone" scored GOOD, real
                // device log: confDrops=255 on the one form check, yet the rep still
                // completed with ROM=ok): the PRIMARY rep metric only needs kMinConf
                // (0.25) to be trusted for state-machine entry/exit — a much lower bar
                // than FORM_CHECK_MIN_CONF (0.6), and nothing was checking whether the
                // primary metric's OWN readings were trustworthy across the rep as a
                // whole. A person walking away, waving an arm, still clears 0.25
                // confidence on individual frames often enough to produce threshold
                // crossings that look like a real rep, even though the tracking was
                // garbage for most of the window. This reuses the exact confDrops
                // machinery already built for form checks (see accumulate()) — applied
                // here to def.repMetric itself, and used as an actual GATE, not just a
                // diagnostic, since this exact failure is now proven, not speculative.
                // Threshold defaults to 50% — deliberately generous, only rejects
                // when tracking was unreliable for the MAJORITY of the rep, so a
                // normal brief occlusion (e.g. tricep's forearm-crossing-torso
                // moment) doesn't accidentally trip this on legitimate reps. It's
                // a per-exercise override (def.repReliabilityMaxUnreliableFraction):
                // crunch raises it because a real crunch lying flat legitimately
                // runs ~60-70% below the 0.6 confidence floor (shoulder conf tops
                // out ~0.67 lying down) — see that field's doc comment.
                if primaryTotalFrames > 0 {
                    let unreliableFraction = Double(primaryUnreliableFrames) / Double(primaryTotalFrames)
                    guard unreliableFraction <= def.repReliabilityMaxUnreliableFraction else {
                        // Per-joint min/max confidence across the whole rejected
                        // rep — see primaryJointConfMin/Max's doc comment. Tells
                        // apart "Vision never found this joint at all" (max ~0)
                        // from "Vision found it but wasn't confident enough"
                        // (max sits under FORM_CHECK_MIN_CONF but above 0).
                        let jointStr = def.repMetric.referencedJoints().map { j -> String in
                            let lo = primaryJointConfMin[j] ?? 0
                            let hi = primaryJointConfMax[j] ?? 0
                            return "\(j)=[\(String(format: "%.2f", lo))-\(String(format: "%.2f", hi))]"
                        }.joined(separator: " ")
                        let msg = "[REP] rejected — tracking unreliable for " +
                                  "\(primaryUnreliableFrames)/\(primaryTotalFrames) frames " +
                                  "(\(String(format: "%.0f", unreliableFraction * 100))%), not counted " +
                                  "| joint conf (min-max over rep): \(jointStr)"
                        NSLog("[Engine] [%@] %@", def.id, msg)
                        onDebugLog?(msg)
                        repPhase = .atTop
                        return
                    }
                }

                // ─ Movement-shape gate (Issue 1 core fix — hinge hip_drift) ────────────
                // A check marked gatesCounting: true doesn't just flag bad form, it
                // decides whether this was the target movement AT ALL. For the hinge
                // family: a lean (torso tips, hips stay put) and a back-roll (rounding
                // instead of hinging) share ONE signature — the hips never travel back
                // — which is exactly what hip_drift (normalizedHorizontalGap hip↔ankle)
                // measures. If it fails, this attempt is rejected the same way a
                // phantom-rep is: logged, NOT counted, no cue shown — not "counted as
                // bad," genuinely not registered, per the explicit ask. Value is ALWAYS
                // logged (pass or fail) via [GATE] so a calibration log captures real
                // hinges alongside leans/rolls in one session.
                for check in def.formChecks where check.enabled && check.gatesCounting {
                    let value = resolveValue(check: check)
                    let valueStr = value.map { String(format: "%.4f", $0) } ?? "nil"
                    if let v = value, check.fails(value: v) {
                        let msg = "[REP] rejected — \(check.id)=\(valueStr) — gate failed, not counted as a rep"
                        NSLog("[Engine] [%@] %@", def.id, msg)
                        onDebugLog?(msg)
                        repPhase = .atTop
                        return
                    }
                    onDebugLog?("[GATE] \(check.id)=\(valueStr) — passed")
                }

                completeRep(pose: pose, peakAngle: repMinAngle, timestamp: timestamp)
                repPhase = .atTop
            }
        }
    }

    // ─── Rep completion ───────────────────────────────────────────────────────

    private func completeRep(pose: Pose, peakAngle: Double, timestamp: Date) {
        totalReps   += 1
        lastRepTime  = timestamp

        // Validity gate: data is valid if the repMetric can be measured on this frame.
        // Uses kMinConf (0.25) via Metric.measure(), NOT readyGate.minConfidence (0.30).
        // This avoids "ADJUST POSITION" from joints irrelevant to the exercise metric
        // (e.g. hips in shoulderPress readyGate, ankles at bottom of squat).
        guard dataIsValid(pose: pose) else {
            // Already bad — nothing to override — but still feed the quality
            // engine so its frame buffer/baseline bookkeeping stays in sync
            // with every completeRep() call, same as before this hook existed.
            // Date() not `timestamp` — see the ROOT CAUSE note on the main
            // checkSwingOverride call below for why.
            _ = checkSwingOverride?(peakAngle, totalReps, Date())
            onRepDetected?(RepResult(good: false, cue: "ADJUST POSITION",
                                     primaryAngle: peakAngle, totalReps: totalReps,
                                     goodReps: goodReps, formValues: [:],
                                     planarityLog: "planarity=n/a", planarityPassed: false))
            return
        }

        // Fail-safe force-resume, kept as defense-in-depth: now that rep ENTRY
        // is itself gated on activityState != .suppressed (see runStateMachine's
        // .atTop case), a rep can no longer actually reach this point while
        // suppressed — the real un-suppress path is the torsoOk+inStartZone
        // condition in updateActivityState's .suppressed case. Left in place
        // in case a future change reopens a path to completeRep() while
        // suppressed; harmless no-op otherwise.
        if activityState == .suppressed {
            activityState      = .active
            resumeConsecFrames = 0
            let msg = "[ACTIVITY] state=active reason=forced_by_completed_rep_during_suppression"
            NSLog("[Engine] [%@] %@", def.id, msg)
            onDebugLog?(msg)
        }

        // Feed the passive calibration buffers off this valid, real rep — see
        // feedPassiveCalibration doc comment. No-ops once already calibrated.
        feedPassiveCalibration(topValue: repTopValue, peakValue: peakAngle)

        // ── Planarity gate ────────────────────────────────────────────────────────
        // If any segment was foreshortened during this rep the 2D angles are unreliable.
        // Suppress ROM verdict and GOOD status; emit the planarity cue instead.
        let enabledPlanarity = def.planarityChecks.filter { $0.enabled }
        var planarityFailCue: String? = nil
        var planParts: [String] = []

        for check in enabledPlanarity {
            let minR  = planarityMinRatios[check.id] ?? 999
            let ref   = calibratedSegmentRefs[check.id] ?? check.fallbackReferenceRatio
            let thr   = check.minRatio * ref
            let pass  = minR >= thr
            planParts.append(
                "\(check.id)=\(String(format: "%.3f", minR))" +
                "(ref=\(String(format: "%.3f", ref)) thr=\(String(format: "%.3f", thr)) \(pass ? "OK" : "FAIL"))"
            )
            if !pass && planarityFailCue == nil { planarityFailCue = check.cue }
        }

        let planarityPassed = planarityFailCue == nil
        let planDetail = planParts.isEmpty ? "n/a" : planParts.joined(separator: "  ")
        let planarityLog = (planarityPassed ? "planarity=PASS" : "planarity=FAIL") + "  " + planDetail

        if let planCue = planarityFailCue {
            NSLog("[Engine] [%@] Rep #%d PLANARITY FAIL — cue=%@ %@",
                  def.id, totalReps, planCue, planDetail)
            // Already bad — nothing to override — see the dataIsValid guard above.
            // Date() not `timestamp` — see the ROOT CAUSE note below.
            _ = checkSwingOverride?(peakAngle, totalReps, Date())
            onRepDetected?(RepResult(
                good: false, cue: planCue, primaryAngle: peakAngle,
                totalReps: totalReps, goodReps: goodReps,
                formValues: [:], planarityLog: planarityLog, planarityPassed: false
            ))
            return
        }

        let goodROM = peakAngle <= effectiveROMThreshold

        var failed:    [FormCheck]       = []
        var evaluated: [String: Double]  = [:]

        for check in def.formChecks where check.enabled {
            guard let value = resolveValue(check: check) else { continue }
            evaluated[check.id] = value
            if check.fails(value: value) { failed.append(check) }
        }

        let topFormFail = failed.sorted { $0.priority > $1.priority }.first
        let topOverride = failed.filter { $0.priority >= Self.FORM_OVERRIDE_ROM_PRIORITY }
                                .sorted { $0.priority > $1.priority }
                                .first

        var cue:    String
        var isGood: Bool

        if !goodROM {
            if let override = topOverride {
                cue    = override.cue
                isGood = false
            } else {
                cue    = def.insufficientROMCue
                isGood = false
            }
        } else if let f = topFormFail {
            cue    = f.cue
            isGood = false
        } else {
            cue    = "GOOD"
            isGood = true
        }

        // ROOT CAUSE (shoulder press "flailing gives a GOOD check"): the
        // Universal Quality Engine was already correctly detecting flailing
        // as a jerk-ratio spike (3.5-5.5x baseline on real flails, ~1x on
        // real reps — a clean separation confirmed from an on-device log) —
        // but its signal only ever reached a [UNIV] debug log, never this
        // verdict. ExerciseEngine has no rate-of-change primitive of its own
        // (only instantaneous per-frame angles), so it structurally cannot
        // detect a flail on its own — this hook is what lets the one engine
        // that CAN see it (jerk = velocity variance over the whole rep
        // window) veto a verdict the other engine can't reliably distinguish
        // from a real rep. Only checked when we were about to call it GOOD —
        // an already-bad rep has nothing to override. Checked BEFORE
        // goodReps increments below so the counter and the sent verdict are
        // always consistent (no separate reconciliation needed downstream).
        //
        // ROOT CAUSE FOUND, Issue 7 ("0 frames in window — skipped" on every
        // single rep, log-confirmed): `timestamp` here is ExerciseEngine's own
        // internal clock, which comes from ingest()'s caller
        // (ATHLTCameraModule.runPoseDetection) passing the CAMERA/CMSampleBuffer
        // timebase — Date(timeIntervalSince1970: cameraUptimeSeconds), i.e. an
        // epoch a few hours after Jan 1 1970 (matches the log's
        // windowStart_epoch/repEnd_epoch ≈ 69840-69848). That's fine for
        // EVERYTHING ExerciseEngine itself does with it (minRepInterval
        // debounce, inactivity timeouts, settle timing) since those are all
        // DURATIONS between two of its own consistently-camera-timebased
        // Dates — self-consistent, so never visibly broken. But
        // UniversalQualityEngine.ingestFrame is called separately, correctly,
        // with real Date() (wall clock, ~2026, matches the log's
        // ts_epoch≈1786377696) — and onRepCompleted's repEndTime was the ONE
        // place `timestamp` (camera timebase) crossed into that wall-clock
        // world, comparing an 1970-ish Date against a frameBuffer full of
        // 2026 Dates. The filter can never match anything → window is always
        // 0 frames → the swing-override hook has been silently unable to
        // fire since it was introduced. Fixed at all three call sites in this
        // function: pass Date() (real wall clock, matching ingestFrame) here
        // instead of `timestamp`.
        if isGood, let swingCue = checkSwingOverride?(peakAngle, totalReps, Date()) {
            isGood = false
            cue    = swingCue
            NSLog("[Engine] [%@] Rep #%d verdict overridden by swing detection: %@", def.id, totalReps, swingCue)
            onDebugLog?("[REP] #\(totalReps) verdict overridden — was GOOD, swing detected → \(swingCue)")
        }

        if isGood { goodReps += 1 }

        // [REP] log to onDebugLog → visible in JS session review.
        // top = repTopValue (max in .atTop before this rep), bottom = repMinAngle.
        // Appends raw form check values after " | " so hip deviation can be read directly
        // (e.g. "| hip_pike_l=0.021 hip_sag_l=-0.018") without NSLog access on Windows.
        let swing = repTopValue - repMinAngle
        let formLog = def.formChecks.filter(\.enabled).compactMap { ch -> String? in
            guard let v = evaluated[ch.id] else { return nil }
            let lim: Double
            switch ch.condition {
            case .greaterThan(let t): lim = t
            case .lessThan(let t):    lim = t
            }
            let tag = failed.contains { $0.id == ch.id } ? "FAIL" : "ok"
            let drops = confDrops[ch.id] ?? 0
            return "\(ch.id)=\(String(format: "%.3f", v))/lim=\(String(format: "%.3f", lim))[\(tag)]" +
                   (drops > 0 ? " \(ch.id)_confDrops=\(drops)" : "")
        }.joined(separator: " ")
        onDebugLog?("[REP] #\(totalReps) top=\(String(format: "%.1f", repTopValue)) " +
                    "bottom=\(String(format: "%.1f", repMinAngle)) " +
                    "thr=\(String(format: "%.1f", effectiveROMThreshold)) " +
                    "swing=\(String(format: "%.1f", swing)) " +
                    "ROM=\(goodROM ? "ok" : "short") cue=\(cue)" +
                    (formLog.isEmpty ? "" : " | \(formLog)"))

        let checkLog = def.formChecks.filter(\.enabled).map { ch -> String in
            let v   = evaluated[ch.id].map { String(format: "%.3f", $0) } ?? "nil"
            let lim: Double
            switch ch.condition {
            case .greaterThan(let t): lim = t
            case .lessThan(let t):    lim = t
            }
            let tag = failed.contains { $0.id == ch.id } ? "FAIL" : "ok"
            return "\(ch.id)=\(v)/lim=\(String(format: "%.3f", lim))[\(tag)]"
        }.joined(separator: " ")

        NSLog("[Engine] [%@] Rep #%d peak=%g ROM=%@ cue=%@ %d/%d | %@",
              def.id, totalReps, peakAngle, goodROM ? "ok" : "short", cue,
              goodReps, totalReps, checkLog)

        onRepDetected?(RepResult(
            good:            isGood,
            cue:             cue,
            primaryAngle:    peakAngle,
            totalReps:       totalReps,
            goodReps:        goodReps,
            formValues:      evaluated,
            planarityLog:    planarityLog,
            planarityPassed: true
        ))
    }

    // ─── Data validity gate ───────────────────────────────────────────────────
    //
    // ROOT CAUSE A fix: was checking def.readyGate.requiredJoints at minConf=0.30,
    // but metric functions use kMinConf=0.25. Joints irrelevant to the repMetric
    // (hips in shoulderPress, ankles at squat bottom) caused constant false failures.
    // Now: valid iff repMetric.measure() returns non-nil (same gate the metric uses).

    private func dataIsValid(pose: Pose) -> Bool {
        guard def.repMetric.measure(pose: pose) != nil else {
            // Log which joints dropped below kMinConf — helps diagnose false invalids.
            let joints = def.repMetric.referencedJoints()
            let low = joints.filter { (pose[$0]?.confidence ?? 0) < kMinConf }
            let failStr = low.map {
                "\($0)=\(String(format: "%.2f", pose[$0]?.confidence ?? 0))"
            }.joined(separator: " ")
            let msg = "[VALID] FAIL — repMetric nil; low-conf: \(failStr.isEmpty ? "n/a" : failStr)"
            NSLog("[Engine] [%@] %@", def.id, msg)
            onDebugLog?(msg)
            return false
        }
        return true
    }

    // ─── Form metric accumulation ─────────────────────────────────────────────

    private func resetRepAccumulators() {
        accumMax                = [:]
        accumMin                = [:]
        atBottomVal             = [:]
        planarityMinRatios      = [:]
        confDrops               = [:]
        primaryUnreliableFrames = 0
        primaryTotalFrames      = 0
        primaryJointConfMin     = [:]
        primaryJointConfMax     = [:]
    }

    // DIAGNOSTIC (Fix 5.1 investigation — tricep elbow_drift inconsistency):
    // confDrops counts, per check per rep, how many .inRep frames were
    // EXCLUDED from accumMax/Min because isReliable() failed (confidence
    // below the check's floor). throughoutMax can't be corrected by a later
    // good frame — if the real fault moment (e.g. forearm crossing torso at
    // full extension) is ALSO the moment confidence drops, the true peak
    // silently never gets recorded, and a genuinely-flared rep can read as
    // GOOD. Logged in completeRep()'s [REP] line as "<id>_confDrops=N" so a
    // sent log can show whether that's actually happening (high confDrops on
    // a reported-wrongly-GOOD rep = confirms it) or whether the value is just
    // oscillating near the 45° boundary with confDrops=0 (a different, purely
    // threshold-tuning problem instead).
    private func accumulate(pose: Pose) {
        guard repPhase == .inRep else { return }
        // Feeds the tracking-reliability gate (runStateMachine's .inRep
        // completion path) — same FORM_CHECK_MIN_CONF floor, applied to the
        // PRIMARY rep metric itself this time, not just form checks.
        primaryTotalFrames += 1
        if !isMetricReliable(def.repMetric, pose: pose, minConf: Self.FORM_CHECK_MIN_CONF) {
            primaryUnreliableFrames += 1
        }
        // See primaryJointConfMin/Max's doc comment above.
        for joint in def.repMetric.referencedJoints() {
            let conf = pose[joint]?.confidence ?? 0
            primaryJointConfMin[joint] = min(primaryJointConfMin[joint] ?? 1,  conf)
            primaryJointConfMax[joint] = max(primaryJointConfMax[joint] ?? 0,  conf)
        }
        for check in def.formChecks where check.enabled {
            guard isReliable(check: check, pose: pose) else {
                confDrops[check.id] = (confDrops[check.id] ?? 0) + 1
                continue
            }
            guard let v = check.measure(pose: pose) else { continue }
            accumMax[check.id] = max(accumMax[check.id] ?? -999, v)
            accumMin[check.id] = min(accumMin[check.id] ??  999, v)
        }
        // Track minimum segment ratio (most foreshortened moment) during rep.
        for check in def.planarityChecks where check.enabled {
            if let v = Metric.segmentLengthRatio(jointA: check.jointA, jointB: check.jointB)
                             .measure(pose: pose) {
                planarityMinRatios[check.id] = min(planarityMinRatios[check.id] ?? 999, v)
            }
        }
    }

    private func snapshotAtBottom(pose: Pose) {
        for check in def.formChecks where check.enabled {
            guard case .atBottom = check.evaluateAt else { continue }
            guard isReliable(check: check, pose: pose) else { continue }
            if let v = check.measure(pose: pose) { atBottomVal[check.id] = v }
        }
    }

    // See FORM_CHECK_MIN_CONF's doc comment — a stricter floor than the
    // repMetric/dataIsValid gate (kMinConf), specifically for values trusted
    // into a rep-long accumMax/accumMin/atBottomVal, where one bad frame can't
    // be corrected by a later good one.
    // ROOT CAUSE FOUND (Issue 7 — hip_drift=nil on every single rep, log-confirmed):
    // this used to flatten check.metric.referencedJoints() and require ALL of
    // them to individually clear FORM_CHECK_MIN_CONF. For a combinator metric
    // like HINGE_HIP_DRIFT_CHECK's average(left, right) — average of
    // normalizedHorizontalGap(leftHip,leftAnkle) and the right-side
    // equivalent — referencedJoints() returns ALL FOUR joints (both hips,
    // both ankles), so the flattened check demanded every one of them
    // simultaneously clear 0.6 confidence. But Metric.measure()'s own
    // combine() is explicitly designed to gracefully fall back to whichever
    // SINGLE side is available (see Metric.swift) — for any side-on exercise
    // (which is EXACTLY what average/bestSide combinators over left+right
    // joints exist for), the far side is routinely lower-confidence by
    // design. The old isReliable() defeated that fallback entirely, requiring
    // both sides at once — which for a genuinely side-on hinge/tricep camera
    // angle is close to impossible, hence nil on literally every rep.
    // FIX: mirror Metric.measure()'s own combinator structure instead of
    // flattening. average/minimum/maximum are reliable if EITHER branch is
    // (same OR-fallback combine() already implements); bestSide is reliable
    // if EITHER named side's own joint list clears the floor (mirroring how
    // bestSide.measure() itself picks a side). Only a true leaf primitive
    // requires ALL of its own directly-referenced joints — that part of the
    // original logic was correct, it just needs to apply per-branch, not
    // flattened across the whole tree.
    private func isReliable(check: FormCheck, pose: Pose) -> Bool {
        let floor = check.formCheckMinConf ?? Self.FORM_CHECK_MIN_CONF
        return isMetricReliable(check.metric, pose: pose, minConf: floor)
    }

    private func isMetricReliable(_ metric: Metric, pose: Pose, minConf: Float) -> Bool {
        switch metric {
        case let .average(l, r),
             let .minimum(l, r),
             let .maximum(l, r):
            return isMetricReliable(l, pose: pose, minConf: minConf) || isMetricReliable(r, pose: pose, minConf: minConf)
        case let .bestSide(_, _, leftJoints, rightJoints):
            let leftOk  = leftJoints.allSatisfy  { (pose[$0]?.confidence ?? 0) >= minConf }
            let rightOk = rightJoints.allSatisfy { (pose[$0]?.confidence ?? 0) >= minConf }
            return leftOk || rightOk
        default:
            return metric.referencedJoints().allSatisfy {
                (pose[$0]?.confidence ?? 0) >= minConf
            }
        }
    }

    private func resolveValue(check: FormCheck) -> Double? {
        switch check.evaluateAt {
        case .atBottom:      return atBottomVal[check.id]
        case .throughoutMax: return accumMax[check.id]
        case .throughoutMin: return accumMin[check.id]
        }
    }

    private func currentMetricSnapshot(pose: Pose) -> [String: Double] {
        var result: [String: Double] = [:]
        for check in def.formChecks where check.enabled {
            if let v = check.measure(pose: pose) { result[check.id] = v }
        }
        return result
    }

    // ─── Inactivity reset ─────────────────────────────────────────────────────

    private func handleNoPose(timestamp: Date) {
        // FIX — a 1-2 frame measure()==nil blip (a joint's confidence dipping
        // for a frame: routine when a sit-up folds and briefly hides the near
        // shoulder, or an arm crosses the torso) no longer nukes
        // framesSincePoseGap. Nuking it opened a ~0.5s window where no rep
        // could enter OR complete, and repMinAngle stopped updating — so the
        // deep frames of every rep after the first went unrecorded and the rep
        // failed the phantom guard as "barely past enter". Now it takes
        // POSE_GAP_CONFIRM_FRAMES consecutive missing frames to count as a real
        // gap. noPoseStreak is cleared on any valid frame (ingest ACTIVE path).
        noPoseStreak += 1
        if noPoseStreak >= Self.POSE_GAP_CONFIRM_FRAMES { framesSincePoseGap = 0 }

        let elapsed = timestamp.timeIntervalSince(lastValidPoseTime)
        guard lastValidPoseTime != .distantPast,
              elapsed > inactivityTimeout else { return }
        if repPhase == .inRep {
            NSLog("[Engine] [%@] Inactivity reset after %.1fs", def.id, elapsed)
        }
        repPhase = .atTop
        resetRepState()
    }

    // ── Walk-away suppression ─────────────────────────────────────────────────

    private func updateActivityState(pose: Pose, angle: Double, timestamp: Date) {
        // Build torso-scale baseline during the first TORSO_BASELINE_FRAMES of ACTIVE phase.
        // Uses max over the window so the baseline reflects the user's closest natural position;
        // the approach threshold is then relative to a position the user actually held.
        if let ref = torsoReference(pose: pose) {
            torsoRefCurrent = ref
            if torsoRefBaselineFrames < Self.TORSO_BASELINE_FRAMES {
                torsoRefBaseline = max(torsoRefBaseline ?? 0.0, ref)
                torsoRefBaselineFrames += 1
            }
        }

        switch activityState {
        case .active:
            // Approach: torso reference has grown significantly above baseline (user walking closer).
            //
            // ROOT CAUSE (hinge family false-positive): torsoReference is the 2D shoulder-hip
            // distance in-frame — a proxy for camera distance ONLY if the torso's ANGLE to the
            // camera stays roughly constant. A hip-hinge's entire movement IS the torso rotating
            // from vertical to horizontal in the camera's view plane; real-world hinging isn't
            // perfectly planar and Vision's landmark estimate drifts more at extreme bent-over
            // angles, so the rotation itself inflates torsoRef exactly like walking closer would.
            //
            // A first fix gated this to repPhase != .inRep (only evaluate at rest) plus
            // consecutive-frame hysteresis, matching the inactivity check below and every other
            // gate in this file. On-device data showed it's still not enough — even the
            // "at rest" torsoRef reading for this family doesn't reliably return within
            // APPROACH_SCALE_FACTOR of the original standing baseline (natural rep-to-rep
            // posture variance, cumulative Vision drift). Torso-scale approach detection is
            // fundamentally unreliable for any exercise whose primary movement is a large
            // torso-angle change, not just mid-rep — so exercises that need it opt out entirely
            // via def.suppressApproachDetection (see ExerciseDefinition.swift). Currently: the
            // hip-hinge family. The repPhase gate + hysteresis stays for every other exercise.
            if !def.suppressApproachDetection, repPhase != .inRep {
                if let baseline = torsoRefBaseline,
                   torsoRefBaselineFrames >= Self.TORSO_BASELINE_FRAMES,
                   torsoRefCurrent > baseline * Self.APPROACH_SCALE_FACTOR {
                    approachConsecFrames = min(approachConsecFrames + 1, Self.APPROACH_ENTER_FRAMES + 5)
                    if approachConsecFrames >= Self.APPROACH_ENTER_FRAMES {
                        suppressAndLog(reason: "approach " +
                                       "torsoRef=\(String(format: "%.3f", torsoRefCurrent)) " +
                                       "baseline=\(String(format: "%.3f", baseline))")
                        approachConsecFrames = 0
                        return
                    }
                } else {
                    approachConsecFrames = max(0, approachConsecFrames - 1)
                }
            }
            // Receding (walking away) — see RECEDE_SCALE_FACTOR's doc comment.
            // SAFETY REVISION: originally shipped NOT gated behind
            // suppressApproachDetection, reasoned as "a different failure mode"
            // from the GROWING false-positive that flag exists for. That
            // reasoning was never device-verified, and it stopped being safe
            // the moment suppression became a REAL block on rep counting (see
            // the guard in runStateMachine's .atTop case) — before that fix,
            // this check firing was harmless (suppression didn't actually stop
            // anything); now it can genuinely zero out a whole set. Tricep is
            // exactly the exercise that (a) already has suppressApproachDetection
            // = true because its torso-scale signal is known-unreliable
            // (leaning into the cable stack), and (b) is the one reporting zero
            // reps again — an unverified, ungated recede check is a live
            // suspect. Now gated the same as approach: exercises that already
            // distrust torso-scale for the GROWING case distrust it for the
            // SHRINKING case too until proven otherwise with real data.
            if !def.suppressApproachDetection, repPhase != .inRep,
               let baseline = torsoRefBaseline,
               torsoRefBaselineFrames >= Self.TORSO_BASELINE_FRAMES,
               torsoRefCurrent < baseline * Self.RECEDE_SCALE_FACTOR {
                recedeConsecFrames = min(recedeConsecFrames + 1, Self.RECEDE_ENTER_FRAMES + 5)
                if recedeConsecFrames >= Self.RECEDE_ENTER_FRAMES {
                    suppressAndLog(reason: "receding " +
                                   "torsoRef=\(String(format: "%.3f", torsoRefCurrent)) " +
                                   "baseline=\(String(format: "%.3f", baseline))")
                    recedeConsecFrames = 0
                    return
                }
            } else {
                recedeConsecFrames = max(0, recedeConsecFrames - 1)
            }
            // Inactivity: at least one rep done, not mid-rep, long gap since last rep.
            if totalReps > 0,
               repPhase != .inRep,
               timestamp.timeIntervalSince(lastRepTime) >= def.inactivityRepGapSec {
                suppressAndLog(reason: "inactivity gap=\(String(format: "%.1f", timestamp.timeIntervalSince(lastRepTime)))s")
            }

        case .suppressed:
            // Resume when torso scale has normalised AND metric is back in the start zone.
            // "Start zone" = metric >= 75% of topAngle (user has arm extended toward start position).
            let torsoOk: Bool = {
                guard let baseline = torsoRefBaseline else { return true }
                return torsoRefCurrent <= baseline * Self.APPROACH_RELEASE_MULT
            }()
            let inStartZone = angle >= def.topAngle * 0.75

            // ROOT CAUSE: this counter used to hard-reset to 0 on any single failing
            // frame — the exact bug already fixed for the ready gate (FIX 2, above) and
            // the settle gate. At ~10fps effective sampling (frameSkip=3 of 30fps), one
            // noisy Vision frame (confidence dip, motion blur) was enough to keep this
            // permanently at 0, so RESUME_CONSEC_FRAMES (15 consecutive clean frames)
            // was almost never reached in practice — suppression looked "stuck".
            // Fix: graceful decay, matching every other hysteresis counter in this file.
            if torsoOk && inStartZone {
                resumeConsecFrames = min(resumeConsecFrames + 1, Self.RESUME_CONSEC_FRAMES + 5)
            } else {
                resumeConsecFrames = max(0, resumeConsecFrames - 1)
            }

            // [ACTIVITY] diagnostic — always emitted (throttled ~3/sec) while suppressed,
            // so a stuck resume is debuggable instead of silent.
            let nowLog = timestamp.timeIntervalSinceReferenceDate
            if nowLog - lastActivityLogTime >= 0.33 {
                lastActivityLogTime = nowLog
                let baselineStr = torsoRefBaseline.map { String(format: "%.3f", $0) } ?? "n/a"
                let releaseStr  = torsoRefBaseline.map { String(format: "%.3f", $0 * Self.APPROACH_RELEASE_MULT) } ?? "n/a"
                let msg = "[ACTIVITY] suppressed reason=\(suppressionReason) " +
                          "torso=\(String(format: "%.3f", torsoRefCurrent)) baseline=\(baselineStr) releaseMax=\(releaseStr) torsoOk=\(torsoOk) " +
                          "metric=\(String(format: "%.1f", angle)) needMetric>=\(String(format: "%.1f", def.topAngle * 0.75)) inStartZone=\(inStartZone) " +
                          "resumeFrames=\(resumeConsecFrames)/\(Self.RESUME_CONSEC_FRAMES)"
                NSLog("[Engine] [%@] %@", def.id, msg)
                onDebugLog?(msg)
            }

            if resumeConsecFrames >= Self.RESUME_CONSEC_FRAMES {
                activityState = .active
                resumeConsecFrames = 0
                let msg = "[ACTIVITY] state=active reason=returned_to_start_position"
                NSLog("[Engine] [%@] %@", def.id, msg)
                onDebugLog?(msg)
            }
        }
    }

    private func suppressAndLog(reason: String) {
        activityState = .suppressed
        suppressionReason = reason
        resumeConsecFrames = 0
        approachConsecFrames = 0
        recedeConsecFrames = 0
        // Abandon any in-progress rep cleanly so stale accumulators don't carry over.
        if repPhase == .inRep {
            repPhase = .atTop
            resetRepState()
        }
        let msg = "[ACTIVITY] state=suppressed reason=\(reason)"
        NSLog("[Engine] [%@] %@", def.id, msg)
        onDebugLog?(msg)
    }

    private func resetActivityState() {
        activityState          = .active
        suppressionReason      = ""
        torsoRefBaseline       = nil
        torsoRefBaselineFrames = 0
        torsoRefCurrent        = 0.0
        resumeConsecFrames     = 0
        approachConsecFrames   = 0
        recedeConsecFrames     = 0
    }

    private func resetSettleState() {
        hasSettled          = false
        settledTopFrames    = 0
        settleCandidateTop  = -.infinity
        preSettleFrameCount = 0
    }

    private func resetRepState() {
        repMinAngle       = 999
        repTopValue       = 0
        repEnterValue     = 0
        exitConfirmCount  = 0
        resetRepAccumulators()
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    // Returns the cue of the first foreshortened segment, or nil if all in-plane.
    private func currentOutOfPlaneCue(pose: Pose) -> String? {
        for check in def.planarityChecks where check.enabled {
            guard let current = Metric.segmentLengthRatio(jointA: check.jointA, jointB: check.jointB)
                                      .measure(pose: pose) else { continue }
            let reference = calibratedSegmentRefs[check.id] ?? check.fallbackReferenceRatio
            if current < check.minRatio * reference { return check.cue }
        }
        return nil
    }

    private func phaseLabel() -> String {
        switch enginePhase {
        case .setup: return "setup"
        case .active:
            switch repPhase {
            case .waitingForReady: return "waiting"
            case .atTop:           return "top"
            case .inRep:           return "inRep"
            }
        }
    }
}
