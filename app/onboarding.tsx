import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView,
  Animated, PanResponder, Image, TextInput, Pressable, Easing, KeyboardAvoidingView, Alert, Dimensions,
  unstable_batchedUpdates,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
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
import { LiquidGlassButton } from '../components/LiquidGlass';
import RankWheelScreen from '../components/onboarding/RankWheelScreen';
import SaveProgressScreen from '../components/onboarding/SaveProgressScreen';
import TryForFreeScreen from '../components/onboarding/TryForFreeScreen';
import { PUSHUP_ICON, PULLUP_ICON, SQUAT_ICON } from '../assets/onboarding/onbIcons';
import { FONT, W, Col, Elev } from '../constants/theme';
import { computeGoalPlan } from '../lib/onboardingGoals';

// Onboarding video clips — drop the real files in at these paths and flip
// the consts to require(...). null renders a plain black frame instead, so
// the flow is fully testable before the footage exists.
//   hero — the app catching a rep (green check / red x firing), first screen
//   demo — a single rep that doesn't count, shown before the math
const HERO_VIDEO: any = require('../assets/videos/demovid.mov');
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

// Every question screen sits on plain white now (matches the new design
// system / the artboards), not the colourful-blob AppBackground.
function OnboardingBackground({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: '#ffffff' }}>{children}</View>;
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

// strengthassesment.html keeps its entered numbers in its own component
// instance (this.state.vals), which the outer bootstrap script never
// exposes on `window` — so nothing the user enters (or leaves at 0) ever
// reached RN at all. THAT was the real bug behind "I skipped everything but
// still got Silver": the rank was never computed from these answers in the
// first place. Since we can't reach the instance directly, read it back off
// the rendered DOM instead — only the ACTIVE exercise's wheel is mounted at
// a time (renderVals() only builds `wheels` for `defs[at]`), so poll for
// whichever card label is the "on" one (color #111114, vs #9a9aa2 off) and
// read its wheel's big tabular-nums value(s), accumulating into a running
// map keyed by exercise. Posts 'savals:<json>' any time that map changes —
// by the time Continue is tapped, RN already has the latest numbers for all
// 4 moves, not just whichever was on-screen last.
const STRENGTH_CAPTURE_JS = `
(function(){
  var LABELS = { 'Push-ups': 'pushup', 'Pull-ups': 'pullup', 'Squats': 'squat', 'Deadlift': 'deadlift' };
  var vals = { pushup: { reps: 0 }, pullup: { reps: 0 }, squat: { reps: 0 }, deadlift: { weight: 0, reps: 0 } };
  var last = '';
  function post(m){ try{ window.ReactNativeWebView.postMessage(m); }catch(e){} }
  function num(t){ var n = parseInt(String(t).replace(/[^0-9]/g,''), 10); return isNaN(n) ? 0 : n; }
  function poll(){
    try {
      var divs = document.querySelectorAll('#dc-root div');
      var activeKey = null;
      for (var i=0;i<divs.length;i++){
        var el = divs[i];
        if (el.children.length) continue;
        var t = (el.textContent||'').trim();
        var key = LABELS[t];
        if (!key) continue;
        var cs = getComputedStyle(el);
        if (cs.color === 'rgb(17, 17, 20)') { activeKey = key; break; }
      }
      if (!activeKey) return;
      var valueEls = document.querySelectorAll('#dc-root div[style*="38px"][style*="tabular-nums"]');
      if (!valueEls.length) return;
      if (activeKey === 'deadlift' && valueEls.length >= 2) {
        vals.deadlift.weight = num(valueEls[0].textContent);
        vals.deadlift.reps = num(valueEls[1].textContent);
      } else {
        vals[activeKey].reps = num(valueEls[0].textContent);
      }
      var enc = JSON.stringify(vals);
      if (enc !== last) { last = enc; post('savals:' + enc); }
    } catch(e){}
  }
  setInterval(poll, 260);
  document.addEventListener('pointerup', function(){ setTimeout(poll, 30); }, true);
  document.addEventListener('click', function(){ setTimeout(poll, 30); }, true);
  true;
})();
`;

const ONB_HTML = {
  // Redesigned rank run + the goal-route graph (Claude Design artboards).
  // All these DC pages live in assets/app screens/. rankwheel2.html is gone
  // — RankWheelScreen (native) replaced it entirely, the HTML version was
  // never actually rendered any more. cinematicgraph.html is gone too — the
  // rank-framed two-routes graph was dropped from the flow in favor of
  // reusing recoveryroute.html, goal-framed, right after the rank reveal.
  strengthAssessment: require('../assets/app screens/strengthassesment.html'),
  // The reel-style reveal artboard (renamed from "FormPal Rank Reveal.html"
  // — the space in that filename made the WebView's require()'d asset URL
  // 404 as "asset not found" on device; every other DC page here uses a
  // no-space filename for the same reason). The bronze/silver LADDER rows
  // and get target() were edited to read window.__FORMPAL_RANK_KEY /
  // __FORMPAL_RANK_LABEL / __FORMPAL_PERCENTILE_NOTE (set by
  // rankRevealPreloadJs below) so it lands on and displays the user's real
  // computed rank instead of the file's own hardcoded "Bronze II" demo.
  rankReveal:         require('../assets/app screens/rankrevealreel.html'),
  // The pre-paywall pages. They render with their built-in default copy;
  // planReady gets its slots rewritten from the user's answers (see the
  // *Inject helpers).
  generatePlan:       require('../assets/app screens/generateplan.html'),
  planReady:          require('../assets/app screens/planisreadynow.html'),
  trialTimeline:      require('../assets/app screens/trialtimeline2.html'),
  paywall:            require('../assets/app screens/paywall.html'),
  // Real Claude-Design artboards for steps that were native placeholders
  // (plain "PLACEHOLDER — DESIGN COMING" text / a hand-built slider /
  // native centered-text component) — used directly via WebView, not
  // rebuilt natively, per explicit direction. Same keys as their STEPS
  // ids where applicable, for easy tracing.
  giveVsWithout:       require('../assets/app screens/plancomp.html'),
  giveRealisticTarget: require('../assets/app screens/realistictarget.html'),
  formConfidence:      require('../assets/app screens/formconfidence.html'),
  goalPace:            require('../assets/app screens/goalpace.html'),
  // goodhands.html's real content turned out to be the privacy/trust
  // message ("Thank you for trusting us" / "Your privacy matters to
  // us...") — despite its filename, extraction showed this is the
  // 'thankYou' appState screen's replacement, NOT the STEPS
  // 'giveGoodHands' struggle/accomplish interstitial. That one now has
  // its own real design file (goodhandsv2.html, added later) — see below.
  thankYou:            require('../assets/app screens/goodhands.html'),
  // Real design artboards for the two remaining native-placeholder
  // interstitials. Static copy baked into each file (no struggle/
  // accomplish echo on giveGoodHands any more — the new design's own
  // fixed copy replaces the old personalized native text).
  giveGoodHands:       require('../assets/app screens/goodhandsv2.html'),
  notAlone:            require('../assets/app screens/notalone.html'),
  // Not a STEPS screen — a standalone appState shown right before
  // generatePlan (see the 'readyToBuild' appState block).
  readyToBuild:        require('../assets/app screens/readytobuild.html'),
} as const;

// Same 7 files RankWheelScreen's own RANKS array requires — kept as a
// separate keyed map (not imported from that component) so this file can
// warm them well before RankWheelScreen ever mounts (see the preload
// effect below).
const RANK_SHIELD_ASSETS: Record<string, any> = {
  bronze:   require('../assets/ranks/bronze.png'),
  silver:   require('../assets/ranks/silver.png'),
  gold:     require('../assets/ranks/gold.png'),
  platinum: require('../assets/ranks/platinum.png'),
  diamond:  require('../assets/ranks/diamond.png'),
  master:   require('../assets/ranks/master.png'),
  champion: require('../assets/ranks/champion.png'),
};

// Draws the plan-ready graph line in fully via JS, triggered when the page
// actually becomes visible (see the poolActive effect below) — NOT the
// artboard's own CSS animation. Two rounds of tuning that CSS's
// animation-delay values did nothing visible, because the real problem is
// the pool prewarms this page long before the user ever sees it: the CSS
// animation fires and FINISHES during that hidden prewarm, so by reveal
// time it's not "wrongly timed", it's already 100% done — no delay tweak
// can matter once the animation has already run to completion off-screen.
// This bypasses that entirely: kill the CSS animation, hold the line/dot/
// target at their HIDDEN starting state, then drive stroke-dashoffset by
// hand with requestAnimationFrame.
//
// Rebuilt this round off the SAME technique recoveryroute.html's (working)
// graph uses — a dot riding the path itself in lockstep with the draw, not
// a separately-timed fade — except done with getPointAtLength instead of
// CSS offset-path, so the dot's position is always read directly off the
// ACTUAL current tip of the line (correct even when planReadyInject swaps
// in the mirrored down-sloping path for a lose-weight goal, since this
// never hardcodes the tip's coordinates). Two concrete complaints this
// fixes: the draw was way too fast (2000ms, front-loaded ease-out — most of
// the distance happened in the first few frames) and the TARGET badges were
// gated on an extra fixed 140ms AFTER the line finished instead of the
// instant it actually gets there.
const RESTART_GRAPH_ANIM_JS = `
(function(){
  function run(){
    var line = document.querySelector('#dc-root path[style*="pr-draw"]');
    if(!line) return false;
    var dot = document.querySelector('#dc-root circle[style*="pr-fade"]');
    var badges = document.querySelectorAll('#dc-root [style*="pr-badge"]');

    var total;
    try { total = line.getTotalLength(); } catch(e) { total = 620; }

    line.style.animation = 'none';
    line.style.strokeDasharray = String(total);
    line.style.strokeDashoffset = String(total);
    if (dot) {
      dot.style.animation = 'none';
      dot.style.transition = 'none';
      dot.style.opacity = '1';
      try { var p0 = line.getPointAtLength(0); dot.setAttribute('cx', String(p0.x)); dot.setAttribute('cy', String(p0.y)); } catch(e){}
    }
    for (var i=0;i<badges.length;i++){ badges[i].style.animation = 'none'; badges[i].style.opacity = '0'; }

    var start = null, DUR = 2800;
    function ease(t){ return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2; } // symmetric ease-in-out
    function frame(ts){
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / DUR);
      var e = ease(t);
      line.style.strokeDashoffset = String(total - total * e);
      if (dot) {
        try {
          var pt = line.getPointAtLength(total * e);
          dot.setAttribute('cx', String(pt.x));
          dot.setAttribute('cy', String(pt.y));
        } catch(err){}
      }
      if (t < 1) { requestAnimationFrame(frame); return; }
      // The line (and the dot riding its tip) just reached the target —
      // the badges appear NOW, not after an extra fixed delay.
      for (var j=0;j<badges.length;j++){
        badges[j].style.transition = 'opacity 260ms ease, transform 260ms cubic-bezier(.34,1.4,.64,1)';
        badges[j].style.opacity = '1';
      }
    }
    requestAnimationFrame(frame);
    return true;
  }
  if (!run()) [150, 400, 900, 1600].forEach(function(d){ setTimeout(run, d); });
  true;
})();
`;

// planisreadynow.html renders its values as plain {{ }} text (no sc-interp
// spans), so we can't match by class — instead we match each rendered leaf
// against the artboard's KNOWN default string and swap it. Defaults (keep in
// sync with the file's data-props): goalWeight "195 lb" (×2), goalDate
// "Dec 1" (×2), weight "184 lb", height 5'11", age "27", experience
// "Beginner". ctaLabel "Unlock my full plan" -> "Continue".
//
// GOAL-DIRECTION — the artboard's graph line/fill are two hardcoded SVG
// paths that always slope UP (weight/progress rising left-to-right). Real
// for "build muscle"/"get stronger", backwards for "lose weight" (the user
// wants the line falling toward their goal, not rising). Since the shapes
// are static path data — not computed from the user's numbers — the fix is
// a plain vertical mirror of both known `d` strings (reflected about their
// own horizontal midline, y' = 222 - y), swapped in only when losing weight
// is the primary goal. The trailing checkmark badge isn't repositioned (it's
// a small decorative flourish near the old top-right end) — flag if that
// looks wrong once you see it lose-weight side.
const PR_LINE_D   = 'M14 152 C48 150 70 146 98 136 C132 124 154 94 192 82 C220 73 246 71 292 70';
const PR_FILL_D    = PR_LINE_D + ' L292 160 L14 160 Z';
const PR_LINE_D_DOWN = 'M14 70 C48 72 70 76 98 86 C132 98 154 128 192 140 C220 149 246 151 292 152';
const PR_FILL_D_DOWN  = PR_LINE_D_DOWN + ' L292 160 L14 160 Z';

// Exact wording per explicit spec — sentence case, no date in the header
// any more (that's the {{SUBLINE}} token -> "Starting today"), no
// "You're set to hit". Used to string-replace planisreadynow.html's own
// {{HEADER}} token BEFORE the WebView loads it (see DcPagePool) — not via
// DOM injection, which is what kept silently breaking across rounds.
// Replacement value for {{HEADER}} is spliced straight into raw HTML text
// (a plain string .replace(), not textContent), so inline markup here
// renders for real — used to restore the original design's blue-highlight
// on the value, same #2E7DFF the rest of this page's chart/badges use.
// Recomp gets "Starting today." appended to the sentence itself — explicit
// ask — since its two-line crossing graph doesn't carry the same "Starting
// today" sub-line read as clearly as the single-line kinds do.
function planReadyHeaderText(goal: ReturnType<typeof computeGoalPlan>): string {
  if (goal.kind === 'fat')    return `Your goal is to lose <span style="color: #2E7DFF;">${goal.deltaLbs} lbs</span>`;
  if (goal.kind === 'recomp') return `Your goal is to <span style="color: #2E7DFF;">lose fat and gain muscle</span>. Starting today.`;
  return `Your goal is to gain <span style="color: #2E7DFF;">${goal.deltaLbs} lbs</span>`;
}

function planReadyInject(a: Record<string, any>): string {
  const goal = computeGoalPlan(a);
  const w  = typeof a.weight === 'number' ? Math.round(a.weight) : 0;
  const wStr = w ? `${w} lb` : '';
  const h  = typeof a.height === 'string' ? a.height : '';
  const ag = a.age != null ? String(a.age) : '';
  const ex = typeof a.experience === 'string' ? a.experience : '';
  const days = parseInt(String(a.daysPerWeek ?? '3 days'), 10) || 3;
  return `
(function(){
  function post(m){ try{ window.ReactNativeWebView.postMessage(m); }catch(e){} }
  var MAP = {
    '195 lb': ${JSON.stringify(goal.shortGoal)},
    '184 lb': ${JSON.stringify(wStr)},
    "5'11\\"": ${JSON.stringify(h)},
    '27':     ${JSON.stringify(ag)},
    'Beginner': ${JSON.stringify(ex)}
  };
  var GOAL_VALUE = ${JSON.stringify(goal.shortGoal)};
  var MILESTONE_LINE = ${JSON.stringify('Hit 90% clean form by ' + goal.milestoneDateLabel)};
  var DAYS = ${days};
  var KIND = ${JSON.stringify(goal.kind)};
  function apply(){
    // Header/sub-line are no longer matched or replaced here — the
    // artboard file itself (planisreadynow.html) now has literal
    // {{HEADER}} / {{SUBLINE}} tokens baked into its template, string-
    // replaced on the raw HTML text BEFORE this page ever loads (see
    // DcPagePool's planReadyHtml). That's the one fix the DOM-searching
    // approach kept breaking on across multiple rounds — a pre-load
    // string replace can't mismatch a div the way runtime querying could.
    // The "Dec 1" date div is hidden via inline style in the same file
    // edit, so it's not touched here either.
    var hit=0;

    var all=document.querySelectorAll('#dc-root div,#dc-root span,#dc-root p');
    for(var i=0;i<all.length;i++){
      var el=all[i];
      if(el.children.length) continue;
      var t=(el.textContent||'').trim();
      if(MAP[t] != null && MAP[t] !== '' && el.textContent.trim() !== MAP[t]){ el.textContent=MAP[t]; hit++; }
    }

    // Graph: direction + start/end markers depend on the real goal kind.
    // Muscle gain keeps the artboard's own default shape (line rising,
    // left-to-right) untouched. Fat loss swaps to the falling variant.
    // Recomp replaces the single line with two: fat down, muscle up, from
    // a shared start point — the artboard only ever had one line, so this
    // one is built fresh rather than guessed from the existing paths
    // (which don't share a start point with each other).
    var svg = document.querySelector('#dc-root svg[sc-camel-view-box="0 0 300 190"]') || document.querySelector('#dc-root svg');
    if (svg && !svg.__formpalGraphDone) {
      var paths = svg.querySelectorAll('path');
      var lineEl=null, fillEl=null, badgeTriEl=null;
      for (var p=0;p<paths.length;p++){
        var d=paths[p].getAttribute('d')||'';
        if (d===${JSON.stringify(PR_LINE_D)}) lineEl=paths[p];
        else if (d===${JSON.stringify(PR_FILL_D)}) fillEl=paths[p];
        else if (d.indexOf('L250 56')>=0 || d.indexOf('M250 56')>=0) badgeTriEl=paths[p];
      }
      var circles = svg.querySelectorAll('circle');
      var startDot = circles[0] || null;   // cx=14 cy=152 in the original
      var endDot   = circles[1] || null;   // cx=256 cy=70.6 in the original
      // The TARGET badge is a plain floating div (not inside the SVG) —
      // find it by its own "TARGET" label text.
      var badge = null;
      {
        var cand = svg.parentElement ? svg.parentElement.querySelectorAll('div') : [];
        for (var c=0;c<cand.length;c++){
          if ((cand[c].textContent||'').indexOf('TARGET')>=0 && cand[c].querySelector('div')){ badge = cand[c]; break; }
        }
      }

      function placeAlong(path, circleEl, atStart){
        if (!path || !circleEl) return null;
        var len = path.getTotalLength();
        var pt = path.getPointAtLength(atStart ? 0 : len);
        circleEl.setAttribute('cx', pt.x.toFixed(1));
        circleEl.setAttribute('cy', pt.y.toFixed(1));
        return pt;
      }
      // BUG FOUND: the badge was positioned with fixed magic-number
      // offsets (-44, -70) reverse-engineered from the untouched muscle-
      // gain default — correct ONLY for that one exact point. For any
      // other point (fat loss's repositioned endpoint) it was never
      // actually centered, just offset by the same fixed amount from a
      // totally different spot — reported as "the target card is
      // broken." Measures the badge's REAL rendered width/height and
      // centers it horizontally on the point every time, with its bottom
      // edge a fixed gap above the point so the triangle (drawn right
      // under it, same gap) reads as connecting card to dot.
      var BADGE_GAP = 10;
      function placeBadge(pt){
        if (!badge || !pt || !svg.parentElement) return null;
        var svgRect = svg.getBoundingClientRect();
        var hostRect = svg.parentElement.getBoundingClientRect();
        var vb = { w: 300, h: 190 }; // the artboard's own fixed viewBox
        var scaleX = svgRect.width / vb.w, scaleY = svgRect.height / vb.h;
        var px = (svgRect.left - hostRect.left) + pt.x * scaleX;
        var py = (svgRect.top  - hostRect.top)  + pt.y * scaleY;
        var bw = badge.offsetWidth || 88, bh = badge.offsetHeight || 54;
        badge.style.left = (px - bw / 2) + 'px';
        badge.style.top  = Math.max(4, py - bh - BADGE_GAP) + 'px';
        return pt;
      }
      // Small triangle pointing down from the badge at the graph — back
      // per explicit ask ("add back the triangle, it used to be there").
      // Drawn in the SAME SVG coordinate space as the point itself (not
      // screen pixels like the badge), directly above the dot with the
      // same BADGE_GAP — lines up with the badge's now-precisely-centered
      // bottom edge above it. Muscle gain (default, untouched graph)
      // already has its own correctly-placed default, no change needed.
      // Recomp still hides it — no single target badge there, two lines
      // instead.
      function placeTri(pt){
        if (!badgeTriEl || !pt) return;
        var cx = pt.x, cy = pt.y - (BADGE_GAP / ((svg.getBoundingClientRect().height / 190) || 1));
        badgeTriEl.setAttribute('d', 'M'+(cx-6).toFixed(1)+' '+(cy-11).toFixed(1)+' L'+(cx+6).toFixed(1)+' '+(cy-11).toFixed(1)+' L'+cx.toFixed(1)+' '+cy.toFixed(1)+' Z');
        badgeTriEl.style.display = '';
      }

      if (KIND === 'recomp') {
        // Rebuilt per reference screenshot: two genuinely separate curves
        // crossing in the middle (muscle rising from the bottom, fat
        // falling from the top — NOT sharing a start point, which is what
        // made the old version read as flat/boring), open-circle
        // endpoints, dotted top/bottom guide lines, and labels sitting
        // next to each line's own end instead of pinned to the edge. Muscle
        // is blue (#2E7DFF, this page's one accent color everywhere else);
        // fat is dark — the previous version had these swapped.
        if (lineEl) lineEl.style.display = 'none';
        if (fillEl) fillEl.style.display = 'none';
        if (startDot) startDot.style.display = 'none';
        if (endDot) endDot.style.display = 'none';
        if (badge) badge.style.display = 'none';
        if (badgeTriEl) badgeTriEl.style.display = 'none';
        var old = svg.querySelectorAll('.__formpalRecompLine');
        for (var oi = 0; oi < old.length; oi++) old[oi].parentNode.removeChild(old[oi]);

        var NS = 'http://www.w3.org/2000/svg';
        var TOP_Y = 70, BOT_Y = 152, FAT_COLOR = '#15171c', MUSCLE_COLOR = '#2E7DFF';
        function mk(tag, attrs){
          var el = document.createElementNS(NS, tag);
          el.setAttribute('class', '__formpalRecompLine');
          for (var k in attrs) el.setAttribute(k, attrs[k]);
          return el;
        }
        // Dotted guides at the shared top/bottom levels, behind everything.
        svg.appendChild(mk('line', { x1: '14', y1: String(TOP_Y), x2: '292', y2: String(TOP_Y), stroke: '#c7c9d1', 'stroke-width': '1', 'stroke-dasharray': '2.5 4' }));
        svg.appendChild(mk('line', { x1: '14', y1: String(BOT_Y), x2: '292', y2: String(BOT_Y), stroke: '#c7c9d1', 'stroke-width': '1', 'stroke-dasharray': '2.5 4' }));
        // Fat: falling, starts high (reuses the proven PR_LINE_D_DOWN
        // shape/smoothness) — soft fill underneath, drawn first so the
        // muscle fill reads as the dominant accent where they overlap.
        svg.appendChild(mk('path', { d: ${JSON.stringify(PR_FILL_D_DOWN)}, fill: FAT_COLOR, opacity: '0.05' }));
        svg.appendChild(mk('path', { d: ${JSON.stringify(PR_LINE_D_DOWN)}, fill: 'none', stroke: FAT_COLOR, 'stroke-width': '2.6', 'stroke-linecap': 'round' }));
        // Muscle: rising, starts low (reuses PR_LINE_D).
        svg.appendChild(mk('path', { d: ${JSON.stringify(PR_FILL_D)}, fill: MUSCLE_COLOR, opacity: '0.08' }));
        svg.appendChild(mk('path', { d: ${JSON.stringify(PR_LINE_D)}, fill: 'none', stroke: MUSCLE_COLOR, 'stroke-width': '2.6', 'stroke-linecap': 'round' }));
        // Open-circle endpoints — white fill, colored ring, on top of fills.
        [[14, BOT_Y, MUSCLE_COLOR], [292, TOP_Y, MUSCLE_COLOR], [14, TOP_Y, FAT_COLOR], [292, BOT_Y, FAT_COLOR]].forEach(function(c){
          svg.appendChild(mk('circle', { cx: String(c[0]), cy: String(c[1]), r: '4.5', fill: '#ffffff', stroke: c[2], 'stroke-width': '2.5' }));
        });
        // Labels beside each line's own end, inside the viewBox (not
        // pinned to the right edge, which crowded the old version).
        [['Muscle', MUSCLE_COLOR, 236, TOP_Y - 10], ['Fat', FAT_COLOR, 252, BOT_Y + 18]].forEach(function(row){
          var txt = mk('text', { x: String(row[2]), y: String(row[3]), 'text-anchor': 'start', 'font-size': '13', 'font-weight': '800', 'font-family': 'Plus Jakarta Sans, Helvetica, sans-serif', fill: row[1] });
          txt.textContent = row[0];
          svg.appendChild(txt);
        });
        hit++;
      } else if (KIND === 'fat') {
        // Only fat loss actually needs the markers recomputed — swapping
        // the line's own 'd' to the falling variant is what makes the
        // ORIGINAL hardcoded start/end dot + badge position (tuned for the
        // rising default) wrong in the first place ("the dot at the start
        // is broken"). Muscle gain never touches this path below, so its
        // already-correct, designer-placed defaults stay exactly as-is.
        if (lineEl && fillEl) {
          lineEl.setAttribute('d', ${JSON.stringify(PR_LINE_D_DOWN)});
          fillEl.setAttribute('d', ${JSON.stringify(PR_FILL_D_DOWN)});
        }
        if (lineEl) {
          placeAlong(lineEl, startDot, true);
          var endPt = placeAlong(lineEl, endDot, false);
          placeBadge(endPt);
          placeTri(endPt);
        }
      }
      svg.__formpalGraphDone = true;
      hit++;
    }

    // The "GOAL" info tile (5th tile added to the grid) is removed again —
    // explicit ask. If an earlier apply() pass already added it (a fast
    // re-render before this code updated), tear it back out.
    var oldGoalTile = document.getElementById('__formpalGoalTile');
    if(oldGoalTile && oldGoalTile.parentElement){ oldGoalTile.parentElement.removeChild(oldGoalTile); }

    // "How to reach your goal(s)" + "Why FormPal?" copy — literal-text
    // swaps against the artboard's own defaults, same technique as above.
    var swap = {
      'How to reach your goals:': 'How to reach your goal:',
      'Film your sets with the camera': 'Film every set so each rep counts',
      'Follow your weekly workout plan': MILESTONE_LINE,
      'Fix the weak points we flag': 'Follow your ' + DAYS + '-day plan',
      'Stay consistent week after week': 'Weigh in once a week',
      'Fix weak points and climb the ranks': 'See progress every week, even before the mirror does'
    };
    var leafAll=document.querySelectorAll('#dc-root div,#dc-root span,#dc-root p');
    for(var s=0;s<leafAll.length;s++){
      var le=leafAll[s]; if(le.children.length) continue;
      var lt=(le.textContent||'').trim();
      if(swap[lt] != null && lt !== swap[lt]){ le.textContent=swap[lt]; hit++; }
    }

    return hit>=3;
  }
  if(!apply()) [200,500,1000,2000,3500,5000].forEach(function(d){ setTimeout(apply,d); });
  else [1000,2500].forEach(function(d){ setTimeout(apply,d); });
})();
`;
}

const DURATION_YEARS: Record<string, number> = {
  '1-2 months': 1, '2-6 months': 1, '6-12 months': 1,
  '1-2 years': 2, '2-5 years': 3, '5-10 years': 7, '10+ years': 12,
};

// These 5 real-design webview screens (plan comparison, realistic target,
// form confidence, goal pace, thank-you/privacy) each ship their own CSS
// @keyframes entrance animation (rt-rise, fc-rise, gp-rise, gh-rise...),
// on top of the native fade every DC page already gets — explicit
// complaint: they should look like every other question screen's
// transition, not have a second bespoke intro animation playing over it.
// Prepended to each of their inject functions below.
const SUPPRESS_DC_ANIM_JS = `(function(){var s=document.createElement('style');s.textContent='#dc-root *{animation:none!important;}';(document.head||document.documentElement).appendChild(s);})();`;

// realistictarget.html — real design for the former 'giveRealisticTarget'
// placeholder. Its dc-script already computes a goal-aware sentence
// (verb/amount/recomp framing) from this.props.goal/lbs — but props are
// baked in at export time with no live override channel, so the rendered
// default is always "Gaining 12 lbs is a realistic target!" regardless of
// the real user. Rather than fighting that, this matches that ONE known
// default sentence (the only one the static export ever actually renders)
// and swaps in the real one — same literal-match technique as everywhere
// else, just applied to a screen whose default happens to come from a
// prop instead of being hand-authored directly in the markup.
//
// BUG FOUND: this used to pick the verb from goal.kind (which goal the
// user SELECTED) — "always says Gaining 12 lbs" was reported because that
// read goal.kind correctly but the verb should follow the ACTUAL numbers
// instead: gaining if goal weight is above current weight, losing if
// below, regardless of which goal category got picked. This step is also
// now Recomp-skipped entirely (see its showIf), so there's no recomp
// case to handle here any more.
function realisticTargetInject(a: Record<string, any>): string {
  const weight = typeof a.weight === 'number' ? a.weight : 160;
  const goalWeight = typeof a.goalWeight === 'number' ? a.goalWeight : weight;
  const delta = Math.round(Math.abs(goalWeight - weight));
  // Equal weights -> X = 0, verb follows whichever goal was actually
  // selected (there's no real direction to infer from the numbers when
  // the delta is 0) — explicit spec. Otherwise the verb follows the real
  // numbers, same as before.
  const mainGoalStr = typeof a.mainGoal === 'string' ? a.mainGoal : '';
  const verb = delta === 0
    ? (mainGoalStr.startsWith('Lose fat') ? 'Losing' : 'Gaining')
    : (goalWeight >= weight ? 'Gaining' : 'Losing');
  const sentence = `${verb} ${delta} lbs is a realistic target!`;
  // Animation suppression is now applied via extraJsBeforeLoad at the
  // call site (see the 'webview' step render branch) — before the page's
  // own script ever runs, instead of after.
  return `
(function(){
  var MAP = { 'Gaining 12 lbs is a realistic target!': ${JSON.stringify(sentence)} };
  function apply(){
    var hit=0;
    var all=document.querySelectorAll('#dc-root div,#dc-root span');
    for(var i=0;i<all.length;i++){
      var el=all[i]; if(el.children.length) continue;
      var t=(el.textContent||'').trim();
      if(MAP[t]!=null && t!==MAP[t]){ el.textContent=MAP[t]; hit++; }
    }
    return hit>=1;
  }
  if(!apply()) [200,500,1000,2000,3500,5000].forEach(function(d){ setTimeout(apply,d); });
  else [1000,2500].forEach(function(d){ setTimeout(apply,d); });
  var root = document.getElementById('dc-root') || document.body;
  var mo = new MutationObserver(function(){ apply(); });
  mo.observe(root, { childList: true, subtree: true, characterData: true });
})();
`;
}

// formconfidence.html — real design for the former native GuessSlider
// step. Fully self-contained (its own pointer drag logic, snaps to 3
// discrete states: 0/50/100) — no value is captured outside the WebView
// unless we read it back out. The rendered LABEL div's text is one of
// exactly 3 known strings (LABELS in the dc-script) that map 1:1 to the
// 0/50/100 value, so reading that text — watched live via
// MutationObserver, same as every value that can change without a full
// reload — and posting it through the SAME 'editvalue:field:value'
// channel planReady's pencil-edit already uses (see OnboardingWebScreen's
// onEditValue) keeps answers.formConfidence live with no new plumbing.
function formConfidenceInject(a: Record<string, any>): string {
  // Animation suppression is now applied via extraJsBeforeLoad at the
  // call site, before the page's own script ever runs.
  return `
(function(){
  function post(m){ try{ window.ReactNativeWebView.postMessage(m); }catch(e){} }
  var VALS = { 'Not confident': 0, 'Somewhat confident': 50, 'Very confident': 100 };
  var last = null;
  function apply(){
    var all=document.querySelectorAll('#dc-root div');
    for(var i=0;i<all.length;i++){
      var el=all[i]; if(el.children.length) continue;
      var t=(el.textContent||'').trim();
      if(VALS[t]!=null){
        if(VALS[t]!==last){ last=VALS[t]; post('editvalue:formConfidence:'+encodeURIComponent(String(last))); }
        return true;
      }
    }
    return false;
  }
  if(!apply()) [200,500,1000,2000,3500,5000].forEach(function(d){ setTimeout(apply,d); });
  var root = document.getElementById('dc-root') || document.body;
  var mo = new MutationObserver(function(){ apply(); });
  mo.observe(root, { childList: true, subtree: true, characterData: true });
})();
`;
}

// goalpace.html — real design for the new 'goalPace' step. Fully
// self-contained (its own drag logic + animated gait icons for 3 presets:
// relaxed/balanced/aggressive, continuous 0.25-1.5x multiplier). The
// rendered rate number (e.g. "1.0", "0.85") is the ONLY plain decimal
// div on the whole screen, matched by shape rather than exact string
// since it's continuous, not a fixed set of defaults — watched live and
// posted as answers.pace through the same editvalue: channel.
function goalPaceInject(a: Record<string, any>): string {
  // Animation suppression is now applied via extraJsBeforeLoad at the
  // call site, before the page's own script ever runs.
  return `
(function(){
  function post(m){ try{ window.ReactNativeWebView.postMessage(m); }catch(e){} }
  var last = null;
  function apply(){
    var all=document.querySelectorAll('#dc-root div');
    for(var i=0;i<all.length;i++){
      var el=all[i]; if(el.children.length) continue;
      var t=(el.textContent||'').trim();
      if(/^\\d\\.\\d{1,2}$/.test(t)){
        if(t!==last){ last=t; post('editvalue:pace:'+encodeURIComponent(t)); }
        return true;
      }
    }
    return false;
  }
  if(!apply()) [200,500,1000,2000,3500,5000].forEach(function(d){ setTimeout(apply,d); });
  var root = document.getElementById('dc-root') || document.body;
  var mo = new MutationObserver(function(){ apply(); });
  mo.observe(root, { childList: true, subtree: true, characterData: true });
})();
`;
}

// goodhands.html (the thankYou appState screen) — new subtext per explicit
// copy change, replacing its real default privacy line.
function thankYouInject(): string {
  const MAP: Record<string, string> = {
    'Your privacy matters to us. Your workout videos are only used to check your form, and we never sell or share your data.':
      "Your starting point stays on your phone. Here's what we'll do with it.",
  };
  // Animation suppression is now applied via extraJsBeforeLoad at the
  // call site, before the page's own script ever runs.
  return `
(function(){
  var MAP = ${JSON.stringify(MAP)};
  function apply(){
    var hit=0;
    var all=document.querySelectorAll('#dc-root div,#dc-root span');
    for(var i=0;i<all.length;i++){
      var el=all[i]; if(el.children.length) continue;
      var t=(el.textContent||'').trim();
      if(MAP[t]!=null && t!==MAP[t]){ el.textContent=MAP[t]; hit++; }
    }
    return hit>=1;
  }
  if(!apply()) [200,500,1000,2000,3500,5000].forEach(function(d){ setTimeout(apply,d); });
  var root = document.getElementById('dc-root') || document.body;
  var mo = new MutationObserver(function(){ apply(); });
  mo.observe(root, { childList: true, subtree: true, characterData: true });
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
  'strengthAssessment', 'rankReveal',
  // Real-design replacements for former native placeholder/component
  // screens — same 390×844 #dc-root format as everything else here.
  'giveVsWithout', 'giveRealisticTarget', 'formConfidence', 'thankYou', 'goalPace',
  'giveGoodHands', 'notAlone', 'readyToBuild',
];
// NOTE: no bare "Next" — strengthassesment's in-card "Next exercise" button
// must NOT advance the whole flow.
// FOUND THE ACTUAL "Continue does nothing" bug on the rank-reveal-wheel:
// "See my route" is rankReveal.html's own default CTA label — real text,
// keep it even though Recovery Route (the screen that originally also
// used that phrase) is now removed from the flow entirely.
// "Generate plan" added for readytobuild.html — confirmed by direct file
// extraction that's its real CTA label, not covered by any existing
// pattern above (would have silently been a dead "Continue does nothing"
// button otherwise, same bug class as the rankReveal one noted above).
const DC_CTA_RE = "^(Continue|See my plan|See plan|See my potential|See my route|Get my rank|Unlock my full plan|Unlock my plan|Unlock|Start my 3-day|Start my 3\\u2011day|Start my free trial|Start free trial|Start free|Done|Get started|Let.s do it|Let.s go|I.m in|Generate plan)\\b";
const DC_PAGE_INJECT = `
(function () {
  function post(m){ try{ window.ReactNativeWebView.postMessage(m); }catch(e){} }
  // Belt-and-suspenders viewport (also set pre-load) — see VIEWPORT_JS.
  try{
    var _mv=document.querySelector('meta[name=viewport]');
    if(!_mv){ _mv=document.createElement('meta'); _mv.name='viewport'; (document.head||document.documentElement).appendChild(_mv); }
    _mv.setAttribute('content','width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
  }catch(e){}
  var RE = new RegExp(${JSON.stringify(DC_CTA_RE)}, 'i');
  function hasDcClick(el){
    if(!el.attributes) return false;
    for(var k=0;k<el.attributes.length;k++){
      var nm=el.attributes[k].name;
      if(nm==='onclick' || nm.indexOf('on-click')>=0 || nm.indexOf('onClick')>=0) return true;
    }
    return false;
  }
  function clickable(el){
    for(var i=0; el && i<8; i++, el=el.parentElement){
      var r = el.getAttribute && el.getAttribute('role');
      // DC artboards bind their CTA as a <div sc-camel-on-click="{{ ... }}">
      // — no BUTTON/A, no cursor:pointer inline. Without matching that
      // attribute, tapping "Continue" on the rank reveal did nothing and
      // the user was stuck.
      if(el.tagName==='BUTTON' || el.tagName==='A' || r==='button' || hasDcClick(el) || (el.style && el.style.cursor==='pointer')) return el;
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
  // handler. Tapping one makes that row's value editable IN PLACE (the same
  // little box, cursor in it, type a new value) — no separate screen.
  // 'experience' has fixed options so it still opens the option picker.
  function commitEdit(sp, field){
    if(!sp.__editing) return;
    sp.__editing=false;
    sp.contentEditable='false';
    sp.style.removeProperty('outline');
    sp.style.removeProperty('background');
    sp.style.removeProperty('border-radius');
    sp.style.removeProperty('padding');
    var raw=(sp.textContent||'').trim();
    if(field==='weight'){
      var num=(raw.match(/[0-9.]+/)||[''])[0];
      if(num) sp.textContent=Math.round(parseFloat(num))+' lb';
      post('editvalue:weight:'+encodeURIComponent(num));
    } else if(field==='age'){
      var a=(raw.match(/[0-9]+/)||[''])[0];
      if(a) sp.textContent=a;
      post('editvalue:age:'+encodeURIComponent(a));
    } else {
      sp.textContent=raw;
      post('editvalue:height:'+encodeURIComponent(raw));
    }
  }
  function startEdit(sp, field){
    if(sp.__editing) return;
    sp.__editing=true;
    sp.contentEditable='true';
    sp.setAttribute('inputmode', field==='height' ? 'text' : 'numeric');
    sp.style.setProperty('outline','2px solid #2E7DFF','important');
    sp.style.setProperty('background','#eef4ff','important');
    sp.style.setProperty('border-radius','6px','important');
    sp.style.setProperty('padding','1px 5px','important');
    sp.focus();
    try{ var r=document.createRange(); r.selectNodeContents(sp); var se=window.getSelection(); se.removeAllRanges(); se.addRange(r); }catch(e){}
    if(!sp.__editWired){
      sp.__editWired=1;
      sp.addEventListener('blur', function(){ commitEdit(sp, field); });
      sp.addEventListener('keydown', function(ev){ if(ev.key==='Enter'){ ev.preventDefault(); sp.blur(); } });
    }
  }
  function wireEdits(){
    var svgs=document.querySelectorAll('svg[style*="cursor: pointer"],svg[style*="cursor:pointer"]');
    var n=0;
    for(var i=0;i<svgs.length;i++){
      var sv=svgs[i];
      if(sv.__wired){ n++; continue; }
      sv.__wired=1;
      // Find this row's value element. Old planReady used span.sc-interp;
      // the new one (planisreadynow) renders values as plain text, so also
      // accept the nearest leaf whose text has a value shape.
      function valueShape(t){
        return /^[0-9]{1,3}\\s?(lb|kg)$/i.test(t) || (t.indexOf('"')>=0 && t.indexOf("'")>=0)
            || /^[0-9]{1,3}$/.test(t) || /^(Beginner|Some experience|Intermediate|Advanced)$/.test(t);
      }
      var host=sv.parentElement, sp=null;
      for(var p=0;p<6 && host && !sp;p++,host=host.parentElement){
        var c=host.querySelector && host.querySelector('span.sc-interp');
        if(c){ sp=c; break; }
        var leaves=host.querySelectorAll ? host.querySelectorAll('div,span,p') : [];
        for(var q=0;q<leaves.length;q++){
          if(leaves[q].children.length) continue;
          if(valueShape((leaves[q].textContent||'').trim())){ sp=leaves[q]; break; }
        }
      }
      if(!sp){ continue; }
      var v=(sp.textContent||'').trim();
      var field = /lb|kg/i.test(v) ? 'weight' : (v.indexOf('"')>=0 ? 'height' : (/^[0-9]{1,3}$/.test(v) ? 'age' : 'experience'));
      sv.style.setProperty('padding','12px','important');
      sv.style.setProperty('margin','-12px','important');
      sv.style.setProperty('box-sizing','content-box','important');
      (function(f, span){
        sv.addEventListener('click', function(ev){
          ev.preventDefault(); ev.stopPropagation(); post('__tap');
          if(f==='experience'){ post('editinfo:experience'); return; }
          startEdit(span, f);
        }, true);
      })(field, sp);
      n++;
    }
    return n>=3;
  }

  var W=390;
  var s=document.createElement('style');
  s.textContent='html{background:#ffffff!important;}'
    + 'body{margin:0!important;padding:0!important;background:#ffffff!important;display:block!important;overflow-x:hidden!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;}'
    // Start hidden — revealed only after fit() has settled a stable scale,
    // so the user never sees the artboard paint at 1:1 and then visibly
    // shrink ("quickly zooms out for a sec").
    + '#dc-root{position:relative!important;margin:0 auto!important;width:'+W+'px!important;transform-origin:top center!important;opacity:0!important;}'
    + '#dc-root.__dcshow{opacity:1!important;transition:opacity 200ms ease!important;}'
    // Perf: backdrop-filter + mask-image are the two big WebView repaint
    // killers on these artboards (frosted pills, faded scroll edges). Drop
    // them — the pills already carry a solid-ish rgba fill, so they stay
    // readable, and the scroll wheel / tap animations stop stuttering.
    + '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}'
    + '[style*="mask-image"],[style*="mask:"]{-webkit-mask-image:none!important;mask-image:none!important;-webkit-mask:none!important;mask:none!important;}'
    // Momentum scrolling on any inner scroller (the rank rows / assessment
    // wheel), and no big blurred shadows repainting on the moving pieces.
    + '[style*="overflow-x"],[style*="overflow-y"],[style*="overflow:"],[style*="overflow-scrolling"]{-webkit-overflow-scrolling:touch!important;}'
    + '#dc-root [style*="filter: blur"],#dc-root [style*="filter:blur"]{filter:none!important;}'
    // Keep the CTA label on one line — but DON'T touch its box. (An earlier
    // blanket rule on every border-radius:999px element blew the CTA pills
    // up and turned the "SAVE 55%" badge into a giant circle.)
    + '#dc-root [style*="height: 58px"][style*="999px"],#dc-root [style*="height: 54px"][style*="999px"]{white-space:nowrap!important;}'
    // The generating-plan progress bar renders 12px thick — trim it a bit.
    + '#dc-root [style*="height: 12px"][style*="999px"]{height:18px!important;}'
    + '#dc-root [style*="height: 12px"][style*="999px"]>*{height:18px!important;}'
    // generatePlan step rows: keep every label on ONE line so a longer one
    // ("Building your workout plan") can't wrap and shove the layout.
    + '#dc-root div[style*="font-size: 15.5px"][style*="flex: 1"]{white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;font-size:13.5px!important;}';
  (document.head||document.documentElement).appendChild(s);

  // Freeze looping decorative animations (drifting blobs, spinning rays,
  // breathing glows). They force continuous compositing the whole time the
  // user is trying to scroll. Static, they still look fine. One-shot
  // transitions (CTA slide-in, rank reveal, row rise-in) are left alone.
  // Runs ONCE, ~1.2s in — after the artboard's entrance animations finish,
  // so it isn't doing a getComputedStyle walk while they're playing.
  // Page-specific tidy-ups that are easier to do by matching rendered text
  // than by prop: hide the paywall's own "✕" close chip (we use the native
  // Restore control), relabel the plan-ready CTA, hide the fake "9:41"
  // status bar every one of these exports bakes in (duplicates/overlaps
  // the real device status bar), and hide the fake back-circle+progress-
  // track header row the 5 real-design webview steps (plan comparison,
  // realistic target, form confidence, goal pace, thank-you/privacy) draw
  // INSIDE their own canvas — redundant with the native progress header
  // (STEPS screens) and/or the native floating back button
  // (OnboardingWebScreen renders one on every DC page regardless).
  function polish(){
    var all=document.querySelectorAll('#dc-root div,#dc-root span,#dc-root button');
    for(var i=0;i<all.length;i++){
      var el=all[i]; if(el.children.length) continue;
      var t=(el.textContent||'').trim();
      if(t==='\\u2715' || t==='\\u2716' || t==='\\u00d7'){ el.style.setProperty('display','none','important'); }
      else if(t==='Unlock my full plan' || t==='Unlock my plan'){ el.textContent='Continue'; }
      // visibility:hidden, NOT display:none — these fake rows occupy space
      // the artboard's OWN layout was designed around (the status bar row
      // reserves the real notch area; the fake header row is what pushes
      // the real content down below where the native progress header
      // sits). Collapsing them with display:none pulled everything up
      // into/behind the native status bar and header — that was the
      // actual cause of "everything is too high, text overlaps the
      // header" on these screens. visibility:hidden keeps the same empty
      // space, just invisible.
      else if(t==='9:41'){ if(el.parentElement) el.parentElement.style.setProperty('visibility','hidden','important'); }
    }
    // BUG FOUND: goalpace.html and formconfidence.html's back chevron is
    // a DIFFERENT SVG path ("M13 8H3M7 3.6 2.8 8 7 12.4") than the one
    // used everywhere else in this app ("M10 3 5 8l5 5") — confirmed by
    // direct extraction. The old single-path selector never matched
    // these two at all, so their fake header was never hidden — that's
    // the actual cause of the duplicate-header bug persisting on exactly
    // those two screens (plan comparison, realistic target and thank-you
    // all use the OTHER path and were already fixed by the same code).
    var CHEVRON_PATHS = ['M10 3 5 8l5 5', 'M13 8H3M7 3.6 2.8 8 7 12.4'];
    var chevron = null;
    for(var cp=0; cp<CHEVRON_PATHS.length && !chevron; cp++){
      chevron = document.querySelector('#dc-root svg path[d="'+CHEVRON_PATHS[cp]+'"]');
    }
    if(chevron){
      // closest('div') lands on the 38-40px back-CIRCLE itself; its own
      // parent is the row that also holds the progress-track sibling —
      // confirmed via a sibling matching the track's own style (thin,
      // pill-radius bar), not a fragile offsetTop/offsetHeight guess.
      var circle=chevron.closest('div');
      var row=circle && circle.parentElement;
      if(row){
        var hasTrack=false;
        for(var ci=0; ci<row.children.length; ci++){
          var cstyle=(row.children[ci].getAttribute('style')||'');
          if(/height:\\s*[234]px/.test(cstyle) && /border-radius:\\s*999px/.test(cstyle)){ hasTrack=true; break; }
        }
        if(hasTrack) row.style.setProperty('visibility','hidden','important');
      }
    }
  }

  var calmDone=false;
  function calmAnims(){
    if(calmDone) return 0;
    calmDone=true;
    var all=document.querySelectorAll('#dc-root *'), k=0;
    for(var i=0;i<all.length;i++){
      try{
        var cs=getComputedStyle(all[i]);
        if(cs.animationIterationCount && cs.animationIterationCount.indexOf('infinite')>=0){
          // Keep long marquees (the paywall image carousel is a 46s linear
          // loop). Only freeze the short decorative pulses/drifts/spins.
          var dur=parseFloat(cs.animationDuration||'0');
          if(dur>=18) continue;
          all[i].style.setProperty('animation','none','important'); k++;
        }
      }catch(e){}
    }
    return k;
  }
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
    // +28 tail padding so the grey footnote under the CTA is never clipped
    // by a too-tight body height.
    document.body.style.setProperty('height', Math.ceil(rh*S + 28)+'px','important');
  }
  function painted(){
    var r=document.getElementById('dc-root');
    return !!(r && r.children && r.children.length) && !document.documentElement.classList.contains('sc-dc-streaming');
  }
  var n=0, done=false;
  // Show the artboard as soon as it has painted. No waiting for the scale to
  // "settle" and no long safety timeout — that was making 'Continue' feel
  // like a 5s freeze whenever the fast path didn't fire.
  function reveal(){
    if(done) return;
    done=true;
    var r=document.getElementById('dc-root');
    if(r) r.classList.add('__dcshow');
    post('rendered');
    // Do the DOM tidy-ups AFTER the reveal is posted so they don't delay the
    // fade start.
    setTimeout(polish, 0);
    setTimeout(function(){ fit(); wireEdits(); calmAnims(); polish(); }, 900);
    setTimeout(polish, 2000);
    // Belt-and-suspenders: a MutationObserver re-runs polish() on every
    // DOM change too, same robust pattern used elsewhere in this file —
    // the fixed 0/900/2000ms schedule alone has looked sufficient in
    // testing but costs nothing extra to also cover here.
    var polishRoot = document.getElementById('dc-root') || document.body;
    var polishMo = new MutationObserver(function(){ polish(); });
    polishMo.observe(polishRoot, { childList: true, subtree: true });
  }
  // Polling tighter (80ms, was 150ms) — the white-before-content gap is
  // real WebView HTML/font/asset load time, not eliminable outright, but
  // catching painted() sooner shrinks it directly. Same total time
  // budget otherwise (n>10 bump doubled to match the faster interval).
  (function wait(){
    fit();
    if(painted() || n>20){ reveal(); return; }
    if(n++<80) setTimeout(wait, 80);
  })();
  // Short backstop — worst case the page shows ~1.2s in, never a long hang.
  setTimeout(reveal, 1200);
  window.addEventListener('resize', fit);
  true;
})();
`;

// NONE of the Claude-Design artboards ship a <meta name="viewport">. Without
// one, iOS WKWebView lays the page out in a 980px world and then shrink-to-
// fits it — so a 390px artboard renders at ~40% size ("not zoomed in", huge
// margins) AND every blur/shadow is composited at a fractional scale (the
// low FPS). Forcing width=device-width makes it lay out 1:1 at native scale.
const VIEWPORT_JS = `(function(){try{
  var m=document.querySelector('meta[name=viewport]');
  if(!m){ m=document.createElement('meta'); m.name='viewport'; (document.head||document.documentElement).appendChild(m); }
  m.setAttribute('content','width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}catch(e){}})(); true;`;

// One-screen pages: fit to the screen height too so nothing needs scrolling.
const FIT_BOTH_INJECT = `window.__dcFitBoth=1;`;

// generatePlan is a timed "generating…" beat. It shows its own "See my
// plan" CTA when the progress finishes — the user taps that. NO auto-
// advance (the screen was skipping itself).
// generateplan.html's loading heading cycles through its own internal
// STEPS array (baked into its dc-script, not prop-driven), so "Calculating
// your rank..." only appears briefly near 100% and keeps getting
// overwritten by the component's own re-renders — a one-shot text replace
// loses that race. Watch it with a MutationObserver instead, same fix as
// the goal-route screen used for its own "text flashes, then changes"
// bug earlier this session. The checklist label ("Rank projection") is static
// (set once, doesn't re-render), so a plain retry-schedule replace is fine
// for that one.
const GENERATE_PLAN_INJECT = `
window.__dcFitBoth=1;
(function(){
  function swapHeading(root){
    var els = (root || document).querySelectorAll('#dc-root div,#dc-root span,#dc-root p');
    for (var i=0;i<els.length;i++){
      var el=els[i]; if (el.children.length) continue;
      var t=(el.textContent||'').trim();
      if (t === 'Calculating your rank...') { el.textContent = 'Mapping your goal date...'; }
      else if (t === 'Rank projection') { el.textContent = 'Goal timeline'; }
    }
  }
  swapHeading();
  var root = document.getElementById('dc-root') || document.body;
  var mo = new MutationObserver(function(){ swapHeading(root); });
  mo.observe(root, { childList: true, subtree: true, characterData: true });
  [200,500,1000,2000,3500,5000,7000,8500].forEach(function(d){ setTimeout(function(){ swapHeading(); }, d); });
})();
`;

function OnboardingWebScreen({ htmlKey, onAdvance, onBack, onEditInfo, onEditValue, onStrengthVals, topInset, progress, extraJs: extraJsProp, extraJsBeforeLoad, poolActive, htmlOverride }: {
  htmlKey: keyof typeof ONB_HTML;
  onAdvance: () => void;
  onBack: () => void;
  onEditInfo?: (field: string) => void;
  onEditValue?: (field: string, value: string) => void;
  // strengthAssessment only — see STRENGTH_CAPTURE_JS. Fires with the
  // running { pushup:{reps}, pullup:{reps}, squat:{reps}, deadlift:{weight,reps} }
  // map every time it changes.
  onStrengthVals?: (vals: Record<string, any>) => void;
  topInset: number;
  // 0-1 fraction through the WHOLE onboarding flow (not just the question
  // steps) — same track/fill the native question header uses, so every
  // screen in the flow (questions, rank run, post-rank, pre-paywall) shows
  // the exact same progress bar in the exact same position. Omit only for
  // screens truly outside the normal flow.
  progress?: number;
  extraJs?: string;
  // Runs via injectedJavaScriptBeforeContentLoaded (before the page's own
  // scripts execute), unlike extraJs above (which runs after load). Only
  // for stashing a window global the artboard's own script reads on mount —
  // see rankRevealPreloadJs for the one user of this so far.
  extraJsBeforeLoad?: string;
  // Pool mode: when defined, this screen is one of several kept mounted at
  // once (DcPagePool). It absolute-fills, only the active one is visible /
  // interactive, and only the active one shows its back button.
  poolActive?: boolean;
  // planReady only — pre-loaded, token-replaced HTML text (see DcPagePool)
  // used as the WebView's source instead of the static require()'d asset,
  // so per-user text ({{HEADER}}/{{SUBLINE}}) is baked in before the page
  // ever renders rather than searched-and-replaced in the DOM after.
  htmlOverride?: string;
}) {
  const inPool = poolActive !== undefined;
  const fade = useRef(new Animated.Value(0)).current;
  const backFade = useRef(new Animated.Value(0)).current;
  const webRef = useRef<WebView>(null);
  // Container visibility. In the pool it cross-fades between pages. Standalone
  // it starts visible (white) — the inner WebView `fade` + the artboard's own
  // #dc-root opacity gate are the single, clean content reveal; a second
  // container fade on top of them just read as a glitch.
  const containerFade = useRef(new Animated.Value(inPool ? (poolActive ? 1 : 0) : 1)).current;
  const shown = useRef(false);
  const [webReady, setWebReady] = useState(false);

  useEffect(() => {
    if (inPool) {
      Animated.timing(containerFade, { toValue: poolActive ? 1 : 0, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }
    // planReady's goal-graph line/badge draw in via a CSS animation that
    // fires once on load — which happens during generatePlan's prewarm,
    // while this page is invisible in the pool. By the time the user
    // actually sees it (poolActive flips true), the animation already
    // finished and the graph reads as static. Restart it right when the
    // page becomes visible instead of relying on the one-shot load fire.
    if (inPool && poolActive && htmlKey === 'planReady') {
      webRef.current?.injectJavaScript(RESTART_GRAPH_ANIM_JS);
    }
  }, [poolActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const reveal = () => {
    if (shown.current) return;
    shown.current = true;
    Animated.timing(fade, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };
  // The back button is its own thing now — it fades in on a fixed timer from
  // mount, on EVERY web screen (rank run, the 4 pre-paywall pages, the
  // paywall), whether or not the page ever posts 'rendered'. The user should
  // never be stuck without a way back.
  useEffect(() => {
    const b = setTimeout(() => {
      Animated.timing(backFade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    }, 450);
    return () => clearTimeout(b);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Fallback page reveals — 'rendered' is the fast path, but never leave the
  // page hidden if it doesn't arrive.
  useEffect(() => {
    if (!webReady) return;
    const t = setTimeout(reveal, DC_PAGE_KEYS.includes(htmlKey) ? 800 : 350);
    return () => clearTimeout(t);
  }, [webReady]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const hard = setTimeout(reveal, 3500); // absolute backstop from mount
    return () => clearTimeout(hard);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isDcPage = DC_PAGE_KEYS.includes(htmlKey);
  const baseInject = isDcPage ? DC_PAGE_INJECT : ONBOARDING_WEB_INJECT;
  // planReady stays width-fit (its info rows scroll). Everything else fits
  // to height too so the whole artboard — CTA + "Replay" / footnote under
  // it — is on screen with no scrolling.
  const fitBothKeys = [
    'trialTimeline', 'paywall', 'strengthAssessment', 'rankReveal',
    'giveVsWithout', 'giveRealisticTarget', 'formConfidence', 'thankYou', 'goalPace',
    'giveGoodHands', 'notAlone', 'readyToBuild',
  ];
  const dcExtra =
    htmlKey === 'generatePlan' ? GENERATE_PLAN_INJECT :
    fitBothKeys.includes(htmlKey) ? FIT_BOTH_INJECT :
    undefined;
  const strengthExtra = htmlKey === 'strengthAssessment' ? STRENGTH_CAPTURE_JS : undefined;
  const extraJs = [extraJsProp, dcExtra, strengthExtra].filter(Boolean).join('\n') || undefined;
  return (
    <Animated.View
      pointerEvents={inPool && !poolActive ? 'none' : 'auto'}
      style={
        inPool
          ? { ...StyleSheet.absoluteFillObject, backgroundColor: '#ffffff', opacity: containerFade }
          : { flex: 1, backgroundColor: isDcPage ? '#ffffff' : '#f4f4f2', opacity: containerFade }
      }
    >
      {!isDcPage && <AppBackground />}
      <Animated.View style={{ flex: 1, marginTop: topInset, opacity: fade }}>
        <WebView
          ref={webRef}
          source={htmlOverride != null ? { html: htmlOverride } : (ONB_HTML[htmlKey] as any)}
          originWhitelist={['*']}
          injectedJavaScriptBeforeContentLoaded={isDcPage ? VIEWPORT_JS + '\n' + (extraJsBeforeLoad ?? '') : undefined}
          injectedJavaScript={extraJs ? baseInject + '\n' + extraJs : baseInject}
          onLoadEnd={() => setWebReady(true)}
          onMessage={(e) => {
            const m = e.nativeEvent.data;
            if (m === '__tap' || m === '__tick') { Haptics.selectionAsync(); return; }
            if (m === 'rendered') { reveal(); return; }
            if (m.indexOf('editinfo') === 0) { onEditInfo?.(m.split(':')[1] || 'weight'); return; }
            if (m.indexOf('editvalue:') === 0) {
              const parts = m.split(':');
              onEditValue?.(parts[1] || 'weight', decodeURIComponent(parts[2] || ''));
              return;
            }
            if (m.indexOf('savals:') === 0) {
              try { onStrengthVals?.(JSON.parse(m.slice('savals:'.length))); } catch (e) {}
              return;
            }
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
          // Re-disabled specifically for rankReveal, temporarily — the
          // champion-icon proportion fix and the cache re-enable landed in
          // the SAME round, so "still looks squished" right after turning
          // caching back on is more likely the WebView serving an
          // already-cached pre-fix response than the fix not having taken.
          // Back to plain `cacheEnabled` once that's confirmed either way.
          cacheEnabled={htmlKey !== 'rankReveal'}
        />
      </Animated.View>
      {/* Absolute + anchored to the top of THIS screen — an RN View defaults
          to position:relative, so when the wrapper was a plain flow child
          after the flex:1 WebView its absolute child was being measured from
          the bottom of the screen and pushed off. In pool mode only the
          active page shows its back control. */}
      {(inPool && !poolActive) ? null : htmlKey === 'paywall' ? (
        // Paywall: iOS-standard layout — close (X) top-left, plain grey
        // "Restore" top-right. No glass pill on Restore. NO progress bar
        // here — explicit ask ("random black line at the top"), the last
        // screen's bar sits at ~100% fill which just read as a stray
        // black line, not a meaningful progress indicator.
        <Animated.View
          pointerEvents="box-none"
          style={{ position: 'absolute', top: Math.max(6, topInset - 6), left: 0, right: 0, zIndex: 80, opacity: backFade, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }}
        >
          <LiquidGlassButton
            onPress={() => { Haptics.selectionAsync(); onBack(); }}
            hitSlop={12}
            radius={17}
            variant="regular"
            fallbackColor="rgba(255,255,255,0.92)"
            style={[web.backCircle, web.backCircleDc]}
          >
            <SymbolView name="xmark" size={14} tintColor="#1b1f27" type="monochrome" style={{ width: 14, height: 14 }} />
          </LiquidGlassButton>
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); Alert.alert('Restore purchases', 'No previous subscription found on this Apple ID.'); }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={web.restoreTxt}>Restore</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <Animated.View
          pointerEvents="box-none"
          // Same top offset the native question header's back button lands
          // at (insets.top + that row's own 12px paddingVertical) —
          // explicit "back button must never move" fix, this was 4px off.
          style={{ position: 'absolute', top: topInset + 12, left: 0, right: 0, zIndex: 80, opacity: backFade }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 }}>
            <LiquidGlassButton
              onPress={() => { Haptics.selectionAsync(); onBack(); }}
              hitSlop={12}
              radius={17}
              variant={isDcPage ? 'regular' : 'clear'}
              fallbackColor={isDcPage ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.35)'}
              style={[web.backCircle, isDcPage && web.backCircleDc]}
            >
              <SymbolView name="chevron.left" size={15} tintColor={isDcPage ? '#1b1f27' : '#fff'} type="monochrome" style={{ width: 15, height: 15 }} />
            </LiquidGlassButton>
            {progress != null && (
              <View style={{ flex: 1, paddingHorizontal: 12 }}>
                <View style={s.pt}><View style={[s.pf, { width: `${progress * 100}%` }]} /></View>
              </View>
            )}
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const web = StyleSheet.create({
  backCircle: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  restoreTxt: { fontSize: 13, fontWeight: '600', color: '#6e6e77', letterSpacing: -0.1 },
  // On the white DC pages: a clean light chip, not a heavy dark blob.
  backCircleDc: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.10)', ...({ boxShadow: '0px 2px 8px rgba(0,0,0,0.10)' } as any) },
});

// ── DcPagePool — the last 3 pre-paywall WebView pages (plan ready, trial
// timeline, paywall) kept mounted at once. They boot once (during the
// generatePlan "generating…" beat) and after that switching between them is
// just a visibility toggle, so "Continue" is instant instead of a cold
// WebView reload. generatePlan itself is deliberately slow (it's a loading
// screen) so it stays a normal one-shot screen, not pooled.
type PoolKey = 'planReady' | 'trialTimeline' | 'paywall';
const POOL_ORDER: PoolKey[] = ['planReady', 'trialTimeline', 'paywall'];

function DcPagePool({ activeKey, answers, topInset, progressFor, onAdvance, onBack, onEditInfo, onEditValue }: {
  activeKey: PoolKey | null;
  answers: Record<string, any>;
  topInset: number;
  progressFor: (key: PoolKey) => number;
  onAdvance: (from: PoolKey) => void;
  onBack: (from: PoolKey) => void;
  onEditInfo: (field: string) => void;
  onEditValue: (field: string, value: string) => void;
}) {
  // planisreadynow.html's own template now has literal {{HEADER}} /
  // {{SUBLINE}} tokens baked in (direct file edit) — loaded here as raw
  // text ONCE, then string-replaced per the user's real answers BEFORE the
  // WebView ever sees it. This replaces the old approach of injecting JS
  // after load to search the DOM for the goalWeight span and swap its
  // parent's textContent, which kept silently failing to re-match across
  // several rounds. require() on a .html file gives Metro an asset module
  // (a numeric id resolved to a file/bundle URI), not the raw string, so
  // expo-asset resolves it to a local URI first and expo-file-system's
  // File.text() reads the actual bytes.
  const [rawPlanReadyHtml, setRawPlanReadyHtml] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const asset = Asset.fromModule(ONB_HTML.planReady);
        await asset.downloadAsync();
        const uri = asset.localUri || asset.uri;
        const text = await new File(uri).text();
        if (!cancelled) setRawPlanReadyHtml(text);
      } catch (err) {
        if (__DEV__) console.error('[onboarding] failed to load planisreadynow.html as text', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const planReadyHtml = useMemo(() => {
    if (!rawPlanReadyHtml) return null;
    const goal = computeGoalPlan(answers);
    return rawPlanReadyHtml
      .replace('{{HEADER}}', planReadyHeaderText(goal))
      .replace('{{SUBLINE}}', 'Starting today');
  }, [rawPlanReadyHtml, answers]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {POOL_ORDER.map((key) => (
        <OnboardingWebScreen
          key={key}
          htmlKey={key}
          htmlOverride={key === 'planReady' ? planReadyHtml ?? undefined : undefined}
          topInset={topInset}
          progress={progressFor(key)}
          poolActive={activeKey === key}
          extraJs={key === 'planReady' ? planReadyInject(answers) : undefined}
          onAdvance={() => onAdvance(key)}
          onBack={() => onBack(key)}
          onEditInfo={key === 'planReady' ? onEditInfo : undefined}
          onEditValue={key === 'planReady' ? onEditValue : undefined}
        />
      ))}
    </View>
  );
}

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
  type:           'select' | 'multiselect' | 'wheel' | 'slider' | 'ruler' | 'placeholder' | 'text' | 'locationBubbles' | 'videoClip' | 'webview' | 'guessSlider';
  question:       string;
  subtitle?:      string;
  placeholder?:   string;
  options?:       StepOptions;
  wheelKind?:     'age' | 'height';
  htmlKey?:       'strengthAssessment' | 'rankReveal' | 'giveVsWithout' | 'giveRealisticTarget' | 'formConfidence' | 'goalPace' | 'giveGoodHands' | 'notAlone';
  // Per-step content injection for type: 'webview' steps whose default
  // copy needs real user data swapped in (same literal-match technique as
  // every other artboard this session). Steps that are fine with the
  // artboard's own built-in default copy (e.g. giveVsWithout's generic
  // marketing line) just omit this.
  webviewInject?: (a: Record<string, any>) => string;
  showIf?:        (a: Record<string, any>) => boolean;
  clearAllOption?: string;
}

function resolveOptions(opts: StepOptions | undefined, a: Record<string, any>): OptionDef[] {
  if (!opts) return [];
  return typeof opts === 'function' ? opts(a) : opts;
}

// ── STEPS — the pre-paywall question flow, in order. The former "GIVE"
// interstitials (giveGoodHands, giveFormConfidence) are now type: 'webview'
// real-design artboards, same as every other webview step. Any remaining
// design-pending placeholders (type: 'placeholder') render via a dedicated
// branch further down.
// Order per explicit reorder spec. mainGoal's labels are now the full
// "Build muscle / Gain weight" style single-line copy (no sublabel) — the
// STORED answer is this exact string now, so every comparison elsewhere
// (goalWeight's showIf right below, computeGoalPlan in
// lib/onboardingGoals.ts, MAIN_GOAL_OPTS/EditFieldOverlay) was updated to
// match these exact new strings, not left on the old short ones.
const STEPS: Step[] = [
  { id: 'sex', section: 'About You', type: 'select', question: "What's your sex?",
    subtitle: 'This helps us set accurate numbers for your plan.',
    options: [
      { label: 'Male',   sfSymbol: 'person.fill', customIcon: ICON.male   },
      { label: 'Female', sfSymbol: 'person.fill', customIcon: ICON.female },
    ]},
  { id: 'daysPerWeek', section: 'About You', type: 'select', question: 'How many days a week do you train?',
    subtitle: 'Be realistic. You can always change this later.',
    options: (() => {
      const DAY_ICONS = [ICON.oneDay, ICON.twoDays, ICON.threeDays, ICON.fourDays, ICON.fiveDays, ICON.sixDays];
      // Always 1-6 here — this now runs before Experience is asked, so the
      // old 7-day-for-advanced branch (which read answers.experience)
      // can't apply yet. Simplification, not an oversight.
      return Array.from({ length: 6 }, (_, i) => ({ label: `${i + 1} day${i === 0 ? '' : 's'}`, sfSymbol: `${i + 1}.circle.fill`, customIcon: DAY_ICONS[i] }));
    })(),
  },
  { id: 'age', section: 'About You', type: 'wheel', wheelKind: 'age', question: 'How old are you?',
    subtitle: "We'll use this to set the right pace for you.",
  },
  { id: 'howHeard', section: 'About You', type: 'select', question: 'How did you hear\nabout us?',
    subtitle: "Just curious, there's no wrong answer.",
    options: [
      { label: 'Instagram / TikTok', sfSymbol: 'play.rectangle.fill', customIcon: ICON.socialMedia },
      { label: 'Friend or referral', sfSymbol: 'person.2.fill',       customIcon: ICON.shareLink },
      { label: 'App Store search',   sfSymbol: 'magnifyingglass',     customIcon: ICON.appStore },
      { label: 'Google / web search', sfSymbol: 'globe',              customIcon: ICON.search },
      { label: 'Other',              sfSymbol: 'ellipsis.circle.fill', customIcon: ICON.other },
    ]},
  { id: 'triedOtherApps', section: 'About You', type: 'select', question: 'Have you tried other workout apps?',
    subtitle: "We want to know what's worked for you and what hasn't.",
    options: [
      { label: 'Yes', sfSymbol: 'checkmark.circle.fill', customIcon: ICON.yes },
      { label: 'No',  sfSymbol: 'xmark.circle.fill',     customIcon: ICON.no  },
    ]},
  { id: 'giveVsWithout', section: 'About You', type: 'webview', question: 'With FormPal vs without', htmlKey: 'giveVsWithout' },

  { id: 'height', section: 'About You', type: 'wheel', wheelKind: 'height', question: 'How tall are you?',
    subtitle: 'This feeds into your form and progress tracking.',
  },
  { id: 'weight', section: 'About You', type: 'ruler', question: 'What do you weigh?',
    subtitle: "This sets your starting point.",
  },
  { id: 'hasTrainer', section: 'About You', type: 'select', question: 'Do you work with a personal trainer?',
    subtitle: 'This helps us understand your current support system.',
    options: [
      { label: 'Yes', sfSymbol: 'checkmark.circle.fill', customIcon: ICON.yes },
      { label: 'No',  sfSymbol: 'xmark.circle.fill',     customIcon: ICON.no  },
    ]},

  { id: 'mainGoal', section: 'Your Goal', type: 'select', question: "What's your main goal?",
    subtitle: 'This shapes your whole plan, so pick what matters most.',
    options: [
      { label: 'Build muscle · Gain weight',    sfSymbol: 'dumbbell.fill',                customIcon: ICON.muscle },
      { label: 'Lose fat · Lose weight',        sfSymbol: 'flame.fill',                   customIcon: ICON.scale  },
      { label: 'Recomp · Lose fat, build muscle', sfSymbol: 'arrow.triangle.2.circlepath', customIcon: ICON.onAndOff },
    ]},
  { id: 'goalWeight', section: 'Your Goal', type: 'ruler', question: "What's your goal weight?",
    subtitle: "We'll build a realistic plan to get you there.",
    showIf: a => typeof a.mainGoal !== 'string' || !a.mainGoal.startsWith('Recomp'),
  },
  // Real design artboard (goalpace.html) — self-contained draggable 3-pace
  // picker (relaxed/balanced/aggressive, 0.25-1.5x), its own animated gait
  // icons. The chosen multiplier is captured as answers.pace and feeds
  // computeGoalPlan()'s rate, so the goal date everywhere downstream
  // (realistic target, plan ready) reflects it. Its OWN on-screen "weeks"
  // estimate stays illustrative — it's computed from a static default
  // goalLbs (11) baked into the export, since this static bundle has no
  // live prop-override channel to feed it the real number. Recomp-skipped
  // — explicit ask, pace/target framing doesn't apply there.
  { id: 'goalPace', section: 'Your Goal', type: 'webview', question: 'Goal pace', htmlKey: 'goalPace', webviewInject: goalPaceInject,
    showIf: a => typeof a.mainGoal !== 'string' || !a.mainGoal.startsWith('Recomp'),
  },
  { id: 'giveRealisticTarget', section: 'Your Goal', type: 'webview', question: 'Realistic target', htmlKey: 'giveRealisticTarget', webviewInject: realisticTargetInject,
    showIf: a => typeof a.mainGoal !== 'string' || !a.mainGoal.startsWith('Recomp'),
  },

  { id: 'trainDuration', section: 'Your Training', type: 'select', question: 'How long have you been training for?',
    subtitle: 'This helps us set your starting difficulty.',
    options: [
      { label: '1-2 months', sfSymbol: 'sparkles', customIcon: ICON.justStarting },
      { label: '2-6 months', sfSymbol: 'clock.fill', customIcon: ICON.lessThan6mo },
      { label: '6-12 months', sfSymbol: 'clock.fill', customIcon: ICON.sixTo12mo },
      { label: '1-2 years', sfSymbol: 'calendar', customIcon: ICON.oneToTwoYr },
      { label: '2-5 years', sfSymbol: 'calendar', customIcon: ICON.twoToFiveYr },
      { label: '5-10 years', sfSymbol: 'calendar', customIcon: ICON.fiveToTenYr },
      { label: '10+ years', sfSymbol: 'calendar', customIcon: ICON.tenPlusYr },
    ]},
  { id: 'experience', section: 'Your Training', type: 'select', question: 'How well do you know proper form?',
    subtitle: 'Be honest. We meet you where you are.',
    options: [
      { label: 'Beginner', sfSymbol: '1.circle.fill', customIcon: ICON.beginnerGym },
      { label: 'Some experience', sfSymbol: '2.circle.fill', customIcon: ICON.someExpGym },
      { label: 'Intermediate', sfSymbol: '3.circle.fill', customIcon: ICON.intermediateGym },
      { label: 'Advanced', sfSymbol: '4.circle.fill', customIcon: ICON.expertGym },
    ]},
  { id: 'duration', section: 'Your Training', type: 'select', question: 'How long per session?',
    subtitle: 'How much time can you realistically give each workout?',
    options: [
      { label: '15-20 min', sfSymbol: 'clock.fill', customIcon: ICON.fifteenMin },
      { label: '30 min', sfSymbol: 'clock.fill', customIcon: ICON.thirtyMin },
      { label: '45 min', sfSymbol: 'clock.fill', customIcon: ICON.fortyFiveMin },
      { label: '60 min', sfSymbol: 'clock.fill', customIcon: ICON.sixtyMin },
      { label: '75+ min', sfSymbol: 'clock.fill', customIcon: ICON.seventyFiveMin },
    ]},

  // Moved back into the main pre-paywall flow — explicit ask, nothing
  // should run after the paywall any more (the old 'postQuestions'
  // appState + POST_STEPS array are both gone).
  { id: 'cardio', section: 'Your Training', type: 'select', question: 'Do you do any cardio or other training?',
    subtitle: 'This helps us balance your weekly plan.',
    options: [
      { label: 'Yes, regularly', sfSymbol: 'figure.run', customIcon: ICON.running },
      { label: 'Sometimes', sfSymbol: 'figure.walk', customIcon: ICON.walking },
      { label: 'No, just lifting', sfSymbol: 'dumbbell.fill', customIcon: ICON.dumbbell },
      { label: 'I want to add some', sfSymbol: 'plus.circle.fill', customIcon: ICON.fire },
    ]},
  { id: 'cardioTypes', section: 'Your Training', type: 'multiselect', question: 'What kind?',
    subtitle: 'Select everything you do.',
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
  { id: 'trainTime', section: 'Your Training', type: 'select', question: 'What time of day do you usually train?',
    subtitle: "We'll time your reminders around this.",
    options: [
      { label: 'Morning', sfSymbol: 'sunrise.fill', customIcon: ICON.morning },
      { label: 'Afternoon', sfSymbol: 'sun.max.fill', customIcon: ICON.afternoon },
      { label: 'Evening', sfSymbol: 'moon.stars.fill', customIcon: ICON.night },
      { label: 'Varies', sfSymbol: 'shuffle', customIcon: ICON.onAndOff },
    ]},

  { id: 'trainingLocation', section: 'Your Training', type: 'locationBubbles', question: 'Where do you train?',
    subtitle: 'This decides which exercises we give you.',
  },
  { id: 'homeEquipment', section: 'Your Training', type: 'multiselect', question: 'Equipment you have at home?',
    subtitle: "Select everything you have. We'll build around it.",
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
    subtitle: "We'll avoid exercises that need what you don't have.",
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

  { id: 'struggle', section: 'Your Goal', type: 'multiselect', question: "What's stopping you from reaching your goal?",
    subtitle: 'Pick everything that applies. This helps us support you.',
    clearAllOption: 'Nothing — just ready to start',
    options: [
      { label: 'Not seeing results', sfSymbol: 'minus.circle.fill', customIcon: ICON.noResults },
      { label: "Not sure if I'm training right", sfSymbol: 'questionmark.circle.fill', customIcon: ICON.notSure },
      { label: 'Staying consistent', sfSymbol: 'repeat', customIcon: ICON.days },
      { label: 'Losing motivation', sfSymbol: 'flame.fill', customIcon: ICON.scared },
      { label: 'Injuries or pain', sfSymbol: 'bandage.fill', customIcon: ICON.wrist },
      { label: 'Nothing — just ready to start', sfSymbol: 'checkmark.circle.fill', customIcon: ICON.good },
    ],
  },
  { id: 'accomplish', section: 'Your Goal', type: 'multiselect', question: 'What would you like to accomplish?',
    subtitle: "Pick everything you'd like FormPal to help with.",
    options: [
      { label: 'Learn proper form', sfSymbol: 'camera.fill', customIcon: ICON.trainProperly },
      { label: 'Feel confident in the gym', sfSymbol: 'star.fill', customIcon: ICON.lookBetter },
      { label: 'Train without getting hurt', sfSymbol: 'bandage.fill', customIcon: ICON.wrist },
      { label: 'Stay consistent', sfSymbol: 'repeat', customIcon: ICON.stayConsistentIcon },
      { label: 'Finally see results', sfSymbol: 'checkmark.circle.fill', customIcon: ICON.seeingResults },
    ]},
  // Real design artboard now (goodhandsv2.html) — static copy, no
  // struggle/accomplish echo (the old native version's personalization
  // isn't in the new design).
  { id: 'giveGoodHands', section: 'Your Goal', type: 'webview', question: "You're in good hands", htmlKey: 'giveGoodHands' },

  { id: 'injuries', section: 'Your Body', type: 'multiselect', question: 'Any injuries or areas that hurt?',
    subtitle: "We'll avoid exercises that could aggravate these.",
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
  // Real design artboard now (formconfidence.html) — a fully self-contained
  // draggable 3-state slider with its own internal drag logic. Captures
  // its final value through the same editvalue: postMessage channel
  // planReady's pencil-edit uses (see formConfidenceInject).
  { id: 'formConfidence', section: 'Your Body', type: 'webview', question: 'How confident are you in your current form?',
    htmlKey: 'formConfidence', webviewInject: formConfidenceInject,
  },
  // Real design artboard now (notalone.html). Shows for "somewhat" or
  // "not confident" (anything but the top "Very confident" = 100 band) —
  // explicit ask: "if their form confidence is somewhat or low, show the
  // you're not alone screen." formConfidenceInject only ever posts 0, 50,
  // or 100 (see VALS map), so < 100 is exactly "not very confident".
  { id: 'giveFormConfidence', section: 'Your Body', type: 'webview', question: 'Form confidence check-in', htmlKey: 'notAlone',
    showIf: a => (typeof a.formConfidence === 'number' ? a.formConfidence : 50) < 100,
  },
];

function getVisibleSteps(a: Record<string, any>): Step[] {
  return STEPS.filter(s => !s.showIf || s.showIf(a));
}

// Swaps the LAST space in a string for a non-breaking space so a question
// that wraps to a second line can never leave a single lonely word by
// itself on it — the last two words stay glued together and wrap as a pair
// (or not at all), same "no orphans" trick as web `&nbsp;`.
function noOrphan(text: string): string {
  const i = text.lastIndexOf(' ');
  return i === -1 ? text : text.slice(0, i) + ' ' + text.slice(i + 1);
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

// ── AnimatedOption ─────────────────────────────────────────────────────────────

// Same back button + progress track/fill the question header (s.qh/s.bb/
// s.pc/s.pt/s.pf) uses, minus the Skip button — for the handful of fully
// native screens (connectHealth, notifications) that had no header at
// all before. Universal "same bar, same position, every screen" fix.
function SimpleProgressHeader({ progress, onBack }: { progress: number; onBack: () => void }) {
  return (
    <View style={s.qh}>
      <LiquidGlassButton onPress={onBack} hitSlop={12} radius={17} variant="regular" fallbackColor="rgba(255,255,255,0.92)" style={s.bb}>
        <SymbolView name="chevron.left" size={15} tintColor="#1b1f27" type="monochrome" style={{ width: 15, height: 15 }} />
      </LiquidGlassButton>
      <View style={s.pc}>
        <View style={s.pt}><View style={[s.pf, { width: `${progress * 100}%` }]} /></View>
      </View>
      <View style={s.skipBtn} />
    </View>
  );
}

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

// ── RankCalcOverlay — the "Reading your answers" beat, OVERLAID on the
// still-mounted strengthAssessment screen (not a navigation to a separate
// page). Blurs the still-visible page behind it, no card/scrim otherwise —
// just the text + a progress bar, sitting ABOVE where the page's own
// Continue button is, not covering it. Static label (no typewriter — was
// reported as unwanted), plain solid blue (the gradient read badly at this
// thickness — a thin multi-stop gradient smeared rather than reading as
// "colorful"), thicker bar, and RankCalcOverlay's own duration IS the wait —
// the parent's timeout (see rankCalcOverlay effect) matches it exactly, so
// the next screen appears right as the bar finishes, not after a dead pause.
// A bit longer than the original 1200ms (was reported as "gets to the end
// too fast") — the parent's advance timer (see rankCalcOverlay effect)
// uses this exact same value, so there's no dead pause once it fills.
const RANK_CALC_MS = 1900;

function RankCalcOverlay({ bottomInset }: { bottomInset: number }) {
  const fade = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    Animated.timing(progress, { toValue: 1, duration: RANK_CALC_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [fade, progress]);

  const widthPct = progress.interpolate({ inputRange: [0, 1], outputRange: ['8%', '100%'] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        <BlurView intensity={26} tint="light" style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[rc.wrap, { opacity: fade, bottom: bottomInset + 110 }]}>
        <Text style={rc.label}>Reading your answers</Text>
        <View style={rc.track}>
          <Animated.View style={[rc.fill, { width: widthPct }]} />
        </View>
      </Animated.View>
    </View>
  );
}

// New full-screen loader between the last question and the rank run —
// same visual language as RankCalcOverlay (label + thin progress bar),
// but standalone (own background, not overlaid on another screen) and
// two-phase: "Answers locked in." while the bar fills, then swaps to the
// real copy and reveals a Continue button instead of auto-advancing.
function PreRankLoaderScreen({ insets, onAdvance }: { insets: { top: number; bottom: number }; onAdvance: () => void }) {
  const fade = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const ctaFade = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState<'locking' | 'ready'>('locking');

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    Animated.timing(progress, { toValue: 1, duration: RANK_CALC_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => {
      setPhase('ready');
      Animated.timing(ctaFade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const widthPct = progress.interpolate({ inputRange: [0, 1], outputRange: ['8%', '100%'] });

  return (
    <OnboardingBackground>
      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Animated.View style={{ opacity: fade, width: '100%' }}>
            <Text style={[rc.label, { fontSize: 20, textAlign: 'center', marginBottom: 18 }]}>
              {phase === 'locking' ? 'Answers locked in.' : "Before we build your plan, let's find your starting point."}
            </Text>
            <View style={rc.track}>
              <Animated.View style={[rc.fill, { width: widthPct }]} />
            </View>
          </Animated.View>
        </View>
        <Animated.View style={[s.bn, { opacity: ctaFade }]} pointerEvents={phase === 'ready' ? 'auto' : 'none'}>
          <TouchableOpacity style={s.cb} onPress={onAdvance} activeOpacity={0.85}>
            <Text style={s.ct}>Continue</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </OnboardingBackground>
  );
}

const rc = StyleSheet.create({
  wrap: { position: 'absolute', left: 24, right: 24 },
  label: { fontFamily: FONT.displayBold, fontSize: 15, color: L.text, marginBottom: 12, letterSpacing: -0.2 },
  track: { width: '100%', height: 9, borderRadius: 4.5, backgroundColor: '#E9ECF3', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4.5, backgroundColor: '#2E7DFF' },
});

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

// Plain weight display. Several rounds of a custom scroll/roll animation
// never landed right on device — back to a normal, reliable instant text
// swap per explicit ask, rather than keep spending rounds on it.
function RollingWeightValue({ value }: { value: number }) {
  return (
    <Text style={{ fontFamily: FONT.displayBold, fontSize: 52, color: L.text, letterSpacing: -1, marginBottom: 36 }}>
      {value.toFixed(1)}<Text style={{ fontSize: 17, fontWeight: W.semi, color: L.textDim }}> lbs</Text>
    </Text>
  );
}

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
  // NO mount fade/slide of its own — this component already renders inside
  // the question's own Animated.View (fadeAnim/slideAnim in the parent),
  // which already fades+slides the WHOLE question in. A SECOND, separately-
  // timed fade nested inside that was the real bug behind "the weight stuff
  // spawns in weird" / "flashes" — two animations on different clocks,
  // fighting over when this content actually becomes visible. Trust the
  // parent's entrance like every other question type does.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => {
        startRef.current = (valuePx as any)._value ?? pxFromValue(value);
      },
      onPanResponderMove: (_, gs) => {
        // Dragging LEFT reveals higher numbers at center (same feel as
        // scrolling a horizontal picker) — subtract dx, not add it.
        const raw  = startRef.current - gs.dx;
        const next = Math.max(0, Math.min(trackWidth, raw));
        valuePx.setValue(next);
        const v = Math.round(valueFromPx(next) * 10) / 10;
        onChange(v);
        // Every move, not throttled — RollingWeightValue tracks the raw
        // continuous position directly now instead of firing a triggered
        // animation per discrete change, so there's no interruption risk
        // to throttle around, and the whole point is that it follows the
        // drag in real time.
        setDisplayVal(v);
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
      <RollingWeightValue value={displayVal} />

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

// Notifications screen's own bell icon — NotificationBanner's toast preview
// does the actual "here's what you'll get" demonstration above this.
const nq = StyleSheet.create({
  iconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: L.accent, alignItems: 'center', justifyContent: 'center' },
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

// The "wasted reps" framing (computeWastedReps/cinematicLines, and the
// formGuess question that fed it) is gone — the cinematic graph and plan
// screens now narrate from the real goal-calculation engine
// (lib/onboardingGoals.ts) instead. getRealFormPct still backs
// computeRank's form-points component; with no formGuess question left to
// answer it, it falls straight to the demo-session fallback (also
// typically absent for a fresh onboarding) and then its default.
function getRealFormPct(answers: Record<string, any>): number {
  if (typeof answers.demoGoodReps === 'number' && typeof answers.demoReps === 'number' && answers.demoReps > 0) {
    return Math.round((answers.demoGoodReps / answers.demoReps) * 100);
  }
  return 70;
}

// strengthassesment.html's entered numbers, captured off the DOM by
// STRENGTH_CAPTURE_JS and stored at a.strength (see onStrengthVals wiring).
// Nothing entered (or the assessment never even ran) = 0 points, same as
// every field defaulting to 0 reps — that's the intended behavior, not a
// bug: skipping the assessment should never fake a real result.
function strengthPoints(a: Record<string, any>): number {
  const st = a.strength as
    | { pushup?: { reps?: number }; pullup?: { reps?: number }; squat?: { reps?: number }; deadlift?: { weight?: number; reps?: number } }
    | undefined;
  if (!st) return 0;
  const pushReps = st.pushup?.reps ?? 0;
  const pullReps = st.pullup?.reps ?? 0;
  const squatReps = st.squat?.reps ?? 0;
  const dlWeight = st.deadlift?.weight ?? 0;
  const dlReps = st.deadlift?.reps ?? 0;
  const bw = typeof a.weight === 'number' ? a.weight : 0;

  const pushPts = pushReps >= 40 ? 3 : pushReps >= 25 ? 2 : pushReps >= 10 ? 1 : 0;
  const pullPts = pullReps >= 15 ? 3 : pullReps >= 8 ? 2 : pullReps >= 3 ? 1 : 0;
  const squatPts = squatReps >= 50 ? 3 : squatReps >= 30 ? 2 : squatReps >= 15 ? 1 : 0;
  const dlRatio = bw > 0 && dlReps > 0 ? dlWeight / bw : 0;
  const dlPts = dlRatio >= 2 ? 3 : dlRatio >= 1.5 ? 2 : dlRatio >= 1 ? 1 : 0;
  return pushPts + pullPts + squatPts + dlPts; // 0..12
}

// "Better than N% of new lifters" per sub-tier — replaces the artboard's
// single hardcoded 55%/46% notes (same number regardless of actual rank).
const RANK_PERCENTILE = [12, 22, 30, 38, 46, 54, 62, 70]; // idx 0..7 = Bronze I..Silver IV

// The starting rank shown on the reveal + the cinematic graph. Derived from
// experience / guessed form % / training duration from the earlier
// questions, PLUS real strength-assessment numbers (strengthPoints above),
// which now dominate the score — without them (assessment skipped or
// nothing entered), the result is capped at Bronze IV; Silver requires the
// assessment to have actually shown real strength (strPts >= 3, e.g. 25+
// push-ups or a bodyweight deadlift). Capped at Silver IV overall —
// onboarding never starts anyone above Silver.
//
// strPts === 0 (assessment skipped or every field left at 0) is forced
// straight to Bronze I, full stop — not just capped at Bronze IV. Letting
// the earlier questions (experience/form-guess/duration) still push a
// zero-effort assessment up to Bronze II-IV was the actual bug behind
// "I answered nothing and still got Bronze II."
function computeRank(a: Record<string, any>): { name: string; tier: string; label: string; idx: number; percentile: number } {
  const exp = ({ 'Beginner': 0, 'Some experience': 1, 'Intermediate': 2, 'Advanced': 3 } as Record<string, number>)[a.experience as string] ?? 0;
  const fp = getRealFormPct(a);
  const formPts = fp >= 90 ? 3 : fp >= 70 ? 2 : fp >= 45 ? 1 : 0;
  const dur = DURATION_YEARS[(a.trainDuration as string) ?? ''] ?? 1;
  const durPts = dur >= 5 ? 2 : dur >= 2 ? 1 : 0;
  const strPts = strengthPoints(a);
  const score = exp * 2 + formPts + durPts + strPts; // 0..23
  const rawIdx = Math.round((score * 7) / 23);
  const idx = strPts === 0 ? 0 : strPts >= 3 ? Math.max(0, Math.min(7, rawIdx)) : Math.max(0, Math.min(3, rawIdx));
  const name = idx < 4 ? 'Bronze' : 'Silver';
  const tier = ['I', 'II', 'III', 'IV'][idx % 4];
  return { name, tier, label: `${name} ${tier}`, idx, percentile: RANK_PERCENTILE[idx] };
}

// Tells rankrevealwheel's bronze/silver LADDER rows (and get target()) which
// rank to actually land on and display — see the require() comment on
// ONB_HTML.rankReveal. Runs via injectedJavaScriptBeforeContentLoaded, so
// it's on `window` before the artboard's own script reads it.
function rankRevealPreloadJs(a: Record<string, any>): string {
  const rank = computeRank(a);
  const key = rank.name.toLowerCase(); // 'bronze' | 'silver' — the only two computeRank() ever returns
  const note = `Stronger than ${rank.percentile}% of new lifters`;
  return `window.__FORMPAL_RANK_KEY = ${JSON.stringify(key)}; window.__FORMPAL_RANK_LABEL = ${JSON.stringify(rank.label)}; window.__FORMPAL_PERCENTILE_NOTE = ${JSON.stringify(note)};`;
}

// The reel's landed row reads its name/note off the LADDER edit (see
// ONB_HTML.rankReveal's require() comment) — but the footer line right
// below it ("Bronze II is your starting point…") is separate, plain static
// markup, not templated at all, so it can only be fixed post-load. This is
// the actual source of "the bottom text says Bronze II" no matter what the
// reveal actually landed on.
const RANK_REVEAL_FOOTER_JS = `
(function(){
  function apply(){
    var label = window.__FORMPAL_RANK_LABEL;
    if (!label) return false;
    // querySelectorAll('#dc-root div') returns every div in the page,
    // ancestors included — and an ANCESTOR's innerHTML also contains this
    // same substring, since it's just further-down descendant text.
    // Matching on innerHTML with no depth check hit that ancestor FIRST
    // (parents precede their own descendants in document order) and
    // rewrote its entire subtree from a string — destroying the live
    // reel's DOM (refs, running animation, everything) it happened to be
    // sitting inside. That's the actual cause of the reel getting stuck on
    // "Your rank is..." and never landing, not a separate bug.
    // The target div itself has a nested <span> (the "real-time feedback"
    // highlight), so "only touch leaf divs" isn't right either — it'd
    // never match anything. Only replace on the MOST SPECIFIC matching
    // element: one whose own children don't ALSO contain this text (an
    // ancestor's only reason for matching is that a descendant does).
    var els = document.querySelectorAll('#dc-root div');
    var hit = 0;
    for (var i=0;i<els.length;i++){
      var el = els[i];
      var html = el.innerHTML || '';
      if (html.indexOf('Bronze II is your starting point') < 0) continue;
      var isMostSpecific = true;
      for (var c=0;c<el.children.length;c++){
        if ((el.children[c].innerHTML||'').indexOf('Bronze II is your starting point') >= 0) { isMostSpecific = false; break; }
      }
      if (!isMostSpecific) continue;
      // Real default sentence (confirmed by extraction): "Bronze II is
      // your starting point. The right plan and <span>real-time
      // feedback</span> can make the climb clearer." New copy replaces
      // the WHOLE line (no highlighted span needed) — textContent, not
      // innerHTML.replace on just the matched prefix, so none of the
      // original trailing sentence is left dangling after it.
      el.textContent = 'Your plan starts here. Your rank climbs as your form gets cleaner.';
      hit++;
    }
    // Headline — a plain leaf div OUTSIDE/above the reel (separate sibling
    // container, confirmed by extraction), so a simple exact-text leaf
    // match is safe here (none of the reel-DOM-preserving care the footer
    // line above needs — that one sits INSIDE the live reel's own markup).
    var heads = document.querySelectorAll('#dc-root div');
    for (var j=0;j<heads.length;j++){
      var he = heads[j]; if (he.children.length) continue;
      if ((he.textContent||'').trim() === 'Your starting rank is...') { he.textContent = 'Your starting point.'; hit++; }
    }
    return hit >= 1;
  }
  if (!apply()) [150, 400, 900, 1600, 3000].forEach(function(d){ setTimeout(apply, d); });
})();
`;

// ── GuessSlider — 0-100%, single track. Reused now for the form-confidence
// placeholder (screen 22) — the real "how many of your reps do you think
// are actually good form?" copy it was originally built for is gone along
// with the formGuess question, but the slider mechanics are unchanged.
function GuessSlider({ value, onChange, lowLabel = 'None of them', highLabel = 'Every one' }: {
  value: number; onChange: (v: number) => void; lowLabel?: string; highLabel?: string;
}) {
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
        <Text style={{ fontSize: 12, color: L.textDim }}>{lowLabel}</Text>
        <Text style={{ fontSize: 12, color: L.textDim }}>{highLabel}</Text>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

type AppState =
  | 'welcome' | 'onboarding'
  // "Answers locked in." loader between the last question and the rank
  // run — reuses the RankCalcOverlay visual language as a full screen.
  | 'preRankLoader'
  // Rank run — straight after the loader.
  | 'rankWheel' | 'rankAssess' | 'rankReveal'
  // Recovery Route is removed from the flow — rankReveal goes straight to
  // thankYou now, 2 more native beats, then plan-generation.
  | 'thankYou' | 'connectHealth' | 'notifications'
  // Real design artboard (readytobuild.html) — one more beat right before
  // plan generation actually kicks off.
  | 'readyToBuild'
  // The pre-paywall pages, in order. saveProgress + tryForFree are native
  // screens spliced in right after plan-ready. Nothing runs after the
  // paywall any more — cardio/cardioTypes/trainTime moved back into the
  // main pre-paywall question flow (see STEPS).
  | 'generatePlan' | 'planReady' | 'saveProgress' | 'tryForFree' | 'trialTimeline' | 'webPaywall';

type EditField = 'age' | 'height' | 'weight' | 'experience' | 'mainGoal';

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [appState,  setAppState]  = useState<AppState>('welcome');
  // Brief "Finalizing your rank" beat shown as an OVERLAY on top of the
  // still-mounted strengthAssessment screen (not a navigation to a separate
  // page) — right where Continue was tapped, per explicit ask. See the
  // useEffect below that turns it off and actually advances after a beat.
  const [rankCalcOverlay, setRankCalcOverlay] = useState(false);
  useEffect(() => {
    if (!rankCalcOverlay) return;
    // Matches RANK_CALC_MS (the bar's own fill duration) exactly — advance
    // lands right as the bar finishes, not after an extra dead pause once
    // it's already full.
    const t = setTimeout(() => { setRankCalcOverlay(false); setAppState('rankReveal'); }, RANK_CALC_MS);
    return () => clearTimeout(t);
  }, [rankCalcOverlay]);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers,   setAnswers]   = useState<Record<string, any>>({});
  const [plan,      setPlan]      = useState<{ focus: string; exercises: WorkoutExercise[] } | null>(null);
  // Which single info field the plan-ready page's pencil opened for editing
  // (null = not editing). Rendered as an overlay so the WebView stays put.
  const [editField, setEditField] = useState<EditField | null>(null);

  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Hero (welcome screen) + demo (demoClip step) clips. Created
  // unconditionally so the hooks are stable; a null source just renders
  // black until the real files are dropped in (see HERO_VIDEO / DEMO_VIDEO).
  const heroPlayer = useVideoPlayer(HERO_VIDEO, p => { p.loop = true; p.muted = true; });
  const demoPlayer = useVideoPlayer(DEMO_VIDEO, p => { p.loop = true; p.muted = true; p.play(); });

  // expo-video: play() inside the factory can silently no-op on iOS before
  // the source is ready, so the hero clip sat frozen. Kick it on mount and
  // again the moment it reports ready, and keep it looping.
  useEffect(() => {
    if (!HERO_VIDEO) return;
    heroPlayer.play();
    const sub = heroPlayer.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') heroPlayer.play();
    });
    return () => sub.remove();
  }, [heroPlayer]);

  const visibleSteps = getVisibleSteps(answers);
  const currentStep  = visibleSteps[stepIndex];

  // ── Global progress — ONE bar, same track/fill, spanning the WHOLE
  // onboarding flow (questions + rank run + post-rank + pre-paywall), not
  // just the question steps — explicit ask, was inconsistent/missing on
  // everything after the last question.
  const RANK_POST_FLOW: AppState[] = [
    'preRankLoader', 'rankWheel', 'rankAssess', 'rankReveal',
    'thankYou', 'connectHealth', 'notifications', 'readyToBuild',
    'generatePlan', 'planReady', 'saveProgress', 'tryForFree', 'trialTimeline', 'webPaywall',
  ];
  const TOTAL_FLOW_LEN = visibleSteps.length + RANK_POST_FLOW.length;
  const progress = (() => {
    if (appState === 'onboarding') return visibleSteps.length > 0 ? (stepIndex + 1) / TOTAL_FLOW_LEN : 0;
    const idx = RANK_POST_FLOW.indexOf(appState);
    if (idx === -1) return 1;
    return (visibleSteps.length + idx + 1) / TOTAL_FLOW_LEN;
  })();

  // Preload every answer-choice icon up front. They're already require()'d
  // (so Metro bundles them), but each <Image> still decodes lazily the
  // first time it mounts — clicking through screens fast enough outran that
  // decode and showed a blank/glitchy icon for a frame. Asset.loadAsync
  // forces them into the native image cache once, here, before any of them
  // are ever shown.
  //
  // Rank shields included too — RankWheelScreen mounts all 7 cold the
  // instant the last question advances into it, decoding seven PNGs at once
  // on the same frame as the screen swap. That decode stall is what let the
  // Stack navigator's own dark background (#0A0B0C, see app/_layout.tsx)
  // show through for a frame before the wheel's white content painted — the
  // "black screen" during that transition. Warming them here, well before
  // the user can possibly reach that screen, removes the stall.
  useEffect(() => {
    Asset.loadAsync(Object.values(ICON)).catch(() => {});
    Asset.loadAsync(Object.values(RANK_SHIELD_ASSETS)).catch(() => {});
  }, []);

  // Direction of the transition currently in flight — read by the fade-in
  // effect below, since it fires after animTrans has already returned.
  // transTick is bumped once per completed animTrans transition; the effect
  // keys on THIS (not stepIndex/appState directly) specifically so it never
  // fires for OTHER stepIndex/appState changes that already animate
  // themselves outside animTrans — e.g. RankWheelScreen's own back handler,
  // which sets both plus runs its own fade/slide inline. Keying on raw
  // stepIndex/appState would double-animate against that.
  const transDirRef = useRef<'forward' | 'back'>('forward');
  const didMountRef = useRef(false);
  const [transTick, setTransTick] = useState(0);

  const animTrans = (dir: 'forward' | 'back', cb: () => void) => {
    const out = dir === 'forward' ? -36 : 36;
    transDirRef.current = dir;
    // Stop whatever's still running on these two shared values first — e.g.
    // the rank-wheel back handler animates them directly outside this
    // function; without stopping it first, a fast back-then-forward could
    // leave two animations fighting over the same value, which is the kind
    // of thing that leaves opacity parked somewhere unexpected (read as a
    // black-screen flash on repeat visits, not the first one).
    fadeAnim.stopAnimation();
    slideAnim.stopAnimation();
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: out, duration: 120, useNativeDriver: true }),
    ]).start(({ finished }) => {
      // A newer transition interrupted this one (stopAnimation() above) —
      // finished is false, and THAT newer call owns the commit. Firing cb()
      // here too would double-advance stepIndex.
      if (!finished) return;
      // The fade/slide BACK IN used to start right here, imperatively, in
      // the same tick as cb(). cb() flips stepIndex via
      // unstable_batchedUpdates, but that's a state update — React can
      // commit it a tick later than this synchronous callback runs
      // (especially likely under React 18's automatic batching). The
      // native-driven fade-in animation doesn't wait for that: it starts
      // acting on whatever content is STILL actually mounted at this exact
      // instant, which — until React's commit lands — is the OLD question,
      // not the new one. fadeAnim ramping 0→1 on the still-mounted old
      // content is exactly "flashes the question you just answered again
      // quickly, then shows the new one" (the new content, once it does
      // mount, has no fade-in left to play). Moving the fade-in into a
      // useEffect keyed on transTick guarantees it only ever starts AFTER
      // React has committed the new step, since effects run post-commit by
      // contract — there's nothing old left to flash. Batching the tick
      // bump together with cb() keeps them landing in the same render.
      unstable_batchedUpdates(() => { cb(); setTransTick(t => t + 1); });
    });
  };

  // Fade/slide the NEW step in — runs after React has committed it (see the
  // comment in animTrans above for why this can't be imperative there).
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    const inn = transDirRef.current === 'forward' ? 36 : -36;
    slideAnim.setValue(inn);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transTick]);

  const advance = (ans: Record<string, any>, commit?: () => void) => {
    const vis = getVisibleSteps(ans);
    // commit() (setAnswers) and the state flip below used to be two
    // SEPARATE setState calls fired from inside an Animated .start()
    // callback — outside a React event handler, so not guaranteed to be
    // batched into one render. When they landed as two renders, the FIRST
    // one had the new (committed) answers but the OLD stepIndex/appState —
    // which is exactly the "quickly flashes a different/random question"
    // bug. unstable_batchedUpdates forces both into a single render no
    // matter what triggered this callback.
    if (stepIndex < vis.length - 1) {
      animTrans('forward', () => { unstable_batchedUpdates(() => { commit?.(); setStepIndex(i => i + 1); }); });
    } else {
      // Fade the last question out before the loader mounts, so it isn't a
      // hard white cut into it.
      animTrans('forward', () => { unstable_batchedUpdates(() => { commit?.(); setAppState('preRankLoader'); }); });
    }
  };

  const goBack = () => {
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
      // No more auto-advance — every question (single-select included) now
      // waits for an explicit Continue tap, so this can just set the
      // answer directly like multiselect does. The old 300ms
      // justSelected/setTimeout dance existed ONLY to avoid flashing a
      // different question mid-auto-advance when a showIf elsewhere
      // reacted to the new answer; with no auto-advance to race, that
      // problem doesn't exist any more.
      setAnswers({ ...answers, [st.id]: opt });
    }
  };

  const finishOnboarding = async () => {
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/(tabs)');
  };

  // ── WELCOME — Cal-AI style: white screen, a small floating phone mock
  // playing the demo clip, one bold line + "Get Started" + Sign In.

  if (appState === 'welcome') {
    return (
      <View style={[h.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <View style={h.stage}>
          {/* demovid.mov is already a phone screen-recording — no device frame
              around it (that read as a phone-in-a-phone-case). Just the clip. */}
          <View style={h.videoCard}>
            {HERO_VIDEO
              ? <VideoView
                  player={heroPlayer}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  nativeControls={false}
                />
              : <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111114' }]} />}
          </View>
        </View>

        <View style={h.bottom}>
          <Text style={h.headline}>Your phone becomes{'\n'}your form coach</Text>
          <TouchableOpacity
            style={h.cta}
            activeOpacity={0.9}
            onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); setStepIndex(0); setAppState('onboarding'); }}
          >
            <Text style={h.ctaTxt}>Get Started</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={h.signinWrap}
            hitSlop={8}
            activeOpacity={0.7}
            // TODO(auth): real sign-in — for now it just enters the flow.
            onPress={() => { haptic(); setStepIndex(0); setAppState('onboarding'); }}
          >
            <Text style={h.signin}>Already have an account? <Text style={h.signinBold}>Sign In</Text></Text>
          </TouchableOpacity>
        </View>

        {/* DEV — skip straight to the rank run. Absolute so it doesn't take
            layout space away from the phone. */}
        <TouchableOpacity
          onPress={() => { haptic(); setAppState('rankWheel'); }}
          style={h.devWrap}
          activeOpacity={0.6}
        >
          <Text style={h.dev}>skip to rank (dev)</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── ONBOARDING ───────────────────────────────────────────────────────────────

  if (appState === 'onboarding' && currentStep) {
    const st = currentStep;

    const header = (
      <View style={s.qh}>
        <LiquidGlassButton
          onPress={goBack}
          hitSlop={12}
          radius={17}
          variant="regular"
          fallbackColor="rgba(255,255,255,0.92)"
          style={s.bb}
        >
          <SymbolView name="chevron.left" size={15} tintColor="#1b1f27" type="monochrome" style={{ width: 15, height: 15 }} />
        </LiquidGlassButton>
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
            <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
              <View style={s.qBlock}>
                <Text style={s.qq}>{noOrphan(st.question)}</Text>
                {!!st.subtitle && <Text style={s.qqSub}>{st.subtitle}</Text>}
              </View>
              <Picker selectedValue={wheelVal} onValueChange={(v) => { Haptics.selectionAsync(); setAnswers({ ...answers, [st.id]: v as string }); }} style={{ height: 230, marginTop: 8 }} itemStyle={{ color: L.text, fontSize: 28, fontWeight: '600' }}>
                {opts.map(o => <Picker.Item key={o} label={o} value={o} />)}
              </Picker>
            </Animated.View>
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
            <Animated.View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 10, opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
              <Text style={s.qq}>{noOrphan(st.question)}</Text>
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <HomeSplitSlider value={sliderVal} onChange={(v) => setAnswers({ ...answers, [st.id]: v })} />
              </View>
            </Animated.View>
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
      const rulerDefault = st.id === 'goalWeight' && typeof answers.weight === 'number' ? (answers.weight as number) : 160;
      const rulerVal = typeof answers[st.id] === 'number' ? (answers[st.id] as number) : rulerDefault;
      return (
        <OnboardingBackground>
          <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
            {header}
            <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
              <View style={s.qBlock}>
                <Text style={s.qq} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{noOrphan(st.question)}</Text>
                {!!st.subtitle && <Text style={s.qqSub}>{st.subtitle}</Text>}
              </View>
              <View style={{ marginTop: 12, paddingHorizontal: 24 }}>
                <WeightRulerSlider
                  value={rulerVal}
                  onChange={(v) => setAnswers({ ...answers, [st.id]: v })}
                />
              </View>
              {st.id === 'goalWeight' && typeof answers.weight === 'number' && (
                <Text style={s.goalDelta}>
                  {rulerVal < answers.weight
                    ? `Lose: ${Math.round(answers.weight - rulerVal)} lbs`
                    : rulerVal > answers.weight
                    ? `Gain: ${Math.round(rulerVal - answers.weight)} lbs`
                    : 'Same as your current weight'}
                </Text>
              )}
            </Animated.View>
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
            <Animated.View style={{ paddingHorizontal: 24, paddingTop: 10, flex: 1, opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
              <Text style={s.qq}>{noOrphan(st.question)}</Text>
              <View style={{ flex: 1, justifyContent: 'center' }}>
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
            </Animated.View>
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
            <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
              <View style={s.qBlock}>
                <Text style={s.qq}>{noOrphan(st.question)}</Text>
                {!!st.subtitle && <Text style={s.qqSub}>{st.subtitle}</Text>}
              </View>
              <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
                <LocationBubbles
                  selected={picked}
                  onPick={(label) => { haptic(); setAnswers({ ...answers, [st.id]: label }); }}
                />
              </View>
            </Animated.View>
            <View style={s.bn}>
              <TouchableOpacity style={[s.cb, !picked && s.cbDisabled]} disabled={!picked} onPress={() => advance(answers)} activeOpacity={0.85}>
                <Text style={[s.ct, !picked && s.ctDisabled]}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </OnboardingBackground>
      );
    }

    // Guess slider — 0-100. Currently only formConfidence uses this.
    if (st.type === 'guessSlider') {
      const val = typeof answers[st.id] === 'number' ? (answers[st.id] as number) : 50;
      return (
        <OnboardingBackground>
          <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
            {header}
            <View style={{ flex: 1 }}>
              <View style={s.qBlock}>
                <Text style={s.qq}>{noOrphan(st.question)}</Text>
                {!!st.subtitle && <Text style={s.qqSub}>{st.subtitle}</Text>}
              </View>
              <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
                <GuessSlider
                  value={val}
                  onChange={(v) => setAnswers({ ...answers, [st.id]: v })}
                  lowLabel="Not confident at all"
                  highLabel="Very confident"
                />
              </View>
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

    // WebView screen — full-screen HTML artifact, its own back button.
    // webviewInject personalizes the artboard's default copy (see Step's
    // own comment). onEditValue reuses the same 'editvalue:field:value'
    // channel planReady's pencil-edit uses — formConfidence's inject posts
    // through it to capture the slider's final value before advancing.
    if (st.type === 'webview' && st.htmlKey) {
      // Animation suppression needs to run BEFORE the page's own script
      // ever executes (extraJsBeforeLoad), not after (extraJs) — running
      // it after-load was the actual cause of "white screen, then content
      // snaps in": the artboard's own entrance animations had already
      // started (invisible, behind the not-yet-revealed WebView) by the
      // time the after-load script froze them mid-flight. giveVsWithout
      // (plan comparison) is the one exception — its own staggered
      // entrance (title/card rise, then the chart actually draws in) is
      // real content the user explicitly wants to see play, not screen
      // chrome to suppress.
      const suppressAnim = st.htmlKey !== 'giveVsWithout' ? SUPPRESS_DC_ANIM_JS : undefined;
      return (
        <OnboardingWebScreen
          htmlKey={st.htmlKey}
          topInset={insets.top}
          progress={progress}
          extraJsBeforeLoad={suppressAnim}
          extraJs={st.webviewInject ? st.webviewInject(answers) : undefined}
          onAdvance={() => advance(answers)}
          onBack={goBack}
          onEditValue={(field, value) => {
            const num = parseFloat(value);
            setAnswers((a) => ({ ...a, [field]: isNaN(num) ? value : num }));
          }}
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
            <Text style={h.title}>{noOrphan(st.question)}</Text>
            {!!st.subtitle && <Text style={h.sub}>{st.subtitle}</Text>}
            <TouchableOpacity style={h.btn} onPress={() => advance(answers)} activeOpacity={0.85}>
              <Text style={h.btnTxt}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // Design-pending placeholder — clearly labeled, no real content yet
    // (#7, #12, #30's native equivalent). Advances with no data to capture.
    if (st.type === 'placeholder') {
      return (
        <OnboardingBackground>
          <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
            {header}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
              <Text style={s.placeholderTag}>PLACEHOLDER — DESIGN COMING</Text>
              <Text style={s.placeholderTitle}>{st.question}</Text>
            </View>
            <View style={s.bn}>
              <TouchableOpacity style={s.cb} onPress={() => advance(answers)} activeOpacity={0.85}>
                <Text style={s.ct}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </OnboardingBackground>
      );
    }

    // "GIVE" interstitials — native, echo the user's own answers back at
    // them. Each gets its own id-branch (same pattern goalPace used to).
    // All share the same centered-text shape, so one small local component
    // instead of repeating the layout 3 times.
    // Select / multiselect
    const isSel = (o: string) => {
      const a = answers[st.id];
      return Array.isArray(a) ? a.includes(o) : a === o;
    };
    // Every question requires an explicit Continue tap now — single-select
    // no longer auto-advances on tap, so it needs the same "has an answer"
    // gate multiselect already had.
    const stepReady = st.type === 'multiselect'
      ? Array.isArray(answers[st.id]) && (answers[st.id] as string[]).length > 0
      : answers[st.id] != null;

    // Back to a scrollable list at normal size — explicit reversal of the
    // earlier "shrink + never scroll" attempt, which read as cramped/too
    // small. Long lists (injuries, equipment) scroll; short ones just sit
    // there with room to spare.
    const _opts = resolveOptions(st.options, answers);

    return (
      <OnboardingBackground>
        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          {header}
          <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
            <View style={s.qBlock}>
              <Text style={s.qq}>{noOrphan(st.question)}</Text>
              {!!st.subtitle && <Text style={s.qqSub}>{st.subtitle}</Text>}
            </View>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 140, flexGrow: 1, justifyContent: 'center' }}
              showsVerticalScrollIndicator={false}
            >
              {_opts.map((o, i) => {
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
                      <Text style={[s.optTxt, sel && s.optTxtSel]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{o.label}</Text>
                    </View>
                    <View style={[s.radio, sel && s.radioSel]}>
                      {sel && <Sym name="checkmark" size={11} color="#fff" />}
                    </View>
                  </AnimatedOption>
                );
              })}
            </ScrollView>
          </Animated.View>
          <View style={s.bn}>
            <TouchableOpacity style={[s.cb, !stepReady && s.cbDisabled]} disabled={!stepReady} onPress={() => advance(answers)} activeOpacity={0.85}>
              <Text style={[s.ct, !stepReady && s.ctDisabled]}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </OnboardingBackground>
    );
  }

  // ── 3 new native beats between the rank run and plan generation ────────────
  // (Recovery Route removed — rankReveal goes straight to thankYou.)

  // Real design artboard (goodhands.html — its content turned out to be
  // this exact privacy/trust screen despite the filename). New subtext
  // per explicit copy change, via thankYouInject.
  if (appState === 'thankYou') {
    return (
      <OnboardingWebScreen
        htmlKey="thankYou"
        topInset={insets.top}
        progress={progress}
        extraJsBeforeLoad={SUPPRESS_DC_ANIM_JS}
        extraJs={thankYouInject()}
        onAdvance={() => setAppState('connectHealth')}
        onBack={() => setAppState('rankReveal')}
      />
    );
  }

  if (appState === 'connectHealth') {
    return (
      <OnboardingBackground>
        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <SimpleProgressHeader progress={progress} onBack={() => setAppState('thankYou')} />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
            <Text style={s.placeholderTag}>PLACEHOLDER — DESIGN COMING</Text>
            <Text style={s.placeholderTitle}>Connect Apple Health</Text>
          </View>
          <View style={s.bn}>
            <TouchableOpacity style={s.cb} onPress={() => setAppState('notifications')} activeOpacity={0.85}>
              <Text style={s.ct}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </OnboardingBackground>
    );
  }

  if (appState === 'notifications') {
    return (
      <OnboardingBackground>
        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <SimpleProgressHeader progress={progress} onBack={() => setAppState('connectHealth')} />
          <NotificationBanner topOffset={insets.top} />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
            <View style={nq.iconWrap}>
              <Sym name="bell.fill" size={28} color="#fff" />
            </View>
            <Text style={[s.giveTitle, { marginTop: 22 }]}>Don't miss a session.</Text>
            <Text style={s.giveSub}>We'll remind you when it's time to train and let you know how your form is trending.</Text>
          </View>
          <View style={s.bn}>
            <TouchableOpacity
              style={s.cb}
              activeOpacity={0.85}
              onPress={() => {
                // TODO(notifications): expo-notifications isn't installed
                // yet (`npx expo install expo-notifications` + a rebuild —
                // this is a native module, a JS-only install won't take
                // effect in an already-running dev client). Wire the real
                // Notifications.requestPermissionsAsync() call in here once
                // that's done; for now this just advances.
                haptic(Haptics.ImpactFeedbackStyle.Medium);
                setAppState('readyToBuild');
              }}
            >
              <Text style={s.ct}>Enable notifications</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setAppState('readyToBuild')} hitSlop={10} style={{ alignItems: 'center', paddingTop: 14 }}>
              <Text style={{ fontSize: 14, fontWeight: W.semi, color: L.textSub }}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </OnboardingBackground>
    );
  }

  // Real design artboard (readytobuild.html) — one more beat right before
  // generatePlan actually starts building the plan.
  if (appState === 'readyToBuild') {
    return (
      <OnboardingWebScreen
        htmlKey="readyToBuild"
        topInset={insets.top}
        progress={progress}
        extraJsBeforeLoad={SUPPRESS_DC_ANIM_JS}
        onAdvance={() => setAppState('generatePlan')}
        onBack={() => setAppState('notifications')}
      />
    );
  }

  // ── "Answers locked in." loader — new beat between the last question and
  // the rank run. Reuses RankCalcOverlay's visual language (label + thin
  // progress bar) as a full screen rather than an overlay, since there's
  // no prior screen's content to sit on top of here. Two-phase text: bar
  // fills under "Answers locked in.", then the label swaps and a Continue
  // button fades in — explicit ask, not auto-advancing like the other
  // RankCalcOverlay usage (strengthAssessment -> rankReveal) still does.
  if (appState === 'preRankLoader') {
    return <PreRankLoaderScreen insets={insets} onAdvance={() => setAppState('rankWheel')} />;
  }

  // ── Rank run — native screens (rank wheel / reveal + strength assessment).
  // Runs straight after the last question now (no math beat). ───────────────

  // rankWheel + rankAssess share one block now: strengthAssessment (a
  // WebView artboard) used to cold-mount only once the user landed on it —
  // load HTML, decode fonts, run its own paint-detection poll — which is
  // real, unavoidable latency a native-to-native transition doesn't have,
  // and read as "a wait screen for a second". Same prewarm trick DcPagePool
  // already uses for planReady/trialTimeline/paywall: mount it now, hidden,
  // while RankWheelScreen (fully native) is still showing, so by the time
  // the user taps Continue it's already loaded and just fades in.
  if (appState === 'rankWheel' || appState === 'rankAssess') {
    return (
      <View style={{ flex: 1 }}>
        {appState === 'rankWheel' && (
          <RankWheelScreen
            topInset={insets.top}
            progress={progress}
            onAdvance={() => setAppState('rankAssess')}
            onBack={() => {
              // Was a raw setAppState('onboarding') with stepIndex untouched —
              // stepIndex was still whatever it was pointing at BEFORE the last
              // question's answer got committed (advance()'s forward transition
              // commits it only after this screen is already showing). If that
              // answer changed which steps are visible (a showIf toggling
              // elsewhere), the stale stepIndex could land on the wrong step, or
              // past the end of a now-shorter list — currentStep comes back
              // undefined and the screen renders blank/broken. Recompute the
              // "last question" index fresh from the CURRENT answers instead of
              // trusting the old one, and give it the same fade+slide entrance
              // every other back-navigation gets instead of a hard, un-animated cut.
              setStepIndex(Math.max(0, getVisibleSteps(answers).length - 1));
              fadeAnim.stopAnimation();
              slideAnim.stopAnimation();
              fadeAnim.setValue(0);
              slideAnim.setValue(-36);
              setAppState('onboarding');
              Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
                Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
              ]).start();
            }}
          />
        )}
        <OnboardingWebScreen
          htmlKey="strengthAssessment"
          topInset={insets.top}
          progress={progress}
          poolActive={appState === 'rankAssess'}
          onAdvance={() => setRankCalcOverlay(true)}
          onBack={() => setAppState('rankWheel')}
          onStrengthVals={(vals) => setAnswers((a) => ({ ...a, strength: vals }))}
        />
        {rankCalcOverlay && <RankCalcOverlay bottomInset={insets.bottom} />}
      </View>
    );
  }

  if (appState === 'rankReveal') {
    return (
      <OnboardingWebScreen
        htmlKey="rankReveal"
        topInset={insets.top}
        progress={progress}
        extraJsBeforeLoad={rankRevealPreloadJs(answers)}
        extraJs={RANK_REVEAL_FOOTER_JS}
        onAdvance={() => setAppState('thankYou')}
        onBack={() => setAppState('rankAssess')}
      />
    );
  }

  // ── The pre-paywall WebView pages. generatePlan is a one-shot loading
  // screen; the last three (plan ready / trial / paywall) live in a pool
  // that boots during generatePlan so switching between them is instant.
  if (
    appState === 'generatePlan' || appState === 'planReady' || appState === 'saveProgress' ||
    appState === 'tryForFree' || appState === 'trialTimeline' || appState === 'webPaywall'
  ) {
    const poolActive: PoolKey | null =
      appState === 'planReady' ? 'planReady' :
      appState === 'trialTimeline' ? 'trialTimeline' :
      appState === 'webPaywall' ? 'paywall' : null;
    return (
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <DcPagePool
          activeKey={poolActive}
          answers={answers}
          topInset={insets.top}
          progressFor={(key) => {
            const st: AppState = key === 'planReady' ? 'planReady' : key === 'trialTimeline' ? 'trialTimeline' : 'webPaywall';
            const idx = RANK_POST_FLOW.indexOf(st);
            return (visibleSteps.length + idx + 1) / TOTAL_FLOW_LEN;
          }}
          onAdvance={(from) => {
            if (from === 'planReady') setAppState('saveProgress');
            else if (from === 'trialTimeline') setAppState('webPaywall');
            // from === 'webPaywall' (the paywall's own CTA) — straight into
            // the app now, nothing runs after the paywall any more.
            else { void finishOnboarding(); }
          }}
          onBack={(from) => {
            if (from === 'planReady') setAppState('generatePlan');
            else if (from === 'trialTimeline') setAppState('tryForFree');
            else setAppState('trialTimeline');
          }}
          onEditInfo={(f) => setEditField(f as EditField)}
          onEditValue={(field, value) => {
            if (field === 'weight') {
              const n = parseFloat(value);
              if (!Number.isNaN(n)) setAnswers(a => ({ ...a, weight: n }));
            } else if (field === 'age') {
              const n = parseInt(value, 10);
              if (!Number.isNaN(n)) setAnswers(a => ({ ...a, age: n }));
            } else if (value.trim()) {
              setAnswers(a => ({ ...a, [field]: value.trim() }));
            }
          }}
        />
        {appState === 'generatePlan' && (
          <OnboardingWebScreen
            htmlKey="generatePlan"
            topInset={insets.top}
            progress={progress}
            onAdvance={() => setAppState('planReady')}
            onBack={() => setAppState('notifications')}
          />
        )}
        {appState === 'saveProgress' && (
          <SaveProgressScreen
            topInset={insets.top}
            progress={progress}
            onAdvance={() => setAppState('tryForFree')}
            onBack={() => setAppState('planReady')}
          />
        )}
        {appState === 'tryForFree' && (
          <TryForFreeScreen
            topInset={insets.top}
            progress={progress}
            onAdvance={() => setAppState('trialTimeline')}
            onBack={() => setAppState('saveProgress')}
          />
        )}
        {editField && appState === 'planReady' && (
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

  return null;
}

// ── EditFieldOverlay — a pencil on the plan-ready page opens ONE field
// here, over the still-mounted page. Number fields get a keyboard; the
// experience field gets its four options. Save/Cancel dismiss it. ────────────

const EXPERIENCE_OPTS = ['Beginner', 'Some experience', 'Intermediate', 'Advanced'];
const MAIN_GOAL_OPTS = ['Build muscle · Gain weight', 'Lose fat · Lose weight', 'Recomp · Lose fat, build muscle'];
const FIELD_META: Record<EditField, { title: string; kbd: 'number-pad' | 'default'; ph: string; unit?: string }> = {
  age:        { title: 'age',        kbd: 'number-pad', ph: '27' },
  height:     { title: 'height',     kbd: 'default',    ph: `5'10"` },
  weight:     { title: 'weight',     kbd: 'number-pad', ph: '168', unit: 'lb' },
  experience: { title: 'experience', kbd: 'default',    ph: '' },
  mainGoal:   { title: 'goal',       kbd: 'default',    ph: '' },
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
    field === 'mainGoal' ? (typeof answers.mainGoal === 'string' ? answers.mainGoal : 'Build muscle · Gain weight') :
    (answers[field] != null ? String(answers[field]) : '');
  const [val, setVal] = useState<string>(initial);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    if (field === 'experience' || field === 'mainGoal') { onSave({ [field]: val }); return; }
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

        {field === 'experience' || field === 'mainGoal' ? (
          <View style={{ gap: 8 }}>
            {(field === 'experience' ? EXPERIENCE_OPTS : MAIN_GOAL_OPTS).map(o => {
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
  // Matches the back button style used everywhere else (rank screens, save
  // progress, try-for-free) — was a flat grey-bordered circle here, a glass
  // one there; same LiquidGlassButton + size now, everywhere.
  bb: {
    width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.10)',
    ...({ boxShadow: '0px 2px 8px rgba(0,0,0,0.10)' } as any),
  },
  pc: { flex: 1, paddingHorizontal: 12 },
  // Starts light, fills BLACK as the user progresses — explicit correction
  // (was the accent blue).
  pt: { height: 4, backgroundColor: 'rgba(17,24,39,0.08)', borderRadius: 2, overflow: 'hidden' },
  pf: { height: 4, backgroundColor: '#111114', borderRadius: 2 },
  skipBtn: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  skipTxt: { fontSize: 14, fontWeight: W.semi, color: L.textSub },

  // Question
  // Left-aligned, pinned right under the header/progress bar — explicit
  // reversal of an earlier "center it in the top-middle" request, which
  // was reading as sitting too low on screen.
  qq:     { fontFamily: FONT.displayBold, fontSize: 32, color: '#111114', lineHeight: 38, marginBottom: 10, letterSpacing: -0.8, textAlign: 'left' },
  qqSub:  { fontSize: 15, color: L.textSub, lineHeight: 21, marginBottom: 8, textAlign: 'left' },
  qBlock: { paddingHorizontal: 28, paddingTop: 6 },
  goalDelta: { fontFamily: FONT.displayBold, fontSize: 20, color: L.text, textAlign: 'center', marginTop: 40, letterSpacing: -0.3 },
  textInput: { backgroundColor: L.card, borderRadius: 16, borderWidth: 1, borderColor: L.border, paddingHorizontal: 18, paddingVertical: 16, fontSize: 18, color: L.text, ...({ boxShadow: Elev.low.shadow } as any) },

  // Design-pending placeholder screens (#7/#12/#30)
  placeholderTag: { fontSize: 11, fontWeight: W.bold, color: L.accent, letterSpacing: 1, marginBottom: 12, textAlign: 'center' },
  placeholderTitle: { fontFamily: FONT.displayBold, fontSize: 24, color: L.text, textAlign: 'center', letterSpacing: -0.5 },

  // "GIVE" interstitials — centered narration echoing the user's own answers.
  giveTitle: { fontFamily: FONT.displayBold, fontSize: 30, color: L.text, textAlign: 'center', letterSpacing: -0.8, lineHeight: 36 },
  giveSub: { fontSize: 15.5, color: L.textSub, textAlign: 'center', lineHeight: 22, marginTop: 14, maxWidth: 320 },

  // Options
  // Bigger again — explicit correction, the previous "clean and curved"
  // pass went too far the other way and read as cramped/too small. No
  // sublabel any more (removed from render entirely), so the row's only
  // content is the icon + single label line — sized generously.
  opt:        { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: L.card, borderRadius: 20, borderWidth: 1, borderColor: L.border, paddingHorizontal: 18, paddingVertical: 18, marginBottom: 10, ...({ boxShadow: Elev.low.shadow } as any) },
  optSel:     { borderColor: L.accent, backgroundColor: L.accentSoft },
  // No boxed background — selection is already conveyed by the icon's own
  // color (accent when selected, muted gray otherwise, see the render
  // above), so the gray square backdrop was pure redundant chrome, not
  // carrying its own information. Fixed-width slot only, to keep every
  // option's label starting at the same x position regardless of glyph width.
  optIcon:      { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  optIconBadge: { borderRadius: 13, overflow: 'hidden', backgroundColor: L.card, borderWidth: 1, borderColor: L.border },
  // Smaller than optIconBadge's 44×44 on purpose — filling the badge exactly
  // (cover, edge-to-edge) cropped these icons' own glyphs at the edges.
  // Leaving margin inside the same-size badge keeps the glyph fully visible.
  optIconImg:   { width: 32, height: 32 },
  optTxt:     { fontSize: 17, fontWeight: W.medium, color: L.text, letterSpacing: -0.2 },
  optTxtSel:  { fontWeight: W.semi },
  radio:      { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(17,24,39,0.12)', alignItems: 'center', justifyContent: 'center' },
  radioSel:   { backgroundColor: L.accent, borderColor: L.accent },

  // Bottom bar — no background/border now, just the button floating directly
  // on AppBackground's colorful gradient (was an opaque white bar with a
  // hairline top border, reported as an unwanted "white box"). The button
  // itself (cb, solid dark pill) still reads clearly without a backing
  // surface, so nothing here was actually load-bearing for legibility.
  bn:         { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingBottom: 24, paddingTop: 16 },
  cb:         { backgroundColor: '#111114', borderRadius: 999, height: 58, justifyContent: 'center', alignItems: 'center', ...({ boxShadow: '0px 16px 30px -16px rgba(17,17,20,0.6)' } as any) },
  cbDisabled: { backgroundColor: '#EBEBF0' },
  ct:         { fontFamily: FONT.displayBold, fontSize: 16.5, color: '#fff', letterSpacing: -0.2 },
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
const WELCOME_VIDEO_W = Math.min(Dimensions.get('window').width * 0.78, 348);

const h = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff', paddingHorizontal: 24 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 20 },
  videoCard: {
    width: WELCOME_VIDEO_W, aspectRatio: 9 / 19.5, maxHeight: '100%',
    borderRadius: 34, overflow: 'hidden', backgroundColor: '#000',
  },
  bottom: { paddingTop: 4, paddingBottom: 10 },
  headline: {
    fontFamily: FONT.displayBlack, fontSize: 30, lineHeight: 36, color: '#111114',
    letterSpacing: -1, textAlign: 'center', marginBottom: 18,
  },
  cta: {
    backgroundColor: '#111114', borderRadius: 100, height: 62,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaTxt: { fontFamily: FONT.displayBold, fontSize: 17, color: '#fff', letterSpacing: -0.2 },
  signinWrap: { alignSelf: 'center', marginTop: 14, paddingVertical: 4 },
  signin: { fontFamily: FONT.display, fontSize: 14.5, color: '#6e6e77', letterSpacing: -0.1 },
  signinBold: { fontFamily: FONT.displayBold, color: '#111114' },
  devWrap: { position: 'absolute', left: 0, right: 0, bottom: 2, alignItems: 'center', padding: 6 },
  dev: { fontSize: 11, color: '#c8c8cf', fontWeight: '600' },

  // Dark full-bleed video overlay text — still used by the `videoClip` step type.
  title:  { fontFamily: FONT.displayBold, fontSize: 34, color: '#fff', letterSpacing: -1, lineHeight: 40, marginBottom: 12 },
  sub:    { fontSize: 15, color: 'rgba(255,255,255,0.82)', lineHeight: 22, marginBottom: 24 },
  btn:    { backgroundColor: '#fff', borderRadius: 100, paddingVertical: 18, alignItems: 'center' },
  btnTxt: { fontFamily: FONT.displayBold, fontSize: 16, color: '#0B1020', letterSpacing: 0.1 },
});
