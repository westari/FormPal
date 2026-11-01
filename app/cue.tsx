/**
 * app/cue.tsx
 *
 * Cue — replaces the old native-only app/mypal.tsx chat screen. Wires the
 * new Claude-Design artboard (assets/app screens/cue.html) into a WebView
 * using the same DOM-injection technique as app/recap.tsx and
 * app/rep-feedback.tsx (never edit the design file itself — see CLAUDE.md).
 *
 * The artboard's own internal "Component" class is a scripted fake demo
 * (hardcoded REPLIES, a fake typing delay, a workout-preview card UI that
 * has no real backend behind it). None of that demo logic is used — this
 * file drives the same visual bubbles by direct DOM manipulation and talks
 * to the real Cue backend (constants/api.ts's MYPAL_API_URL), exactly the
 * request/response contract app/mypal.tsx already used.
 *
 * KNOWN LIMITATION (documented, not silently dropped): the artboard also
 * shows a "workout preview" card (a suggested plan change with Preview /
 * Never mind buttons) when its FAKE demo logic matches certain phrases.
 * The real MYPAL_API_URL endpoint only returns `{ reply: string }` — plain
 * text, no structured plan-change payload — so there is no real data to
 * drive that card from. It is intentionally never triggered here rather
 * than faked. If real plan-editing-via-chat is wanted, the backend needs to
 * return a structured suggestion first.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import {
  CONSOLE_FORWARD_JS, DC_VIEWPORT_JS, dcScaleFitJs,
  DC_TEXT_REPLACE_HELPER_JS, DC_LINK_INTERCEPT_JS,
} from '../lib/dcWebviewHelpers';
import { MYPAL_API_URL } from '../constants/api';
import { loadPlan } from '../lib/planStorage';
import { buildCueGreeting, cueGreetingInjectJs } from '../lib/cueGreeting';

const CUE_HTML = require('../assets/app screens/cue.html');
const CUE_BUILD = 'cue-6';
if (__DEV__) console.log(`[cue] build ${CUE_BUILD}`);

interface Message { role: 'user' | 'assistant'; content: string }

function cueInject(): string {
  return dcScaleFitJs('#eeeef1') + DC_TEXT_REPLACE_HELPER_JS + DC_LINK_INTERCEPT_JS + `
(function(){
  // BUG FOUND ("white screen for 5 seconds, then it works"): cue.html ships
  // as a self-extracting bundle (base64 fonts/assets unpacked by its own
  // loader script — "Unpacking..." placeholder visible in the raw file),
  // not a plain static page like repfeedback.html/workoutrecap.html. That
  // unpacking replaces the DOM in a way WebView treats as fresh navigation,
  // re-running this whole injected script — confirmed by device logs
  // showing "listEl= false..." several times in a row before the real
  // page settled. The OLD version here queried the DOM exactly ONCE and
  // posted 'ready' unconditionally regardless of whether anything was
  // found, so it could reveal a half-unpacked page, or never finish wiring
  // at all if that one attempt landed mid-unpack. Retrying on the same
  // schedule every other screen in this app already uses, and only
  // posting 'ready' once the elements are actually found, fixes both.
  var wired = false;
  var listEl, inputEl, sendBtn, chipsRow;

  function build(){
    if(wired) return true;
    listEl = document.querySelector('#dc-root div[style*="overflow-y: auto"]');
    inputEl = document.querySelector('#dc-root input[placeholder]');
    var sendPath = document.querySelector('#dc-root svg path[d="M12 19.5V5M5.8 11 12 4.8l6.2 6.2"]');
    sendBtn = sendPath ? sendPath.closest('div') : null;
    chipsRow = document.querySelector('#dc-root div[style*="overflow-x: auto"]');
    console.log('[cue-page] listEl=', !!listEl, 'inputEl=', !!inputEl, 'sendBtn=', !!sendBtn, 'chipsRow=', !!chipsRow);
    if(!listEl || !inputEl || !sendBtn) return false;
    wired = true;
    // BUG FOUND ("zooms the whole screen out... less than before, but
    // still zooms"): the real design's input is font-size: 15px (confirmed
    // via the unpacked file) — iOS auto-zooms the ENTIRE page on focus for
    // any input/textarea under 16px, as a built-in accessibility behavior,
    // independent of the viewport meta's maximum-scale/user-scalable
    // settings. Removing KeyboardAvoidingView (see this file's other
    // comment) fixed the canvas-rescale source of zoom; this fixes the
    // second, separate, OS-level one. 16px is the documented threshold —
    // using 17px for margin.
    inputEl.style.setProperty('font-size', '17px', 'important');
    // Explicit ask: "nothing moves except the input bar itself — it moves
    // above the keyboard, cleanly, and moves back down after." Not
    // KeyboardAvoidingView (resizes/shrinks the whole WebView, which is
    // what caused the zoom bug) and not translating the whole canvas
    // either (same whole-screen-shift problem, just via a different
    // mechanism) — only this one element gets repositioned.
    // BUG FOUND ("there's still a bit of background that goes with it —
    // should just be the button, not the background behind it"): moving
    // the OUTER padding wrapper (the whole "padding: 0 14px 30px" box)
    // brought its own background along as a visible rectangle. Moving the
    // pill itself (inputEl.closest('div')) instead — it has its own
    // rounded background already, nothing extra around it. Its own
    // 14px/30px side+bottom spacing came from the wrapper's padding, which
    // it no longer has once pulled out of flow, so that's set explicitly
    // below instead (14px side, matching the original; a tighter ~10px
    // gap above the keyboard rather than the resting-state 30px, which was
    // sized for bottom-safe-area clearance that isn't relevant once a
    // keyboard is actually covering that space).
    var inputBarEl = inputEl.closest('div');
    // BUG FOUND ("a faint background is visible behind it"): the iOS keyboard
    // is translucent, so with it open the chat page (chips row, bubbles,
    // gradient) showed faintly THROUGH the keyboard. While the keyboard is up
    // this now lays a solid white panel exactly under the keyboard's footprint
    // (matching the artboard's own gradient) and hides the suggestion chips, so
    // nothing but the keyboard is ever visible down there. Layout is not
    // touched (visibility, not display), so nothing else moves.
    var kbPanel = null;
    function kbBackdrop(h){
      var designRoot = inputBarEl && inputBarEl.parentElement && inputBarEl.parentElement.parentElement;
      if(!designRoot) return;
      if(!kbPanel){
        kbPanel = document.createElement('div');
        kbPanel.id = '__cue_kb_panel';
        designRoot.appendChild(kbPanel);
      }
      // top colour = the artboard's own vertical gradient at that height, so there is no seam
      var STOPS = [[0,[235,235,239]],[0.26,[244,244,246]],[0.6,[250,250,251]],[1,[255,255,255]]];
      var f = Math.max(0, Math.min(1, (844 - h) / 844)), c0 = STOPS[0], c1 = STOPS[STOPS.length - 1];
      for (var si = 0; si < STOPS.length - 1; si++) { if (f >= STOPS[si][0] && f <= STOPS[si + 1][0]) { c0 = STOPS[si]; c1 = STOPS[si + 1]; break; } }
      var tt = c1[0] === c0[0] ? 0 : (f - c0[0]) / (c1[0] - c0[0]);
      var top = [0, 1, 2].map(function (k) { return Math.round(c0[1][k] + (c1[1][k] - c0[1][k]) * tt); });
      kbPanel.style.cssText = 'position:absolute;left:0;right:0;bottom:0;z-index:1;pointer-events:none;'
        + 'background:linear-gradient(180deg, rgb(' + top.join(',') + ') 0%, #ffffff 100%);'
        + 'height:' + h + 'px;opacity:' + (h > 0 ? 1 : 0) + ';transition:opacity 160ms ease;';
      if(chipsRow) chipsRow.style.setProperty('visibility', h > 0 ? 'hidden' : 'visible');
    }
    window.__cueSetKeyboardHeight = function(nativeH){
      if(!inputBarEl) return;
      kbBackdrop(nativeH > 0 ? (nativeH / (window.__dcCanvasScale || 1)) + 2 : 0);
      if(nativeH > 0){
        var scale = window.__dcCanvasScale || 1;
        var designOffset = (nativeH / scale) + 10;
        inputBarEl.style.setProperty('z-index','2','important');
        inputBarEl.style.setProperty('position','absolute','important');
        inputBarEl.style.setProperty('left','14px','important');
        inputBarEl.style.setProperty('right','14px','important');
        inputBarEl.style.setProperty('bottom', designOffset+'px','important');
        inputBarEl.style.setProperty('transition','bottom 220ms ease','important');
      } else {
        inputBarEl.style.removeProperty('z-index');
        inputBarEl.style.removeProperty('position');
        inputBarEl.style.removeProperty('left');
        inputBarEl.style.removeProperty('right');
        inputBarEl.style.removeProperty('bottom');
        inputBarEl.style.removeProperty('transition');
      }
    };
    wireUp();
    dcPost({ type: 'ready' });
    return true;
  }

  function scrollToEnd(){ if(listEl) listEl.scrollTop = listEl.scrollHeight + 9999; }

  function bubble(text, isUser){
    var row = document.createElement('div');
    row.style.cssText = 'display:flex; justify-content:' + (isUser ? 'flex-end' : 'flex-start') + ';';
    var b = document.createElement('div');
    b.style.cssText = 'max-width:82%; border-radius:' + (isUser ? '22px 22px 8px 22px' : '22px 22px 22px 8px') +
      '; padding:12px 15px; font-size:15px; line-height:1.42; font-weight:500; letter-spacing:-0.1px; color:' +
      (isUser ? '#ffffff' : '#111114') + '; background:' + (isUser ? '#111114' : '#ffffff') +
      '; box-shadow:' + (isUser ? '0 8px 18px -12px rgba(17,17,20,0.5)' : 'inset 0 0 0 0.5px rgba(17,17,20,0.05), 0 8px 18px -12px rgba(40,50,90,0.3)') +
      '; white-space:pre-wrap;';
    b.textContent = text;
    row.appendChild(b);
    if(listEl) listEl.appendChild(row);
    scrollToEnd();
    return row;
  }

  var typingRow = null;
  function showTyping(){
    if(typingRow) return;
    typingRow = document.createElement('div');
    typingRow.style.cssText = 'align-self:flex-start; border-radius:22px 22px 22px 8px; padding:14px 16px; background:#ffffff; box-shadow: inset 0 0 0 0.5px rgba(17,17,20,0.05), 0 8px 18px -12px rgba(40,50,90,0.3); display:flex; gap:5px;';
    for(var i=0;i<3;i++){
      var dot = document.createElement('div');
      dot.style.cssText = 'width:7px; height:7px; border-radius:50%; background:#c4c4cc;';
      typingRow.appendChild(dot);
    }
    if(listEl) listEl.appendChild(typingRow);
    scrollToEnd();
  }
  function hideTyping(){
    if(typingRow && typingRow.parentNode){ typingRow.parentNode.removeChild(typingRow); }
    typingRow = null;
  }

  var sending = false;
  function doSend(text){
    text = (text || '').trim();
    if(!text || sending) return;
    sending = true;
    bubble(text, true);
    if(inputEl) inputEl.value = '';
    showTyping();
    dcPost({ type: 'send', text: text });
  }

  function wireUp(){
    inputEl.addEventListener('keydown', function(ev){
      if(ev.key === 'Enter'){ ev.preventDefault(); doSend(inputEl.value); }
    }, true);
    sendBtn.addEventListener('click', function(ev){
      ev.stopPropagation();
      doSend(inputEl ? inputEl.value : '');
    }, true);
    if(chipsRow){
      var chipEls = Array.prototype.slice.call(chipsRow.children);
      chipEls.forEach(function(chip){
        var label = (chip.textContent || '').trim();
        chip.addEventListener('click', function(ev){ ev.stopPropagation(); doSend(label); }, true);
      });
    }
  }

  // RN calls this once the real API reply (or an error) is known.
  window.__cueReplyReceived = function(text){
    hideTyping();
    bubble(text, false);
    sending = false;
  };
  window.__cueSetGreeting = function(text){
    if(!listEl) return;
    var firstBubble = listEl.querySelector('div');
    if(firstBubble){
      var inner = firstBubble.querySelector('div');
      if(inner) inner.textContent = text;
    }
  };

  if(!build()){ [100,300,700,1500,3000].forEach(function(d){ setTimeout(build,d); }); }
})();
`;
}

export default function CueScreen() {
  const router = useRouter();
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  // The artboard's first bubble is demo text ("Today is Full body, 38 minutes"). The page is only
  // revealed once the real greeting has been written into it. The page can fire 'ready' several
  // times while its bundle unpacks, so the greeting is re-applied on each one.
  const [greeting, setGreeting] = useState<string | null>(null);
  const [pageReady, setPageReady] = useState(0);
  useEffect(() => {
    loadPlan().then(p => setGreeting(buildCueGreeting(p))).catch(() => setGreeting(buildCueGreeting(null)));
  }, []);
  useEffect(() => {
    if (!pageReady || greeting == null) return;
    webRef.current?.injectJavaScript(cueGreetingInjectJs(greeting));
    const t = setTimeout(() => setReady(true), 50);
    return () => clearTimeout(t);
  }, [pageReady, greeting]);
  const historyRef = useRef<Message[]>([]);
  // Explicit ask: "nothing moves except the input bar — the rest of the
  // screen stays completely still." Earlier this moved the WHOLE WebView
  // via translateY, which fixed the zoom bug but still shifted everything
  // on screen — not what was wanted. The page itself now repositions ONLY
  // its own input bar in response to the real keyboard height (see
  // window.__cueSetKeyboardHeight in cueInject) — this side just forwards
  // the real native keyboard height into the page, nothing moves natively.
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', (e) => {
      webRef.current?.injectJavaScript(`window.__cueSetKeyboardHeight && window.__cueSetKeyboardHeight(${e.endCoordinates.height}); true;`);
    });
    const hideSub = Keyboard.addListener('keyboardWillHide', () => {
      webRef.current?.injectJavaScript(`window.__cueSetKeyboardHeight && window.__cueSetKeyboardHeight(0); true;`);
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const handleSend = useCallback(async (text: string) => {
    const history = historyRef.current.slice(-20).map(m => ({ role: m.role, content: m.content }));
    historyRef.current.push({ role: 'user', content: text });
    try {
      const res = await fetch(MYPAL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? 'Request failed');
      historyRef.current.push({ role: 'assistant', content: data.reply });
      webRef.current?.injectJavaScript(`window.__cueReplyReceived && window.__cueReplyReceived(${JSON.stringify(data.reply)}); true;`);
    } catch {
      const msg = "Couldn't reach Cue. Check your connection and try again.";
      webRef.current?.injectJavaScript(`window.__cueReplyReceived && window.__cueReplyReceived(${JSON.stringify(msg)}); true;`);
    }
  }, []);

  return (
    // BUG FOUND ("major issue — it zooms the whole screen out" when the
    // keyboard opens): KeyboardAvoidingView was shrinking this WebView's
    // rendered height to make room for the keyboard, which fed straight
    // into the page's own dcScaleFitJs fit() (S = window.innerHeight/844)
    // — the whole 390x844 canvas rescaled SMALLER the instant the keyboard
    // appeared, reading as a "zoom out." No other DC-canvas screen in this
    // app (recap.tsx, rep-feedback.tsx, onboarding.tsx) uses
    // KeyboardAvoidingView around one of these WebViews for exactly this
    // reason — removed here to match. The keyboard will cover the input
    // bar instead of the canvas rescaling to dodge it.
    <View style={styles.flex}>
      <WebView
        ref={webRef}
        source={CUE_HTML}
        originWhitelist={['*']}
        style={[styles.web, { opacity: ready ? 1 : 0 }]}
        injectedJavaScriptBeforeContentLoaded={DC_VIEWPORT_JS}
        injectedJavaScript={CONSOLE_FORWARD_JS + cueInject()}
        onMessage={(e) => {
          let msg: { type?: string };
          try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
          if (msg.type === 'ready') { setPageReady(n => n + 1); return; }
          if (msg.type === 'pageConsole') { if (__DEV__) console.log(`[cue-page:${(msg as any).level}]`, (msg as any).msg); return; }
          if (msg.type === 'send') { void handleSend((msg as any).text); return; }
          if (msg.type === 'navigate') {
            // The artboard's own internal prototyping links (e.g.
            // "Train.dc.html") — the only one that exists here is the
            // back arrow, which always means "leave Cue."
            router.back();
          }
        }}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        javaScriptEnabled
        domStorageEnabled
        bounces={false}
        overScrollMode="never"
        cacheEnabled={false}
        scrollEnabled={false}
      />
      {/* Explicit ask: the screen was reading as "broken" during the real
          unpack delay (cue.html is a self-extracting bundle — see
          cueInject's own comment) because it was just plain white with no
          feedback. A spinner doesn't make the unpack itself faster, but it
          stops it from looking stuck. */}
      {!ready && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color="#9a9aa2" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#eeeef1' },
  web: { flex: 1, backgroundColor: '#eeeef1' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
