/**
 * lib/editSheetBridge.ts
 *
 * Page side of "the Edit sheet saves to the plan" (Train and Home both use the design's own Edit Workout sheet).
 * Installed before the page loads. The design's logic subclass calls `window.__editBridge(this)` from renderVals; when
 * the sheet goes from open to closed and its rows differ from what it opened with, the page posts
 * { type: 'saveEdit', wid, rows } (wid = which plan workout the sheet was opened for, set in window.__editWid).
 */
export const EDIT_BRIDGE_JS = `(function(){
  if (window.__editBridgeInstalled) return;
  window.__editBridgeInstalled = true;
  var wasOpen = false, initial = null;
  window.__editBridge = function (self) {
    try {
      var st = self.state || {};
      var open = !!st.editOpen, list = st.editList || [];
      if (open && !wasOpen) initial = JSON.stringify(list);
      if (!open && wasOpen && initial !== null) {
        if (JSON.stringify(list) !== initial && window.__editWid) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'saveEdit', wid: window.__editWid, rows: list }));
        }
        initial = null;
      }
      wasOpen = open;
    } catch (e) {}
  };
})(); true;`;
