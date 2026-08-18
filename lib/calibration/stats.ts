/**
 * lib/calibration/stats.ts
 *
 * Robust statistics for the calibration tool. Small sample sizes (3-8 demo reps)
 * and constant far-side occlusion (impossible near-zero angles, collapsed
 * distance ratios) rule out naive min/max/average — one bad frame would poison
 * the whole calibration. Instead:
 *
 *   1. Hard plausibility filter — reject values outside a physically sane range
 *      for the metric's TYPE (e.g. a jointAngle can never be outside [0, 180]).
 *   2. Median + MAD (median absolute deviation) outlier rejection — robust to
 *      small N, unlike mean/stddev which a single occlusion spike distorts.
 *
 * Every rejection is reported (value + reason) so calibration isn't a black box.
 */

import type { MetricDef } from '../../constants/exerciseDefinitions';

// ─── Core robust stats ─────────────────────────────────────────────────────────

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Median absolute deviation, scaled by 1.4826 so it estimates the standard
// deviation for normally-distributed data — the standard "robust sigma".
const MAD_CONSISTENCY_CONST = 1.4826;

export function medianAbsoluteDeviation(values: number[], med: number): number {
  const deviations = values.map(v => Math.abs(v - med));
  return median(deviations);
}

export interface OutlierRejectionResult {
  kept:     number[];
  rejected: { value: number; reason: string }[];
  median:   number;
}

const MAD_REJECT_K = 3; // reject anything beyond 3 scaled-MAD from the median

/**
 * Rejects implausible values (outside `plausibleRange`) first, then rejects
 * statistical outliers via median + MAD. With fewer than 2 plausible samples,
 * robust stats are meaningless — everything plausible is kept as-is.
 */
export function rejectOutliers(
  rawValues: number[],
  plausibleRange?: [number, number],
): OutlierRejectionResult {
  const rejected: { value: number; reason: string }[] = [];

  const plausible = rawValues.filter(v => {
    if (!Number.isFinite(v)) {
      rejected.push({ value: v, reason: 'not a finite number' });
      return false;
    }
    if (plausibleRange && (v < plausibleRange[0] || v > plausibleRange[1])) {
      rejected.push({
        value: v,
        reason: `outside physically plausible range [${plausibleRange[0]}, ${plausibleRange[1]}]`,
      });
      return false;
    }
    return true;
  });

  if (plausible.length < 2) {
    return { kept: plausible, rejected, median: median(plausible) };
  }

  const med = median(plausible);
  const madRaw = medianAbsoluteDeviation(plausible, med);
  const scaledMad = madRaw * MAD_CONSISTENCY_CONST;

  // Degenerate case: all samples (near-)identical — nothing to reject statistically.
  if (scaledMad < 1e-6) {
    return { kept: plausible, rejected, median: med };
  }

  const kept: number[] = [];
  for (const v of plausible) {
    const distance = Math.abs(v - med);
    if (distance > MAD_REJECT_K * scaledMad) {
      rejected.push({
        value: v,
        reason: `outlier — ${distance.toFixed(1)} from median ${med.toFixed(1)} ` +
                `(> ${MAD_REJECT_K}× robust spread ${scaledMad.toFixed(1)}), likely occlusion`,
      });
    } else {
      kept.push(v);
    }
  }

  return { kept, rejected, median: median(kept.length > 0 ? kept : plausible) };
}

// ─── Physical plausibility ranges per metric type ──────────────────────────────
//
// Loose sanity fences, not precision bounds — the MAD rejection above does the
// real outlier work. These just catch flatly-impossible readings (NaN-adjacent,
// negative ratios, angles outside [0,180]) before they can even enter the
// median/MAD computation and skew it.

export function plausibleRangeForMetric(metric: MetricDef): [number, number] {
  switch (metric.type) {
    case 'jointAngle':
      return [0, 180];
    case 'lineVsVertical':
    case 'lineVsHorizontal':
      return [0, 90];
    case 'verticalGap':
      return [-1.5, 1.5];
    case 'normalizedVerticalGap':
    case 'bodyRelativeGap':
      return [-5, 5];
    case 'bodyRelativeDeviation':
      return [0, 5];
    case 'deviationFromLine':
      return [0, 2];
    case 'signedDeviationFromLine':
      return [-2, 2];
    case 'distanceRatio':
    case 'segmentLengthRatio':
      return [0, 5];
    case 'average':
    case 'minimum':
    case 'maximum':
      return plausibleRangeForMetric(metric.left);
    case 'bestSide':
      return plausibleRangeForMetric(metric.left);
    default:
      return [-1e6, 1e6];
  }
}

// ─── Threshold suggestion math ─────────────────────────────────────────────────

export interface RangeSuggestion {
  topAngle:          number;
  repEnterThreshold: number;
  repExitThreshold:  number;
  goodROMThreshold:  number;
}

// Mirrors the native passive-calibration formula (ExerciseEngine.swift
// feedPassiveCalibration/finishCalibration): enter = rest - range*0.50,
// exit = rest - range*0.25 — same enterFraction/exitFraction convention used
// throughout constants/exerciseDefinitions.ts's CalibrationDef configs.
const ENTER_FRACTION = 0.50;
const EXIT_FRACTION  = 0.25;

export function suggestRangeThresholds(goodTopMedian: number, goodBottomMedian: number): RangeSuggestion {
  const range = goodTopMedian - goodBottomMedian;
  return {
    topAngle:          Math.round(goodTopMedian),
    repEnterThreshold: Math.round(goodTopMedian - range * ENTER_FRACTION),
    repExitThreshold:  Math.round(goodTopMedian - range * EXIT_FRACTION),
    goodROMThreshold:  Math.round(goodBottomMedian),
  };
}

export interface BoundarySuggestion {
  value:            number;
  directionMatches: boolean; // false = fault median didn't land on the expected side of good median
}

/**
 * Suggests a form-check limit as the midpoint between the good-rep cluster and
 * the demonstrated-fault cluster for the same metric. `conditionType` tells us
 * which side is "good": 'greaterThan' means the check fails when value > limit
 * (so good reps should score LOWER than the fault reps); 'lessThan' is the
 * mirror image.
 */
export function suggestBoundary(
  goodMedian: number,
  faultMedian: number,
  conditionType: 'greaterThan' | 'lessThan',
): BoundarySuggestion {
  const midpoint = (goodMedian + faultMedian) / 2;
  const directionMatches = conditionType === 'greaterThan'
    ? faultMedian > goodMedian
    : faultMedian < goodMedian;
  return { value: Math.round(midpoint * 100) / 100, directionMatches };
}
