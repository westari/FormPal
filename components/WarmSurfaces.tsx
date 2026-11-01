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
 * Lifecycle per surface:  want -> (loads, posts 'warm') -> prepare(data) ->
 * data injected once -> page posts 'ready' -> activate() reveals it.
 * deactivate() hides it but keeps its state (e.g. recap while rep feedback is
 * on top); release() throws the instance away and re-warms a fresh one.
 */
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { create } from 'zustand';
import { DC_VIEWPORT_JS, recapBaseJs } from '../lib/recapInject';
import { repFeedbackBaseJs } from '../lib/repFeedbackInject';
import { muscleRanksBaseJs } from '../lib/muscleRanksInject';

export type WarmKind = 'recap' | 'repfeedback' | 'ranks';
const KINDS: WarmKind[] = ['recap', 'ranks', 'repfeedback']; // later = drawn on top

const SOURCES: Record<WarmKind, any> = {
  recap:       require('../assets/app screens/workoutrecap.html'),
  ranks:       require('../assets/app screens/muscleranks.html'),
  repfeedback: require('../assets/app screens/repfeedback.html'),
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
};

// Safety net: reveal anyway if the page never says 'ready' (selectors changed,
// etc.), so a surface can never stay invisible forever.
const REVEAL_BACKSTOP_MS = 2500;

type PerKind<T> = Record<WarmKind, T>;
interface WarmState {
  want:     PerKind<boolean>;
  epoch:    PerKind<number>;       // bump = remount = fresh page
  warm:     PerKind<boolean>;      // scaffold loaded + rendered
  active:   PerKind<boolean>;      // a screen currently owns it
  revealed: PerKind<boolean>;      // page posted 'ready' (data applied, final layout)
  bg:       PerKind<string>;
  dataJs:   PerKind<string | null>;
  overlay:  PerKind<React.ReactNode>;
}
const each = <T,>(v: T): PerKind<T> => ({ recap: v, repfeedback: v, ranks: v });

export const useWarm = create<WarmState>(() => ({
  want:     { recap: true, repfeedback: false, ranks: false },
  epoch:    each(0),
  warm:     each(false),
  active:   each(false),
  revealed: each(false),
  bg:       { recap: '#111114', repfeedback: '#0d0d10', ranks: '#f2f2f5' },
  dataJs:   each<string | null>(null),
  overlay:  each<React.ReactNode>(null),
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

export function warmActivate(k: WarmKind, opts: { bg?: string; onMessage: (msg: any) => void }) {
  handlers[k] = opts.onMessage;
  set(k, { active: true, ...(opts.bg ? { bg: opts.bg } : {}) } as any);
}
export function warmSetBg(k: WarmKind, bg: string) { if (useWarm.getState().bg[k] !== bg) set(k, { bg } as any); }
export function warmSetOverlay(k: WarmKind, node: React.ReactNode) { set(k, { overlay: node } as any); }
/** Hide it but keep its state (another screen is on top). */
export function warmDeactivate(k: WarmKind) { set(k, { active: false } as any); }
/** Done with this page for good: drop it and warm a fresh one for next time. */
export function warmRelease(k: WarmKind) {
  delete handlers[k];
  useWarm.setState((s) => ({
    active:   { ...s.active,   [k]: false },
    revealed: { ...s.revealed, [k]: false },
    warm:     { ...s.warm,     [k]: false },
    dataJs:   { ...s.dataJs,   [k]: null },
    overlay:  { ...s.overlay,  [k]: null },
    epoch:    { ...s.epoch,    [k]: s.epoch[k] + 1 },
  }));
}
export function warmInject(k: WarmKind, js: string) { refs[k]?.current?.injectJavaScript(js); }

function Surface({ k }: { k: WarmKind }) {
  const ref = useRef<WebView>(null);
  refs[k] = ref;
  const epoch = useWarm((s) => s.epoch[k]);
  const warm = useWarm((s) => s.warm[k]);
  const active = useWarm((s) => s.active[k]);
  const revealed = useWarm((s) => s.revealed[k]);
  const dataJs = useWarm((s) => s.dataJs[k]);
  const bg = useWarm((s) => s.bg[k]);

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
  return (
    <View
      pointerEvents={visible ? 'auto' : 'none'}
      // 0.01, not 0: a fully transparent view can be treated as not visible
      // and have its animation frames throttled, which would stall the page's
      // own warm-up. Imperceptible over a dark or light screen.
      style={[StyleSheet.absoluteFill, { opacity: visible ? 1 : 0.01 }]}
    >
      <WebView
        key={`${k}-${epoch}`}
        ref={ref}
        source={SOURCES[k]}
        originWhitelist={['*']}
        style={{ flex: 1, backgroundColor: bg }}
        injectedJavaScriptBeforeContentLoaded={BASE_JS[k]}
        onMessage={(e) => {
          let msg: any;
          try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
          if (msg.type === 'warm') {
            if (__DEV__) console.log(`[warm:${k}] warm (epoch ${epoch})`);
            set(k, { warm: true } as any);
            return;
          }
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
    </View>
  );
}

export default function WarmSurfaces() {
  const want = useWarm((s) => s.want);
  const active = useWarm((s) => s.active);
  const revealed = useWarm((s) => s.revealed);
  const overlay = useWarm((s) => s.overlay);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {KINDS.map((k) => (want[k] ? <Surface key={k} k={k} /> : null))}
      {KINDS.map((k) =>
        active[k] && revealed[k] && overlay[k] ? (
          <View key={`o-${k}`} style={StyleSheet.absoluteFill} pointerEvents="box-none">{overlay[k]}</View>
        ) : null,
      )}
    </View>
  );
}
