/**
 * lib/formpalSync.ts
 *
 * Supabase sync layer — same per-table upsert/select pattern as ATHLT's own
 * lib/supabaseSync.ts (C:\Users\arize\ATHLT\expo\lib\supabaseSync.ts), which
 * is where this structure is copied from. Schema: supabase_schema.sql.
 *
 * Write-through, not a replacement for local storage: every save function
 * here is called ALONGSIDE the existing AsyncStorage save (see
 * lib/planStorage.ts's own header comment, which predicted exactly this),
 * never instead of it, and every failure here is swallowed (best-effort —
 * the app must keep working fully offline).
 */

import { supabase } from '../constants/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Plan, PlanProfile } from '../types/plan';
import type { SessionEntry } from './sessionLog';

// ─── Onboarding answers ───────────────────────────────────────────────────────

export async function saveOnboardingAnswersToCloud(answers: Record<string, any>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not_signed_in' };
  const { error } = await supabase.from('onboarding_answers').upsert({
    user_id: user.id, answers, updated_at: new Date().toISOString(),
  });
  if (error) console.warn('saveOnboardingAnswersToCloud error:', error);
  return { error: error?.message ?? null };
}

export async function loadOnboardingAnswersFromCloud(): Promise<Record<string, any> | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('onboarding_answers').select('answers').eq('user_id', user.id).maybeSingle();
  if (error || !data) return null;
  return data.answers ?? null;
}

// ─── Plan ─────────────────────────────────────────────────────────────────────

export async function savePlanToCloud(plan: Plan, profile: PlanProfile | null) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not_signed_in' };
  const { error } = await supabase.from('plans').upsert({
    user_id: user.id, plan, profile, updated_at: new Date().toISOString(),
  });
  if (error) console.warn('savePlanToCloud error:', error);
  return { error: error?.message ?? null };
}

export async function loadPlanFromCloud(): Promise<{ plan: Plan | null; profile: PlanProfile | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { plan: null, profile: null };
  const { data, error } = await supabase.from('plans').select('plan, profile').eq('user_id', user.id).maybeSingle();
  if (error || !data) return { plan: null, profile: null };
  return { plan: data.plan ?? null, profile: data.profile ?? null };
}

// ─── Session log (workout history) ───────────────────────────────────────────
// Push-only-new-rows: the caller passes just the entries from the workout
// that was just completed (same shape lib/sessionLog.ts appends locally),
// never the whole log, so this never re-uploads history that's already there.

export async function pushSessionEntriesToCloud(entries: SessionEntry[]) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || entries.length === 0) return { error: user ? null : 'not_signed_in' };
  const rows = entries.map(e => ({
    user_id: user.id, ts: e.ts, exercise_id: e.exerciseId, display_name: e.displayName,
    reps: e.reps, good_reps: e.goodReps, pct: e.pct, form_checked: e.formChecked ?? true,
  }));
  const { error } = await supabase.from('session_log').insert(rows);
  if (error) console.warn('pushSessionEntriesToCloud error:', error);
  return { error: error?.message ?? null };
}

export async function loadSessionLogFromCloud(): Promise<SessionEntry[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from('session_log').select('*').eq('user_id', user.id).order('ts', { ascending: true });
  if (error || !data) return [];
  return data.map((r: any) => ({
    ts: r.ts, exerciseId: r.exercise_id, displayName: r.display_name,
    reps: r.reps, goodReps: r.good_reps, pct: r.pct, formChecked: r.form_checked,
  }));
}

// ─── Streaks ──────────────────────────────────────────────────────────────────

export async function saveStreakToCloud(currentStreak: number, lastSessionTs: number) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not_signed_in' };
  const { error } = await supabase.from('streaks').upsert({
    user_id: user.id, current_streak: currentStreak, last_session_ts: lastSessionTs, updated_at: new Date().toISOString(),
  });
  if (error) console.warn('saveStreakToCloud error:', error);
  return { error: error?.message ?? null };
}

// ─── Progress photos ──────────────────────────────────────────────────────────
// Photo bytes go to the private 'progress-photos' Storage bucket at
// "<user_id>/<timestamp>.jpg" (RLS-enforced — see supabase_schema.sql);
// this table row is just the metadata pointer.

export async function uploadProgressPhotoToCloud(localUri: string, kind: 'first' | 'recurring'): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not_signed_in' };
  try {
    const res = await fetch(localUri);
    const blob = await res.blob();
    const path = `${user.id}/${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from('progress-photos').upload(path, blob, { contentType: 'image/jpeg' });
    if (uploadError) { console.warn('uploadProgressPhotoToCloud upload error:', uploadError); return { error: uploadError.message }; }
    const { error: rowError } = await supabase.from('progress_photos').insert({ user_id: user.id, kind, storage_path: path });
    if (rowError) console.warn('uploadProgressPhotoToCloud row error:', rowError);
    return { error: rowError?.message ?? null };
  } catch (e: any) {
    return { error: e?.message ?? 'upload_failed' };
  }
}

// ─── Gift-offer-shown flag ────────────────────────────────────────────────────
// Checked BOTH locally (AsyncStorage, works offline / before sign-in) AND in
// Supabase (survives reinstall) — see lib/giftOffer.ts for the combined
// "has it ever been shown" check used by the paywall flow.

export async function markGiftOfferShownInCloud() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not_signed_in' };
  const { error } = await supabase.from('gift_offer_shown').upsert({ user_id: user.id });
  if (error) console.warn('markGiftOfferShownInCloud error:', error);
  return { error: error?.message ?? null };
}

export async function wasGiftOfferShownInCloud(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from('gift_offer_shown').select('user_id').eq('user_id', user.id).maybeSingle();
  return !!data;
}

// ─── Full load on sign-in ─────────────────────────────────────────────────────

export async function loadAllUserDataFromCloud() {
  const [answers, planResult, sessionLog, giftShown] = await Promise.all([
    loadOnboardingAnswersFromCloud(),
    loadPlanFromCloud(),
    loadSessionLogFromCloud(),
    wasGiftOfferShownInCloud(),
  ]);
  return {
    answers,
    plan: planResult.plan,
    planProfile: planResult.profile,
    sessionLog,
    giftOfferShown: giftShown,
    hasCloudData: !!(answers || planResult.plan || sessionLog.length > 0),
  };
}

// ─── Sign out / delete account ───────────────────────────────────────────────
// Every local key this app writes, so a signed-out device starts genuinely
// fresh (the next sign-in loads purely from the cloud, not a stale mix).
const ALL_LOCAL_KEYS = [
  'formpal_onboarding_complete', 'formpal_plan', 'formpal_plan_profile',
  'formpal_session_log', 'formpal_audio_settings', 'formpal_customization',
  'formpal_location', 'formpal_readiness', 'formpal_repcounter_intro_seen',
  'formpal_skip_connect_music', 'formpal_skip_demo_exercises',
  'formpal_threshold_overrides', 'formpal_video_log', 'formpal_viewed_moves',
  'formpal_gift_offer_shown', 'formpal_last_progress_photo_prompt',
  'formpal_first_workout_done', 'formpal_post_purchase_onboarding_done',
  'formpal_weight_log', 'formpal_profile_details',
];

export async function clearAllLocalData() {
  await AsyncStorage.multiRemove(ALL_LOCAL_KEYS);
}

export async function signOutAndClear() {
  const { error } = await supabase.auth.signOut();
  await clearAllLocalData();
  if (error) { console.warn('signOut error:', error); return { error: error.message }; }
  return { error: null };
}

// Deletes the auth user (and, via `on delete cascade` in the schema, every
// row they own) through a server-side Edge Function — a plain client call
// can never delete an auth user itself (that needs the service-role key,
// which must never ship inside the app). See
// supabase/functions/delete-account/index.ts and OVERNIGHT_REPORT.md for
// the one-time `supabase functions deploy delete-account` step this needs.
export async function deleteAccountAndClear(): Promise<{ error: string | null }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'not_signed_in' };
    const { error } = await supabase.functions.invoke('delete-account', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) { console.warn('deleteAccountAndClear error:', error); return { error: error.message }; }
    await clearAllLocalData();
    return { error: null };
  } catch (e: any) {
    return { error: e?.message ?? 'delete_failed' };
  }
}
