/**
 * lib/loggedTile.ts
 *
 * A workout the user typed in by hand (Log a session) was never recorded, but its card looked like a camera workout. Its
 * picture slot now shows a "logged" tile instead of a video frame: a note-with-check icon and a small "Session logged" label (and no play button).
 * Page-side helper shared by the Progress and Home pages (they call window.__paintLogged(el, on)). Plain JS text, no
 * backtick and no dollar-brace inside, so it can be added to other page strings.
 */
export const LOGGED_TILE_JS = String.raw`
(function () {
  if (window.__paintLogged) return;
  window.__paintLogged = function (el, on) {
    if (!el) return false;
    var mine = null;
    for (var i = 0; i < el.children.length; i++) if (el.children[i].hasAttribute && el.children[i].hasAttribute('data-athlt-logged')) mine = el.children[i];
    // the design's play button (a camera video can be played; a typed-in session has nothing to play)
    for (var k = 0; k < el.children.length; k++) {
      var ch = el.children[k];
      if (ch === mine || !ch.querySelector || !ch.querySelector('svg')) continue;
      if (on) { ch.setAttribute('data-athlt-hidden-play', '1'); ch.style.setProperty('display', 'none', 'important'); }
      else if (ch.hasAttribute('data-athlt-hidden-play')) { ch.removeAttribute('data-athlt-hidden-play'); ch.style.removeProperty('display'); }
    }
    // the design's shade over the bottom of a video frame (a gradient behind the name): not wanted on a plain tile
    var shades = el.querySelectorAll('*');
    for (var q = 0; q < shades.length; q++) {
      var sh = shades[q];
      if (sh === mine || (mine && mine.contains(sh))) continue;
      if (on) {
        if (!sh.hasAttribute('data-athlt-shade') && /gradient/.test(getComputedStyle(sh).backgroundImage)) { sh.setAttribute('data-athlt-shade', '1'); sh.style.setProperty('background-image', 'none', 'important'); }
      } else if (sh.hasAttribute('data-athlt-shade')) { sh.removeAttribute('data-athlt-shade'); sh.style.removeProperty('background-image'); }
    }
    if (!on) { if (mine) mine.remove(); return false; }
    el.style.setProperty('background-image', 'none', 'important');
    el.style.setProperty('background-color', '#2a2a2e', 'important'); // flat, no gradient
    el.style.setProperty('background-size', 'cover', 'important');
    el.style.setProperty('background-repeat', 'no-repeat', 'important');
    if (mine) return true;
    if (getComputedStyle(el).position === 'static') el.style.setProperty('position', 'relative');
    mine = document.createElement('div');
    mine.setAttribute('data-athlt-logged', '1');
    mine.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;pointer-events:none;';
    // a note with a check badge: "written in by hand"
    mine.innerHTML = '<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="8" y="5" width="21" height="27" rx="5" fill="rgba(255,255,255,0.14)" stroke="#ffffff" stroke-width="2"></rect><path d="M13.5 13h10M13.5 18h10M13.5 23h5" stroke="#ffffff" stroke-width="2" stroke-linecap="round"></path><circle cx="29.5" cy="29.5" r="8" fill="#34c759" stroke="#2a2a2e" stroke-width="2.5"></circle><path d="m25.8 29.6 2.5 2.5 4.4-4.9" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>'
      + '<div style="font-size:11px;font-weight:700;letter-spacing:0.4px;color:#ffffff;background:rgba(255,255,255,0.18);padding:3px 10px;border-radius:999px;white-space:nowrap;">Session logged</div>';
    el.appendChild(mine);
    return true;
  };
})(); true;`;
