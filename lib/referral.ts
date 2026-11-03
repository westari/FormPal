/**
 * lib/referral.ts
 *
 * The user's personal referral code, shown on Profile > Refer a friend. It is
 * made once from their first name (the design's own example is "JORDAN10") and
 * kept on the device, so it never changes between launches.
 *
 * There is no referral backend yet, so "friends joined" is always 0 and nothing
 * claims a reward was earned.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const REFERRAL_KEY = 'formpal_referral_code';
export const REFERRAL_SITE = 'https://form-pal.vercel.app';

export interface ReferralInfo { code: string; joined: number; }

/** NAME + two digits, e.g. "ARI42". Letters only from the name (max 8), "FORM" if there is none. */
export function makeReferralCode(name: string, rand: () => number = Math.random): string {
  const letters = (name || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) || 'FORM';
  const digits = String(10 + Math.floor(rand() * 90));
  return letters + digits;
}

export async function getReferral(name: string): Promise<ReferralInfo> {
  try {
    const saved = await AsyncStorage.getItem(REFERRAL_KEY);
    if (saved) return { code: saved, joined: 0 };
    const code = makeReferralCode(name);
    await AsyncStorage.setItem(REFERRAL_KEY, code);
    return { code, joined: 0 };
  } catch {
    return { code: makeReferralCode(name), joined: 0 };
  }
}

export function referralMessage(code: string): string {
  return `I'm training with FormPal. It checks your form rep by rep with your phone camera. Use my code ${code}: ${REFERRAL_SITE}/?ref=${code}`;
}
