/**
 * lib/weightLog.ts
 *
 * Local body-weight log — backs the Progress tab's "Weight Progress" chart
 * and Profile's "Weight" row. New this session: no prior weight-tracking
 * feature existed anywhere in the app. Same storage pattern as
 * lib/sessionLog.ts (AsyncStorage, JSON array, oldest-trimmed cap).
 *
 * One entry per CALENDAR DAY (local time) — logging again on the same day
 * overwrites that day's entry rather than adding a second point, matching
 * the design's own "Confirm your weight" flow (a date picker, not a
 * timestamp) and how every real weight-tracking app behaves.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const WEIGHT_LOG_KEY = 'formpal_weight_log';
const MAX_ENTRIES = 1000; // ~2.7 years of daily entries

export interface WeightEntry {
  /** Local calendar day this entry is for, as 'YYYY-MM-DD'. */
  dateKey:  string;
  weightLb: number;
  /** When this entry was actually logged (epoch ms) — for ordering/display only. */
  loggedAt: number;
}

export function dateKeyFor(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function getWeightLog(): Promise<WeightEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(WEIGHT_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<WeightEntry>[];
    return parsed
      .map(e => ({
        dateKey:  e.dateKey ?? '',
        weightLb: e.weightLb ?? 0,
        loggedAt: e.loggedAt ?? 0,
      }))
      .filter(e => e.dateKey && e.weightLb > 0)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  } catch {
    return [];
  }
}

/** Logs (or overwrites, if one already exists for that day) a weight entry. */
export async function logWeight(weightLb: number, forDate: Date = new Date()): Promise<void> {
  if (!(weightLb > 0)) return;
  try {
    const dateKey = dateKeyFor(forDate);
    const existing = await getWeightLog();
    const withoutThisDay = existing.filter(e => e.dateKey !== dateKey);
    const log = [...withoutThisDay, { dateKey, weightLb, loggedAt: Date.now() }]
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    if (log.length > MAX_ENTRIES) log.splice(0, log.length - MAX_ENTRIES);
    await AsyncStorage.setItem(WEIGHT_LOG_KEY, JSON.stringify(log));
  } catch {}
}

export type WeightRange = '2m' | '6m' | '1y' | 'all';

const RANGE_DAYS: Record<Exclude<WeightRange, 'all'>, number> = {
  '2m': 60, '6m': 182, '1y': 365,
};

/** Entries within the given range, oldest first — what the chart draws. */
export function filterWeightRange(entries: WeightEntry[], range: WeightRange): WeightEntry[] {
  if (range === 'all') return entries;
  const cutoff = Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
  return entries.filter(e => new Date(e.dateKey).getTime() >= cutoff);
}
