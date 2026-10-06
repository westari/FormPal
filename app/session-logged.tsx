/**
 * app/session-logged.tsx
 *
 * "Session logged" — shown right after app/log-session.tsx saves a manually
 * logged session. Renders the clean standalone rebuild of the "Session
 * logged" design artboard (assets/app screens/sessionlogged-screen.html)
 * via a WebView, same pattern as log-session.tsx's own screen (see that
 * file's header comment).
 *
 * The original design's stat tiles (6 sets, 65 reps, 1,020 lb volume),
 * streak (7 days), weekly bars (3 of 4), and the two exercise breakdown
 * rows were ALL hardcoded demo numbers baked into the markup — none of them
 * were wired to any prop. Every one of those is computed here instead, from
 * the real just-saved exercises (passed as nav params from log-session.tsx)
 * plus the real session log / rank-standing functions the rest of the app
 * already uses (lib/sessionLog.ts, lib/rank.ts's same computeOverallStanding
 * chain, components/MuscleTierMap.tsx's RankProgressCard copy pattern from
 * app/recap.tsx — reused rather than re-invented).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';

import { EXERCISE_UI } from './exercise-picker';
import type { ExerciseId } from '../constants/exercises';
import { getAllSessions, calcStreak, TIER_ORDER, tierIndex } from '../lib/sessionLog';
import { type OverallStanding } from '../components/MuscleTierMap';
import { TIER_META } from '../constants/tierPalette';
import { usePlanStore } from '../store/planStore';

const SESSION_LOGGED_HTML = require('../assets/app screens/sessionlogged-screen.html');
const DAY_MS = 24 * 60 * 60 * 1000;

type SavedExercise = { id: string; name: string; sets: { reps: number; w?: number }[] };

function parseStanding(raw: string): OverallStanding | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function sameCalendarDay(a: number, b: number): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

// Same copy logic as app/recap.tsx's RankProgressCard — see that
// component's own comment for the three shapes (ranked up / still
// climbing / at the top). Kept as plain text here (not JSX) since it's
// handed straight to the WebView to render.
function rankBodyText(before: OverallStanding | null, after: OverallStanding): string {
  if (after.atTop) return "You've hit the top rank there is. Nothing left to climb toward.";
  const rankedUp = !!before && before.tier !== after.tier;
  const meta = TIER_META[after.tier];
  if (rankedUp) return `Just climbed into ${meta.label}. Nice work.`;
  const idx = tierIndex(after.tier);
  const nextTier = TIER_ORDER[idx + 1];
  const nextMeta = nextTier ? TIER_META[nextTier] : null;
  const deltaPct = before ? Math.round((after.progress - before.progress) * 100) : null;
  if (!nextMeta) return '';
  let text = `${Math.round(after.progress * 100)}% of the way to ${nextMeta.label}`;
  if (deltaPct != null && deltaPct > 0) text += ` · +${deltaPct}% this session`;
  return text;
}

export default function SessionLoggedScreen() {
  const router = useRouter();
  const insets  = useSafeAreaInsets();
  const webRef  = useRef<WebView>(null);
  const params  = useLocalSearchParams<{
    rankBefore?: string; rankAfter?: string; savedAt?: string; exercises?: string;
  }>();

  const planProfile     = usePlanStore(s => s.profile);
  const planLoaded       = usePlanStore(s => s.isLoaded);
  const loadPlanFromStore = usePlanStore(s => s.loadFromStorage);
  useEffect(() => { if (!planLoaded) void loadPlanFromStore(); }, [planLoaded, loadPlanFromStore]);

  const [weeklyCount, setWeeklyCount] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [sessionDataLoaded, setSessionDataLoaded] = useState(false);

  const savedAt   = params.savedAt ? Number(params.savedAt) : Date.now();
  const exercises: SavedExercise[] = useMemo(() => {
    try { return params.exercises ? JSON.parse(params.exercises) : []; } catch { return []; }
  }, [params.exercises]);
  const rankBefore = useMemo(() => parseStanding(params.rankBefore ?? ''), [params.rankBefore]);
  const rankAfter  = useMemo(() => parseStanding(params.rankAfter ?? ''), [params.rankAfter]);

  // Real streak + "sessions in the last 7 days" — both read the log fresh
  // (the save already happened on the previous screen before navigating
  // here), not recomputed from just this one session's data.
  useEffect(() => {
    getAllSessions().then(all => {
      setStreak(calcStreak(all));
      const weekAgo = Date.now() - 7 * DAY_MS;
      const days = new Set(all.filter(s => s.ts >= weekAgo).map(s => {
        const d = new Date(s.ts); d.setHours(0, 0, 0, 0); return d.getTime();
      }));
      setWeeklyCount(days.size);
    }).catch(() => {}).finally(() => setSessionDataLoaded(true));
  }, []);

  const injectedDataJs = useMemo(() => {
    const sets   = exercises.reduce((n, e) => n + e.sets.length, 0);
    const reps   = exercises.reduce((n, e) => n + e.sets.reduce((m, s) => m + s.reps, 0), 0);
    const anyWeighted = exercises.some(e => e.sets.some(s => s.w != null && s.w > 0));
    const volume = anyWeighted
      ? exercises.reduce((n, e) => n + e.sets.reduce((m, s) => m + (s.w ?? 0) * s.reps, 0), 0)
      : null;

    const exRows = exercises.map(e => {
      const ui = EXERCISE_UI[e.id as ExerciseId];
      const weighted = e.sets.some(s => s.w != null && s.w > 0);
      const totalReps = e.sets.reduce((n, s) => n + s.reps, 0);
      const topWeight = weighted ? Math.max(...e.sets.map(s => s.w ?? 0)) : 0;
      return {
        name:   e.name,
        grad:   ui?.grad ?? ['#9A9AA2', '#62626A'],
        detail: weighted
          ? `${e.sets.length} sets · ${topWeight} lb top`
          : `${e.sets.length} sets · ${totalReps} reps`,
      };
    });

    // rankAfter is null whenever NO muscle has ever crossed Bronze across the
    // WHOLE log (lib/sessionLog.ts's computeOverallStanding) — real on a
    // fresh account, or a test account with too little logged volume yet,
    // not a bug. Rather than just hiding the whole rank section (which is
    // what left it looking like it had silently vanished), show the same
    // real "Unranked" state app/(tabs)/profile.tsx's avatar card already
    // uses for the exact same null case, instead of inventing a different
    // empty-state message for this one screen.
    const rank = rankAfter ? {
      unranked: false,
      tier: rankAfter.tier, label: TIER_META[rankAfter.tier].label,
      lo: TIER_META[rankAfter.tier].lo, hi: TIER_META[rankAfter.tier].hi, ink: TIER_META[rankAfter.tier].ink,
      progress: rankAfter.progress, atTop: rankAfter.atTop,
      rankedUp: !!rankBefore && rankBefore.tier !== rankAfter.tier,
      nextLabel: (() => {
        const idx = tierIndex(rankAfter.tier);
        const next = TIER_ORDER[idx + 1];
        return next ? TIER_META[next].label : '';
      })(),
      bodyText: rankBodyText(rankBefore, rankAfter),
    } : { unranked: true };

    const weekly = (planProfile?.daysPerWeek && weeklyCount != null)
      ? { count: Math.min(weeklyCount, planProfile.daysPerWeek), goal: planProfile.daysPerWeek }
      : null;

    const payload = {
      topInset: insets.top, bottomInset: insets.bottom,
      dayLabel: sameCalendarDay(savedAt, Date.now())
        ? 'Today'
        : new Date(savedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      rank,
      stats: { sets, reps, volume, streak },
      weekly,
      exercises: exRows,
    };
    return `window.__FORMPAL_LOGGED = ${JSON.stringify(payload)}; window.__formpalRenderLogged && window.__formpalRenderLogged(window.__FORMPAL_LOGGED); true;`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises, rankBefore, rankAfter, streak, weeklyCount, planProfile, insets.top, insets.bottom, savedAt]);

  // Streak/weekly load async (an AsyncStorage read), so the real payload
  // isn't known on the very first render. Previously this mounted the
  // WebView immediately and pushed the real data in later via a bare
  // useEffect + injectJavaScript — which races the native view's own
  // load: injectJavaScript calls made before the WebView has actually
  // finished loading its content silently no-op. That's exactly why the
  // screen rendered blank/empty (0 exercises, no rank card, heading
  // clipped under the status bar since --topInset never got set either).
  // Fixed the same way formcheck.tsx's repCounterIntroSeen flash was fixed
  // earlier this session: don't mount the WebView — or decide what to
  // inject — until the real data actually exists. Frozen into a ref the
  // moment it's ready so a later, unrelated re-render (e.g. the plan
  // profile resolving a beat after this) can never change the string
  // injectedJavaScriptBeforeContentLoaded receives (a changing value there
  // reconfigures/reloads the native WebView, same class of bug).
  const ready = sessionDataLoaded && planLoaded;
  const frozenDataJsRef = useRef<string | null>(null);
  if (ready && frozenDataJsRef.current === null) {
    frozenDataJsRef.current = injectedDataJs;
  }

  if (!frozenDataJsRef.current) {
    return <View style={styles.root}><StatusBar style="dark" /></View>;
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <WebView
        ref={webRef}
        source={SESSION_LOGGED_HTML}
        originWhitelist={['*']}
        style={styles.web}
        injectedJavaScriptBeforeContentLoaded={frozenDataJsRef.current}
        onMessage={(e) => {
          let msg: { type?: string };
          try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
          if (msg.type === 'done') router.replace('/(tabs)/' as any);
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
