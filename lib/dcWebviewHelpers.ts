/**
 * lib/dcWebviewHelpers.ts
 *
 * Shared injection helpers for wiring Claude-Design HTML artboards
 * (assets/app screens/*.html) into a WebView with real app data — the same
 * technique already proven throughout app/recap.tsx and app/rep-feedback.tsx
 * (independently, each with its own inline copy of this logic). This module
 * exists so the many NEW screens built in this pass don't each duplicate it a
 * third+ time over. recap.tsx/rep-feedback.tsx are deliberately left as-is
 * (smallest-change rule — their inline copies are working and already
 * extensively tested this project), this is only for new screens.
 *
 * Design files themselves are NEVER edited — see CLAUDE.md. Everything here
 * is injected JS that manipulates the rendered DOM after load.
 */

// Forwards the WebView page's own console.log/warn/error to Metro via
// postMessage — otherwise page-internal logs only reach Safari Web
// Inspector. Must be injected FIRST so it catches every later console call.
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

// injectedJavaScriptBeforeContentLoaded — forces a real mobile viewport
// before the artboard's own script runs.
export const DC_VIEWPORT_JS = `(function(){try{
  var m=document.querySelector('meta[name=viewport]');
  if(!m){ m=document.createElement('meta'); m.name='viewport'; (document.head||document.documentElement).appendChild(m); }
  m.setAttribute('content','width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
}catch(e){}})(); true;`;

// Scales the artboard's fixed 390x844 canvas (#dc-root) to fill the real
// device viewport height exactly, kills the artboard's own entrance
// animations (which otherwise play against stale placeholder data before
// real data is injected), disables backdrop-filter (unsupported/expensive
// in WKWebView), and disables text-selection/callout (dragging anywhere
// would otherwise trigger native text-selection highlighting instead of
// reaching custom touch handlers — found the hard way in rep-feedback.tsx).
export function dcScaleFitJs(bg: string): string {
  return CONSOLE_FORWARD_JS + `
  (function(){
    var W=390, H=844;
    var st=document.createElement('style');
    st.textContent='html{background:${bg}!important;overflow:hidden!important;}body{margin:0!important;padding:0!important;background:${bg}!important;overflow:hidden!important;}#dc-root{position:relative!important;margin:0 auto!important;width:'+W+'px!important;transform-origin:top center!important;}#dc-root *{animation:none!important;-webkit-animation:none!important;}*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;}';
    (document.head||document.documentElement).appendChild(st);
    var lastS=-1;
    function fit(){
      var root=document.getElementById('dc-root'); if(!root) return;
      var vh=window.innerHeight||H;
      var S=vh/H;
      if(Math.abs(S-lastS)>=0.002){ lastS=S; root.style.setProperty('transform','scale('+S+')','important'); }
      document.body.style.setProperty('height', vh+'px','important');
      document.documentElement.style.setProperty('height', vh+'px','important');
    }
    fit();
    window.addEventListener('resize', fit);
    [0,300,900,1500].forEach(function(d){ setTimeout(fit,d); });
  })();
  `;
}

// The established text-injection technique: walk every leaf node under
// #dc-root, replace exact-match default/placeholder text with real values.
// `map` is {exact default string in the raw export: real value}. Posts
// 'ready' via postMessage once done so the native side knows it's safe to
// reveal the WebView (never show the artboard's own placeholder content).
export const DC_TEXT_REPLACE_HELPER_JS = `
function dcReplaceText(map){
  var all = document.querySelectorAll('#dc-root *');
  for (var i=0;i<all.length;i++){
    var el = all[i];
    for (var j=0;j<el.childNodes.length;j++){
      var node = el.childNodes[j];
      if (node.nodeType === 3) {
        var t = node.nodeValue;
        var trimmed = t.trim();
        if (Object.prototype.hasOwnProperty.call(map, trimmed)) {
          node.nodeValue = t.replace(trimmed, map[trimmed]);
        }
      }
    }
  }
}
function dcPost(m){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }catch(e){} }
`;

// These artboards link to each other with raw internal hrefs like
// "Train.dc.html" (their own prototyping tool's page-to-page links) —
// meaningless inside the real app. This intercepts every <a> tap and posts
// {type:'navigate', href} instead of letting the WebView try to load it.
export const DC_LINK_INTERCEPT_JS = `
(function(){
  document.addEventListener('click', function(ev){
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    ev.preventDefault();
    ev.stopPropagation();
    dcPost({ type: 'navigate', href: a.getAttribute('href') });
  }, true);
})();
`;
