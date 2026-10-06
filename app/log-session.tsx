/**
 * app/log-session.tsx
 *
 * "Log a Session" — manually record a set of exercises done without the
 * camera (no CV form-check, just reps/sets/weight you type in yourself).
 * Renders the clean standalone rebuild of the "Log a Session" design
 * artboard (assets/app screens/logsession-screen.html) via a WebView — same
 * pattern as app/workout/run.tsx's demo step (see that file's own comment
 * for why a plain static HTML/CSS/vanilla-JS rebuild, not a native
 * translation of the design, and not the original DC-bundled export
 * (assets/app screens/logsession.html, left in place as a reference/backup)
 * which needs the whole DCLogic/React/ReactDOM runtime to render at all.
 *
 * The original design's exercise search/catalog was a 9-item hardcoded demo
 * list (pushup/pullup/squat/goblet/swing/press/chinup/diamond/jumpsq) and
 * its two seeded exercise rows (goblet squat, push-up) were fake starting
 * data. Both are replaced here with the real thing: EXERCISE_CATALOG from
 * constants/exercises.ts (the app's own 56-exercise catalog — the same one
 * exercise-picker.tsx's Quick Form Check search uses), and an empty
 * exercise list until the user actually adds one.
 *
 * NOTE on catalog scope: this app also has constants/exerciseLibrary.ts, a
 * much bigger (873-exercise) imported reference library, currently unused
 * anywhere. It was NOT used here on purpose — lib/sessionLog.ts's
 * computeMuscleTiers only knows how to credit muscle-rank progress for
 * exercises that exist in EXERCISE_CATALOG (it looks up getExerciseDef(id)
 * and silently skips anything it doesn't recognize). Logging an exercise
 * from the bigger library would save fine but never move any muscle rank —
 * a real, silent gap. Using EXERCISE_CATALOG means every exercise you can
 * log here also counts toward your rank.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';

import { EXERCISE_CATALOG, Equipment, type ExerciseId } from '../constants/exercises';
import { EXERCISE_UI } from './exercise-picker';
import {
  getAllSessions, appendSessions, computeMuscleTiers,
  type SessionEntry,
} from '../lib/sessionLog';
import { computeOverallStanding, type OverallStanding } from '../components/MuscleTierMap';

const LOG_SESSION_HTML = require('../assets/app screens/logsession-screen.html');

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type SavedExercise = { id: string; name: string; sets: { reps: number; w?: number }[] };
type SaveMsg   = { type: 'save'; dayIdx: number; exercises: SavedExercise[] };
type BackMsg   = { type: 'back' };
type ViewMsg   = { type: 'viewProgress' };
type InMsg = SaveMsg | BackMsg | ViewMsg;

export default function LogSessionScreen() {
  const router = useRouter();
  const insets  = useSafeAreaInsets();
  const webRef  = useRef<WebView>(null);
  // Holds the real rank before/after + exercise/day data for the ONE
  // save that just happened, so the "See your progress" tap (a separate
  // round trip from the WebView, after the celebration animation plays)
  // can hand it straight to /session-logged without recomputing anything.
  const pendingResultRef = useRef<{
    rankBefore: OverallStanding | null;
    rankAfter:  OverallStanding | null;
    savedAt:    number;
    exercises:  SavedExercise[];
  } | null>(null);

  // Injected ONCE — the real catalog + real last-7-days labels never change
  // for the life of this screen, so there's no reason for this to ever
  // recompute/reinject (see run.tsx's demostep comment on why a changing
  // injectedJavaScriptBeforeContentLoaded string causes a WebView reload
  // that silently resets whatever JS state lives inside the page — this
  // screen's whole session-building state lives in the WebView itself, so
  // that would be a real bug here, not just wasted work).
  const initialDataJs = useMemo(() => {
    const catalog = (EXERCISE_CATALOG as readonly { id: string; displayName: string; equipment: Equipment[]; defaultReps: number }[])
      .map(def => {
        const ui = EXERCISE_UI[def.id as ExerciseId];
        const weighted = def.equipment.some(e => e !== Equipment.None);
        return {
          id:          def.id,
          name:        def.displayName,
          grad:        ui?.grad ?? ['#9A9AA2', '#62626A'],
          weighted,
          tag:         weighted ? 'Weighted' : 'Bodyweight',
          defaultReps: def.defaultReps,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const today = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push({ wk: i === 0 ? 'Today' : WEEKDAY[d.getDay()], num: d.getDate() });
    }

    const payload = { catalog, days, topInset: insets.top, bottomInset: insets.bottom };
    return `window.__FORMPAL_LOG = ${JSON.stringify(payload)}; window.__formpalRenderLog && window.__formpalRenderLog(window.__FORMPAL_LOG); true;`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleSave = useCallback(async (msg: SaveMsg) => {
    // Picking a day in the strip is a real choice of WHEN this session
    // happened, not cosmetic — ts is that day's date (at the current time of
    // day for "Today", noon for any other day, since there's no real time
    // to attach to a day picked from a 7-day strip).
    const daysAgo = 6 - msg.dayIdx;
    let ts = Date.now() - daysAgo * DAY_MS;
    if (daysAgo > 0) {
      const d = new Date(ts);
      d.setHours(12, 0, 0, 0);
      ts = d.getTime();
    }

    const entries: SessionEntry[] = msg.exercises.map(ex => ({
      ts,
      exerciseId:  ex.id,
      displayName: ex.name,
      reps:        ex.sets.reduce((n, s) => n + s.reps, 0),
      goodReps:    0,
      pct:         0,
      formChecked: false, // manually logged — no camera, no form judged
    }));

    const preSessions = await getAllSessions();
    const rankBefore   = computeOverallStanding(computeMuscleTiers(preSessions));

    await appendSessions(entries);

    const postSessions = await getAllSessions();
    const rankAfter      = computeOverallStanding(computeMuscleTiers(postSessions));

    pendingResultRef.current = { rankBefore, rankAfter, savedAt: ts, exercises: msg.exercises };
    webRef.current?.injectJavaScript('window.__formpalCelebrate && window.__formpalCelebrate(); true;');
  }, []);

  const handleViewProgress = useCallback(() => {
    const result = pendingResultRef.current;
    if (!result) { router.replace('/(tabs)/' as any); return; }
    router.replace({
      pathname: '/session-logged' as any,
      params: {
        rankBefore: result.rankBefore ? JSON.stringify(result.rankBefore) : '',
        rankAfter:  result.rankAfter ? JSON.stringify(result.rankAfter) : '',
        savedAt:    String(result.savedAt),
        exercises:  JSON.stringify(result.exercises),
      },
    });
  }, [router]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <WebView
        ref={webRef}
        source={LOG_SESSION_HTML}
        originWhitelist={['*']}
        style={styles.web}
        injectedJavaScriptBeforeContentLoaded={initialDataJs}
        onMessage={(e) => {
          let msg: InMsg;
          try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
          if (msg.type === 'back') handleBack();
          else if (msg.type === 'save') void handleSave(msg);
          else if (msg.type === 'viewProgress') handleViewProgress();
        }}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        javaScriptEnabled
        domStorageEnabled
        bounces={false}
        overScrollMode="never"
        cacheEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f4f6' },
  web:  { flex: 1, backgroundColor: '#f4f4f6' },
});
