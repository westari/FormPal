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
import { Animated, Keyboard, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import {
  CONSOLE_FORWARD_JS, DC_VIEWPORT_JS, dcScaleFitJs,
  DC_TEXT_REPLACE_HELPER_JS, DC_LINK_INTERCEPT_JS,
} from '../lib/dcWebviewHelpers';
import { MYPAL_API_URL } from '../constants/api';

const CUE_HTML = require('../assets/app screens/cue.html');
const CUE_BUILD = 'cue-3';
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
  const historyRef = useRef<Message[]>([]);
  // Moves the WHOLE WebView up by a position shift (translateY), never a
  // size change — see this file's own comment on why KeyboardAvoidingView
  // (which shrinks the view) was removed. A position shift never touches
  // window.innerHeight inside the page, so dcScaleFitJs's fit() never
  // recalculates and the canvas never rescales, but the input still ends
  // up above the keyboard instead of hidden behind it.
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const showEvt = 'keyboardWillShow';
    const hideEvt = 'keyboardWillHide';
    const showSub = Keyboard.addListener(showEvt, (e) => {
      Animated.timing(keyboardOffset, {
        toValue: -e.endCoordinates.height,
        duration: e.duration || 250,
        useNativeDriver: true,
      }).start();
    });
    const hideSub = Keyboard.addListener(hideEvt, (e) => {
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: e.duration || 250,
        useNativeDriver: true,
      }).start();
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, [keyboardOffset]);

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
      <Animated.View style={[styles.flex, { transform: [{ translateY: keyboardOffset }] }]}>
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
            if (msg.type === 'ready') { setReady(true); return; }
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
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#eeeef1' },
  web: { flex: 1, backgroundColor: '#eeeef1' },
});
