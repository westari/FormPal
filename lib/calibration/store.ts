/**
 * lib/calibration/store.ts
 *
 * Local override store for the calibration tool — AsyncStorage-backed, keyed by
 * exercise id. Starts empty; nothing changes for any exercise until you
 * explicitly calibrate one and tap Accept. This is the LIVE layer applied at
 * runtime on top of constants/exerciseDefinitions.ts (the source of truth you
 * can promote values into later via the export text — see app/calibrate.tsx).
 *
 * applyOverride() is called from app/formcheck.tsx right before
 * setExerciseDefinition(), so accepted calibrations take effect on next
 * session start — no rebuild, not even required to touch exerciseDefinitions.ts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ExerciseDefinitionDef } from '../../constants/exerciseDefinitions';

const STORAGE_KEY = 'formpal_threshold_overrides';

export interface CalibratedOverride {
  topAngle?:          number;
  repEnterThreshold?: number;
  repExitThreshold?:  number;
  goodROMThreshold?:  number;
  formCheckLimits?:   Record<string, number>; // checkId -> new condition.value
  formCheckEnabled?:  Record<string, boolean>; // checkId -> enabled (lets you turn on a previously-disabled check)
}

export interface FormCheckDistribution {
  good:  number[]; // kept (post-outlier-rejection) values from the "good reps" step
  fault: number[]; // kept values from the fault-demonstration step
}

export interface CalibrationRecord {
  exerciseId:    string;
  calibratedAt:  number; // epoch ms
  sampleSize:    number; // reps-per-step target used for this calibration
  overrides:     CalibratedOverride;
  distributions: {
    goodTop?:    number[]; // kept top/rest values from the good-rep step
    goodBottom?: number[]; // kept bottom/peak values from the good-rep step
    formChecks?: Record<string, FormCheckDistribution>;
  };
}

type OverrideStore = Record<string, CalibrationRecord>;

async function readStore(): Promise<OverrideStore> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeStore(store: OverrideStore): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export async function getCalibration(exerciseId: string): Promise<CalibrationRecord | null> {
  const store = await readStore();
  return store[exerciseId] ?? null;
}

export async function getAllCalibrations(): Promise<OverrideStore> {
  return readStore();
}

export async function saveCalibration(record: CalibrationRecord): Promise<void> {
  const store = await readStore();
  store[record.exerciseId] = record;
  await writeStore(store);
}

export async function clearCalibration(exerciseId: string): Promise<void> {
  const store = await readStore();
  delete store[exerciseId];
  await writeStore(store);
}

// Wipes every saved calibration override in one shot — the "shelve the tool,
// undo anything it might have saved" button. formcheck.tsx's [DEF-LOOKUP] log
// line is the way to check whether any exercise currently has one applied.
export async function clearAllCalibrations(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

/**
 * Shallow-merges a saved override onto a base exercise definition. Used by
 * app/formcheck.tsx (real workouts) and app/calibrate.tsx (validation mode,
 * to show what's currently live). Returns `base` unchanged if override is null.
 */
export function applyOverride(
  base: ExerciseDefinitionDef,
  override: CalibratedOverride | null | undefined,
): ExerciseDefinitionDef {
  if (!override) return base;

  return {
    ...base,
    ...(override.topAngle          !== undefined ? { topAngle: override.topAngle }                 : {}),
    ...(override.repEnterThreshold !== undefined ? { repEnterThreshold: override.repEnterThreshold } : {}),
    ...(override.repExitThreshold  !== undefined ? { repExitThreshold: override.repExitThreshold }   : {}),
    ...(override.goodROMThreshold  !== undefined ? { goodROMThreshold: override.goodROMThreshold }   : {}),
    formChecks: base.formChecks.map(check => {
      const newLimit   = override.formCheckLimits?.[check.id];
      const newEnabled = override.formCheckEnabled?.[check.id];
      if (newLimit === undefined && newEnabled === undefined) return check;
      return {
        ...check,
        condition: newLimit !== undefined ? { ...check.condition, value: newLimit } : check.condition,
        enabled:   newEnabled !== undefined ? newEnabled : check.enabled,
      };
    }),
  };
}
