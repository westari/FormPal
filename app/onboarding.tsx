import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView,
  Animated, PanResponder, Image, TextInput, Pressable, Easing, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Asset } from 'expo-asset';
import { SymbolView } from 'expo-symbols';
import { Picker } from '@react-native-picker/picker';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { WebView } from 'react-native-webview';
import Svg, { Path as SvgPath, Text as SvgText, Circle as SvgCircle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppBackground from '../components/AppBackground';
import PlanGrowthMoment from '../components/PlanGrowthMoment';
import { LiquidGlassButton } from '../components/LiquidGlass';
import { PUSHUP_ICON, PULLUP_ICON, SQUAT_ICON } from '../assets/onboarding/onbIcons';
import { FONT, W, Col, Elev } from '../constants/theme';

// Onboarding video clips — drop the real files in at these paths and flip
// the consts to require(...). null renders a plain black frame instead, so
// the flow is fully testable before the footage exists.
//   hero — the app catching a rep (green check / red x firing), first screen
//   demo — a single rep that doesn't count, shown before the math
const HERO_VIDEO: any = null; // require('../assets/onboarding/hero.mp4')
const DEMO_VIDEO: any = null; // require('../assets/onboarding/demo.mp4')

export const ONBOARDING_KEY = 'formpal_onboarding_complete';

// ── Custom answer-choice icons ──────────────────────────────────────────────
// From assets/icons — only used where a concept actually matches an answer
// choice. A few questions (sex, days-count, duration, trainingLocation's
// "Home"/"Mix of both", several equipment-machine options) have no matching
// icon in this set and keep their SF Symbol. assets/icons/streak.webp has
// "30 streak" baked into the image itself (literal text pixels) — not
// reusable as a generic icon, left out entirely.
const ICON = {
  heart: require('../assets/icons/heart.webp'), person: require('../assets/icons/person.webp'),
  muscle: require('../assets/icons/muscle.webp'), calm: require('../assets/icons/calm.webp'),
  days: require('../assets/icons/days.webp'), run: require('../assets/icons/run.webp'),
  gym: require('../assets/icons/gym.webp'), scale: require('../assets/icons/scale.webp'),
  camera: require('../assets/icons/camera.webp'), arm: require('../assets/icons/arm.webp'),
  allGood: require('../assets/icons/allgood.webp'), hip: require('../assets/icons/hip.webp'),
  wrist: require('../assets/icons/wrist.webp'), neck: require('../assets/icons/neck.webp'),
  shoulder: require('../assets/icons/shoulder.webp'), knee: require('../assets/icons/knee.webp'),
  notSure: require('../assets/icons/notsure.webp'), fire: require('../assets/icons/fire.webp'),
  scared: require('../assets/icons/scared.webp'), noResults: require('../assets/icons/progressquestion.webp'),
  date: require('../assets/icons/date.webp'), good: require('../assets/icons/good.webp'),
  bodyweight: require('../assets/icons/bodyweight.webp'), bench: require('../assets/icons/bench.webp'),
  pullupBar: require('../assets/icons/pullupbar.webp'), kettlebell: require('../assets/icons/kettlebell.webp'),
  bands: require('../assets/icons/bands.webp'), dumbbell: require('../assets/icons/dumbell.webp'),
  barbell: require('../assets/icons/barbellandplates.webp'), expertGym: require('../assets/icons/gymexpert.webp'),
  intermediateGym: require('../assets/icons/gymintermediate.webp'), someExpGym: require('../assets/icons/gymsomeexperience.webp'),
  beginnerGym: require('../assets/icons/gymbeginner.webp'), home: require('../assets/icons/home.webp'),
  female: require('../assets/icons/female.webp'), male: require('../assets/icons/male.webp'),
  mixOfBoth: require('../assets/icons/mixofboth.webp'), back: require('../assets/icons/back.webp'),
  squatMachine: require('../assets/icons/squatmachine.webp'), backMachine: require('../assets/icons/backmachine.webp'),
  chestMachine: require('../assets/icons/chestmachine.webp'), legMachine: require('../assets/icons/legmachine.webp'),
  cableMachine: require('../assets/icons/cablemachine.webp'),
  // trainDuration — one per option, ascending
  justStarting: require('../assets/icons/juststarting.webp'), lessThan6mo: require('../assets/icons/6months.webp'),
  sixTo12mo: require('../assets/icons/12months.webp'), oneToTwoYr: require('../assets/icons/1year.webp'),
  twoToFiveYr: require('../assets/icons/2years.webp'), fiveToTenYr: require('../assets/icons/5years.webp'),
  tenPlusYr: require('../assets/icons/10years.webp'),
  // cardioTypes
  running: require('../assets/icons/running.webp'), cycling: require('../assets/icons/cycling.webp'),
  swimming: require('../assets/icons/swimming.webp'), rowing: require('../assets/icons/rowing.webp'),
  hiit: require('../assets/icons/hiit.webp'), walking: require('../assets/icons/walking.webp'),
  sports: require('../assets/icons/sports.webp'),
  // startReason + successVision
  moreMuscle: require('../assets/icons/moremuscle.webp'), trainProperly: require('../assets/icons/trainproperly.webp'),
  getStronger: require('../assets/icons/getstronger.webp'), lookBetter: require('../assets/icons/lookbetter.webp'),
  seeingResults: require('../assets/icons/seeingreusults.webp'), betterForm: require('../assets/icons/betterform.webp'),
  backOnTrack: require('../assets/icons/backontrack.webp'), stayConsistentIcon: require('../assets/icons/stayconsistent.webp'),
  shirtOff: require('../assets/icons/shirtoff.webp'), leanerIcon: require('../assets/icons/leaner.webp'),
  // days 1-7
  oneDay: require('../assets/icons/1day.webp'), twoDays: require('../assets/icons/2days.webp'),
  threeDays: require('../assets/icons/3days.webp'), fourDays: require('../assets/icons/4days.webp'),
  fiveDays: require('../assets/icons/5days.webp'), sixDays: require('../assets/icons/6days.webp'),
  sevenDays: require('../assets/icons/7days.webp'),
  // duration
  fifteenMin: require('../assets/icons/15mins.webp'), thirtyMin: require('../assets/icons/30mins.webp'),
  fortyFiveMin: require('../assets/icons/45mins.webp'), sixtyMin: require('../assets/icons/60mins.webp'),
  seventyFiveMin: require('../assets/icons/75mins.webp'),
  // trainTime
  morning: require('../assets/icons/morning.webp'), afternoon: require('../assets/icons/afternoon.webp'),
  night: require('../assets/icons/night.webp'),
  // howHeard
  socialMedia: require('../assets/icons/socialmedia.webp'), shareLink: require('../assets/icons/sharelink.webp'),
  appStore: require('../assets/icons/appstore.webp'), search: require('../assets/icons/search.webp'),
  other: require('../assets/icons/other.webp'),
  // followPlan / formConfidence
  yes: require('../assets/icons/yes.webp'), no: require('../assets/icons/no.webp'),
  onAndOff: require('../assets/icons/onandoff.webp'),
  // trainingLocation bubbles — transparent-bg variants for the gradient art
  homeNoBg: require('../assets/icons/homenobg.webp'), gymNoBg: require('../assets/icons/gymnobg.webp'),
  mixNoBg: require('../assets/icons/homeandgymnobg.webp'),
  // notifications
  notifOn: require('../assets/icons/notison.webp'), notifOff: require('../assets/icons/notisoff.webp'),
} as const;

// ── Light theme palette ────────────────────────────────────────────────────────

const L = {
  bg:         Col.bg,
  card:       Col.card,
  border:     'rgba(17,24,39,0.06)',
  text:       Col.text,
  textSub:    Col.textSub,
  textDim:    Col.textDim,
  accent:     '#0A84FF',
  accentSoft: 'rgba(10,132,255,0.08)',
  btnDark:    '#0B1020',
  navBar:     'rgba(251,251,253,0.94)',
  iconBg:     '#F4F5F8',
};

// Split slider — warm amber for home, green for gym (no blue/purple)
const HOME_CLR = '#FF9F0A';
const GYM_CLR  = '#30D158';
const THUMB_SZ  = 30;
const TRACK_H   = 52;

const haptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
  if (Platform.OS !== 'web') void Haptics.impactAsync(style);
};

const AGE_OPTIONS = Array.from({ length: 73 }, (_, i) => String(i + 13));
const HEIGHT_OPTIONS: string[] = [];
for (let ft = 4; ft <= 6; ft++) {
  for (let inch = (ft === 4 ? 8 : 0); inch <= (ft === 6 ? 10 : 11); inch++) {
    HEIGHT_OPTIONS.push(`${ft}'${inch}"`);
  }
}

function Sym({ name, size, color }: { name: string; size: number; color: string }) {
  return <SymbolView name={name as any} size={size} tintColor={color} type="monochrome" style={{ width: size, height: size }} />;
}

// Every onboarding screen (welcome, each question, mypal intro, building,
// projection, payoff) used ScreenBackground's plain subtle gradient — asked
// to switch to the same bright colorful-blob background recap.tsx/the
// after-workout screen/the plus tab already use (AppBackground), for visual
// consistency across the app's light-theme screens. AppBackground itself is
// an absolute-fill layer, not a flex:1 wrapping container the way
// ScreenBackground was, so this local wrapper keeps every call site below
// (still just `<OnboardingBackground>children</OnboardingBackground>`)
// unchanged. Local to this file, not a change to ScreenBackground.tsx itself
// — that component is still used as-is by ~9 other screens app-wide, which
// weren't part of this ask.
function OnboardingBackground({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      <AppBackground />
      {children}
    </View>
  );
}

// ── Rank WebView screens ─────────────────────────────────────────────────
// The rank wheel intro, strength assessment and rank reveal are the exact
// Claude-designed HTML artifacts (assets/onboarding/*.html), rendered
// verbatim in a transparent WebView over AppBackground. Inject script +
// per-screen icon wiring copied over from onboarding-test unchanged.
const ONBOARDING_WEB_INJECT = `
(function () {
  function post(m) { try { window.ReactNativeWebView.postMessage(m); } catch (e) {} }
  function btnFor(el) {
    for (var i = 0; el && i < 6; i++, el = el.parentElement) {
      var role = el.getAttribute && el.getAttribute('role');
      if (role === 'button' || el.tagName === 'BUTTON') return el;
    }
    return null;
  }
  document.addEventListener('pointerdown', function (e) { if (btnFor(e.target)) post('__tap'); }, true);
  document.addEventListener('touchstart', function (e) { if (btnFor(e.target)) post('__tap'); }, true);
  document.addEventListener('click', function (e) {
    var b = btnFor(e.target);
    if (!b) return;
    var oc = b.getAttribute('sc-camel-on-click') || '';
    if (b.getAttribute('data-glass') === 'panel' || /pick/i.test(oc)) return;
    var t = (b.textContent || '').replace(/\\s+/g, ' ').trim();
    if (/^Skip for now/i.test(t)) return post('skip');
    if (b.getAttribute('data-cta') !== null || /^Start 5 /i.test(t)) {
      var sel = document.querySelector('[data-glass="panel"][data-selected="1"]');
      var st = (sel && sel.textContent || '') + ' ' + t;
      return post(/squat/i.test(st) ? 'squat' : 'pushup');
    }
    if (/^(Start at Bronze|Continue|Start climbing|Find my rank|Next|Done|See my plan|Unlock my full plan|Unlock my plan|See plan|Start my 3-day|Start my free trial|Start free trial|Start my 3\\u2011day)\\b/i.test(t)) return post('advance');
  }, true);

  var CARD = 'div[style*="width: 472px"][style*="height: 1024px"]';
  var WRAP = 'div[style*="min-height: 100vh"][style*="padding: 40px 24px"]';
  var BAR  = 'div[style*="justify-content: space-between"][style*="padding: 22px 34px 0"]';
  var CSS = ''
    + 'html{margin:0!important;padding:0!important;background:transparent!important;overflow:hidden!important;height:100%!important;width:100%!important;}'
    + 'body{margin:0!important;padding:0!important;background:transparent!important;overflow:hidden!important;}'
    + WRAP + '{min-height:1024px!important;height:1024px!important;padding:0!important;display:block!important;background:transparent!important;overflow:hidden!important;}'
    + CARD + '{width:472px!important;height:1024px!important;border-radius:0!important;box-shadow:none!important;margin:0!important;background:transparent!important;}'
    + BAR + '{display:none!important;}'
    + 'div[style*="gap: 18px"][style*="padding: 26px 34px 0"]{display:none!important;}'
    + 'div[style*="width: 140px"][style*="height: 5px"]{display:none!important;}'
    + 'div[style*="filter: blur(52px)"]{display:none!important;}'
    + 'div[role="button"][style*="height: 62px"][style*="border-radius: 31px"]:not([data-glass="pill"]){background:#007AFF!important;opacity:1!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:0 14px 34px rgba(0,122,255,0.42)!important;}'
    + 'div[style*="font-size: 34px"][style*="letter-spacing: -0.6px"]{font-size:39px!important;line-height:44px!important;}'
    + 'svg{will-change:transform;}';

  function ensure() {
    if (document.getElementById('__rn_css')) return;
    var s = document.createElement('style');
    s.id = '__rn_css';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function wireScrollHaptics() {
    var scrollers = document.querySelectorAll('[data-rank-track],[style*="scroll-snap-type"]');
    for (var s = 0; s < scrollers.length; s++) {
      (function (sc) {
        if (sc.__rnHap) return;
        sc.__rnHap = 1;
        var last = -1;
        sc.addEventListener('scroll', function () {
          var kids = sc.children;
          if (!kids.length) return;
          var horiz = sc.scrollWidth - sc.clientWidth > sc.scrollHeight - sc.clientHeight;
          var mid = horiz ? sc.scrollLeft + sc.clientWidth / 2 : sc.scrollTop + sc.clientHeight / 2;
          var best = 0, bd = 1e9;
          for (var i = 0; i < kids.length; i++) {
            var k = kids[i];
            var c = horiz ? k.offsetLeft + k.offsetWidth / 2 : k.offsetTop + k.offsetHeight / 2;
            var d = Math.abs(c - mid);
            if (d < bd) { bd = d; best = i; }
          }
          if (best !== last) { last = best; post('__tick'); }
        }, { passive: true });
      })(scrollers[s]);
    }
  }
  function fit() {
    ensure();
    wireScrollHaptics();
    var vw = window.innerWidth, vh = window.innerHeight;
    if (!vw || !vh) return;
    var S = Math.min(vw / 472, vh / 1024);
    var b = document.body;
    if (!b || b.__rnFit === S) return;
    b.__rnFit = S;
    b.style.setProperty('width', '472px', 'important');
    b.style.setProperty('height', '1024px', 'important');
    b.style.setProperty('position', 'absolute', 'important');
    b.style.setProperty('top', '0', 'important');
    b.style.setProperty('left', Math.round((vw - 472 * S) / 2) + 'px', 'important');
    b.style.setProperty('transform', 'scale(' + S + ')', 'important');
    b.style.setProperty('transform-origin', 'top left', 'important');
  }
  fit();
  var deb;
  var obs = new MutationObserver(function () { clearTimeout(deb); deb = setTimeout(fit, 120); });
  obs.observe(document, { childList: true, subtree: true });
  window.addEventListener('resize', fit);
  [30, 120, 320, 700].forEach(function (d) { setTimeout(fit, d); });
  setTimeout(function () { obs.disconnect(); }, 1500);
  true;
})();
`;

const STRENGTH_ICONS_JS = `
(function () {
  var MAP = { 'Push-ups': ${JSON.stringify(PUSHUP_ICON)}, 'Pull-ups': ${JSON.stringify(PULLUP_ICON)}, 'Squats': ${JSON.stringify(SQUAT_ICON)} };
  function apply() {
    var labels = document.querySelectorAll('div[style*="text-align: center"][style*="font-size: 15px"]');
    var hit = 0;
    for (var i = 0; i < labels.length; i++) {
      var el = labels[i];
      var k = (el.textContent || '').trim();
      if (!MAP[k]) continue;
      if (el.__rnIcon) { hit++; continue; }
      el.__rnIcon = 1;
      el.style.display = 'flex'; el.style.flexDirection = 'column'; el.style.alignItems = 'center';
      var img = document.createElement('img');
      img.src = MAP[k];
      img.style.cssText = 'width:36px;height:36px;object-fit:contain;display:block;margin:0 0 6px';
      el.insertBefore(img, el.firstChild);
      hit++;
    }
    return hit >= 3;
  }
  if (!apply()) [150, 400, 800, 1600, 3000].forEach(function (d) { setTimeout(apply, d); });
})();
`;

const ONB_HTML = {
  // Redesigned rank run + the wasted-muscle graph (Claude Design artboards).
  rankWheel:          require('../assets/rankwheel2.html'),
  strengthAssessment: require('../assets/strengthassessment2.html'),
  rankReveal:         require('../assets/rankreveal2.html'),
  cinematicGraph:     require('../assets/cinematicgraph.html'),
  // The four pre-paywall pages. They render with their built-in default
  // copy; planReady + cinematicGraph + rankReveal get slots rewritten from
  // the user's answers (see the *Inject helpers).
  generatePlan:       require('../assets/generateplan.html'),
  planReady:          require('../assets/planready.html'),
  trialTimeline:      require('../assets/trialtimeline.html'),
  paywall:            require('../assets/paywall.html'),
} as const;

// planready.html shows weight / height / age / experience / a goal date in
// <span class="sc-interp"> slots. These pages have no prop-injection channel
// when run standalone, so — same approach as STRENGTH_ICONS_JS — we rewrite
// the rendered spans in place, matched by the shape of their default text.
function planReadyInject(a: Record<string, any>): string {
  const w  = typeof a.weight === 'number' ? `${Math.round(a.weight)} lb` : '';
  const h  = typeof a.height === 'string' ? a.height : '';
  const ag = a.age != null ? String(a.age) : '';
  const ex = typeof a.experience === 'string' ? a.experience : '';
  const gd = (() => {
    const d = new Date(Date.now() + 70 * 86400000); // ~10 weeks out
    const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${M[d.getMonth()]} ${d.getDate()}`;
  })();
  return `
(function(){
  var W=${JSON.stringify(w)}, H=${JSON.stringify(h)}, A=${JSON.stringify(ag)}, E=${JSON.stringify(ex)}, D=${JSON.stringify(gd)};
  function post(m){ try{ window.ReactNativeWebView.postMessage(m); }catch(e){} }
  function apply(){
    var s=document.querySelectorAll('span.sc-interp'), hit=0;
    for(var i=0;i<s.length;i++){
      var t=(s[i].textContent||'').trim();
      if(W && /(lb|kg)$/.test(t)){ s[i].textContent=W; hit++; }
      else if(H && t.indexOf('"')>=0 && t.indexOf("'")>=0){ s[i].textContent=H; hit++; }
      else if(A && /^[0-9]{1,3}$/.test(t)){ s[i].textContent=A; hit++; }
      else if(E && /^(Beginner|Some experience|Intermediate|Advanced)$/.test(t)){ s[i].textContent=E; hit++; }
      else if(D && /^[A-Z][a-z]{2} [0-9]{1,2}$/.test(t)){ s[i].textContent=D; hit++; }
    }
    return hit>=3;
  }
  if(!apply()) [200,500,1000,2000,3500,5000].forEach(function(d){ setTimeout(apply,d); });
})();
`;
}

const DURATION_YEARS: Record<string, number> = {
  'Just starting': 1, '1-6 months': 1, '6-12 months': 1,
  '1-2 years': 2, '2-5 years': 3, '5-10 years': 7, '10+ years': 12,
};

// cinematicgraph.html — the "two versions of you" wasted-muscle graph.
// Slots: "<n>" (years trained), "13,000 reps lost", "8 months of muscle gone".
function cinematicGraphInject(a: Record<string, any>): string {
  const m = computeWastedReps({ ...a, formGuess: getRealFormPct(a) });
  const years = DURATION_YEARS[(a.trainDuration as string) ?? ''] ?? 3;
  const wasted = m.wasted;
  const months = Math.max(2, Math.round(wasted / 1500));
  const pct = getRealFormPct(a);
  return `
(function(){
  var Y=${years}, RL=${JSON.stringify(wasted.toLocaleString() + ' reps lost')}, ML=${JSON.stringify(months + ' months of muscle gone')}, P=${pct};
  function apply(){
    var s=document.querySelectorAll('span.sc-interp'), hit=0;
    for(var i=0;i<s.length;i++){
      var t=(s[i].textContent||'').trim();
      if(/^[0-9]{1,2}$/.test(t)){ s[i].textContent=String(Y); hit++; }
      else if(/reps lost$/i.test(t)){ s[i].textContent=RL; hit++; }
      else if(/months of muscle gone$/i.test(t)){ s[i].textContent=ML; hit++; }
      else if(/^[0-9]{1,3}%$/.test(t)){ s[i].textContent=P+'%'; hit++; }
    }
    return hit>=2;
  }
  if(!apply()) [200,500,1000,2000,3500,5000].forEach(function(d){ setTimeout(apply,d); });
})();
`;
}

// rankreveal2.html — everyone starts at Bronze; the tier reflects how much
// they already know (experience). Default in the design is "Bronze II".
function rankRevealInject(a: Record<string, any>): string {
  const tier = ({ 'Beginner': 'I', 'Some experience': 'II', 'Intermediate': 'III', 'Advanced': 'IV' } as Record<string, string>)[a.experience as string] ?? 'II';
  const rank = `Bronze ${tier}`;
  return `
(function(){
  var R=${JSON.stringify(rank)};
  function apply(){
    var hit=0, all=document.querySelectorAll('span,div');
    for(var i=0;i<all.length;i++){
      var el=all[i]; if(el.children.length) continue;
      var t=(el.textContent||'').trim();
      if(/^(Bronze|Silver|Gold|Platinum|Diamond)\\s+(I|II|III|IV|V)$/.test(t)){ el.textContent=R; hit++; }
    }
    return hit>=1;
  }
  if(!apply()) [200,500,1000,2000,3500,5000,7000].forEach(function(d){ setTimeout(apply,d); });
})();
`;
}

// The 4 pre-paywall pages are Claude-Design artboards — FIXED 390-wide
// canvases. Scale #dc-root to the WebView width (never up past 1×), pin it
// to the top, and let the browser scroll whatever overflows the viewport —
// so a design a bit taller than the screen just scrolls a little rather
// than being clipped or fighting the user. Also posts 'rendered' once the
// artboard has actually painted, so the fade-in doesn't happen over a
// still-unpacking page (the "jitter").
const DC_PAGE_KEYS: (keyof typeof ONB_HTML)[] = [
  'generatePlan', 'planReady', 'trialTimeline', 'paywall',
  // The redesigned rank + graph pages are the same 390-wide #dc-root format.
  'rankWheel', 'strengthAssessment', 'rankReveal', 'cinematicGraph',
];
const DC_CTA_RE = "^(Continue|See my plan|See plan|Unlock my full plan|Unlock my plan|Unlock|Start my 3-day|Start my 3\\u2011day|Start my free trial|Start free trial|Start free|Next|Done|Get started)\\b";
const DC_PAGE_INJECT = `
(function () {
  function post(m){ try{ window.ReactNativeWebView.postMessage(m); }catch(e){} }
  var RE = new RegExp(${JSON.stringify(DC_CTA_RE)}, 'i');
  function clickable(el){
    for(var i=0; el && i<8; i++, el=el.parentElement){
      var r = el.getAttribute && el.getAttribute('role');
      if(el.tagName==='BUTTON' || el.tagName==='A' || r==='button' || (el.getAttribute && el.getAttribute('onclick')!=null) || (el.style && el.style.cursor==='pointer')) return el;
    }
    return null;
  }
  // A CTA counts only if it's actually on screen and tappable RIGHT NOW —
  // generatePlan keeps its "See my plan" button in the DOM the whole time,
  // hidden/disabled until the progress finishes; tapping the empty space
  // near it was firing 'advance' early.
  function live(el){
    for(var i=0; el && i<5; i++, el=el.parentElement){
      var cs=getComputedStyle(el);
      if(cs.display==='none' || cs.visibility==='hidden') return false;
      if(cs.pointerEvents==='none') return false;
      if(parseFloat(cs.opacity||'1') < 0.35) return false;
    }
    return true;
  }
  document.addEventListener('click', function(e){
    var c = clickable(e.target);
    if(!c) return;
    var r=c.getBoundingClientRect();
    if(r.width<24 || r.height<16 || !live(c)) return;
    var t=(c.textContent||'').replace(/\\s+/g,' ').trim();
    if (RE.test(t)) { post('__tap'); post('advance'); }
  }, true);

  // Plan-ready: the little pencil icons are cursor:pointer svgs with no
  // handler. Wire each one explicitly to the field in its row.
  function wireEdits(){
    var svgs=document.querySelectorAll('svg[style*="cursor: pointer"],svg[style*="cursor:pointer"]');
    var n=0;
    for(var i=0;i<svgs.length;i++){
      var sv=svgs[i];
      if(sv.__wired){ n++; continue; }
      sv.__wired=1;
      var host=sv.parentElement, v='';
      for(var p=0;p<6 && host;p++,host=host.parentElement){
        var sp=host.querySelector && host.querySelector('span.sc-interp');
        if(sp){ v=(sp.textContent||'').trim(); break; }
      }
      var field = /lb|kg/i.test(v) ? 'weight' : (v.indexOf('"')>=0 ? 'height' : (/^[0-9]{1,3}$/.test(v) ? 'age' : 'experience'));
      sv.style.setProperty('padding','12px','important');
      sv.style.setProperty('margin','-12px','important');
      sv.style.setProperty('box-sizing','content-box','important');
      (function(f){
        sv.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); post('__tap'); post('editinfo:'+f); }, true);
      })(field);
      n++;
    }
    return n>=3;
  }

  var W=390;
  var s=document.createElement('style');
  s.textContent='html{background:#ffffff!important;}'
    + 'body{margin:0!important;padding:0!important;background:#ffffff!important;display:block!important;overflow-x:hidden!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;}'
    + '#dc-root{position:relative!important;margin:0 auto!important;width:'+W+'px!important;transform-origin:top center!important;}';
  (document.head||document.documentElement).appendChild(s);
  var lastS=-1, H=844;
  function fit(){
    var root=document.getElementById('dc-root'); if(!root) return;
    var vw=window.innerWidth||W, vh=window.innerHeight||H;
    var rh=Math.max(root.scrollHeight||0, H);
    // Default: fit to WIDTH, full readable size, scroll the overflow.
    // window.__dcFitBoth (set by the per-page inject for the one-screen
    // pages) instead shrinks to fit the height too, so everything — the
    // grey line under the CTA included — is visible with no scrolling.
    var S = window.__dcFitBoth ? Math.min(1, vw/W, vh/rh) : Math.min(1, vw/W);
    if(Math.abs(S-lastS)>=0.002){ lastS=S; root.style.setProperty('transform','scale('+S+')','important'); }
    document.body.style.setProperty('height', Math.ceil(rh*S + (window.__dcFitBoth?0:24))+'px','important');
  }
  function painted(){
    var r=document.getElementById('dc-root');
    return !!(r && r.children && r.children.length) && !document.documentElement.classList.contains('sc-dc-streaming');
  }
  var n=0, done=false;
  (function wait(){
    fit();
    var p = painted();
    if(p) wireEdits();
    if((p && !done)){ done=true; fit(); post('rendered'); }
    if(n++<80) setTimeout(wait, 120); // keep wiring pencils as the page settles
  })();
  window.addEventListener('resize', fit);
  true;
})();
`;

// One-screen pages: fit to the screen height too so nothing needs scrolling.
const FIT_BOTH_INJECT = `window.__dcFitBoth=1;`;

// generatePlan is a timed "generating…" beat + a one-screen page. Auto-
// advance as a backstop (its own progress runs ~9s then shows a CTA).
const GENERATE_PLAN_INJECT = `
(function(){
  window.__dcFitBoth=1;
  setTimeout(function(){ try{ window.ReactNativeWebView.postMessage('advance'); }catch(e){} }, 16000);
  true;
})();
`;

// The page's own CTA slides in a beat after it loads. Delay the back button
// to land with it, not before it.
const BACK_DELAY_MS: Partial<Record<string, number>> = { trialTimeline: 1500, paywall: 1100, planReady: 500, generatePlan: 500 };

function OnboardingWebScreen({ htmlKey, onAdvance, onBack, onEditInfo, topInset, extraJs: extraJsProp }: {
  htmlKey: keyof typeof ONB_HTML;
  onAdvance: () => void;
  onBack: () => void;
  onEditInfo?: (field: string) => void;
  topInset: number;
  extraJs?: string;
}) {
  const fade = useRef(new Animated.Value(0)).current;
  const backFade = useRef(new Animated.Value(0)).current;
  const shown = useRef(false);
  const [webReady, setWebReady] = useState(false);

  const reveal = () => {
    if (shown.current) return;
    shown.current = true;
    Animated.timing(fade, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    setTimeout(() => {
      Animated.timing(backFade, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    }, BACK_DELAY_MS[htmlKey] ?? 350);
  };
  // Fallback reveals — the 'rendered' message is the fast path, but never
  // leave the page (or its back button) hidden if it doesn't arrive.
  useEffect(() => {
    if (!webReady) return;
    const t = setTimeout(reveal, DC_PAGE_KEYS.includes(htmlKey) ? 1400 : 350);
    return () => clearTimeout(t);
  }, [webReady]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const hard = setTimeout(reveal, 3500); // absolute backstop from mount
    return () => clearTimeout(hard);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isDcPage = DC_PAGE_KEYS.includes(htmlKey);
  const baseInject = isDcPage ? DC_PAGE_INJECT : ONBOARDING_WEB_INJECT;
  // Everything except planReady is a one-screen page → fit to the height too.
  const fitBothKeys = ['trialTimeline', 'paywall', 'rankWheel', 'strengthAssessment', 'rankReveal', 'cinematicGraph'];
  const dcExtra =
    htmlKey === 'generatePlan' ? GENERATE_PLAN_INJECT :
    fitBothKeys.includes(htmlKey) ? FIT_BOTH_INJECT :
    undefined;
  const extraJs = extraJsProp
    ? (dcExtra ? extraJsProp + '\n' + dcExtra : extraJsProp)
    : (dcExtra ?? undefined);
  return (
    <View style={{ flex: 1, backgroundColor: isDcPage ? '#ffffff' : '#f4f4f2' }}>
      {!isDcPage && <AppBackground />}
      <Animated.View style={{ flex: 1, marginTop: topInset, opacity: fade }}>
        <WebView
          source={ONB_HTML[htmlKey] as any}
          originWhitelist={['*']}
          injectedJavaScript={extraJs ? baseInject + '\n' + extraJs : baseInject}
          onLoadEnd={() => setWebReady(true)}
          onMessage={(e) => {
            const m = e.nativeEvent.data;
            if (m === '__tap' || m === '__tick') { Haptics.selectionAsync(); return; }
            if (m === 'rendered') { reveal(); return; }
            if (m.indexOf('editinfo') === 0) { onEditInfo?.(m.split(':')[1] || 'weight'); return; }
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            if (m === 'advance' || m === 'skip') onAdvance();
          }}
          style={{ flex: 1, backgroundColor: isDcPage ? '#ffffff' : 'transparent' }}
          opaque={isDcPage}
          scrollEnabled
          bounces={isDcPage}
          decelerationRate="normal"
          nestedScrollEnabled
          overScrollMode="never"
          setSupportMultipleWindows={false}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled
        />
      </Animated.View>
      <Animated.View style={{ opacity: backFade, zIndex: 80 }} pointerEvents={webReady ? 'auto' : 'none'}>
        <LiquidGlassButton
          onPress={() => { Haptics.selectionAsync(); onBack(); }}
          hitSlop={12}
          radius={17}
          variant={isDcPage ? 'regular' : 'clear'}
          fallbackColor={isDcPage ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.35)'}
          containerStyle={[web.backBtn, { top: topInset + 8 }]}
          style={[web.backCircle, isDcPage && web.backCircleDc]}
        >
          <SymbolView name="chevron.left" size={15} tintColor={isDcPage ? '#1b1f27' : '#fff'} type="monochrome" style={{ width: 15, height: 15 }} />
        </LiquidGlassButton>
      </Animated.View>
    </View>
  );
}

const web = StyleSheet.create({
  backBtn:    { position: 'absolute', left: 20, zIndex: 60 },
  backCircle: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  // On the white DC pages: a clean light chip, not a heavy dark blob.
  backCircleDc: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.10)', ...({ boxShadow: '0px 2px 8px rgba(0,0,0,0.10)' } as any) },
});

// ── LocationBubbles — 3 overlapping gradient spheres (Home / Gym / Mix)
// that ARE the answer options: tap one to pick, then Continue. Copied over
// from onboarding-test verbatim (drift/entrance animations, frosted glass,
// transparent-bg icons), restyled only for this screen's palette.
const AnimatedBubblePressable = Animated.createAnimatedComponent(Pressable);

const BUBBLES: { label: string; sub: string; icon: string; customIcon: any; colors: [string, string]; style: any }[] = [
  { label: 'Home', sub: 'Minimal kit', icon: 'house.fill', customIcon: ICON.homeNoBg, colors: ['#FFD9A8', '#FF9F5A'], style: { top: 0, right: 6, width: 168, height: 168 } },
  { label: 'Gym', sub: 'Full rack', icon: 'figure.strengthtraining.traditional', customIcon: ICON.gymNoBg, colors: ['#BFE0FF', '#5AA9FF'], style: { top: 118, left: 0, width: 190, height: 190 } },
  { label: 'Mix of both', sub: 'Flexible', icon: 'shuffle', customIcon: ICON.mixNoBg, colors: ['#E3D6FF', '#B79CFF'], style: { top: 190, right: 0, width: 176, height: 176 } },
];

function LocationBubbles({ selected, onPick }: { selected: string | null; onPick: (label: string) => void }) {
  const entrance = useRef(BUBBLES.map(() => new Animated.Value(0.5))).current;
  const driftX = useRef(BUBBLES.map(() => new Animated.Value(0))).current;
  const driftY = useRef(BUBBLES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const entranceAnims = entrance.map((v, i) =>
      Animated.timing(v, { toValue: 1, duration: 480, delay: i * 90, easing: Easing.out(Easing.cubic), useNativeDriver: false })
    );
    entranceAnims.forEach(a => a.start());

    const driftLoops = BUBBLES.map((_, i) => {
      const xDur = 3600 + i * 620;
      const yDur = 4200 + i * 540;
      const xLoop = Animated.loop(Animated.sequence([
        Animated.timing(driftX[i], { toValue: 1, duration: xDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(driftX[i], { toValue: -1, duration: xDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(driftX[i], { toValue: 0, duration: xDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
      const yLoop = Animated.loop(Animated.sequence([
        Animated.timing(driftY[i], { toValue: 1, duration: yDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(driftY[i], { toValue: -1, duration: yDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(driftY[i], { toValue: 0, duration: yDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
      setTimeout(() => { xLoop.start(); yLoop.start(); }, i * 240);
      return [xLoop, yLoop];
    }).flat();

    return () => {
      entranceAnims.forEach(a => a.stop());
      driftLoops.forEach(l => l.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={bub.wrap}>
      {BUBBLES.map((b, i) => {
        const tx = driftX[i].interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] });
        const ty = driftY[i].interpolate({ inputRange: [-1, 1], outputRange: [-7, 7] });
        const scale = entrance[i].interpolate({ inputRange: [0.5, 1], outputRange: [0.92, 1] });
        const isSel = selected === b.label;
        return (
          <AnimatedBubblePressable
            key={b.label}
            onPress={() => onPick(b.label)}
            style={[bub.bubble, b.style, isSel && bub.bubbleSel, { opacity: entrance[i], transform: [{ scale }, { translateX: tx }, { translateY: ty }] }]}
          >
            <LinearGradient colors={b.colors} start={{ x: 0.15, y: 0.1 }} end={{ x: 0.9, y: 1 }} style={[StyleSheet.absoluteFill, { opacity: 0.94 }]} />
            <BlurView intensity={8} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
            <View pointerEvents="none" style={bub.highlight} />
            <View style={bub.inner} pointerEvents="none">
              {b.customIcon
                ? <Image source={b.customIcon} style={{ width: 28, height: 28, marginBottom: 4 }} resizeMode="contain" />
                : <SymbolView name={b.icon as any} size={26} tintColor="#241708" type="monochrome" style={{ width: 26, height: 26, marginBottom: 4 }} />}
              <Text style={bub.label}>{b.label}</Text>
              <Text style={bub.sub}>{b.sub}</Text>
            </View>
            {isSel && (
              <View style={bub.check} pointerEvents="none">
                <SymbolView name="checkmark" size={14} tintColor="#fff" type="monochrome" style={{ width: 14, height: 14 }} />
              </View>
            )}
          </AnimatedBubblePressable>
        );
      })}
    </View>
  );
}

const bub = StyleSheet.create({
  wrap: { height: 380, marginTop: 26 },
  bubble: {
    position: 'absolute', borderRadius: 999, overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)',
    ...({ boxShadow: '0px 10px 24px rgba(20,20,40,0.16), 0px 2px 6px rgba(20,20,40,0.10), inset 0px 1px 1px rgba(255,255,255,0.4)' } as any),
  },
  bubbleSel: { borderWidth: 3, borderColor: L.btnDark },
  highlight: {
    position: 'absolute', top: '10%', left: '16%', width: '46%', height: '30%',
    borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.45)',
    ...({ transform: [{ rotate: '-18deg' }] } as any),
  },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 16, fontWeight: '700', color: '#241708' },
  sub: { fontSize: 12, fontWeight: '500', color: 'rgba(36,23,8,0.6)' },
  check: {
    position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11,
    backgroundColor: L.btnDark, alignItems: 'center', justifyContent: 'center',
  },
});

// ── Step definitions ───────────────────────────────────────────────────────────

interface OptionDef { label: string; sfSymbol?: string; sublabel?: string; customIcon?: any; }
type StepOptions = OptionDef[] | ((a: Record<string, any>) => OptionDef[]);
interface Step {
  id:             string;
  section:        string;
  type:           'select' | 'multiselect' | 'wheel' | 'slider' | 'ruler' | 'interstitial' | 'text' | 'locationBubbles' | 'videoClip' | 'webview' | 'guessSlider';
  question:       string;
  subtitle?:      string;
  placeholder?:   string;
  options?:       StepOptions;
  wheelKind?:     'age' | 'height';
  htmlKey?:       'rankWheel' | 'strengthAssessment' | 'rankReveal';
  showIf?:        (a: Record<string, any>) => boolean;
  clearAllOption?: string;
}

function resolveOptions(opts: StepOptions | undefined, a: Record<string, any>): OptionDef[] {
  if (!opts) return [];
  return typeof opts === 'function' ? opts(a) : opts;
}

// ── STEPS — every question from the onboarding-test FLOW, in the same
// order, rendered in this screen's clean tappable style (no typewriter, no
// conversational reply lines). fact1 is the `afterAboutYou` interstitial
// (PlanGrowthMoment) sitting right after followPlan. fact2 was cut per
// request; the old afterGoal/afterExperience/afterTraining interstitials
// and the motivation / homeSplit questions are gone (not in FLOW).
const STEPS: Step[] = [
  { id: 'name', section: 'About You', type: 'text', question: 'What should I call you?', placeholder: 'Your name' },

  { id: 'age',    section: 'About You', type: 'wheel',  wheelKind: 'age',    question: 'How old are you?' },
  { id: 'height', section: 'About You', type: 'wheel',  wheelKind: 'height', question: 'How tall are you?' },
  { id: 'weight', section: 'About You', type: 'ruler',  question: 'What do you weigh?' },
  { id: 'sex', section: 'About You', type: 'select', question: "What's your sex?", options: [
    { label: 'Male',   sfSymbol: 'person.fill', customIcon: ICON.male   },
    { label: 'Female', sfSymbol: 'person.fill', customIcon: ICON.female },
  ]},

  { id: 'trainDuration', section: 'Your Training', type: 'select', question: 'How long have you actually been training, in months or years?', options: [
    { label: 'Just starting', sfSymbol: 'sparkles', customIcon: ICON.justStarting },
    { label: '1-6 months', sfSymbol: 'clock.fill', customIcon: ICON.lessThan6mo },
    { label: '6-12 months', sfSymbol: 'clock.fill', customIcon: ICON.sixTo12mo },
    { label: '1-2 years', sfSymbol: 'calendar', customIcon: ICON.oneToTwoYr },
    { label: '2-5 years', sfSymbol: 'calendar', customIcon: ICON.twoToFiveYr },
    { label: '5-10 years', sfSymbol: 'calendar', customIcon: ICON.fiveToTenYr },
    { label: '10+ years', sfSymbol: 'calendar', customIcon: ICON.tenPlusYr },
  ]},

  { id: 'startReason', section: 'Your Training', type: 'select', question: 'What made you decide to start FormPal?', options: [
    { label: 'Build muscle', sfSymbol: 'dumbbell.fill', customIcon: ICON.moreMuscle },
    { label: 'Look better, feel confident', sfSymbol: 'star.fill', customIcon: ICON.lookBetter },
    { label: 'Learn to train properly', sfSymbol: 'camera.fill', customIcon: ICON.trainProperly },
    { label: 'Get back on track', sfSymbol: 'arrow.triangle.2.circlepath', customIcon: ICON.backOnTrack },
    { label: 'Stay consistent', sfSymbol: 'repeat', customIcon: ICON.stayConsistentIcon },
  ]},

  { id: 'experience', section: 'Your Training', type: 'select', question: 'How much do you actually know about proper training and form?', options: [
    { label: 'Beginner', sfSymbol: '1.circle.fill', customIcon: ICON.beginnerGym },
    { label: 'Some experience', sfSymbol: '2.circle.fill', customIcon: ICON.someExpGym },
    { label: 'Intermediate', sfSymbol: '3.circle.fill', customIcon: ICON.intermediateGym },
    { label: 'Advanced', sfSymbol: '4.circle.fill', customIcon: ICON.expertGym },
  ]},

  { id: 'followPlan', section: 'Your Training', type: 'select', question: 'Do you currently follow a structured training plan?', options: [
    { label: 'Yes', sfSymbol: 'checkmark.circle.fill', customIcon: ICON.yes },
    { label: 'No — I wing it', sfSymbol: 'xmark.circle.fill', customIcon: ICON.no },
    { label: 'On and off', sfSymbol: 'arrow.triangle.2.circlepath', customIcon: ICON.onAndOff },
  ]},

  // fact1 — the structured-plan stat (PlanGrowthMoment). See the
  // 'interstitial' render branch.
  { id: 'afterAboutYou', section: 'Your Training', type: 'interstitial', question: '' },

  { id: 'struggle', section: 'Your Goal', type: 'multiselect', question: "What's been holding your training back?",
    clearAllOption: 'Nothing — just ready to start',
    showIf: a => a.experience !== 'Beginner',
    options: [
      { label: 'Not seeing results', sfSymbol: 'minus.circle.fill', customIcon: ICON.noResults },
      { label: "Not sure if I'm training right", sfSymbol: 'questionmark.circle.fill', customIcon: ICON.notSure },
      { label: 'Staying consistent', sfSymbol: 'repeat', customIcon: ICON.days },
      { label: 'Losing motivation', sfSymbol: 'flame.fill', customIcon: ICON.scared },
      { label: 'Injuries or pain', sfSymbol: 'bandage.fill', customIcon: ICON.wrist },
      { label: 'Nothing — just ready to start', sfSymbol: 'checkmark.circle.fill', customIcon: ICON.good },
    ],
  },
  { id: 'frustration', section: 'Your Goal', type: 'select', question: 'What frustrates you most about your training?',
    showIf: a => a.experience !== 'Beginner',
    options: [
      { label: 'Not seeing results', sfSymbol: 'minus.circle.fill', customIcon: ICON.noResults },
      { label: "Don't know if I'm doing it right", sfSymbol: 'questionmark.circle.fill', customIcon: ICON.notSure },
      { label: 'Staying consistent', sfSymbol: 'repeat', customIcon: ICON.days },
      { label: 'Nothing really', sfSymbol: 'checkmark.circle.fill', customIcon: ICON.good },
    ],
  },
  { id: 'formConfidence', section: 'Your Goal', type: 'select', question: 'Do you actually know if your form is right?', options: [
    { label: 'Yes', sfSymbol: 'checkmark.seal.fill', customIcon: ICON.yes },
    { label: 'Not sure', sfSymbol: 'questionmark.circle.fill', customIcon: ICON.notSure },
    { label: 'No idea', sfSymbol: 'xmark.circle.fill', customIcon: ICON.no },
  ]},

  { id: 'goal', section: 'Your Goal', type: 'multiselect', question: 'What are your goals?', options: [
    { label: 'Build muscle & strength', sfSymbol: 'dumbbell.fill', customIcon: ICON.muscle },
    { label: 'Lose weight', sfSymbol: 'flame.fill', customIcon: ICON.scale },
    { label: 'Improve form', sfSymbol: 'camera.fill', customIcon: ICON.camera },
    { label: 'Stay consistent', sfSymbol: 'repeat', customIcon: ICON.days },
    { label: 'General fitness', sfSymbol: 'heart.fill', customIcon: ICON.heart },
  ]},

  { id: 'injuries', section: 'Your Body', type: 'multiselect', question: 'Any injuries or areas that hurt?',
    clearAllOption: 'No injuries — all clear',
    options: [
      { label: 'Knees', sfSymbol: 'figure.walk', customIcon: ICON.knee },
      { label: 'Shoulders', sfSymbol: 'figure.arms.open', customIcon: ICON.shoulder },
      { label: 'Lower back', sfSymbol: 'figure.cooldown', customIcon: ICON.back },
      { label: 'Wrists', sfSymbol: 'hand.raised.fill', customIcon: ICON.wrist },
      { label: 'Neck', sfSymbol: 'figure.stand', customIcon: ICON.neck },
      { label: 'Hips', sfSymbol: 'figure.run', customIcon: ICON.hip },
      { label: 'No injuries — all clear', sfSymbol: 'checkmark.circle.fill', customIcon: ICON.good },
    ],
  },

  { id: 'trainingLocation', section: 'Your Training', type: 'locationBubbles', question: 'Where do you train?' },
  { id: 'homeEquipment', section: 'Your Training', type: 'multiselect', question: 'Equipment you have at home?',
    showIf: a => a.trainingLocation === 'Home' || a.trainingLocation === 'Mix of both',
    clearAllOption: 'Nothing — bodyweight only',
    options: [
      { label: 'Dumbbells', sfSymbol: 'dumbbell.fill', customIcon: ICON.dumbbell },
      { label: 'Resistance bands', sfSymbol: 'figure.flexibility', customIcon: ICON.bands },
      { label: 'Kettlebells', sfSymbol: 'figure.strengthtraining.functional', customIcon: ICON.kettlebell },
      { label: 'Pull-up bar', sfSymbol: 'figure.gymnastics', customIcon: ICON.pullupBar },
      { label: 'Bench', sfSymbol: 'rectangle.fill', customIcon: ICON.bench },
      { label: 'Barbell & plates', sfSymbol: 'figure.strengthtraining.traditional', customIcon: ICON.barbell },
      { label: 'Nothing — bodyweight only', sfSymbol: 'figure.walk', customIcon: ICON.bodyweight },
    ],
  },
  { id: 'gymMissingEquipment', section: 'Your Training', type: 'multiselect', question: 'Anything your gym is missing?',
    showIf: a => a.trainingLocation === 'Gym' || a.trainingLocation === 'Mix of both',
    clearAllOption: 'It has everything',
    options: [
      { label: 'Free weights', sfSymbol: 'dumbbell.fill', customIcon: ICON.dumbbell },
      { label: 'Cable machines', sfSymbol: 'figure.strengthtraining.functional', customIcon: ICON.cableMachine },
      { label: 'Leg machines', sfSymbol: 'figure.walk', customIcon: ICON.legMachine },
      { label: 'Chest / press machines', sfSymbol: 'figure.strengthtraining.traditional', customIcon: ICON.chestMachine },
      { label: 'Back / row machines', sfSymbol: 'figure.rower', customIcon: ICON.backMachine },
      { label: 'Squat rack', sfSymbol: 'figure.cross.training', customIcon: ICON.squatMachine },
      { label: 'It has everything', sfSymbol: 'checkmark.circle.fill', customIcon: ICON.allGood },
    ],
  },
  { id: 'days', section: 'Your Training', type: 'select', question: 'How many days a week do you train?', options: (a) => {
      const advanced = a.experience === 'Intermediate' || a.experience === 'Advanced';
      const max = advanced ? 7 : 6;
      const DAY_ICONS = [ICON.oneDay, ICON.twoDays, ICON.threeDays, ICON.fourDays, ICON.fiveDays, ICON.sixDays, ICON.sevenDays];
      return Array.from({ length: max }, (_, i) => ({ label: `${i + 1} day${i === 0 ? '' : 's'}`, sfSymbol: `${i + 1}.circle.fill`, customIcon: DAY_ICONS[i] }));
    },
  },
  { id: 'duration', section: 'Your Training', type: 'select', question: 'How long per session?', options: [
    { label: '15-20 min', sfSymbol: 'clock.fill', customIcon: ICON.fifteenMin },
    { label: '30 min', sfSymbol: 'clock.fill', customIcon: ICON.thirtyMin },
    { label: '45 min', sfSymbol: 'clock.fill', customIcon: ICON.fortyFiveMin },
    { label: '60 min', sfSymbol: 'clock.fill', customIcon: ICON.sixtyMin },
    { label: '75+ min', sfSymbol: 'clock.fill', customIcon: ICON.seventyFiveMin },
  ]},

  { id: 'cardio', section: 'Your Training', type: 'select', question: 'Do you do any cardio or other training?', options: [
    { label: 'Yes, regularly', sfSymbol: 'figure.run', customIcon: ICON.running },
    { label: 'Sometimes', sfSymbol: 'figure.walk', customIcon: ICON.walking },
    { label: 'No, just lifting', sfSymbol: 'dumbbell.fill', customIcon: ICON.dumbbell },
    { label: 'I want to add some', sfSymbol: 'plus.circle.fill', customIcon: ICON.fire },
  ]},
  { id: 'cardioTypes', section: 'Your Training', type: 'multiselect', question: 'What kind?',
    showIf: a => a.cardio === 'Yes, regularly' || a.cardio === 'Sometimes',
    options: [
      { label: 'Running', sfSymbol: 'figure.run', customIcon: ICON.running },
      { label: 'Cycling', sfSymbol: 'bicycle', customIcon: ICON.cycling },
      { label: 'Swimming', sfSymbol: 'figure.pool.swim', customIcon: ICON.swimming },
      { label: 'Rowing', sfSymbol: 'figure.rower', customIcon: ICON.rowing },
      { label: 'HIIT', sfSymbol: 'bolt.fill', customIcon: ICON.hiit },
      { label: 'Walking', sfSymbol: 'figure.walk', customIcon: ICON.walking },
      { label: 'Sports', sfSymbol: 'sportscourt.fill', customIcon: ICON.sports },
    ],
  },
  { id: 'trainTime', section: 'Your Training', type: 'select', question: 'What time of day do you usually train?', options: [
    { label: 'Morning', sfSymbol: 'sunrise.fill', customIcon: ICON.morning },
    { label: 'Afternoon', sfSymbol: 'sun.max.fill', customIcon: ICON.afternoon },
    { label: 'Evening', sfSymbol: 'moon.stars.fill', customIcon: ICON.night },
    { label: 'Varies', sfSymbol: 'shuffle', customIcon: ICON.onAndOff },
  ]},
  { id: 'successVision', section: 'Wrap up', type: 'select', question: 'What does success look like in 6 months?', options: [
    { label: 'Visibly more muscle', sfSymbol: 'dumbbell.fill', customIcon: ICON.moreMuscle },
    { label: 'Noticeably stronger lifts', sfSymbol: 'bolt.fill', customIcon: ICON.getStronger },
    { label: 'Leaner and more defined', sfSymbol: 'flame.fill', customIcon: ICON.leanerIcon },
    { label: 'Confident with my shirt off', sfSymbol: 'star.fill', customIcon: ICON.shirtOff },
    { label: 'Finally seeing results', sfSymbol: 'checkmark.circle.fill', customIcon: ICON.seeingResults },
    { label: 'Knowing my form is right', sfSymbol: 'camera.fill', customIcon: ICON.betterForm },
  ]},
  { id: 'howHeard', section: 'Wrap up', type: 'select', question: 'How did you hear about us?', options: [
    { label: 'Instagram / TikTok', sfSymbol: 'play.rectangle.fill', customIcon: ICON.socialMedia },
    { label: 'Friend or referral', sfSymbol: 'person.2.fill', customIcon: ICON.shareLink },
    { label: 'App Store search', sfSymbol: 'magnifyingglass', customIcon: ICON.appStore },
    { label: 'Google / web search', sfSymbol: 'globe', customIcon: ICON.search },
    { label: 'Other', sfSymbol: 'ellipsis.circle.fill', customIcon: ICON.other },
  ]},
  { id: 'notifications', section: 'Wrap up', type: 'select', question: 'Reminders on training days?', options: [
    { label: 'Yes please', sfSymbol: 'bell.fill', customIcon: ICON.notifOn },
    { label: 'No thanks', sfSymbol: 'bell.slash.fill', customIcon: ICON.notifOff },
  ]},

  // NOTE: the rank run (wheel → assessment → reveal) used to sit here. It
  // now runs AFTER the math/reversal, as an appState sequence — see the
  // 'rankWheel'/'rankAssess'/'rankReveal' render blocks below.

  // The demo, as a clip instead of "do 5 reps".
  { id: 'demoClip', section: 'Wrap up', type: 'videoClip',
    question: 'This is FormPal watching a rep.',
    subtitle: "It counts the clean ones — and tells you exactly why the rest didn't." },

  { id: 'formGuess', section: 'Wrap up', type: 'guessSlider',
    question: 'Out of every rep you do, how many do you think are actually good form?' },
];

// Was a literal engineering task list ("Reading your answers," "Setting
// your difficulty") — describes what the outcome of each step MEANS for
// the user instead of the mechanical action taken.
const LOADING_STEPS = [
  'Matching exercises to your goals',
  'Calibrating so every rep is achievable, not overwhelming',
  'Building a week you can actually stick to',
  'Getting your camera coach ready',
  'Almost there — your first win starts here',
];

function getVisibleSteps(a: Record<string, any>): Step[] {
  return STEPS.filter(s => !s.showIf || s.showIf(a));
}

// ── Plan helpers ──────────────────────────────────────────────────────────────

interface WorkoutExercise { name: string; scheme: string; formCheck: boolean; }

function buildPlan(a: Record<string, any>): { focus: string; exercises: WorkoutExercise[] } {
  const loc       = a.trainingLocation ?? 'Home';
  const homeEquip = (a.homeEquipment as string[]) ?? [];
  const noEquip   = loc === 'Home' && (homeEquip.includes('Nothing — bodyweight only') || homeEquip.length === 0);
  const exercises: WorkoutExercise[] = noEquip
    ? [
        { name: 'Bodyweight Squats', scheme: '3 × 12',      formCheck: true  },
        { name: 'Push-ups',          scheme: '3 × 10',      formCheck: false },
        { name: 'Reverse Lunges',    scheme: '3 × 10 each', formCheck: true  },
        { name: 'Plank',             scheme: '3 × 30 sec',  formCheck: false },
      ]
    : [
        { name: 'Goblet Squats',     scheme: '3 × 8',       formCheck: true  },
        { name: 'Dumbbell Press',    scheme: '3 × 10',      formCheck: false },
        { name: 'Romanian Deadlift', scheme: '3 × 10',      formCheck: false },
        { name: 'Walking Lunges',    scheme: '3 × 12 each', formCheck: true  },
      ];
  return { focus: 'Full Body', exercises };
}

const GOAL_WORD: Record<string, string> = {
  'Build muscle':    'building muscle',
  'Lose weight':     'losing weight',
  'Get stronger':    'getting noticeably stronger',
  'Improve form':    'mastering your form',
  'Stay consistent': 'building a lasting habit',
};

function projectionLine(a: Record<string, any>): string {
  const goals   = (a.goal as string[]) ?? [];
  const primary = goals[0] ?? '';
  const word    = GOAL_WORD[primary] ?? 'hitting your goal';
  const daysNum = parseInt((a.days as string) ?? '3') || 3;
  return `Training ${daysNum} day${daysNum !== 1 ? 's' : ''} a week, you're on track to start seeing real progress toward ${word} in about 8 weeks.`;
}

function motivationLine(a: Record<string, any>): string {
  const m = (a.motivation as string[]) ?? [];
  if (m.includes('Reduce stress'))
    return 'Every session is a step toward feeling better.';
  if (m.includes('Look & feel confident'))
    return "Stay consistent and you'll feel it in how you carry yourself.";
  if (m.includes('Get strong') || m.includes('Sports & performance'))
    return 'Strength is built one rep at a time. Your plan starts here.';
  return 'Track every rep. Build the habit. See the change.';
}

// ── Section-transition interstitials ──────────────────────────────────────────
// One per section boundary (see the 'afterAboutYou'/'afterGoal'/
// 'afterExperience'/'afterTraining' entries in STEPS above). Each is a
// dedicated component imported from components/ (PlanGrowthMoment,
// EffortResultsMoment, FormMuscleMoment, InjuryRiskMoment) rebuilt from a
// standalone HTML reference the user supplied — see each component's own
// header comment for what it replaced and why. Wired up in the
// 'interstitial' render branch below; no per-step content computed here
// since none of the four reflect the user's own answers back at them
// (unlike the StatsMoment/ComparisonMoment/LevelTrack/WeekDots recaps they
// replaced).

// ── AnimatedOption ─────────────────────────────────────────────────────────────

function AnimatedOption({ index, children, style, onPress }: {
  index: number; children: React.ReactNode; style: any; onPress: () => void;
}) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 280, delay: index * 55, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 280, delay: index * 55, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <TouchableOpacity style={style} onPress={onPress} activeOpacity={0.7}>{children}</TouchableOpacity>
    </Animated.View>
  );
}

// ── ProjectionChart ───────────────────────────────────────────────────────────

const AnimatedSvgPath   = Animated.createAnimatedComponent(SvgPath);
const AnimatedSvgCircle = Animated.createAnimatedComponent(SvgCircle);
const CURVE_LEN          = 330;
const LINE_DRAW_DURATION = 1500;
const LINE_DRAW_DELAY    = 350;

function ProjectionChart() {
  const lineProgress = useRef(new Animated.Value(0)).current;
  const dotOpacity   = useRef(new Animated.Value(0)).current;
  const pulseOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(lineProgress, { toValue: 1, duration: LINE_DRAW_DURATION, delay: LINE_DRAW_DELAY, useNativeDriver: false })
      .start(() => {
        Animated.timing(dotOpacity, { toValue: 1, duration: 250, useNativeDriver: false }).start();
        Animated.loop(Animated.sequence([
          Animated.timing(pulseOpacity, { toValue: 0.4, duration: 900, useNativeDriver: false }),
          Animated.timing(pulseOpacity, { toValue: 0,   duration: 900, useNativeDriver: false }),
        ])).start();
      });
  }, []);

  const strokeDashoffset = lineProgress.interpolate({ inputRange: [0, 1], outputRange: [CURVE_LEN, 0] });
  const fillOpacity      = lineProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={{ marginVertical: 20 }}>
      <View style={{ flexDirection: 'row', gap: 20, marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View style={{ width: 18, height: 2.5, backgroundColor: L.accent, borderRadius: 2 }} />
          <Text style={{ fontSize: 12, color: L.textSub }}>With FormPal</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View style={{ width: 18, borderTopWidth: 1.5, borderColor: L.textDim, borderStyle: 'dashed' }} />
          <Text style={{ fontSize: 12, color: L.textSub }}>Without</Text>
        </View>
      </View>
      <Svg width="100%" height={150} viewBox="0 0 300 145">
        <SvgPath d="M 25,105 L 280,105" stroke="rgba(17,24,39,0.08)" strokeWidth={1} fill="none" />
        <AnimatedSvgPath d="M 25,100 C 90,100 205,18 280,18 L 280,105 L 25,105 Z" fill="rgba(10,132,255,0.07)" opacity={fillOpacity} stroke="none" />
        <SvgPath d="M 25,100 L 280,100" stroke={L.textDim} strokeWidth={1.5} strokeDasharray="6 4" fill="none" strokeLinecap="round" />
        <AnimatedSvgPath d="M 25,100 C 90,100 205,18 280,18" stroke={L.accent} strokeWidth={3} strokeDasharray={`${CURVE_LEN} ${CURVE_LEN}`} strokeDashoffset={strokeDashoffset} fill="none" strokeLinecap="round" />
        <AnimatedSvgCircle cx="280" cy="18" r="10" fill="rgba(10,132,255,0.14)" opacity={pulseOpacity} />
        <AnimatedSvgCircle cx="280" cy="18" r="4"  fill={L.accent}              opacity={dotOpacity}   />
        <SvgText x="25"  y="126" fill={L.textDim} fontSize="11" textAnchor="middle">Week 1</SvgText>
        <SvgText x="280" y="126" fill={L.textDim} fontSize="11" textAnchor="middle">Week 8</SvgText>
        <SvgText x="8" y="60" fill={L.textDim} fontSize="11" textAnchor="middle" transform="rotate(-90 8 60)">Progress</SvgText>
      </Svg>
    </View>
  );
}

// ── BulletItem ────────────────────────────────────────────────────────────────

const BULLET_ITEMS      = ['Personalized from day one', 'Real-time form feedback on every rep', 'Adapts as you improve'];
const BULLET_BASE_DELAY = LINE_DRAW_DELAY + LINE_DRAW_DURATION + 100;
const BULLET_STAGGER    = 300;

function BulletItem({ text, index }: { text: string; index: number }) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    const delay = BULLET_BASE_DELAY + index * BULLET_STAGGER;
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 350, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 350, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }], flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: L.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Sym name="checkmark" size={12} color="#fff" />
      </View>
      <Text style={{ fontSize: 15, color: L.text, fontWeight: W.medium, flex: 1 }}>{text}</Text>
    </Animated.View>
  );
}

// ── HomeSplitSlider — amber/green, icons at ends, % under bar ─────────────────

function HomeSplitSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [trackWidth, setTrackWidth] = useState(280);
  const [displayVal, setDisplayVal] = useState(Math.round(value));

  // Animated.Value drives the fill + thumb visually (no re-renders during drag)
  const animPct  = useRef(new Animated.Value(value)).current;
  const startRef = useRef(value);

  // One-time sync on mount
  useEffect(() => {
    animPct.setValue(value);
    setDisplayVal(Math.round(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => {
        startRef.current = (animPct as any)._value ?? 50;
      },
      onPanResponderMove: (_, gs) => {
        const raw  = startRef.current + (gs.dx / trackWidth) * 100;
        const next = Math.max(5, Math.min(95, raw));
        animPct.setValue(next);                    // instant, no re-render
        const rounded = Math.round(next);
        setDisplayVal(rounded);                    // only text re-renders
        onChange(next);
      },
      onPanResponderRelease: (_, gs) => {
        const raw  = startRef.current + (gs.dx / trackWidth) * 100;
        const next = Math.round(Math.max(5, Math.min(95, raw)));
        animPct.setValue(next);
        setDisplayVal(next);
        onChange(next);
      },
    })
  ).current;

  const homePct = displayVal;
  const gymPct  = 100 - homePct;

  // Animated interpolations — drive fill + thumb without state
  const fillWidth = animPct.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  const thumbLeft = animPct.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  return (
    <View style={{ gap: 16, marginTop: 16 }}>
      {/* Row: home icon | track | gym icon */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {/* Home icon */}
        <View style={[sl.iconBox, { backgroundColor: 'rgba(255,159,10,0.12)' }]}>
          <Sym name="house.fill" size={18} color={HOME_CLR} />
        </View>

        {/* Track + thumb in a relative wrapper */}
        <View
          style={{ flex: 1, height: TRACK_H, position: 'relative' }}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          {...panResponder.panHandlers}
        >
          {/* Segmented fill — overflow:hidden clips to rounded corners */}
          <View style={sl.track}>
            <Animated.View style={{ height: '100%', width: fillWidth, backgroundColor: HOME_CLR }} />
            <View style={{ flex: 1, height: '100%', backgroundColor: GYM_CLR }} />
          </View>
          {/* Thumb — absolutely overlaid, NOT clipped by track's overflow */}
          <Animated.View style={[sl.thumb, { left: thumbLeft, marginLeft: -(THUMB_SZ / 2), top: (TRACK_H - THUMB_SZ) / 2 }]} />
        </View>

        {/* Gym icon */}
        <View style={[sl.iconBox, { backgroundColor: 'rgba(48,209,88,0.12)' }]}>
          <Sym name="dumbbell.fill" size={18} color={GYM_CLR} />
        </View>
      </View>

      {/* Percentages under each end */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 50 }}>
        <Text style={{ fontFamily: FONT.displayBold, fontSize: 20, color: HOME_CLR, letterSpacing: -0.5 }}>{homePct}%</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontFamily: FONT.displayBold, fontSize: 20, color: GYM_CLR, letterSpacing: -0.5 }}>{gymPct}%</Text>
      </View>
    </View>
  );
}

// ── WeightRulerSlider — tick-mark ruler for entering weight directly on the
// "What do you weigh?" question (was a separate desired-weight page relative
// to a current weight — collapsed into ONE absolute-range ruler on this one
// question instead, per explicit ask: "I didn't want an extra weight page").
//
// FIXED-CENTER-MARKER design, not "static ruler, moving marker" (the first
// pass) — the marker sits still at the exact horizontal center of the
// viewport and the whole tick strip translates underneath it as you drag,
// same mental model as a real ruler/date-picker scroll. This is what makes
// a WIDE absolute range (70-400 lbs, so it covers any real adult weight)
// actually work: a static ruler that size has to start centered on the
// midpoint of the WHOLE range (235 lbs) with no way to show a normal
// starting value on screen — translating the strip instead means the
// current value can always be centered, at any point in the range.
// PanResponder (not a real ScrollView) so this can still directly drive an
// Animated.Value for the two-tone dark/light fill split the exact same way
// HomeSplitSlider does — dark ticks are simply "everything from the start
// of the range up to the current value," clipped via an overflow:hidden
// Animated-width container, and because that container is a CHILD of the
// same translating strip, its dark edge always lands exactly under the
// fixed marker with no extra math.
//
// SIZE — reported too small/cramped on the first pass. TICK_GAP roughly
// tripled (6 → 18px per lb) and every dimension (track height, tick
// heights, marker, the big number) scaled up to match — a genuinely
// "zoomed in" ruler you scrub through, not a shrunk-down decoration.
const WEIGHT_MIN   = 70;  // lbs — wide enough to cover essentially any real adult weight
const WEIGHT_MAX   = 400;
const TICK_GAP      = 18; // px per 1 lb
const TICK_TRACK_H  = 84;

function WeightRulerSlider({ value, onChange }: {
  value: number; onChange: (v: number) => void;
}) {
  const trackWidth = (WEIGHT_MAX - WEIGHT_MIN) * TICK_GAP;
  const pxFromValue = (v: number) => Math.max(0, Math.min(trackWidth, (v - WEIGHT_MIN) * TICK_GAP));
  const valueFromPx = (px: number) => WEIGHT_MIN + px / TICK_GAP;

  const [displayVal, setDisplayVal] = useState(value);
  const [viewportWidth, setViewportWidth] = useState(340); // real value lands via onLayout below

  const valuePx  = useRef(new Animated.Value(pxFromValue(value))).current;
  const startRef = useRef(pxFromValue(value));
  // Dims the big number while actively dragging (it was re-rendering on
  // every pixel of movement and visibly lagging behind the — natively
  // driven — ruler strip during a fast scrub) and holds it dimmed for a
  // beat after release before settling back to full opacity, instead of
  // snapping back the instant your finger lifts.
  const numberOpacity = useRef(new Animated.Value(1)).current;
  const settleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the last WHOLE lb the drag crossed, so the haptic tick fires once
  // per pound crossed — not once per pixel/frame. See onPanResponderMove.
  const lastTickRef = useRef(Math.round(value));

  // One-time sync on mount — same limitation HomeSplitSlider's own comment
  // already documents (doesn't resync if `value` changes from elsewhere
  // after mount), kept consistent rather than solving it differently here.
  useEffect(() => {
    valuePx.setValue(pxFromValue(value));
    setDisplayVal(value);
    lastTickRef.current = Math.round(value);
    return () => { if (settleTimeout.current) clearTimeout(settleTimeout.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => {
        startRef.current = (valuePx as any)._value ?? pxFromValue(value);
        if (settleTimeout.current) clearTimeout(settleTimeout.current);
        Animated.timing(numberOpacity, { toValue: 0.32, duration: 120, useNativeDriver: true }).start();
      },
      onPanResponderMove: (_, gs) => {
        // Dragging LEFT reveals higher numbers at center (same feel as
        // scrolling a horizontal picker) — subtract dx, not add it.
        const raw  = startRef.current - gs.dx;
        const next = Math.max(0, Math.min(trackWidth, raw));
        valuePx.setValue(next);
        const v = Math.round(valueFromPx(next) * 10) / 10;
        setDisplayVal(v);
        onChange(v);
        // Haptic "ruler tick" — felt, not heard: selectionAsync is the
        // exact light-tick feedback iOS pickers/rulers use, distinct from
        // impactAsync's heavier bump. Fires once per whole pound crossed.
        const wholeLb = Math.round(v);
        if (wholeLb !== lastTickRef.current) {
          lastTickRef.current = wholeLb;
          void Haptics.selectionAsync();
        }
      },
      onPanResponderRelease: (_, gs) => {
        const raw  = startRef.current - gs.dx;
        const next = Math.max(0, Math.min(trackWidth, raw));
        const v = Math.round(valueFromPx(next) * 10) / 10;
        valuePx.setValue(pxFromValue(v));
        setDisplayVal(v);
        onChange(v);
        settleTimeout.current = setTimeout(() => {
          Animated.timing(numberOpacity, { toValue: 1, duration: 380, useNativeDriver: true }).start();
        }, 1000);
      },
    })
  ).current;

  // The strip's own translateX — keeps `valuePx` centered under the fixed
  // marker at any drag position (see this component's own comment above).
  const stripTranslateX = valuePx.interpolate({
    inputRange:  [0, trackWidth],
    outputRange: [viewportWidth / 2, viewportWidth / 2 - trackWidth],
  });

  const ticks = useMemo(() => {
    const out: { left: number; major: boolean }[] = [];
    const range = WEIGHT_MAX - WEIGHT_MIN;
    for (let i = 0; i <= range; i++) out.push({ left: i * TICK_GAP, major: i % 10 === 0 });
    return out;
  }, []);

  return (
    <View style={{ alignItems: 'center', marginTop: 20 }}>
      <Animated.Text style={{ opacity: numberOpacity, fontFamily: FONT.displayBold, fontSize: 60, color: L.text, letterSpacing: -1.5, marginBottom: 36 }}>
        {displayVal.toFixed(1)} <Text style={{ fontSize: 24, fontWeight: W.semi, color: L.textDim }}>lbs</Text>
      </Animated.Text>

      <View
        style={{ width: '100%', height: TICK_TRACK_H, overflow: 'hidden' }}
        onLayout={(e) => setViewportWidth(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <Animated.View style={{ width: trackWidth, height: TICK_TRACK_H, transform: [{ translateX: stripTranslateX }] }}>
          {/* Light base layer — every tick, always visible */}
          {ticks.map((t, i) => (
            <View key={i} style={{
              position: 'absolute', left: t.left, bottom: 0,
              width: 3, height: t.major ? 44 : 24,
              backgroundColor: 'rgba(17,24,39,0.14)', borderRadius: 1.5,
            }} />
          ))}
          {/* Dark overlay — from the start of the range up to the current
              value, so it always reaches exactly to the fixed marker below
              regardless of where the strip has scrolled to. */}
          <Animated.View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: valuePx, overflow: 'hidden' }}>
            {ticks.map((t, i) => (
              <View key={i} style={{
                position: 'absolute', left: t.left, bottom: 0,
                width: 3, height: t.major ? 44 : 24,
                backgroundColor: L.btnDark, borderRadius: 1.5,
              }} />
            ))}
          </Animated.View>
        </Animated.View>

        {/* Marker — fixed at the exact center of the viewport, never moves.
            Sibling of the translating strip (not a child of it), pointer
            events off so it never intercepts the drag. */}
        <View pointerEvents="none" style={{
          position: 'absolute', bottom: 0, left: viewportWidth / 2 - 2,
          width: 4, height: 60, backgroundColor: L.btnDark, borderRadius: 2,
        }} />
      </View>
    </View>
  );
}

const sl = StyleSheet.create({
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  track:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', borderRadius: TRACK_H / 2, overflow: 'hidden', backgroundColor: '#EBEBF0' },
  thumb:   { position: 'absolute', width: THUMB_SZ, height: THUMB_SZ, borderRadius: THUMB_SZ / 2, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
});

// ── NotificationBanner — absolute overlay, auto-fades, never pushes content ───

function NotificationBanner({ topOffset }: { topOffset: number }) {
  const translateY = useRef(new Animated.Value(-(topOffset + 100))).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Every animation + timer is captured so unmount (leaving the
    // notifications step before this finishes) can stop them — otherwise a
    // native-driver spring keeps running on a torn-down view: "Unable to
    // find node on an unmounted component".
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let outAnim: Animated.CompositeAnimation | null = null;
    const inAnim = Animated.sequence([
      Animated.delay(500),
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, friction: 9, tension: 60, useNativeDriver: true }),
      ]),
    ]);
    inAnim.start(({ finished }) => {
      if (!finished) return;
      holdTimer = setTimeout(() => {
        outAnim = Animated.parallel([
          Animated.timing(opacity,    { toValue: 0, duration: 350, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -8, duration: 350, useNativeDriver: true }),
        ]);
        outAnim.start();
      }, 2000);
    });
    return () => {
      inAnim.stop();
      outAnim?.stop();
      if (holdTimer) clearTimeout(holdTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View
      style={[nb.overlay, { top: topOffset + 10, opacity, transform: [{ translateY }] }]}
      pointerEvents="none"
    >
      <View style={nb.card}>
        <View style={nb.iconWrap}>
          <Sym name="dumbbell.fill" size={15} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={nb.appName}>FormPal</Text>
            <Text style={nb.time}>now</Text>
          </View>
          <Text style={nb.message}>Time for today's workout 💪</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const nb = StyleSheet.create({
  overlay: { position: 'absolute', left: 16, right: 16, zIndex: 100 },
  card:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: L.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: L.border, ...({ boxShadow: Elev.medium.shadow } as any) },
  iconWrap:{ width: 38, height: 38, borderRadius: 10, backgroundColor: L.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  appName: { fontSize: 13, fontWeight: W.bold, color: L.text },
  time:    { fontSize: 11, color: L.textDim, fontWeight: W.medium },
  message: { fontSize: 14, color: L.text, marginTop: 3 },
});

// ── MyPalIntroContent — animated, minimal, icon-forward ──────────────────────

function MyPalIntroContent({ onContinue }: { onContinue: () => void }) {
  const insets = useSafeAreaInsets();

  const iconScale    = useRef(new Animated.Value(0.5)).current;
  const iconOpacity  = useRef(new Animated.Value(0)).current;
  const glowScale    = useRef(new Animated.Value(0.8)).current;
  const glowOpacity  = useRef(new Animated.Value(0)).current;
  const textOpacity  = useRef(new Animated.Value(0)).current;
  const textY        = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    // Icon entrance
    Animated.parallel([
      Animated.spring(iconScale,   { toValue: 1, friction: 7, tension: 55, useNativeDriver: true }),
      Animated.timing(iconOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
    ]).start(() => {
      // Glow pulse (loops)
      Animated.loop(Animated.sequence([
        Animated.parallel([
          Animated.timing(glowOpacity, { toValue: 0.55, duration: 1100, useNativeDriver: true }),
          Animated.timing(glowScale,   { toValue: 1.35, duration: 1100, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(glowOpacity, { toValue: 0,    duration: 1100, useNativeDriver: true }),
          Animated.timing(glowScale,   { toValue: 0.8,  duration: 1100, useNativeDriver: true }),
        ]),
      ])).start();
      // Text slides up
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 380, delay: 120, useNativeDriver: true }),
        Animated.timing(textY,       { toValue: 0, duration: 380, delay: 120, useNativeDriver: true }),
      ]).start();
    });
  }, []);

  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {/* Center content */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        {/* Icon + glow */}
        <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 36 }}>
          {/* Glow ring */}
          <Animated.View style={{
            position: 'absolute',
            width: 120, height: 120, borderRadius: 60,
            backgroundColor: 'rgba(10,132,255,0.10)',
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          }} />
          {/* Icon container */}
          <Animated.View style={[mp.iconWrap, { opacity: iconOpacity, transform: [{ scale: iconScale }] }]}>
            <Svg width={44} height={44} viewBox="0 0 24 24">
              <SvgPath d="M12 2.5l1.7 5.3 5.3 1.7-5.3 1.7L12 16.5l-1.7-5.3L5 9.5l5.3-1.7z" fill={L.accent} />
              <SvgPath d="M18.5 14l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8z" fill={L.accent} />
            </Svg>
          </Animated.View>
        </View>

        {/* Text */}
        <Animated.View style={{ alignItems: 'center', opacity: textOpacity, transform: [{ translateY: textY }] }}>
          <Text style={mp.headline}>Meet MyPal</Text>
          <Text style={mp.sub}>Your AI coach — chat anytime to adjust your plan or ask anything.</Text>
        </Animated.View>
      </View>

      {/* CTA */}
      <View style={s.bn}>
        <TouchableOpacity style={s.cb} onPress={onContinue} activeOpacity={0.85}>
          <Text style={s.ct}>Build my plan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const mp = StyleSheet.create({
  iconWrap: { width: 96, height: 96, borderRadius: 28, backgroundColor: 'rgba(10,132,255,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(10,132,255,0.14)', ...({ boxShadow: Elev.medium.shadow } as any) },
  headline: { fontFamily: FONT.displayBold, fontSize: 34, color: L.text, letterSpacing: -1, textAlign: 'center', marginBottom: 12 },
  sub:      { fontSize: 16, color: L.textSub, textAlign: 'center', lineHeight: 24, letterSpacing: -0.2 },
});

// ── The math ─────────────────────────────────────────────────────────────
// Ported from onboarding-test's computeWastedReps / getRealFormPct /
// CinematicMathScreen. Same numbers, same 13 lines in the same order —
// only the presentation changes (all lines stagger-fade onto one screen,
// one Continue, instead of one tap-gated line at a time).

const DURATION_WEEKS: Record<string, number> = {
  'Just starting': 2, '1-6 months': 13, '6-12 months': 39, '1-2 years': 78,
  '2-5 years': 182, '5-10 years': 390, '10+ years': 624,
};
const DURATION_PLAIN: Record<string, string> = {
  'Just starting': 'just starting out', '1-6 months': 'about 3 months', '6-12 months': 'about 9 months',
  '1-2 years': 'about 1.5 years', '2-5 years': 'about 3.5 years', '5-10 years': 'about 7.5 years', '10+ years': '12+ years',
};
const REPS_PER_SESSION_BY_DURATION: Record<string, number> = {
  '15-20 min': 60, '30 min': 90, '45 min': 120, '60 min': 150, '75+ min': 180,
};
const DEFAULT_REPS_PER_SESSION = 90;

function dayWord(n: number): string { return `${n} day${n === 1 ? '' : 's'}`; }

function computeWastedReps(answers: Record<string, any>) {
  const trainDurationLabel = (answers.trainDuration as string) ?? 'Just starting';
  const justStarting = trainDurationLabel === 'Just starting';
  const freq = parseInt(String(answers.days ?? '3 days'), 10) || 3;
  const durationLabel = answers.duration as string | undefined;
  const repsPerSession = REPS_PER_SESSION_BY_DURATION[durationLabel ?? ''] ?? DEFAULT_REPS_PER_SESSION;
  const pct = typeof answers.formGuess === 'number' ? answers.formGuess : 50;
  const weeks = justStarting ? 104 : (DURATION_WEEKS[trainDurationLabel] ?? 78);
  const weeksPlain = justStarting ? 'about 2 years ahead' : (DURATION_PLAIN[trainDurationLabel] ?? 'about 1.5 years');
  const totalSessions = Math.round(freq * weeks);
  const totalReps = totalSessions * repsPerSession;
  const wasted = Math.max(0, Math.round(totalReps * (1 - pct / 100)));
  return { trainDurationLabel, justStarting, freq, repsPerSession, pct, weeks, weeksPlain, totalSessions, totalReps, wasted };
}

function getRealFormPct(answers: Record<string, any>): number {
  if (typeof answers.formGuess === 'number') return answers.formGuess;
  if (typeof answers.demoGoodReps === 'number' && typeof answers.demoReps === 'number' && answers.demoReps > 0) {
    return Math.round((answers.demoGoodReps / answers.demoReps) * 100);
  }
  return 70;
}

function cinematicLines(answers: Record<string, any>): string[] {
  const m = computeWastedReps({ ...answers, formGuess: getRealFormPct(answers) });
  const sessionsPerYear = Math.round(m.freq * 52);
  const repsPerYear = m.repsPerSession * sessionsPerYear;
  const opener = m.justStarting
    ? `Let's imagine you do ${m.repsPerSession} reps a session.`
    : `Okay, so you said you do ${m.repsPerSession} reps a session.`;
  const trainLine = m.justStarting
    ? `And let's say you train ${dayWord(m.freq)} a week.`
    : `You train ${dayWord(m.freq)} a week.`;
  return [
    opener,
    trainLine,
    'There are 52 weeks in a year.',
    `${m.freq} × 52 = ${sessionsPerYear} sessions a year.`,
    `${m.repsPerSession} reps × ${sessionsPerYear} sessions = ${repsPerYear.toLocaleString()} reps a year.`,
    `Do that for ${m.weeksPlain}, and that's about ${m.totalReps.toLocaleString()} reps total.`,
    `You said ${m.pct}% of them are good form.`,
    `That means ${m.wasted.toLocaleString()} of them barely built anything.`,
    "That's months of muscle — gone.",
    "But that's not it.",
    'Every gym injury is a 4-6 week sideline.',
    'After just 4 weeks off, you start losing the strength you built.',
    'So one injury = months of progress, undone.',
  ];
}

const REVERSAL_LINES = [
  "But it's not too late.",
  'FormPal checks every rep.',
  'So from today, every one counts — and you build nearly 2x the muscle.',
];


// One line at a time: fade in (450ms), hold 2s, fade out (450ms), next.
// Last line fades in and stays; onDone fires so the caller can show
// Continue. Ported verbatim from onboarding-test's FadeSequence — the
// "sentence by sentence" reveal the user asked to keep.
function FadeSequence({ lines, onDone }: { lines: string[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const isLast = index === lines.length - 1;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let fadeOut: Animated.CompositeAnimation | null = null;
    const fadeIn = Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: false });
    fadeIn.start(({ finished }) => {
      if (!finished) return;
      void Haptics.selectionAsync();
      if (isLast) { onDone(); return; }
      holdTimer = setTimeout(() => {
        fadeOut = Animated.timing(opacity, { toValue: 0, duration: 450, useNativeDriver: false });
        fadeOut.start(({ finished: f2 }) => { if (f2) setIndex(i => i + 1); });
      }, 2000);
    });
    return () => {
      fadeIn.stop();
      if (holdTimer) clearTimeout(holdTimer);
      fadeOut?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return (
    <Animated.Text
      style={{
        opacity,
        fontFamily: FONT.display, fontSize: 29, lineHeight: 38, fontWeight: '600',
        color: L.text, textAlign: 'center',
        textShadowColor: 'rgba(255,255,255,0.9)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 },
      }}
    >
      {lines[index]}
    </Animated.Text>
  );
}

// ── GuessSlider — 0-100%, single track. The one demo leftover: "how many
// of your reps do you think are actually good form?"
function GuessSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [trackWidth, setTrackWidth] = useState(280);
  const [display, setDisplay] = useState(Math.round(value));
  const anim = useRef(new Animated.Value(value)).current;
  const startRef = useRef(value);
  useEffect(() => { anim.setValue(value); setDisplay(Math.round(value)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { startRef.current = (anim as any)._value ?? 50; },
    onPanResponderMove: (_, gs) => {
      const next = Math.max(0, Math.min(100, startRef.current + (gs.dx / trackWidth) * 100));
      anim.setValue(next);
      const r = Math.round(next);
      setDisplay(r); onChange(r);
    },
    onPanResponderRelease: (_, gs) => {
      const next = Math.round(Math.max(0, Math.min(100, startRef.current + (gs.dx / trackWidth) * 100)));
      anim.setValue(next); setDisplay(next); onChange(next);
    },
  })).current;
  const fillW = anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  const thumbL = anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  return (
    <View style={{ gap: 20, marginTop: 24 }}>
      <Text style={{ fontFamily: FONT.displayBold, fontSize: 52, color: L.text, letterSpacing: -1.5, textAlign: 'center' }}>{display}%</Text>
      <View
        style={{ height: 52, justifyContent: 'center' }}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        {...pan.panHandlers}
      >
        <View style={{ position: 'absolute', left: 0, right: 0, height: 10, borderRadius: 5, backgroundColor: '#EBEBF0', overflow: 'hidden' }}>
          <Animated.View style={{ height: '100%', width: fillW, backgroundColor: L.accent }} />
        </View>
        <Animated.View style={{ position: 'absolute', left: thumbL, marginLeft: -15, width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', ...({ boxShadow: Elev.medium.shadow } as any) }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 12, color: L.textDim }}>None of them</Text>
        <Text style={{ fontSize: 12, color: L.textDim }}>Every one</Text>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

type AppState =
  | 'welcome' | 'onboarding' | 'calcMath' | 'cinematic' | 'reversal'
  // Rank run — moved to AFTER the math (was a set of question-flow steps).
  | 'rankWheel' | 'rankAssess' | 'rankReveal'
  // The four pre-paywall WebView pages (assets/*.html), in order.
  | 'generatePlan' | 'planReady' | 'trialTimeline' | 'webPaywall';

type EditField = 'age' | 'height' | 'weight' | 'experience';

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [appState,  setAppState]  = useState<AppState>('welcome');
  const [stepIndex, setStepIndex] = useState(0);
  const [answers,   setAnswers]   = useState<Record<string, any>>({});
  const [plan,      setPlan]      = useState<{ focus: string; exercises: WorkoutExercise[] } | null>(null);
  // Tap-feedback only, for single-select questions — see handleSelect below
  // for why this exists separately from `answers`.
  const [justSelected, setJustSelected] = useState<string | null>(null);
  // Gates the Continue button on the cinematic-math + reversal screens until
  // every line has faded in.
  const [mathLinesDone, setMathLinesDone] = useState(false);
  // Which single info field the plan-ready page's pencil opened for editing
  // (null = not editing). Rendered as an overlay so the WebView stays put.
  const [editField, setEditField] = useState<EditField | null>(null);

  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Hero (welcome screen) + demo (demoClip step) clips. Created
  // unconditionally so the hooks are stable; a null source just renders
  // black until the real files are dropped in (see HERO_VIDEO / DEMO_VIDEO).
  const heroPlayer = useVideoPlayer(HERO_VIDEO, p => { p.loop = true; p.muted = true; p.play(); });
  const demoPlayer = useVideoPlayer(DEMO_VIDEO, p => { p.loop = true; p.muted = true; p.play(); });

  const visibleSteps = getVisibleSteps(answers);
  const currentStep  = visibleSteps[stepIndex];
  const progress     = visibleSteps.length > 0 ? (stepIndex + 1) / visibleSteps.length : 0;

  // Preload every answer-choice icon up front. They're already require()'d
  // (so Metro bundles them), but each <Image> still decodes lazily the
  // first time it mounts — clicking through screens fast enough outran that
  // decode and showed a blank/glitchy icon for a frame. Asset.loadAsync
  // forces them into the native image cache once, here, before any of them
  // are ever shown.
  useEffect(() => {
    Asset.loadAsync(Object.values(ICON)).catch(() => {});
  }, []);

  const animTrans = (dir: 'forward' | 'back', cb: () => void) => {
    const out = dir === 'forward' ? -36 : 36;
    const inn = dir === 'forward' ? 36 : -36;
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: out, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      cb();
      slideAnim.setValue(inn);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      ]).start();
    });
  };

  const advance = (ans: Record<string, any>) => {
    const vis = getVisibleSteps(ans);
    if (stepIndex < vis.length - 1) {
      animTrans('forward', () => setStepIndex(i => i + 1));
    } else {
      setAppState('calcMath');
    }
  };

  const goBack = () => {
    setJustSelected(null);
    if (stepIndex > 0) {
      animTrans('back', () => setStepIndex(i => i - 1));
    } else {
      setAppState('welcome');
    }
  };

  const handleSelect = (opt: string) => {
    const st = currentStep;
    if (!st) return;
    haptic();
    if (st.type === 'multiselect') {
      const cur = (answers[st.id] as string[]) || [];
      if (st.clearAllOption && opt === st.clearAllOption) {
        const isSel = cur.includes(opt);
        setAnswers({ ...answers, [st.id]: isSel ? [] : [opt] });
      } else {
        const withoutClear = st.clearAllOption ? cur.filter(o => o !== st.clearAllOption) : cur;
        const next = withoutClear.includes(opt)
          ? withoutClear.filter(o => o !== opt)
          : [...withoutClear, opt];
        setAnswers({ ...answers, [st.id]: next });
      }
    } else {
      // Single-select auto-advance: previously called setAnswers(next)
      // immediately, then advanced 300ms later. But `visibleSteps` (and
      // therefore `currentStep`) is recomputed from `answers` on every
      // render — for any question with a showIf further down the list
      // (homeSplit, homeEquipment, gymMissingEquipment...), that immediate
      // answers update could change which step landed at the SAME
      // stepIndex mid-delay, flashing that step's content for the rest of
      // the 300ms before advance() finally moved stepIndex forward.
      // justSelected gives the tapped option its immediate visual
      // highlight without touching `answers` (and therefore
      // `visibleSteps`) until the actual navigation happens.
      setJustSelected(opt);
      setTimeout(() => {
        const next = { ...answers, [st.id]: opt };
        setAnswers(next);
        advance(next);
        setJustSelected(null);
      }, 300);
    }
  };

  const finishOnboarding = async () => {
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/(tabs)');
  };

  // ── WELCOME — hero video (Cal-AI style): full-bleed clip of the app
  // catching a rep, headline + CTA over the bottom. Black frame until the
  // real file is dropped in (HERO_VIDEO).

  if (appState === 'welcome') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {HERO_VIDEO
          ? <VideoView player={heroPlayer} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
          : <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, letterSpacing: 0.5 }}>hero clip goes here</Text>
            </View>}
        {/* Legibility scrim behind the text */}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.85)']}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom + 24, paddingHorizontal: 28, justifyContent: 'flex-end' }}>
          <Text style={h.wordmark}>FORMPAL</Text>
          <Text style={h.title}>Every rep, checked.</Text>
          <Text style={h.sub}>Your AI form coach — it watches every rep, counts the clean ones, and tells you what to fix.</Text>
          <TouchableOpacity style={h.btn} onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); setStepIndex(0); setAppState('onboarding'); }} activeOpacity={0.85}>
            <Text style={h.btnTxt}>Build my plan</Text>
          </TouchableOpacity>
          {/* DEV — jump straight to the post-math sequence (rank → generate
              plan → plan ready → trial → paywall) to test the new pages
              without going through every question. */}
          <TouchableOpacity
            onPress={() => { haptic(); setMathLinesDone(false); setAppState('rankWheel'); }}
            style={{ alignSelf: 'center', marginTop: 14, paddingVertical: 8, paddingHorizontal: 16 }}
            activeOpacity={0.7}
          >
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '600' }}>Skip to rank (dev)</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── ONBOARDING ───────────────────────────────────────────────────────────────

  if (appState === 'onboarding' && currentStep) {
    const st = currentStep;

    const header = (
      <View style={s.qh}>
        <TouchableOpacity onPress={goBack} style={s.bb}>
          <Sym name="chevron.left" size={16} color={L.textSub} />
        </TouchableOpacity>
        <View style={s.pc}>
          <View style={s.pt}><View style={[s.pf, { width: `${progress * 100}%` }]} /></View>
        </View>
        <TouchableOpacity onPress={finishOnboarding} style={s.skipBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.skipTxt}>Skip</Text>
        </TouchableOpacity>
      </View>
    );

    // Wheel
    if (st.type === 'wheel') {
      const isHeight   = st.wheelKind === 'height';
      const opts       = isHeight ? HEIGHT_OPTIONS : AGE_OPTIONS;
      const defaultVal = isHeight ? `5'8"` : '16';
      const wheelVal   = (answers[st.id] as string) || defaultVal;
      return (
        <OnboardingBackground>
          <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
            {header}
            <View style={{ paddingHorizontal: 24, paddingTop: 20, flex: 1 }}>
              <Text style={s.qq}>{st.question}</Text>
              <Picker selectedValue={wheelVal} onValueChange={(v) => setAnswers({ ...answers, [st.id]: v as string })} style={{ height: 230 }} itemStyle={{ color: L.text, fontSize: 28, fontWeight: '600' }}>
                {opts.map(o => <Picker.Item key={o} label={o} value={o} />)}
              </Picker>
            </View>
            <View style={s.bn}>
              <TouchableOpacity style={s.cb} onPress={() => advance({ ...answers, [st.id]: wheelVal })} activeOpacity={0.85}>
                <Text style={s.ct}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </OnboardingBackground>
      );
    }


    // Slider (home/gym split)
    if (st.type === 'slider') {
      const sliderVal = typeof answers[st.id] === 'number' ? (answers[st.id] as number) : 50;
      return (
        <OnboardingBackground>
          <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
            {header}
            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
              <Animated.View style={{ opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
                <Text style={s.qq}>{st.question}</Text>
                <HomeSplitSlider value={sliderVal} onChange={(v) => setAnswers({ ...answers, [st.id]: v })} />
              </Animated.View>
            </ScrollView>
            <View style={s.bn}>
              <TouchableOpacity style={s.cb} onPress={() => { const ans = { ...answers, [st.id]: sliderVal }; setAnswers(ans); advance(ans); }} activeOpacity={0.85}>
                <Text style={s.ct}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </OnboardingBackground>
      );
    }

    // Ruler (desired weight, relative to the already-entered current weight)
    if (st.type === 'ruler') {
      const rulerVal = typeof answers[st.id] === 'number' ? (answers[st.id] as number) : 160;
      return (
        <OnboardingBackground>
          <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
            {header}
            <View style={{ paddingHorizontal: 24, paddingTop: 20, flex: 1 }}>
              <Text style={s.qq}>{st.question}</Text>
              <WeightRulerSlider
                value={rulerVal}
                onChange={(v) => setAnswers({ ...answers, [st.id]: v })}
              />
            </View>
            <View style={s.bn}>
              <TouchableOpacity style={s.cb} onPress={() => advance({ ...answers, [st.id]: rulerVal })} activeOpacity={0.85}>
                <Text style={s.ct}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </OnboardingBackground>
      );
    }

    // Text — free-text input (the name step). Continue enabled once there's
    // a non-blank value; the trimmed string is stored as the answer.
    if (st.type === 'text') {
      const raw = typeof answers[st.id] === 'string' ? (answers[st.id] as string) : '';
      const ready = raw.trim().length > 0;
      return (
        <OnboardingBackground>
          <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
            {header}
            <View style={{ paddingHorizontal: 24, paddingTop: 20, flex: 1 }}>
              <Text style={s.qq}>{st.question}</Text>
              <TextInput
                value={raw}
                onChangeText={(t) => setAnswers({ ...answers, [st.id]: t })}
                placeholder={st.placeholder}
                placeholderTextColor={L.textDim}
                autoFocus
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={() => { if (ready) advance({ ...answers, [st.id]: raw.trim() }); }}
                style={s.textInput}
              />
            </View>
            <View style={s.bn}>
              <TouchableOpacity style={[s.cb, !ready && s.cbDisabled]} disabled={!ready} onPress={() => advance({ ...answers, [st.id]: raw.trim() })} activeOpacity={0.85}>
                <Text style={[s.ct, !ready && s.ctDisabled]}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </OnboardingBackground>
      );
    }

    // Location bubbles — tap a sphere to pick, then Continue.
    if (st.type === 'locationBubbles') {
      const picked = (answers[st.id] as string) || null;
      return (
        <OnboardingBackground>
          <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
            {header}
            <View style={{ paddingHorizontal: 24, paddingTop: 20, flex: 1 }}>
              <Text style={s.qq}>{st.question}</Text>
              <LocationBubbles
                selected={picked}
                onPick={(label) => { haptic(); setAnswers({ ...answers, [st.id]: label }); }}
              />
            </View>
            <View style={s.bn}>
              <TouchableOpacity style={[s.cb, !picked && s.cbDisabled]} disabled={!picked} onPress={() => advance(answers)} activeOpacity={0.85}>
                <Text style={[s.ct, !picked && s.ctDisabled]}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </OnboardingBackground>
      );
    }

    // Guess slider — 0-100%, feeds the math. Always shown.
    if (st.type === 'guessSlider') {
      const val = typeof answers[st.id] === 'number' ? (answers[st.id] as number) : 50;
      return (
        <OnboardingBackground>
          <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
            {header}
            <View style={{ paddingHorizontal: 24, paddingTop: 20, flex: 1 }}>
              <Text style={s.qq}>{st.question}</Text>
              <GuessSlider value={val} onChange={(v) => setAnswers({ ...answers, [st.id]: v })} />
            </View>
            <View style={s.bn}>
              <TouchableOpacity style={s.cb} onPress={() => advance({ ...answers, [st.id]: val })} activeOpacity={0.85}>
                <Text style={s.ct}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </OnboardingBackground>
      );
    }

    // Rank WebView screen — full-screen HTML artifact, its own back button.
    if (st.type === 'webview' && st.htmlKey) {
      return (
        <OnboardingWebScreen
          htmlKey={st.htmlKey}
          topInset={insets.top}
          onAdvance={() => advance(answers)}
          onBack={goBack}
        />
      );
    }

    // Video clip — full-bleed player (black until the file exists), headline
    // + caption over the bottom, Continue. Used for the demo.
    if (st.type === 'videoClip') {
      return (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {DEMO_VIDEO
            ? <VideoView player={demoPlayer} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
            : <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, letterSpacing: 0.5 }}>demo clip goes here</Text>
              </View>}
          <LinearGradient
            colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom + 24, paddingHorizontal: 28 }}>
            <TouchableOpacity onPress={goBack} style={[s.bb, { backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'transparent' }]}>
              <Sym name="chevron.left" size={16} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <Text style={h.title}>{st.question}</Text>
            {!!st.subtitle && <Text style={h.sub}>{st.subtitle}</Text>}
            <TouchableOpacity style={h.btn} onPress={() => advance(answers)} activeOpacity={0.85}>
              <Text style={h.btnTxt}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // Interstitial — the one persuasion beat still in the flow: fact1, the
    // structured-plan stat (PlanGrowthMoment), sitting right after
    // followPlan. Takes the same shared header + CTA as every other step.
    if (st.type === 'interstitial') {
      const content = <PlanGrowthMoment header={header} insets={insets} onContinue={() => advance(answers)} />;
      return <OnboardingBackground>{content}</OnboardingBackground>;
    }

    // Select / multiselect — notification overlay is absolute (not in scroll)
    const isSel      = (o: string) => {
      if (st.type === 'select' && justSelected !== null) return o === justSelected;
      const a = answers[st.id];
      return Array.isArray(a) ? a.includes(o) : a === o;
    };
    const multiReady = st.type === 'multiselect' && Array.isArray(answers[st.id]) && (answers[st.id] as string[]).length > 0;
    const isNotif    = st.id === 'notifications';

    return (
      <OnboardingBackground>
        {/* Notification overlay — absolute, never pushes content */}
        {isNotif && <NotificationBanner topOffset={insets.top} />}

        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          {header}
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
              <Text style={s.qq}>{st.question}</Text>
              {st.subtitle && <Text style={s.qqSub}>{st.subtitle}</Text>}
              {resolveOptions(st.options, answers).map((o, i) => {
                const sel = isSel(o.label);
                const sym = o.sfSymbol || 'person.fill';
                return (
                  <AnimatedOption key={`${st.id}-${o.label}`} index={i} style={[s.opt, sel && s.optSel]} onPress={() => handleSelect(o.label)}>
                    <View style={[s.optIcon, o.customIcon && s.optIconBadge]}>
                      {o.customIcon
                        // No tintColor here — these webp icons render as a
                        // solid grey box instead of the silhouette when
                        // tinted (alpha channel isn't coming through), so
                        // show them plain. Most of these have an opaque
                        // white background baked into the image (not
                        // transparent) — clipped into optIconBadge's rounded
                        // square via overflow:hidden instead of showing as a
                        // stark white square against the row.
                        ? <Image source={o.customIcon} style={s.optIconImg} resizeMode="cover" />
                        : <Sym name={sym} size={24} color={sel ? L.accent : L.textSub} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.optTxt, sel && s.optTxtSel]}>{o.label}</Text>
                      {o.sublabel && <Text style={s.optSublabel}>{o.sublabel}</Text>}
                    </View>
                    <View style={[s.radio, sel && s.radioSel]}>
                      {sel && <Sym name="checkmark" size={11} color="#fff" />}
                    </View>
                  </AnimatedOption>
                );
              })}
            </Animated.View>
          </ScrollView>
          {st.type === 'multiselect' && (
            <View style={s.bn}>
              <TouchableOpacity style={[s.cb, !multiReady && s.cbDisabled]} disabled={!multiReady} onPress={() => advance(answers)} activeOpacity={0.85}>
                <Text style={[s.ct, !multiReady && s.ctDisabled]}>Continue</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </OnboardingBackground>
    );
  }

  // ── CALCULATING (the math) — short processing beat ───────────────────────────

  if (appState === 'calcMath') {
    return <CalcMathBeat onDone={() => setAppState('cinematic')} />;
  }

  // ── CINEMATIC MATH — the "two versions of you" wasted-muscle graph, with
  // the years / reps-lost / months-lost numbers rewritten from the answers.

  if (appState === 'cinematic') {
    return (
      <OnboardingWebScreen
        htmlKey="cinematicGraph"
        topInset={insets.top}
        extraJs={cinematicGraphInject(answers)}
        onAdvance={() => setAppState('rankWheel')}
        onBack={() => setAppState('calcMath')}
      />
    );
  }

  // ── REVERSAL — 3 lines, same treatment ──────────────────────────────────────

  if (appState === 'reversal') {
    return (
      <OnboardingBackground>
        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
            <FadeSequence key="reversal" lines={REVERSAL_LINES} onDone={() => setMathLinesDone(true)} />
          </View>
          {mathLinesDone && (
            <View style={s.bn}>
              <TouchableOpacity style={s.cb} onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); setMathLinesDone(false); setAppState('rankWheel'); }} activeOpacity={0.85}>
                <Text style={s.ct}>Continue</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </OnboardingBackground>
    );
  }

  // ── Rank run — now AFTER the math. Same WebView artifacts as before. ────────

  if (appState === 'rankWheel') {
    return (
      <OnboardingWebScreen
        htmlKey="rankWheel"
        topInset={insets.top}
        onAdvance={() => setAppState('rankAssess')}
        onBack={() => setAppState('cinematic')}
      />
    );
  }

  if (appState === 'rankAssess') {
    return (
      <OnboardingWebScreen
        htmlKey="strengthAssessment"
        topInset={insets.top}
        onAdvance={() => setAppState('rankReveal')}
        onBack={() => setAppState('rankWheel')}
      />
    );
  }

  if (appState === 'rankReveal') {
    return (
      <OnboardingWebScreen
        htmlKey="rankReveal"
        topInset={insets.top}
        extraJs={rankRevealInject(answers)}
        onAdvance={() => setAppState('generatePlan')}
        onBack={() => setAppState('rankAssess')}
      />
    );
  }

  // ── The four pre-paywall WebView pages (assets/*.html). Each advances on
  // its own CTA (the inject catches the button text); planReady gets the
  // user's answers rewritten into its stat slots. ───────────────────────────

  if (appState === 'generatePlan') {
    return (
      <OnboardingWebScreen
        htmlKey="generatePlan"
        topInset={insets.top}
        onAdvance={() => setAppState('planReady')}
        onBack={() => setAppState('rankReveal')}
      />
    );
  }

  if (appState === 'planReady') {
    return (
      <View style={{ flex: 1 }}>
        <OnboardingWebScreen
          htmlKey="planReady"
          topInset={insets.top}
          extraJs={planReadyInject(answers)}
          onAdvance={() => setAppState('trialTimeline')}
          onBack={() => setAppState('generatePlan')}
          // A pencil opens a one-field editor OVER the page — the WebView
          // stays mounted, so closing it doesn't reload / re-animate.
          onEditInfo={(f) => setEditField(f as EditField)}
        />
        {editField && (
          <EditFieldOverlay
            field={editField}
            answers={answers}
            topInset={insets.top}
            onSave={(patch) => { setAnswers(a => ({ ...a, ...patch })); setEditField(null); }}
            onClose={() => setEditField(null)}
          />
        )}
      </View>
    );
  }

  if (appState === 'trialTimeline') {
    return (
      <OnboardingWebScreen
        htmlKey="trialTimeline"
        topInset={insets.top}
        onAdvance={() => setAppState('webPaywall')}
        onBack={() => setAppState('planReady')}
      />
    );
  }

  if (appState === 'webPaywall') {
    return (
      <OnboardingWebScreen
        htmlKey="paywall"
        topInset={insets.top}
        onAdvance={finishOnboarding}
        onBack={() => setAppState('trialTimeline')}
      />
    );
  }

  return null;
}

// Short "analyzing your reps" beat before the math.
function CalcMathBeat({ onDone }: { onDone: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(opacity, { toValue: 1, duration: 420, useNativeDriver: true });
    a.start();
    const t = setTimeout(onDone, 1700);
    return () => { a.stop(); clearTimeout(t); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <OnboardingBackground>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Animated.Text style={{ opacity, fontFamily: FONT.display, fontSize: 22, color: L.text, letterSpacing: -0.3 }}>
          Analyzing your reps...
        </Animated.Text>
      </View>
    </OnboardingBackground>
  );
}

// ── EditFieldOverlay — a pencil on the plan-ready page opens ONE field
// here, over the still-mounted page. Number fields get a keyboard; the
// experience field gets its four options. Save/Cancel dismiss it. ────────────

const EXPERIENCE_OPTS = ['Beginner', 'Some experience', 'Intermediate', 'Advanced'];
const FIELD_META: Record<EditField, { title: string; kbd: 'number-pad' | 'default'; ph: string; unit?: string }> = {
  age:        { title: 'age',        kbd: 'number-pad', ph: '27' },
  height:     { title: 'height',     kbd: 'default',    ph: `5'10"` },
  weight:     { title: 'weight',     kbd: 'number-pad', ph: '168', unit: 'lb' },
  experience: { title: 'experience', kbd: 'default',    ph: '' },
};

function EditFieldOverlay({ field, answers, topInset, onSave, onClose }: {
  field: EditField;
  answers: Record<string, any>;
  topInset: number;
  onSave: (patch: Record<string, any>) => void;
  onClose: () => void;
}) {
  const meta = FIELD_META[field];
  const initial =
    field === 'weight' ? (typeof answers.weight === 'number' ? String(Math.round(answers.weight)) : '') :
    field === 'experience' ? (typeof answers.experience === 'string' ? answers.experience : 'Intermediate') :
    (answers[field] != null ? String(answers[field]) : '');
  const [val, setVal] = useState<string>(initial);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    if (field === 'experience') { onSave({ experience: val }); return; }
    if (field === 'weight') {
      const n = parseFloat(val);
      onSave(Number.isNaN(n) ? {} : { weight: n });
      return;
    }
    onSave(val.trim() ? { [field]: val.trim() } : {});
  };

  return (
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(17,24,39,0.35)' }]} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
      <Animated.View
        style={{
          width: '100%',
          backgroundColor: L.card, borderTopLeftRadius: 26, borderTopRightRadius: 26,
          paddingHorizontal: 22, paddingTop: 18, paddingBottom: 34,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [220, 0] }) }],
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Text style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: '600', color: L.text, letterSpacing: -0.3 }}>Edit {meta.title}</Text>
          <LiquidGlassButton
            onPress={onClose}
            hitSlop={12}
            radius={17}
            variant="regular"
            fallbackColor="rgba(255,255,255,0.92)"
            style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.10)' }}
          >
            <Sym name="xmark" size={14} color={L.text} />
          </LiquidGlassButton>
        </View>

        {field === 'experience' ? (
          <View style={{ gap: 8 }}>
            {EXPERIENCE_OPTS.map(o => {
              const sel = val === o;
              return (
                <TouchableOpacity key={o} onPress={() => { haptic(); setVal(o); }} activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, borderWidth: 1, borderColor: sel ? L.accent : L.border, backgroundColor: sel ? L.accentSoft : L.card, paddingHorizontal: 16, paddingVertical: 14 }}>
                  <Text style={{ fontSize: 15, color: L.text, fontWeight: sel ? W.semi : W.medium }}>{o}</Text>
                  {sel && <Sym name="checkmark" size={13} color={L.accent} />}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <TextInput
            autoFocus
            value={val}
            onChangeText={setVal}
            keyboardType={meta.kbd}
            placeholder={meta.ph}
            placeholderTextColor={L.textDim}
            returnKeyType="done"
            onSubmitEditing={save}
            style={{ backgroundColor: L.bg, borderRadius: 14, borderWidth: 1, borderColor: L.border, paddingHorizontal: 16, paddingVertical: 16, fontSize: 22, color: L.text }}
          />
        )}

        <TouchableOpacity style={[s.cb, { marginTop: 18 }]} activeOpacity={0.85} onPress={save}>
          <Text style={s.ct}>Save</Text>
        </TouchableOpacity>
      </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Progress bar header
  qh: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  bb: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: L.card, borderWidth: 1, borderColor: L.border, ...({ boxShadow: Elev.low.shadow } as any) },
  pc: { flex: 1, paddingHorizontal: 12 },
  pt: { height: 4, backgroundColor: 'rgba(17,24,39,0.08)', borderRadius: 2, overflow: 'hidden' },
  pf: { height: 4, backgroundColor: L.accent, borderRadius: 2 },
  skipBtn: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  skipTxt: { fontSize: 14, fontWeight: W.semi, color: L.textSub },

  // Question
  qq:     { fontFamily: FONT.display, fontSize: 30, color: L.text, lineHeight: 38, marginBottom: 20, letterSpacing: -0.6 },
  qqSub:  { fontSize: 14, color: L.textSub, lineHeight: 21, marginTop: -12, marginBottom: 20 },
  textInput: { backgroundColor: L.card, borderRadius: 16, borderWidth: 1, borderColor: L.border, paddingHorizontal: 18, paddingVertical: 16, fontSize: 18, color: L.text, ...({ boxShadow: Elev.low.shadow } as any) },

  // Options
  opt:        { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: L.card, borderRadius: 16, borderWidth: 1, borderColor: L.border, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 10, ...({ boxShadow: Elev.low.shadow } as any) },
  optSel:     { borderColor: L.accent, backgroundColor: L.accentSoft },
  // No boxed background — selection is already conveyed by the icon's own
  // color (accent when selected, muted gray otherwise, see the render
  // above), so the gray square backdrop was pure redundant chrome, not
  // carrying its own information. Fixed-width slot only, to keep every
  // option's label starting at the same x position regardless of glyph width.
  optIcon:      { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  optIconBadge: { borderRadius: 14, overflow: 'hidden', backgroundColor: L.card, borderWidth: 1, borderColor: L.border },
  // Smaller than optIconBadge's 44×44 on purpose — filling the badge exactly
  // (cover, edge-to-edge) cropped these icons' own glyphs at the edges.
  // Leaving margin inside the same-size badge keeps the glyph fully visible.
  optIconImg:   { width: 32, height: 32 },
  optTxt:     { fontSize: 15, fontWeight: W.medium, color: L.text, letterSpacing: -0.2 },
  optTxtSel:  { fontWeight: W.semi },
  optSublabel:{ fontSize: 12, color: L.textSub, marginTop: 2 },
  radio:      { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'rgba(17,24,39,0.12)', alignItems: 'center', justifyContent: 'center' },
  radioSel:   { backgroundColor: L.accent, borderColor: L.accent },

  // Bottom bar — no background/border now, just the button floating directly
  // on AppBackground's colorful gradient (was an opaque white bar with a
  // hairline top border, reported as an unwanted "white box"). The button
  // itself (cb, solid dark pill) still reads clearly without a backing
  // surface, so nothing here was actually load-bearing for legibility.
  bn:         { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingBottom: 24, paddingTop: 16 },
  cb:         { backgroundColor: L.btnDark, borderRadius: 100, paddingVertical: 18, alignItems: 'center', ...({ boxShadow: Elev.medium.shadow } as any) },
  cbDisabled: { backgroundColor: '#EBEBF0' },
  ct:         { fontFamily: FONT.displayBold, fontSize: 16, color: '#fff', letterSpacing: 0.1 },
  ctDisabled: { color: L.textDim },

  // Welcome
  logoDot:       { width: 12, height: 12, borderRadius: 6, backgroundColor: L.accent, marginBottom: 20 },
  wordmarkBig:   { fontSize: 13, fontWeight: W.bold, color: L.textDim, textAlign: 'center', letterSpacing: 2.5, marginBottom: 32 },
  welcomeTitle:  { fontFamily: FONT.displayBold, fontSize: 32, color: L.text, textAlign: 'center', lineHeight: 40, letterSpacing: -1, marginBottom: 14 },
  welcomeSub:    { fontSize: 15, color: L.textSub, textAlign: 'center', lineHeight: 23, marginBottom: 48, paddingHorizontal: 8 },
  primaryBtn:    { backgroundColor: L.btnDark, borderRadius: 100, paddingVertical: 18, alignItems: 'center', ...({ boxShadow: Elev.medium.shadow } as any) },
  primaryBtnTxt: { fontFamily: FONT.displayBold, fontSize: 17, color: '#fff', letterSpacing: 0.1 },

  // Payoff
  projRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionIconWrap:{ width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(10,132,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  qs:             { fontSize: 11, fontWeight: W.bold, color: L.accent, letterSpacing: 1.5 },
  qsub:           { fontSize: 14, color: L.textSub, lineHeight: 21, marginBottom: 24, letterSpacing: -0.1 },
  heroCard:       { backgroundColor: L.card, borderRadius: 22, borderWidth: 1, borderColor: L.border, padding: 20, marginBottom: 16, ...({ boxShadow: Elev.medium.shadow } as any) },
  heroLabel:      { fontSize: 11, fontWeight: W.bold, color: L.textDim, letterSpacing: 1.5, marginBottom: 6 },
  heroFocus:      { fontFamily: FONT.displayBold, fontSize: 24, color: L.text, letterSpacing: -0.6, marginBottom: 16 },
  exRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border },
  exName:         { fontSize: 15, fontWeight: W.semi, color: L.text, letterSpacing: -0.2 },
  exScheme:       { fontSize: 13, color: L.textSub, marginTop: 2 },
  fcTag:          { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(10,132,255,0.08)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 100 },
  fcTxt:          { fontSize: 11, fontWeight: W.bold, color: L.accent, letterSpacing: 0.2 },
});

// Hero / video-clip overlays — white text on a dark clip.
const h = StyleSheet.create({
  wordmark: { fontSize: 12, fontWeight: W.bold, color: 'rgba(255,255,255,0.6)', letterSpacing: 2.5, marginBottom: 12 },
  title:    { fontFamily: FONT.displayBold, fontSize: 34, color: '#fff', letterSpacing: -1, lineHeight: 40, marginBottom: 12 },
  sub:      { fontSize: 15, color: 'rgba(255,255,255,0.82)', lineHeight: 22, marginBottom: 24 },
  btn:      { backgroundColor: '#fff', borderRadius: 100, paddingVertical: 18, alignItems: 'center' },
  btnTxt:   { fontFamily: FONT.displayBold, fontSize: 16, color: '#0B1020', letterSpacing: 0.1 },
});
