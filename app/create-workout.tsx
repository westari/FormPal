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
import { showDone } from '../lib/doneStore';
import { DONE_TITLES, createdDoneLine } from '../lib/doneInfo';
import { workoutMinutes } from '../lib/trainData';
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
      console.log('[CREATE] workout saved: "' + workout.splitLabel + '" with ' + workout.exercises.length + ' exercises - showing the done screen');
      // the done screen (Ari's design, components/DoneHost.tsx): "Workout created" and what was created; Continue leaves this screen
      showDone({
        title: DONE_TITLES.created,
        subtitle: createdDoneLine({ name: workout.splitLabel, exercises: workout.exercises.length, minutes: workoutMinutes(workout) }),
        onContinue: () => { console.log('[CREATE] leaving after the done screen'); router.back(); },
      });
    } catch {
      saving.current = false;
      hapticError(); Alert.alert('Something went wrong', 'Could not save this workout. Try again.');
    }
  }, [catalog, router]);

  const onMessage = useCallback((m: DesignMessage) => {
    if (m.type === 'back') router.back();
    else if (m.type === 'save') void save(m);
  }, [router, save]);

  return (
    <>
      <DesignScreen name="create-workout" source={SOURCE} beforeJs={BEFORE} dataJs={dataJs} onMessage={onMessage} />
    </>
  );
}
