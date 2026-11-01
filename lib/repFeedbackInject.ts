/**
 * lib/repFeedbackInject.ts
 *
 * Page-side injection for the rep-feedback artboard (assets/app screens/
 * repfeedback.html). Moved out of app/rep-feedback.tsx unchanged apart from
 * the scaffold/data split at the bottom, so the warm-WebView host can load the
 * scaffold at app start without importing the screen.
 */

// Same console-forwarding shim as recap.tsx (see its CONSOLE_FORWARD_JS
// comment) — page-internal console.log only reaches Safari Web Inspector
// otherwise, not Metro.
export const CONSOLE_FORWARD_JS = `
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

export const DC_VIEWPORT_JS = `(function(){try{
  var m=document.querySelector('meta[name=viewport]');
  if(!m){ m=document.createElement('meta'); m.name='viewport'; (document.head||document.documentElement).appendChild(m); }
  m.setAttribute('content','width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
}catch(e){}})(); true;`;

export function dcScaleFitJs(bg: string): string {
  return `
  (function(){
    var W=390, H=844;
    // IDEMPOTENT + re-run on every DOM mutation: this script is injected
    // BEFORE the artboard's bundle unpacks, and the bundle then swaps the
    // whole <html> element, throwing away anything appended to the old
    // <head>. A one-shot style element would simply vanish.
    // transition:none alongside animation:none — a CSS *transition* (e.g.
    // "opacity 300ms" on mount) is a different mechanism from a @keyframes
    // animation and animation:none alone doesn't touch it; device logs
    // showed the card's opacity visibly climbing 0 -> ~0.97 over ~300ms.
    var CSS='html{background:${bg}!important;overflow:hidden!important;}body{margin:0!important;padding:0!important;background:${bg}!important;overflow:hidden!important;}#dc-root{position:relative!important;margin:0 auto!important;width:'+W+'px!important;transform-origin:top center!important;}#dc-root *{animation:none!important;-webkit-animation:none!important;transition:none!important;-webkit-transition:none!important;}*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;}';
    function ensureStyle(){
      if(document.getElementById('__fpDcStyle')) return;
      var host=document.head||document.documentElement; if(!host) return;
      var st=document.createElement('style'); st.id='__fpDcStyle'; st.textContent=CSS;
      host.appendChild(st);
    }
    var lastS=-1, lastNudge=0, nudgePending=false;
    function fit(){
      var root=document.getElementById('dc-root'); if(!root) return;
      var vh=window.innerHeight;
      // BUG FOUND (device log, confirmed): fit()'s very first call can run
      // before the WebView has laid out, so window.innerHeight reads 0 —
      // a "||H" fallback applied a WRONG scale that was visibly revealed,
      // then SNAPPED to the real one. Skipping until a real height exists
      // means the first transform ever applied is already correct.
      if(!vh) return;
      var S=vh/H;
      if(Math.abs(S-lastS)>=0.002){ lastS=S; }
      root.style.setProperty('transform','translateY('+lastNudge+'px) scale('+S+')','important');
      document.body.style.setProperty('height', vh+'px','important');
      document.documentElement.style.setProperty('height', vh+'px','important');
      // Reveal gate: the screen only posts 'ready' once the scale is on.
      window.__fpFitted=true;
      if(nudgePending) return;
      nudgePending=true;
      requestAnimationFrame(function(){
        nudgePending=false;
        var rect=root.getBoundingClientRect();
        var gap=vh-rect.bottom;
        if (gap>0.5 && gap<60) {
          lastNudge=lastNudge+gap;
          root.style.setProperty('transform','translateY('+lastNudge+'px) scale('+S+')','important');
        }
      });
    }
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
    function pass(){ ensureStyle(); fit(); hideStatusBar(); }
    pass();
    window.addEventListener('resize', pass);
    [0,100,300,900,1500].forEach(function(d){ setTimeout(pass,d); });
    // Observe the DOCUMENT (not body): the bundle's html swap detaches the
    // old body, so an observer on it would never fire again.
    try { new MutationObserver(pass).observe(document, { childList:true, subtree:true }); } catch(e){}
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
export function repFeedbackDataJs(opts: {
  exerciseName: string;
  hasVideo: boolean;
  reps: { timeSec: number; what: string }[];
}): string {
  const { exerciseName, hasVideo, reps } = opts;
  return `
(function(){
  function post(m){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }catch(e){} }
  var REPS = ${JSON.stringify(reps)};
  var EX_NAME = ${JSON.stringify(exerciseName.toUpperCase())};
  var HAS_VIDEO = ${JSON.stringify(hasVideo)};
  var PAGE_START = Date.now();
  var idx = 0;
  var bgTransparent = false;
  var cardWidened = false;
  var oldControlsWired = false;
  var speedBtn = null, speedTextEl = null;
  // The speed menu is a NATIVE Liquid Glass popover (see rep-feedback.tsx's
  // SpeedMenu) that opens UPWARD — a page-drawn menu can't be real glass (the
  // video behind the WebView is a separate native layer) and used to open
  // downward over the card. The page only reports where its button is.
  function openSpeedMenu(){
    if(!speedBtn) return;
    var r = speedBtn.getBoundingClientRect();
    post({type:'openSpeedMenu', rect:{left:r.left, top:r.top, width:r.width, height:r.height}});
  }
  window.__fpSetSpeedLabel = function(txt){ if(speedTextEl) speedTextEl.textContent = txt; };
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
  // The bar always shows REAL playback position (REAL_CURRENT / REAL_DURATION)
  // and starts at 0% = the very beginning of the video. It used to start at
  // the first rep's position (or, before the duration was known, at a
  // rep-index guess — often the middle of the bar).
  function updateTrackPosition(){
    var pct = (REAL_DURATION > 0)
      ? Math.min(100, Math.max(0, (REAL_CURRENT / REAL_DURATION) * 100)).toFixed(1) + '%'
      : '0%';
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
  function updateTrackFromCurrentTime(){ updateTrackPosition(); }
  // RN calls this continuously (expo-video's timeUpdate event) so the bar
  // actually tracks real playback instead of sitting frozen at whatever
  // rep was last tapped. Ignored mid-drag so it doesn't fight the user's
  // own finger.
  window.__fpSetCurrentTime = function(t){
    REAL_CURRENT = t;
    if(!dragging) updateTrackFromCurrentTime();
  };
  function show(i, initial){
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
    // The first show() (page just opened) only fills in rep 1's TEXT — the
    // video and the bar both start at the beginning. Later taps/Next seek.
    if(!initial && REPS[idx]){
      REAL_CURRENT = REPS[idx].timeSec;
      updateTrackPosition();
      post({type:'seek', timeSec: REPS[idx].timeSec});
    }
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
          openSpeedMenu();
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

    // BUG FOUND (confirmed by loading the real design file in a real
    // browser and reading the ACTUAL live style values back, not guessing
    // from the raw source — see scripts/debug-track-element.js): the
    // source markup says "flex: 1", but the browser NORMALIZES that
    // shorthand the instant it's parsed, so el.style.flex reads back as
    // "1 1 0%", never "1". This selector has therefore NEVER matched,
    // ever, in any round this session — trackEl was always null, so the
    // ENTIRE scrub bar block below (fill/thumb detection, tick creation,
    // AND the drag wiring) never ran a single time. Not a timing bug, not
    // a touch-interception bug — the element was simply never found.
    // style.flexGrow is NOT normalized the same way and reads back "1"
    // for the track vs "0" for the round thumb/tick dots (which use
    // "flex: 0 0 auto") — a reliable way to tell them apart.
    var tracks=document.querySelectorAll('#dc-root div');
    for(var m=0;m<tracks.length;m++){
      var cs=tracks[m].style;
      if(cs && cs.position==='relative' && cs.flexGrow==='1' && cs.height==='30px'){ trackEl=tracks[m]; break; }
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
      if(fillEl) fillEl.style.setProperty('width', '0%', 'important');
      if(thumbEl) thumbEl.style.setProperty('left', '0%', 'important');
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
    // Ready = real content built AND canvas at its final scale
    // (window.__fpFitted, set by dcScaleFitJs only once innerHeight is real).
    // The old fixed "wait until PAGE_START+350ms" delay is gone — the scale
    // bug it guarded against is prevented by fit() itself, and 'ready' is
    // judged from cumulative state so a deferred first apply() can't strand it.
    if(ok && window.__fpFitted && !readyPosted){
      show(0, true);
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
  apply();
  [50,120,250,500,1000,2000,3500].forEach(function(d){ setTimeout(apply,d); });
  // Observe the DOCUMENT, not #dc-root/body: this script runs before the
  // bundle unpacks and the bundle swaps the whole <html> element, which
  // detaches whatever an earlier observer was attached to. Reacting to the
  // first real mutation (not a poll schedule) shows the card the moment the
  // page has rendered.
  var mo = new MutationObserver(function(){ if(!readyPosted) apply(); wireNav(); });
  mo.observe(document, { childList: true, subtree: true, characterData: true });
})();
true;
`;
}


// Scaffold only (styles, scale-to-fit, status-bar hiding) — no data in it, so
// a WebView can load it before the screen opens (components/WarmSurfaces.tsx).
export function repFeedbackBaseJs(): string {
  return CONSOLE_FORWARD_JS + dcScaleFitJs('transparent');
}

// Scaffold + data in one string: the cold path, used by the latency test.
export function repFeedbackInject(opts: Parameters<typeof repFeedbackDataJs>[0]): string {
  return CONSOLE_FORWARD_JS + dcScaleFitJs(opts.hasVideo ? 'transparent' : '#0d0d10') + repFeedbackDataJs(opts);
}
