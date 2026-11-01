/**
 * app/rep-feedback.tsx
 *
 * Dedicated route for the per-rep video review — explicit ask, after
 * repeated "flashes a bunch of random screens, stuck" reports on the old
 * same-screen view-state-toggle approach in recap.tsx:
 *   "Tapping 'View rep feedback' does exactly one router.push... No wash
 *   effect, no transition animation, no intermediate screens, no WebView
 *   in between."
 *
 * WHAT WAS ACTUALLY CAUSING THE EXTRA SCREENS (traced, not guessed): this
 * screen's artboard (repfeedback.html) ships with its own hardcoded demo
 * content baked in by default — a fake "Rows" exercise, a fake video
 * placeholder, 3 fake rep sentences. On every WebView mount that default
 * content paints FIRST (real content, just not yours), and only gets
 * swapped for your real exercise/video/reps a moment later once the
 * injected JS finds and replaces it (the same retry-based DOM-matching
 * every artboard in this app uses). That swap — blank mount, then the
 * artboard's own unrelated fake demo, then your real data — is what read
 * as "flashing through random screens." It was never a navigation bug;
 * the old view-state-toggle in recap.tsx made it WORSE (an extra
 * WebView remount on top of this), but didn't cause it.
 *
 * Fix here: the WebView stays invisible until the injected JS posts back
 * that it successfully replaced the demo content with real data for the
 * first time (or a timeout backstop) — so the fake demo content is never
 * shown at all, not even briefly.
 *
 * Still the exact repfeedback.html artboard (unchanged) — "use my exact
 * file" applies to the CONTENT; only the navigation architecture changed.
 *
 * VIDEO ARCHITECTURE — see recap.tsx's identical header comment for the
 * full history (base64, then file://+allowingReadAccessToURL, then a
 * local http server — none of which mattered, since the actual problem
 * was always video decoding happening INSIDE WKWebView's memory-limited
 * content process). Same fix here: expo-video plays the clip in a real
 * native AVPlayer behind the WebView; the WebView's own background goes
 * transparent so it shows through where the artboard's <image-slot> was.
 * Seeking to a specific rep now goes through a postMessage — the page has
 * no <video> element of its own to set .currentTime on any more.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Pressable, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';
import VideoControls from '../components/VideoControls';
import LiquidGlass from '../components/LiquidGlass';
import { repFeedbackDataJs } from '../lib/repFeedbackInject';
import { warmPrepare, warmActivate, warmDeactivate, warmRelease, warmSetBg, warmSetOverlay, warmInject } from '../components/WarmSurfaces';
import { repFeedbackSignal } from '../lib/repFeedbackSignal';

const SPEEDS = [0.5, 1, 1.5, 2];

// Build/bundle confirmation — explicit ask this round: a loud, impossible
// -to-miss tag to confirm the device is actually running this reload
// before trusting any other log below it.
const BUILD_TAG = 'native-video-18';
const BUILD_LOADED_AT = new Date().toLocaleTimeString();
if (__DEV__) {
  console.log(`[rep-feedback] build ${BUILD_TAG}`);
  console.log(`[rep-feedback-debug] build ${BUILD_TAG} loaded ${BUILD_LOADED_AT}`);
}

export default function RepFeedbackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { exerciseName, videoUri, repEvents: repEventsParam } = useLocalSearchParams<{
    exerciseName?: string; videoUri?: string; repEvents?: string;
  }>();

  // DIAGNOSTIC — full mount/unmount + WebView lifecycle logging, kept per
  // explicit instruction ("keep the build stamp and logs in for now").
  useEffect(() => {
    if (__DEV__) console.log('[rep-feedback-debug] MOUNT, params:', { exerciseName, videoUri, repEventsLen: repEventsParam?.length });
    return () => { if (__DEV__) console.log('[rep-feedback-debug] UNMOUNT'); };
  }, []);

  // VIDEO — real native AVPlayer via expo-video, positioned full-screen
  // behind the WebView (see file header). Source is `videoUri` directly —
  // the real recorded file path, no conversion, no local server. No more
  // async "waiting on the URL to resolve" gate at all — the player either
  // has a source or it doesn't, synchronously, from the route param.
  const hasVideo = !!videoUri;
  const { height: windowH } = useWindowDimensions();
  // Speed popover: the page reports where its speed button is (screen
  // points — the WebView fills the screen), RN draws the menu as real
  // Liquid Glass ABOVE that button.
  const [speedMenu, setSpeedMenu] = useState<{ left: number; top: number; width: number } | null>(null);
  const [speedIdx, setSpeedIdx] = useState(1);
  const videoPlayer = useVideoPlayer(videoUri ?? null, (p) => { p.loop = true; p.muted = false; p.timeUpdateEventInterval = 0.2; });
  const videoViewRef = useRef<VideoView>(null);

  // Parsed here (not down with the rest of the derived state below) so the
  // video-ready effect right below can seek to the first rep's real
  // position BEFORE playback starts — see that effect's own comment for why.
  const reps = useMemo<{ timeSec: number; good: boolean; what: string }[]>(() => {
    try {
      const parsed = JSON.parse(repEventsParam ?? '[]');
      if (__DEV__) console.log('[rep-feedback-debug] parsed reps from route param:', JSON.stringify(parsed));
      return parsed;
    }
    catch (err) { if (__DEV__) console.log('[rep-feedback-debug] repEvents JSON.parse failed:', err); return []; }
  }, [repEventsParam]);
  const videoFade = useRef(new Animated.Value(0)).current;
  // See recap.tsx's identical comment for the full reasoning — gates the
  // WebView's transparency on actual visual readiness (playingChange),
  // not just the static fact that a video exists, so there's no gap
  // where nothing opaque covers the video area.
  const [videoVisuallyReady, setVideoVisuallyReady] = useState(false);
  useEffect(() => {
    if (!videoUri) return;
    videoFade.setValue(0);
    setVideoVisuallyReady(false);
    const statusSub = videoPlayer.addListener('statusChange', ({ status }) => {
      if (__DEV__) console.log('[rep-feedback-debug] videoPlayer statusChange:', status);
      if (status === 'readyToPlay') {
        // BUG FOUND ("it keeps playing your video, like on the time you
        // were at on the workout complete card... then it resets everything
        // and goes to the right spot"): this used to call .play() straight
        // away, which starts the player from 0 (or wherever it already was)
        // — the correct start position (REPS[0].timeSec) was only ever sent
        // once the WebView's own injected JS unpacked and called show(0),
        // which posts a 'seek' message. That unpack takes real, multi-second
        // time (same bundle-unpack cost as every other artboard here), so
        // the video visibly played from the wrong spot for that whole
        // window before snapping to the right one. Seeking FIRST, using the
        // `reps` already available natively from the route param (no need
        // to wait on the page's own JS at all for this), means playback
        // starts in the right place from frame one — the page's own later
        // seek-to-REPS[0] becomes a harmless no-op.
        // (Used to seek to reps[0].timeSec here. The bar and the video now both
        // start at the very beginning; tapping a rep / Next is what seeks.)
        videoPlayer.play();
        // BUG FOUND ("time bar has to start at the beginning and go with
        // the actual video length"): the page's own scrub-bar thumb/fill
        // was positioned as a fraction of REP INDEX, not the video's
        // real time — a different scale than what dragging computes.
        // Pushes the real duration over once it's known so the page can
        // position by real time instead (see rep-feedback.tsx's own
        // window.__fpSetDuration in repFeedbackInject).
        const d = videoPlayer.duration;
        if (d > 0) {
          warmInject('repfeedback', `window.__fpSetDuration && window.__fpSetDuration(${d}); true;`);
        }
      }
    });
    const playingSub = videoPlayer.addListener('playingChange', ({ isPlaying }) => {
      // DIAGNOSTIC — same ask as recap.tsx: find why this flaps false/true
      // repeatedly. currentTime near 0 each time points to the loop
      // (p.loop=true) restarting on a very short clip.
      if (__DEV__) console.log('[rep-feedback-debug] videoPlayer playingChange:', isPlaying, 'currentTime=', videoPlayer.currentTime, 'duration=', videoPlayer.duration);
      if (isPlaying) {
        setVideoVisuallyReady(true);
        Animated.timing(videoFade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      }
    });
    // BUG FOUND ("time bar doesn't move, doesn't start at the beginning"):
    // the scrub thumb/fill was ONLY ever repositioned on a rep tap or once
    // on the initial duration push — never while the video was actually
    // playing, so it sat frozen at whatever rep's timestamp was last shown
    // instead of tracking real playback like a real scrubber. expo-video's
    // own timeUpdate event (interval set above) pushes the live time into
    // the page continuously; the page ignores it while a drag is in
    // progress (see trackEl's own `dragging` flag).
    const timeUpdateSub = videoPlayer.addListener('timeUpdate', ({ currentTime }) => {
      warmInject('repfeedback', `window.__fpSetCurrentTime && window.__fpSetCurrentTime(${currentTime}); true;`);
    });
    return () => { statusSub.remove(); playingSub.remove(); timeUpdateSub.remove(); };
  }, [videoPlayer, videoUri, videoFade, reps]);

  // The card is drawn by a persistent, already-loaded WebView at the app root
  // (components/WarmSurfaces.tsx) — mounting one here cost ~1s of artboard
  // unpacking. recap.tsx normally has already filled it in with this exact
  // data; this is the fallback if it hasn't.
  const onWebMsg = useRef<(m: any) => void>(() => {});
  useEffect(() => {
    if (!videoUri) return;
    warmPrepare('repfeedback', repFeedbackDataJs({ exerciseName: exerciseName ?? 'Exercise', hasVideo, reps }));
    warmActivate('repfeedback', { onMessage: (m) => onWebMsg.current(m) });
    return () => { warmDeactivate('repfeedback'); warmRelease('repfeedback'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUri]);
  useEffect(() => { warmSetBg('repfeedback', videoVisuallyReady ? 'transparent' : '#0d0d10'); }, [videoVisuallyReady]);

  // Everything drawn ABOVE the page (video controls, the speed popover) is
  // rendered by the host, since the page now lives above the whole navigator.
  useEffect(() => {
    if (!hasVideo) { warmSetOverlay('repfeedback', null); return; }
    warmSetOverlay('repfeedback', (
      <>
        {/* Zone stops right at the artboard's own speed/scrub/fullscreen row
            (844-498=346 -> 41.35% from bottom) so that row is never covered. */}
        <VideoControls player={videoPlayer} style={{ position: 'absolute', left: 0, right: 0, top: '11.85%', bottom: '41.35%' }} />
        {speedMenu && (
          <>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setSpeedMenu(null)} />
            <LiquidGlass
              radius={20}
              variant="regular"
              colorScheme="dark"
              fallbackColor="rgba(150,152,165,0.62)"
              style={[
                styles.speedMenu,
                // Opens UPWARD: its bottom edge sits just above the button.
                { left: Math.max(12, speedMenu.left), bottom: windowH - speedMenu.top + 8 },
              ]}
            >
              {SPEEDS.map((rate, i) => (
                <Pressable
                  key={rate}
                  onPress={() => {
                    videoPlayer.playbackRate = rate;
                    setSpeedIdx(i);
                    warmInject('repfeedback', `window.__fpSetSpeedLabel && window.__fpSetSpeedLabel(${JSON.stringify(rate + 'x')}); true;`);
                    setSpeedMenu(null);
                    if (__DEV__) console.log('[rep-feedback-debug] speed picked', rate);
                  }}
                  style={[styles.speedOpt, i === speedIdx && styles.speedOptOn]}
                >
                  <Text style={styles.speedOptTxt}>{rate}x</Text>
                </Pressable>
              ))}
            </LiquidGlass>
          </>
        )}
      </>
    ));
  }, [hasVideo, videoPlayer, speedMenu, speedIdx, windowH]);

  onWebMsg.current = (msg: { type?: string }) => {
    if (__DEV__) console.log('[rep-feedback-debug] onMessage:', msg.type);
    if (msg.type === 'ready') {
      // Push the real duration again now that 'ready' proves the page's own
      // functions are defined (the first push can race the data injection).
      const d = videoPlayer.duration;
      if (d > 0) warmInject('repfeedback', `window.__fpSetDuration && window.__fpSetDuration(${d}); true;`);
    }
    else if (msg.type === 'seek') {
      const t = (msg as any).timeSec ?? 0;
      videoPlayer.currentTime = t;
      if (__DEV__) console.log('[rep-feedback-debug] seek message received, timeSec=', t, '- videoPlayer.currentTime immediately after =', videoPlayer.currentTime);
    }
    else if (msg.type === 'close') router.back();
    else if (msg.type === 'finishReview') { repFeedbackSignal.finishedReview = true; router.back(); }
    else if (msg.type === 'openSpeedMenu') {
      const r = (msg as any).rect as { left: number; top: number; width: number } | undefined;
      if (r) setSpeedMenu(prev => (prev ? null : { left: r.left, top: r.top, width: r.width }));
    }
    else if (msg.type === 'setSpeed') {
      const rate = (msg as any).rate ?? 1;
      videoPlayer.playbackRate = rate;
    }
    else if (msg.type === 'scrub') {
      const frac = (msg as any).frac ?? 0;
      const d = videoPlayer.duration || 0;
      if (d > 0) videoPlayer.currentTime = frac * d;
      if (__DEV__) console.log('[rep-feedback-debug] scrub frac=', frac, 'duration=', d, '- videoPlayer.currentTime after =', videoPlayer.currentTime);
    }
    else if (msg.type === 'enterFullscreen') { void videoViewRef.current?.enterFullscreen(); }
    else if (msg.type === 'togglePlayPause') {
      if (videoPlayer.playing) videoPlayer.pause(); else videoPlayer.play();
    }
  };

  // Missing data — simple native message + back button, never a grey
  // screen (explicit ask).
  if (!videoUri) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar style="light" />
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={[styles.backBtn, { top: insets.top + 12 }]}>
          <SymbolView name="chevron.left" size={16} tintColor="#ffffff" type="monochrome" style={{ width: 16, height: 16 }} />
        </TouchableOpacity>
        <View style={styles.center}>
          <Text style={styles.msg}>This session's video couldn't be loaded.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {/* Native video — a real AVPlayer, its own process, nothing to do
          with the WebView (see file header). Sits BEHIND the WebView; the
          WebView's own background goes transparent above so this shows
          through where the artboard's own video slot was. Fades in
          independently of the card via videoFade — never blocks the
          card's own reveal (which only waits on `ready` below). */}
      {hasVideo && (
        // Explicit ask: "I like how the whole video is kind of moved up a
        // bit [on the workout complete card]... I want you to do the same
        // thing for [rep feedback]." recap.tsx constrains its video to the
        // top portion of the screen (styles.videoArea: top 0, bottom 40%)
        // instead of filling the whole screen behind the card — same
        // layout here now, instead of the full-screen video this had.
        <Animated.View style={[styles.videoArea, { opacity: videoFade }]} pointerEvents="none">
          <VideoView
            ref={videoViewRef}
            player={videoPlayer}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            // BUG FOUND ("stuck in fullscreen, no X, no native controls"):
            // this was false to avoid duplicating controls inline (the
            // WebView covers the video, so an inline tap never reached
            // AVKit's own chrome anyway). But setting it false ALSO
            // suppresses controls in the real fullscreen presentation
            // triggered by enterFullscreen() below — including AVKit's
            // own "Done" button, which is the only way out once you're
            // there. True now: inline it changes nothing (still covered
            // by the WebView, no tap reaches it there), but fullscreen
            // gets its real native chrome back, Done button included.
            nativeControls
            allowsPictureInPicture={false}
            // DIAGNOSTIC — explicit ask: "clicking X out of fullscreen
            // glitches the card." Nothing in this file currently reacts
            // to fullscreen enter/exit at all (confirmed by reading the
            // code, not assumed), so I can't find a cause to fix yet —
            // logged so next round's Metro output shows exactly what
            // player events (if any) fire around that moment, instead of
            // guessing at a fix with nothing to go on.
            onFullscreenEnter={() => { if (__DEV__) console.log('[rep-feedback-debug] onFullscreenEnter'); }}
            onFullscreenExit={() => { if (__DEV__) console.log('[rep-feedback-debug] onFullscreenExit — videoVisuallyReady=', videoVisuallyReady); }}
          />
        </Animated.View>
      )}
      {/* Explicit ask: "move All sets to the top-left corner, remove the
          text in that corner" — the WebView's own "All sets" link is
          ALREADY authored top-left in the artboard (wireNav's allSets
          handling posts {type:'close'} -> router.back(), same
          destination this native button went to). This native chevron
          was a redundant SECOND top-left control sitting on top of it —
          same "one clear button, not two" fix recap.tsx already got.
          Removed here too; the HTML's own control is the one back
          button now. The error-state return above (no videoUri, no
          WebView at all) keeps its own copy since there's no HTML
          control to fall back on there. */}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d10' },
  web: { flex: 1, backgroundColor: '#0d0d10' },
  // BUG FOUND ("too high up... black space, then the video" — a gap
  // between the video's bottom edge and the card's real top edge):
  // recap.tsx's own card happens to sit at 40% of screen height, but THIS
  // screen's card sits lower — confirmed directly from a real device log's
  // own card rect: top=559.19 of a 874-tall screen (bottom=874, confirming
  // full height), i.e. the card occupies the bottom 36.02% of the screen,
  // not 40%. Using that measured value closes the gap exactly instead of
  // guessing recap's number would also fit here.
  // Black showed on both sides of the card's top edge: the card has 36px rounded
  // top corners, and the video stopped exactly at the card's top (36%), leaving
  // the dark root background visible in the corner cut-outs. Video now runs
  // ~5% further down, behind the card, so the corners reveal video instead.
  // top: 0 — it used to start at 3%, leaving a black band across the top of the
  // screen; it now fills to the very top edge like the Workout Complete screen.
  videoArea: { position: 'absolute', left: 0, right: 0, top: 0, bottom: '31%' },
  speedMenu: { position: 'absolute', padding: 6, minWidth: 104 },
  speedOpt: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 14 },
  speedOptOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  speedOptTxt: { color: '#ffffff', fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  msg: { color: '#ffffff', fontSize: 15, textAlign: 'center' },
  backBtn: {
    position: 'absolute', left: 16, width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(20,20,24,0.65)', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
});
