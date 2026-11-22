/**
 * lib/doneAnimationPage.ts
 *
 * Page side of the done screen. Ari's design (assets/app screens/greatjobanimation.html) is used AS IS (the file is never edited). Around it:
 *  - the page background and the design's stand-in screen (the grey backdrop and its fake "Done" button) are made see-through, so the wash sweeps
 *    over the REAL screen that was just on screen;
 *  - the wash (round 7): the design clips a growing circle, which the phone draws on the main thread (choppy). It is now the SAME wash drawn as a
 *    big round layer that grows with a transform (the phone's GPU does it, smooth), a little slower (1000ms, was 700ms);
 *  - the brackets (round 7) sit closer around the title text (measured from the real words);
 *  - the design's words are replaced: the title, the grey line and the Continue button's tap;
 *  - the 390 x 844 canvas is scaled to the screen;
 *  - the page is loaded and fitted BEFORE it is needed (a spare, see components/DoneHost.tsx), with every animation held (data-go) until the
 *    app calls __doneStart(title, line): then it plays at once, no wait.
 */
export const DONE_WASH_MS = 1000;      // the design's wash is 700ms; a little slower is easier to follow
export const DONE_WASH_DELAY_MS = 180; // the design's own delay (kept)
export const BRACKET_SIDE_GAP = 18;    // the corner of a bracket to the text, sideways (the design: about 33)
export const BRACKET_TOP_GAP = 20;     // the corner of a bracket to the text line, up and down (the design: about 31)

export const DONE_BEFORE_JS = String.raw`(function(){
  function add(){
    if (document.getElementById('__done_css')) return;
    var h = document.head || document.documentElement; if (!h) return;
    var s = document.createElement('style'); s.id = '__done_css';
    s.textContent = 'html:not([data-go]) *,html:not([data-go]) div[style*="nw-wash"]::before{animation-play-state:paused!important;} html,body{margin:0!important;background:transparent!important;} body{display:block!important;min-height:0!important;overflow:hidden!important;}'
      // the wash: the design's clip-path circle is switched off and the same circle is a layer that grows (a transform, drawn by the GPU)
      + '@keyframes nw-wash{from{clip-path:none}to{clip-path:none}}'
      + '@keyframes nw-wash-grow{from{transform:scale(0)}to{transform:scale(2.5)}}'
      + 'div[style*="nw-wash"]{background:transparent!important;}'
      + 'div[style*="nw-wash"]::before{content:"";position:absolute;left:50%;top:786px;width:800px;height:800px;margin:-400px 0 0 -400px;border-radius:50%;'
      + 'background:linear-gradient(180deg,#f5f5f7 0%,#fbfbfc 45%,#ffffff 100%);transform:scale(0);will-change:transform;backface-visibility:hidden;'
      + 'animation:nw-wash-grow ${DONE_WASH_MS}ms cubic-bezier(.6,0,.3,1) ${DONE_WASH_DELAY_MS}ms both;}';
    h.appendChild(s);
  }
  add();
  try { new MutationObserver(add).observe(document, { childList: true }); } catch (e) {}
})(); true;`;

/** Runs once the page has loaded: fits the screen and waits (nothing plays) until the app calls __doneStart. Posts 'doneReady' when it can start at once. */
export const DONE_PREP_JS = `(function(){
  function post(m){ try { window.ReactNativeWebView.postMessage(m); } catch (e) {} }
  var els = null, started = false, readyPosted = false;
  function find(){
    var box = document.body && document.body.firstElementChild; if (!box) return null;
    var divs = box.querySelectorAll('div'), a = box.querySelector('a');
    var titleEl = null, subEl = null, fake = null, br = [];
    for (var i = 0; i < divs.length; i++) {
      var d = divs[i], t = (d.textContent || '').trim(), st = d.getAttribute('style') || '';
      if (/nw-bracket/.test(st)) br.push(d);
      else if (/font-size: 30px/.test(st) && /Workout complete/.test(t)) titleEl = d;
      else if (/font-size: 18.5px/.test(st)) subEl = d;
      else if (t === 'Done' && /nw-press/.test(st)) fake = d;
    }
    if (!titleEl || !subEl || !a || br.length !== 4) return null;
    return { box: box, titleEl: titleEl, subEl: subEl, a: a, fake: fake, br: br };
  }
  function fit(){
    if (!els) els = find(); if (!els) return false;
    var box = els.box;
    // the design's stand-in screen: see-through, so the wash sweeps over the real screen
    box.style.setProperty('background', 'transparent', 'important');
    if (els.fake) els.fake.style.setProperty('visibility', 'hidden', 'important');
    // scaled to the screen
    var vh = window.innerHeight, vw = window.innerWidth; if (!vh) return false;
    var S = vh / 844; window.__doneS = S;
    box.style.setProperty('transform-origin', 'top left', 'important');
    box.style.setProperty('transform', 'scale(' + S + ')', 'important');
    box.style.setProperty('margin-left', Math.round((vw - 390 * S) / 2 * 100) / 100 + 'px', 'important');
    if (!els.a.__wired) { els.a.__wired = true; els.a.addEventListener('click', function(ev){ ev.preventDefault(); post('doneContinue'); }, true); }
    return true;
  }
  // the brackets close around the real words (the design puts them about 33px from a long title)
  function brackets(){
    var S = window.__doneS || 1, t = els.titleEl;
    // the width of the words, measured on a copy (the title itself starts a little enlarged and blurred, which would measure too wide)
    var cs = getComputedStyle(t), sp = document.createElement('span');
    sp.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap;font-family:' + cs.fontFamily + ';font-size:' + cs.fontSize + ';font-weight:' + cs.fontWeight + ';letter-spacing:' + cs.letterSpacing + ';';
    sp.textContent = t.textContent; els.box.appendChild(sp);
    var w = sp.getBoundingClientRect().width / S; els.box.removeChild(sp); if (!w) return;
    var cx = 195, SIDE = ${BRACKET_SIDE_GAP}, TOP = ${BRACKET_TOP_GAP};
    // bracket svg: the corner point sits 2px inside a 28px box, and is 26px along the other way (mirrored for right / bottom)
    var L = Math.round((cx - w / 2 - SIDE - 2) * 10) / 10, R = Math.round((cx + w / 2 + SIDE - 26) * 10) / 10;
    var mid = 404, T = Math.round((mid - 11 - TOP - 2) * 10) / 10, B = Math.round((mid + 11 + TOP - 26) * 10) / 10; // the text line is about 22px tall around y 404
    var pos = [[L, T], [R, T], [L, B], [R, B]];
    for (var i = 0; i < 4; i++) { els.br[i].style.setProperty('left', pos[i][0] + 'px', 'important'); els.br[i].style.setProperty('top', pos[i][1] + 'px', 'important'); }
  }
  var pendingLine = null, lineWaiting = false;
  function setLine(t){ if (!els) return; if (t) { els.subEl.textContent = t; els.subEl.style.removeProperty('display'); } else els.subEl.style.setProperty('display', 'none', 'important'); }
  // the grey line arrives later (it was still being worked out when the screen started): put it in, or leave it out
  window.__doneSetLine = function(t){ if (started) setLine(t); else pendingLine = t; };
  window.__doneStart = function(title, sub, later){
    if (started) return;
    (function go(n){
      if (!els || !fit()) { if (n > 80) { started = true; document.documentElement.setAttribute('data-go', '1'); post('doneShown'); return; } setTimeout(function(){ go(n + 1); }, 25); return; }
      started = true;
      els.titleEl.textContent = title;
      if (later) { els.subEl.textContent = ''; if (pendingLine != null) setLine(pendingLine); }
      else if (sub) els.subEl.textContent = sub; else els.subEl.style.setProperty('display', 'none', 'important');
      brackets();
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ document.documentElement.setAttribute('data-go', '1'); post('doneShown'); }); });
    })(0);
  };
  function ready(){ if (readyPosted) return; if (fit()) { readyPosted = true; post('doneReady'); } }
  (function wait(n){ ready(); if (!readyPosted && n < 200) setTimeout(function(){ wait(n + 1); }, 25); })(0);
  window.addEventListener('resize', function(){ if (els) fit(); });
})(); true;`;

/** What the app sends to make the spare page play: set the words and go. */
export function doneStartJs(title: string, subtitle: string, later = false): string {
  return `window.__doneStart && window.__doneStart(${JSON.stringify(title)}, ${JSON.stringify(subtitle)}, ${later ? 'true' : 'false'}); true;`;
}
/** Later: the real grey line, once it is worked out ('' leaves the line out). */
export function doneLineJs(line: string): string {
  return `window.__doneSetLine && window.__doneSetLine(${JSON.stringify(line)}); true;`;
}
