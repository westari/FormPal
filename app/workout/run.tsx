/**
 * app/workout/run.tsx
 *
 * The per-exercise run flow. Manages two phases:
 *
 *   'intro' — the demo step: how to do the exercise (a demo-video
 *             placeholder + a few key form cues, pulled straight off the
 *             exercise's own live formChecks so there's one source of
 *             truth, not a second hand-written cue list to keep in sync),
 *             plus the exercise card + Start button. Start AND "Skip demo"
 *             both navigate to formcheck (or mark complete instantly for
 *             non-CV exercises) — skipping the demo doesn't skip the set,
 *             it just means you already know the movement.
 *
 *   'rest'  — countdown timer between exercises. Auto-advances to next intro.
 *             Shows what was just completed + next exercise preview.
 *
 * On mount the screen checks URL params. If exerciseId/reps/goodReps are present
 * (arriving back from formcheck), it records the result and enters 'rest' phase.
 * If not, it opens in 'intro' phase for the current exercise.
 *
 * When all exercises are done, navigates to /recap (mode=workout), which pulls
 * the finished WorkoutSummary from useWorkoutSessionStore itself.
 */

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Animated,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import ScreenBackground from '../../components/ScreenBackground';
import { useWorkoutSessionStore } from '../../store/workoutSessionStore';
import type { RepEventData } from '../../lib/sessionLog';
import { FONT, W, Sp, R, Elev, Col } from '../../constants/theme';
import { getExerciseDef } from '../../constants/exercises';
import { getDemoCues } from '../../lib/demoCues';

// ── "Don't show this demo again" preference — per exercise id, persisted ───
// across workouts (a real setting, not a one-session toggle: once you know
// push-ups, you know them next week too).
const SKIP_DEMO_KEY = 'formpal_skip_demo_exercises';

async function loadSkipDemoSet(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(SKIP_DEMO_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSkipDemoSet(set: Set<string>) {
  AsyncStorage.setItem(SKIP_DEMO_KEY, JSON.stringify([...set])).catch(() => {});
}

// ─── Constants ────────────────────────────────────────────────────────────────

// ROOT CAUSE (found investigating "chest press silently skips form tracking
// inside a workout"): this used to be its own hardcoded Set(['squat', 'curl',
// 'pushup']) — a second, silently-stale copy of exactly what ExerciseDef.
// isFormCheckable (constants/exercises.ts) already tracks per exercise (every
// catalog entry is isFormCheckable: true). Any exercise added to the catalog
// without ALSO being added here — chest press, lat pulldown, all ~46 others
// that were never in the 3-item Set — silently took the "non-CV" branch
// below (instant-complete, no camera) instead of erroring, which looks
// exactly like "the exercise doesn't work" with no error anywhere. Reading
// the flag directly off the shared exercise def makes this permanently
// impossible to go stale — there's no second list left to forget.
function isFormCheckable(exerciseId: string): boolean {
  return getExerciseDef(exerciseId)?.isFormCheckable === true;
}

function fmtSec(s: number): string {
  if (s <= 0) return '0';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : String(sec);
}

function scoreColor(pct: number): string {
  if (pct >= 75) return Col.good;
  if (pct >= 45) return Col.mid;
  return Col.low;
}

// ─── Demo step — demovideo.html, the real Claude-Design artboard, used
// directly via WebView (not a native rebuild — two earlier native rebuild
// attempts of the OLDER demostep.html still read as "not the real design").
// Unlike demostep.html (which had been hand-edited earlier this session to
// expose a window.__FORMPAL_DEMO global its script reads on mount),
// demovideo.html is a fresh, untouched export — its dc-script reads
// straight from this.props with no such hook, and this static bundle has
// no live prop-override channel. So real data goes in the same way every
// other artboard in this app gets personalized: literal-text DOM
// injection after mount, matching the file's own known default strings
// (extracted directly from its dc-script — see DEMO_VIDEO_DEFAULT_CUES)
// and swapping in the real exercise name/meta/position/cues. Taps still
// come back via postMessage, just through a custom listener here instead
// of a script-level hook. ─────────────────────────────────────────────────
const DEMO_STEP_HTML = require('../../assets/app screens/demovideo.html');

// The exact 3 default cue strings demovideo.html's dc-script falls back to
// (p.cues ?? [...] — cues has no data-props editor entry, so this default
// is always what actually renders in the static export). Matched in order
// against the real getDemoCues() result; a cue row with no real
// replacement (an exercise with <3 cues) gets hidden rather than left
// showing stale placeholder text.
const DEMO_VIDEO_DEFAULT_CUES = [
  'Hands just wider than your shoulders',
  'Body in one straight line, head to heels',
  'Lower until your chest nearly touches the floor',
];

// None of these Claude-Design exports ship a <meta name="viewport">.
// Without one, iOS WKWebView lays the page out in a 980px world and
// shrink-to-fits it (the artboard renders at ~40% size) — same fix
// onboarding.tsx's VIEWPORT_JS applies to every DC page there. Runs via
// injectedJavaScriptBeforeContentLoaded so it's in place before the
// artboard's own script/layout runs.
const DC_VIEWPORT_JS = `(function(){try{
  var m=document.querySelector('meta[name=viewport]');
  if(!m){ m=document.createElement('meta'); m.name='viewport'; (document.head||document.documentElement).appendChild(m); }
  m.setAttribute('content','width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}catch(e){}})(); true;`;

// Scale-to-fit for the standalone (non-onboarding) full-screen DC exports
// used in this file — FIXED 390x844 canvases, same as onboarding's DC
// pages, just without that file's shared bootstrap to lean on.
//
// BUG FOUND (device test, round 1): the original version used
// position:absolute + left/top 50% + translate(-50%,-50%) on #dc-root,
// with no explicit body height. Content painted fine (absolute elements
// paint regardless of an ancestor's collapsed height) but buttons stopped
// responding almost everywhere — body's own box was collapsing toward 0
// height. Replaced with position:relative + margin:auto + scale-only
// transform, body height explicitly set every fit() call.
//
// BUG FOUND (device test, round 2): that fix used "contain" scaling
// (Math.min of width-fit and height-fit) — correct for the onboarding
// question-style artboards (one slide in a sequence, letterboxing is
// fine), WRONG for these full-bleed video/card screens, which read as
// "the card doesn't reach the edges, there's a gap below and on the
// sides." These screens' own content is anchored to the top (status bar,
// now hidden) and bottom (the card) — scaling to fill the height EXACTLY
// (S = vh/H, not clamped to <=1) guarantees the bottom-anchored card
// lands flush with the real bottom edge every time; width is best-effort
// (cropped via overflow:hidden if the device is relatively wider than
// 390:844, which is the common case on modern phones — acceptable, the
// cropped margin is background, not content).
function dcScaleFitJs(bg: string): string {
  return `
  (function(){
    var W=390, H=844;
    var st=document.createElement('style');
    st.textContent='html{background:${bg}!important;overflow:hidden!important;}body{margin:0!important;padding:0!important;background:${bg}!important;overflow:hidden!important;}#dc-root{position:relative!important;margin:0 auto!important;width:'+W+'px!important;transform-origin:top center!important;}*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}';
    (document.head||document.documentElement).appendChild(st);
    var lastS=-1;
    function fit(){
      var root=document.getElementById('dc-root'); if(!root) return;
      var vh=window.innerHeight||H;
      var S=vh/H;
      if(Math.abs(S-lastS)>=0.002){ lastS=S; root.style.setProperty('transform','scale('+S+')','important'); }
      document.body.style.setProperty('height', vh+'px','important');
      document.documentElement.style.setProperty('height', vh+'px','important');
    }
    fit();
    window.addEventListener('resize', fit);
    [0,300,900,1500].forEach(function(d){ setTimeout(fit,d); });

    // The fake status bar ("9:41" + signal/battery icons) baked into every
    // one of these exports duplicates/overlaps the REAL device status bar
    // — hide it everywhere this bootstrap runs.
    function hideStatusBar(){
      var all=document.querySelectorAll('#dc-root div');
      for(var i=0;i<all.length;i++){
        var el=all[i]; if(el.children.length) continue;
        if((el.textContent||'').trim()==='9:41'){
          var row=el.parentElement;
          if(row){ row.style.setProperty('display','none','important'); return true; }
        }
      }
      return false;
    }
    if(!hideStatusBar()) [200,500,1000,2000].forEach(function(d){ setTimeout(hideStatusBar,d); });
  })();
  `;
}

function demoVideoInject(opts: {
  exName: string; sets: number; reps: number; stepIndex: number; stepTotal: number;
  cues: string[]; skipPref: boolean;
}): string {
  const { exName, sets, reps, stepIndex, stepTotal, cues, skipPref } = opts;
  const meta = `${sets} set${sets === 1 ? '' : 's'} · ${reps} rep${reps === 1 ? '' : 's'}`;
  const position = `${stepIndex} of ${stepTotal}`;
  const MAP: Record<string, string> = {
    'Push-ups': exName,
    '3 sets · 12 reps': meta,
    '1 of 4': position,
  };
  DEMO_VIDEO_DEFAULT_CUES.forEach((def, i) => {
    if (cues[i]) MAP[def] = cues[i];
  });
  return dcScaleFitJs('#111114') + `
(function(){
  function post(m){ try{ window.ReactNativeWebView.postMessage(m); }catch(e){} }
  var MAP = ${JSON.stringify(MAP)};
  var HIDE_CUES_FROM = ${cues.length};
  var DEFAULT_CUES = ${JSON.stringify(DEMO_VIDEO_DEFAULT_CUES)};
  var SKIP_PREF = ${JSON.stringify(skipPref)};
  var hideApplied = false, backWired = false, readyWired = false, hideToggleWired = false;
  function apply(){
    var hit=0;
    var all=document.querySelectorAll('#dc-root div,#dc-root span');
    for(var i=0;i<all.length;i++){
      var el=all[i]; if(el.children.length) continue;
      var t=(el.textContent||'').trim();
      if(MAP[t]!=null && t!==MAP[t]){ el.textContent=MAP[t]; hit++; }
    }
    // Cue rows beyond the real cue count: hide the whole row (the text
    // div's parent — sc-camel-on-click="{{ c.pick }}" row), not just blank
    // the text, so there's no dangling placeholder-looking row.
    if(!hideApplied && HIDE_CUES_FROM < DEFAULT_CUES.length){
      var divs=document.querySelectorAll('#dc-root div');
      for(var j=0;j<divs.length;j++){
        var dt=(divs[j].textContent||'').trim();
        var idx=DEFAULT_CUES.indexOf(dt);
        if(idx>=0 && idx>=HIDE_CUES_FROM && !divs[j].children.length && divs[j].parentElement){
          divs[j].parentElement.style.display='none';
          hideApplied=true; hit++;
        }
      }
    }
    // Close (X) -> end workout. "I'm ready" / skip-demo -> start the set.
    // Both are <a href="...dc.html"> — real anchors would try to navigate
    // the WebView itself to a dead relative URL, so intercept clicks on
    // them specifically rather than letting the generic CTA regex (which
    // these pages don't use) guess.
    if(!backWired){
      var closeBtn=document.querySelector('#dc-root a[aria-label="Close"]');
      if(closeBtn){ closeBtn.addEventListener('click', function(ev){ ev.preventDefault(); post('__tap'); post('demoBack'); }, true); backWired=true; hit++; }
    }
    if(!readyWired){
      var readyLinks=document.querySelectorAll('#dc-root a[href="In Workout.dc.html"]');
      if(readyLinks.length){
        for(var k=0;k<readyLinks.length;k++){
          readyLinks[k].addEventListener('click', function(ev){ ev.preventDefault(); post('__tap'); post('demoReady'); }, true);
        }
        readyWired=true; hit++;
      }
    }
    if(!hideToggleWired){
      var hideRow=null;
      var cands=document.querySelectorAll('#dc-root div');
      for(var m=0;m<cands.length;m++){
        if((cands[m].textContent||'').trim()==="Don't show this demo again" && !cands[m].children.length){
          hideRow=cands[m].parentElement; break;
        }
      }
      if(hideRow){
        hideRow.addEventListener('click', function(ev){ post('__tap'); post('demoTogglePref'); }, true);
        // Pre-check the box to match the already-persisted preference —
        // the artboard's own "hide" state always starts false (no prop
        // override channel for it either), so sync it with one synthetic
        // click rather than leaving it visually unchecked while the real
        // preference is already on.
        if(SKIP_PREF){ hideRow.click(); }
        hideToggleWired=true; hit++;
      }
    }
    return hit>=3;
  }
  if(!apply()) [200,500,1000,2000,3500,5000].forEach(function(d){ setTimeout(apply,d); });
  else [1000,2500].forEach(function(d){ setTimeout(apply,d); });
  var root = document.getElementById('dc-root') || document.body;
  var mo = new MutationObserver(function(){ apply(); });
  mo.observe(root, { childList: true, subtree: true, characterData: true });
})();
true;
`;
}

function DemoStepWebView({
  exName, sets, reps, stepIndex, stepTotal, cues, skipPref, topInset, bottomInset,
  onBack, onReady, onTogglePref,
}: {
  exName: string; sets: number; reps: number; stepIndex: number; stepTotal: number;
  cues: string[]; skipPref: boolean; topInset: number; bottomInset: number;
  onBack: () => void; onReady: () => void; onTogglePref: () => void;
}) {
  const webRef = useRef<WebView>(null);

  // Same re-injection split as before: the INITIAL script only changes
  // when stepIndex changes (a genuinely new exercise) so it can stay an
  // injectedJavaScriptBeforeContentLoaded config prop without reloading
  // the WebView on every render; skipPref changes get pushed live after
  // the fact via injectJavaScript instead.
  const initialInject = useMemo(
    () => demoVideoInject({ exName, sets, reps, stepIndex, stepTotal, cues, skipPref }),
    [stepIndex] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    webRef.current?.injectJavaScript(demoVideoInject({ exName, sets, reps, stepIndex, stepTotal, cues, skipPref }));
  }, [skipPref]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <WebView
      ref={webRef}
      source={DEMO_STEP_HTML}
      originWhitelist={['*']}
      style={{ flex: 1, backgroundColor: '#1b1b1f' }}
      injectedJavaScriptBeforeContentLoaded={DC_VIEWPORT_JS}
      injectedJavaScript={initialInject}
      onMessage={(e) => {
        const m = e.nativeEvent.data;
        if (m === 'demoBack') onBack();
        else if (m === 'demoReady') onReady();
        else if (m === 'demoTogglePref') onTogglePref();
      }}
      allowFileAccess
      allowFileAccessFromFileURLs
      allowUniversalAccessFromFileURLs
      javaScriptEnabled
      domStorageEnabled
      bounces={false}
      overScrollMode="never"
      // Still under active editing — without this the WebView can go on
      // serving an old cached response after a reload, indistinguishable
      // from "the edit didn't actually change anything."
      cacheEnabled={false}
    />
  );
}

// ─── Connect music — connectmusic.html, shown once before every workout
// (not every exercise), right before the first exercise's demo, until the
// user checks "Don't show this page again" — then persisted forever via
// AsyncStorage, same pattern as SKIP_DEMO_KEY above. ───────────────────────
const SKIP_MUSIC_KEY = 'formpal_skip_connect_music';
const CONNECT_MUSIC_HTML = require('../../assets/app screens/connectmusic.html');

function connectMusicInject(): string {
  return dcScaleFitJs('#ffffff') + `
(function(){
  function post(m){ try{ window.ReactNativeWebView.postMessage(m); }catch(e){} }
  var hidden = false;
  var hideWired = false, ctaWired = false;
  function apply(){
    var hit = 0;
    if(!hideWired){
      var cands = document.querySelectorAll('#dc-root div');
      for(var i=0;i<cands.length;i++){
        if((cands[i].textContent||'').trim()==="Don't show this page again" && !cands[i].children.length){
          var row = cands[i].parentElement;
          if(row){ row.addEventListener('click', function(){ hidden = !hidden; }, true); hideWired=true; hit++; }
          break;
        }
      }
    }
    if(!ctaWired){
      var all=document.querySelectorAll('#dc-root div');
      for(var j=0;j<all.length;j++){
        var el=all[j]; if(el.children.length) continue;
        var t=(el.textContent||'').trim();
        if(t==='Continue'){
          el.addEventListener('click', function(ev){ ev.stopPropagation(); post('__tap'); post('musicContinue:'+(hidden?'1':'0')); }, true);
          ctaWired=true; hit++;
          break;
        }
      }
    }
    return hit>=2;
  }
  if(!apply()) [200,500,1000,2000,3500].forEach(function(d){ setTimeout(apply,d); });
  var root = document.getElementById('dc-root') || document.body;
  var mo = new MutationObserver(function(){ apply(); });
  mo.observe(root, { childList: true, subtree: true, characterData: true });
})();
true;
`;
}

function ConnectMusicWebView({ onContinue }: { onContinue: (dontShowAgain: boolean) => void }) {
  const inject = useMemo(() => connectMusicInject(), []);
  return (
    <WebView
      source={CONNECT_MUSIC_HTML}
      originWhitelist={['*']}
      style={{ flex: 1, backgroundColor: '#ffffff' }}
      injectedJavaScriptBeforeContentLoaded={DC_VIEWPORT_JS}
      injectedJavaScript={inject}
      onMessage={(e) => {
        const m = e.nativeEvent.data;
        if (m.indexOf('musicContinue:') === 0) onContinue(m.slice('musicContinue:'.length) === '1');
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
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type Phase = 'intro' | 'rest';

export default function WorkoutRunScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams<{
    exerciseId?: string;
    reps?:       string;
    goodReps?:   string;
    events?:     string;
    mode?:       string;   // 'repCounter' when the just-finished exercise's form wasn't judged
  }>();

  // Store actions
  const session           = useWorkoutSessionStore(s => s.session);
  const completeExercise  = useWorkoutSessionStore(s => s.completeExercise);
  const skipCurrent       = useWorkoutSessionStore(s => s.skipCurrentExercise);
  const abortWorkout      = useWorkoutSessionStore(s => s.abortWorkout);

  // Phase management (local — UI state, not in store)
  const [phase,    setPhase]    = useState<Phase | null>(null);
  const [restSec,  setRestSec]  = useState(60);
  const processed = useRef(false);
  // Set inside the layout effect below instead of calling router.replace()
  // directly there — see that effect's own comment for why.
  const [redirect, setRedirect] = useState<null | 'noSession' | 'done'>(null);

  // "Don't show this demo again" — see SKIP_DEMO_KEY's own comment.
  const [skipDemoPref, setSkipDemoPref] = useState(false);
  const skipDemoSetRef = useRef<Set<string> | null>(null);

  // Connect-music gate — shown once per WORKOUT (not per exercise), only
  // ahead of the very first exercise. 'loading' until the persisted
  // dismiss flag has been checked, so it never flashes on screen for
  // someone who already dismissed it for good.
  const [musicGate, setMusicGate] = useState<'loading' | 'show' | 'done'>('loading');
  useEffect(() => {
    if (!session || session.currentIndex !== 0) { setMusicGate('done'); return; }
    AsyncStorage.getItem(SKIP_MUSIC_KEY)
      .then((raw) => setMusicGate(raw === '1' ? 'done' : 'show'))
      .catch(() => setMusicGate('show'));
  }, [session?.currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Progress bar animation
  const progAnim = useRef(new Animated.Value(0)).current;

  // ── On-mount: process incoming results from formcheck ─────────────────────
  // useLayoutEffect, not useEffect — phase starts out null (see its own
  // comment below) and this is the only thing that ever sets it. A plain
  // useEffect fires AFTER the first frame is already painted, so every
  // entry into this screen — starting a workout, or coming back from the
  // camera between exercises — showed one real blank frame (phase === null
  // renders nothing) before snapping to the actual intro content. That
  // blank flash read as "the transition is glitchy." useLayoutEffect commits
  // the real phase before anything is presented to the screen, so there's
  // nothing to flash.
  //
  // IMPORTANT: this effect itself must never call router.replace() directly
  // — it used to, and that's exactly what crashed with "Attempted to
  // navigate before mounting the Root Layout component." useLayoutEffect
  // runs synchronously during the commit phase, which on a fresh mount can
  // fire before expo-router's own root navigator has finished registering
  // itself as ready to accept navigation calls. The actual redirect is
  // deferred to a plain useEffect below (fires after paint, once the
  // navigator is guaranteed ready) — this one only ever sets state.

  useLayoutEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const { exerciseId, reps: repsStr, goodReps: goodStr, events: eventsStr, mode } = params;

    if (!session) {
      // No active session — navigate back (deferred, see effect below)
      setRedirect('noSession');
      return;
    }

    if (exerciseId && repsStr != null && goodStr != null) {
      // Returning from formcheck with results
      const reps     = parseInt(repsStr, 10)  || 0;
      const goodReps = parseInt(goodStr, 10) || 0;
      let repEvents: RepEventData[] = [];
      try { repEvents = eventsStr ? JSON.parse(eventsStr) : []; } catch { repEvents = []; }

      completeExercise(exerciseId, reps, goodReps, repEvents, mode !== 'repCounter');

      // Read updated store state synchronously
      const updated = useWorkoutSessionStore.getState();
      if (!updated.hasMoreExercises()) {
        // All done — go to summary (deferred, see effect below)
        setRedirect('done');
        return;
      }

      // More exercises — straight to the next one's demo/intro. No rest
      // screen for now (explicit ask — the rest-timer phase below is kept
      // in the file, just not entered from here, so it's a one-line
      // reversal if that changes).
      setPhase('intro');
    } else {
      // Fresh start or returning from skip — show intro for current exercise
      setPhase('intro');
    }
  }, []); // intentionally run once on mount only

  // The actual navigation for the two "leave this screen" cases above —
  // runs as a normal (post-paint) effect, by which point the root
  // navigator is always ready.
  useEffect(() => {
    if (redirect === 'noSession') router.replace('/(tabs)/train' as any);
    else if (redirect === 'done') router.replace({ pathname: '/recap', params: { mode: 'workout' } } as any);
  }, [redirect, router]);

  // ── Animate progress bar ──────────────────────────────────────────────────

  useEffect(() => {
    if (!session) return;
    const fraction = session.workout.exercises.length > 0
      ? session.currentIndex / session.workout.exercises.length
      : 0;
    Animated.timing(progAnim, {
      toValue:         fraction,
      duration:        400,
      useNativeDriver: false,
    }).start();
  }, [session?.currentIndex, session?.workout.exercises.length]);

  // ── Rest timer ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'rest') return;

    // Interval just decrements the display counter — no side effects in updater
    const interval = setInterval(() => {
      setRestSec(s => Math.max(0, s - 1));
    }, 1000);

    // Timeout drives the actual advance (cleanup cancels it on skip)
    const timeout = setTimeout(() => {
      advanceToIntro();
    }, restSec * 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── "Don't show this demo again" — load the per-exercise preference each
  // time a fresh intro phase starts, so the toggle shows the right state.
  // AUTO-SKIP ITSELF IS TEMPORARILY OFF (explicit ask — the toggle got hit
  // a lot during testing just to see what it does, not as a real "never
  // show me this again," and having it silently skip the screen while
  // still checking the demo design itself was confusing more than it
  // helped). The toggle still saves/reflects the real preference below;
  // only the auto-navigate-away-because-of-it behavior is disabled. Flip
  // shouldSkip back into the condition below once the design's settled.
  useEffect(() => {
    if (phase !== 'intro' || !session) return;
    const ex = session.workout.exercises[session.currentIndex];
    if (!ex) return;
    let cancelled = false;
    (async () => {
      const set = skipDemoSetRef.current ?? await loadSkipDemoSet();
      if (cancelled) return;
      skipDemoSetRef.current = set;
      const shouldSkip = set.has(ex.exerciseId);
      setSkipDemoPref(shouldSkip);
      // if (shouldSkip && isFormCheckable(ex.exerciseId)) handleStartExercise();
    })();
    return () => { cancelled = true; };
  }, [phase, session?.currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleSkipDemoPref() {
    if (!session) return;
    const ex = session.workout.exercises[session.currentIndex];
    if (!ex) return;
    const set = skipDemoSetRef.current ?? await loadSkipDemoSet();
    if (set.has(ex.exerciseId)) set.delete(ex.exerciseId);
    else set.add(ex.exerciseId);
    skipDemoSetRef.current = set;
    setSkipDemoPref(set.has(ex.exerciseId));
    saveSkipDemoSet(set);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function advanceToIntro() {
    const st = useWorkoutSessionStore.getState();
    if (!st.hasMoreExercises()) {
      router.replace({ pathname: '/recap', params: { mode: 'workout' } } as any);
    } else {
      setPhase('intro');
    }
  }

  function handleStartExercise() {
    if (!session) return;
    const ex = session.workout.exercises[session.currentIndex];
    if (!ex) return;

    if (isFormCheckable(ex.exerciseId)) {
      // Navigate to formcheck — REPLACE the current run screen so going back
      // from formcheck exits the workout flow (back to overview/train).
      const nextEx = session.workout.exercises[session.currentIndex + 1];
      router.replace({
        pathname: '/formcheck' as any,
        params:   {
          exercise:          ex.exerciseId,
          returnTo:          '/workout/run',
          workoutExerciseId: ex.exerciseId,
          targetSets:        String(ex.targetSets),
          targetReps:        String(ex.targetReps),
          nextExerciseName:  nextEx ? nextEx.displayName : '',
        },
      });
    } else {
      // Non-CV exercise: record full target reps immediately as "completed".
      // Form was never judged here — mark it rep-count-only so it doesn't
      // land in the workout as "100% good form".
      const reps = ex.targetSets * ex.targetReps;
      completeExercise(ex.exerciseId, reps, reps, [], false);

      const updated = useWorkoutSessionStore.getState();
      if (!updated.hasMoreExercises()) {
        router.replace({ pathname: '/recap', params: { mode: 'workout' } } as any);
        return;
      }
      // No rest screen for now — see the matching comment in the mount
      // effect above.
      setPhase('intro');
    }
  }

  function handleSkipExercise() {
    skipCurrent();
    const updated = useWorkoutSessionStore.getState();
    if (!updated.hasMoreExercises()) {
      router.replace({ pathname: '/recap', params: { mode: 'workout' } } as any);
      return;
    }
    setPhase('intro');
  }

  const handleEndWorkout = useCallback(() => {
    Alert.alert(
      'End workout?',
      'Progress so far will be saved.',
      [
        { text: 'Continue', style: 'cancel' },
        {
          text:    'End workout',
          style:   'destructive',
          onPress: () => router.replace({ pathname: '/recap', params: { mode: 'workout' } } as any),
        },
      ],
    );
  }, [router]);

  // ── Derived display data ───────────────────────────────────────────────────

  if (!session || phase === null) return null;

  // Gate on the connect-music screen before anything else in the workout
  // — only reachable with musicGate === 'show' on the first exercise
  // (session.currentIndex === 0), per the effect above.
  if (musicGate === 'show') {
    return (
      <ConnectMusicWebView
        onContinue={(dontShowAgain) => {
          if (dontShowAgain) AsyncStorage.setItem(SKIP_MUSIC_KEY, '1').catch(() => {});
          setMusicGate('done');
        }}
      />
    );
  }
  if (musicGate === 'loading') return null;

  const totalEx     = session.workout.exercises.length;
  const doneCount   = session.currentIndex;
  const currentEx   = session.workout.exercises[session.currentIndex] ?? null;
  const nextEx      = session.workout.exercises[session.currentIndex + 1] ?? null;
  const demoCues    = currentEx ? getDemoCues(currentEx.exerciseId) : [];

  // Last completed result (for rest phase display)
  const lastResult  = session.results[session.currentIndex > 0 ? session.currentIndex - 1 : 0];

  // The demo step is a full-bleed WebView, not a normal native page — no
  // safe-area spacer above it (the video area is meant to run edge to
  // edge behind the status bar, same as the artboard; the WebView gets
  // insets.top itself and pads its OWN back button/step pill away from
  // the notch instead), and no outer End workout bar either (the video
  // area's own back chevron already does that, via demoBack).
  const isDemoStep = phase === 'intro' && !!currentEx && isFormCheckable(currentEx.exerciseId);

  return (
    <ScreenBackground>
      {/* Safe-area top */}
      {!isDemoStep && <View style={{ height: insets.top + 8 }} />}

      {/* Progress bar + counter — hidden on the demo step: the video area's
          own "X of Y" pill already carries this, and showing both was a
          literal duplicate of the same number at the top of the screen. */}
      {!isDemoStep && (
        <View style={s.progContainer}>
          <View style={s.progTrack}>
            <Animated.View
              style={[
                s.progFill,
                {
                  width: progAnim.interpolate({
                    inputRange:  [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={s.progLabel}>
            {doneCount} / {totalEx}
          </Text>
        </View>
      )}

      {/* ── INTRO PHASE ── */}
      {isDemoStep && currentEx && (
        <DemoStepWebView
          exName={currentEx.displayName}
          sets={currentEx.targetSets}
          reps={currentEx.targetReps}
          stepIndex={doneCount + 1}
          stepTotal={totalEx}
          cues={demoCues}
          skipPref={skipDemoPref}
          topInset={insets.top}
          bottomInset={insets.bottom}
          onBack={handleEndWorkout}
          onReady={handleStartExercise}
          onTogglePref={toggleSkipDemoPref}
        />
      )}

      {phase === 'intro' && currentEx && !isFormCheckable(currentEx.exerciseId) && (
        <>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.introScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={s.introHeader}>
              <View style={s.upNextPill}>
                <Text style={s.upNextTxt}>{doneCount === 0 ? 'First up' : 'Next up'}</Text>
              </View>
              <Text style={s.exTitle}>{currentEx.displayName}</Text>
              <Text style={s.exTarget}>
                {currentEx.targetSets} sets · {currentEx.targetReps} reps each
              </Text>
            </View>

            <View style={[s.infoCard, { marginTop: Sp.md, marginHorizontal: Sp.md }]}>
              <InfoRow icon="clock.fill" label="Rest between sets">
                {fmtSec(currentEx.restSeconds)}
              </InfoRow>
            </View>
          </ScrollView>

          <View style={s.introFooter}>
            <Pressable style={s.startBtn} onPress={handleStartExercise}>
              <SymbolView
                name="checkmark.circle.fill"
                size={16}
                tintColor="#fff"
                type="monochrome"
                style={{ width: 16, height: 16 }}
              />
              <Text style={s.startBtnTxt}>Mark Complete</Text>
            </Pressable>

            <Pressable onPress={handleSkipExercise} hitSlop={12}>
              <Text style={s.skipTxt}>Skip exercise</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* ── REST PHASE ── */}
      {phase === 'rest' && (
        <View style={s.phaseContainer}>
          {/* What you just did */}
          <View style={s.doneCard}>
            <SymbolView
              name="checkmark.circle.fill"
              size={24}
              tintColor={Col.good}
              type="monochrome"
              style={{ width: 24, height: 24 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.doneName}>{lastResult?.displayName ?? 'Exercise'}</Text>
              <Text style={s.doneMeta}>
                {lastResult?.reps ?? 0} reps
                {lastResult?.completed && lastResult.reps > 0
                  ? ` · ${lastResult.formScore}% form`
                  : lastResult?.skipped ? ' · skipped' : ''}
              </Text>
            </View>
            {lastResult?.completed && lastResult.reps > 0 && (
              <View
                style={[
                  s.scorePill,
                  { backgroundColor: scoreColor(lastResult.formScore) + '22' },
                ]}
              >
                <Text style={[s.scorePillTxt, { color: scoreColor(lastResult.formScore) }]}>
                  {lastResult.formScore}%
                </Text>
              </View>
            )}
          </View>

          {/* Rest timer */}
          <View style={s.timerBlock}>
            <Text style={s.restLabel}>REST</Text>
            <Text style={s.timerNum}>{fmtSec(restSec)}</Text>
          </View>

          {/* Next exercise preview */}
          {nextEx ? (
            <View style={s.nextCard}>
              <Text style={s.nextLabel}>NEXT</Text>
              <Text style={s.nextName}>{nextEx.displayName}</Text>
              <Text style={s.nextTarget}>
                {nextEx.targetSets} × {nextEx.targetReps}
              </Text>
            </View>
          ) : (
            <View style={s.nextCard}>
              <Text style={s.nextLabel}>ALMOST DONE</Text>
              <Text style={s.nextName}>Last exercise complete</Text>
            </View>
          )}

          {/* Skip rest */}
          <Pressable onPress={advanceToIntro} style={s.skipRestBtn} hitSlop={12}>
            <Text style={s.skipRestTxt}>Skip rest</Text>
            <SymbolView
              name="forward.fill"
              size={12}
              tintColor={Col.textSub}
              type="monochrome"
              style={{ width: 12, height: 12 }}
            />
          </Pressable>
        </View>
      )}

      {/* End workout — always visible, except the demo step (the WebView's
          own back chevron covers it there, and this bar's own reserved
          space was squeezing the WebView shorter than the full screen,
          which read as "everything's too high"). */}
      {!isDemoStep && (
        <View style={[s.endBar, { paddingBottom: Math.max(insets.bottom + 8, 16) }]}>
          <Pressable onPress={handleEndWorkout} hitSlop={12}>
            <Text style={s.endTxt}>End workout</Text>
          </Pressable>
        </View>
      )}
    </ScreenBackground>
  );
}

// ─── InfoRow ─────────────────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  children,
}: {
  icon:     string;
  label:    string;
  children: React.ReactNode;
}) {
  return (
    <View style={ir.row}>
      <SymbolView
        name={icon as any}
        size={14}
        tintColor={Col.textSub}
        type="monochrome"
        style={{ width: 14, height: 14 }}
      />
      <Text style={ir.label}>{label}</Text>
      <Text style={ir.value}>{children}</Text>
    </View>
  );
}

const ir = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flex: 1, fontSize: 14, color: Col.textSub, fontWeight: W.medium },
  value: { fontSize: 14, fontWeight: W.semi, color: Col.text },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  progContainer: {
    paddingHorizontal: Sp.md,
    paddingBottom:     Sp.md,
    gap:               6,
  },
  progTrack: {
    height:          5,
    backgroundColor: '#E8E8ED',
    borderRadius:    R.pill,
    overflow:        'hidden',
  },
  progFill: {
    height:          5,
    backgroundColor: '#0b1020',
    borderRadius:    R.pill,
  },
  progLabel: {
    fontSize:      11,
    fontWeight:    W.semi,
    color:         Col.textSub,
    letterSpacing: 0.3,
    textAlign:     'right',
  },

  phaseContainer: {
    flex:              1,
    paddingHorizontal: Sp.md,
    paddingTop:        Sp.xl,
    alignItems:        'stretch',
    gap:               Sp.md,
  },

  // ── Intro (demo step) ────────────────────────────────────────────────────

  introScroll: {
    paddingHorizontal: Sp.md,
    paddingTop:        Sp.xl,
    gap:               Sp.md,
    paddingBottom:     Sp.md,
  },
  introFooter: {
    paddingHorizontal: Sp.md,
    paddingTop:        Sp.sm,
    gap:               Sp.sm,
  },

  introHeader: { gap: 8, marginBottom: Sp.sm },
  upNextPill:  {
    alignSelf:         'flex-start',
    backgroundColor:   '#F0F0F4',
    borderRadius:      R.pill,
    paddingHorizontal: Sp.sm,
    paddingVertical:   4,
  },
  upNextTxt: { fontSize: 11, fontWeight: W.semi, color: Col.textSub, letterSpacing: 0.3 },

  exTitle: {
    fontFamily:    FONT.displayBold,
    fontSize:      36,
    color:         Col.text,
    letterSpacing: -0.8,
    lineHeight:    40,
  },
  exTarget: { fontSize: 16, color: Col.textSub, fontWeight: W.medium },

  infoCard: {
    backgroundColor: Col.card,
    borderRadius:    R.card,
    padding:         Sp.md,
    gap:             Sp.sm,
    boxShadow:       Elev.low.shadow,
  } as any,

  // ── Demo video area — dark placeholder standing in for the real clip ──────
  videoArea: {
    height:          300,
    backgroundColor: '#1B1B1F',
    borderRadius:    R.card,
    alignItems:      'center',
    justifyContent:  'center',
  },
  videoBackBtn: {
    position:        'absolute',
    left:            16,
    top:             16,
    width:           38,
    height:          38,
    borderRadius:    R.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  videoStepPill: {
    position:          'absolute',
    right:             16,
    top:               16,
    backgroundColor:   'rgba(255,255,255,0.16)',
    borderRadius:      R.pill,
    paddingHorizontal: 12,
    paddingVertical:   7,
  },
  videoStepTxt: { fontSize: 13, fontWeight: W.bold, color: '#fff' },
  videoPlayBtn: {
    width:           62,
    height:          62,
    borderRadius:    31,
    backgroundColor: '#fff',
    alignItems:      'center',
    justifyContent:  'center',
    paddingLeft:     3,
  },
  videoLabelPill: {
    position:          'absolute',
    bottom:            16,
    backgroundColor:   'rgba(255,255,255,0.16)',
    borderRadius:      R.pill,
    paddingHorizontal: 12,
    paddingVertical:   6,
  },
  videoLabelTxt: { fontSize: 12, fontWeight: W.bold, color: '#fff' },

  demoSheet: {
    marginTop: Sp.md,
    gap:       Sp.md,
  },
  demoNameCard: {
    backgroundColor: Col.card,
    borderRadius:    R.card,
    padding:         Sp.md,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    gap:             Sp.sm,
    boxShadow:       Elev.low.shadow,
  } as any,
  demoExName: {
    fontFamily:    FONT.displayBold,
    fontSize:      22,
    color:         Col.text,
    letterSpacing: -0.5,
    flexShrink:    1,
  },
  demoSetsPill: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             4,
    backgroundColor: '#F0F0F4',
    borderRadius:    R.pill,
    padding:         4,
    flexShrink:      0,
  },
  demoSetsChipActive: {
    backgroundColor:   Col.card,
    borderRadius:      R.pill,
    paddingHorizontal: 10,
    paddingVertical:   6,
    boxShadow:         Elev.low.shadow,
  } as any,
  demoSetsChipActiveTxt: { fontSize: 13, fontWeight: W.bold, color: Col.text },
  demoRepsTxt: { fontSize: 13, fontWeight: W.semi, color: Col.textSub, paddingHorizontal: 10, paddingVertical: 6 },

  cuesCard: {
    backgroundColor: '#EAEAEE',
    borderRadius:    R.card,
    padding:         Sp.sm,
    gap:             2,
  },
  cueRowNum: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    paddingVertical: 6,
    paddingRight:  10,
  },
  cueNumBadge: {
    width:           30,
    height:          30,
    borderRadius:    13,
    backgroundColor: Col.card,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
    boxShadow:       Elev.low.shadow,
  } as any,
  cueNumTxt: { fontSize: 13, fontWeight: W.bold, color: Col.text },
  cueTxt: { fontSize: 14, fontWeight: W.medium, color: Col.text, flexShrink: 1, lineHeight: 19 },

  demoPrefRow: {
    backgroundColor: Col.card,
    borderRadius:    R.card,
    paddingVertical: Sp.sm,
    paddingHorizontal: Sp.md,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    gap:             Sp.sm,
    boxShadow:       Elev.low.shadow,
  } as any,
  demoPrefTxt: { fontSize: 14, fontWeight: W.semi, color: Col.text, flexShrink: 1 },
  demoSwitch: {
    width:           46,
    height:          28,
    borderRadius:    R.pill,
    backgroundColor: '#E4E4EA',
    padding:         2,
    flexShrink:      0,
  },
  demoSwitchOn: { backgroundColor: '#0b1020' },
  demoSwitchKnob: {
    width:           24,
    height:          24,
    borderRadius:    12,
    backgroundColor: '#fff',
    boxShadow:       '0px 2px 5px rgba(0,0,0,0.2)',
  } as any,
  demoSwitchKnobOn: { transform: [{ translateX: 18 }] },

  skipExerciseTxt: {
    fontSize:   13,
    color:      Col.textDim,
    fontWeight: W.medium,
    textAlign:  'center',
  },

  startBtn: {
    backgroundColor:   '#0b1020',
    borderRadius:      R.pill,
    height:            56,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               10,
    boxShadow:         Elev.high.shadow,
    marginTop:         Sp.xs,
  } as any,
  startBtnTxt: {
    fontFamily:    FONT.displayBold,
    fontSize:      17,
    color:         '#fff',
    letterSpacing: 0.1,
  },
  skipTxt: {
    fontSize:   14,
    color:      Col.textDim,
    fontWeight: W.medium,
    textAlign:  'center',
  },

  // ── Rest ──────────────────────────────────────────────────────────────────

  doneCard: {
    backgroundColor: Col.card,
    borderRadius:    R.card,
    padding:         Sp.md,
    flexDirection:   'row',
    alignItems:      'center',
    gap:             Sp.sm,
    boxShadow:       Elev.low.shadow,
  } as any,
  doneName:    { fontSize: 14, fontWeight: W.semi, color: Col.text },
  doneMeta:    { fontSize: 12, color: Col.textSub, marginTop: 2 },
  scorePill:   {
    borderRadius:      R.pill,
    paddingHorizontal: 10,
    paddingVertical:   4,
  },
  scorePillTxt: { fontSize: 13, fontWeight: W.bold },

  timerBlock: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            4,
  },
  restLabel: {
    fontSize:      11,
    fontWeight:    W.bold,
    color:         Col.textDim,
    letterSpacing: 1.5,
  },
  timerNum: {
    fontFamily:    FONT.displayLight,
    fontSize:      96,
    color:         Col.text,
    letterSpacing: -3,
    lineHeight:    96,
  },

  nextCard: {
    backgroundColor: Col.card,
    borderRadius:    R.card,
    padding:         Sp.md,
    gap:             4,
    boxShadow:       Elev.low.shadow,
  } as any,
  nextLabel: {
    fontSize:      10,
    fontWeight:    W.bold,
    color:         Col.textDim,
    letterSpacing: 1.2,
  },
  nextName:   { fontSize: 17, fontWeight: W.semi, color: Col.text },
  nextTarget: { fontSize: 13, color: Col.textSub, fontWeight: W.medium },

  skipRestBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
  },
  skipRestTxt: { fontSize: 14, fontWeight: W.medium, color: Col.textSub },

  // ── End workout bar ──────────────────────────────────────────────────────

  endBar: {
    paddingHorizontal: Sp.md,
    paddingTop:        Sp.sm,
    alignItems:        'center',
  },
  endTxt: {
    fontSize:   13,
    fontWeight: W.medium,
    color:      Col.textDim,
  },
});
