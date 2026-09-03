import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView,
  Animated, ActivityIndicator, PanResponder, Image, TextInput, Pressable, Easing,
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
    if (/^(Start at Bronze|Continue|Start climbing|Find my rank|Next|Done)\\b/i.test(t)) return post('advance');
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
  rankWheel:          require('../assets/onboarding/rankwheel.html'),
  strengthAssessment: require('../assets/onboarding/strengthassessment.html'),
  rankReveal:         require('../assets/onboarding/rankreveal.html'),
} as const;

function OnboardingWebScreen({ htmlKey, onAdvance, onBack, topInset }: {
  htmlKey: keyof typeof ONB_HTML;
  onAdvance: () => void;
  onBack: () => void;
  topInset: number;
}) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(fade, { toValue: 1, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const extraJs = htmlKey === 'strengthAssessment' ? STRENGTH_ICONS_JS : undefined;
  return (
    <View style={{ flex: 1, backgroundColor: '#f4f4f2' }}>
      <AppBackground />
      <Animated.View style={{ flex: 1, marginTop: topInset, opacity: fade }}>
        <WebView
          source={ONB_HTML[htmlKey] as any}
          originWhitelist={['*']}
          injectedJavaScript={extraJs ? ONBOARDING_WEB_INJECT + '\n' + extraJs : ONBOARDING_WEB_INJECT}
          onMessage={(e) => {
            const m = e.nativeEvent.data;
            if (m === '__tap' || m === '__tick') { Haptics.selectionAsync(); return; }
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            if (m === 'advance' || m === 'skip') onAdvance();
          }}
          style={{ flex: 1, backgroundColor: 'transparent' }}
          opaque={false}
          scrollEnabled
          bounces={false}
          overScrollMode="never"
          androidLayerType="hardware"
          setSupportMultipleWindows={false}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled
        />
      </Animated.View>
      <Pressable onPress={() => { Haptics.selectionAsync(); onBack(); }} hitSlop={12} style={[web.backBtn, { top: topInset + 8 }]}>
        <View style={web.backCircle}>
          <SymbolView name="chevron.left" size={15} tintColor="#fff" type="monochrome" style={{ width: 15, height: 15 }} />
        </View>
      </Pressable>
    </View>
  );
}

const web = StyleSheet.create({
  backBtn:    { position: 'absolute', left: 20, zIndex: 60 },
  backCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
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

  // ── The rank run — every question is done; nothing below is a question.
  { id: 'rankWheelIntro', section: 'Rank', type: 'webview', question: '', htmlKey: 'rankWheel' },
  { id: 'rankAssess',     section: 'Rank', type: 'webview', question: '', htmlKey: 'strengthAssessment' },
  { id: 'rankReveal',     section: 'Rank', type: 'webview', question: '', htmlKey: 'rankReveal' },

  // The demo, as a clip instead of "do 5 reps". The math + reversal + plan
  // come right after it in the next commit.
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
    // Wait 500ms, then slide in + fade in together
    Animated.sequence([
      Animated.delay(500),
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, friction: 9, tension: 60, useNativeDriver: true }),
      ]),
    ]).start(() => {
      // Hold ~2s then fade out
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity,    { toValue: 0, duration: 350, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -8, duration: 350, useNativeDriver: true }),
        ]).start();
      }, 2000);
    });
  }, []);

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

function planRevealSteps(answers: Record<string, any>): string[] {
  const name = (answers.name as string) || 'you';
  const goals = (answers.goal as string[]) ?? [];
  const goal = goals[0] ?? 'your goals';
  const daysNum = parseInt(String(answers.days ?? '3 days'), 10) || 3;
  const wasted = computeWastedReps({ ...answers, formGuess: getRealFormPct(answers) }).wasted;
  return [
    `Analyzing ${name}'s answers`,
    'Factoring in your starting rank',
    `Building around ${goal.toLowerCase()}`,
    `Setting your ${daysNum}-a-week schedule`,
    `Remembering: ${wasted.toLocaleString()} reps you don't have to waste again`,
    'Calibrating form-check thresholds',
  ];
}

// One clean screen: every line fades up in sequence, then Continue.
function StaggerLines({ lines, onAllShown }: { lines: string[]; onAllShown: () => void }) {
  const vals = useRef(lines.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const seq = Animated.stagger(
      420,
      vals.map(v => Animated.timing(v, { toValue: 1, duration: 460, useNativeDriver: true })),
    );
    seq.start(({ finished }) => { if (finished) onAllShown(); });
    return () => seq.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ gap: 18 }}>
      {lines.map((ln, i) => (
        <Animated.Text
          key={i}
          style={{
            fontFamily: FONT.display, fontSize: 22, lineHeight: 30, color: L.text, letterSpacing: -0.3,
            opacity: vals[i],
            transform: [{ translateY: vals[i].interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
          }}
        >
          {ln}
        </Animated.Text>
      ))}
    </View>
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

type AppState = 'welcome' | 'onboarding' | 'calcMath' | 'cinematic' | 'reversal' | 'building' | 'paywall';

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [appState,  setAppState]  = useState<AppState>('welcome');
  const [stepIndex, setStepIndex] = useState(0);
  const [answers,   setAnswers]   = useState<Record<string, any>>({});
  const [plan,      setPlan]      = useState<{ focus: string; exercises: WorkoutExercise[] } | null>(null);
  const [loadStep,  setLoadStep]  = useState(0);
  const [loadPct,   setLoadPct]   = useState(0);
  // Tap-feedback only, for single-select questions — see handleSelect below
  // for why this exists separately from `answers`.
  const [justSelected, setJustSelected] = useState<string | null>(null);
  // Gates the Continue button on the cinematic-math + reversal screens until
  // every line has faded in.
  const [mathLinesDone, setMathLinesDone] = useState(false);

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

  const buildSteps = useMemo(() => planRevealSteps(answers), [answers]);

  useEffect(() => {
    if (appState !== 'building') return;
    setLoadStep(0); setLoadPct(0);
    let i = 0;
    const id = setInterval(() => {
      i++;
      if (i < buildSteps.length) {
        setLoadStep(i);
        setLoadPct(Math.round((i / buildSteps.length) * 100));
      } else {
        clearInterval(id);
        setLoadPct(100);
        setTimeout(() => setAppState('paywall'), 500);
      }
    }, 620);
    return () => clearInterval(id);
  }, [appState, buildSteps.length]);

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
        <View style={{ width: 44 }} />
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

  // ── CINEMATIC MATH — the 13 lines, staggered onto one screen ─────────────────

  if (appState === 'cinematic') {
    return (
      <OnboardingBackground>
        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
            <StaggerLines lines={cinematicLines(answers)} onAllShown={() => setMathLinesDone(true)} />
          </ScrollView>
          {mathLinesDone && (
            <View style={s.bn}>
              <TouchableOpacity style={s.cb} onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); setMathLinesDone(false); setAppState('reversal'); }} activeOpacity={0.85}>
                <Text style={s.ct}>Continue</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </OnboardingBackground>
    );
  }

  // ── REVERSAL — 3 lines, same treatment ──────────────────────────────────────

  if (appState === 'reversal') {
    return (
      <OnboardingBackground>
        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: 'center' }}>
            <StaggerLines lines={REVERSAL_LINES} onAllShown={() => setMathLinesDone(true)} />
          </View>
          {mathLinesDone && (
            <View style={s.bn}>
              <TouchableOpacity style={s.cb} onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); setMathLinesDone(false); setAppState('building'); }} activeOpacity={0.85}>
                <Text style={s.ct}>Continue</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </OnboardingBackground>
    );
  }

  // ── BUILDING (the plan reveal checklist) ────────────────────────────────────

  if (appState === 'building') {
    return (
      <OnboardingBackground>
        <View style={{ flex: 1, paddingTop: insets.top + 40, paddingBottom: insets.bottom, paddingHorizontal: 28 }}>
          <View style={{ marginBottom: 44 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: W.bold, color: L.textDim, letterSpacing: 1.2 }}>BUILDING PLAN</Text>
              <Text style={{ fontFamily: FONT.displayBold, fontSize: 22, color: L.text, letterSpacing: -0.5 }}>{loadPct}%</Text>
            </View>
            <View style={{ width: '100%', height: 6, backgroundColor: 'rgba(17,24,39,0.08)', borderRadius: 3, overflow: 'hidden' }}>
              <View style={{ height: 6, backgroundColor: L.accent, borderRadius: 3, width: `${loadPct}%` as any }} />
            </View>
          </View>
          <Text style={{ fontFamily: FONT.displayBold, fontSize: 28, color: L.text, marginBottom: 8, letterSpacing: -0.8 }}>Building your plan</Text>
          <Text style={{ fontSize: 15, color: L.textSub, marginBottom: 36, lineHeight: 22 }}>Putting it together around everything you told me.</Text>
          <View>
            {buildSteps.map((step, i) => {
              const done    = i < loadStep;
              const current = i === loadStep;
              return (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, opacity: i > loadStep ? 0.3 : 1 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, marginRight: 14, backgroundColor: done ? L.accent : 'transparent', borderWidth: done ? 0 : 1.5, borderColor: current ? L.accent : 'rgba(17,24,39,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                    {done    && <Sym name="checkmark" size={12} color="#fff" />}
                    {current && <ActivityIndicator size="small" color={L.accent} />}
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: current ? W.semi : W.medium, color: done || current ? L.text : L.textDim }}>{step}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </OnboardingBackground>
    );
  }

  // ── PAYWALL — placeholder. The real paywall drops in here; the first
  // workout stays locked until the user pays. ─────────────────────────────────

  if (appState === 'paywall') {
    return (
      <OnboardingBackground>
        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' }}>
          <Sym name="lock.fill" size={30} color={L.textDim} />
          <Text style={{ fontFamily: FONT.displayBold, fontSize: 26, color: L.text, marginTop: 16, letterSpacing: -0.6 }}>Your plan is ready.</Text>
          <Text style={{ fontSize: 15, color: L.textSub, textAlign: 'center', marginTop: 8, lineHeight: 22 }}>Paywall goes here — built separately.</Text>
          <TouchableOpacity style={[s.cb, { alignSelf: 'stretch', marginTop: 32 }]} onPress={finishOnboarding} activeOpacity={0.85}>
            <Text style={s.ct}>Continue (dev)</Text>
          </TouchableOpacity>
        </View>
      </OnboardingBackground>
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

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Progress bar header
  qh: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  bb: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: L.card, borderWidth: 1, borderColor: L.border, ...({ boxShadow: Elev.low.shadow } as any) },
  pc: { flex: 1, paddingHorizontal: 12 },
  pt: { height: 4, backgroundColor: 'rgba(17,24,39,0.08)', borderRadius: 2, overflow: 'hidden' },
  pf: { height: 4, backgroundColor: L.accent, borderRadius: 2 },

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
