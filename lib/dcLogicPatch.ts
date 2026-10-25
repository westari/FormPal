/**
 * lib/dcLogicPatch.ts
 *
 * Wires REAL data into a Claude-Design artboard by swapping the design's own
 * logic class for a subclass at runtime — never editing the design file.
 *
 * Why this instead of DOM text-replacement: every artboard is a React
 * component (the `sc-` runtime in the export's bundler). Text pushed into the
 * DOM by hand gets clobbered the next time React re-renders or a view
 * remounts (e.g. opening and closing a sheet), and anything driven by the
 * design's internal state (the weigh-in sheet opening/closing, range pills,
 * chart redraw) can't be reproduced reliably from outside. Subclassing the
 * logic lets the design's own state machine + chart math keep running, fed
 * with real values.
 *
 * Verified against the real runtime: window.__dcRegistry is the registry's
 * entries map; the root entry's `.Logic` is the design's `Component` class;
 * replacing it and calling the entry's `subs` makes the host component
 * reconcile to the new class on its next render, carrying `state` over
 * (see .scratch/d856.js __reconcileLogic).
 *
 * Usage (page side): inject dcLogicPatchJs(extSrc) in
 * injectedJavaScriptBeforeContentLoaded. `extSrc` is a JS *expression* that
 * evaluates to `function (Orig) { return class extends Orig {...}; }`. Inside
 * the subclass read real data from `window.__athltData` (null until native
 * pushes it with athltSetDataJs). The page posts {type:'logicReady'} once the
 * class is swapped AND data has been applied.
 */

export function dcLogicPatchJs(extSrc: string): string {
  return `
(function(){
  if (window.__athltPatchInstalled) return;
  window.__athltPatchInstalled = true;
  window.__athltData = null;
  var EXT = (${extSrc});
  function entry(){
    var r = window.__dcRegistry; if (!r) return null;
    for (var k in r) { if (r[k] && r[k].Logic) return r[k]; }
    return null;
  }
  function rerender(e){ e.subs.forEach(function(f){ try { f(); } catch (x) {} }); }
  function post(m){ try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (x) {} }
  var patched = false, announced = false;
  function announce(){
    if (announced || !patched || !window.__athltData) return;
    announced = true;
    // two frames: let React commit the real-data render before revealing
    requestAnimationFrame(function(){ requestAnimationFrame(function(){
      window.__athltLogicReady = true;
      post({ type: 'logicReady' });
    }); });
  }
  function tryPatch(){
    var e = entry(); if (!e) return false;
    if (!e.__athltPatched) {
      e.Logic = EXT(e.Logic);
      e.__athltPatched = true;
      e.ver++;
      rerender(e);
    }
    patched = true;
    announce();
    return true;
  }
  window.__athltSetData = function(d){
    window.__athltData = d;
    var e = entry();
    if (e && e.__athltPatched) rerender(e);
    announce();
  };
  window.__athltRerender = function(){ var e = entry(); if (e) rerender(e); };
  var iv = setInterval(function(){ if (tryPatch()) clearInterval(iv); }, 30);
})();
true;`;
}

/** Native -> page: hand the artboard its real data (safe to call before the page is ready; retries). */
export function athltSetDataJs(data: unknown): string {
  return `(function t(){ if (window.__athltSetData) { window.__athltSetData(${JSON.stringify(data)}); } else { setTimeout(t, 60); } })(); true;`;
}
