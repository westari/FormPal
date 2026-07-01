/**
 * lib/planStorage.ts
 *
 * AsyncStorage-backed persistence for the plan system.
 *
 * SUPABASE SYNC (later, without changing callers):
 *   Wrap savePlan / loadPlan to also upsert/fetch from Supabase.
 *   Callers (planStore.ts) won't change — only this file changes.
 *   Strategy: write-through (save locally + to Supabase on mutation).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Plan, PlanProfile } from '../types/plan';

const KEYS = {
  plan:    'formpal_plan',
  profile: 'formpal_plan_profile',
} as const;

// ─── Plan ─────────────────────────────────────────────────────────────────────

export async function savePlan(plan: Plan): Promise<void> {
  await AsyncStorage.setItem(KEYS.plan, JSON.stringify(plan));
}

export async function loadPlan(): Promise<Plan | null> {
  const raw = await AsyncStorage.getItem(KEYS.plan);
  if (!raw) return null;
  return JSON.parse(raw) as Plan;
}

export async function clearPlan(): Promise<void> {
  await AsyncStorage.multiRemove([KEYS.plan, KEYS.profile]);
}

// ─── Profile (save separately so we can regenerate without a Plan yet) ────────

export async function saveProfile(profile: PlanProfile): Promise<void> {
  await AsyncStorage.setItem(KEYS.profile, JSON.stringify(profile));
}

export async function loadProfile(): Promise<PlanProfile | null> {
  const raw = await AsyncStorage.getItem(KEYS.profile);
  if (!raw) return null;
  return JSON.parse(raw) as PlanProfile;
}
