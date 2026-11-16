/**
 * app/learn-moves.tsx
 *
 * "Learn the moves" (the arrow next to it on Home): the My workouts page (assets/app screens/myworkouts.html, same layout and cards) listing
 * every exercise of the catalogue, with filter chips for the equipment (Bodyweight, Dumbbell, Barbell, Machine) and the muscle groups.
 * Tapping an exercise opens its demo / form check.
 */
import React, { useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import DesignScreen, { type DesignMessage } from '../components/DesignScreen';
import { learnMovesBeforeJs, learnMovesData, athltSetDataJs } from '../lib/designScreens';
import { EXERCISE_CATALOG } from '../constants/exercises';

const SOURCE = require('../assets/app screens/myworkouts.html');
const BEFORE = learnMovesBeforeJs();

export default function LearnMovesScreen() {
  const router = useRouter();
  const dataJs = useMemo(() => athltSetDataJs(learnMovesData(EXERCISE_CATALOG as any)), []);
  const onMessage = useCallback((m: DesignMessage) => {
    if (m.type === 'back') router.back();
    else if (m.type === 'openMove' && m.id) router.push(`/formcheck?exercise=${encodeURIComponent(String(m.id))}` as any);
  }, [router]);
  return <DesignScreen name="learn-moves" source={SOURCE} beforeJs={BEFORE} dataJs={dataJs} onMessage={onMessage} />;
}
