/**
 * app/(tabs)/train.tsx — Train tab
 *
 * Renders assets/traintab.html VERBATIM in a WebView (same approach as the
 * onboarding screens). The mockup's own fake chrome — status bar, bottom
 * nav, home indicator, blur-blob backdrop — is hidden by injected CSS; the
 * real AppBackground shows through the transparent WebView, and the real tab
 * bar sits below. Taps on the practice cards and the plan CTA are bridged
 * back out to the app's navigation.
 */

import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import AppBackground from '../../components/AppBackground';

const TRAIN_HTML = require('../../assets/traintab.html');

// Practice-card label → CV exercise id.
const PRACTICE_MAP: Record<string, string> = {
  'push-ups': 'pushup',
  'squats':   'squat',
  'pull-ups': 'pullup',
  'lunges':   'lunge',
};

const TRAIN_WEB_INJECT = `
(function () {
  function post(m) { try { window.ReactNativeWebView.postMessage(m); } catch (e) {} }
  function btnFor(el) {
    for (var i = 0; el && i < 7; i++, el = el.parentElement) {
      if (!el.getAttribute) continue;
      if (el.getAttribute('role') === 'button' || el.tagName === 'BUTTON') return el;
    }
    return null;
  }
  document.addEventListener('pointerdown', function (e) { if (btnFor(e.target)) post('__tap'); }, true);
  document.addEventListener('touchstart', function (e) { if (btnFor(e.target)) post('__tap'); }, true);
  document.addEventListener('click', function (e) {
    var b = btnFor(e.target);
    if (!b) return;
    var oc = b.getAttribute('sc-camel-on-click') || '';
    // Hero "Start" (goPlan) and the plan-view back arrow (goHome) are the
    // mockup's own internal view switch — let its handler run, don't leave.
    if (/goPlan|goHome/.test(oc)) return;
    var t = (b.textContent || '').replace(/\\s+/g, ' ').trim();
    // Plan-view CTA
    if (/^Begin first exercise/i.test(t)) return post('begin');
    // A practice card: it carries an exercise name in its text
    if (b.getAttribute('data-glass') === 'panel') {
      var name = t.toLowerCase();
      var keys = ['push-ups','pull-ups','squats','lunges'];
      for (var i = 0; i < keys.length; i++) {
        if (name.indexOf(keys[i]) >= 0) return post('practice:' + keys[i]);
      }
    }
  }, true);

  var CARD = 'div[style*="width: 472px"][style*="height: 1024px"]';
  var WRAP = 'div[style*="min-height: 100vh"][style*="padding: 40px 24px"]';
  var CSS = ''
    + 'html{margin:0!important;padding:0!important;background:transparent!important;overflow:hidden!important;height:100%!important;width:100%!important;}'
    + 'body{margin:0!important;padding:0!important;background:transparent!important;overflow:hidden!important;}'
    + WRAP + '{min-height:1024px!important;height:1024px!important;padding:0!important;display:block!important;background:transparent!important;overflow:hidden!important;}'
    + CARD + '{width:472px!important;height:1024px!important;border-radius:0!important;box-shadow:none!important;margin:0!important;background:transparent!important;}'
    // fake iOS status bar
    + 'div[style*="padding: 22px 34px 0"]{display:none!important;}'
    // fake bottom nav row + home indicator (whole block)
    + 'div[style*="padding: 14px 30px 0"]{display:none!important;}'
    // the mockup's own animated blur-blob backdrop — AppBackground replaces it
    + 'div[style*="filter: blur(52px)"]{display:none!important;}'
    + 'svg{will-change:transform;}';

  function ensure() {
    if (document.getElementById('__rn_css')) return;
    var s = document.createElement('style');
    s.id = '__rn_css';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function fit() {
    ensure();
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
  [30, 120, 320, 700, 1400].forEach(function (d) { setTimeout(fit, d); });
  setTimeout(function () { obs.disconnect(); }, 2000);
  true;
})();
`;

export default function TrainScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.timing(fade, { toValue: 1, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function onMsg(m: string) {
    if (m === '__tap') { Haptics.selectionAsync(); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (m === 'begin') { router.push('/workout' as any); return; }
    if (m.startsWith('practice:')) {
      const id = PRACTICE_MAP[m.slice('practice:'.length)];
      if (id) router.push(`/formcheck?exercise=${id}` as any);
    }
  }

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <AppBackground />
      <Animated.View style={{ flex: 1, marginTop: insets.top, opacity: fade }}>
        <WebView
          source={TRAIN_HTML as any}
          originWhitelist={['*']}
          injectedJavaScript={TRAIN_WEB_INJECT}
          onMessage={(e) => onMsg(e.nativeEvent.data)}
          style={s.web}
          opaque={false}
          scrollEnabled={false}
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
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EDF1F8' },
  web:  { flex: 1, backgroundColor: 'transparent' },
});
