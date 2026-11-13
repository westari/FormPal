/**
 * lib/tabHeader.ts
 *
 * ONE header for the four tab pages (Home, Train, Progress, Profile): the same title style (30px / 700 / -0.9 letter spacing,
 * Plus Jakarta Sans) and the same position (the design's 62px plus the real top inset). There is no date line under it. Each
 * page's own left-hand title is hidden and replaced by this block; the page's right-hand control (streak chip, share, badges)
 * stays where the design put it and is centred against the block.
 *
 * Home's title IS the live date ("Thursday, November 12", worked out on the phone each time) with a small grey calendar icon
 * beside it; tapping the date or the icon posts {type:'calendar'} and the app shows the full calendar. The date is as big as
 * fits next to the streak chip (30px at most), so it never wraps or runs under the chip.
 *
 * window.__fpHeader(title, insetTop, opts) is idempotent: calling it again (every focus, every data push) only refreshes the
 * title, the padding and the size. opts.live = true makes the title the live date and adds the calendar icon. A MutationObserver
 * puts the block back if the page ever redraws its header.
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
      block.style.cssText = 'flex:1 1 auto;min-width:0;height:48px;display:flex;align-items:center;';
      var t = document.createElement('div');
      t.setAttribute('data-fp-title', '1');
      t.style.cssText = 'font-family:"Plus Jakarta Sans",Helvetica,sans-serif;font-size:30px;font-weight:700;letter-spacing:-0.9px;line-height:1.05;color:#111114;white-space:nowrap;';
      block.appendChild(t);
      if (CFG.live) {
        // the small grey calendar icon beside the date; the whole block (date + icon) is the button
        var ic = document.createElement('span');
        ic.setAttribute('data-fp-cal', '1');
        ic.style.cssText = 'display:inline-block;vertical-align:middle;margin-left:9px;width:20px;height:20px;line-height:0;position:relative;top:-1px;';
        ic.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9a9aa4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
        t.appendChild(ic);
        block.style.cursor = 'pointer';
        block.style.webkitTapHighlightColor = 'transparent';
        block.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'calendar' })); } catch (e) {} }, true);
      }
      // the design's own left-hand title goes away (hidden, not removed: the page's code may still write to it)
      var first = h.firstElementChild;
      if (first) put(first, 'display', 'none');
      h.insertBefore(block, h.firstChild);
    }
    var tEl = block.firstChild;
    var txt = CFG.live ? dateText() : CFG.title;
    var tn = tEl.firstChild;
    if (!tn || tn.nodeType !== 3) { tn = document.createTextNode(txt); tEl.insertBefore(tn, tEl.firstChild); }
    else if (tn.nodeValue !== txt) tn.nodeValue = txt;
    if (CFG.live) {
      // as big as fits (30px at most) between the left padding and the streak chip
      var rowW = h.clientWidth, other = 0;
      for (var ci = 0; ci < h.children.length; ci++) { var c = h.children[ci]; if (c !== block && getComputedStyle(c).display !== 'none') other += c.getBoundingClientRect().width / S + 12; }
      var avail = rowW - 44 - other - 8, fs = 30;
      // text width at 30px (the icon and its gap count too), measured on a canvas so nothing on the page is written to
      var cv = window.__fpCv || (window.__fpCv = document.createElement('canvas').getContext('2d'));
      cv.font = '700 30px "Plus Jakarta Sans", Helvetica, sans-serif';
      var w30 = cv.measureText(txt).width - 0.9 * txt.length + 29;
      fs = Math.max(18, Math.min(30, Math.floor(30 * avail / w30)));
      if (tEl.style.fontSize !== fs + 'px') tEl.style.fontSize = fs + 'px';
    }
    if (!h.__fpObs && window.MutationObserver) {
      h.__fpObs = new MutationObserver(function(){ if (!h.querySelector('[data-fp-title-block]')) apply(); });
      h.__fpObs.observe(h, { childList: true });
    }
    return true;
  }
  window.__fpHeader = function(title, inset, opts){
    CFG = { title: title, inset: inset || 0, live: !!(opts && opts.live) };
    var ok = apply();
    // a page that is still laying out reports a wrong height (and so a wrong scale) at first: apply again once it has settled,
    // and whenever the window changes size
    [50, 150, 300, 600, 1000, 1600].forEach(function(ms){ setTimeout(apply, ms); });
    if (!window.__fpHeaderResize) { window.__fpHeaderResize = true; window.addEventListener('resize', function(){ apply(); }); }
    return ok;
  };
})();
`;
