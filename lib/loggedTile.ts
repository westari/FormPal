/**
 * lib/loggedTile.ts
 *
 * A workout the user typed in by hand (Log a session) was never recorded, but its card looked like a camera workout. Its
 * picture slot now shows a "logged" tile instead of a video frame: a clipboard-with-check icon and a small "Logged" label.
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
    if (!on) { if (mine) mine.remove(); return false; }
    el.style.setProperty('background-image', 'linear-gradient(160deg, #f3f4f9 0%, #dde1ec 100%)', 'important');
    el.style.setProperty('background-size', 'cover', 'important');
    el.style.setProperty('background-repeat', 'no-repeat', 'important');
    if (mine) return true;
    if (getComputedStyle(el).position === 'static') el.style.setProperty('position', 'relative');
    mine = document.createElement('div');
    mine.setAttribute('data-athlt-logged', '1');
    mine.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;pointer-events:none;';
    mine.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4b5266" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4.5" width="14" height="17" rx="2.6"></rect><path d="M9 4.5h6V7H9z"></path><path d="m9 14 2.2 2.2L15.5 11.4"></path></svg>'
      + '<div style="font-size:10px;font-weight:700;letter-spacing:0.3px;color:#4b5266;background:rgba(255,255,255,0.85);padding:2px 8px;border-radius:999px;">Logged</div>';
    el.appendChild(mine);
    return true;
  };
})(); true;`;
