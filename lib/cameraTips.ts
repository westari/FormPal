/**
 * lib/cameraTips.ts
 *
 * "Quick workout tips" (Ari's design assets/app screens/cameratips.html) is shown ONCE, right after onboarding finishes (app/onboarding.tsx,
 * finishOnboarding). The answer is kept on the device. People who finished onboarding before this existed never see it (it is only reached
 * from the end of onboarding).
 */
export const CAMERA_TIPS_KEY = 'formpal_camera_tips_seen';

/** seen: the stored value ('1' once it has been shown). */
export const shouldShowCameraTips = (seen: string | null | undefined): boolean => seen !== '1';
export const cameraTipsRoute = (seen: string | null | undefined): '/camera-tips' | '/(tabs)' => (shouldShowCameraTips(seen) ? '/camera-tips' : '/(tabs)');

/** The page: fitted to the screen, the fake status bar hidden (its room kept), animations held until final, the two buttons wired. */
export const CAMERA_TIPS_BEFORE_JS = String.raw`(function(){
  function add(){
    if (document.getElementById('__tips_css')) return;
    var h = document.head || document.documentElement; if (!h) return;
    var s = document.createElement('style'); s.id = '__tips_css';
    s.textContent = 'html:not([data-go]) *{animation-play-state:paused!important;} html:not([data-go]) body{visibility:hidden!important;} html,body{margin:0!important;} body{display:block!important;min-height:0!important;overflow:hidden!important;}';
    h.appendChild(s);
  }
  add();
  try { new MutationObserver(add).observe(document, { childList: true }); } catch (e) {}
})(); true;`;

export const CAMERA_TIPS_AFTER_JS = String.raw`(function(){
  function post(m){ try { window.ReactNativeWebView.postMessage(m); } catch (e) {} }
  var done = false;
  function apply(){
    var box = document.body && document.body.firstElementChild; if (!box) return false;
    var vh = window.innerHeight, vw = window.innerWidth; if (!vh) return false;
    var S = vh / 844;
    box.style.setProperty('transform-origin', 'top left', 'important');
    box.style.setProperty('transform', 'scale(' + S + ')', 'important');
    box.style.setProperty('margin-left', Math.round((vw - 390 * S) / 2 * 100) / 100 + 'px', 'important');
    // the design's fake status bar (9:41) is hidden, but keeps its room
    var ds = box.querySelectorAll('div');
    for (var i = 0; i < ds.length; i++) { if (!ds[i].children.length && (ds[i].textContent || '').trim() === '9:41') { ds[i].parentElement.style.setProperty('visibility', 'hidden', 'important'); break; } }
    return !!box.querySelector('a[aria-label="Back"]');
  }
  document.addEventListener('click', function(ev){
    var t = ev.target; if (!t || !t.closest) return;
    var a = t.closest('a'); if (!a) return;
    ev.preventDefault();
    if (a.getAttribute('aria-label') === 'Back') post('tipsBack');
    else if ((a.textContent || '').trim() === 'Continue') post('tipsContinue');
  }, true);
  function go(){ if (done) return; done = true; document.documentElement.setAttribute('data-go', '1'); post('tipsShown'); }
  (function wait(n){ if (apply()) requestAnimationFrame(function(){ requestAnimationFrame(go); }); else if (n > 60) go(); else setTimeout(function(){ wait(n + 1); }, 25); })(0);
  window.addEventListener('resize', apply);
})(); true;`;
