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
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { WebView } from 'react-native-webview';
import { useVideoPlayer, VideoView } from 'expo-video';
import VideoControls from '../components/VideoControls';
import { repFeedbackSignal } from '../lib/repFeedbackSignal';

const REP_FEEDBACK_HTML = require('../assets/app screens/repfeedback.html');

// Build/bundle confirmation — explicit ask this round: a loud, impossible
// -to-miss tag to confirm the device is actually running this reload
// before trusting any other log below it.
const BUILD_TAG = 'native-video-13';
const BUILD_LOADED_AT = new Date().toLocaleTimeString();
if (__DEV__) {
  console.log(`[rep-feedback] build ${BUILD_TAG}`);
  console.log(`[rep-feedback-debug] build ${BUILD_TAG} loaded ${BUILD_LOADED_AT}`);
}

// Same console-forwarding shim as recap.tsx (see its CONSOLE_FORWARD_JS
// comment) — page-internal console.log only reaches Safari Web Inspector
// otherwise, not Metro.
const CONSOLE_FORWARD_JS = `
(function(){
  function fwd(level, args){
    try {
      var parts = [];
      for (var i=0;i<args.length;i++){
        var a = args[i];
        try { parts.push(typeof a === 'string' ? a : JSON.stringify(a)); } catch(e){ parts.push(String(a)); }
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pageConsole', level: level, msg: parts.join(' ') }));
    } catch(e){}
  }
  ['log','warn','error'].forEach(function(level){
    var orig = console[level];
    console[level] = function(){
      fwd(level, arguments);
      orig.apply(console, arguments);
    };
  });
})();
`;

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
    st.textContent='html{background:${bg}!important;overflow:hidden!important;}body{margin:0!important;padding:0!important;background:${bg}!important;overflow:hidden!important;}#dc-root{position:relative!important;margin:0 auto!important;width:'+W+'px!important;transform-origin:top center!important;}*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;}';
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
// replacement). Posts {type:'ready'} the FIRST time it successfully
// builds, so this screen knows when it's safe to reveal the WebView
// without ever showing the artboard's own fake demo content. No longer
// creates a <video> element — just hides the artboard's own placeholder
// slot and neutralizes its background so the native player (rendered
// behind this WebView, see RepFeedbackScreen below) shows through.
// Seeking posts {type:'seek', timeSec} instead of setting .currentTime
// on a (no-longer-existing) local <video>.
function repFeedbackInject(opts: {
  exerciseName: string;
  hasVideo: boolean;
  reps: { timeSec: number; what: string }[];
}): string {
  const { exerciseName, hasVideo, reps } = opts;
  return CONSOLE_FORWARD_JS + dcScaleFitJs(hasVideo ? 'transparent' : '#0d0d10') + `
(function(){
  function post(m){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }catch(e){} }
  var REPS = ${JSON.stringify(reps)};
  var EX_NAME = ${JSON.stringify(exerciseName.toUpperCase())};
  var HAS_VIDEO = ${JSON.stringify(hasVideo)};
  var idx = 0;
  var bgTransparent = false;
  var cardWidened = false;
  var oldControlsWired = false;
  var SPEEDS = [0.5, 1, 1.5, 2];
  var speedIdx = 1;
  var speedBtn = null, speedTextEl = null, speedMenuEl = null;
  function closeSpeedMenu(){
    if(speedMenuEl){ speedMenuEl.parentNode.removeChild(speedMenuEl); speedMenuEl = null; }
  }
  function openSpeedMenu(){
    if(!speedBtn) return;
    closeSpeedMenu();
    var rect = speedBtn.getBoundingClientRect();
    speedMenuEl = document.createElement('div');
    speedMenuEl.style.cssText = 'position:fixed; left:'+rect.left+'px; top:'+(rect.bottom+6)+'px; background:rgba(20,20,24,0.94); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); border-radius:14px; padding:6px; z-index:50; box-shadow:0 8px 24px rgba(0,0,0,0.4);';
    SPEEDS.forEach(function(s, i){
      var opt = document.createElement('div');
      opt.textContent = s + 'x';
      opt.style.cssText = 'padding:9px 18px; color:#ffffff; font-size:14px; font-weight:700; border-radius:9px; cursor:pointer; font-variant-numeric: tabular-nums;' + (i===speedIdx ? ' background:rgba(255,255,255,0.18);' : '');
      opt.addEventListener('click', function(ev){
        ev.stopPropagation();
        speedIdx = i;
        if(speedTextEl) speedTextEl.textContent = SPEEDS[i] + 'x';
        post({type:'setSpeed', rate: SPEEDS[i]});
        closeSpeedMenu();
      }, true);
      speedMenuEl.appendChild(opt);
    });
    document.body.appendChild(speedMenuEl);
  }
  document.addEventListener('click', function(ev){
    if(speedMenuEl && ev.target !== speedBtn && !speedBtn.contains(ev.target)){ closeSpeedMenu(); }
  }, true);
  var tagEl = null, bodyEl = null, exCapsEl = null;
  var trackEl = null, fillEl = null, thumbEl = null;
  var trackDragWired = false;
  var dragging = false;
  var closeWired=false, finishWired=false, cornerSwapped=false;
  var finishBtnEl = null;
  var built = false, readyPosted = false;

  // BUG FOUND (confirmed from device logs this round): stripping only
  // TEXT-node children left the old demo sentence ("So close! You
  // stopped just above parallel...") showing right alongside the real
  // text — proof that whatever's carrying that old text isn't a plain
  // text node (the templating engine likely wraps the {{body}}
  // interpolation in its own element at runtime, invisible in the raw
  // static export). Fixed more aggressively: remove EVERY child except
  // the sparkle <svg> icon itself (by tag name, not node type), then
  // append exactly one new text node — correct regardless of whether the
  // old content is a text node, a span, or anything else.
  function setBodyText(text){
    if(!bodyEl) return;
    var kids = Array.prototype.slice.call(bodyEl.childNodes);
    for(var n=0;n<kids.length;n++){
      var node = kids[n];
      if(node.nodeType === 1 && node.tagName === 'svg') continue;
      bodyEl.removeChild(node);
    }
    bodyEl.appendChild(document.createTextNode(text));
  }
  var REAL_DURATION = 0;
  function updateTrackPosition(){
    var pct;
    if(REAL_DURATION > 0 && REPS[idx]){
      pct = Math.min(100, Math.max(0, (REPS[idx].timeSec / REAL_DURATION) * 100)).toFixed(1) + '%';
    } else {
      // Fallback before the real duration has arrived from RN.
      pct = ((idx + 0.5) / REPS.length * 100).toFixed(1) + '%';
    }
    if(fillEl) fillEl.style.setProperty('width', pct, 'important');
    if(thumbEl) thumbEl.style.setProperty('left', pct, 'important');
  }
  // RN calls this (via injectJavaScript) once videoPlayer.duration is
  // known — see rep-feedback.tsx's own onDurationKnown effect.
  window.__fpSetDuration = function(d){
    REAL_DURATION = d;
    console.log('[rep-feedback-page] real duration received:', d);
    updateTrackPosition();
  };
  var REAL_CURRENT = 0;
  function updateTrackFromCurrentTime(){
    if(REAL_DURATION <= 0) return;
    var pct = Math.min(100, Math.max(0, (REAL_CURRENT / REAL_DURATION) * 100)).toFixed(1) + '%';
    if(fillEl) fillEl.style.setProperty('width', pct, 'important');
    if(thumbEl) thumbEl.style.setProperty('left', pct, 'important');
  }
  // RN calls this continuously (expo-video's timeUpdate event) so the bar
  // actually tracks real playback instead of sitting frozen at whatever
  // rep was last tapped. Ignored mid-drag so it doesn't fight the user's
  // own finger.
  window.__fpSetCurrentTime = function(t){
    REAL_CURRENT = t;
    if(!dragging) updateTrackFromCurrentTime();
  };
  function show(i){
    if(REPS.length === 0){
      if(tagEl) tagEl.textContent = 'No reps recorded';
      setBodyText('This set didn\\'t capture any rep data.');
      if(fillEl) fillEl.style.setProperty('width', '0%', 'important');
      if(thumbEl) thumbEl.style.setProperty('left', '0%', 'important');
      console.log('[rep-feedback-page] show(): REPS.length===0, nothing to show');
      return;
    }
    idx = Math.max(0, Math.min(REPS.length - 1, i));
    if(tagEl) tagEl.textContent = 'Rep ' + (idx + 1);
    setBodyText(REPS[idx].what);
    // DIAGNOSTIC — explicit ask: "its stored form result/score, which
    // branch repFeedbackText() picked, and the final text shown" (the
    // branch itself was picked back in recap.tsx — repEvents[i].what IS
    // that result, already computed; this confirms what arrived here and
    // whether it actually landed in the DOM).
    console.log('[rep-feedback-page] show(' + i + ') -> idx=' + idx, 'rep=', JSON.stringify(REPS[idx]), 'bodyEl found=', !!bodyEl, 'bodyEl.textContent after set=', JSON.stringify(bodyEl ? bodyEl.textContent : null));
    // BUG FOUND ("time bar... has to start at the beginning and go with
    // the actual video length"): this used to compute the thumb/fill
    // position as a fraction of REP INDEX (rep 2 of 4 = 50%), not a
    // fraction of the REAL video's time — completely different scale
    // from what dragging computes (real pixel position / real duration),
    // so tapping a rep and then dragging looked inconsistent. The real
    // duration only exists on the RN side (videoPlayer.duration), posted
    // over once the player is ready (see setDuration below) — until it
    // arrives, REAL_DURATION stays 0 and position falls back to the old
    // rep-index math rather than dividing by zero.
    updateTrackPosition();
    if(REPS[idx]) post({type:'seek', timeSec: REPS[idx].timeSec});
    // Explicit ask: "say 'next rep' until the final rep, then 'finish
    // review'" — relabeled every time the shown rep changes.
    if(finishBtnEl){ finishBtnEl.textContent = (idx < REPS.length - 1) ? 'Next rep' : 'Finish review'; }
  }

  function build(){
    if(built) return true;
    // Video now plays NATIVELY (expo-video — see this file's header
    // comment) in a real AVPlayer positioned behind this WebView. Just
    // hide the artboard's own placeholder slot and neutralize the two
    // backgrounds that would otherwise opaquely cover the native player
    // (the slot's own wrapper, and the artboard's root content div — both
    // have their own explicit inline background baked into the design
    // file, which an html/body-level transparent background alone
    // doesn't override).
    if(!bgTransparent && HAS_VIDEO){
      var slot = document.getElementById('recap-replay');
      if(slot){
        slot.style.display = 'none';
        var wrap = slot.parentElement;
        if(wrap) wrap.style.setProperty('background','transparent','important');
        var rootDiv = document.querySelector('[data-screen-label="Rep feedback"]');
        if(rootDiv) rootDiv.style.setProperty('background','transparent','important');
        bgTransparent = true;
      }
    }
    // Explicit ask: "the rep feedback card isn't fully attached to the
    // screen like workout complete is" — same fix as recap.tsx's card,
    // never applied here. This card is positioned via top+bottom (not
    // top+height), so closing the gap is just bottom:0 — no fixed-height
    // math needed like recap.tsx's card required.
    if(!cardWidened){
      var rfCard = document.querySelector('#dc-root div[style*="border-radius: 36px"]');
      if(rfCard){
        rfCard.style.setProperty('left','0px','important');
        rfCard.style.setProperty('right','0px','important');
        rfCard.style.setProperty('bottom','0px','important');
        rfCard.style.setProperty('border-radius','36px 36px 0 0','important');
        cardWidened = true;
      }
    }
    // Explicit ask: "I like how the time bar and the speed option were
    // always shown... have them right above the white card, and the
    // time adjustment one a clock icon." That's exactly this artboard's
    // own built-in row (found by reading the raw file — speed pill with
    // a real clock icon + scrub bar + fullscreen button, baked in right
    // above the card). It was briefly hidden last round on the theory
    // that it duplicated a native React control bar; it's un-hidden now
    // and wired for real, since it's the actual design the user wants —
    // the native VideoControls component now only covers skip/play/pause,
    // which this artboard has no equivalent for.
    if(!oldControlsWired){
      var clockPath = document.querySelector('#dc-root svg path[d="M8 8l2.6-2.4"]');
      speedBtn = clockPath ? clockPath.closest('div') : null;
      speedTextEl = speedBtn ? speedBtn.querySelector('span') : null;
      // Explicit ask: "when I tap it, let me pick which speed I want, not
      // just auto-move to the next one." A small picker menu instead of
      // a cycling tap.
      if(speedBtn && !speedBtn.__wired){
        speedBtn.__wired = true;
        speedBtn.addEventListener('click', function(ev){
          ev.stopPropagation();
          if(speedMenuEl){ closeSpeedMenu(); } else { openSpeedMenu(); }
        }, true);
      }
      var fsPath = document.querySelector('#dc-root svg path[d="M8.5 2h3.5v3.5M5.5 12H2V8.5M12 2 8 6M2 12l4-4"]');
      var fullscreenBtn = fsPath ? fsPath.closest('div') : null;
      if(fullscreenBtn && !fullscreenBtn.__wired){
        fullscreenBtn.__wired = true;
        fullscreenBtn.addEventListener('click', function(ev){ ev.stopPropagation(); post({type:'enterFullscreen'}); }, true);
      }
      console.log('[rep-feedback-page] old controls wiring: speedBtn=', !!speedBtn, 'fullscreenBtn=', !!fullscreenBtn);
      if(speedBtn && fullscreenBtn){ oldControlsWired = true; }
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
    // BUG FOUND (confirmed from device logs this round, not guessed): the
    // style-attribute selector ("padding-top: 12px; font-size: 17px;
    // line-height: 1.5") NEVER matched at runtime — logged every time as
    // "tight selector FAILED" — meaning the runtime-rendered inline style
    // string doesn't match what the raw static export file shows (the
    // templating engine likely reorders/reformats it). Every real rep
    // fell through to the loose heuristic instead, which found a
    // DIFFERENT element. Fixed properly this time: the body div's own
    // sparkle icon has a unique, stable SVG path ("M9.4 2.6c.3 3.9 2.4
    // 6..."), found straight from the raw artboard — the exact same
    // find-by-icon-path pattern already used successfully elsewhere in
    // this file (prevEl/nextEl/closeEl), not a style string.
    var sparkle = document.querySelector('#dc-root svg path[d^="M9.4 2.6c.3 3.9 2.4 6"]');
    bodyEl = sparkle ? sparkle.closest('div') : null;
    console.log('[rep-feedback-page] bodyEl found via sparkle-icon selector:', !!bodyEl);

    var tracks=document.querySelectorAll('#dc-root div');
    for(var m=0;m<tracks.length;m++){
      var cs=tracks[m].style;
      if(cs && cs.position==='relative' && cs.flex==='1' && cs.height==='30px'){ trackEl=tracks[m]; break; }
    }
    if(trackEl){
      // BUG FOUND (reviewing this before relying on it again): fillEl/
      // thumbEl used to be picked by fixed child index (kids[1]/kids[2]),
      // which assumed the artboard's own sc-for template never renders
      // real placeholder-tick DOM nodes between the fill and the thumb.
      // If it does, those indices silently point at the wrong elements.
      // Selecting by each element's own distinguishing style (thumb is a
      // 16x16 circle; fill and the track background are both 4px-tall
      // 999px-radius bars, fill being the second of the two in document
      // order) is correct regardless of how many ticks the template adds.
      var trackKids = Array.prototype.slice.call(trackEl.children);
      var keep = [];
      var matchedBarOnce = false;
      for(var tk=0; tk<trackKids.length; tk++){
        var kEl = trackKids[tk];
        var kcs = kEl.style;
        if(kcs && kcs.borderRadius === '50%' && kcs.width === '16px' && kcs.height === '16px'){
          thumbEl = kEl; keep.push(kEl);
        } else if(kcs && kcs.borderRadius === '999px' && kcs.height === '4px'){
          keep.push(kEl);
          if(!matchedBarOnce){ matchedBarOnce = true; } else { fillEl = kEl; }
        }
      }
      console.log('[rep-feedback-page] track fillEl found=', !!fillEl, 'thumbEl found=', !!thumbEl);
      for(var tk2=trackKids.length-1; tk2>=0; tk2--){
        if(keep.indexOf(trackKids[tk2]) === -1){ trackEl.removeChild(trackKids[tk2]); }
      }
      REPS.forEach(function(rep, i){
        var tick=document.createElement('div');
        var leftPct=((i+0.5)/REPS.length*100).toFixed(2)+'%';
        tick.style.cssText='position:absolute;left:'+leftPct+';top:0;bottom:0;width:16px;margin-left:-8px;cursor:pointer;';
        tick.addEventListener('click', function(ii){ return function(ev){ ev.stopPropagation(); show(ii); }; }(i), true);
        trackEl.appendChild(tick);
      });
      // Explicit ask: "dragging/tapping it must seek the video." Wired
      // directly as the WebView's OWN pointer events this time, not a
      // native RN PanResponder — there's no native/WebView boundary to
      // cross here at all, so the whole Pressable-vs-PanResponder touch-
      // conflict class of bug from the native attempt doesn't apply.
      if(!trackDragWired){
        trackDragWired = true;
        var seekFromClientX = function(clientX){
          var rect = trackEl.getBoundingClientRect();
          var frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
          var pct = (frac*100).toFixed(2) + '%';
          if(fillEl) fillEl.style.setProperty('width', pct, 'important');
          if(thumbEl) thumbEl.style.setProperty('left', pct, 'important');
          if(REAL_DURATION > 0) REAL_CURRENT = frac * REAL_DURATION;
          post({type:'scrub', frac: frac});
        };
        // BUG FOUND (still reported broken with no logs to confirm why —
        // reconsidering rather than guessing the same fix twice): Pointer
        // Events support inside WKWebView has historically been
        // inconsistent, and react-native-webview's own gesture handling
        // can swallow touches before they reach page-level pointer
        // listeners. Adding touchstart/touchmove as well costs nothing
        // and covers the case where pointer events simply never fire —
        // logged so next round's Metro output says definitively which
        // (if either) actually fired.
        trackEl.addEventListener('pointerdown', function(ev){ console.log('[rep-feedback-page] scrub pointerdown'); dragging = true; seekFromClientX(ev.clientX); }, true);
        trackEl.addEventListener('pointermove', function(ev){ if(dragging) seekFromClientX(ev.clientX); }, true);
        window.addEventListener('pointerup', function(){ dragging = false; }, true);
        window.addEventListener('pointercancel', function(){ dragging = false; }, true);
        trackEl.addEventListener('touchstart', function(ev){ console.log('[rep-feedback-page] scrub touchstart'); dragging = true; if(ev.touches && ev.touches[0]) seekFromClientX(ev.touches[0].clientX); }, true);
        trackEl.addEventListener('touchmove', function(ev){ if(dragging && ev.touches && ev.touches[0]){ ev.preventDefault(); seekFromClientX(ev.touches[0].clientX); } }, true);
        window.addEventListener('touchend', function(){ dragging = false; }, true);
        window.addEventListener('touchcancel', function(){ dragging = false; }, true);
      }
    }

    built = (tagEl||bodyEl||trackEl) ? true : false;
    return built;
  }

  function wireNav(){
    var hit=0;
    // DIAGNOSTIC — explicit ask: "I can't tell if they work... log each
    // tap: rep index + seek time." show() already logs the rep/seek on
    // every call; these two lines confirm the buttons were actually
    // FOUND and wired at all (a silent selector miss would mean taps do
    // nothing with no error anywhere).
    var prevEl=document.querySelector('#dc-root div svg path[d="M10 3 5 8l5 5"]');
    if(prevEl){ var pbtn=prevEl.closest('div'); if(pbtn && !pbtn.__wired){ pbtn.__wired=true; pbtn.addEventListener('click', function(ev){ ev.stopPropagation(); console.log('[rep-feedback-page] PREV tapped, idx before=', idx); show(idx-1); }, true); hit++; console.log('[rep-feedback-page] prev button found and wired'); } }
    var nextEl=document.querySelector('#dc-root div svg path[d="M6 3l5 5-5 5"]');
    if(nextEl){ var nbtn=nextEl.closest('div'); if(nbtn && !nbtn.__wired){ nbtn.__wired=true; nbtn.addEventListener('click', function(ev){ ev.stopPropagation(); console.log('[rep-feedback-page] NEXT tapped, idx before=', idx); show(idx+1); }, true); hit++; console.log('[rep-feedback-page] next button found and wired'); } }
    if(!prevEl || !nextEl){ console.log('[rep-feedback-page] wireNav: prevEl found=', !!prevEl, 'nextEl found=', !!nextEl); }
    // BUG FOUND ("pressing the pause button does nothing"): this is the
    // card's OWN play/pause button, in the Summary/prev/pause/next row —
    // a completely different element from the video-area skip/play/pause
    // buttons. It was never wired at all this whole time (wireNav only
    // ever handled prev/next/close/finish/all-sets). Found via the
    // pause-bars icon's rect path (the artboard's own default demo state
    // always shows the pause-bars icon, never the play-triangle one, so
    // that's the one guaranteed to be in the DOM to select by).
    var pauseIconEl=document.querySelector('#dc-root svg rect[x="2"][y="1.5"]');
    if(pauseIconEl){ var cardPlayBtn=pauseIconEl.closest('div'); if(cardPlayBtn && !cardPlayBtn.__wired){ cardPlayBtn.__wired=true; cardPlayBtn.addEventListener('click', function(ev){ ev.stopPropagation(); console.log('[rep-feedback-page] card play/pause tapped'); post({type:'togglePlayPause'}); }, true); hit++; console.log('[rep-feedback-page] card play/pause button found and wired'); } }
    var closeEl=document.querySelector('#dc-root div svg path[d="M2.5 2.5l9 9M11.5 2.5l-9 9"]');
    var cbtn = closeEl ? closeEl.closest('div') : null;
    if(!closeWired){
      if(cbtn){ cbtn.addEventListener('click', function(ev){ ev.stopPropagation(); post({type:'close'}); }, true); closeWired=true; hit++; } }
    // Explicit ask (reversing the earlier swap): close button on the
    // left, All sets on the right — and use a back-chevron instead of an
    // X glyph. Reuses the exact chevron path already proven to render
    // correctly elsewhere in this file (prevEl).
    if(!cornerSwapped){
      var asLinkForOrder = document.querySelector('#dc-root a[href="Form Review.dc.html"]');
      if(asLinkForOrder) asLinkForOrder.style.setProperty('order','1','important');
      if(cbtn) cbtn.style.setProperty('order','0','important');
      if(closeEl){ closeEl.setAttribute('d','M10 3 5 8l5 5'); }
      if(asLinkForOrder && cbtn){ cornerSwapped = true; }
    }
    if(!finishWired){
      var all=document.querySelectorAll('#dc-root div');
      for(var i=0;i<all.length;i++){
        var el=all[i]; if(el.children.length) continue;
        if((el.textContent||'').trim()==='Finish review'){
          // Explicit ask: "say 'next rep' until the final rep, then
          // 'finish review'." Stored as finishBtnEl so show() (below) can
          // keep relabeling it; the click handler itself checks idx at
          // the moment it's tapped, so it always does the right thing
          // regardless of what it's currently labeled.
          finishBtnEl = el;
          el.addEventListener('click', function(ev){
            ev.stopPropagation();
            if(idx < REPS.length - 1){ show(idx+1); }
            else { post({type:'finishReview'}); }
          }, true);
          finishWired=true; hit++; break;
        }
      }
    }
    // "All sets" link — recap.tsx's all-sets view no longer has a sibling
    // route to jump sideways into from here, so this just closes back
    // (same as X/close) rather than trying to deep-link into a
    // specific sub-view of a different screen.
    var allSets=document.querySelector('#dc-root a[href="Form Review.dc.html"]');
    if(allSets && !allSets.__wired){ allSets.__wired=true; allSets.addEventListener('click', function(ev){ ev.preventDefault(); post({type:'close'}); }, true); }
    return hit;
  }

  function apply(){
    var ok = build();
    wireNav();
    // BUG FOUND (device logs): build() guards against re-running once
    // built, but apply() itself didn't — so every leftover scheduled
    // retry (50/120/250/500/1000/2000/3500ms) kept calling show(0) again
    // even long after the page was already built and 'ready' already
    // posted. Each call re-sent {type:'seek'} to RN, re-seeking the
    // native player to the SAME timestamp over and over — harmless no-op
    // for the old HTML5 <video>, but visibly stutters a real AVPlayer.
    // show(0) (and the resulting seek) now only ever fires once, the
    // first time apply() actually succeeds.
    if(ok && !readyPosted){
      show(0);
      readyPosted = true;
      console.log('[rep-feedback-page] ready, posting to RN');
      post({type:'ready'});
      // DIAGNOSTIC — explicit ask: "add a log for the card's visibility
      // state and its on-screen position/size after the 'ready' message."
      // Logged immediately AND again at +300ms (RN's own opacity reveal
      // and the card's own CSS transition may still be settling right at
      // the instant 'ready' fires) so a second, stable reading is
      // available too.
      function logCardRect(tag){
        var cardEl = document.querySelector('#dc-root div[style*="border-radius: 36px"]');
        if(!cardEl){ console.log('[rep-feedback-page] card rect ('+tag+'): ELEMENT NOT FOUND via border-radius:36px selector'); return; }
        var r = cardEl.getBoundingClientRect();
        var cs = window.getComputedStyle(cardEl);
        console.log('[rep-feedback-page] card rect ('+tag+'):', JSON.stringify({
          x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, bottom: r.bottom
        }), 'display=', cs.display, 'visibility=', cs.visibility, 'opacity=', cs.opacity, 'zIndex=', cs.zIndex, 'transform=', cs.transform);
        if(bodyEl){
          var br = bodyEl.getBoundingClientRect();
          console.log('[rep-feedback-page] bodyEl rect ('+tag+'):', JSON.stringify({
            x: br.x, y: br.y, width: br.width, height: br.height
          }), 'text=', JSON.stringify((bodyEl.textContent||'').slice(0,60)));
        } else {
          console.log('[rep-feedback-page] bodyEl ('+tag+'): NULL — neither tight selector nor loose fallback matched anything');
        }
      }
      logCardRect('immediate');
      setTimeout(function(){ logCardRect('+300ms'); }, 300);
    }
    return ok;
  }
  console.log('[rep-feedback-page] injected JS running, HAS_VIDEO=', HAS_VIDEO, 'reps=', REPS.length);
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
  const videoPlayer = useVideoPlayer(videoUri ?? null, (p) => { p.loop = true; p.muted = false; p.timeUpdateEventInterval = 0.2; });
  const videoViewRef = useRef<VideoView>(null);
  const webRef = useRef<WebView>(null);
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
          webRef.current?.injectJavaScript(`window.__fpSetDuration && window.__fpSetDuration(${d}); true;`);
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
      webRef.current?.injectJavaScript(`window.__fpSetCurrentTime && window.__fpSetCurrentTime(${currentTime}); true;`);
    });
    return () => { statusSub.remove(); playingSub.remove(); timeUpdateSub.remove(); };
  }, [videoPlayer, videoUri, videoFade]);

  const [ready, setReady] = useState(false);

  const reps = useMemo<{ timeSec: number; good: boolean; what: string }[]>(() => {
    try {
      const parsed = JSON.parse(repEventsParam ?? '[]');
      if (__DEV__) console.log('[rep-feedback-debug] parsed reps from route param:', JSON.stringify(parsed));
      return parsed;
    }
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
    return repFeedbackInject({
      exerciseName: exerciseName ?? 'Exercise',
      hasVideo,
      reps,
    });
  }, [hasVideo, exerciseName, reps]);

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
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: videoFade }]} pointerEvents="none">
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
            onFullscreenExit={() => { if (__DEV__) console.log('[rep-feedback-debug] onFullscreenExit — videoVisuallyReady=', videoVisuallyReady, 'ready=', ready); }}
          />
        </Animated.View>
      )}
      <WebView
        ref={webRef}
        source={REP_FEEDBACK_HTML}
        originWhitelist={['*']}
        style={[styles.web, videoVisuallyReady && { backgroundColor: 'transparent' }, { opacity: ready ? 1 : 0 }]}
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
          if (msg.type === 'ready') {
            // DIAGNOSTIC — cross-reference against the page's own card
            // rect log: confirms what RN-side state the WebView actually
            // reveals under (opacity, transparent background) at the same
            // moment.
            if (__DEV__) console.log('[rep-feedback-debug] ready received — videoVisuallyReady=', videoVisuallyReady, 'will set ready=true (opacity -> 1)');
            setReady(true);
            // Safety net: the page's own JS might not have finished
            // running yet the first time duration became known (a real
            // race, not guessed — the page posts its own console logs
            // before 'ready', confirming its script can take a moment to
            // execute), so push it again now that 'ready' proves the
            // page's own functions are definitely defined.
            const d = videoPlayer.duration;
            if (d > 0) {
              webRef.current?.injectJavaScript(`window.__fpSetDuration && window.__fpSetDuration(${d}); true;`);
            }
          }
          else if (msg.type === 'seek') {
            const t = (msg as any).timeSec ?? 0;
            videoPlayer.currentTime = t;
            // DIAGNOSTIC — the other half of prev/next's "seek the video
            // to that rep's start time": confirms the RN side actually
            // received this message and applied it to the real player.
            if (__DEV__) console.log('[rep-feedback-debug] seek message received, timeSec=', t, '- videoPlayer.currentTime immediately after =', videoPlayer.currentTime);
          }
          else if (msg.type === 'pageConsole') { if (__DEV__) console.log(`[rep-feedback-page:${(msg as any).level}]`, (msg as any).msg); }
          else if (msg.type === 'close') router.back();
          else if (msg.type === 'finishReview') { repFeedbackSignal.finishedReview = true; router.back(); }
          else if (msg.type === 'setSpeed') {
            const rate = (msg as any).rate ?? 1;
            videoPlayer.playbackRate = rate;
            if (__DEV__) console.log('[rep-feedback-debug] setSpeed rate=', rate, '- videoPlayer.playbackRate after =', videoPlayer.playbackRate);
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
      {/* Custom inline controls — same mechanism and same reasoning as
          recap.tsx: real Apple fullscreen was rejected (took the card off
          screen) and plain nativeControls never shows anything inline
          without it, so this sidesteps native controls entirely. Same
          zone the old tap-to-fullscreen Pressable used. */}
      {/* BUG FOUND ("time bar/speed/fullscreen do nothing, video controls
          come up instead"): this zone used to extend all the way down to
          the card's top edge (36.02% from bottom), which fully
          overlapped the artboard's own speed/scrub/fullscreen row
          (baked in at canvas y=498px, well above the card at y=540px).
          My own Pressable was sitting on top of that row, swallowing
          every tap meant for it. Shortened to stop right at the row's
          own top edge (844-498=346, 346/844≈41.35% from bottom) so that
          row is never covered at all. */}
      {hasVideo && (
        <VideoControls player={videoPlayer} style={{ position: 'absolute', left: 0, right: 0, top: '11.85%', bottom: '41.35%' }} />
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  msg: { color: '#ffffff', fontSize: 15, textAlign: 'center' },
  backBtn: {
    position: 'absolute', left: 16, width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(20,20,24,0.65)', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
});
