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
import React, { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import {
  CONSOLE_FORWARD_JS, DC_VIEWPORT_JS, dcScaleFitJs,
  DC_TEXT_REPLACE_HELPER_JS, DC_LINK_INTERCEPT_JS,
} from '../lib/dcWebviewHelpers';
import { MYPAL_API_URL } from '../constants/api';

const CUE_HTML = require('../assets/app screens/cue.html');
const CUE_BUILD = 'cue-1';
if (__DEV__) console.log(`[cue] build ${CUE_BUILD}`);

interface Message { role: 'user' | 'assistant'; content: string }

function cueInject(): string {
  return dcScaleFitJs('#eeeef1') + DC_TEXT_REPLACE_HELPER_JS + DC_LINK_INTERCEPT_JS + `
(function(){
  var listEl = document.querySelector('#dc-root div[style*="overflow-y: auto"]');
  var inputEl = document.querySelector('#dc-root input[placeholder]');
  var sendPath = document.querySelector('#dc-root svg path[d="M12 19.5V5M5.8 11 12 4.8l6.2 6.2"]');
  var sendBtn = sendPath ? sendPath.closest('div') : null;
  var chipsRow = document.querySelector('#dc-root div[style*="overflow-x: auto"]');
  var dotsTemplate = null;
  // The artboard's own first dot-row (inside its typing indicator, never
  // shown at load since typing starts false) — found once, cloned later,
  // rather than hand-building the exact same markup twice.
  console.log('[cue-page] listEl=', !!listEl, 'inputEl=', !!inputEl, 'sendBtn=', !!sendBtn, 'chipsRow=', !!chipsRow);

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

  if(inputEl){
    inputEl.addEventListener('keydown', function(ev){
      if(ev.key === 'Enter'){ ev.preventDefault(); doSend(inputEl.value); }
    }, true);
  }
  if(sendBtn){
    sendBtn.addEventListener('click', function(ev){
      ev.stopPropagation();
      doSend(inputEl ? inputEl.value : '');
    }, true);
  }
  if(chipsRow){
    var chipEls = Array.prototype.slice.call(chipsRow.children);
    chipEls.forEach(function(chip){
      var label = (chip.textContent || '').trim();
      chip.addEventListener('click', function(ev){ ev.stopPropagation(); doSend(label); }, true);
    });
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

  dcPost({ type: 'ready' });
})();
`;
}

export default function CueScreen() {
  const router = useRouter();
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const historyRef = useRef<Message[]>([]);

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
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#eeeef1' },
  web: { flex: 1, backgroundColor: '#eeeef1' },
});
