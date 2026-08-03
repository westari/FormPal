/**
 * lib/calibration/families.ts
 *
 * Detects exercise "families" — variants that share the same rep metric (and
 * therefore the same real-world thresholds) via a shared helper function or
 * constant in constants/exerciseDefinitions.ts (e.g. squatVariant() + SQUAT_REP_METRIC
 * for goblet/air/front/back/sumo squat).
 *
 * IMPORTANT: the base exercise of a family (e.g. `squat`) is hand-written in the
 * registry with its OWN inline repMetric object — structurally identical to the
 * shared constant (e.g. SQUAT_REP_METRIC) used by the variant factory, but a
 * DIFFERENT object reference. Reference equality (===) would therefore miss the
 * base exercise entirely. So membership is decided by DEEP structural equality
 * of the repMetric tree, not object identity — this also means it needs no
 * manual family list and keeps working automatically as new exercises are added,
 * regardless of whether they're built through a shared helper or hand-written.
 */

import type { ExerciseDefinitionDef, MetricDef } from '../../constants/exerciseDefinitions';

// Deep, key-order-independent equality — plain data (strings/numbers/booleans/
// arrays/objects), which is all a MetricDef tree ever contains. Order-independent
// because different authors in this file don't always write object keys in the
// same order even when the metric is semantically identical.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function metricsEqual(a: MetricDef, b: MetricDef): boolean {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

/** Every other exercise id whose repMetric is structurally identical to sourceId's. */
export function findFamilyMembers(
  allDefs: Record<string, ExerciseDefinitionDef>,
  sourceId: string,
): string[] {
  const source = allDefs[sourceId];
  if (!source) return [];
  return Object.keys(allDefs).filter(
    id => id !== sourceId && metricsEqual(allDefs[id].repMetric, source.repMetric),
  );
}

/**
 * Narrows a calibrated override so it only carries form-check fields the
 * target exercise can actually use: the target must have a formCheck with the
 * same id AND a structurally-identical metric. The rep-range fields
 * (topAngle/repEnterThreshold/repExitThreshold/goodROMThreshold) always carry
 * over unchanged — family membership is defined by matching repMetric, so
 * those are valid for any family member by construction.
 */
export function narrowOverrideForTarget<T extends {
  topAngle?: number;
  repEnterThreshold?: number;
  repExitThreshold?: number;
  goodROMThreshold?: number;
  formCheckLimits?: Record<string, number>;
  formCheckEnabled?: Record<string, boolean>;
}>(override: T, sourceDef: ExerciseDefinitionDef, targetDef: ExerciseDefinitionDef): T {
  const result = {
    topAngle:          override.topAngle,
    repEnterThreshold: override.repEnterThreshold,
    repExitThreshold:  override.repExitThreshold,
    goodROMThreshold:  override.goodROMThreshold,
  } as T;

  if (override.formCheckLimits) {
    const limits: Record<string, number> = {};
    for (const [checkId, value] of Object.entries(override.formCheckLimits)) {
      const sourceCheck = sourceDef.formChecks.find(c => c.id === checkId);
      const targetCheck = targetDef.formChecks.find(c => c.id === checkId);
      if (sourceCheck && targetCheck && metricsEqual(sourceCheck.metric, targetCheck.metric)) {
        limits[checkId] = value;
      }
    }
    if (Object.keys(limits).length > 0) result.formCheckLimits = limits;
  }

  if (override.formCheckEnabled) {
    const enabled: Record<string, boolean> = {};
    for (const [checkId, value] of Object.entries(override.formCheckEnabled)) {
      if (targetDef.formChecks.some(c => c.id === checkId)) enabled[checkId] = value;
    }
    if (Object.keys(enabled).length > 0) result.formCheckEnabled = enabled;
  }

  return result;
}
