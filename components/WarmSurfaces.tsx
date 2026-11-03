/**
 * components/WarmSurfaces.tsx
 *
 * Persistent, already-loaded WebViews for the three Claude-Design artboards
 * that open right after a workout (Workout Complete, rep feedback, the muscle
 * page). Their cost is NOT the data — it is the artboard's own bundle
 * unpacking + React rendering, ~0.5-1s on a phone, paid every time a fresh
 * WebView mounts. So the WebView is mounted once, here, at the app root, with
 * only the data-free scaffold injected; it unpacks and renders while nobody is
 * looking. When a screen needs it, it injects the session's data (the page is
 * already rendered, so that is instant) and the surface is revealed.
 *
 * Because this layer sits above the navigator, anything a screen draws ON TOP
 * of its WebView (video controls, the speed menu) is passed in as an
 * `overlay` and rendered here above the WebView, otherwise the WebView would
 * cover it and swallow its touches.
 *
 * HIDDEN means HIDDEN: a surface that is not showing is fully transparent,
 * pushed off-screen, and placed BEHIND the navigator (negative zIndex), so it
 * can never show through a screen's white space or catch a tap. (It used to sit
 * above everything at 1% opacity, which leaked a faint ghost of the card onto
 * every screen.) Only a surface that is showing is raised above the navigator,
 * and it slides in like a normal iOS push so the page change is not a hard cut.
 *
 * Lifecycle per surface:  want -> (loads, posts 'warm') -> prepare(data) ->
 * data injected once -> page posts 'ready' -> activate() reveals it.
 * deactivate() hides it but keeps its state (e.g. recap while rep feedback is
 * on top); release() throws the instance away and re-warms a fresh one.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { LiquidGlassButton } from './LiquidGlass';
import { WebView } from 'react-native-webview';
import { create } from 'zustand';
import { DC_VIEWPORT_JS, recapBaseJs } from '../lib/recapInject';
import { repFeedbackBaseJs } from '../lib/repFeedbackInject';
import { muscleRanksBaseJs } from '../lib/muscleRanksInject';
import { allSetsBaseJs } from '../lib/allSetsInject';

export type WarmKind = 'recap' | 'repfeedback' | 'ranks' | 'allsets';
const KINDS: WarmKind[] = ['recap', 'allsets', 'ranks', 'repfeedback']; // later = drawn on top

// Pages that slide back OUT to the right when they close (a pop). The summary
// never does: it is only ever covered by the others.
const SLIDES_OUT: PerKindLite<boolean> = { recap: false, allsets: true, ranks: true, repfeedback: true };
const SLIDE_IN_MS = 320, SLIDE_OUT_MS = 260;

// Layering rules (also what scripts/test-ghost-card.js renders): a layer that is
// not showing is fully transparent and the whole host sits behind the navigator;
// while something is showing the host is raised above it.
export const HOST_Z_HIDDEN = -1;
export const HOST_Z_RAISED = 1000;
export const LAYER_OPACITY_HIDDEN = 0;

const SOURCES: Record<WarmKind, any> = {
  recap:       require('../assets/app screens/workoutrecap.html'),
  ranks:       require('../assets/app screens/muscleranks.html'),
  repfeedback: require('../assets/app screens/repfeedback.html'),
  allsets:     require('../assets/app screens/allsetsfullworkout.html'),
};

// Posts {type:'warm'} once the artboard has rendered and been scaled to fit.
const WARM_PROBE_JS = `
(function(){
  var posted=false;
  // The bundle swaps the whole <html>, replacing the viewport meta set at
  // document start; keep viewport-fit=cover so innerHeight is the full screen.
  function vp(){
    var m=document.querySelector('meta[name=viewport]');
    var c='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    if(m && m.getAttribute('content')!==c) m.setAttribute('content',c);
  }
  function chk(){
    vp();
    if(posted) return;
    var r=document.getElementById('dc-root');
    if(r && window.__fpFitted && r.querySelectorAll('div').length>8){
      posted=true;
      try{ window.ReactNativeWebView.postMessage(JSON.stringify({type:'warm'})); }catch(e){}
    }
  }
  try{ new MutationObserver(chk).observe(document,{childList:true,subtree:true}); }catch(e){}
  setInterval(chk,100);
})();
true;`;

export const BASE_JS: Record<WarmKind, string> = {
  recap:       `${DC_VIEWPORT_JS} ${recapBaseJs()} ${WARM_PROBE_JS}`,
  repfeedback: `${DC_VIEWPORT_JS} ${repFeedbackBaseJs()} ${WARM_PROBE_JS}`,
  ranks:       `${muscleRanksBaseJs()} ${WARM_PROBE_JS}`,
  allsets:     `${DC_VIEWPORT_JS} ${allSetsBaseJs()} ${WARM_PROBE_JS}`,
};

// Safety net: reveal anyway if the page never says 'ready' (selectors changed,
// etc.), so a surface can never stay invisible forever.
const REVEAL_BACKSTOP_MS = 2500;

type PerKind<T> = Record<WarmKind, T>;
type PerKindLite<T> = Record<'recap' | 'repfeedback' | 'ranks' | 'allsets', T>;
export interface Rect { l: number; t: number; w: number; h: number }
export interface Chrome { back: Rect; allSets: Rect }
interface WarmState {
  chrome:   PerKind<Chrome | null>; // where the page's own back / All sets sit (reported by the page)
  want:     PerKind<boolean>;
  epoch:    PerKind<number>;       // bump = remount = fresh page
  warm:     PerKind<boolean>;      // scaffold loaded + rendered
  active:   PerKind<boolean>;      // a screen currently owns it
  revealed: PerKind<boolean>;      // page posted 'ready' (data applied, final layout)
  bg:       PerKind<string>;
  dataJs:   PerKind<string | null>;
  overlay:  PerKind<React.ReactNode>;
  underlay: PerKind<React.ReactNode>; // drawn BEHIND the page (e.g. a video frame showing through a transparent tile)
}
const each = <T,>(v: T): PerKind<T> => ({ recap: v, repfeedback: v, ranks: v, allsets: v });

export const useWarm = create<WarmState>(() => ({
  chrome:   each<Chrome | null>(null),
  want:     { recap: true, repfeedback: false, ranks: false, allsets: false },
  epoch:    each(0),
  warm:     each(false),
  active:   each(false),
  revealed: each(false),
  bg:       { recap: '#111114', repfeedback: '#0d0d10', ranks: '#f2f2f5', allsets: 'transparent' },
  dataJs:   each<string | null>(null),
  overlay:  each<React.ReactNode>(null),
  underlay: each<React.ReactNode>(null),
}));

const set = (k: WarmKind, patch: Partial<{ [P in keyof WarmState]: WarmState[P][WarmKind] }>) =>
  useWarm.setState((s) => {
    const next: any = {};
    for (const key of Object.keys(patch) as (keyof WarmState)[]) {
      next[key] = { ...(s[key] as any), [k]: (patch as any)[key] };
    }
    return next;
  });

// Module-level (not React state): handlers, WebView refs, and which epoch's
// data has already been injected.
const handlers: Partial<PerKind<(msg: any) => void>> = {};
const refs: Partial<PerKind<React.RefObject<WebView | null>>> = {};
const injectedEpoch: PerKind<number> = each(-1);

export function warmWant(k: WarmKind, on: boolean) { if (useWarm.getState().want[k] !== on) set(k, { want: on } as any); }

/** Hand a surface its data ahead of time (idempotent per fresh page: data is only ever injected once). */
export function warmPrepare(k: WarmKind, dataJs: string) {
  const s = useWarm.getState();
  if (injectedEpoch[k] === s.epoch[k] && s.dataJs[k]) return; // already holds data
  if (s.dataJs[k] === dataJs) return;
  set(k, { dataJs } as any);
}

const activatedAt: Partial<PerKind<number>> = {};

export function warmActivate(k: WarmKind, opts: { bg?: string; onMessage: (msg: any) => void }) {
  handlers[k] = opts.onMessage;
  activatedAt[k] = Date.now();
  set(k, { active: true, ...(opts.bg ? { bg: opts.bg } : {}) } as any);
}
export function warmSetBg(k: WarmKind, bg: string) { if (useWarm.getState().bg[k] !== bg) set(k, { bg } as any); }
export function warmSetOverlay(k: WarmKind, node: React.ReactNode) { set(k, { overlay: node } as any); }
export function warmSetUnderlay(k: WarmKind, node: React.ReactNode) { set(k, { underlay: node } as any); }
/** Hide it but keep its state (another screen is on top). */
export function warmDeactivate(k: WarmKind) { set(k, { active: false } as any); }
/** Done with this page for good: drop it and warm a fresh one for next time. */
export function warmRelease(k: WarmKind, delayMs = 0) {
  if (delayMs > 0) {
    // Hide now (the layer slides out), throw the page away once that is done.
    set(k, { active: false } as any);
    delete handlers[k];
    setTimeout(() => warmRelease(k, 0), delayMs);
    return;
  }
  delete handlers[k];
  useWarm.setState((s) => ({
    active:   { ...s.active,   [k]: false },
    revealed: { ...s.revealed, [k]: false },
    warm:     { ...s.warm,     [k]: false },
    dataJs:   { ...s.dataJs,   [k]: null },
    overlay:  { ...s.overlay,  [k]: null },
    underlay: { ...s.underlay, [k]: null },
    chrome:   { ...s.chrome,   [k]: null },
    epoch:    { ...s.epoch,    [k]: s.epoch[k] + 1 },
  }));
}
export function warmInject(k: WarmKind, js: string) { refs[k]?.current?.injectJavaScript(js); }

function Layer({ k }: { k: WarmKind }) {
  const ref = useRef<WebView>(null);
  refs[k] = ref;
  const { width: screenW } = useWindowDimensions();
  const epoch = useWarm((s) => s.epoch[k]);
  const warm = useWarm((s) => s.warm[k]);
  const active = useWarm((s) => s.active[k]);
  const revealed = useWarm((s) => s.revealed[k]);
  const dataJs = useWarm((s) => s.dataJs[k]);
  const bg = useWarm((s) => s.bg[k]);
  const overlay = useWarm((s) => s.overlay[k]);
  const underlay = useWarm((s) => s.underlay[k]);
  const chrome = useWarm((s) => s.chrome[k]);
  // A page stays "shown" (kept in place, not re-slid) while a page above it is
  // showing, so closing the top page just slides it away to reveal this one.
  const coveredByHigher = useWarm((s) => KINDS.slice(KINDS.indexOf(k) + 1).some((kk) => s.active[kk] && s.revealed[kk]));

  // Inject the data once per fresh page, as soon as both exist.
  useEffect(() => {
    if (!warm || !dataJs || injectedEpoch[k] === epoch) return;
    injectedEpoch[k] = epoch;
    if (__DEV__) console.log(`[warm:${k}] injecting data (epoch ${epoch})`);
    ref.current?.injectJavaScript(dataJs);
  }, [warm, dataJs, epoch, k]);

  // Backstop reveal.
  useEffect(() => {
    if (!active || revealed) return;
    const t = setTimeout(() => {
      if (__DEV__) console.log(`[warm:${k}] reveal backstop fired (no 'ready' posted)`);
      set(k, { revealed: true } as any);
    }, REVEAL_BACKSTOP_MS);
    return () => clearTimeout(t);
  }, [active, revealed, k, epoch]);

  const visible = active && revealed;
  // Device proof for "never a black flash": when the screen asks for the card
  // and it was already ready, this prints ~0-30ms. A big number (or a
  // "waiting for ready" line first) means the card was still loading.
  useEffect(() => {
    if (!__DEV__) return;
    if (active && !revealed) console.log(`[warm:${k}] activated, waiting for ready (card not shown yet)`);
    if (visible) console.log(`[warm:${k}] VISIBLE ${activatedAt[k] ? Date.now() - (activatedAt[k] as number) : '?'}ms after the screen asked for it`);
  }, [visible, active, revealed, k]);

  // ── slide like an iOS push ────────────────────────────────────────────────
  // tx = screen width means "parked off to the right". A hidden layer is always
  // parked, fully transparent and behind the navigator.
  const tx = useRef(new Animated.Value(screenW)).current;
  const [shown, setShown] = useState(false);
  const wasShown = useRef(false);
  const wanted = visible || coveredByHigher;
  useLayoutEffect(() => {
    if (wanted) {
      if (!wasShown.current) {
        wasShown.current = true;
        if (__DEV__) console.log(`[warm:${k}] slide IN (${SLIDE_IN_MS}ms), layer raised above navigator`);
        tx.setValue(screenW);
        setShown(true);
        Animated.timing(tx, { toValue: 0, duration: SLIDE_IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      }
    } else if (wasShown.current) {
      wasShown.current = false;
      if (__DEV__) console.log(`[warm:${k}] ${SLIDES_OUT[k] ? 'slide OUT' : 'hidden'} -> parked off-screen, opacity 0, behind navigator`);
      const park = () => { setShown(false); tx.setValue(screenW); };
      if (SLIDES_OUT[k]) Animated.timing(tx, { toValue: screenW, duration: SLIDE_OUT_MS, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => { if (finished || !wasShown.current) park(); });
      else park();
    }
  }, [wanted, tx, screenW, k]);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        StyleSheet.absoluteFill,
        // Not shown = invisible, not hit-testable, and (via the parent's
        // zIndex) behind everything.
        { opacity: shown ? 1 : LAYER_OPACITY_HIDDEN, transform: [{ translateX: tx }] },
      ]}
    >
      {shown && underlay ? <View style={StyleSheet.absoluteFill} pointerEvents="none">{underlay}</View> : null}
      <WebView
        key={`${k}-${epoch}`}
        ref={ref}
        source={SOURCES[k]}
        originWhitelist={['*']}
        style={{ flex: 1, backgroundColor: bg, opacity: shown ? 1 : 0 }}
        injectedJavaScriptBeforeContentLoaded={BASE_JS[k]}
        onMessage={(e) => {
          let msg: any;
          try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
          if (msg.type === 'warm') {
            if (__DEV__) console.log(`[warm:${k}] warm (epoch ${epoch})`);
            set(k, { warm: true } as any);
            return;
          }
          if (msg.type === 'chrome') { set(k, { chrome: { back: msg.back, allSets: msg.allSets } } as any); return; }
          if (msg.type === 'pageConsole') { if (__DEV__) console.log(`[warm:${k}:page]`, msg.msg); return; }
          if (msg.type === 'ready') {
            if (__DEV__) console.log(`[warm:${k}] ready`);
            set(k, { revealed: true } as any);
          }
          handlers[k]?.(msg);
        }}
        onContentProcessDidTerminate={() => {
          if (__DEV__) console.log(`[warm:${k}] content process terminated — re-warming`);
          useWarm.setState((s) => ({
            warm:     { ...s.warm,     [k]: false },
            revealed: { ...s.revealed, [k]: false },
            epoch:    { ...s.epoch,    [k]: s.epoch[k] + 1 },
          }));
        }}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        bounces={false}
        overScrollMode="never"
        cacheEnabled={false}
        scrollEnabled={false}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
      />
      {shown && overlay ? <View style={StyleSheet.absoluteFill} pointerEvents="box-none">{overlay}</View> : null}
      {shown && chrome && (k === 'recap' || k === 'repfeedback') ? <GlassChrome k={k} c={chrome} /> : null}
    </Animated.View>
  );
}

export default function WarmSurfaces() {
  const want = useWarm((s) => s.want);
  // Raised above the navigator only while some page is actually showing;
  // otherwise the whole layer sits BEHIND it (negative zIndex) and nothing in
  // it can show through or take a touch.
  const anyShown = useWarm((s) => KINDS.some((k) => s.active[k] && s.revealed[k]));
  const [raised, setRaised] = useState(false);
  useEffect(() => {
    if (anyShown) { setRaised(true); return; }
    // keep it raised while a closing page finishes sliding out
    const t = setTimeout(() => setRaised(false), SLIDE_OUT_MS + 80);
    return () => clearTimeout(t);
  }, [anyShown]);
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: raised ? HOST_Z_RAISED : HOST_Z_HIDDEN }]} pointerEvents={raised ? 'box-none' : 'none'}>
      {KINDS.map((k) => (want[k] ? <Layer key={k} k={k} /> : null))}
    </View>
  );
}

// Real Liquid Glass versions of the page's top-left back chevron and
// "All sets" pill, drawn at exactly the spot the page reported (the page's own
// white ones are hidden). Both are enlarged to at least 44pt so they are easy
// to hit; taps are forwarded to the owning screen as the same messages the
// page's own buttons used to send.
const MIN_TAP = 44;
function GlassChrome({ k, c }: { k: WarmKind; c: Chrome }) {
  const send = (type: string) => handlers[k]?.({ type });
  const box = (r: Rect, minW: number) => {
    const w = Math.max(minW, r.w + 6), h = Math.max(MIN_TAP, r.h + 6);
    return { position: 'absolute' as const, left: r.l + r.w / 2 - w / 2, top: r.t + r.h / 2 - h / 2, width: w, height: h };
  };
  const backBox = box(c.back, MIN_TAP);
  const allBox = box(c.allSets, 104);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <LiquidGlassButton
        onPress={() => send(k === 'recap' ? 'back' : 'close')}
        radius={backBox.height / 2}
        colorScheme="dark"
        fallbackColor="rgba(60,62,72,0.55)"
        containerStyle={backBox}
        hitSlop={8}
        style={{ width: backBox.width, height: backBox.height, alignItems: 'center', justifyContent: 'center' }}
      >
        <SymbolView name="chevron.left" size={18} tintColor="#ffffff" type="monochrome" style={{ width: 18, height: 18 }} />
      </LiquidGlassButton>
      <LiquidGlassButton
        onPress={() => send(k === 'recap' ? 'viewAllSets' : 'openAllSets')}
        radius={allBox.height / 2}
        colorScheme="dark"
        fallbackColor="rgba(60,62,72,0.55)"
        containerStyle={allBox}
        hitSlop={8}
        style={{ width: allBox.width, height: allBox.height, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}
      >
        <SymbolView name="square.grid.2x2" size={15} tintColor="#ffffff" type="monochrome" style={{ width: 15, height: 15 }} />
        <Text style={{ color: '#ffffff', fontSize: 14.5, fontWeight: '700' }}>All sets</Text>
      </LiquidGlassButton>
    </View>
  );
}
