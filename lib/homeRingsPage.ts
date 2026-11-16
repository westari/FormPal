/**
 * lib/homeRingsPage.ts
 *
 * Page side of the Home goal rings (data: lib/homeRings.ts). Three white tiles in the Home design's own style (the same soft white cards as the
 * two drop-downs) sit right under those drop-downs: a ring that fills smoothly, its number in the middle and a small label under it.
 * The old "Progress" heading, the "x of y workouts" week line and the Form score card are hidden: the rings replace them. The Cue card that sat under them stays.
 * window.__homeRingsData is set by the app (an array of rings); the installer is idempotent and only writes what changed.
 */
export const HOME_RINGS_JS = String.raw`
(function(){
  if (window.__homeRingsInstalled) return; window.__homeRingsInstalled = true;
  var C = 2 * Math.PI * 27;                       // ring circumference (radius 27 in a 66 box)
  var COLORS = { workouts: ['#ffb03a', '#ff6a1a'], form: ['#a99bff', '#7c6bf0'], muscles: ['#59d18a', '#26a85f'] };
  function pillsRow(){
    var divs = document.querySelectorAll('#dc-root div');
    for (var i = 0; i < divs.length; i++) { var d = divs[i], t = (d.textContent || ''); if (d.style && d.style.position === 'relative' && d.style.zIndex === '40' && /Energy/.test(t) && /Training at/.test(t)) return d; }
    return null;
  }
  function hideOld(){
    var all = document.querySelectorAll('#dc-root div');
    for (var i = 0; i < all.length; i++) {
      var h = all[i];
      if (h.children.length > 1 || (h.textContent || '').trim() !== 'Progress' || !h.style || h.style.fontSize !== '21px') continue;
      var card = h.nextElementSibling;
      if (card && /Form score/.test(card.textContent || '') && /workouts/.test(card.textContent || '')) {
        if (h.style.display !== 'none') h.style.setProperty('display', 'none', 'important');   // the "Progress" heading
        var wk = card.children[0], cue = card.children[1];
        if (wk && wk.style.display !== 'none') wk.style.setProperty('display', 'none', 'important'); // the week line + Form score card: the rings replace them
        // the Cue card ("Your squats got 8% deeper / Chat with Cue") stays: it used to tuck under the week card (square top, -26px); alone it is a
        // normal rounded card with its own spacing
        if (cue && !cue.hasAttribute('data-ring-cue')) {
          cue.setAttribute('data-ring-cue', '1');
          // (the original: margin -26px 8px 0, square top corners, 40px top padding: all of that only existed to tuck it under the week card)
          cue.style.setProperty('margin', '14px 0 0', 'important'); cue.style.setProperty('border-radius', '26px', 'important'); cue.style.setProperty('padding', '18px', 'important');
        }
      }
    }
  }
  function tile(r){
    var col = COLORS[r.id] || COLORS.workouts;
    return '<div data-ring="' + r.id + '" style="cursor:pointer;background:#ffffff;border-radius:24px;padding:12px 0 11px;display:flex;flex-direction:column;align-items:center;gap:7px;box-shadow:inset 0 1px 0 rgba(255,255,255,1),0 8px 18px -8px rgba(40,50,90,0.28),0 1px 3px -1px rgba(40,50,90,0.1);">'
      + '<div style="position:relative;width:66px;height:66px;">'
      + '<svg width="66" height="66" viewBox="0 0 66 66" style="display:block;transform:rotate(-90deg);">'
      + '<defs><linearGradient id="hr-' + r.id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + col[0] + '"/><stop offset="1" stop-color="' + col[1] + '"/></linearGradient></defs>'
      + '<circle cx="33" cy="33" r="27" fill="none" stroke="#eceef3" stroke-width="7"/>'
      + '<circle data-ring-arc="1" cx="33" cy="33" r="27" fill="none" stroke="url(#hr-' + r.id + ')" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + C.toFixed(2) + '" stroke-dashoffset="' + C.toFixed(2) + '" style="transition:stroke-dashoffset 1000ms cubic-bezier(.2,.8,.2,1);"/>'
      + '</svg>'
      + '<div data-ring-num="1" style="position:absolute;left:0;top:0;width:66px;height:66px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;letter-spacing:-0.5px;color:#111114;"></div>'
      + '</div>'
      + '<div data-ring-label="1" style="font-size:12.5px;font-weight:600;color:#5f5f69;letter-spacing:-0.1px;"></div></div>';
  }
  function apply(){
    var data = window.__homeRingsData;
    hideOld();
    if (!data || !data.length) return;
    var row = pillsRow(); if (!row) return;
    var box = document.querySelector('[data-home-rings]');
    if (!box) {
      box = document.createElement('div'); box.setAttribute('data-home-rings', '1');
      box.style.cssText = 'padding:16px 14px 0;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;';
      box.innerHTML = data.map(tile).join('');
      row.parentElement.insertBefore(box, row.nextElementSibling);
    } else if (box.previousElementSibling !== row) {
      row.parentElement.insertBefore(box, row.nextElementSibling);
    }
    data.forEach(function(r){
      var t = box.querySelector('[data-ring="' + r.id + '"]'); if (!t) return;
      var num = t.querySelector('[data-ring-num]'), lab = t.querySelector('[data-ring-label]'), arc = t.querySelector('[data-ring-arc]');
      if (num.textContent !== r.text) num.textContent = r.text;
      if (lab.textContent !== r.label) lab.textContent = r.label;
      var off = (C * (1 - Math.max(0, Math.min(1, r.fill)))).toFixed(2);
      if (arc.getAttribute('stroke-dashoffset') !== off) {
        // the first fill starts one frame after the ring is drawn empty, so it visibly fills instead of appearing full
        if (!arc.__drawn) { arc.__drawn = true; requestAnimationFrame(function(){ requestAnimationFrame(function(){ arc.setAttribute('stroke-dashoffset', off); }); }); }
        else arc.setAttribute('stroke-dashoffset', off);
      }
      t.setAttribute('data-done', r.done ? '1' : '0');
    });
  }
  // tap a ring: the app opens that goal in depth (this week by day, past weeks, what counts)
  document.addEventListener('click', function(ev){
    var t = ev.target; if (!t || !t.closest) return;
    var tile = t.closest('[data-ring]'); if (!tile || !tile.closest('[data-home-rings]')) return;
    ev.preventDefault(); ev.stopPropagation();
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ring', id: tile.getAttribute('data-ring') })); } catch (e) {}
  }, true);
  window.__homeRings = apply;
  apply();
  setInterval(apply, 400);
})(); true;
`;
