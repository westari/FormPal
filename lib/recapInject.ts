/**
 * lib/recapInject.ts
 *
 * Page-side injection for the Workout Complete artboard (assets/app screens/
 * workoutrecap.html) plus the shared scale-to-fit scaffold the other recap
 * artboards use. Moved out of app/recap.tsx unchanged (apart from the
 * base/data split at the bottom) so the warm-WebView host can load the
 * scaffold at app start without importing the screen.
 */

export function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}


// Both artboards are FIXED 390x844 canvases (raw Claude-Design exports,
// same as onboarding's DC pages and run.tsx's demo/connect-music screens)
// — scaled to fit both width and height, centered, same technique as
// everywhere else in the app this applies.
// viewport-fit=cover added — explicit retry at the "card not flush to the
// bottom" bug. The contentInsetAdjustmentBehavior="never" WebView prop
// tried earlier did NOT fix it. Without viewport-fit=cover, WKWebView's
// window.innerHeight reports the LAYOUT viewport height with the home-
// indicator safe area already excluded — shorter than the real screen —
// so dcScaleFitJs's own "scale #dc-root to exactly vh" math was scaling
// to a target that was already too short, landing the bottom-anchored
// card above the true bottom edge every time. viewport-fit=cover makes
// window.innerHeight report the FULL device height instead.
export const DC_VIEWPORT_JS = `(function(){try{
  var m=document.querySelector('meta[name=viewport]');
  if(!m){ m=document.createElement('meta'); m.name='viewport'; (document.head||document.documentElement).appendChild(m); }
  m.setAttribute('content','width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
}catch(e){}})(); true;`;

// BUG FOUND (device test, round 1): the original version used
// position:absolute + left/top 50% + translate(-50%,-50%) on #dc-root,
// with no explicit body height — body's own box was collapsing toward 0
// height and swallowing hit-testing. Replaced with position:relative +
// margin:auto + scale-only transform, body height explicitly set.
//
// BUG FOUND (device test, round 2): that fix used "contain" scaling
// (fit both width and height, Math.min) — read as "the card doesn't
// reach the edges, gap below and on the sides" on these full-bleed
// screens. Switched to filling the height EXACTLY (S = vh/H, not
// clamped to <=1) so the bottom-anchored card always lands flush with
// the real bottom edge; width is best-effort via overflow:hidden +
// centered margin — same fix applied in run.tsx's copy of this function.
// BUG FOUND (git diff against the last known-working commit, explicit
// ask): the previous round's "measure the gap and nudge" fix had
// `lastNudge = lastNudge + gap` inside fit()'s own requestAnimationFrame
// callback — fit() runs at LEAST 5 times in the first 1.5s (immediately,
// then at 300/900/1500ms, plus on resize), and each call ADDED its
// measured gap on top of the PREVIOUS nudge instead of recalculating
// fresh. Any small residual gap on more than one of those passes made the
// card visibly jump downward in discrete steps — exactly "glitches a lot"
// right when this screen appears (every finished workout). Reverted the
// transform back to the original simple scale(S)-only (byte-identical to
// the last known-good commit, zero drift risk) — the gap is handled
// completely differently now, see fillBottomGap below.
// Explicit ask: "console.log forwarded from inside the WebView page."
// Page-internal console.log/warn/error normally only reach Safari Web
// Inspector (not Metro) — intercepting them and re-sending through
// postMessage is the only way they show up in the same terminal as the
// native-side [recap-debug] logs. Installed FIRST (prepended ahead of
// every other injected script), so it catches every console call that
// follows it in the same injected JS, including this file's own.
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

export function dcScaleFitJs(bg: string, bottomFillColor?: string): string {
  return CONSOLE_FORWARD_JS + `
  (function(){
    var W=390, H=844;
    // Every piece below is IDEMPOTENT and re-run on every DOM mutation (see
    // the MutationObserver at the bottom). This script is injected BEFORE the
    // page's own bundle unpacks, and the bundle then swaps the whole
    // <html> element (document.documentElement.replaceWith) — which silently
    // throws away anything appended to the old <head>/<body>, including the
    // style element and the bottom filler. So nothing here can be a
    // "run once and forget".
    var CSS='html{background:${bg}!important;overflow:hidden!important;}body{margin:0!important;padding:0!important;background:${bg}!important;overflow:hidden!important;}#dc-root{position:relative!important;margin:0 auto!important;width:'+W+'px!important;transform-origin:top center!important;}#dc-root *{animation:none!important;-webkit-animation:none!important;transition:none!important;-webkit-transition:none!important;}*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;}';
    // animation:none + transition:none — "card appears at the top with wrong
    // info, then slides down" was the artboard's own entrance animation
    // playing against stale default data; a CSS *transition* is a different
    // mechanism from @keyframes and animation:none alone doesn't touch it
    // (device logs showed the card's opacity climbing 0 -> ~0.97 over ~300ms).
    function ensureStyle(){
      if(document.getElementById('__fpDcStyle')) return;
      var host=document.head||document.documentElement; if(!host) return;
      var st=document.createElement('style'); st.id='__fpDcStyle'; st.textContent=CSS;
      host.appendChild(st);
    }
    var lastS=-1;
    function fit(){
      var root=document.getElementById('dc-root'); if(!root) return;
      var vh=window.innerHeight;
      // BUG FOUND (device log, confirmed): the very FIRST fit() call can run
      // before the WebView has laid out, so window.innerHeight reads 0 —
      // a "||H" fallback applied a WRONG scale that was visibly revealed,
      // then SNAPPED to the real one on a retry. Skipping until a real
      // height exists means the first transform ever applied is correct.
      if(!vh) return;
      var S=vh/H;
      if(Math.abs(S-lastS)>=0.002 || !root.style.transform){ lastS=S; root.style.setProperty('transform','scale('+S+')','important'); }
      document.body.style.setProperty('height', vh+'px','important');
      document.documentElement.style.setProperty('height', vh+'px','important');
      // Reveal gate: the screen only posts 'ready' once the correct scale is
      // on, so it never needs a fixed "wait for fit to settle" delay.
      window.__fpFitted=true;
    }

    ${bottomFillColor ? `
    // The REAL gap the design has is INSIDE #dc-root: the white card's own
    // layout stops short of the canvas bottom, leaving a strip (scaled along
    // with everything else) — that strip reads as "the gap under the card."
    // Measures the CARD's own bottom edge (border-radius 36px) against the
    // real viewport bottom. A plain filler rectangle OUTSIDE #dc-root, pinned
    // to the true bottom edge, resized to whatever gap is measured —
    // idempotent (always SETS the height fresh), never touches the card's
    // own transform/position. +2px overlap closes the sub-pixel hairline
    // the scale transform can leave.
    function fillBottomGap(){
      var vh=window.innerHeight; if(!vh) return;
      var card=document.querySelector('#dc-root div[style*="border-radius: 36px"]');
      var ref=card||document.getElementById('dc-root');
      if(!ref) return;
      var rect=ref.getBoundingClientRect();
      var gap=vh-rect.bottom;
      var filler=document.getElementById('__formpalBottomFiller');
      if(!filler){
        filler=document.createElement('div');
        filler.id='__formpalBottomFiller';
        filler.style.cssText='position:fixed;left:0;right:0;bottom:0;background:${bottomFillColor};z-index:5;pointer-events:none;';
        document.body.appendChild(filler);
      }
      filler.style.height = (gap>0 ? Math.ceil(gap)+2 : 0) + 'px';
    }
    window.__fpFillBottomGap = fillBottomGap;
    ` : 'function fillBottomGap(){}'}

    // The fake status bar ("9:41" + signal/battery icons) baked into every
    // one of these exports duplicates/overlaps the REAL device status bar.
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

    function pass(){ ensureStyle(); fit(); fillBottomGap(); hideStatusBar(); }
    window.__fpPass=pass;
    pass();
    window.addEventListener('resize', function(){ pass(); setTimeout(pass, 50); });
    [0,100,300,900,1500].forEach(function(d){ setTimeout(pass,d); });
    // Re-run on every DOM change so the very first frame the page renders is
    // already styled/scaled — no fixed polling schedule to wait out. Observes
    // the DOCUMENT (not body): the bundle's html swap detaches the old body,
    // so an observer on it would never fire again.
    try { new MutationObserver(pass).observe(document, { childList:true, subtree:true }); } catch(e){}
  })();
  `;
}


// ─── workoutrecap.html — the main recap screen ─────────────────────────────
// Restored EXACTLY as it was before the native rebuild (git history,
// commit 31d13a0) — explicit instruction: "revert... back to my original
// design files exactly as they were... do not keep any part of the
// rebuild." Prop-driven (reps/sets/form/duration/overview/title), defaults
// matched from its real dc-script. "Sets" is relabeled "Moves" — this app
// tracks distinct exercises completed, not literal weightlifting sets, and
// the artboard's 4-cell stat grid has no spare slot for a 5th metric.
export function recapDataJs(opts: {
  totalReps: number; moves: number; pct: number; hasFormData: boolean;
  durationSec?: number; overview: string; hasVideo: boolean;
}): string {
  const { totalReps, moves, pct, hasFormData, durationSec, overview, hasVideo } = opts;
  const formValue = hasFormData && totalReps > 0 ? `${pct}%` : 'N/A';
  const formLabel = hasFormData ? 'Form' : 'Form n/a';
  const durationValue = durationSec != null ? formatDuration(durationSec) : 'N/A';
  const MAP: Record<string, string> = {
    '148': String(totalReps),
    '12': String(moves),
    '86%': formValue,
    '38:12': durationValue,
    'Sets': 'Moves',
    'Form': formLabel,
    'Push-up depth improved every set and squats stayed steady. Next time, slow the way down on pull-ups.': overview,
  };
  return `
(function(){
  function post(m){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }catch(e){} }
  var MAP = ${JSON.stringify(MAP)};
  var HAS_VIDEO = ${JSON.stringify(hasVideo)};
  console.log('[recap-page] injected JS running, HAS_VIDEO=', HAS_VIDEO);
  var bgTransparent = false;
  var sizeWired = false;
  var titleSizeWired = false;
  var cardWidened = false;
  var backWired=false, feedbackWired=false, shareWired=false, allSetsWired=false;
  var readyPosted=false;
  // Which MAP keys have been seen+replaced so far. 'ready' is judged from
  // this CUMULATIVE state, never from how many things one apply() call
  // happened to do: the old per-call hit counter meant that if the first
  // apply() that found the real DOM was deferred, every later call did 0 new
  // work and 'ready' was never posted at all — the screen then only appeared
  // when the 2.5s RN backstop fired ("card comes in 3 seconds late").
  var foundKeys={};
  // "Dragging the card down is laggy" — traced to the artboard's OWN
  // grabStart/grabEnd logic on the grab-handle pill: it only reacts on
  // RELEASE (measures total pointerdown->pointerup distance, then snaps
  // the card to one of two fixed positions over a 480ms CSS transition),
  // it never follows the finger while held. That release-only snap is
  // what read as laggy/unresponsive. This adds a SECOND pair of listeners
  // on the same handle (the artboard's own grabStart/grabEnd still run
  // too, unchanged) that live-tracks the card's "top" during the hold so
  // it follows the finger in real time; on release the artboard's own
  // logic takes over exactly as before (same 30px threshold, same snap
  // animation) — it just now animates from wherever the finger actually
  // let go instead of jumping from the original fixed position.
  var dragWired = false;
  function wireLiveDrag(){
    if(dragWired) return;
    var handle = document.querySelector('#dc-root div[style*="cursor: grab"]');
    var card = document.querySelector('#dc-root div[style*="border-radius: 36px"]');
    if(!handle || !card) return;
    dragWired = true;
    var TOP_UP=484, TOP_DOWN=814;
    var dragging=false, startY=0, startTop=TOP_UP;
    handle.addEventListener('pointerdown', function(e){
      dragging = true;
      startY = e.clientY;
      var t = parseFloat(card.style.top);
      startTop = isNaN(t) ? TOP_UP : t;
      card.style.setProperty('transition', 'none', 'important');
    }, true);
    handle.addEventListener('pointermove', function(e){
      if(!dragging) return;
      var next = startTop + (e.clientY - startY);
      if(next < TOP_UP) next = TOP_UP;
      if(next > TOP_DOWN) next = TOP_DOWN;
      card.style.setProperty('top', next + 'px', 'important');
    }, true);
    function endDrag(){
      dragging = false;
      // Restore the artboard's OWN authored transition value (not just
      // remove mine) — can't guarantee whether this listener or the
      // artboard's own sc-camel-on-pointer-up handler (attached first, at
      // mount) runs first on the same pointerup event, so setting the
      // exact value the HTML itself authors is safe either order:
      // either it runs before the artboard's re-render (restores it in
      // time for the snap) or after (same value, no-op).
      card.style.setProperty('transition', 'top 480ms cubic-bezier(.22,.9,.24,1)', 'important');
    }
    handle.addEventListener('pointerup', endDrag, true);
    handle.addEventListener('pointercancel', endDrag, true);
  }
  function apply(){
    var hit=0;
    // Video now plays NATIVELY (expo-video — see this file's header
    // comment for why) in a real AVPlayer positioned behind this WebView.
    // This page never creates a <video> element or touches video bytes at
    // all any more — just hides the artboard's own placeholder slot and
    // neutralizes the two backgrounds that would otherwise opaquely cover
    // the native player sitting behind it (the slot's own wrapper, and
    // the artboard's root content div — both have their own explicit
    // inline background color baked into the design file, which an
    // html/body-level transparent background alone doesn't override).
    if(!bgTransparent && HAS_VIDEO){
      var slot = document.getElementById('recap-replay');
      if(slot){
        slot.style.display = 'none';
        var wrap = slot.parentElement;
        if(wrap) wrap.style.setProperty('background','transparent','important');
        var rootDiv = document.querySelector('[data-screen-label="Workout recap"]');
        if(rootDiv) rootDiv.style.setProperty('background','transparent','important');
        bgTransparent = true;
        hit++;
      }
    }
    var all=document.querySelectorAll('#dc-root div,#dc-root span');
    for(var i=0;i<all.length;i++){
      var el=all[i]; if(el.children.length) continue;
      var t=(el.textContent||'').trim();
      if(Object.prototype.hasOwnProperty.call(MAP,t)){
        foundKeys[t]=true;
        if(t!==MAP[t]){ el.textContent=MAP[t]; hit++; }
      }
    }
    // Explicit ask: "make the 'Workout complete' text and the check icon
    // bigger." The title div's own authored style (22px/800 weight) is a
    // unique signature; the check-icon circle is its very next sibling.
    if(!titleSizeWired){
      var titleEl = document.querySelector('#dc-root div[style*="font-size: 22px; line-height: 1.12; font-weight: 800"]');
      if(titleEl){
        titleEl.style.setProperty('font-size','27px','important');
        var checkIcon = titleEl.nextElementSibling;
        if(checkIcon){
          checkIcon.style.setProperty('width','29px','important');
          checkIcon.style.setProperty('height','29px','important');
          var checkSvg = checkIcon.querySelector('svg');
          if(checkSvg){ checkSvg.setAttribute('width','16'); checkSvg.setAttribute('height','16'); }
        }
        titleSizeWired = true; hit++;
      }
    }
    // Explicit ask: "the Overview label and the overview text are too
    // small, make them bigger." Both are static artboard structure (never
    // text-matched/replaced above), so found by their own authored style
    // strings rather than content. Asked twice before with a smaller bump
    // (13->15, 15.5->17) that apparently wasn't "much bigger" — pushing
    // further this round, and now also sizing the label's own icon (the
    // little grid svg next to "Overview"), which was never touched.
    if(!sizeWired){
      var ovLabel = document.querySelector('#dc-root div[style*="font-size: 13px; font-weight: 700"]');
      if(ovLabel){
        ovLabel.style.setProperty('font-size','19px','important');
        var ovIcon = ovLabel.querySelector('svg');
        if(ovIcon){ ovIcon.setAttribute('width','17'); ovIcon.setAttribute('height','17'); }
      }
      // Explicit ask (new this round): "lines stop after a couple words
      // and wrap too early — have each line go across the whole card."
      // 19px on this body paragraph was too aggressive for the card's
      // width — dialing back to 17px (still clearly bigger than the
      // original 15.5px) so more words fit per line. The short
      // "Overview" label above isn't affected by this — it's one word,
      // wrapping was never a concern there.
      var ovBody = document.querySelector('#dc-root div[style*="font-size: 15.5px; line-height: 1.48"]');
      if(ovBody) ovBody.style.setProperty('font-size','17px','important');
      if(ovLabel || ovBody){
        sizeWired=true; hit++;
        console.log('[recap-page] sizeWired applied, ovLabel=', !!ovLabel, 'ovBody=', !!ovBody);
      }
    }
    // Explicit ask: "edges stick out, gaps at left/right... full width,
    // edge to edge... same for the bottom." Read straight from the
    // artboard: the card div is authored with an 8px left/right margin
    // and border-radius: 36px on all four corners. Two fixes: (1)
    // left/right to 0 removes the side margins. (2) rounding only the
    // TOP corners (36px 36px 0 0) removes the bottom-corner rounding,
    // which is what was actually causing the
    // "bottom still looks different" seam: fillBottomGap's filler strip
    // below the card is a plain square-cornered rectangle, so the card's
    // OWN rounded bottom corners were leaving two small gaps at the
    // bottom-left/right where the dark/video background showed through.
    if(!cardWidened){
      var wCard = document.querySelector('#dc-root div[style*="border-radius: 36px"]');
      if(wCard){
        wCard.style.setProperty('left','0px','important');
        wCard.style.setProperty('right','0px','important');
        wCard.style.setProperty('border-radius','36px 36px 0 0','important');
        // BUG FOUND ("bottom fill still doesn't match the card's color"):
        // the card has decorative blurred gradient blobs as absolutely-
        // positioned children (one pinned with a negative bottom offset,
        // clipped by the card's own overflow:hidden) that tint the card's real bottom
        // few pixels slightly off pure white — a flat #ffffff filler can
        // never match a gradient exactly. The card is authored
        // top:484px + height:352px, leaving an 8px canvas gap before the
        // true 844px bottom even by original design (same family as the
        // 8px side margins already removed above). Closing that gap by
        // extending the card's OWN height means its bottom edge — blobs
        // included — reaches the true bottom directly: nothing for a
        // separate fill color to match in the resting (non-dragged)
        // position. fillBottomGap right below still runs as a backstop
        // for the dragged-down case, where a gap reopens below the
        // (still 360px-tall) card.
        wCard.style.setProperty('height','360px','important');
        // BUG FOUND ("card still spawns in the middle, then slides down to
        // the bottom after a tenth of a second" — reported again after the
        // original fix below): this used to restore the card's top
        // transition unconditionally right after locking in the first
        // frame, reasoning that only the drag-snap (wireLiveDrag) would
        // ever touch the top property again. Wrong — the artboard's own reactive
        // framework can re-render this element's top value AGAIN later
        // (switching from its default/demo render pass to the real
        // summary-view render pass, even landing on the same 484px), and
        // by then transition was already restored, so THAT later change is
        // what was visibly animating — not the first paint at all.
        // Fix: leave transition permanently 'none' here. wireLiveDrag
        // below already enables it on its own pointerdown and disables it
        // again on pointerup, entirely independently of this block, so
        // real drag-to-dismiss still animates correctly either way.
        wCard.style.setProperty('transition','none','important');
        cardWidened=true; hit++;
      }
    }
    // Back chevron (top-left circle, no handler on this fresh export).
    if(!backWired){
      var circles=document.querySelectorAll('#dc-root div');
      for(var c=0;c<circles.length;c++){
        var cel=circles[c];
        if(cel.querySelector && cel.querySelector('svg path[d="M10 3 5 8l5 5"]') && cel.offsetWidth<=34){
          cel.addEventListener('click', function(ev){ ev.stopPropagation(); post({type:'back'}); }, true);
          backWired=true; hit++; break;
        }
      }
    }
    // "View rep feedback" -> only a real feature with a real video+reps to
    // show (solo/history mode) — matches the file's own "only show what's
    // real" policy. Without a video, hide it rather than let it open a
    // review screen with nothing real in it.
    if(!feedbackWired){
      var link=document.querySelector('#dc-root a[href="Workout Recap v2.dc.html"]');
      if(link){
        if(!HAS_VIDEO){ link.style.display='none'; }
        else { link.addEventListener('click', function(ev){ ev.preventDefault(); post({type:'viewRepFeedback'}); }, true); }
        feedbackWired=true; hit++;
      }
    }
    // Share icon (the up-arrow-into-tray circle next to "View rep feedback").
    if(!shareWired){
      var shareBtn=document.querySelector('#dc-root div svg path[d^="M8 10V2.5"]');
      if(shareBtn){
        var btn=shareBtn.closest('div');
        if(btn){ btn.addEventListener('click', function(ev){ ev.stopPropagation(); post({type:'shareVideo'}); }, true); }
        shareWired=true; hit++;
      }
    }
    // "All sets" chip (top-right, grid icon + "All sets" text).
    if(!allSetsWired){
      var asLink=document.querySelector('#dc-root a[href="Form Review.dc.html"]');
      if(asLink){ asLink.addEventListener('click', function(ev){ ev.preventDefault(); post({type:'viewAllSets'}); }, true); allSetsWired=true; hit++; }
    }
    wireLiveDrag();
    // Recompute the bottom-fill strip every time real content actually
    // lands (this fires on the MutationObserver's re-apply calls too, not
    // just the fixed early timeouts inside dcScaleFitJs) — keeps it
    // correct even if something shifts the card's layout after the first
    // few hundred ms.
    if(window.__fpFillBottomGap) window.__fpFillBottomGap();
    // Ready = the real content is in the DOM AND the canvas is at its final
    // scale (window.__fpFitted, set by dcScaleFitJs once innerHeight is real).
    // The old fixed "hold 'ready' until PAGE_START+350ms" delay is gone: the
    // scale bug it guarded against is already prevented by fit() refusing to
    // apply a transform before a real height exists.
    var ok = cardWidened && sizeWired && titleSizeWired
          && Object.keys(foundKeys).length >= 5 && !!window.__fpFitted;
    if(ok && !readyPosted){ readyPosted=true; post({type:'ready'}); }
    return ok;
  }
  apply();
  [100,250,500,1000,2000,3500,5000].forEach(function(d){ setTimeout(apply,d); });
  // Observe the DOCUMENT, not #dc-root/body: this script runs before the
  // bundle unpacks and the bundle swaps the whole <html> element, which
  // detaches whatever an earlier observer was attached to. Reacting to the
  // first real mutation (instead of a poll schedule) is what makes the card
  // appear the moment the page has rendered.
  var mo = new MutationObserver(function(){ apply(); });
  mo.observe(document, { childList: true, subtree: true, characterData: true });
})();
true;
`;
}


// Page scaffold shared by every use of the Workout Complete artboard: styles,
// scale-to-fit, status-bar hiding, bottom filler. Nothing in it depends on the
// session's data, which is what lets a WebView load it BEFORE the screen opens
// (see components/WarmSurfaces.tsx). bg is transparent; the native WebView
// supplies the dark colour when there is no video behind it.
export function recapBaseJs(): string {
  return dcScaleFitJs('transparent', '#ffffff');
}

// Scaffold + data in one string: the cold path (a fresh WebView), used by
// scripts/test-recap-latency.js to compare against the old behaviour.
export function workoutrecapInject(opts: Parameters<typeof recapDataJs>[0]): string {
  return dcScaleFitJs(opts.hasVideo ? 'transparent' : '#111114', '#ffffff') + recapDataJs(opts);
}
