/**
 * app/recap.tsx
 *
 * Renders the REAL Claude-Design artboards (assets/app screens/
 * workoutrecap.html for the summary, allsetsfullworkout.html,
 * muscleranks.html) directly via WebView, exactly as uploaded — explicit,
 * standing instruction: these files are used as-is, never rebuilt,
 * recreated, or redesigned, even to fix bugs/performance. `view` toggles
 * which is mounted (swapping `source`, forced to remount via `key`).
 *
 * Rep feedback (repfeedback.html) is its OWN route — app/rep-feedback.tsx
 * — still the exact same file, just reached by a real router.push instead
 * of a same-screen view-state swap (a navigation-architecture change, not
 * a redesign of the artboard itself). "View rep feedback" (from this
 * screen OR from the all-sets grid) posts {type:'viewRepFeedback'},
 * handled below by that router.push with the data it needs as params.
 *
 * All the actual data logic is unchanged from before (still real, still
 * correct): the three-mode load effect (workout / history / solo-live),
 * generateSummary for the overview line, and the Share/Share Video/
 * markWorkoutComplete handlers — just triggered via postMessage from the
 * WebView instead of a native onPress.
 *
 * ONE real data gap, not papered over: the design shows a video replay +
 * rep scrubber on EVERY completion. That's only possible for solo mode
 * (formcheck.tsx passes its own videoUri/events directly). A multi-exercise
 * WORKOUT has no reliable per-exercise video today — every exercise in a
 * workout is logged with the same shared finishedAt timestamp, so there's
 * no way to tell which recording (if any) belongs to which exercise. Rather
 * than guess and risk showing the wrong exercise's footage, "View rep
 * feedback" is hidden entirely in that case — same "only show what's
 * real" policy the rest of this file already follows.
 *
 * VIDEO ARCHITECTURE — 4th attempt, the one that actually addresses root
 * cause (explicit correction after 3 rounds of just changing how bytes got
 * into the WebView, which never mattered): playing video AT ALL inside
 * WKWebView runs it through that WebView's own memory-limited content
 * process, which iOS can and does terminate under pressure — that's the
 * actual "black/grey screen" cause, independent of base64 vs file:// vs a
 * local http server (all three just change how the source URL looks; none
 * of them change WHERE the video decodes). Fix: play it with expo-video
 * (a real native AVPlayer, its own process, nothing to do with the
 * WebView) positioned full-screen BEHIND the WebView; the WebView's own
 * background goes transparent so the native player shows through where
 * the artboard used to have its own <video>/<image-slot>. The WebView
 * never touches video bytes again.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Share, TouchableOpacity, Animated, InteractionManager } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView, type VideoThumbnail } from 'expo-video';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import { repFeedbackText } from '../lib/repFeedbackSentences';
import VideoControls from '../components/VideoControls';
import { repFeedbackSignal } from '../lib/repFeedbackSignal';
import { saveStreakToCloud } from '../lib/formpalSync';
import {
  getAllSessions, appendSessions, groupIntoWorkouts, calcStreak, computeMuscleTiers,
  type SessionEntry, type RepEventData,
} from '../lib/sessionLog';
import { findSessionVideoUri } from '../lib/sessionVideo';
import { EXERCISE_DEFINITIONS } from '../constants/exerciseDefinitions';
import { Muscle, type ExerciseId } from '../constants/exercises';
import { computeOverallStanding, MUSCLE_LABELS, MUSCLE_ICON_SOURCES } from '../components/MuscleTierMap';
import { Asset } from 'expo-asset';
import { buildMuscleRanksPayload, workedMuscles, type MuscleRanksPayload } from '../lib/muscleRanksData';
import { tierDataUri } from '../lib/rankImages';
import { allSetsDataJs } from '../lib/allSetsInject';
import { generateSummary, recapPageData } from '../lib/recapPrefetch';
import { postLag } from '../lib/postLag';
import { repFeedbackDataJs } from '../lib/repFeedbackInject';
import { athltSetDataJs } from '../lib/dcLogicPatch';
import { warmWant, warmPrepare, warmActivate, warmDeactivate, warmRelease, warmSetBg, warmSetOverlay, warmSetUnderlay } from '../components/WarmSurfaces';
import { useWorkoutSessionStore } from '../store/workoutSessionStore';
import type { WorkoutSummary } from '../store/workoutSessionStore';
import { usePlanStore } from '../store/planStore';

// The real Claude-Design artboards, used directly via WebView. Reverted
// back to this exactly — explicit instruction: "use those files as-is,
// never rebuild/recreate/redesign." Rep feedback is its own route
// (app/rep-feedback.tsx), still the exact repfeedback.html, not loaded
// here. Also 100% hardcoded demo data, no props channel — same DOM-
// replacement approach as everywhere else (see allSetsInject /
// muscleRanksInject).

// Build/bundle confirmation stamp — explicit ask ("add a small visible
// build stamp so I can confirm on device I'm running the new code").
// BUILD_TAG is a short label I update by hand each round I touch this
// file (bump it in the same commit as the real change). The timestamp
// below it is computed once when this JS MODULE is evaluated — i.e. every
// time Metro serves a fresh bundle to the device — so even without
// trusting BUILD_TAG, a changing "loaded at" time after a reload proves
// new JS actually landed, not a stale cached bundle. Explicit ask this
// round: remove the on-screen stamp — kept as a console log instead so
// it's still there to confirm a fresh reload if ever needed, just not
// visible on the card.
const BUILD_TAG = 'warm-5';
const BUILD_LOADED_AT = new Date().toLocaleTimeString();
if (__DEV__) {
  console.log(`[recap] build ${BUILD_TAG}`);
  console.log(`[recap-debug] build ${BUILD_TAG} loaded ${BUILD_LOADED_AT}`);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecapData {
  ts:              number;
  entries:         SessionEntry[];
  totalReps:       number;
  totalGoodReps:   number;
  pct:             number;
  videoUri?:       string;
  repEvents?:      RepEventData[];
  isHistory:       boolean;
  workoutSummary?: WorkoutSummary;
  durationSec?:    number;
  formChecked?:    boolean;
  hasFormData:     boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type InMsg = {
  type: 'back' | 'seeRanks' | 'share' | 'shareVideo' | 'viewRepFeedback'
      | 'viewAllSets' | 'closeAllSets' | 'closeRanks' | 'doneRanks' | 'ready' | 'videoDebug' | 'pageConsole';
  msg?: string;
  code?: number;
  level?: string;
};

// ─── Screen ───────────────────────────────────────────────────────────────────
// Real per-muscle Flaticon art (bronze tier — the page highlights muscles
// just trained in bronze) as a base64 data: URI the WebView can use. null for
// a muscle with no art yet (Forearms/LowerBack/Calves). Cached per muscle.
const muscleIconCache = new Map<Muscle, string | null>();
async function muscleIconDataUri(m: Muscle): Promise<string | null> {
  if (muscleIconCache.has(m)) return muscleIconCache.get(m) ?? null;
  const src = MUSCLE_ICON_SOURCES[m]?.bronze;
  if (!src) { muscleIconCache.set(m, null); return null; }
  try {
    // All MUSCLE_ICON_SOURCES entries are require()'d local PNGs, which always
    // resolve to a numeric module id — ImageSourcePropType is a broader type
    // (could also be {uri}) that Asset.fromModule's own signature doesn't
    // cover, hence the cast.
    const asset = Asset.fromModule(src as number);
    await asset.downloadAsync();
    const uri = asset.localUri || asset.uri;
    const out = `data:image/png;base64,${await new File(uri).base64()}`;
    muscleIconCache.set(m, out);
    return out;
  } catch (err) {
    if (__DEV__) console.error('[recap] muscle icon data-uri failed for', m, err);
    return null;
  }
}

export default function RecapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // BUG FOUND (item 3, "flashes then goes back to a grey screen"): the
  // strongest explanation for content showing then reverting is a SECOND
  // router.push to /rep-feedback firing right after the first — React
  // Navigation then has two instances of that route stacking, the first
  // (which had already shown real content) gets replaced/unmounted, and
  // the second starts from scratch (its own video-conversion effect
  // resets to the loading state) — which reads exactly as "flash, then
  // grey." The WebView's own click handler IS guarded against re-firing
  // (feedbackWired), but this guards the RECEIVING end too, which is more
  // robust regardless of why a second message might arrive — one tap can
  // only ever trigger one push. Reset when this screen regains focus
  // (i.e. the user came back from rep-feedback and might tap again).
  const navigatingToFeedback = useRef(false);
  useFocusEffect(
    useCallback(() => {
      navigatingToFeedback.current = false;
      setFinishing(false);
      // Explicit ask: "Finish review" on rep-feedback.tsx should continue
      // on to the ranks/bodymap screen, not just return to summary — see
      // lib/repFeedbackSignal.ts for why a module-level flag is the
      // simplest way to signal that across the two screens.
      if (repFeedbackSignal.openAllSets) {
        repFeedbackSignal.openAllSets = false;
        setView('allsets');
      }
      if (repFeedbackSignal.finishedReview) {
        repFeedbackSignal.finishedReview = false;
        setView('ranks');
      }
    }, [])
  );

  // DIAGNOSTIC — mount/unmount of the WHOLE RecapScreen (distinguishes "the
  // WebView remounted because its own key changed" from "the entire screen
  // got pushed/popped/remounted by navigation," which would show up here
  // as a second RecapScreen mount instead of just a WebView one).
  useEffect(() => {
    if (__DEV__) console.log('[recap-debug] RecapScreen MOUNTED');
    postLag('recap: screen mounted (first render done)');
    return () => { if (__DEV__) console.log('[recap-debug] RecapScreen UNMOUNTED'); };
  }, []);

  const {
    reps: repsStr, goodReps: goodRepsStr, videoUri: videoUriParam, events,
    exercise, ts: tsParam, mode, durationSec: durationSecParam,
  } = useLocalSearchParams<{
    reps?: string; goodReps?: string; videoUri?: string; events?: string;
    exercise?: string; ts?: string; mode?: string; durationSec?: string;
  }>();

  const isWorkoutMode = mode === 'workout';
  const isHistoryMode = !isWorkoutMode && tsParam != null;

  const finishWorkout       = useWorkoutSessionStore(s => s.finishWorkout);
  const abortWorkout        = useWorkoutSessionStore(s => s.abortWorkout);
  const markWorkoutComplete = usePlanStore(s => s.markWorkoutComplete);

  // Entries to write to the session log once on mount (the writes themselves
  // stay in the load effect below, in the background).
  const persistOnMount = useRef<SessionEntry[]>([]);
  // Workout and solo-live data are fully known RIGHT NOW (store / route
  // params), so they are built synchronously for the very first render. They
  // used to be set from an effect, which meant one blank black frame (~0.1s)
  // before anything — the Workout Complete card included — could be shown.
  // History mode really does need an async read and is still loaded in the
  // effect below.
  const [data, setData] = useState<RecapData | null>(() => {
    if (isWorkoutMode) {
      const summary = useWorkoutSessionStore.getState().getSummary() ?? finishWorkout();
      if (!summary) return null;
      const entries: SessionEntry[] = summary.results
        .filter(r => r.completed)
        .map(r => ({
          ts: summary.finishedAt, exerciseId: r.exerciseId, displayName: r.displayName,
          reps: r.reps, goodReps: r.goodReps, pct: r.formScore,
          formChecked: r.formChecked,
        }));
      persistOnMount.current = entries;
      return {
        ts: summary.finishedAt, entries,
        totalReps: summary.totalReps, totalGoodReps: summary.totalGoodReps,
        pct: summary.overallFormScore, isHistory: false, workoutSummary: summary,
        durationSec: summary.durationSeconds,
        hasFormData: summary.results.some(r => r.completed && r.formChecked),
      };
    }
    if (isHistoryMode) return null;
    const reps        = parseInt(repsStr ?? '0', 10);
    const goodReps    = parseInt(goodRepsStr ?? '0', 10);
    const formChecked = mode !== 'repCounter';
    const pct         = formChecked && reps > 0 ? Math.round((goodReps / reps) * 100) : 0;
    const soloTs      = Date.now();
    const exId        = exercise ?? 'unknown';
    const entry: SessionEntry = {
      ts: soloTs, exerciseId: exId,
      displayName: EXERCISE_DEFINITIONS[exId as ExerciseId]?.displayName ?? exId,
      reps, goodReps, pct, formChecked,
    };
    persistOnMount.current = reps > 0 ? [entry] : [];
    let soloEvents: RepEventData[] = [];
    try { soloEvents = JSON.parse(events ?? '[]'); } catch { /* none */ }
    const parsedDuration = durationSecParam != null ? parseInt(durationSecParam, 10) : undefined;
    return {
      ts: soloTs, entries: reps > 0 ? [entry] : [],
      totalReps: reps, totalGoodReps: goodReps, pct, formChecked,
      hasFormData: formChecked,
      videoUri: typeof videoUriParam === 'string' && videoUriParam.length > 0 ? videoUriParam : undefined,
      repEvents: formChecked ? soloEvents : [],
      isHistory: false,
      durationSec: parsedDuration != null && !isNaN(parsedDuration) ? parsedDuration : undefined,
    };
  });
  const [loadFailed, setLoadFailed] = useState(false);
  const initialized = useRef(false);
  const persistRef = useRef<Promise<unknown>>(Promise.resolve());
  const [view, setView] = useState<'summary' | 'allsets' | 'ranks'>('summary');
  // "Finish review" on rep feedback: show the muscle page at once, while that screen is still on top.
  const [finishing, setFinishing] = useState(false);
  useEffect(() => {
    repFeedbackSignal.onFinishReview = () => { postLag('recap: finish review -> switching to the muscle page'); setView('ranks'); setFinishing(true); };
    return () => { repFeedbackSignal.onFinishReview = null; };
  }, []);

  // VIDEO — real native AVPlayer via expo-video, positioned full-screen
  // behind the WebView (see file header). Source is data.videoUri
  // directly, the real recorded file — no conversion step of any kind.
  // useVideoPlayer recreates the player whenever the source actually
  // changes (it's keyed internally on JSON.stringify(source)), so passing
  // `null` until `data` loads and then the real path once it does is safe.
  const videoPlayer = useVideoPlayer(data?.videoUri ?? null, (p) => { p.loop = true; p.muted = false; });
  const videoFade = useRef(new Animated.Value(0)).current;
  const videoViewRef = useRef<VideoView>(null);
  // BUG FOUND ("black top", "video glitches on start"): the WebView's own
  // background was going transparent as soon as `hasVideo` was true — a
  // STATIC fact about the data, not about whether the video had an actual
  // frame on screen yet. `readyToPlay` only means the player has enough
  // data to BEGIN playback, not that a frame has been decoded/painted —
  // in the gap between "transparent" and "a real frame is actually
  // showing", there was nothing opaque left covering that area (WebView
  // transparent, video still faded to 0) except the screen's own dark
  // root background — that gap IS the black flash / glitch. Fix: track
  // actual visual readiness as its own state, flip it on `playingChange`
  // (isPlaying truly started, a stronger signal than merely "ready") not
  // `statusChange`, and gate the WebView's transparency on THAT instead
  // of the static `hasVideo` — so the WebView only goes transparent at
  // the exact moment there's something real to show through it.
  const [videoVisuallyReady, setVideoVisuallyReady] = useState(false);
  useEffect(() => {
    if (!data?.videoUri) return;
    videoFade.setValue(0);
    setVideoVisuallyReady(false);
    const statusSub = videoPlayer.addListener('statusChange', ({ status }) => {
      if (__DEV__) console.log('[recap-debug] videoPlayer statusChange:', status);
      if (status === 'readyToPlay') videoPlayer.play();
    });
    const playingSub = videoPlayer.addListener('playingChange', ({ isPlaying }) => {
      // DIAGNOSTIC — explicit ask: find why playingChange keeps flapping
      // false/true in a loop. currentTime near 0 each time points to the
      // loop (p.loop=true) restarting on a very short clip; a currentTime
      // that's NOT near the loop boundary points to something else
      // (buffering, audio session interruption) interrupting playback.
      if (__DEV__) console.log('[recap-debug] videoPlayer playingChange:', isPlaying, 'currentTime=', videoPlayer.currentTime, 'duration=', videoPlayer.duration);
      if (isPlaying) {
        setVideoVisuallyReady(true);
        Animated.timing(videoFade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      }
    });
    return () => { statusSub.remove(); playingSub.remove(); };
  }, [videoPlayer, data?.videoUri, videoFade]);

  // BUG FOUND ("closing the page glitches at the start of the close
  // animation"): the video block below used to be conditionally rendered
  // on `effectiveView === 'summary'`, so leaving summary (e.g. tapping
  // back, which calls setView('ranks')) UNMOUNTED the live VideoView
  // outright, with no fade — at the exact same moment the WebView below
  // tears down and remounts a brand new document (its `key={effectiveView}`
  // changes too). Two abrupt resets landing in the same render is the
  // glitch. Fix: keep VideoView mounted across view changes (gated on
  // `hasVideo` only, further down) and just fade/pause it here instead —
  // nothing to abruptly reset when the view switches.
  // BUG FOUND (device logs, this round): the above only accounted for
  // switching `view` WITHIN this screen — it never covered navigating
  // AWAY to a different route (e.g. "View rep feedback", which does a
  // router.push, not a setView). This screen stays mounted underneath the
  // new route, `view` never changes, so this player kept calling play()
  // the whole time rep-feedback.tsx's own screen — and its OWN unmuted
  // player — was active on top. Two simultaneously-playing, unmuted
  // AVPlayer instances fighting over the audio session is exactly what
  // the logs showed: both screens' `playingChange` flapping false/true in
  // an endless loop. Track real navigation focus (useFocusEffect, already
  // used elsewhere in this file) alongside `view`, and only play when
  // BOTH this screen is focused AND the view is 'summary'.
  const [isFocused, setIsFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );
  useEffect(() => {
    if (!data?.videoUri) return;
    if (view === 'summary' && isFocused) {
      videoPlayer.play();
    } else {
      videoPlayer.pause();
      Animated.timing(videoFade, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    }
  }, [view, isFocused, data?.videoUri, videoPlayer, videoFade]);


  const repEventsParam = useMemo<RepEventData[]>(() => {
    try { return JSON.parse(events ?? '[]'); }
    catch { return []; }
  }, [events]);

  // ── Load recap data (once) — three modes: workout / history / solo-live ────
  // Identical to the previous native version of this screen — only the
  // render target changed.
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    (async () => {
      if (isWorkoutMode) {
        if (!data) { setLoadFailed(true); return; }
        // The data was already published synchronously (see useState above);
        // persist in the background. The rank effect awaits persistRef so it
        // still reads sessions that include this one.
        if (persistOnMount.current.length > 0) persistRef.current = appendSessions(persistOnMount.current).catch(() => {});
      } else if (isHistoryMode) {
        const all    = await getAllSessions();
        const groups = groupIntoWorkouts(all);
        const group  = groups.find(g => g.ts === Number(tsParam));
        if (!group) { setLoadFailed(true); return; }
        const prevGroup = groups[groups.findIndex(g => g.ts === group.ts) + 1];
        const historyVideoUri = await findSessionVideoUri(group.ts, prevGroup?.ts ?? 0);
        setData({
          ts: group.ts, entries: group.entries,
          totalReps: group.totalReps, totalGoodReps: group.totalGoodReps,
          pct: group.pct, isHistory: true,
          hasFormData: group.entries.some(e => e.formChecked !== false),
          videoUri: historyVideoUri ?? undefined,
        });
      } else {
        // Solo-live: data was built synchronously above; persist in background.
        if (persistOnMount.current.length > 0) persistRef.current = appendSessions(persistOnMount.current).catch(() => {});
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasVideo = !!data?.videoUri;

  // ── Handlers (same real logic as before, now triggered by postMessage) ────

  const handleShare = useCallback(async () => {
    if (!data) return;
    const text = [
      isWorkoutMode ? 'Workout Complete' : 'Session Complete',
      `${data.totalReps} reps · ${data.entries.length} ${data.entries.length === 1 ? 'move' : 'moves'}` +
        (data.hasFormData && data.totalReps > 0 ? ` · ${data.pct}% form` : ''),
      generateSummary(data.totalReps, data.totalGoodReps, data.hasFormData),
    ].join('\n');
    try { await Share.share({ message: text }); } catch {}
  }, [data, isWorkoutMode]);

  const handleShareVideo = useCallback(async () => {
    if (data?.videoUri) {
      try {
        const available = await Sharing.isAvailableAsync();
        if (available) await Sharing.shareAsync(data.videoUri, { mimeType: 'video/mp4', dialogTitle: 'Share your FormPal replay' });
      } catch {}
    } else {
      await handleShare();
    }
  }, [data, handleShare]);

  // The real session-complete side effects — fires once, from the muscle-
  // ranks screen's "Done" (the real end of the flow now — see handleBack).
  const completeSession = useCallback(async () => {
    if (isWorkoutMode) {
      if (data?.workoutSummary?.workoutId) {
        try { await markWorkoutComplete(data.workoutSummary.workoutId); } catch {}
      }
      abortWorkout();
    }
  }, [isWorkoutMode, data, markWorkoutComplete, abortWorkout]);

  // History mode: a plain back, same as before (reviewing the past, not
  // finishing anything). Everything else: route through the muscle-ranks
  // "today's progress" screen first — explicit ask, "show muscle ranks
  // after the rep feedback, or wherever you exit out, right after all the
  // workout stuff." Its own "Done" (doneRanks message, below) is what
  // actually completes the session and navigates away now.
  const handleBack = useCallback(async () => {
    if (data?.isHistory) { router.back(); return; }
    setView('ranks');
  }, [data, router]);

  const handleDoneRanks = useCallback(async () => {
    await completeSession();
    const dest = isWorkoutMode ? '/(tabs)/train' : '/(tabs)/';
    // Explicit ask: "if you do a form check, it should never talk about
    // your streak — that has nothing to do with your streak, only on live
    // workouts." Streak is a real-workout concept (calcStreak counts
    // workout days) — a solo form-check session isn't one, so it skips
    // straight to dest instead of the streak screen.
    if (!isWorkoutMode) { router.replace(dest as any); return; }
    // Streak screen after every completed workout, with the real current
    // streak (sessions were already appended earlier in this screen's own
    // load, so calcStreak() here already reflects THIS workout). The
    // streak screen itself decides whether a progress-photo prompt comes
    // next (first-ever workout, or 14+ days since the last prompt) before
    // finally landing on dest.
    const sessions = await getAllSessions();
    const streakCount = calcStreak(sessions);
    const lastTs = sessions.length > 0 ? sessions[sessions.length - 1].ts : Date.now();
    saveStreakToCloud(streakCount, lastTs).catch(() => {});
    router.replace({ pathname: '/streak-screen', params: { count: String(streakCount), dest } } as any);
  }, [isWorkoutMode, completeSession, router]);

  // Real per-rep what/fix text (repFeedbackText — same function this file
  // already used), only meaningful when there's a real video to scrub to.
  // repFeedbackText now needs the exercise id (not a rotating index) to
  // pick exercise-specific wording — same id used for the history-mode
  // SessionEntry/EXERCISE_DEFINITIONS lookups elsewhere in this file.
  const repEvents = useMemo(() => {
    if (!hasVideo || !data) return [];
    const exerciseId = data.entries[0]?.exerciseId ?? '';
    // Explicit ask: "even if they're not back to back, [a repeated
    // issue] shouldn't repeat [the exact same feedback]." Counts how
    // many times this EXACT case (good, or this exact cue) has shown up
    // so far in the set — not the overall rep index — so the same issue
    // recurring later (with other reps in between) still rotates to a
    // different variant instead of repeating verbatim.
    const seenCount: Record<string, number> = {};
    const mapped = (data.repEvents ?? []).map((ev) => {
      const key = ev.good ? 'GOOD' : ev.reason;
      const occurrence = seenCount[key] ?? 0;
      seenCount[key] = occurrence + 1;
      // BUG FOUND ("feedback still sucks... too short"): repFeedbackText()
      // returns {what, fix} — a short observation AND the actual
      // instruction — but only `what` ever got extracted here. `fix`
      // (the real substance, e.g. "Push the weight all the way up until
      // your arms are completely straight overhead.") was computed and
      // thrown away, never reaching the screen at all. The rep-feedback
      // card only has one text slot (no separate line for `fix` in the
      // artboard), so both are combined into the one string it shows.
      const { what, fix } = repFeedbackText(ev.good, ev.reason, exerciseId, occurrence);
      return { timeSec: ev.timeSec, good: ev.good, what: `${what} ${fix}` };
    });
    // DIAGNOSTIC — explicit ask: "its stored form result/score, which
    // branch repFeedbackText() picked, and the final text shown."
    if (__DEV__) {
      console.log('[recap-debug] repEvents exerciseId=', exerciseId);
      mapped.forEach((m, i) => {
        console.log('[recap-debug] repEvent', i, 'good=', data.repEvents?.[i]?.good, 'reason=', JSON.stringify(data.repEvents?.[i]?.reason), '-> what=', JSON.stringify(m.what));
      });
    }
    return mapped;
  }, [hasVideo, data]);

  // Data half only: the page scaffold is already loaded in the warm WebView
  // (components/WarmSurfaces.tsx), so this just fills it in.
  const summaryDataJs = useMemo(() => {
    if (!data) return null;
    // Same builder lib/recapPrefetch.ts used before navigation, so the string
    // is identical and the page keeps the data it already has.
    return recapPageData({
      totalReps: data.totalReps, totalGoodReps: data.totalGoodReps, moves: data.entries.length,
      pct: data.pct, hasFormData: data.hasFormData, durationSec: data.durationSec, hasVideo,
    });
  }, [data, hasVideo]);

  // Real tiles for the warm All sets page (lib/allSetsInject.ts). Only the first
  // set has a recorded clip (one video per solo session), so only it can open
  // rep feedback / show a frame.
  const allSetsDataJsStr = useMemo(() => {
    if (!data) return null;
    return allSetsDataJs({
      tiles: data.entries.map((e, i) => ({
        title: e.displayName,
        ex: e.displayName,
        meta: e.formChecked !== false
          ? `${e.reps} reps · ${e.reps > 0 ? Math.round((e.goodReps / e.reps) * 100) : 0}% form`
          : `${e.reps} reps`,
        hasVideo: hasVideo && i === 0,
      })),
      videoIdx: hasVideo && data.entries.length > 0 ? 0 : null,
    });
  }, [data, hasVideo]);

  // "Today's progress" (muscleranks.html) — everything on it is real: standing
  // before vs. after this session (the SAME weakest-link standing the Progress
  // tab shows), each muscle's own gain, the muscles this workout actually
  // trained (rows + body map), the tier emblem. Built ahead of time, as soon
  // as the recap data exists, so by the time the user gets to this page it is
  // all ready and the page opens already in its final layout. Not computed for
  // history mode — "today's progress" doesn't mean anything for a past session
  // being reviewed, and handleBack never routes there in that case anyway.
  const [ranksPayload, setRanksPayload] = useState<MuscleRanksPayload | null>(null);
  useEffect(() => {
    if (!data || data.isHistory) return;
    let cancelled = false;
    (async () => {
      postLag('recap: rank payload start');
      // Everything that doesn't depend on anything else starts at once: the stored history is read while this
      // session's own write is still going (it used to wait for the write, then read the whole log a second time),
      // and the icon art for EVERY muscle this workout trained loads at the same time (the muscle page lists all of
      // them now, not just the top two).
      const iconsP = Promise.all(workedMuscles(data.entries).map(async (w) => [w.muscle, await muscleIconDataUri(w.muscle)] as const));
      const stored = await getAllSessions();
      postLag('recap: stored sessions read');
      // this workout's entries all carry data.ts; whether or not the write has landed yet, history = everything older
      const prior = stored.filter(s => s.ts < data.ts);
      const all = [...prior, ...data.entries];
      const tiersAfter = computeMuscleTiers(all);
      const tiersBefore = computeMuscleTiers(prior);
      const standingAfter = computeOverallStanding(tiersAfter);
      const standingBefore = computeOverallStanding(tiersBefore);
      postLag('recap: tiers + standing computed');
      const [iconPairs, emblem] = await Promise.all([iconsP, tierDataUri(standingAfter?.tier ?? 'bronze')]);
      const icons: Partial<Record<Muscle, string | null>> = {};
      iconPairs.forEach(([m, u]) => { icons[m] = u; });
      postLag('recap: icons + emblem ready');
      if (cancelled) return;
      setRanksPayload(buildMuscleRanksPayload({
        entries: data.entries, tiersBefore, tiersAfter, standingBefore, standingAfter,
        labels: MUSCLE_LABELS,
        note: generateSummary(data.totalReps, data.totalGoodReps, data.hasFormData),
        iconFor: (m) => icons[m] ?? null,
        emblem,
      }));
      if (__DEV__) console.log('[recap] muscle page data ready');
      postLag('recap: muscle page payload built');
    })().catch((err) => { if (__DEV__) console.warn('[recap] muscle page data failed', err); });
    return () => { cancelled = true; };
  }, [data]);

  const ranksDataJs = useMemo(() => (ranksPayload ? athltSetDataJs(ranksPayload) : null), [ranksPayload]);

  // 'ranks' falls back to 'summary' until its real data has finished
  // computing (async) — never shows a view with nothing real in it yet.
  const effectiveView: 'summary' | 'allsets' | 'ranks' =
    view === 'allsets' && allSetsDataJsStr ? 'allsets' :
    view === 'ranks'   && ranksDataJs     ? 'ranks'   :
    'summary';

  // ── Warm surfaces ───────────────────────────────────────────────────────────
  // Workout Complete / rep feedback / muscle page are drawn by persistent,
  // already-loaded WebViews at the app root (components/WarmSurfaces.tsx), not
  // by a WebView mounted here — mounting one here is what cost ~0.5-1s of
  // artboard unpacking every time. This screen only hands them their data and
  // says which one is showing.
  const onWebMsg = useRef<(m: InMsg) => void>(() => {});

  // All sets page: the video tile shows a REAL frame from the clip. The page
  // reports where the tile is; the frame comes from expo-video's native
  // thumbnail generator (no new native module) and is drawn over that spot.
  const [tileRect, setTileRect] = useState<{ l: number; t: number; w: number; h: number; vt: number; vb: number } | null>(null);
  const [thumb, setThumb] = useState<VideoThumbnail | null>(null);
  useEffect(() => {
    if (!hasVideo || thumb) return;
    let cancelled = false;
    const t0 = Date.now();
    const at = Math.max(0.3, repEvents[0]?.timeSec ?? 1);
    (async () => {
      try {
        const [frame] = await videoPlayer.generateThumbnailsAsync([at], { maxWidth: 640 });
        if (cancelled) return;
        if (__DEV__) console.log(`[recap] all-sets thumbnail OK at ${at}s in ${Date.now() - t0}ms`, frame ? `${(frame as any).width}x${(frame as any).height}` : 'none');
        if (frame) setThumb(frame);
      } catch (err) { if (__DEV__) console.warn('[recap] all-sets thumbnail FAILED', err); }
    })();
    return () => { cancelled = true; };
  }, [hasVideo, thumb, videoPlayer, repEvents]);

  // Behind the (transparent) All sets page: a white base, and — behind the video
  // tile — the real frame. The page's own tile is made transparent, so its
  // bookmark / play button / scrim / text all stay the design's own, drawn over
  // the frame. Clipped to the grid's scroll area so it never pokes under the header.
  useLayoutEffect(() => {
    warmSetUnderlay('allsets', (
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        {tileRect && (
          <View style={{ position: 'absolute', left: 0, right: 0, top: tileRect.vt, height: Math.max(0, tileRect.vb - tileRect.vt), overflow: 'hidden' }}>
            <View style={{ position: 'absolute', left: tileRect.l, top: tileRect.t - tileRect.vt, width: tileRect.w, height: tileRect.h, borderRadius: 22, overflow: 'hidden', backgroundColor: '#18181c' }}>
              {thumb && <ExpoImage source={thumb} style={StyleSheet.absoluteFill} contentFit="cover" />}
            </View>
          </View>
        )}
      </View>
    ));
  }, [tileRect, thumb]);

  // Start loading the other two now (rep feedback only if there's a video,
  // the muscle page not for a history review), so they are ready by the time
  // they're tapped. Everything is released (and a fresh page re-warmed) when
  // this screen goes away.
  useEffect(() => {
    if (!isHistoryMode) warmWant('ranks', true);
    // The 4th page (All sets) is only needed if the user taps it: mount it once the screen is idle (not at a fixed
    // 1.2s, which landed in the middle of the Workout complete animation and the rep feedback open).
    const task = InteractionManager.runAfterInteractions(() => { postLag('recap: mounting the All sets page (idle)'); warmWant('allsets', true); });
    return () => {
      task.cancel();
      warmRelease('recap'); warmRelease('ranks'); warmRelease('repfeedback'); warmRelease('allsets');
      warmWant('ranks', false); warmWant('repfeedback', false); warmWant('allsets', false);
    };
  }, [isHistoryMode]);
  useEffect(() => { if (hasVideo) warmWant('repfeedback', true); }, [hasVideo]);

  // Layout effects (not useEffect): they run before the first paint, so the
  // card is handed its data and revealed in the SAME frame this screen first
  // appears — no black frame in between.
  useLayoutEffect(() => { if (summaryDataJs) warmPrepare('recap', summaryDataJs); }, [summaryDataJs]);
  useEffect(() => { if (ranksDataJs) warmPrepare('ranks', ranksDataJs); }, [ranksDataJs]);
  // Rep feedback's data is known as soon as the recap's is, so its page is
  // filled in before anyone taps "View rep feedback" and opens instantly.
  useEffect(() => {
    if (!hasVideo || !data || !isFocused) return;
    // isFocused in the deps: rep feedback releases its page when it closes, so
    // coming back here re-fills the freshly warmed one for the next open.
    warmPrepare('repfeedback', repFeedbackDataJs({
      exerciseName: data.entries[0]?.displayName ?? 'Exercise', hasVideo: true, reps: repEvents,
    }));
  }, [hasVideo, data, repEvents, isFocused]);

  useEffect(() => { if (allSetsDataJsStr) warmPrepare('allsets', allSetsDataJsStr); }, [allSetsDataJsStr]);
  const warmKind: 'recap' | 'ranks' | 'allsets' | null =
    effectiveView === 'summary' ? 'recap' : effectiveView === 'ranks' ? 'ranks' : 'allsets';
  const mayShow = isFocused || finishing;
  useLayoutEffect(() => {
    if (!warmKind || !mayShow) return;
    warmActivate(warmKind, { onMessage: (m) => onWebMsg.current(m) });
    return () => warmDeactivate(warmKind);
  }, [warmKind, mayShow]);

  // Native colour under the page: dark until the native video has a frame,
  // then transparent so the video shows through where the artboard's own
  // video slot was.
  useEffect(() => { warmSetBg('recap', videoVisuallyReady ? 'transparent' : '#111114'); }, [videoVisuallyReady]);

  // Video controls must sit ABOVE the page, which now lives above the whole
  // navigator, so they're rendered by the host. Zone: below the back-chevron /
  // all-sets strip, above the card (same fixed canvas fractions as before).
  // Gated on isFocused: this screen stays mounted under rep feedback.
  useLayoutEffect(() => {
    warmSetOverlay('recap', hasVideo && isFocused
      ? <VideoControls player={videoPlayer} style={{ position: 'absolute', left: 0, right: 0, top: '11.85%', bottom: '42.65%' }} />
      : null);
  }, [hasVideo, isFocused, videoPlayer]);

  // ── Failure / loading states ────────────────────────────────────────────────

  if (loadFailed) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
      </View>
    );
  }

  if (!data || !summaryDataJs) {
    // Explicit ask: never gate the card on the video. The card (WebView)
    // shows as soon as its own real data is ready; the native video fades
    // in independently, whenever IT'S ready, via videoFade above.
    if (__DEV__) console.log('[recap-debug] blocked on loading gate:', { hasData: !!data, hasSummaryData: !!summaryDataJs });
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
      </View>
    );
  }

  onWebMsg.current = (msg: InMsg) => {
    if (__DEV__) console.log('[recap-debug] onMessage:', msg.type, 'current view=', view, 'effectiveView=', effectiveView);
    if (msg.type === 'videoDebug') { if (__DEV__) console.log('[recap-debug] video event:', msg.msg, msg.code); }
    else if (msg.type === 'pageConsole') { if (__DEV__) console.log(`[recap-page:${msg.level}]`, msg.msg); }
    else if (msg.type === 'back') void handleBack();
    else if (msg.type === 'share') void handleShare();
    else if (msg.type === 'shareVideo') void handleShareVideo();
    else if (msg.type === 'viewRepFeedback') {
      // Guard against a second push firing before this screen loses
      // focus (see navigatingToFeedback above) — one tap, one push.
      if (navigatingToFeedback.current) {
        if (__DEV__) console.log('[recap-debug] viewRepFeedback ignored — already navigating');
        return;
      }
      navigatingToFeedback.current = true;
      if (__DEV__) console.log('[recap-debug] router.push(/rep-feedback)');
      router.push({
        pathname: '/rep-feedback',
        params: {
          exerciseName: data.entries[0]?.displayName ?? 'Exercise',
          videoUri: data.videoUri ?? '',
          repEvents: JSON.stringify(repEvents),
        },
      } as any);
    }
    else if ((msg as any).type === 'tileRect') { const m = msg as any; setTileRect(m.none ? null : { l: m.l, t: m.t, w: m.w, h: m.h, vt: m.vt, vb: m.vb }); }
    else if ((msg as any).type === 'openSet') onWebMsg.current({ type: 'viewRepFeedback' });
    else if (msg.type === 'viewAllSets') setView('allsets');
    else if (msg.type === 'closeAllSets') setView('summary');
    else if (msg.type === 'closeRanks') setView('summary');
    else if (msg.type === 'doneRanks') void handleDoneRanks();
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {/* Native video — a real AVPlayer, its own process, nothing to do
          with the WebView (see file header). Sits BEHIND the WebView;
          the summary WebView's own background goes transparent above so
          this shows through where the artboard's own video slot was.
          Fades in independently of the card via videoFade — never blocks
          the card's own reveal. Stays mounted across view changes (gated
          on hasVideo only, not effectiveView) — see the close-glitch fix
          above; the pause/fade effect handles hiding it when not on
          'summary', so there's nothing to abruptly unmount here.
          Explicit ask: sized to the area ABOVE the card only (not full-
          bleed) so it doesn't get covered by it — bottom:'42.65%' is the
          same card-top boundary (844-484=360, 360/844≈42.65%) already
          used for the tap-to-reveal Pressable and the old video-only
          Pressable zone, not a new guessed number. */}
      {hasVideo && (
        <Animated.View style={[styles.videoArea, { opacity: videoFade }]} pointerEvents="none">
          <VideoView
            ref={videoViewRef}
            player={videoPlayer}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
            allowsPictureInPicture={false}
          />
        </Animated.View>
      )}
      {/* No native fallback back button any more — explicit ask ("one
          clear back button, not two"). Both non-summary views now have
          their own real, working back button: 'ranks' already did
          (lib/muscleRanksInject's back wiring), and 'allsets' already did too
          (allSetsInject's recapWired/doneWired) — this native one was
          showing ALONGSIDE allsets' own, the literal duplicate reported.
          Removing it entirely rather than re-scoping it further, since no
          view actually needs it any more. */}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111114' },
  web:  { flex: 1, backgroundColor: '#111114' },
  // BUG FOUND ("black shows behind the card's corners"): this used to
  // stop exactly at the card's top edge (42.65% ≈ 484px, same boundary).
  // The card's rounded top corners curve inward from that exact line, so
  // any sub-pixel mismatch between the two independently-computed
  // boundaries (this is a plain RN percentage; the card's is a scaled
  // CSS px value inside the WebView) exposes the dark root background
  // right at the corner notch. Extending a bit further down (~22px,
  // hidden safely under the now-opaque card — see cardWidened's height
  // bump above) removes any chance of that gap regardless of rounding.
  videoArea: { position: 'absolute', left: 0, right: 0, top: 0, bottom: '40%' },
});
