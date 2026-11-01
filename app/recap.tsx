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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Share, TouchableOpacity, Animated } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { useVideoPlayer, VideoView } from 'expo-video';
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
import { DC_VIEWPORT_JS, dcScaleFitJs, recapDataJs, formatDuration } from '../lib/recapInject';
import { repFeedbackDataJs } from '../lib/repFeedbackInject';
import { athltSetDataJs } from '../lib/dcLogicPatch';
import { warmWant, warmPrepare, warmActivate, warmDeactivate, warmRelease, warmSetBg, warmSetOverlay } from '../components/WarmSurfaces';
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
const ALL_SETS_HTML = require('../assets/app screens/allsetsfullworkout.html');

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
const BUILD_TAG = 'native-video-13';
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

function generateSummary(reps: number, goodReps: number, hasFormData = true): string {
  const pct = reps > 0 ? Math.round((goodReps / reps) * 100) : 0;
  if (reps === 0)  return 'No reps were detected this session. Try positioning the phone so your full body is visible from the side.';
  if (!hasFormData) return `${reps} reps counted. Form wasn't scored for this session. These are rep-counter movements, so they build training volume without a form grade.`;
  if (pct === 100) return `Every one of your ${reps} reps hit good form. That's the kind of consistency that builds real strength over time.`;
  if (pct >= 80)   return `Solid session. You hit good form on ${goodReps} of ${reps} reps (${pct}%).`;
  if (pct >= 50)   return `You hit good form on ${goodReps} of ${reps} reps (${pct}%). Slow the rep down and focus on full range of motion.`;
  return `${reps} reps completed, ${goodReps} in good form (${pct}%). Focus on control over speed next session.`;
}

type InMsg = {
  type: 'back' | 'seeRanks' | 'share' | 'shareVideo' | 'viewRepFeedback'
      | 'viewAllSets' | 'closeAllSets' | 'closeRanks' | 'doneRanks' | 'ready' | 'videoDebug' | 'pageConsole';
  msg?: string;
  code?: number;
  level?: string;
};

// ─── allsetsfullworkout.html — grid of every exercise/set completed. Also
// 100% hardcoded demo data (fake Squats/Push-ups/Rows/Lunges sets, no
// props read anywhere) — default tiles are torn out and replaced with one
// real tile per actual exercise. NO video thumbnails on them: this app has
// no reliable per-exercise video in workout mode (see this file's own
// top doc comment), and solo/history mode only ever has ONE entry anyway
// — a real thumbnail grid isn't something real data exists for here, so
// plain dark cards with the real name + rep/form stats instead. The
// filter chips and save/search icons are the artboard's own internal demo
// state with no real equivalent to drive them — left in place (harmless,
// just inert) rather than torn out for a cosmetic gap.
function allSetsInject(opts: {
  tiles: { title: string; meta: string }[];
  videoTileIndex: number | null;
}): string {
  const { tiles, videoTileIndex } = opts;
  return dcScaleFitJs('#ffffff') + `
(function(){
  function post(m){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }catch(e){} }
  var TILES = ${JSON.stringify(tiles)};
  var VIDEO_IDX = ${JSON.stringify(videoTileIndex)};
  var built=false, recapWired=false, doneWired=false;
  function build(){
    if(built) return true;
    var grid=document.querySelector('#dc-root div[style*="grid-template-columns: 1fr 1fr"]');
    if(!grid) return false;
    while(grid.firstChild) grid.removeChild(grid.firstChild);
    TILES.forEach(function(t, i){
      var clickable = (i===VIDEO_IDX);
      var tile=document.createElement('div');
      tile.style.cssText='position:relative;height:150px;border-radius:22px;background:linear-gradient(180deg,#2c2c32 0%,#18181c 100%);overflow:hidden;'+(clickable?'cursor:pointer;':'');
      var label=document.createElement('div');
      label.style.cssText='position:absolute;left:12px;right:12px;bottom:12px;color:#ffffff;';
      var titleEl=document.createElement('div');
      titleEl.style.cssText='font-size:15.5px;font-weight:700;letter-spacing:-0.3px;';
      titleEl.textContent=t.title;
      var metaEl=document.createElement('div');
      metaEl.style.cssText='font-size:11.5px;font-weight:500;color:rgba(255,255,255,0.6);padding-top:4px;';
      metaEl.textContent=t.meta;
      label.appendChild(titleEl); label.appendChild(metaEl);
      tile.appendChild(label);
      // Explicit ask: "each set's video should show... tapping it should
      // play/replay properly." A real pixel-accurate thumbnail isn't
      // straightforward here — expo-video's generateThumbnailsAsync
      // returns a native shared image ref meant for expo-image, not a
      // URI/base64 this WebView's own HTML can use, and overlaying a
      // separate native <Image> precisely on this grid cell would mean
      // replicating this grid's layout math in RN — flagged as separate,
      // real scope, not done here. What's achievable now: a clear "this
      // is a tappable video" play-icon affordance (this tile WAS just a
      // plain stat box with no visual difference from the others), and
      // tapping it correctly opens rep-feedback.tsx, which now plays the
      // real clip with real native controls (today's other changes) —
      // so the "play/replay properly" part is genuinely fixed.
      if(clickable){
        var playBadge=document.createElement('div');
        playBadge.style.cssText='position:absolute;top:12px;right:12px;width:28px;height:28px;border-radius:14px;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;';
        playBadge.innerHTML='<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 2.5v11l10-5.5-10-5.5z" fill="#ffffff"/></svg>';
        tile.appendChild(playBadge);
      }
      if(clickable){ tile.addEventListener('click', function(ev){ ev.stopPropagation(); post({type:'viewRepFeedback'}); }, true); }
      grid.appendChild(tile);
    });
    built=true;
    return true;
  }
  function apply(){
    var ok=build();
    var hit=0;
    if(!recapWired){
      var recapLink=document.querySelector('#dc-root a[href="Workout Recap v2.dc.html"]');
      if(recapLink){ recapLink.addEventListener('click', function(ev){ ev.preventDefault(); post({type:'closeAllSets'}); }, true); recapWired=true; hit++; }
    }
    if(!doneWired){
      var doneLink=document.querySelector('#dc-root a[href="Workout Recap.dc.html"]');
      if(doneLink){ doneLink.addEventListener('click', function(ev){ ev.preventDefault(); post({type:'closeAllSets'}); }, true); doneWired=true; hit++; }
    }
    return ok && hit>=2;
  }
  if(!apply()) [200,500,1000,2000,3500,5000].forEach(function(d){ setTimeout(apply,d); });
  var root = document.getElementById('dc-root') || document.body;
  var mo = new MutationObserver(function(){ apply(); });
  mo.observe(root, { childList: true, subtree: true, characterData: true });
})();
true;
`;
}

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
  const webRef = useRef<WebView>(null);

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
      // Explicit ask: "Finish review" on rep-feedback.tsx should continue
      // on to the ranks/bodymap screen, not just return to summary — see
      // lib/repFeedbackSignal.ts for why a module-level flag is the
      // simplest way to signal that across the two screens.
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

  const [data, setData]             = useState<RecapData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const initialized = useRef(false);
  const persistRef = useRef<Promise<unknown>>(Promise.resolve());
  const [view, setView] = useState<'summary' | 'allsets' | 'ranks'>('summary');

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
        const existing = useWorkoutSessionStore.getState().getSummary();
        const summary = existing ?? finishWorkout();
        if (!summary) { setLoadFailed(true); return; }

        const entries: SessionEntry[] = summary.results
          .filter(r => r.completed)
          .map(r => ({
            ts: summary.finishedAt, exerciseId: r.exerciseId, displayName: r.displayName,
            reps: r.reps, goodReps: r.goodReps, pct: r.formScore,
            formChecked: r.formChecked,
          }));
        // ROOT CAUSE ("[recap-debug] blocked on loading gate: hasData:false"):
        // setData used to run only AFTER `await appendSessions` (an
        // AsyncStorage disk write), so the card's data — which is fully
        // known synchronously right here — sat behind storage I/O and the
        // screen rendered blank until it finished. Publish the data first;
        // persist in the background. The rank effect awaits persistRef so it
        // still reads sessions that include this one.
        setData({
          ts: summary.finishedAt, entries,
          totalReps: summary.totalReps, totalGoodReps: summary.totalGoodReps,
          pct: summary.overallFormScore, isHistory: false, workoutSummary: summary,
          durationSec: summary.durationSeconds,
          hasFormData: summary.results.some(r => r.completed && r.formChecked),
        });
        if (entries.length > 0) persistRef.current = appendSessions(entries).catch(() => {});
      } else if (isHistoryMode) {
        const all    = await getAllSessions();
        const groups = groupIntoWorkouts(all);
        const group  = groups.find(g => g.ts === Number(tsParam));
        if (!group) { setLoadFailed(true); return; }
        const historyVideoUri = await findSessionVideoUri(group.ts);
        setData({
          ts: group.ts, entries: group.entries,
          totalReps: group.totalReps, totalGoodReps: group.totalGoodReps,
          pct: group.pct, isHistory: true,
          hasFormData: group.entries.some(e => e.formChecked !== false),
          videoUri: historyVideoUri ?? undefined,
        });
      } else {
        const reps        = parseInt(repsStr ?? '0', 10);
        const goodReps     = parseInt(goodRepsStr ?? '0', 10);
        const formChecked = mode !== 'repCounter';
        const pct         = formChecked && reps > 0 ? Math.round((goodReps / reps) * 100) : 0;
        const soloTs      = Date.now();
        const exId        = exercise ?? 'unknown';
        const entry: SessionEntry = {
          ts: soloTs, exerciseId: exId,
          displayName: EXERCISE_DEFINITIONS[exId as ExerciseId]?.displayName ?? exId,
          reps, goodReps, pct, formChecked,
        };
        // Same fix as workout mode above: data first, persist in background.
        if (reps > 0) persistRef.current = appendSessions([entry]).catch(() => {});
        const parsedDuration = durationSecParam != null ? parseInt(durationSecParam, 10) : undefined;
        const soloVideoUri = typeof videoUriParam === 'string' && videoUriParam.length > 0 ? videoUriParam : undefined;
        setData({
          ts: soloTs, entries: reps > 0 ? [entry] : [],
          totalReps: reps, totalGoodReps: goodReps, pct, formChecked,
          hasFormData: formChecked,
          videoUri: soloVideoUri,
          repEvents: formChecked ? repEventsParam : [],
          isHistory: false,
          durationSec: parsedDuration != null && !isNaN(parsedDuration) ? parsedDuration : undefined,
        });
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
    return recapDataJs({
      totalReps: data.totalReps, moves: data.entries.length, pct: data.pct,
      hasFormData: data.hasFormData, durationSec: data.durationSec,
      overview: generateSummary(data.totalReps, data.totalGoodReps, data.hasFormData),
      hasVideo,
    });
  }, [data, hasVideo]);

  const allSetsInjectJs = useMemo(() => {
    if (!data) return null;
    return allSetsInject({
      tiles: data.entries.map(e => ({
        title: e.displayName,
        meta: e.formChecked !== false
          ? `${e.reps} reps · ${e.reps > 0 ? Math.round((e.goodReps / e.reps) * 100) : 0}% form`
          : `${e.reps} reps`,
      })),
      videoTileIndex: hasVideo && data.entries.length > 0 ? 0 : null,
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
      await persistRef.current; // this session's own entries must be written first
      const all = await getAllSessions(); // already includes this session's own entries
      const prior = all.filter(s => s.ts < data.ts);
      const tiersAfter = computeMuscleTiers(all);
      const tiersBefore = computeMuscleTiers(prior);
      const standingAfter = computeOverallStanding(tiersAfter);
      const standingBefore = computeOverallStanding(tiersBefore);
      const icons: Partial<Record<Muscle, string | null>> = {};
      await Promise.all(workedMuscles(data.entries).slice(0, 2).map(async (w) => {
        icons[w.muscle] = await muscleIconDataUri(w.muscle);
      }));
      const emblem = await tierDataUri(standingAfter?.tier ?? 'bronze');
      if (cancelled) return;
      setRanksPayload(buildMuscleRanksPayload({
        entries: data.entries, tiersBefore, tiersAfter, standingBefore, standingAfter,
        labels: MUSCLE_LABELS,
        note: generateSummary(data.totalReps, data.totalGoodReps, data.hasFormData),
        iconFor: (m) => icons[m] ?? null,
        emblem,
      }));
      if (__DEV__) console.log('[recap] muscle page data ready');
    })().catch((err) => { if (__DEV__) console.warn('[recap] muscle page data failed', err); });
    return () => { cancelled = true; };
  }, [data]);

  const ranksDataJs = useMemo(() => (ranksPayload ? athltSetDataJs(ranksPayload) : null), [ranksPayload]);

  // 'ranks' falls back to 'summary' until its real data has finished
  // computing (async) — never shows a view with nothing real in it yet.
  const effectiveView: 'summary' | 'allsets' | 'ranks' =
    view === 'allsets' && allSetsInjectJs ? 'allsets' :
    view === 'ranks'   && ranksDataJs     ? 'ranks'   :
    'summary';

  // ── Warm surfaces ───────────────────────────────────────────────────────────
  // Workout Complete / rep feedback / muscle page are drawn by persistent,
  // already-loaded WebViews at the app root (components/WarmSurfaces.tsx), not
  // by a WebView mounted here — mounting one here is what cost ~0.5-1s of
  // artboard unpacking every time. This screen only hands them their data and
  // says which one is showing.
  const onWebMsg = useRef<(m: InMsg) => void>(() => {});

  // Start loading the other two now (rep feedback only if there's a video,
  // the muscle page not for a history review), so they are ready by the time
  // they're tapped. Everything is released (and a fresh page re-warmed) when
  // this screen goes away.
  useEffect(() => {
    if (!isHistoryMode) warmWant('ranks', true);
    return () => {
      warmRelease('recap'); warmRelease('ranks'); warmRelease('repfeedback');
      warmWant('ranks', false); warmWant('repfeedback', false);
    };
  }, [isHistoryMode]);
  useEffect(() => { if (hasVideo) warmWant('repfeedback', true); }, [hasVideo]);

  useEffect(() => { if (summaryDataJs) warmPrepare('recap', summaryDataJs); }, [summaryDataJs]);
  useEffect(() => { if (ranksDataJs) warmPrepare('ranks', ranksDataJs); }, [ranksDataJs]);
  // Rep feedback's data is known as soon as the recap's is, so its page is
  // filled in before anyone taps "View rep feedback" and opens instantly.
  useEffect(() => {
    if (!hasVideo || !data) return;
    warmPrepare('repfeedback', repFeedbackDataJs({
      exerciseName: data.entries[0]?.displayName ?? 'Exercise', hasVideo: true, reps: repEvents,
    }));
  }, [hasVideo, data, repEvents]);

  const warmKind: 'recap' | 'ranks' | null =
    effectiveView === 'summary' ? 'recap' : effectiveView === 'ranks' ? 'ranks' : null;
  useEffect(() => {
    if (!warmKind || !isFocused) return;
    warmActivate(warmKind, { onMessage: (m) => onWebMsg.current(m) });
    return () => warmDeactivate(warmKind);
  }, [warmKind, isFocused]);

  // Native colour under the page: dark until the native video has a frame,
  // then transparent so the video shows through where the artboard's own
  // video slot was.
  useEffect(() => { warmSetBg('recap', videoVisuallyReady ? 'transparent' : '#111114'); }, [videoVisuallyReady]);

  // Video controls must sit ABOVE the page, which now lives above the whole
  // navigator, so they're rendered by the host. Zone: below the back-chevron /
  // all-sets strip, above the card (same fixed canvas fractions as before).
  // Gated on isFocused: this screen stays mounted under rep feedback.
  useEffect(() => {
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
      {/* Only the all-sets grid still mounts its own WebView here; the
          summary and the muscle page are the warm ones (see above). */}
      {effectiveView === 'allsets' && (
        <WebView
          key="allsets"
          ref={webRef}
          source={ALL_SETS_HTML}
          originWhitelist={['*']}
          style={styles.web}
          injectedJavaScriptBeforeContentLoaded={DC_VIEWPORT_JS}
          injectedJavaScript={allSetsInjectJs ?? undefined}
          onMessage={(e) => {
            let msg: InMsg;
            try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
            onWebMsg.current(msg);
          }}
          onContentProcessDidTerminate={() => { webRef.current?.reload(); }}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          javaScriptEnabled
          domStorageEnabled
          bounces={false}
          overScrollMode="never"
          cacheEnabled={false}
          scrollEnabled={false}
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
        />
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
