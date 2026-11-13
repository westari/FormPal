/**
 * lib/loggedTile.ts
 *
 * A workout the user typed in by hand (Log a session) was never recorded, but its card looked like a camera workout. Its
 * picture slot now shows a "logged" tile instead of a video frame: a flat LIGHT card with a small body outline where the
 * muscles that session trained are lit in their rank colours (lib/bodyMapSvg.ts loggedBodySvg), and a small "Session logged"
 * label. No play button, no gradient. Camera workouts keep their video frames.
 * Page-side helper shared by the Progress and Home pages (they call window.__paintLogged(el, on, bodySvg)). Plain JS text, no
 * backtick and no dollar-brace inside, so it can be added to other page strings.
 */
export const LOGGED_TILE_JS = String.raw`
(function () {
  if (window.__paintLogged) return;
  var LIGHT = '#f2f3f7';
  var NOTE = '<svg width="34" height="34" viewBox="0 0 40 40" fill="none"><rect x="8" y="5" width="21" height="27" rx="5" fill="#ffffff" stroke="#8b8d99" stroke-width="2"></rect><path d="M13.5 13h10M13.5 18h10M13.5 23h5" stroke="#8b8d99" stroke-width="2" stroke-linecap="round"></path><circle cx="29.5" cy="29.5" r="8" fill="#34c759" stroke="#f2f3f7" stroke-width="2.5"></circle><path d="m25.8 29.6 2.5 2.5 4.4-4.9" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
  window.__paintLogged = function (el, on, body) {
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
    // the design's shade over the bottom of a video frame (a gradient behind the name) and its white text: not wanted on a light tile
    var all = el.querySelectorAll('*');
    for (var q = 0; q < all.length; q++) {
      var sh = all[q];
      if (sh === mine || (mine && mine.contains(sh))) continue;
      if (on) {
        if (!sh.hasAttribute('data-athlt-shade') && /gradient/.test(getComputedStyle(sh).backgroundImage)) { sh.setAttribute('data-athlt-shade', '1'); sh.style.setProperty('background-image', 'none', 'important'); }
        if (!sh.hasAttribute('data-athlt-ink')) {
          var m = /^rgba?[(]\s*(\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(sh).color || '');
          if (m && +m[1] > 215 && +m[2] > 215 && +m[3] > 215 && (sh.textContent || '').trim() && !sh.querySelector('*')) { sh.setAttribute('data-athlt-ink', '1'); sh.style.setProperty('color', '#111114', 'important'); sh.style.setProperty('text-shadow', 'none', 'important'); }
        }
      } else {
        if (sh.hasAttribute('data-athlt-shade')) { sh.removeAttribute('data-athlt-shade'); sh.style.removeProperty('background-image'); }
        if (sh.hasAttribute('data-athlt-ink')) { sh.removeAttribute('data-athlt-ink'); sh.style.removeProperty('color'); sh.style.removeProperty('text-shadow'); }
      }
    }
    if (!on) { if (mine) mine.remove(); return false; }
    el.style.setProperty('background-image', 'none', 'important');
    el.style.setProperty('background-color', LIGHT, 'important'); // flat light card, no gradient
    el.style.setProperty('background-size', 'cover', 'important');
    el.style.setProperty('background-repeat', 'no-repeat', 'important');
    var sig = body ? 'b' + body.length : 'n';
    if (mine && mine.getAttribute('data-athlt-logged') === sig) return true;
    if (mine) mine.remove();
    if (getComputedStyle(el).position === 'static') el.style.setProperty('position', 'relative');
    // a tile that carries the workout name at its bottom keeps that strip free
    var hasName = false;
    for (var c2 = 0; c2 < el.children.length; c2++) if (el.children[c2] !== mine && (el.children[c2].textContent || '').trim()) hasName = true;
    var narrow = el.offsetWidth < 110;
    mine = document.createElement('div');
    mine.setAttribute('data-athlt-logged', sig);
    mine.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:' + (hasName ? 44 : 0) + 'px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:' + (narrow ? 4 : 7) + 'px;padding:' + (narrow ? '8px 4px 6px' : '14px 8px 4px') + ';box-sizing:border-box;pointer-events:none;';
    var fig = document.createElement('div');
    fig.setAttribute('data-athlt-body', '1');
    fig.style.cssText = 'flex:1 1 auto;min-height:0;width:100%;display:flex;align-items:center;justify-content:center;';
    fig.innerHTML = body || NOTE;
    var svg = fig.querySelector('svg');
    if (svg && body) { svg.style.setProperty('width', 'auto'); svg.style.setProperty('height', '100%'); svg.style.setProperty('max-width', '100%'); }
    var lab = document.createElement('div');
    lab.setAttribute('data-athlt-label', '1');
    lab.style.cssText = 'flex:0 0 auto;font-size:' + (narrow ? 9 : 11) + 'px;font-weight:700;letter-spacing:0.2px;color:#5d5f6b;background:rgba(17,17,20,0.07);padding:' + (narrow ? '2px 6px' : '3px 10px') + ';border-radius:999px;white-space:nowrap;';
    lab.textContent = 'Session logged';
    mine.appendChild(fig); mine.appendChild(lab);
    el.appendChild(mine);
    return true;
  };
})(); true;`;
