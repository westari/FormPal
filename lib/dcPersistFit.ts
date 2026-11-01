/**
 * lib/dcPersistFit.ts
 *
 * Persistent scale-to-fit for a 390x844 Claude-Design artboard (#dc-root) in a WebView.
 * Unlike dcScaleFitJs (lib/dcWebviewHelpers.ts), which retries only at 0/300/900/1500ms,
 * this installs from injectedJavaScriptBeforeContentLoaded and NEVER stops watching, so it
 * survives the design bundle's late <html> swap (several seconds on a phone). Without that,
 * the page can show at the wrong size for a moment and then "jump" to full screen.
 *
 * Sets window.__dcFitted = true once a real scale has been applied (use it to gate the
 * WebView's reveal), and window.__dcCanvasScale like dcScaleFitJs does.
 */
export function dcPersistFitJs(bg: string): string {
  return `
(function(){
  if (window.__dcFitInstalled) return;
  window.__dcFitInstalled = true;
  var CSS = 'html{background:${bg}!important;overflow:hidden!important;}'
    + 'body{margin:0!important;padding:0!important;background:${bg}!important;overflow:hidden!important;}'
    + '#dc-root{position:relative!important;margin:0 auto!important;width:390px!important;transform-origin:top center!important;}'
    + '#dc-root *{animation:none!important;-webkit-animation:none!important;transition:none!important;-webkit-transition:none!important;}'
    + '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;}';
  function ensureCss(){
    if (document.getElementById('__dcfit_css')) return;
    var host = document.head || document.documentElement;
    if (!host) return;
    var s = document.createElement('style'); s.id = '__dcfit_css'; s.textContent = CSS; host.appendChild(s);
  }
  var lastS = -1;
  function fit(){
    ensureCss();
    var root = document.getElementById('dc-root');
    var vh = window.innerHeight;
    if (!root || !vh) return false;
    var S = vh / 844;
    if (Math.abs(S - lastS) >= 0.002 || !root.style.transform) {
      lastS = S;
      root.style.setProperty('transform', 'scale(' + S + ')', 'important');
    }
    window.__dcCanvasScale = S;
    document.body.style.setProperty('height', vh + 'px', 'important');
    document.documentElement.style.setProperty('height', vh + 'px', 'important');
    window.__dcFitted = true;
    return true;
  }
  var deb;
  function schedule(){ clearTimeout(deb); deb = setTimeout(fit, 30); }
  try { new MutationObserver(schedule).observe(document, { childList: true, subtree: true }); } catch (e) {}
  window.addEventListener('resize', schedule);
  setInterval(fit, 300);
  fit();
})();
true;`;
}
