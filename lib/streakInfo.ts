/**
 * lib/streakInfo.ts
 *
 * Everything the streak page (app/streak-screen.tsx) shows, from the REAL sessions: the streak number (the same
 * calcStreak() Home and Train use), whether today is done, which days of this Mon..Sun week are streak days, and words
 * that match all of that (the design's own text always said "Your streak starts today", whatever the streak was).
 * Plus the page-side code that writes it into streak.html (the design file itself is never edited).
 */
import { calcStreak, workoutSessions, type SessionEntry } from './sessionLog';
import { FLAME_PATH, FLAME_VIEWBOX } from './streakFlame';

export interface StreakInfo {
  count: number;
  trainedToday: boolean;
  /** Mon..Sun of this week: true on every day that is part of the current streak */
  week: boolean[];
  todayIdx: number;
  headline: string;
  sub: string;
}

const dayKey = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

/** `passedCount`: the streak the workout flow already worked out (the session may not be on disk yet). Only ever raises the count. */
export function streakInfo(all: SessionEntry[], now: number = Date.now(), passedCount = 0): StreakInfo {
  const sessions = all.filter(e => e.kind !== 'practice');   // practice form checks never count toward a streak
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const has = new Set(workoutSessions(sessions).map(s => dayKey(new Date(s.ts))));
  let count = calcStreak(sessions, now);
  let trainedToday = has.has(dayKey(today));
  if (passedCount > count) { count = passedCount; trainedToday = true; }
  // the streak's days, walking back from today (or from yesterday while today is still to do)
  const days = new Set<number>();
  const d = new Date(today); if (!trainedToday) d.setDate(d.getDate() - 1);
  for (let i = 0; i < count; i++) { days.add(dayKey(d)); d.setDate(d.getDate() - 1); }
  const todayIdx = (today.getDay() + 6) % 7; // Monday = 0
  const week: boolean[] = [];
  for (let i = 0; i < 7; i++) { const x = new Date(today); x.setDate(x.getDate() - todayIdx + i); week.push(days.has(dayKey(x))); }
  let headline: string, sub: string;
  if (count <= 0) { headline = 'No streak yet'; sub = 'Train today to start your streak.'; }
  else if (!trainedToday) { headline = `${count} day streak`; sub = 'Train today to keep it going.'; }
  else if (count === 1) { headline = 'Day 1 streak!'; sub = 'You started your streak today. Train tomorrow to keep it going.'; }
  else { headline = `Day ${count} streak!`; sub = `${count} days in a row. Train tomorrow to keep the fire going.`; }
  return { count, trainedToday, week, todayIdx, headline, sub };
}

/** Page-side: the flame (vector, still, the streak number inside it, a field of fading stars around it), headline, sub line and the week row (an orange circle with a white check on every streak day).
 *  window.__streakApplied becomes true the moment everything is in place, so the screen can reveal the page already correct. */
export function streakPageJs(info: StreakInfo): string {
  return `(function(){
  var I = ${JSON.stringify(info)};
  var FLAME = ${JSON.stringify(FLAME_PATH)}, VB = ${JSON.stringify(FLAME_VIEWBOX)};
  function q(sel){ return document.querySelector('#dc-root ' + sel); }
  function flame(el, id, c0, c1, c2){
    if (el.hasAttribute('data-vector-flame')) return;
    el.setAttribute('data-vector-flame', '1');
    el.style.setProperty('-webkit-mask', 'none', 'important'); el.style.setProperty('mask', 'none', 'important');
    el.style.setProperty('background', 'none', 'important');
    el.innerHTML = '<svg width="100%" height="100%" viewBox="' + VB + '" preserveAspectRatio="xMidYMid meet" style="display:block;overflow:visible" shape-rendering="geometricPrecision">'
      + '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c0 + '"/>' + (c1 ? '<stop offset="0.45" stop-color="' + c1 + '"/>' : '') + '<stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>'
      + '<path d="' + FLAME + '" fill="url(#' + id + ')"/></svg>';
  }
  // Round 12: the sparkles have FIXED, balanced places (they were random, so they bunched up or sat in odd spots) and they stay UPRIGHT
  // (they used to tilt 14 degrees, which read as sideways). Three on each side of the flame, mirrored: a small one high, a big one at the
  // middle, a mid one low (box space: the flame's box is 170 x 192, its middle at 85, 104). Each only fades and gently grows in place,
  // on its own timing, so the field twinkles without anything moving around.
  var STAR = 'M12 0c.9 6.6 4.4 10.4 12 12-7.6 1.6-11.1 5.4-12 12-.9-6.6-4.4-10.4-12-12 7.6-1.6 11.1-5.4 12-12Z';
  var COLORS = ['#ffd36b', '#ffb347', '#ff9a3c', '#ffe39a', '#ffc15a', '#ffb347'];
  // [centre x, centre y, size, cycle seconds, start offset seconds]
  var SPOTS = [[-22, 18, 22, 3.6, 0.0], [-48, 98, 32, 4.4, 1.6], [-20, 176, 26, 4.0, 3.0],
               [192, 24, 24, 3.8, 2.2], [218, 104, 30, 4.6, 0.8], [190, 170, 22, 3.4, 2.8]];
  function buildStars(box){
    if (box.querySelector('[data-sk-stars]')) return;
    if (!document.getElementById('sk-stars-css')) {
      var st = document.createElement('style'); st.id = 'sk-stars-css';
      st.textContent = '@keyframes sk-star { 0%, 100% { opacity: 0; transform: scale(0.55); } 50% { opacity: var(--peak); transform: scale(1); } }';
      document.head.appendChild(st);
    }
    var wrap = document.createElement('div');
    wrap.setAttribute('data-sk-stars', '1');
    wrap.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;';
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (var i = 0; i < SPOTS.length; i++) {
      var sp = SPOTS[i], size = sp[2];
      var el = document.createElement('div');
      el.setAttribute('data-sk-star', '1');
      el.style.cssText = 'position:absolute;line-height:0;left:' + (sp[0] - size / 2) + 'px;top:' + (sp[1] - size / 2) + 'px;width:' + size + 'px;height:' + size + 'px;--peak:' + (i % 2 ? 0.8 : 0.95) + ';opacity:0;will-change:opacity,transform;';
      el.innerHTML = '<svg width="100%" height="100%" viewBox="0 0 24 24"><path d="' + STAR + '" fill="' + COLORS[i % COLORS.length] + '"></path></svg>';
      // staggered from the very first frame (a negative delay starts each star part-way through its own cycle)
      if (!still) el.style.setProperty('animation', 'sk-star ' + sp[3] + 's ease-in-out ' + (-sp[4]) + 's infinite', 'important');
      else el.style.setProperty('opacity', '0.6');
      wrap.appendChild(el);
    }
    box.appendChild(wrap);
  }
  function apply(){
    var num = q('div[style*="font-size: 54px"]'), head = q('div[style*="font-size: 29px"]'), sub = q('div[style*="font-size: 16px"]');
    var circles = [].slice.call(document.querySelectorAll('#dc-root div[style*="width: 30px"][style*="height: 30px"]')).filter(function (c) { return !c.closest('[data-sk-stars]'); }); // (a 30px sparkle is not a week circle)
    var masks = [].slice.call(document.querySelectorAll('#dc-root div[style*="mask"]'));
    if (!num || !head || !sub || circles.length < 7 || masks.length < 2) return false;
    num.style.setProperty('display', 'none', 'important'); // the design's own white number sat on the flame like a sticker: replaced by the one below
    flame(masks[0], 'sf-out', '#ffd36b', '#ff9a3c', '#ff5a1f');
    flame(masks[1], 'sf-in', '#fff6d6', null, '#ffe39a');
    masks[0].setAttribute('data-vector-flame', 'out'); masks[1].setAttribute('data-vector-flame', 'in');
    // The page-fit code switches every animation inside the page off (#dc-root * { animation: none !important }), so what moves here is put
    // back on purpose: the flame breathes very slightly (a barely visible sway), and a few big sparkles fade in and out around it.
    // The design's own sparkles and rising embers are hidden.
    if (!document.getElementById('sk-live')) {
      var lv = document.createElement('style'); lv.id = 'sk-live';
      lv.textContent = '@keyframes sk-live-out { 0%,100% { transform: scale(1,1) skewX(0deg); } 50% { transform: scale(1.012,1.02) skewX(0.5deg); } }'
        + '@keyframes sk-live-in { 0%,100% { transform: scale(1,1) skewX(0deg); } 50% { transform: scale(0.992,1.024) skewX(-0.7deg); } }';
      document.head.appendChild(lv);
    }
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!calm) {
      masks[0].style.setProperty('transform-origin', '50% 92%'); masks[0].style.setProperty('animation', 'sk-live-out 4.6s ease-in-out infinite', 'important');
      masks[1].style.setProperty('transform-origin', '50% 96%'); masks[1].style.setProperty('animation', 'sk-live-in 3.4s ease-in-out infinite', 'important');
    }
    masks[0].style.setProperty('filter', 'none', 'important'); // no heavy shadow under the flame: a cleaner look
    var box = masks[0].parentElement && masks[0].parentElement.parentElement;      // the 170 x 192 box the flame sits in
    var outer = box && box.parentElement;                                           // the 192 x 214 box with the soft glow
    if (outer) {
      for (var oi = 0; oi < outer.children.length; oi++) {
        var oc = outer.children[oi];
        if (oc === box) continue;
        if (!oc.hasAttribute('data-sk-glow')) { oc.setAttribute('data-sk-glow', '1'); oc.style.setProperty('opacity', '0.55', 'important'); }
      }
    }
    if (box) {
      for (var bi = 0; bi < box.children.length; bi++) {
        var bc = box.children[bi];
        if (bc === masks[0].parentElement || bc.hasAttribute('data-sk-stars') || bc.hasAttribute('data-streak-num')) continue;
        bc.style.setProperty('display', 'none', 'important'); // the 3 big sparkles and the embers
      }
      buildStars(box);
    }
    // the streak number sits INSIDE the cream belly of the flame, deep orange on cream (readable), and moves with the inner flame
    var digits = String(I.count).length, fsz = digits <= 2 ? 46 : digits === 3 ? 34 : 26;
    var nEl = masks[1].querySelector('[data-streak-num]');
    if (!nEl) {
      nEl = document.createElement('div'); nEl.setAttribute('data-streak-num', '1');
      masks[1].appendChild(nEl);
    }
    nEl.style.cssText = 'position:absolute;left:0;right:0;top:63%;transform:translate(-4px,-50%);text-align:center;font-weight:800;line-height:1;letter-spacing:-1.5px;color:#e8590c;font-size:' + fsz + 'px;pointer-events:none;';
    if (nEl.textContent !== String(I.count)) nEl.textContent = String(I.count);
    head.textContent = I.headline; sub.textContent = I.sub;
    var CHECK = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M5 12.6 9.8 17.4 19 7.4" stroke="#ffffff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
    for (var i = 0; i < 7; i++) {
      var c = circles[i], on = !!I.week[i], label = c.previousElementSibling;
      c.setAttribute('data-streak-day', on ? '1' : '0'); c.setAttribute('data-streak-idx', String(i));
      c.style.setProperty('background', on ? 'linear-gradient(180deg, #ffa24a 0%, #ff6a2b 100%)' : '#f1f1f4', 'important');
      // (round 13) a clearer week row: today, not trained yet, is an empty circle with an orange outline (where today's check will go)
      c.style.setProperty('box-shadow', !on && i === I.todayIdx ? 'inset 0 0 0 2px #ffb27a' : 'none', 'important');
      c.innerHTML = on ? CHECK : '';
      if (label) label.style.setProperty('color', i === I.todayIdx ? '#ff6a2b' : on ? '#ff8a3c' : '#9a9aa2', 'important');
    }
    // cleaner: the week row is a flat white pill with a hairline (no heavy shadow), and the Continue button's shadow is light
    var pill = circles[0].parentElement && circles[0].parentElement.parentElement;
    if (pill) pill.style.setProperty('box-shadow', '0 0 0 1px rgba(17,17,20,0.07)', 'important');
    var btns = document.querySelectorAll('#dc-root a, #dc-root div');
    for (var bi2 = 0; bi2 < btns.length; bi2++) {
      var bt = btns[bi2];
      if (bt.children.length <= 1 && (bt.textContent || '').trim() === 'Continue') { var holder = bt.closest('a') || bt; holder.style.setProperty('box-shadow', '0 8px 18px -12px rgba(17,17,20,0.35)', 'important'); break; }
    }
    if (!window.__streakSettling) {
      window.__streakSettling = true;
      // Revealed only when the very first frame is final: the page is scaled to the screen, the fonts are in (the number and headline do
      // not change shape after they show) and two frames have been drawn.
      var done = function(){ requestAnimationFrame(function(){ requestAnimationFrame(function(){ window.__streakApplied = true; }); }); };
      var waitScale = function(n){ if (window.__dcCanvasScale || n > 40) done(); else setTimeout(function(){ waitScale(n + 1); }, 25); };
      try {
        // the fonts are only fetched when text that uses them is laid out: load the three weights this page uses explicitly, then wait
        var F = '"Plus Jakarta Sans"';
        var loads = document.fonts && document.fonts.load ? [document.fonts.load('800 29px ' + F), document.fonts.load('500 16px ' + F), document.fonts.load('700 11px ' + F), document.fonts.load('800 46px ' + F)] : [];
        Promise.all(loads).then(function(){ return document.fonts.ready; }).then(function(){ waitScale(0); }, function(){ waitScale(0); });
      } catch (e) { waitScale(0); }
    }
    return true;
  }
  // ── Round 13: the page comes ALIVE the moment it is shown (the app calls window.__skPlay() as it reveals the page). Everything is already in its
  // final state before that (so a page that is never played is still right); playing briefly puts the number and the streak days back and
  // animates them in:
  //   0ms     the flame ignites: grows from 72% with a small overshoot (650ms), then keeps its slow sway; the soft glow behind it starts breathing
  //   250ms   the number counts up to the streak (from yesterday's number when today was just trained: the day you earned; else from 0), then pops
  //   480ms+  the streak days in the week row fill in one by one (orange, a pop, the check draws itself); today's gets one soft ring pulse
  //   end     one success haptic with the number's pop
  // All motion is transform/opacity only (cheap), and nothing moves for people who turned on Reduce Motion.
  window.__skPlay = function(){
    if (window.__skPlayed) return; window.__skPlayed = true;
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (calm) return;
    function post(m){ try { window.ReactNativeWebView.postMessage(m); } catch (e) {} }
    if (!document.getElementById('sk-play-css')) {
      var cs = document.createElement('style'); cs.id = 'sk-play-css';
      cs.textContent = '@keyframes sk-ignite { 0% { opacity: 0.4; transform: scale(0.72); } 55% { opacity: 1; transform: scale(1.06); } 100% { opacity: 1; transform: scale(1); } }'
        + '@keyframes sk-pop { 0% { scale: 1; } 40% { scale: 1.22; } 100% { scale: 1; } }'
        + '@keyframes sk-daypop { 0% { scale: 0.6; } 55% { scale: 1.14; } 100% { scale: 1; } }'
        + '@keyframes sk-draw { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }'
        + '@keyframes sk-ringpulse { 0% { box-shadow: 0 0 0 0 rgba(255,106,43,0.45); } 100% { box-shadow: 0 0 0 12px rgba(255,106,43,0); } }'
        + '@keyframes sk-breathe { 0%,100% { opacity: 0.45; transform: scale(0.96); } 50% { opacity: 0.75; transform: scale(1.04); } }';
      document.head.appendChild(cs);
    }
    var masks = [].slice.call(document.querySelectorAll('#dc-root div[style*="mask"], #dc-root [data-vector-flame]'));
    var out = document.querySelector('[data-vector-flame="out"]');
    var flameWrap = out && out.parentElement;
    if (flameWrap) { flameWrap.style.setProperty('transform-origin', '50% 85%'); flameWrap.style.setProperty('animation', 'sk-ignite 650ms cubic-bezier(.2,.9,.3,1.15) both', 'important'); }
    var glows = document.querySelectorAll('[data-sk-glow]');
    for (var g = 0; g < glows.length; g++) glows[g].style.setProperty('animation', 'sk-breathe 3.2s ease-in-out infinite', 'important');
    // the number
    var nEl = document.querySelector('[data-streak-num]');
    var to = I.count, from = to <= 0 ? 0 : I.trainedToday ? to - 1 : 0;
    if (nEl && to > 0) {
      nEl.textContent = String(from);
      var dur = to - from <= 1 ? 420 : Math.min(900, 380 + (to - from) * 40), t0 = 0;
      setTimeout(function(){
        var step = function(now){
          if (!t0) t0 = now;
          var u = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - u, 3), v = Math.round(from + (to - from) * e);
          if (nEl.textContent !== String(v)) nEl.textContent = String(v);
          if (u < 1) requestAnimationFrame(step);
          else { nEl.style.setProperty('animation', 'sk-pop 420ms cubic-bezier(.3,1.4,.5,1) both', 'important'); post('haptic'); }
        };
        requestAnimationFrame(step);
      }, 250);
    }
    // the week row
    var circles = [].slice.call(document.querySelectorAll('[data-streak-day="1"]'));
    var keep = circles.map(function(c){ return { bg: c.style.getPropertyValue('background'), html: c.innerHTML }; });
    circles.forEach(function(c){ c.style.setProperty('background', '#f1f1f4', 'important'); c.innerHTML = ''; });
    circles.forEach(function(c, i){
      setTimeout(function(){
        c.style.setProperty('background', keep[i].bg, 'important');
        c.innerHTML = keep[i].html;
        var path = c.querySelector('path'); if (path) { path.style.strokeDasharray = '24'; path.style.setProperty('animation', 'sk-draw 300ms ease-out 90ms both', 'important'); }
        var isToday = c.getAttribute('data-streak-idx') === String(I.todayIdx);
        c.style.setProperty('animation', 'sk-daypop 420ms cubic-bezier(.3,1.4,.5,1) both' + (isToday ? ', sk-ringpulse 900ms ease-out 380ms 1' : ''), 'important');
      }, 480 + i * 90);
    });
  };
  if (!apply()) { var n = 0, iv = setInterval(function(){ if (apply() || ++n > 80) clearInterval(iv); }, 40); }
})(); true;`;
}
