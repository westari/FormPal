/**
 * lib/addExercisePicker.ts
 *
 * The Edit Workout sheet's "Add exercise" (Train AND Home use the design's own sheet): it asks WHICH exercise, in a picker
 * with search over the real catalogue, and adds only what is tapped. Page-side JS, installed in both WebViews.
 *
 *   window.__trRank(lib, query, limit)   the shared word-start search (lib/exerciseSearch.ts); nothing typed -> first `limit`
 *   window.__trOpenPicker()              opens the picker over the sheet; needs window.__trSelf = the design's logic (set in
 *                                        its renderVals) and window.__athltData.lib / .libSets / (.insets.tabCover | .tabCover)
 */
import { EXERCISE_SEARCH_PAGE_JS } from './exerciseSearch';

export const ADD_PICKER_JS = `
(function () {
  if (window.__addPickerInstalled) return;
  window.__addPickerInstalled = true;
  function D() { return window.__athltData || null; }
  // the design is a fixed 390x844 canvas (no id), scaled to the screen
  function canvas() {
    var all = document.querySelectorAll('div');
    for (var i = 0; i < all.length; i++) if (all[i].style.width === '390px' && all[i].style.height === '844px') return all[i];
    return null;
  }
  // ── one search rule for Practice Exercises AND the Add exercise picker: the shared word-start rule (lib/exerciseSearch.ts) ──
  ${EXERCISE_SEARCH_PAGE_JS}
  window.__trRank = function (lib, query, limit) {
    if (!String(query || '').trim()) return lib.slice(0, limit);
    var byName = {};
    lib.forEach(function (x) { if (!byName[x[0]]) byName[x[0]] = x; });
    return dsSearch(lib.map(function (x) { return x[0]; }), query).slice(0, limit).map(function (n) { return byName[n]; });
  };

  // ── Add exercise picker: opens from the Edit sheet, search over the real catalogue, adds only what is tapped ──
  var pickEl = null;
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function renderPick() {
    if (!pickEl) return;
    var d = D(), self = window.__trSelf;
    if (!d || !self) return;
    var have = {};
    ((self.state && self.state.editList) || []).forEach(function (r) { have[r[0]] = true; });
    var q = pickEl.querySelector('input').value;
    var rows = window.__trRank(d.lib.filter(function (x) { return !have[x[0]]; }), q, 12);
    var list = pickEl.querySelector('[data-list]');
    if (!rows.length) { list.innerHTML = '<div style="padding:26px 0;text-align:center;font-size:14px;font-weight:500;color:#5f5f69;">No exercises match that.</div>'; return; }
    list.innerHTML = rows.map(function (x, i) {
      return '<div data-pick="' + esc(x[0]) + '" style="display:flex;align-items:center;gap:10px;padding:12px 4px;cursor:pointer;border-top:' + (i ? '1px solid rgba(17,17,20,0.07)' : 'none') + ';">'
        + '<div style="flex:1;min-width:0;"><div style="font-size:15px;font-weight:600;letter-spacing:-0.2px;color:#111114;">' + esc(x[0]) + '</div>'
        + '<div style="font-size:12.5px;font-weight:500;color:#5f5f69;padding-top:1px;">' + esc(x[1]) + '</div></div>'
        + '<div style="width:38px;height:28px;flex:none;border-radius:999px;display:flex;align-items:center;justify-content:center;background:#111114;">'
        + '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="#ffffff" stroke-width="2.1" stroke-linecap="round"></path></svg></div></div>';
    }).join('');
  }
  function closePick() {
    if (!pickEl) return;
    pickEl.firstChild.style.opacity = '0';
    pickEl.children[1].style.transform = 'translateY(110%)';
    var el = pickEl;
    setTimeout(function () { if (el.__open !== true) el.style.display = 'none'; }, 460);
    el.__open = false;
    var i = el.querySelector('input'); if (i) i.blur();
  }
  window.__trOpenPicker = function () {
    var root = canvas(), d = D();
    if (!root || !d) return;
    var S = window.__dcCanvasScale || 1, cover = d.insets && d.insets.tabCover != null ? d.insets.tabCover : d.tabCover != null ? d.tabCover : 83, extra = cover / S;
    if (!pickEl || !pickEl.isConnected) {
      pickEl = document.createElement('div');
      pickEl.id = '__trpick';
      pickEl.style.cssText = 'position:absolute;inset:0;z-index:70;display:none;';
      pickEl.innerHTML = '<div data-back style="position:absolute;inset:0;background:rgba(17,17,20,0.28);opacity:0;transition:opacity 320ms ease;"></div>'
        + '<div data-sheet style="position:absolute;left:8px;right:8px;height:560px;border-radius:40px;overflow:hidden;background:#ffffff;box-shadow:0 -10px 40px -14px rgba(40,50,90,0.35),0 2px 8px -2px rgba(40,50,90,0.1);display:flex;flex-direction:column;transform:translateY(110%);transition:transform 440ms cubic-bezier(.22,1,.36,1);">'
        + '<div data-handle style="padding:10px 0 4px;display:flex;justify-content:center;cursor:pointer;"><div style="width:38px;height:5px;border-radius:999px;background:#dcdce1;"></div></div>'
        + '<div style="display:flex;align-items:center;gap:10px;padding:8px 20px 0;"><div style="flex:1;font-size:20px;font-weight:700;letter-spacing:-0.5px;color:#111114;">Add exercise</div>'
        + '<div data-close aria-label="Close" style="width:34px;height:34px;flex:none;border-radius:50%;background:#f1f1f4;display:flex;align-items:center;justify-content:center;cursor:pointer;"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5" stroke="#111114" stroke-width="1.9" stroke-linecap="round"></path></svg></div></div>'
        + '<div style="padding:12px 16px 0;"><div style="height:48px;border-radius:999px;padding:0 18px;display:flex;align-items:center;gap:10px;background:#f6f6f8;">'
        + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8e8e96" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4.2 4.2"></path></svg>'
        + '<input placeholder="Search exercises" autocomplete="off" autocorrect="off" style="flex:1;min-width:0;border:none;outline:none;background:transparent;font-family:inherit;font-size:16px;font-weight:500;color:#111114;"></div></div>'
        + '<div data-list style="flex:1;min-height:0;overflow-y:auto;padding:6px 20px 24px;"></div></div>';
      root.appendChild(pickEl);
      pickEl.querySelector('input').addEventListener('input', renderPick);
      pickEl.querySelector('[data-back]').addEventListener('click', closePick);
      pickEl.querySelector('[data-close]').addEventListener('click', closePick);
      pickEl.querySelector('[data-handle]').addEventListener('click', closePick);
      pickEl.querySelector('[data-list]').addEventListener('click', function (ev) {
        var row = ev.target.closest ? ev.target.closest('[data-pick]') : null;
        if (!row || !window.__trSelf) return;
        var name = row.getAttribute('data-pick'), sr = ((D() || {}).libSets || {})[name] || '3 × 10';
        window.__trSelf.setState(function (st) { var l = (st.editList || []).map(function (r) { return r.slice(); }); l.push([name, sr]); return { editList: l }; });
        closePick();
      });
    }
    pickEl.querySelector('[data-sheet]').style.bottom = (8 + extra) + 'px';
    pickEl.querySelector('input').value = '';
    renderPick();
    pickEl.__open = true;
    pickEl.style.display = 'block';
    void pickEl.offsetHeight;
    pickEl.firstChild.style.opacity = '1';
    pickEl.children[1].style.transform = 'translateY(0)';
  };

})();
`;
