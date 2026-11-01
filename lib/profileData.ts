/**
 * lib/profileData.ts
 *
 * Pure adapter (no React/RN): real app data -> the JSON blob the Profile tab's
 * artboard reads from `window.__athltData` (see app/(tabs)/profile.tsx and
 * lib/profileInject.ts). Nothing is invented — a field with no stored value
 * is null/'' and the page shows "Not set" / an empty state for it.
 */
import type { SessionEntry } from './sessionLog';
import type { PlanProfile } from '../types/plan';

const DAY_MS = 24 * 60 * 60 * 1000;

// Index-aligned with the artboard's own BADGES table (12 badges, in its order).
// Thresholds are the badge names' own definitions ("3 day streak", "1,000 reps"...).
const STREAK_TARGETS = [3, 10, 50, 100, 365, 1000];
const REP_TARGETS = [100, 1000, 10000];

export const GOAL_IDS = ['strength', 'toned', 'general', 'weightloss'] as const;
export const PLACE_IDS = ['gym', 'home', 'outdoors'] as const;
export const EXPERIENCE_LABELS: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

/** Persisted Profile-only details (no other screen stores these). */
export interface ProfileDetails {
  age?:    string;
  height?: string;
  sex?:    string;
  units?:  0 | 1;
  days?:   boolean[];
  pinned?: number[];
}

export interface ProfileData {
  seedVersion: number;
  name: string;
  email: string;
  since: string;
  streak: number;
  workouts: number;
  det: { age: string; height: string; sex: string; experience: string };
  goalIdx: number;
  placeIdx: number;
  days: boolean[];
  weight: number | null;
  units: 0 | 1;
  pinned: number[] | null;
  audioLabel: string;
  badgesEarned: boolean[];
  appVersion: string;
}

function dayStart(ts: number): number { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }

/** Longest run of consecutive calendar days in a set of day-start timestamps. */
function longestRun(days: Set<number>): number {
  const sorted = Array.from(days).sort((a, b) => a - b);
  let best = 0, run = 0, prev = -1;
  for (const d of sorted) {
    run = prev >= 0 && Math.round((d - prev) / DAY_MS) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

export function computeBadges(sessions: SessionEntry[]): boolean[] {
  const allDays = new Set(sessions.map(s => dayStart(s.ts)));
  const bestStreak = longestRun(allDays);
  const totalReps = sessions.reduce((a, s) => a + s.reps, 0);
  // A "perfect set" = a form-judged exercise where every rep was a good rep.
  const perfect = sessions.filter(s => s.formChecked !== false && s.reps > 0 && s.goodReps >= s.reps);
  const perfectRun = longestRun(new Set(perfect.map(s => dayStart(s.ts))));
  return [
    ...STREAK_TARGETS.map(t => bestStreak >= t),
    ...REP_TARGETS.map(t => totalReps >= t),
    perfect.length > 0, perfectRun >= 7, perfectRun >= 30,
  ];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function sinceLabel(ts: number): string { const d = new Date(ts); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }

export function buildProfileData(i: {
  seedVersion: number;
  name: string;
  email: string | null;
  sessions: SessionEntry[];
  streak: number;
  planProfile: PlanProfile | null;
  planGeneratedAt: number | null;
  location: string | null;
  latestWeightLb: number | null;
  details: ProfileDetails;
  audio: { enabled: boolean; voiceFrequency: 'off' | 'correctionsOnly' | 'correctionsAndCounts' };
  appVersion: string;
  now?: number;
}): ProfileData {
  const now = i.now ?? Date.now();
  const firstTs = i.sessions.length ? Math.min(...i.sessions.map(s => s.ts)) : null;
  const sinceTs = firstTs ?? i.planGeneratedAt ?? now;
  const goalIdx = Math.max(0, GOAL_IDS.indexOf((i.planProfile?.goal ?? 'strength') as typeof GOAL_IDS[number]));
  const placeIdx = Math.max(0, PLACE_IDS.indexOf((i.location ?? 'gym') as typeof PLACE_IDS[number]));
  const dpw = i.planProfile?.daysPerWeek ?? 3;
  // Weekday picks aren't stored anywhere but here; with none saved, spread the
  // plan's real days-per-week across the week (Mon/Wed/Fri-style) as a starting point.
  const SPREAD: Record<number, number[]> = {
    1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6],
  };
  const days = i.details.days ?? Array.from({ length: 7 }, (_, k) => (SPREAD[Math.max(1, Math.min(7, dpw))] ?? []).includes(k));
  const groups = new Set(i.sessions.map(s => s.ts)).size;
  const audioLabel = !i.audio.enabled ? 'Off'
    : i.audio.voiceFrequency === 'off' ? 'Chime only'
    : i.audio.voiceFrequency === 'correctionsOnly' ? 'Corrections' : 'Corrections + counts';
  return {
    seedVersion: i.seedVersion,
    name: i.name, email: i.email ?? '',
    since: sinceLabel(sinceTs), streak: i.streak, workouts: groups,
    det: {
      age: i.details.age ?? '', height: i.details.height ?? '', sex: i.details.sex ?? '',
      experience: EXPERIENCE_LABELS[i.planProfile?.experience ?? 'beginner'] ?? 'Beginner',
    },
    goalIdx, placeIdx, days,
    weight: i.latestWeightLb,
    units: i.details.units ?? 0,
    pinned: i.details.pinned ?? null,
    audioLabel,
    badgesEarned: computeBadges(i.sessions),
    appVersion: i.appVersion,
  };
}
