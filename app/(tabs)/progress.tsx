/**
 * app/(tabs)/progress.tsx — Progress tab
 *
 * Replaces the old native screen with the real Claude-Design artboard
 * (assets/app screens/progress.html), wired with real data — never editing
 * the design file itself (see CLAUDE.md). Process followed per CLAUDE.md's
 * "Wiring Claude Design files" section: unpacked via
 * scripts/unpack-design-files.js, screenshotted via
 * scripts/screenshot-design-files.js, every selector below verified against
 * the real unpacked markup + live DOM before being used (see
 * .scratch/unpacked-designs/progress.html for the source of truth).
 *
 * SCOPE THIS PASS (explicit, agreed with the user — Progress/Profile are a
 * genuinely large rebuild, done incrementally, not silently):
 * Wired for real: the rank card (reuses the same computeOverallStanding/
 * computeMuscleTiers this app already uses in recap.tsx/muscle-ranks.tsx),
 * and the "Weight Progress" chart + "Log weight" entry flow — a brand new
 * feature (lib/weightLog.ts), since no body-weight tracking existed in this
 * app before this pass.
 *
 * NOT wired yet, hidden rather than shipped with fake demo numbers posing
 * as real (Progress Photos, Form Score, Personal Bests, Past Workouts, the
 * Muscle Map / All Ranks / All Workouts modals) — these need their own real
 * data wiring pass. Hiding beats showing placeholder numbers as if they
 * were the user's real stats.
 *
 * KNOWN SIMPLIFICATION: the weigh-in sheet's date picker (tap "Date" to
 * expand a calendar) is left as the artboard's own cosmetic toggle — it
 * opens/closes, but picking a day in it does NOT change what date Submit
 * actually saves to; every entry saves to TODAY. Flagged, not silently
 * faked — logging for a past day is a reasonable follow-up, not done here.
 */
import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import {
  DC_VIEWPORT_JS, dcScaleFitJs, DC_TEXT_REPLACE_HELPER_JS,
} from '../../lib/dcWebviewHelpers';
import { getAllSessions, calcStreak, computeMuscleTiers } from '../../lib/sessionLog';
import { computeOverallStanding } from '../../components/MuscleTierMap';
import {
  getWeightLog, logWeight, filterWeightRange,
  type WeightEntry,
} from '../../lib/weightLog';

// UI-level range, matching the design's own pill labels exactly
// ('All', capitalized) — distinct from weightLog.ts's lowercase
// WeightRange, converted at the one call site that needs it.
type UiRange = '2m' | '6m' | '1y' | 'All';

const PROGRESS_HTML = require('../../assets/app screens/progress.html');
const PROGRESS_BUILD = 'progress-1';
if (__DEV__) console.log(`[progress] build ${PROGRESS_BUILD}`);

// Same fake tab-bar/FAB selectors Home already verified — identical inline
// styles confirmed in .scratch/unpacked-designs/progress.html (both export
// from the same design system). A real native tab bar + FAB already exist
// app-wide; this app's own screens never use the artboard's fake chrome.
const HIDE_FAKE_CHROME_CSS = `
  div[style*="right: 88px"][style*="bottom: 22px"][style*="height: 64px"] { display: none !important; }
  div[style*="right: 14px"][style*="bottom: 22px"][style*="width: 64px"][style*="height: 64px"] { display: none !important; }
`;

// Catmull-Rom -> cubic bezier smooth path — exact port of the same function
// already used natively in this file's previous version / index.tsx's own
// trend chart, just plain JS since it runs inside the WebView.
const SMOOTH_PATH_JS = `
function dcSmoothPath(pts){
  if (pts.length < 2) return '';
  var t = 0.35;
  var d = 'M' + pts[0].x.toFixed(2) + ',' + pts[0].y.toFixed(2);
  for (var i=0;i<pts.length-1;i++){
    var p0 = pts[Math.max(i-1,0)], p1 = pts[i], p2 = pts[i+1], p3 = pts[Math.min(i+2,pts.length-1)];
    var c1x = p1.x + (p2.x-p0.x)*t, c1y = p1.y + (p2.y-p0.y)*t;
    var c2x = p2.x - (p3.x-p1.x)*t, c2y = p2.y - (p3.y-p1.y)*t;
    d += ' C' + c1x.toFixed(2) + ',' + c1y.toFixed(2) + ' ' + c2x.toFixed(2) + ',' + c2y.toFixed(2) + ' ' + p2.x.toFixed(2) + ',' + p2.y.toFixed(2);
  }
  return d;
}
`;

function monthLabel(dateKey: string): string {
  return new Date(dateKey).toLocaleDateString('en-US', { month: 'short' });
}

interface RankInfo { rankName: string; rankPct: number; nextRank: string; streakLine: string }

function buildProgressInjectJs(
  rank: RankInfo, range: UiRange, entries: WeightEntry[], insetBottom: number,
): string {
  const filtered = filterWeightRange(entries, range === 'All' ? 'all' : range);
  const last = filtered[filtered.length - 1] ?? null;
  const first = filtered[0] ?? null;
  const goalLine = filtered.length >= 2 && first && last
    ? `${Math.abs(Math.round(last.weightLb - first.weightLb))} lb ${last.weightLb < first.weightLb ? 'lost' : 'gained'} since you started logging`
    : filtered.length === 1
      ? 'Log again soon to start seeing a trend'
      : 'Log your weight to start tracking';
  // 4 evenly spaced month labels across the filtered range (oldest -> newest).
  const monthXs: string[] = (() => {
    if (filtered.length === 0) return ['', '', '', ''];
    const n = Math.min(4, filtered.length);
    return Array.from({ length: 4 }, (_, i) => {
      if (i >= n) return '';
      const idx = n === 1 ? 0 : Math.round((i * (filtered.length - 1)) / (n - 1));
      return monthLabel(filtered[idx].dateKey);
    });
  })();

  return dcScaleFitJs('#eeeef1') + DC_TEXT_REPLACE_HELPER_JS + SMOOTH_PATH_JS + `
  (function(){
    var st = document.createElement('style');
    st.textContent = ${JSON.stringify(HIDE_FAKE_CHROME_CSS)};
    document.head.appendChild(st);

    var WEIGHT_DATA = ${JSON.stringify(filtered.map(e => ({ d: e.dateKey, w: e.weightLb })))};
    var RANGE = ${JSON.stringify(range)};
    var LAST_WEIGHT = ${JSON.stringify(last ? last.weightLb : null)};

    function findWeightCard(){
      var svgs = document.querySelectorAll('#dc-root svg');
      for (var i=0;i<svgs.length;i++){
        if (svgs[i].getAttribute('viewBox') === '0 0 292 150') return svgs[i].closest('div[style*="border-radius: 28px"]');
      }
      return null;
    }

    // Out-of-scope sections — hidden (not faked). Each is a heading div
    // immediately followed by its content card; both get display:none.
    function hideSection(headingText){
      // BUG FOUND (verified against the live DOM): the real nesting under
      // #dc-root is 4 levels deep to reach a heading, not 2 — this used to
      // silently match nothing. Search every descendant instead.
      var all = document.querySelectorAll('#dc-root *');
      for (var i=0;i<all.length;i++){
        var el = all[i];
        if (el.children.length === 0 && (el.textContent||'').trim() === headingText) {
          el.style.setProperty('display','none','important');
          var sib = el.nextElementSibling;
          if (sib) sib.style.setProperty('display','none','important');
          return;
        }
        // Headings that are themselves a tappable row (Progress Photos / Past Workouts)
        if ((el.textContent||'').trim().indexOf(headingText) === 0 && el.tagName === 'A') {
          el.style.setProperty('display','none','important');
          var sib2 = el.nextElementSibling;
          if (sib2) sib2.style.setProperty('display','none','important');
          return;
        }
      }
    }

    function build(){
      var card = findWeightCard();
      if (!card) return false;

      // ── Rank card ──────────────────────────────────────────────────────
      // BUG FOUND (verified against the live DOM, not the raw markup): "72%
      // to Bronze III" is NOT one text node — it's a span ("72%") + a bare
      // text node (" to ") + another span ("Bronze III"), so dcReplaceText's
      // whole-string match never fires. Set each span directly instead.
      dcReplaceText({ 'Bronze II': ${JSON.stringify(rank.rankName)} });
      // BUG FOUND (verified against the live DOM, not the raw markup): the
      // browser normalizes "#e2b27a" to "rgb(226, 178, 122)" in the
      // serialized style attribute — same category of gotcha as
      // flex:1 -> "1 1 0%" (see CLAUDE.md). A selector hunting for the
      // literal hex string never matches live. Found structurally instead:
      // the bar's TRACK is the only "height: 9px; border-radius: 999px"
      // element on the page, and the fill is simply its one child.
      var rankTrack = document.querySelector('#dc-root div[style*="height: 9px"][style*="border-radius: 999px"]');
      var rankBar = rankTrack ? rankTrack.children[0] : null;
      if (rankBar) rankBar.style.setProperty('width', ${JSON.stringify(`${rank.rankPct}%`)}, 'important');
      // rankBar -> track(height:9px) -> wrapper(margin-top:14px) -> next
      // sibling is the "X% to Y / Top Z%" row (confirmed via the real
      // unpacked markup's exact nesting).
      var rankRow = rankBar ? rankBar.parentElement.parentElement.nextElementSibling : null;
      if (rankRow && rankRow.children[0]) {
        var pctSpans = rankRow.children[0].querySelectorAll('span');
        if (pctSpans[0]) pctSpans[0].textContent = ${JSON.stringify(`${rank.rankPct}%`)};
        if (pctSpans[1]) pctSpans[1].textContent = ${JSON.stringify(rank.nextRank)};
      }
      if (rankRow && rankRow.children[1]) {
        rankRow.children[1].textContent = ${JSON.stringify(rank.streakLine)};
      }
      // The rank card's own tap target (sc-camel-on-click="openRank") opens
      // a "Muscle Map" modal that's out of scope this pass (would show
      // fake demo data) — block just THIS anchor, not every <a> on the
      // page (DC_LINK_INTERCEPT_JS was tried and found to break "Log
      // weight" too, since it intercepts every <a href> globally).
      var rankLink = document.querySelector('#dc-root a[style*="padding: 18px 18px 14px"]');
      if (rankLink && !rankLink.__dcBlocked) {
        rankLink.__dcBlocked = true;
        rankLink.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); }, true);
      }

      // ── Weight chart ─────────────────────────────────────────────────────
      var values = WEIGHT_DATA.map(function(e){ return e.w; });
      var hasData = values.length > 0;
      var minV = hasData ? Math.min.apply(null, values) : 170;
      var maxV = hasData ? Math.max.apply(null, values) : 190;
      if (minV === maxV) { minV -= 5; maxV += 5; }
      var pad = (maxV - minV) * 0.15;
      minV -= pad; maxV += pad;
      var W = 292, H = 150, PL = 4, PR = 12, PT = 10, PB = 10;
      var pts = WEIGHT_DATA.map(function(e, i){
        return {
          x: PL + (WEIGHT_DATA.length <= 1 ? (W-PL-PR) : (i/(WEIGHT_DATA.length-1)) * (W-PL-PR)),
          y: PT + (1 - (e.w - minV)/(maxV - minV)) * (H-PT-PB),
        };
      });
      var paths = card.querySelectorAll('svg path');
      var areaPathEl = paths[0], linePathEl = paths[1];
      var lineD = dcSmoothPath(pts);
      if (linePathEl) linePathEl.setAttribute('d', lineD);
      if (areaPathEl) {
        if (pts.length >= 2) areaPathEl.setAttribute('d', lineD + ' L' + pts[pts.length-1].x.toFixed(2) + ',' + H + ' L' + pts[0].x.toFixed(2) + ',' + H + ' Z');
        else areaPathEl.setAttribute('d', '');
      }
      var lastPt = pts[pts.length - 1];
      var lineEl = card.querySelector('svg line');
      var circleEl = card.querySelector('svg circle');
      var tooltipEl = card.querySelector('div[style*="translate(-50%, -100%)"]');
      if (lastPt) {
        if (lineEl) { lineEl.setAttribute('x1', lastPt.x); lineEl.setAttribute('y1', lastPt.y); lineEl.setAttribute('x2', lastPt.x); lineEl.setAttribute('y2', '140'); lineEl.style.setProperty('display', pts.length ? '' : 'none'); }
        if (circleEl) { circleEl.setAttribute('cx', lastPt.x); circleEl.setAttribute('cy', lastPt.y); circleEl.style.setProperty('display', pts.length ? '' : 'none'); }
        if (tooltipEl) {
          tooltipEl.style.display = pts.length ? '' : 'none';
          tooltipEl.textContent = LAST_WEIGHT != null ? (LAST_WEIGHT + ' lb') : '';
          // Measured after attributes applied so layout is real — avoids
          // hand-deriving the demo's own px-to-percent formula (see this
          // file's own investigation notes).
          requestAnimationFrame(function(){
            var contDiv = card.querySelector('div[style*="height: 150px"]');
            if (!contDiv || !circleEl) return;
            var contRect = contDiv.getBoundingClientRect();
            var circRect = circleEl.getBoundingClientRect();
            if (contRect.width === 0) return;
            var leftPct = ((circRect.left + circRect.width/2 - contRect.left) / contRect.width) * 100;
            var topPx = (circRect.top - contRect.top) - 12;
            tooltipEl.style.setProperty('left', leftPct.toFixed(1) + '%', 'important');
            tooltipEl.style.setProperty('top', topPx.toFixed(1) + 'px', 'important');
          });
        }
      } else if (tooltipEl) { tooltipEl.style.display = 'none'; }

      // Y-axis tick labels — reuse however many placeholder rows exist.
      var tickRows = card.querySelectorAll('div[style*="height: 150px"] > div[style*="pointer-events: none"]');
      var tickCount = tickRows.length || 5;
      for (var ti=0; ti<tickRows.length; ti++){
        var frac = tickCount > 1 ? ti/(tickCount-1) : 0;
        var val = maxV - frac*(maxV-minV);
        var lbl = tickRows[ti].querySelector('div');
        if (lbl) lbl.textContent = Math.round(val);
      }
      // X-axis month labels.
      var monthEls = card.querySelectorAll('div[style*="justify-content: space-between"][style*="padding: 6px 0 0 34px"] > div');
      var MONTHS = ${JSON.stringify(monthXs)};
      for (var mi=0; mi<monthEls.length; mi++){ monthEls[mi].textContent = MONTHS[mi] || ''; }

      // Goal/trend line text (text-replace won't catch this — it's dynamic,
      // not a fixed default string).
      var goalLineEl = card.querySelector('div[style*="line-height: 1.35"]');
      if (goalLineEl) {
        var orbWrap = goalLineEl.parentElement;
        // Preserve the orb icon (goalLineEl's own first element child, if any sits before it structurally it's a sibling) — just replace this element's own text content, which the markup gives as "You're <span>X%</span> of the way..." — simplest honest replacement: own textContent entirely.
        goalLineEl.textContent = ${JSON.stringify(goalLine)};
      }

      // Range pills — scoped to THIS card only (Form Score has identical pills).
      var pills = card.querySelectorAll('div[style*="border-radius: 999px"][style*="cursor: pointer"]');
      for (var pi=0; pi<pills.length; pi++){
        (function(p){
          var label = (p.textContent||'').trim();
          if (['2m','6m','1y','All'].indexOf(label) === -1) return;
          p.style.background = label === RANGE ? '#ffffff' : 'transparent';
          p.style.boxShadow = label === RANGE ? '0 1px 3px rgba(17,17,20,0.15)' : 'none';
          p.addEventListener('click', function(ev){
            ev.stopPropagation();
            dcPost({ type: 'rangePick', range: label });
          }, true);
        })(pills[pi]);
      }

      // Hide out-of-scope sections (text content, not UI the user still needs).
      hideSection('Progress Photos');
      hideSection('Form Score');
      hideSection('Personal Bests');
      hideSection('Past Workouts');

      // ── Weigh-in sheet — mounts on demand (sc-if, not just hidden), so a
      // persistent watcher (not just the initial build() retries) wires it
      // the moment it appears. Verified via scripts/_check_progress_*.js:
      // the sheet does not exist in the DOM until "Log weight" is tapped. ──
      var sheetWired = false;
      var typedDigits = '';
      var editingFresh = true;
      function wireWeighSheet(){
        var bigNum = null;
        var divs = document.querySelectorAll('#dc-root div');
        for (var i=0;i<divs.length;i++){
          var d = divs[i];
          if (d.style.fontSize === '52px' && d.nextElementSibling && (d.nextElementSibling.textContent||'').trim() === 'lbs') { bigNum = d; break; }
        }
        if (!bigNum) { sheetWired = false; return; }
        if (sheetWired) return;
        sheetWired = true;
        typedDigits = LAST_WEIGHT != null ? String(LAST_WEIGHT) : '';
        editingFresh = true;
        bigNum.textContent = typedDigits || '0';

        var keys = document.querySelectorAll('#dc-root div[style*="height: 48px"][style*="border-radius: 9px"]');
        for (var ki=0; ki<keys.length; ki++){
          (function(keyEl){
            var digitEl = keyEl.children[0];
            if (!digitEl) return;
            keyEl.addEventListener('click', function(ev){
              ev.stopPropagation();
              var key = (digitEl.textContent||'').trim();
              if (editingFresh) { typedDigits = ''; editingFresh = false; }
              if (key === '⌫') { typedDigits = typedDigits.slice(0, -1); }
              else if (key === '.') { if (typedDigits.indexOf('.') === -1) typedDigits += '.'; }
              else if (/^[0-9]$/.test(key)) { if (typedDigits.length < 6) typedDigits += key; }
              bigNum.textContent = typedDigits || '0';
              // Same wInColor cosmetic gap as Submit's own fix — verified
              // via screenshot: stays in its "unedited placeholder" grey
              // forever since nothing updates it. Real input means real
              // (dark) text.
              bigNum.style.setProperty('color', '#111114', 'important');
            }, true);
          })(keys[ki]);
        }

        var submitBtn = null;
        var anchors = document.querySelectorAll('#dc-root a');
        for (var ai=0; ai<anchors.length; ai++){ if ((anchors[ai].textContent||'').trim() === 'Submit') { submitBtn = anchors[ai]; break; } }
        if (submitBtn) {
          // Cosmetic fix — verified via screenshot: the button's
          // background/color are driven by the artboard's own internal
          // validation state (subBg/subFg), which never updates since we
          // bypass its reactive engine, so it rendered stuck in its grey
          // "disabled" look even though the click handler above always
          // works. Any typed value here is submittable, so force the
          // "enabled" look.
          submitBtn.style.setProperty('background', '#111114', 'important');
          submitBtn.style.setProperty('color', '#ffffff', 'important');
          submitBtn.addEventListener('click', function(ev){
            ev.preventDefault(); ev.stopPropagation();
            var val = parseFloat(typedDigits);
            if (!(val > 0)) return;
            dcPost({ type: 'logWeight', weightLb: val });
            // Close via the sheet's own real back button — reuses its
            // existing close animation instead of reimplementing one.
            var backBtn = document.querySelector('#dc-root a[aria-label="Back"]');
            if (backBtn) backBtn.click();
          }, true);
        }
      }
      var weighWatcher = setInterval(wireWeighSheet, 250);

      dcPost({ type: 'ready' });
      return true;
    }

    var SCRIPT_START = Date.now();
    function tryBuild(){
      if (build()) return;
      setTimeout(tryBuild, 200);
    }
    tryBuild();
  })();
  `;
}

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [injectJs, setInjectJs] = useState<string | null>(null);
  const [pageLoaded, setPageLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [range, setRange] = useState<UiRange>('6m');
  const rankRef = useRef<RankInfo>({ rankName: 'Bronze I', rankPct: 0, nextRank: 'Bronze II', streakLine: '0-day streak' });
  const entriesRef = useRef<WeightEntry[]>([]);

  const rebuild = useCallback(() => {
    setInjectJs(buildProgressInjectJs(rankRef.current, range, entriesRef.current, insets.bottom));
  }, [range, insets.bottom]);

  useFocusEffect(useCallback(() => {
    Promise.all([getAllSessions(), getWeightLog()]).then(([sessions, entries]) => {
      const tiers = computeMuscleTiers(sessions);
      const standing = computeOverallStanding(tiers);
      const tierCap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
      const TIER_ORDER = ['bronze', 'silver', 'gold', 'platinum', 'diamond'] as const;
      const idx = standing ? TIER_ORDER.indexOf(standing.tier as typeof TIER_ORDER[number]) : 0;
      const nextTier = idx >= 0 && idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : (standing?.tier ?? 'bronze');
      rankRef.current = {
        rankName: standing ? `${tierCap(standing.tier)} I` : 'Unranked',
        rankPct:  standing ? Math.round(standing.progress * 100) : 0,
        nextRank: tierCap(nextTier),
        streakLine: `${calcStreak(sessions)}-day streak`,
      };
      entriesRef.current = entries;
      setInjectJs(buildProgressInjectJs(rankRef.current, range, entries, insets.bottom));
    }).catch(() => {});
  }, [range, insets.bottom]));

  React.useEffect(() => {
    if (pageLoaded && injectJs) webRef.current?.injectJavaScript(injectJs + '; true;');
  }, [pageLoaded, injectJs]);

  const handleLogWeight = useCallback(async (weightLb: number) => {
    await logWeight(weightLb, new Date());
    entriesRef.current = await getWeightLog();
    rebuild();
  }, [rebuild]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <WebView
        ref={webRef}
        source={PROGRESS_HTML}
        originWhitelist={['*']}
        injectedJavaScriptBeforeContentLoaded={DC_VIEWPORT_JS}
        onLoadEnd={() => setPageLoaded(true)}
        onMessage={(e) => {
          let msg: { type?: string; range?: UiRange; weightLb?: number };
          try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
          if (msg.type === 'ready') { setReady(true); return; }
          if (msg.type === 'rangePick' && msg.range) { setRange(msg.range); return; }
          if (msg.type === 'logWeight' && msg.weightLb) { void handleLogWeight(msg.weightLb); return; }
        }}
        style={[styles.web, { opacity: ready ? 1 : 0 }]}
        scrollEnabled
        bounces={false}
        overScrollMode="never"
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eeeef1' },
  web:  { flex: 1, backgroundColor: '#eeeef1' },
});
