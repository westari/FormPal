import Foundation

// ─── ExerciseDefinition JSON parser ──────────────────────────────────────────
//
// Used by setExerciseDefinition() in ATHLTCameraModule to parse a full exercise
// definition that was JSON-stringified on the JS side. The JSON schema mirrors
// the Swift types exactly — field names and joint strings match 1:1.
//
// Metric is a recursive tagged-union JSON object:
//   { "type": "jointAngle", "a": "leftShoulder", "pivot": "leftElbow", "c": "leftWrist" }
//   { "type": "minimum", "left": <metric>, "right": <metric> }
//   etc. (all Metric cases supported)
//
// Joint strings must match the Joint(string:) extension in ExerciseStandards.swift.
// On any parse failure the function returns nil and the caller falls back to the
// Swift registry definition loaded by setExercise().

extension ExerciseDefinition {

    // Returns the parsed definition and a short summary string for [DEF-LOAD] logging.
    static func parse(from dict: [String: Any]) -> (ExerciseDefinition, String)? {
        guard let id                = dict["id"]                 as? String,
              let displayName       = dict["displayName"]        as? String,
              let repMetricDict     = dict["repMetric"]          as? [String: Any],
              let repMetric         = parseMetric(repMetricDict),
              let topAngle          = dict["topAngle"]           as? Double,
              let repEnterThreshold = dict["repEnterThreshold"]  as? Double,
              let repExitThreshold  = dict["repExitThreshold"]   as? Double,
              let goodROMThreshold  = dict["goodROMThreshold"]   as? Double,
              let insufficientROMCue = dict["insufficientROMCue"] as? String,
              let minRepInterval    = dict["minRepInterval"]      as? Double else {
            return nil
        }

        let formCheckDicts = dict["formChecks"] as? [[String: Any]] ?? []
        let formChecks = formCheckDicts.compactMap { parseFormCheck($0) }

        guard let rgDict    = dict["readyGate"] as? [String: Any],
              let readyGate = parseReadyGate(rgDict) else { return nil }

        let cameraSetup: CameraSetupConfig?
        if let csDict = dict["cameraSetup"] as? [String: Any] {
            cameraSetup = parseCameraSetup(csDict)
        } else {
            cameraSetup = nil
        }

        let calibration: CalibrationConfig?
        if let calDict = dict["calibration"] as? [String: Any] {
            calibration = parseCalibration(calDict)
        } else {
            calibration = nil
        }

        let planarityCheckDicts = dict["planarityChecks"] as? [[String: Any]] ?? []
        let planarityChecks = planarityCheckDicts.compactMap { parsePlanarityCheck($0) }

        let def = ExerciseDefinition(
            id:                 id,
            displayName:        displayName,
            repMetric:          repMetric,
            topAngle:           topAngle,
            repEnterThreshold:  repEnterThreshold,
            repExitThreshold:   repExitThreshold,
            goodROMThreshold:   goodROMThreshold,
            insufficientROMCue: insufficientROMCue,
            formChecks:         formChecks,
            readyGate:          readyGate,
            cameraSetup:        cameraSetup,
            calibration:        calibration,
            minRepInterval:     minRepInterval,
            planarityChecks:    planarityChecks
        )

        let metricType = repMetricDict["type"] as? String ?? "?"
        let summary = "repMetric=\(metricType) formChecks=\(formChecks.count) " +
                      "cameraSetup=\(cameraSetup != nil ? "ok" : "nil") " +
                      "calibration=\(calibration != nil ? "ok" : "nil")"

        return (def, summary)
    }

    // MARK: – Metric parser (recursive)

    private static func parseMetric(_ dict: [String: Any]) -> Metric? {
        guard let type = dict["type"] as? String else { return nil }

        switch type {

        case "jointAngle":
            guard let a     = (dict["a"]     as? String).flatMap(Joint.init(string:)),
                  let pivot = (dict["pivot"] as? String).flatMap(Joint.init(string:)),
                  let c     = (dict["c"]     as? String).flatMap(Joint.init(string:)) else { return nil }
            return .jointAngle(a: a, pivot: pivot, c: c)

        case "lineVsVertical":
            guard let from = (dict["from"] as? String).flatMap(Joint.init(string:)),
                  let to   = (dict["to"]   as? String).flatMap(Joint.init(string:)) else { return nil }
            return .lineVsVertical(from: from, to: to)

        case "lineVsHorizontal":
            guard let from = (dict["from"] as? String).flatMap(Joint.init(string:)),
                  let to   = (dict["to"]   as? String).flatMap(Joint.init(string:)) else { return nil }
            return .lineVsHorizontal(from: from, to: to)

        case "verticalGap":
            guard let upper = (dict["upper"] as? String).flatMap(Joint.init(string:)),
                  let lower = (dict["lower"] as? String).flatMap(Joint.init(string:)) else { return nil }
            return .verticalGap(upper: upper, lower: lower)

        case "normalizedVerticalGap":
            guard let upper = (dict["upper"] as? String).flatMap(Joint.init(string:)),
                  let lower = (dict["lower"] as? String).flatMap(Joint.init(string:)) else { return nil }
            return .normalizedVerticalGap(upper: upper, lower: lower)

        case "bodyRelativeGap":
            guard let a        = (dict["a"]        as? String).flatMap(Joint.init(string:)),
                  let b        = (dict["b"]        as? String).flatMap(Joint.init(string:)),
                  let axisFrom = (dict["axisFrom"] as? String).flatMap(Joint.init(string:)),
                  let axisTo   = (dict["axisTo"]   as? String).flatMap(Joint.init(string:)) else { return nil }
            return .bodyRelativeGap(a: a, b: b, axisFrom: axisFrom, axisTo: axisTo)

        case "bodyRelativeDeviation":
            guard let point    = (dict["point"]    as? String).flatMap(Joint.init(string:)),
                  let axisFrom = (dict["axisFrom"] as? String).flatMap(Joint.init(string:)),
                  let axisTo   = (dict["axisTo"]   as? String).flatMap(Joint.init(string:)) else { return nil }
            return .bodyRelativeDeviation(point: point, axisFrom: axisFrom, axisTo: axisTo)

        case "deviationFromLine":
            guard let point    = (dict["point"]    as? String).flatMap(Joint.init(string:)),
                  let lineFrom = (dict["lineFrom"] as? String).flatMap(Joint.init(string:)),
                  let lineTo   = (dict["lineTo"]   as? String).flatMap(Joint.init(string:)) else { return nil }
            return .deviationFromLine(point: point, lineFrom: lineFrom, lineTo: lineTo)

        case "signedDeviationFromLine":
            guard let point    = (dict["point"]    as? String).flatMap(Joint.init(string:)),
                  let lineFrom = (dict["lineFrom"] as? String).flatMap(Joint.init(string:)),
                  let lineTo   = (dict["lineTo"]   as? String).flatMap(Joint.init(string:)) else { return nil }
            return .signedDeviationFromLine(point: point, lineFrom: lineFrom, lineTo: lineTo)

        case "distanceRatio":
            guard let a = (dict["a"] as? String).flatMap(Joint.init(string:)),
                  let b = (dict["b"] as? String).flatMap(Joint.init(string:)) else { return nil }
            return .distanceRatio(a: a, b: b)

        case "segmentLengthRatio":
            guard let jointA = (dict["jointA"] as? String).flatMap(Joint.init(string:)),
                  let jointB = (dict["jointB"] as? String).flatMap(Joint.init(string:)) else { return nil }
            return .segmentLengthRatio(jointA: jointA, jointB: jointB)

        case "average", "minimum", "maximum":
            guard let lDict = dict["left"]  as? [String: Any],
                  let rDict = dict["right"] as? [String: Any],
                  let l     = parseMetric(lDict),
                  let r     = parseMetric(rDict) else { return nil }
            switch type {
            case "average": return .average(l, r)
            case "minimum": return .minimum(l, r)
            default:        return .maximum(l, r)
            }

        case "bestSide":
            guard let lDict = dict["left"]  as? [String: Any],
                  let rDict = dict["right"] as? [String: Any],
                  let l     = parseMetric(lDict),
                  let r     = parseMetric(rDict) else { return nil }
            let leftJoints  = (dict["leftJoints"]  as? [String] ?? []).compactMap(Joint.init(string:))
            let rightJoints = (dict["rightJoints"] as? [String] ?? []).compactMap(Joint.init(string:))
            return .bestSide(left: l, right: r, leftJoints: leftJoints, rightJoints: rightJoints)

        default: return nil
        }
    }

    // MARK: – Sub-type parsers

    private static func parseEvaluateAt(_ s: String) -> EvaluateAt? {
        switch s {
        case "atBottom":      return .atBottom
        case "throughoutMax": return .throughoutMax
        case "throughoutMin": return .throughoutMin
        default:              return nil
        }
    }

    private static func parseFormCondition(_ dict: [String: Any]) -> FormCondition? {
        guard let type  = dict["type"]  as? String,
              let value = dict["value"] as? Double else { return nil }
        switch type {
        case "greaterThan": return .greaterThan(value)
        case "lessThan":    return .lessThan(value)
        default:            return nil
        }
    }

    private static func parseFormCheck(_ dict: [String: Any]) -> FormCheck? {
        guard let id         = dict["id"]         as? String,
              let cue        = dict["cue"]         as? String,
              let metricDict = dict["metric"]      as? [String: Any],
              let metric     = parseMetric(metricDict),
              let evalStr    = dict["evaluateAt"]  as? String,
              let evalAt     = parseEvaluateAt(evalStr),
              let condDict   = dict["condition"]   as? [String: Any],
              let condition  = parseFormCondition(condDict),
              let enabled    = dict["enabled"]     as? Bool else { return nil }
        // priority: JSON integer → Swift Int. Handle rare Double-serialized integer.
        let priority: Int
        if let p = dict["priority"] as? Int { priority = p }
        else if let p = dict["priority"] as? Double { priority = Int(p) }
        else { return nil }
        return FormCheck(id: id, cue: cue, metric: metric, evaluateAt: evalAt,
                         condition: condition, priority: priority, enabled: enabled)
    }

    private static func parseReadyGate(_ dict: [String: Any]) -> ReadyGateConfig? {
        guard let min    = dict["readyAngleMin"]  as? Double,
              let max    = dict["readyAngleMax"]  as? Double,
              let joints = dict["requiredJoints"] as? [String],
              let conf   = dict["minConfidence"]  as? Double,
              let dur    = dict["stableDuration"] as? Double else { return nil }
        let parsedJoints = joints.compactMap(Joint.init(string:))
        guard parsedJoints.count == joints.count else { return nil }
        return ReadyGateConfig(readyAngleMin: min, readyAngleMax: max,
                               requiredJoints: parsedJoints,
                               minConfidence: Float(conf), stableDuration: dur)
    }

    private static func parseCameraSetup(_ dict: [String: Any]) -> CameraSetupConfig? {
        guard let instr  = dict["setupInstruction"] as? String,
              let joints = dict["requiredJoints"]   as? [String] else { return nil }
        let parsedJoints = joints.compactMap(Joint.init(string:))
        let altJoints: [Joint]? = (dict["requiredJointsAlt"] as? [String])
            .map { $0.compactMap(Joint.init(string:)) }
        return CameraSetupConfig(setupInstruction: instr,
                                 requiredJoints: parsedJoints,
                                 requiredJointsAlt: altJoints)
    }

    private static func parseCalibration(_ dict: [String: Any]) -> CalibrationConfig? {
        guard let enter = dict["enterFraction"] as? Double,
              let exit  = dict["exitFraction"]  as? Double else { return nil }
        // repsNeeded: handle integer or Double-serialized integer.
        let repsNeeded: Int
        if let n = dict["repsNeeded"] as? Int { repsNeeded = n }
        else if let n = dict["repsNeeded"] as? Double { repsNeeded = Int(n) }
        else { return nil }
        return CalibrationConfig(repsNeeded: repsNeeded, enterFraction: enter, exitFraction: exit)
    }

    private static func parsePlanarityCheck(_ dict: [String: Any]) -> PlanarityCheck? {
        guard let id       = dict["id"]                     as? String,
              let jointA   = (dict["jointA"] as? String).flatMap(Joint.init(string:)),
              let jointB   = (dict["jointB"] as? String).flatMap(Joint.init(string:)),
              let minRatio = dict["minRatio"]               as? Double,
              let cue      = dict["cue"]                    as? String,
              let fallback = dict["fallbackReferenceRatio"] as? Double else { return nil }
        let enabled = dict["enabled"] as? Bool ?? true
        return PlanarityCheck(id: id, jointA: jointA, jointB: jointB,
                              minRatio: minRatio, cue: cue,
                              fallbackReferenceRatio: fallback, enabled: enabled)
    }
}
