/**
 * app/my-workouts.tsx
 *
 * "My workouts": Ari's real design file (assets/app screens/myworkouts.html) used as-is, showing the workouts of the saved
 * plan (lib/planStorage). Bookmarks are kept on the device; tapping a card opens that workout's overview, and the
 * button opens Create workout.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadPlan } from '../lib/planStorage';
import DesignScreen, { type DesignMessage } from '../components/DesignScreen';
import { myWorkoutsBeforeJs, myWorkoutsData, athltSetDataJs } from '../lib/designScreens';
import type { Plan } from '../types/plan';

const SOURCE = require('../assets/app screens/myworkouts.html');
const BEFORE = myWorkoutsBeforeJs();
const SAVED_KEY = 'formpal_saved_workouts';

export default function MyWorkoutsScreen() {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [saved, setSaved] = useState<string[]>([]);

  // reloaded every time the screen is shown (a workout made in Create workout appears at once)
  useFocusEffect(useCallback(() => {
    let alive = true;
    Promise.all([loadPlan().catch(() => null), AsyncStorage.getItem(SAVED_KEY).catch(() => null)]).then(([p, raw]) => {
      if (!alive) return;
      let ids: string[] = [];
      try { ids = raw ? JSON.parse(raw) : []; } catch { ids = []; }
      setSaved(ids); setPlan(p);
    });
    return () => { alive = false; };
  }, []));

  const dataJs = useMemo(() => (plan === undefined ? null : athltSetDataJs(myWorkoutsData(plan?.workouts ?? [], saved))), [plan, saved]);

  const onMessage = useCallback((m: DesignMessage) => {
    if (m.type === 'back') router.back();
    else if (m.type === 'create') router.push('/create-workout' as any);
    else if (m.type === 'openWorkout' && m.id) router.push({ pathname: '/workout', params: { id: String(m.id) } } as any);
    else if (m.type === 'saved' && Array.isArray(m.ids)) AsyncStorage.setItem(SAVED_KEY, JSON.stringify(m.ids)).catch(() => {});
  }, [router]);

  return <DesignScreen name="my-workouts" source={SOURCE} beforeJs={BEFORE} dataJs={dataJs} onMessage={onMessage} />;
}
