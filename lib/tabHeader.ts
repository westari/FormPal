/**
 * lib/tabHeader.ts
 *
 * ONE header for the four tab pages (Home, Train, Progress, Profile): the same title (30px / 700 / -0.9 letter spacing, Plus Jakarta
 * Sans), the same position (the design's 62px plus the real top inset), and the same date line under it ("Thursday, November 12",
 * 14px / 500 grey). Each page's own left-hand title is hidden and replaced by this block; the page's right-hand control (streak
 * chip, share, badges) stays where the design put it and is centred against the block.
 *
 * window.__fpHeader(title, insetTop) is idempotent: calling it again (every focus, every data push) only refreshes the title,
 * the date and the padding. A MutationObserver puts the block back if the page ever redraws its header.
 */
export const TAB_HEADER_JS = `
(function(){
  if (window.__fpHeader) return;
  var CFG = null;
  function dateText(){
    try { return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
    catch (e) { return ''; }
  }
  function findRow(){
    var h = document.querySelector('[data-fp-header]');
    if (h) return h;
    var all = document.querySelectorAll('div');
    for (var i = 0; i < all.length; i++) {
      if (all[i].style && all[i].style.paddingTop === '62px') { h = all[i]; break; }
    }
    if (!h) return null;
    h.setAttribute('data-fp-header', '1');
    return h;
  }
  function apply(){
    if (!CFG) return false;
    // Home and Train fit their canvas themselves (window.__dcCanvasScale); Progress and Profile are fitted to the screen height
    var S = window.__dcCanvasScale || (window.innerHeight ? window.innerHeight / 844 : 0);
    if (!S) return false;
    var h = findRow();
    if (!h) return false;
    // position: the design's 62px + the real top inset (in the canvas's own units)
    // (writes only what changed: a page that waits for its DOM to go quiet must not see this run as activity)
    function put(el, k, v){ if (el.style.getPropertyValue(k) !== v || el.style.getPropertyPriority(k) !== 'important') el.style.setProperty(k, v, 'important'); }
    put(h, 'padding-top', (Math.round((62 + CFG.inset / S) * 100) / 100) + 'px');
    put(h, 'padding-left', '22px');
    put(h, 'padding-right', '22px');
    put(h, 'padding-bottom', '6px'); // air between the date line and whatever the page puts next (Home's pills sat tight under it)
    put(h, 'align-items', 'center');
    put(h, 'justify-content', 'space-between');
    put(h, 'gap', '12px');
    var block = h.querySelector('[data-fp-title-block]');
    if (!block) {
      block = document.createElement('div');
      block.setAttribute('data-fp-title-block', '1');
      block.style.cssText = 'flex:1 1 auto;min-width:0;';
      var t = document.createElement('div');
      t.setAttribute('data-fp-title', '1');
      t.style.cssText = 'font-family:"Plus Jakarta Sans",Helvetica,sans-serif;font-size:30px;font-weight:700;letter-spacing:-0.9px;line-height:1.05;color:#111114;white-space:nowrap;';
      var d = document.createElement('div');
      d.setAttribute('data-fp-date', '1');
      d.style.cssText = 'font-family:"Plus Jakarta Sans",Helvetica,sans-serif;font-size:14px;font-weight:500;letter-spacing:-0.1px;line-height:1.2;color:#6e6e77;margin-top:5px;white-space:nowrap;';
      block.appendChild(t); block.appendChild(d);
      // the design's own left-hand title goes away (hidden, not removed: the page's code may still write to it)
      var first = h.firstElementChild;
      if (first) put(first, 'display', 'none');
      h.insertBefore(block, h.firstChild);
    }
    if (block.firstChild.textContent !== CFG.title) block.firstChild.textContent = CFG.title;
    var dt = dateText();
    if (block.lastChild.textContent !== dt) block.lastChild.textContent = dt;
    if (!h.__fpObs && window.MutationObserver) {
      h.__fpObs = new MutationObserver(function(){ if (!h.querySelector('[data-fp-title-block]')) apply(); });
      h.__fpObs.observe(h, { childList: true });
    }
    return true;
  }
  window.__fpHeader = function(title, inset){
    CFG = { title: title, inset: inset || 0 };
    var ok = apply();
    // a page that is still laying out reports a wrong height (and so a wrong scale) at first: apply again once it has settled,
    // and whenever the window changes size
    [50, 150, 300, 600, 1000, 1600].forEach(function(ms){ setTimeout(apply, ms); });
    if (!window.__fpHeaderResize) { window.__fpHeaderResize = true; window.addEventListener('resize', function(){ apply(); }); }
    return ok;
  };
})();
`;
