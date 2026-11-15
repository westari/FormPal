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
  // ~14 small stars around the flame. Each fades in and out on its own timing and, every time it fades out, comes back somewhere else.
  var STAR = 'M12 0c.9 6.6 4.4 10.4 12 12-7.6 1.6-11.1 5.4-12 12-.9-6.6-4.4-10.4-12-12 7.6-1.6 11.1-5.4 12-12Z';
  var COLORS = ['#ffd36b', '#ffb347', '#ff9a3c', '#ffe39a', '#ffc15a'];
  var N_STARS = 14;
  function spot(size){
    // inside the area around the flame (box 170 x 192) but never over the flame itself (an ellipse around its centre)
    for (var t = 0; t < 60; t++) {
      var x = -78 + Math.random() * 326, y = -64 + Math.random() * 252;
      var dx = (x + size / 2 - 85) / 88, dy = (y + size / 2 - 104) / 104;
      if (dx * dx + dy * dy > 1) return [x, y];
    }
    return [-60, 20];
  }
  function buildStars(box){
    if (box.querySelector('[data-sk-stars]')) return;
    if (!document.getElementById('sk-stars-css')) {
      var st = document.createElement('style'); st.id = 'sk-stars-css';
      st.textContent = '@keyframes sk-star { 0% { opacity: 0; transform: scale(0.4) rotate(0deg); } 50% { opacity: var(--peak); transform: scale(1) rotate(14deg); } 100% { opacity: 0; transform: scale(0.4) rotate(0deg); } }';
      document.head.appendChild(st);
    }
    var wrap = document.createElement('div');
    wrap.setAttribute('data-sk-stars', '1');
    wrap.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;';
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (var i = 0; i < N_STARS; i++) {
      var size = 7 + Math.round(Math.random() * 9), p = spot(size), dur = 2.6 + Math.random() * 2.2;
      var el = document.createElement('div');
      el.setAttribute('data-sk-star', '1');
      el.style.cssText = 'position:absolute;line-height:0;left:' + p[0].toFixed(1) + 'px;top:' + p[1].toFixed(1) + 'px;width:' + size + 'px;height:' + size + 'px;--peak:' + (0.55 + Math.random() * 0.4).toFixed(2) + ';opacity:0;';
      el.innerHTML = '<svg width="100%" height="100%" viewBox="0 0 24 24"><path d="' + STAR + '" fill="' + COLORS[i % COLORS.length] + '"></path></svg>';
      // staggered from the very first frame (a negative delay starts each star part-way through its own cycle)
      if (!still) el.style.setProperty('animation', 'sk-star ' + dur.toFixed(2) + 's ease-in-out ' + (-Math.random() * dur).toFixed(2) + 's infinite', 'important');
      else el.style.setProperty('opacity', '0.5');
      el.addEventListener('animationiteration', function (ev) { var t = ev.currentTarget, sz = parseFloat(t.style.width) || 10, q = spot(sz); t.style.left = q[0].toFixed(1) + 'px'; t.style.top = q[1].toFixed(1) + 'px'; });
      wrap.appendChild(el);
    }
    box.appendChild(wrap);
  }
  function apply(){
    var num = q('div[style*="font-size: 54px"]'), head = q('div[style*="font-size: 29px"]'), sub = q('div[style*="font-size: 16px"]');
    var circles = [].slice.call(document.querySelectorAll('#dc-root div[style*="width: 30px"][style*="height: 30px"]'));
    var masks = [].slice.call(document.querySelectorAll('#dc-root div[style*="mask"]'));
    if (!num || !head || !sub || circles.length < 7 || masks.length < 2) return false;
    num.style.setProperty('display', 'none', 'important'); // the design's own white number sat on the flame like a sticker: replaced by the one below
    flame(masks[0], 'sf-out', '#ffd36b', '#ff9a3c', '#ff5a1f');
    flame(masks[1], 'sf-in', '#fff6d6', null, '#ffe39a');
    masks[0].setAttribute('data-vector-flame', 'out'); masks[1].setAttribute('data-vector-flame', 'in');
    // The fire does NOT move. The page-fit code switches every animation inside the page off (#dc-root * { animation: none !important });
    // the design's own sparkles and rising embers are hidden, and a field of small stars is drawn around the flame instead.
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
      c.setAttribute('data-streak-day', on ? '1' : '0');
      c.style.setProperty('background', on ? 'linear-gradient(180deg, #ffa24a 0%, #ff6a2b 100%)' : '#f1f1f4', 'important');
      c.style.setProperty('box-shadow', 'none', 'important');
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
      try { (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function(){ waitScale(0); }, function(){ waitScale(0); }); } catch (e) { waitScale(0); }
    }
    return true;
  }
  if (!apply()) { var n = 0, iv = setInterval(function(){ if (apply() || ++n > 80) clearInterval(iv); }, 40); }
})(); true;`;
}
