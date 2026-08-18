/**
 * lib/calibration/parseRepLog.ts
 *
 * Parses the engine's own per-rep debug log line (ExerciseEngine.swift
 * completeRep(), emitted via onDebugLog) — the same line formcheck.tsx's
 * SessionLogReview already parses a piece of, extended here to pull every
 * form check's raw resolved value, not just the cue.
 *
 * Format (see ExerciseEngine.swift completeRep):
 *   [REP] #3 top=160.2 bottom=88.4 thr=90.0 swing=71.8 ROM=ok cue=GOOD | back_lean=12.345/lim=30.000[ok] elbow_drift=8.221/lim=30.000[ok]
 * The " | <checks>" suffix is only present when def.formChecks has enabled entries.
 *
 * IMPORTANT: this line is only emitted when the rep passed the engine's validity
 * gate (dataIsValid) and planarity gate — a rep that fails either produces NO
 * matching line here, only the separate ATHLTCameraModule-formatted "[REP #N] ..."
 * marker (different format: no space before the '#'). The calibration screen uses
 * that distinction to detect "a rep happened but wasn't usable" — see app/calibrate.tsx.
 */

export interface ParsedCalibRep {
  repNum: number;
  top:    number;
  bottom: number;
  swing:  number;
  romOk:  boolean;
  cue:    string;
  checks: Record<string, { value: number; limit: number; failed: boolean }>;
}

const REP_LINE_RE =
  /^\[REP\] #(\d+) top=([-\d.]+) bottom=([-\d.]+) thr=([-\d.]+) swing=([-\d.]+) ROM=(ok|short) cue=(.+?)(?: \| (.*))?$/;

const CHECK_TOKEN_RE = /^([A-Za-z0-9_]+)=([-\d.]+)\/lim=([-\d.]+)\[(ok|FAIL)\]$/;

/** Returns null if `line` isn't the engine's own [REP] #N line (or fails to parse). */
export function parseRepLogLine(line: string): ParsedCalibRep | null {
  const m = line.match(REP_LINE_RE);
  if (!m) return null;

  const checks: ParsedCalibRep['checks'] = {};
  const checksSection = m[8];
  if (checksSection) {
    for (const token of checksSection.trim().split(/\s+/)) {
      const cm = token.match(CHECK_TOKEN_RE);
      if (cm) {
        checks[cm[1]] = {
          value:  parseFloat(cm[2]),
          limit:  parseFloat(cm[3]),
          failed: cm[4] === 'FAIL',
        };
      }
    }
  }

  return {
    repNum: parseInt(m[1], 10),
    top:    parseFloat(m[2]),
    bottom: parseFloat(m[3]),
    swing:  parseFloat(m[5]),
    romOk:  m[6] === 'ok',
    cue:    m[7].trim(),
    checks,
  };
}

// The ATHLTCameraModule-formatted per-rep marker: "[REP #N] GOOD ✓ ..." — note NO
// space between "REP" and "#", unlike the engine's own line above. This ALWAYS
// fires once per completed rep, even ones the engine-format line above skips
// (invalid data / planarity fail), so it's used purely as a "a rep just
// happened" boundary marker to detect reps with no usable calibration data.
const MODULE_REP_MARKER_RE = /^\[REP #(\d+)\]/;

export function parseModuleRepMarker(line: string): number | null {
  const m = line.match(MODULE_REP_MARKER_RE);
  return m ? parseInt(m[1], 10) : null;
}
