/**
 * lib/streakInfo.ts
 *
 * Everything the streak page (app/streak-screen.tsx) shows, from the REAL sessions: the streak number (the same
 * calcStreak() Home and Train use), whether today is done, which days of this Mon..Sun week are streak days, and words
 * that match all of that (the design's own text always said "Your streak starts today", whatever the streak was).
 * Plus the page-side code that writes it into streak.html (the design file itself is never edited).
 */
import { calcStreak, type SessionEntry } from './sessionLog';

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
export function streakInfo(sessions: SessionEntry[], now: number = Date.now(), passedCount = 0): StreakInfo {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const has = new Set(sessions.map(s => dayKey(new Date(s.ts))));
  let count = calcStreak(sessions);
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

/** Page-side: flame number, headline, sub line and the week row (an orange circle with a white check on every streak day). */
export function streakPageJs(info: StreakInfo): string {
  return `(function(){
  var I = ${JSON.stringify(info)};
  function q(sel){ return document.querySelector('#dc-root ' + sel); }
  function apply(){
    var num = q('div[style*="font-size: 54px"]'), head = q('div[style*="font-size: 29px"]'), sub = q('div[style*="font-size: 16px"]');
    var circles = [].slice.call(document.querySelectorAll('#dc-root div[style*="width: 30px"][style*="height: 30px"]'));
    if (!num || !head || !sub || circles.length < 7) return false;
    num.textContent = String(I.count); head.textContent = I.headline; sub.textContent = I.sub;
    var CHECK = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M5 12.6 9.8 17.4 19 7.4" stroke="#ffffff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
    for (var i = 0; i < 7; i++) {
      var c = circles[i], on = !!I.week[i], label = c.previousElementSibling;
      c.setAttribute('data-streak-day', on ? '1' : '0');
      c.style.setProperty('background', on ? 'linear-gradient(180deg, #ffa24a 0%, #ff6a2b 100%)' : '#f1f1f4', 'important');
      c.style.setProperty('box-shadow', on ? '0 4px 10px -3px rgba(255,106,43,0.55)' : 'none', 'important');
      c.innerHTML = on ? CHECK : '';
      if (label) label.style.setProperty('color', i === I.todayIdx ? '#ff6a2b' : on ? '#ff8a3c' : '#9a9aa2', 'important');
    }
    return true;
  }
  if (!apply()) [100, 300, 700, 1200].forEach(function(t){ setTimeout(apply, t); });
})(); true;`;
}
