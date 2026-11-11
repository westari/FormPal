/**
 * lib/hapticClick.ts
 *
 * Page-side script for every WebView screen (the design files): ONE haptic per press, chosen from what was pressed. The page
 * only decides the KIND and posts {type:'haptic', kind}; the native side plays it (lib/screenHaptics.ts), so a press is never
 * doubled. Listens once per click on the document (capture phase), never for typing in an input.
 *
 *   selection  chips, steppers, tabs, bookmarks, calendar days, small icon-only toggles
 *   medium     main actions: Save workout / Save session / Finish review / Done / Continue / Start / Log / Finish
 *   light      any other button, card or row
 *
 * No backtick and no dollar-brace inside (it is embedded in other page strings).
 */
export const HAPTIC_CLICK_JS = String.raw`
(function () {
  if (window.__hapInstalled) return;
  window.__hapInstalled = true;
  var MAIN = /^(save workout|save session|finish review|done|continue|start|start workout|log|log session|finish|save)$/i;
  var TAB = /^(all|saved|summary|stats|ranks|sets|recent|popular)$/i;
  function clickable(el) {
    for (var i = 0; i < 7 && el && el !== document.body && el.nodeType === 1; i++, el = el.parentElement) {
      var tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return null;
      if (tag === 'A' || tag === 'BUTTON' || el.getAttribute('role') === 'button' || el.hasAttribute('data-ds-chip') || el.hasAttribute('data-ds-add')) return el;
      var cs = null; try { cs = getComputedStyle(el); } catch (e) {}
      if (cs && cs.cursor === 'pointer') return el;
    }
    return null;
  }
  function kindOf(el) {
    var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (el.hasAttribute('data-ds-chip')) return 'selection';
    if (el.getAttribute('aria-label') === 'Back') return 'light';
    if (MAIN.test(text)) return 'medium';
    if (TAB.test(text)) return 'selection';
    if (/^\d{1,2}$/.test(text)) return 'selection';
    var r = el.getBoundingClientRect();
    if (!text && r.width <= 46 && r.height <= 46) return 'selection';
    if (el.querySelector && el.querySelector('svg') && r.width <= 46 && r.height <= 46) return 'selection';
    return 'light';
  }
  document.addEventListener('click', function (ev) {
    try {
      var el = clickable(ev.target);
      if (!el) return;
      var kind = kindOf(el);
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'haptic', kind: kind }));
    } catch (e) {}
  }, true);
})();
true;`;
