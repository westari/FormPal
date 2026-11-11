/**
 * lib/editSheetBridge.ts
 *
 * Page side of "the Edit sheet saves to the plan" (Train and Home both use the design's own Edit Workout sheet).
 * Installed before the page loads. The design's logic subclass calls `window.__editBridge(this)` from renderVals; when
 * the sheet goes from open to closed and its rows (or the workout name) differ from what it opened with, the page posts
 * { type: 'saveEdit', wid, rows } (wid = which plan workout the sheet was opened for, set in window.__editWid).
 *
 * RENAME: the sheet also has a "Workout name" box under the title. A changed name travels as ONE extra row
 * [RENAME_ROW_KEY, name] at the end of `rows`, so both tabs (which hand the rows straight to saveWorkoutEdit) save it with
 * no change of their own; lib/planEdit.ts applyEditRows turns it into the workout's name, which every screen reads.
 */

/** The marker row that carries a new workout name. A control character, so it can never be a real exercise name. */
export const RENAME_ROW_KEY = String.fromCharCode(1) + 'name';

export const EDIT_BRIDGE_JS = `(function(){
  if (window.__editBridgeInstalled) return;
  window.__editBridgeInstalled = true;
  var RENAME_KEY = ${JSON.stringify(RENAME_ROW_KEY)};
  var wasOpen = false, initial = null, initialName = '';

  function currentName() {
    var d = window.__athltData; if (!d) return '';
    if (d.days && window.__editWid) {
      for (var i = 0; i < d.days.length; i++) if (d.days[i] && d.days[i].wid === window.__editWid) return d.days[i].name || '';
    }
    return d.workoutName || '';
  }
  function findSheet() {
    var ds = document.querySelectorAll('div');
    for (var i = 0; i < ds.length; i++) {
      var d = ds[i];
      if (d.style && d.style.maxHeight === '620px' && /Edit Workout/.test(d.textContent || '')) return d;
    }
    return null;
  }
  // The name box: our own element added under the sheet's title row (the design's own nodes are never removed).
  function ensureNameBox() {
    var sh = findSheet(); if (!sh) return null;
    var box = sh.querySelector('[data-edit-name]');
    if (!box) {
      var title = null, leaves = sh.querySelectorAll('div');
      for (var i = 0; i < leaves.length; i++) if (leaves[i].children.length === 0 && (leaves[i].textContent || '').trim() === 'Edit Workout') { title = leaves[i]; break; }
      var header = title && title.parentElement;
      if (!header || !header.parentElement) return null;
      box = document.createElement('div');
      box.setAttribute('data-edit-name', '1');
      box.style.cssText = 'padding:12px 16px 0;display:flex;flex-direction:column;gap:6px;';
      var lab = document.createElement('div');
      lab.textContent = 'Workout name';
      lab.style.cssText = 'font-size:13px;font-weight:600;color:#5f5f69;padding-left:4px;';
      var inp = document.createElement('input');
      inp.type = 'text'; inp.maxLength = 40; inp.placeholder = 'Workout name';
      inp.setAttribute('autocomplete', 'off'); inp.setAttribute('autocorrect', 'off'); inp.setAttribute('enterkeyhint', 'done');
      inp.style.cssText = 'height:48px;border-radius:16px;border:0;outline:0;background:#f6f6f8;padding:0 16px;font-size:17px;font-weight:700;letter-spacing:-0.3px;color:#111114;font-family:inherit;box-sizing:border-box;width:100%;';
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });
      box.appendChild(lab); box.appendChild(inp);
      header.parentElement.insertBefore(box, header.nextSibling);
    }
    return box.querySelector('input');
  }
  function fillName() {
    var inp = ensureNameBox();
    if (inp) inp.value = initialName;
  }

  window.__editBridge = function (self) {
    try {
      var st = self.state || {};
      var open = !!st.editOpen, list = st.editList || [];
      if (open && !wasOpen) {
        initial = JSON.stringify(list);
        initialName = currentName();
        setTimeout(fillName, 0); setTimeout(fillName, 150);
      }
      if (!open && wasOpen && initial !== null) {
        var inp = document.querySelector('[data-edit-name] input');
        var typed = inp ? (inp.value || '').trim().slice(0, 40) : '';
        var nameChanged = typed.length > 0 && typed !== initialName;
        if (inp) inp.blur();
        if ((JSON.stringify(list) !== initial || nameChanged) && window.__editWid) {
          var rows = list.slice();
          if (nameChanged) rows.push([RENAME_KEY, typed]);
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'saveEdit', wid: window.__editWid, rows: rows }));
        }
        initial = null;
      }
      wasOpen = open;
    } catch (e) {}
  };
})(); true;`;
