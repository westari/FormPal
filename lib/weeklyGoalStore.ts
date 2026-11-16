/**
 * lib/weeklyGoalStore.ts
 *
 * Reads the weekly goal the user picked in Profile (the picked days are stored with the profile details; how many days are picked is the goal).
 * The maths is in lib/weeklyGoal.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PROFILE_DETAILS_KEY = 'formpal_profile_details';

export async function loadUserDays(): Promise<boolean[] | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_DETAILS_KEY);
    const d = raw ? JSON.parse(raw) : null;
    return d && Array.isArray(d.days) ? d.days : null;
  } catch { return null; }
}

/** Does the user show weights in kg? (Profile > Units; stored with the profile details) */
export async function loadUnitsKg(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_DETAILS_KEY);
    const d = raw ? JSON.parse(raw) : null;
    return !!d && d.units === 1;
  } catch { return false; }
}
