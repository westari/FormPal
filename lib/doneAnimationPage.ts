/**
 * lib/doneAnimationPage.ts
 *
 * Page side of the done screen. Ari's design (assets/app screens/greatjobanimation.html) is used AS IS: its wash, brackets, title, line and button
 * animations are untouched. Only these things are done around it:
 *  - the page background and the design's stand-in screen (the grey backdrop and its fake "Done" button) are made see-through, so the wash sweeps
 *    over the REAL screen that was just on screen;
 *  - the design's words are replaced: the title ("Workout complete!"), the grey line and the Continue button's tap;
 *  - the 390 x 844 canvas is scaled to the screen;
 *  - the animations are held until all of that is in place (data-go), so the first frame is final.
 */
export const DONE_BEFORE_JS = String.raw`(function(){
  function add(){
    if (document.getElementById('__done_css')) return;
    var h = document.head || document.documentElement; if (!h) return;
    var s = document.createElement('style'); s.id = '__done_css';
    s.textContent = 'html:not([data-go]) *{animation-play-state:paused!important;} html,body{margin:0!important;background:transparent!important;} body{display:block!important;min-height:0!important;overflow:hidden!important;}';
    h.appendChild(s);
  }
  add();
  try { new MutationObserver(add).observe(document, { childList: true }); } catch (e) {}
})(); true;`;

export function doneAfterJs(title: string, subtitle: string): string {
  return `(function(){
  var TITLE = ${JSON.stringify(title)}, SUB = ${JSON.stringify(subtitle)};
  function post(m){ try { window.ReactNativeWebView.postMessage(m); } catch (e) {} }
  var done = false;
  function apply(){
    var box = document.body && document.body.firstElementChild; if (!box) return false;
    var divs = box.querySelectorAll('div'), a = box.querySelector('a');
    var titleEl = null, subEl = null, fake = null;
    for (var i = 0; i < divs.length; i++) {
      var d = divs[i], t = (d.textContent || '').trim(), st = d.getAttribute('style') || '';
      if (/font-size: 30px/.test(st) && /Workout complete/.test(t)) titleEl = d;
      else if (/font-size: 18.5px/.test(st)) subEl = d;
      else if (t === 'Done' && /nw-press/.test(st)) fake = d;
    }
    if (!titleEl || !subEl || !a) return false;
    titleEl.textContent = TITLE;
    if (SUB) subEl.textContent = SUB; else subEl.style.setProperty('display', 'none', 'important');
    // the design's stand-in screen: see-through, so the wash sweeps over the real screen
    box.style.setProperty('background', 'transparent', 'important');
    if (fake) fake.style.setProperty('visibility', 'hidden', 'important');
    // scaled to the screen
    var vh = window.innerHeight, vw = window.innerWidth; if (!vh) return false;
    var S = vh / 844;
    box.style.setProperty('transform-origin', 'top left', 'important');
    box.style.setProperty('transform', 'scale(' + S + ')', 'important');
    box.style.setProperty('margin-left', Math.round((vw - 390 * S) / 2 * 100) / 100 + 'px', 'important');
    if (!a.__wired) { a.__wired = true; a.addEventListener('click', function(ev){ ev.preventDefault(); post('doneContinue'); }, true); }
    return true;
  }
  function go(){ if (done) return; done = true; document.documentElement.setAttribute('data-go', '1'); post('doneShown'); }
  (function wait(n){ if (apply()) { requestAnimationFrame(function(){ requestAnimationFrame(go); }); } else if (n > 60) go(); else setTimeout(function(){ wait(n + 1); }, 25); })(0);
  window.addEventListener('resize', apply);
})(); true;`;
}
