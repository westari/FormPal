/**
 * lib/giftOffer.ts
 *
 * "Must show ONLY ONCE EVER per user... even after reinstalling" — a local
 * AsyncStorage flag alone can't survive a reinstall, so this also checks (and
 * sets) a Supabase-side flag when signed in. Device flag is still checked
 * first since it's instant and covers the common case (same install,
 * possibly signed out) without a network round trip.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { markGiftOfferShownInCloud, wasGiftOfferShownInCloud } from './formpalSync';

const LOCAL_KEY = 'formpal_gift_offer_shown';

export async function hasGiftOfferBeenShown(): Promise<boolean> {
  const local = await AsyncStorage.getItem(LOCAL_KEY);
  if (local === 'true') return true;
  // Not shown on THIS device yet — but if signed in and it was already
  // shown on a previous install, the cloud flag is the one that's actually
  // authoritative (this is exactly the reinstall case the task calls out).
  try {
    const cloud = await wasGiftOfferShownInCloud();
    if (cloud) { await AsyncStorage.setItem(LOCAL_KEY, 'true'); return true; }
  } catch { /* offline/signed-out — fall through, local flag is all we have */ }
  return false;
}

export async function markGiftOfferShown(): Promise<void> {
  await AsyncStorage.setItem(LOCAL_KEY, 'true');
  markGiftOfferShownInCloud().catch(() => {});
}
