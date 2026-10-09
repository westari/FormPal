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
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { WebView } from 'react-native-webview';
import { getLocalVideoHttpUrl } from '../lib/localVideoServer';

const REP_FEEDBACK_HTML = require('../assets/app screens/repfeedback.html');

const DC_VIEWPORT_JS = `(function(){try{
  var m=document.querySelector('meta[name=viewport]');
  if(!m){ m=document.createElement('meta'); m.name='viewport'; (document.head||document.documentElement).appendChild(m); }
  m.setAttribute('content','width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
}catch(e){}})(); true;`;

function dcScaleFitJs(bg: string): string {
  return `
  (function(){
    var W=390, H=844;
    var st=document.createElement('style');
    st.textContent='html{background:${bg}!important;overflow:hidden!important;}body{margin:0!important;padding:0!important;background:${bg}!important;overflow:hidden!important;}#dc-root{position:relative!important;margin:0 auto!important;width:'+W+'px!important;transform-origin:top center!important;}*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}';
    (document.head||document.documentElement).appendChild(st);
    var lastS=-1, lastNudge=0;
    function fit(){
      var root=document.getElementById('dc-root'); if(!root) return;
      var vh=window.innerHeight||H;
      var S=vh/H;
      if(Math.abs(S-lastS)>=0.002){ lastS=S; }
      root.style.setProperty('transform','translateY('+lastNudge+'px) scale('+S+')','important');
      document.body.style.setProperty('height', vh+'px','important');
      document.documentElement.style.setProperty('height', vh+'px','important');
      requestAnimationFrame(function(){
        var rect=root.getBoundingClientRect();
        var gap=vh-rect.bottom;
        if (gap>0.5 && gap<60) {
          lastNudge=lastNudge+gap;
          root.style.setProperty('transform','translateY('+lastNudge+'px) scale('+S+')','important');
        }
      });
    }
    fit();
    window.addEventListener('resize', fit);
    [0,300,900,1500].forEach(function(d){ setTimeout(fit,d); });
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

// Same real-data injection as before (repfeedback.html's dc-script never
// reads this.props — 100% hardcoded demo data, real data goes in via DOM
// replacement). Now posts {type:'ready'} the FIRST time it successfully
// builds, so this screen knows when it's safe to reveal the WebView
// without ever showing the artboard's own fake demo content.
function repFeedbackInject(opts: {
  exerciseName: string;
  // A loopback http:// URL (see lib/localVideoServer.ts), not a file://
  // path — the <video> tag loads this directly.
  videoUri?: string;
  reps: { timeSec: number; what: string }[];
}): string {
  const { exerciseName, videoUri, reps } = opts;
  return dcScaleFitJs('#0d0d10') + `
(function(){
  function post(m){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }catch(e){} }
  var REPS = ${JSON.stringify(reps)};
  var EX_NAME = ${JSON.stringify(exerciseName.toUpperCase())};
  var VIDEO_SRC = ${JSON.stringify(videoUri ?? '')};
  var idx = 0;
  var videoEl = null;
  var tagEl = null, bodyEl = null, exCapsEl = null;
  var trackEl = null, fillEl = null, thumbEl = null;
  var closeWired=false, finishWired=false;
  var built = false, readyPosted = false;

  function show(i){
    if(REPS.length === 0){
      if(tagEl) tagEl.textContent = 'No reps recorded';
      if(bodyEl) bodyEl.textContent = 'This set didn\\'t capture any rep data.';
      if(fillEl) fillEl.style.setProperty('width', '0%', 'important');
      if(thumbEl) thumbEl.style.setProperty('left', '0%', 'important');
      return;
    }
    idx = Math.max(0, Math.min(REPS.length - 1, i));
    if(tagEl) tagEl.textContent = 'Rep ' + (idx + 1);
    if(bodyEl) bodyEl.textContent = REPS[idx].what;
    var pct = ((idx + 0.5) / REPS.length * 100).toFixed(1) + '%';
    if(fillEl) fillEl.style.setProperty('width', pct, 'important');
    if(thumbEl) thumbEl.style.setProperty('left', pct, 'important');
    if(videoEl && REPS[idx]) { try { videoEl.currentTime = REPS[idx].timeSec; } catch(e){} }
  }

  function build(){
    if(built) return true;
    var slot = document.getElementById('recap-replay');
    if(slot && VIDEO_SRC){
      videoEl = document.createElement('video');
      videoEl.src = VIDEO_SRC;
      videoEl.setAttribute('playsinline','');
      videoEl.setAttribute('controls','');
      videoEl.muted = false;
      videoEl.controls = true;
      // REVERTED an earlier height cap here — wrong guess (iOS's native
      // video controls overlay the WHOLE video box on tap, not just a
      // bottom strip, so capping height didn't help and broke the
      // intended full-bleed look). Back to 100% of this wrapper's own
      // authored height (560px), matching the original design exactly.
      videoEl.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      videoEl.addEventListener('error', function(){ post({type:'videoDebug', msg:'error', code: videoEl.error && videoEl.error.code}); });
      videoEl.addEventListener('canplay', function(){ post({type:'videoDebug', msg:'canplay'}); });
      slot.parentElement && slot.parentElement.insertBefore(videoEl, slot);
      slot.style.display = 'none';
    }

    var all = document.querySelectorAll('#dc-root div,#dc-root span');
    for(var i=0;i<all.length;i++){
      var el=all[i]; if(el.children.length) continue;
      var t=(el.textContent||'').trim();
      if(/\\u00b7/.test(t) && t===t.toUpperCase() && t.length<40){ exCapsEl=el; el.textContent=EX_NAME; break; }
    }

    var tagCands=document.querySelectorAll('#dc-root div[style*="border-radius: 7px"] span, #dc-root span');
    for(var j=0;j<tagCands.length;j++){
      var tt=(tagCands[j].textContent||'').trim();
      if(/^Rep \\d+$/i.test(tt) || /^Set \\d+ of \\d+$/i.test(tt)){ tagEl=tagCands[j]; break; }
    }
    var bodyCands=document.querySelectorAll('#dc-root div');
    for(var k=0;k<bodyCands.length;k++){
      if(bodyCands[k].querySelector && bodyCands[k].querySelector('svg') && bodyCands[k].children.length===1 && (bodyCands[k].textContent||'').trim().length>10){
        bodyEl=bodyCands[k]; break;
      }
    }

    var tracks=document.querySelectorAll('#dc-root div');
    for(var m=0;m<tracks.length;m++){
      var cs=tracks[m].style;
      if(cs && cs.position==='relative' && cs.flex==='1' && cs.height==='30px'){ trackEl=tracks[m]; break; }
    }
    if(trackEl){
      var kids=trackEl.children;
      if(kids.length>=3){ fillEl=kids[1]; thumbEl=kids[2]; }
      for(var r=trackEl.children.length-1; r>=3; r--){ trackEl.removeChild(trackEl.children[r]); }
      REPS.forEach(function(rep, i){
        var tick=document.createElement('div');
        var leftPct=((i+0.5)/REPS.length*100).toFixed(2)+'%';
        tick.style.cssText='position:absolute;left:'+leftPct+';top:0;bottom:0;width:16px;margin-left:-8px;cursor:pointer;';
        tick.addEventListener('click', function(ii){ return function(ev){ ev.stopPropagation(); show(ii); }; }(i), true);
        trackEl.appendChild(tick);
      });
    }

    built = (tagEl||bodyEl||trackEl) ? true : false;
    return built;
  }

  function wireNav(){
    var hit=0;
    var prevEl=document.querySelector('#dc-root div svg path[d="M10 3 5 8l5 5"]');
    if(prevEl){ var pbtn=prevEl.closest('div'); if(pbtn && !pbtn.__wired){ pbtn.__wired=true; pbtn.addEventListener('click', function(ev){ ev.stopPropagation(); show(idx-1); }, true); hit++; } }
    var nextEl=document.querySelector('#dc-root div svg path[d="M6 3l5 5-5 5"]');
    if(nextEl){ var nbtn=nextEl.closest('div'); if(nbtn && !nbtn.__wired){ nbtn.__wired=true; nbtn.addEventListener('click', function(ev){ ev.stopPropagation(); show(idx+1); }, true); hit++; } }
    if(!closeWired){
      var closeEl=document.querySelector('#dc-root div svg path[d="M2.5 2.5l9 9M11.5 2.5l-9 9"]');
      if(closeEl){ var cbtn=closeEl.closest('div'); if(cbtn){ cbtn.addEventListener('click', function(ev){ ev.stopPropagation(); post({type:'close'}); }, true); closeWired=true; hit++; } }
    }
    if(!finishWired){
      var all=document.querySelectorAll('#dc-root div');
      for(var i=0;i<all.length;i++){
        var el=all[i]; if(el.children.length) continue;
        if((el.textContent||'').trim()==='Finish review'){
          el.addEventListener('click', function(ev){ ev.stopPropagation(); post({type:'close'}); }, true);
          finishWired=true; hit++; break;
        }
      }
    }
    // "All sets" link — recap.tsx's all-sets view no longer has a sibling
    // route to jump sideways into from here, so this just closes back
    // (same as Finish review) rather than trying to deep-link into a
    // specific sub-view of a different screen.
    var allSets=document.querySelector('#dc-root a[href="Form Review.dc.html"]');
    if(allSets && !allSets.__wired){ allSets.__wired=true; allSets.addEventListener('click', function(ev){ ev.preventDefault(); post({type:'close'}); }, true); }
    return hit;
  }

  function apply(){
    var ok = build();
    wireNav();
    if(ok){
      show(0);
      if(!readyPosted){ readyPosted = true; console.log('[rep-feedback-page] ready, posting to RN'); post({type:'ready'}); }
    }
    return ok;
  }
  console.log('[rep-feedback-page] injected JS running, VIDEO_SRC length=', VIDEO_SRC.length, 'reps=', REPS.length);
  if(!apply()) [50,120,250,500,1000,2000,3500].forEach(function(d){ setTimeout(apply,d); });
  var root = document.getElementById('dc-root') || document.body;
  var mo = new MutationObserver(function(){ wireNav(); });
  mo.observe(root, { childList: true, subtree: true, characterData: true });
})();
true;
`;
}

export default function RepFeedbackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { exerciseName, videoUri, repEvents: repEventsParam } = useLocalSearchParams<{
    exerciseName?: string; videoUri?: string; repEvents?: string;
  }>();

  // DIAGNOSTIC — item 6 this round ("tap -> grey -> flashes ~0.4s -> back to
  // grey, something kills it after it loads"): full mount/unmount + WebView
  // lifecycle logging, so the actual sequence (does it mount twice? does the
  // WebView process die? does it error after load?) can be read off the
  // logs instead of guessed at. Explicit instruction: don't attempt another
  // fix until these logs are read.
  useEffect(() => {
    if (__DEV__) console.log('[rep-feedback-debug] MOUNT, params:', { exerciseName, videoUri, repEventsLen: repEventsParam?.length });
    return () => { if (__DEV__) console.log('[rep-feedback-debug] UNMOUNT'); };
  }, []);

  // The recorded clip's real file:// path resolved to a loopback http://
  // URL (see lib/localVideoServer.ts) — a <video> tag can load this
  // directly, unlike a bare file:// src which WKWebView's
  // allowingReadAccessToURL couldn't be made to actually permit.
  const [videoHttpUrl, setVideoHttpUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!videoUri) return;
    (async () => {
      try {
        const url = await getLocalVideoHttpUrl(videoUri);
        if (!cancelled) setVideoHttpUrl(url);
      } catch (err) {
        if (__DEV__) console.error('[rep-feedback] getLocalVideoHttpUrl failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [videoUri]);

  const [ready, setReady] = useState(false);

  const reps = useMemo<{ timeSec: number; what: string }[]>(() => {
    try { return JSON.parse(repEventsParam ?? '[]'); }
    catch (err) { if (__DEV__) console.log('[rep-feedback-debug] repEvents JSON.parse failed:', err); return []; }
  }, [repEventsParam]);

  // Backstop — if the injected JS's own {type:'ready'} message never
  // arrives (e.g. the artboard's markup doesn't match what repFeedbackInject
  // expects), still reveal after a short wait rather than stay blank
  // forever — explicit ask: "never a grey screen."
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setReady(true), 2500);
    return () => clearTimeout(t);
  }, [ready]);

  const injectJs = useMemo(() => {
    if (!videoHttpUrl) return null;
    return repFeedbackInject({
      exerciseName: exerciseName ?? 'Exercise',
      videoUri: videoHttpUrl,
      reps,
    });
  }, [videoHttpUrl, exerciseName, reps]);

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

  // Waiting on the local video server to resolve this clip's http:// URL
  // (see above) — brief, usually near-instant.
  if (!videoHttpUrl) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar style="light" />
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={[styles.backBtn, { top: insets.top + 12 }]}>
          <SymbolView name="chevron.left" size={16} tintColor="#ffffff" type="monochrome" style={{ width: 16, height: 16 }} />
        </TouchableOpacity>
        <View style={styles.center}>
          <ActivityIndicator color="#ffffff" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {injectJs && (
        <WebView
          source={REP_FEEDBACK_HTML}
          originWhitelist={['*']}
          style={[styles.web, { opacity: ready ? 1 : 0 }]}
          injectedJavaScriptBeforeContentLoaded={DC_VIEWPORT_JS}
          injectedJavaScript={injectJs}
          onLoadStart={() => { if (__DEV__) console.log('[rep-feedback-debug] WebView onLoadStart'); }}
          onLoadEnd={() => { if (__DEV__) console.log('[rep-feedback-debug] WebView onLoadEnd'); }}
          onError={(e) => { if (__DEV__) console.log('[rep-feedback-debug] WebView onError', e.nativeEvent); }}
          onHttpError={(e) => { if (__DEV__) console.log('[rep-feedback-debug] WebView onHttpError', e.nativeEvent); }}
          onContentProcessDidTerminate={() => { if (__DEV__) console.log('[rep-feedback-debug] WebView onContentProcessDidTerminate'); }}
          onMessage={(e) => {
            let msg: { type?: string };
            try { msg = JSON.parse(e.nativeEvent.data); } catch {
              if (__DEV__) console.log('[rep-feedback-debug] onMessage: unparseable data=', e.nativeEvent.data);
              return;
            }
            if (__DEV__) console.log('[rep-feedback-debug] onMessage:', msg.type);
            if (msg.type === 'ready') setReady(true);
            else if (msg.type === 'videoDebug') { if (__DEV__) console.log('[rep-feedback-debug] video event:', (msg as any).msg, (msg as any).code); }
            else if (msg.type === 'close') router.back();
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
        />
      )}
      {/* Always-present native back button — independent of the WebView's
          own close wiring, same "never get stuck" policy as the rest of
          this app's webview screens. */}
      <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={[styles.backBtn, { top: insets.top + 12 }]}>
        <SymbolView name="chevron.left" size={16} tintColor="#ffffff" type="monochrome" style={{ width: 16, height: 16 }} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d10' },
  web: { flex: 1, backgroundColor: '#0d0d10' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  msg: { color: '#ffffff', fontSize: 15, textAlign: 'center' },
  backBtn: {
    position: 'absolute', left: 16, width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(20,20,24,0.65)', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
});
