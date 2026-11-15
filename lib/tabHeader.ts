/**
 * lib/tabHeader.ts
 *
 * ONE header for the four tab pages (Home, Train, Progress, Profile): the same title style (30px / 700 / -0.9 letter spacing,
 * Plus Jakarta Sans) and the same position (the design's 62px plus the real top inset). There is no date line under it. Each
 * page's own left-hand title is hidden and replaced by this block; the page's right-hand control (streak chip, share, badges)
 * stays where the design put it and is centred against the block.
 *
 * Home's title IS the live date ("Thursday, November 12", worked out on the phone each time) at the same 30px as the other titles,
 * with a small grey down-arrow beside it. If the long month does not fit next to the streak chip the month is shortened ("Sunday,
 * Nov 15"). Tapping the date or the arrow posts {type:'calendar', top, cx}; the app drops the calendar down from there and flips the
 * arrow with window.__fpChevron(open).
 *
 * window.__fpHeader(title, insetTop, opts) is idempotent: calling it again (every focus, every data push) only refreshes the
 * title, the padding and the size. opts.live = true makes the title the live date and adds the calendar icon. A MutationObserver
 * puts the block back if the page ever redraws its header.
 */
export const TAB_HEADER_JS = `
(function(){
  if (window.__fpHeader) return;
  var CFG = null;
  function dateText(short){
    try { return new Date(window.__fpNow || Date.now()).toLocaleDateString('en-US', { weekday: short === 2 ? 'short' : 'long', month: short ? 'short' : 'long', day: 'numeric' }); }
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
        // a simple grey down-arrow beside the date; the whole block (date + arrow) is the button. The app flips it to an up-arrow
        // (window.__fpChevron) while the calendar is dropped down.
        var ic = document.createElement('span');
        ic.setAttribute('data-fp-cal', '1');
        ic.style.cssText = 'display:inline-block;vertical-align:middle;margin-left:7px;width:20px;height:20px;line-height:0;position:relative;top:-1px;transition:transform 220ms cubic-bezier(.2,.8,.2,1);';
        ic.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8e8e98" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9.5l6 6 6-6"/></svg>';
        t.appendChild(ic);
        block.style.cursor = 'pointer';
        block.style.webkitTapHighlightColor = 'transparent';
        block.addEventListener('click', function(ev){
          ev.preventDefault(); ev.stopPropagation();
          var r = block.getBoundingClientRect(), c = ic.getBoundingClientRect();
          try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'calendar', top: r.bottom, cx: c.left + c.width / 2 })); } catch (e) {}
        }, true);
      }
      // the design's own left-hand title goes away (hidden, not removed: the page's code may still write to it)
      var first = h.firstElementChild;
      if (first) put(first, 'display', 'none');
      h.insertBefore(block, h.firstChild);
    }
    var tEl = block.firstChild;
    var txt = CFG.title;
    var fs = 30;
    if (CFG.live) {
      // as big as the other tabs' titles (30px) next to the streak chip; if the long month does not fit, the month is shortened
      // ("Sunday, Nov 15"); only if even that does not fit is the size reduced (never below 22px)
      var rowW = h.clientWidth, other = 0;
      for (var ci = 0; ci < h.children.length; ci++) { var c = h.children[ci]; if (c !== block && getComputedStyle(c).display !== 'none') other += c.getBoundingClientRect().width / S + 12; }
      var avail = rowW - 44 - other - 2;
      var cv = window.__fpCv || (window.__fpCv = document.createElement('canvas').getContext('2d'));
      cv.font = '700 30px "Plus Jakarta Sans", Helvetica, sans-serif';
      var wOf = function (x) { return cv.measureText(x).width - 0.9 * x.length + 27; }; // + the arrow
      txt = dateText(false);
      if (wOf(txt) > avail) { txt = dateText(1); }
      if (wOf(txt) > avail) { txt = dateText(2); } // last resort for the longest days ("Wed, Jan 7"): both words shortened, still 30px
      if (wOf(txt) > avail) fs = Math.max(22, Math.floor(30 * avail / wOf(txt)));
    }
    var tEl = block.firstChild;
    var tn = tEl.firstChild;
    if (!tn || tn.nodeType !== 3) { tn = document.createTextNode(txt); tEl.insertBefore(tn, tEl.firstChild); }
    else if (tn.nodeValue !== txt) tn.nodeValue = txt;
    if (tEl.style.fontSize !== fs + 'px') tEl.style.fontSize = fs + 'px';
    if (!h.__fpObs && window.MutationObserver) {
      h.__fpObs = new MutationObserver(function(){ if (!h.querySelector('[data-fp-title-block]')) apply(); });
      h.__fpObs.observe(h, { childList: true });
    }
    return true;
  }
  // the arrow points down while the calendar is closed and up while it is open
  window.__fpChevron = function(open){
    var ic = document.querySelector('[data-fp-cal]');
    if (ic) ic.style.setProperty('transform', open ? 'rotate(180deg)' : 'rotate(0deg)');
  };
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
