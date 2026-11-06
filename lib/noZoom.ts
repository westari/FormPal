/**
 * lib/noZoom.ts
 *
 * No pinch zoom and no double-tap zoom in any of the app's web views. Injected before the page loads,
 * and it keeps itself in place: the design bundles swap the whole <html> element a moment after load, which
 * throws away any viewport meta set earlier.
 *
 * Three layers, because each one alone is not enough on iOS:
 *  1. the viewport meta gets maximum-scale=1 and user-scalable=no (other keys the page already has are kept),
 *  2. touch-action: pan-x pan-y on html/body, which turns off pinch AND double-tap zoom for the whole page
 *     while normal scrolling and the page's own pointer handling keep working,
 *  3. the WebKit gesture events and any two-finger touchmove are cancelled.
 */
export const NO_ZOOM_JS = `(function(){
  if (window.__noZoomInstalled) return;
  window.__noZoomInstalled = true;
  function fixMeta() {
    var host = document.head || document.documentElement;
    if (!host) return;
    var m = document.querySelector('meta[name=viewport]');
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'viewport'); m.setAttribute('content', 'width=device-width, initial-scale=1'); host.appendChild(m); }
    var c = m.getAttribute('content') || '';
    if (/maximum-scale=1(\.0)?(,|$|\s)/.test(c) && /user-scalable=no/.test(c)) return;
    var parts = c.split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x && !/^(maximum-scale|minimum-scale|user-scalable)\s*=/.test(x); });
    parts.push('maximum-scale=1', 'user-scalable=no');
    m.setAttribute('content', parts.join(', '));
  }
  function fixCss() {
    if (document.getElementById('__nozoom_css')) return;
    var host = document.head || document.documentElement;
    if (!host) return;
    var s = document.createElement('style');
    s.id = '__nozoom_css';
    s.textContent = 'html,body{touch-action:pan-x pan-y!important;-webkit-text-size-adjust:100%!important;}';
    host.appendChild(s);
  }
  function apply() { try { fixMeta(); fixCss(); } catch (e) {} }
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) {
    document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false, capture: true });
  });
  document.addEventListener('touchmove', function (e) { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false, capture: true });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); }, true);
  try { new MutationObserver(apply).observe(document, { childList: true, subtree: true }); } catch (e) {}
  setInterval(apply, 400);
  apply();
})(); true;`;
