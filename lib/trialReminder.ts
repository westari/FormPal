/**
 * lib/trialReminder.ts
 *
 * The trial reminder screen ("We'll remind you before your trial ends") with its two choices, "Remind me 2 days before" / "Remind me 1 day before".
 * The choice used to do nothing. Now it is a REAL local notification (expo-notifications):
 *   - the page reports the pick ("remindpick:2" / "remindpick:1") and it is remembered here (default 2, the page's own default);
 *   - Continue on that screen asks iOS for permission to send notifications (right when he has just asked to be reminded);
 *   - when the trial starts (the paywall's "Start free for 7 days") the reminder is scheduled for (trial length - picked days) from now, at the same time of day;
 *   - any earlier trial reminder is cancelled first, so there is never more than one.
 *
 * NEEDS A NEW NATIVE BUILD: expo-notifications was not in the app. The module is loaded defensively: on the current build (without it) every call is a quiet
 * no-op and logs "[TRIAL-REMINDER] ... not in this build".
 */
export const TRIAL_DAYS = 7;                       // "Free for 7 days" on the paywall
export const TRIAL_REMINDER_ID = 'formpal-trial-reminder';
export const TRIAL_REMINDER_CHOICES = [2, 1] as const;
export type TrialReminderDays = (typeof TRIAL_REMINDER_CHOICES)[number];

let picked: TrialReminderDays = 2;
let permission: 'unknown' | 'granted' | 'denied' | 'unavailable' = 'unknown';
export function setTrialReminderPick(days: number): void { if (days === 1 || days === 2) picked = days; }
export function getTrialReminderPick(): TrialReminderDays { return picked; }
export function getTrialReminderPermission() { return permission; }
/** test hook */
export function __resetTrialReminder(): void { picked = 2; permission = 'unknown'; }

/** The reminder, as plain data: when it fires and what it says. null when it would fall in the past. */
export function trialReminderPlan(opts: { now: Date; daysBefore: number; trialDays?: number }): { fireAt: Date; title: string; body: string; daysBefore: number } | null {
  const trialDays = opts.trialDays ?? TRIAL_DAYS;
  const daysBefore = opts.daysBefore;
  if (!(daysBefore >= 1) || daysBefore >= trialDays) return null;
  const fireAt = new Date(opts.now.getTime() + (trialDays - daysBefore) * 24 * 60 * 60 * 1000);
  if (fireAt.getTime() <= opts.now.getTime() + 60 * 1000) return null;
  const when = daysBefore === 1 ? 'tomorrow' : `in ${daysBefore} days`;
  return {
    fireAt, daysBefore,
    title: `Your free trial ends ${when}`,
    body: 'Keep training with your plan, or cancel anytime in Settings before it renews.',
  };
}

/** The slice of expo-notifications this file uses (so a test can pass a fake). */
export interface NotificationsApi {
  getPermissionsAsync(): Promise<{ status: string; granted?: boolean }>;
  requestPermissionsAsync(opts?: any): Promise<{ status: string; granted?: boolean }>;
  scheduleNotificationAsync(req: { identifier?: string; content: { title: string; body: string; sound?: boolean }; trigger: any }): Promise<string>;
  cancelScheduledNotificationAsync(id: string): Promise<void>;
  SchedulableTriggerInputTypes?: { DATE: string };
}

let cached: NotificationsApi | null | undefined;
function loadNotifications(): NotificationsApi | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require('expo-notifications');
    cached = (m && typeof m.scheduleNotificationAsync === 'function') ? (m as NotificationsApi) : null;
  } catch { cached = null; }
  return cached;
}

/** Ask iOS for permission (once). Called when Continue is tapped on the trial reminder screen. Never throws. */
export async function askTrialReminderPermission(api: NotificationsApi | null = loadNotifications(), log: (m: string) => void = console.log): Promise<typeof permission> {
  if (!api) { permission = 'unavailable'; log('[TRIAL-REMINDER] expo-notifications is not in this build: no reminder can be asked for or scheduled (needs the new iOS build)'); return permission; }
  try {
    let st = await api.getPermissionsAsync();
    if (st.status !== 'granted') st = await api.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    permission = st.status === 'granted' ? 'granted' : 'denied';
    log(`[TRIAL-REMINDER] notification permission: ${permission}`);
  } catch (e: any) { permission = 'denied'; log('[TRIAL-REMINDER] permission request failed: ' + (e && e.message ? e.message : String(e))); }
  return permission;
}

/** Schedule the picked reminder (cancelling any earlier one). Called when the trial starts. Returns what it did. */
export async function scheduleTrialReminder(
  opts: { now?: Date; daysBefore?: number; api?: NotificationsApi | null; log?: (m: string) => void } = {},
): Promise<{ scheduled: boolean; reason: string; fireAt?: Date }> {
  const log = opts.log ?? console.log;
  const api = opts.api === undefined ? loadNotifications() : opts.api;
  const days = opts.daysBefore ?? picked;
  if (!api) { log('[TRIAL-REMINDER] not scheduled: expo-notifications is not in this build (needs the new iOS build)'); return { scheduled: false, reason: 'not-in-build' }; }
  const plan = trialReminderPlan({ now: opts.now ?? new Date(), daysBefore: days });
  if (!plan) { log('[TRIAL-REMINDER] not scheduled: the reminder time would be in the past'); return { scheduled: false, reason: 'past' }; }
  try {
    let st = await api.getPermissionsAsync();
    if (st.status !== 'granted') {
      // not asked yet (or he skipped that screen): ask now
      st = await api.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    }
    if (st.status !== 'granted') { permission = 'denied'; log('[TRIAL-REMINDER] not scheduled: notifications are not allowed'); return { scheduled: false, reason: 'denied' }; }
    permission = 'granted';
    try { await api.cancelScheduledNotificationAsync(TRIAL_REMINDER_ID); } catch { /* none scheduled */ }
    const type = api.SchedulableTriggerInputTypes?.DATE ?? 'date';
    await api.scheduleNotificationAsync({
      identifier: TRIAL_REMINDER_ID,
      content: { title: plan.title, body: plan.body, sound: true },
      trigger: { type, date: plan.fireAt },
    });
    log(`[TRIAL-REMINDER] scheduled "${plan.title}" for ${plan.fireAt.toISOString()} (${plan.daysBefore} day${plan.daysBefore === 1 ? '' : 's'} before the trial ends)`);
    return { scheduled: true, reason: 'ok', fireAt: plan.fireAt };
  } catch (e: any) {
    log('[TRIAL-REMINDER] scheduling failed: ' + (e && e.message ? e.message : String(e)));
    return { scheduled: false, reason: 'error' };
  }
}
