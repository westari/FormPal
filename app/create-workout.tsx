/**
 * app/create-workout.tsx
 *
 * "Create workout": Ari's real design file (assets/app screens/createworkout.html) used as-is, with real data
 * (lib/designScreens.ts): the app's own exercise catalog behind the search and the Cue box. Save puts the new workout
 * into the real plan as the next session (inserted at plan.currentWorkoutIndex).
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { EXERCISE_CATALOG } from '../constants/exercises';
import { loadPlan, savePlan } from '../lib/planStorage';
import { hapticError, hapticSuccess } from '../lib/haptics';
import SavedCheck from '../components/SavedCheck';
import DesignScreen, { type DesignMessage } from '../components/DesignScreen';
import {
  buildCatalog, createWorkoutBeforeJs, createWorkoutData, athltSetDataJs, workoutFromPage,
} from '../lib/designScreens';

const SOURCE = require('../assets/app screens/createworkout.html');
const BEFORE = createWorkoutBeforeJs();

export default function CreateWorkoutScreen() {
  const router = useRouter();
  const catalog = useMemo(() => buildCatalog(EXERCISE_CATALOG as any), []);
  const dataJs = useMemo(() => athltSetDataJs(createWorkoutData(catalog)), [catalog]);
  // after a successful Save: a short check + "Workout saved" before the screen leaves
  const [saved, setSaved] = useState(false);
  const saving = useRef(false);

  const save = useCallback(async (msg: DesignMessage) => {
    if (saving.current) return; // a second tap while saving does nothing
    saving.current = true;
    try {
      const plan = await loadPlan();
      if (!plan) { saving.current = false; hapticError(); Alert.alert('No plan yet', 'You need a generated plan before you can add a custom workout to it.'); return; }
      const workout = workoutFromPage({ name: msg.name, items: msg.items }, catalog, plan.workouts.length, Date.now());
      if (workout.exercises.length === 0) { saving.current = false; hapticError(); Alert.alert('Add an exercise', 'Add at least one exercise before saving.'); return; }
      const next = [...plan.workouts];
      next.splice(plan.currentWorkoutIndex, 0, workout);
      await savePlan({ ...plan, workouts: next });
      console.log('[CREATE] workout saved: "' + workout.splitLabel + '" with ' + workout.exercises.length + ' exercises - showing the Workout saved check');
      hapticSuccess();
      setSaved(true); // the check shows, then onSavedDone leaves the screen
    } catch {
      saving.current = false;
      hapticError(); Alert.alert('Something went wrong', 'Could not save this workout. Try again.');
    }
  }, [catalog, router]);

  const onMessage = useCallback((m: DesignMessage) => {
    if (m.type === 'back') router.back();
    else if (m.type === 'save') void save(m);
  }, [router, save]);

  const onSavedDone = useCallback(() => { console.log('[CREATE] leaving after the saved check'); router.back(); }, [router]);

  return (
    <>
      <DesignScreen name="create-workout" source={SOURCE} beforeJs={BEFORE} dataJs={dataJs} onMessage={onMessage} />
      {saved ? <SavedCheck text="Workout saved" onDone={onSavedDone} /> : null}
    </>
  );
}
