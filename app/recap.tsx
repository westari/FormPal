/**
 * app/recap.tsx
 *
 * The summary (after-workout) and rep feedback screens are both NATIVE now
 * — WorkoutSummarySheet and RepFeedbackScreen, further down: a full-screen
 * expo-video replay (summary) or a nativeControls AVPlayerViewController
 * (feedback), plus a hand-rolled spring-physics bottom sheet on the
 * summary screen. Explicit ask after repeated WebView bugs ("laggy, the
 * drag has no feel. They're WebViews, which is the root problem") —
 * rebuilt from scratch rather than patched again.
 *
 * All sets and muscle ranks are still the real Claude-Design artboards
 * (assets/app screens/allsetsfullworkout.html, muscleranks.html) rendered
 * via WebView — next in line for the same native treatment, not yet done.
 * `view` toggles which screen is shown (native component or WebView
 * `source` swap, forced to remount via `key` for the WebView pair); each
 * posts/calls the same handlers (`viewAllSets`, `doneRanks`, etc.)
 * regardless of whether the screen is native or WebView.
 *
 * allsetsfullworkout.html / muscleranks.html are NOT prop-driven — their
 * dc-scripts never read this.props at all, 100% hardcoded design-tool demo
 * data (fake Squats/Push-ups tiles, fake rank numbers). Real data goes in
 * by replacing the default demo tiles/text after mount instead, bypassing
 * each artboard's own internal logic (see allSetsInject / muscleRanksInject).
 *
 * All the actual data logic is unchanged (still real, still correct): the
 * three-mode load effect (workout / history / solo-live), repFeedbackText
 * for the rep card's text, generateSummary for the overview line, and the
 * Share/Share Video/markWorkoutComplete handlers.
 *
 * ONE real data gap, not papered over: the design shows a video replay +
 * rep scrubber on EVERY completion. That's only possible for solo mode
 * (formcheck.tsx passes its own videoUri/events directly). A multi-exercise
 * WORKOUT has no reliable per-exercise video today — every exercise in a
 * workout is logged with the same shared finishedAt timestamp, so there's
 * no way to tell which recording (if any) belongs to which exercise. Rather
 * than guess and risk showing the wrong exercise's footage, "View rep
 * feedback" is hidden entirely in that case — same "only show what's
 * real" policy the rest of this file already follows.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Share, TouchableOpacity, Animated, PanResponder, Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { WebView } from 'react-native-webview';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Sharing from 'expo-sharing';
import { PJS } from '../constants/theme';
import { repFeedbackText } from '../lib/repFeedbackSentences';
import {
  getAllSessions, appendSessions, groupIntoWorkouts, calcStreak, computeMuscleTiers,
  TIER_ORDER, type SessionEntry, type RepEventData, type Tier,
} from '../lib/sessionLog';
import { findSessionVideoUri } from '../lib/sessionVideo';
import { EXERCISE_DEFINITIONS } from '../constants/exerciseDefinitions';
import { getExerciseDef, muscleCreditParts, type ExerciseId } from '../constants/exercises';
import { computeOverallStanding, MUSCLE_LABELS } from '../components/MuscleTierMap';
import { useWorkoutSessionStore } from '../store/workoutSessionStore';
import type { WorkoutSummary } from '../store/workoutSessionStore';
import { usePlanStore } from '../store/planStore';

// The remaining real Claude-Design artboards, used directly via WebView —
// the summary (workoutrecap.html) and rep feedback (repfeedback.html)
// screens are both native now (WorkoutSummarySheet / RepFeedbackScreen,
// above), not loaded here any more. Also 100% hardcoded demo data, no
// props channel — same DOM-replacement approach either of those used (see
// allSetsInject / muscleRanksInject).
const ALL_SETS_HTML = require('../assets/app screens/allsetsfullworkout.html');
const MUSCLE_RANKS_HTML = require('../assets/app screens/muscleranks.html');

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecapData {
  ts:              number;
  entries:         SessionEntry[];
  totalReps:       number;
  totalGoodReps:   number;
  pct:             number;
  videoUri?:       string;
  repEvents?:      RepEventData[];
  isHistory:       boolean;
  workoutSummary?: WorkoutSummary;
  durationSec?:    number;
  formChecked?:    boolean;
  hasFormData:     boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function generateSummary(reps: number, goodReps: number, hasFormData = true): string {
  const pct = reps > 0 ? Math.round((goodReps / reps) * 100) : 0;
  if (reps === 0)  return 'No reps were detected this session. Try positioning the phone so your full body is visible from the side.';
  if (!hasFormData) return `${reps} reps counted. Form wasn't scored for this session. These are rep-counter movements, so they build training volume without a form grade.`;
  if (pct === 100) return `Every one of your ${reps} reps hit good form. That's the kind of consistency that builds real strength over time.`;
  if (pct >= 80)   return `Solid session. You hit good form on ${goodReps} of ${reps} reps (${pct}%).`;
  if (pct >= 50)   return `You hit good form on ${goodReps} of ${reps} reps (${pct}%). Slow the rep down and focus on full range of motion.`;
  return `${reps} reps completed, ${goodReps} in good form (${pct}%). Focus on control over speed next session.`;
}

type InMsg = {
  type: 'back' | 'seeRanks' | 'share' | 'shareVideo' | 'viewRepFeedback' | 'closeRepFeedback'
      | 'viewAllSets' | 'closeAllSets' | 'closeRanks' | 'doneRanks';
};

// Both remaining WebView artboards are FIXED 390x844 canvases (raw Claude-Design exports,
// same as onboarding's DC pages and run.tsx's demo/connect-music screens)
// — scaled to fit both width and height, centered, same technique as
// everywhere else in the app this applies.
const DC_VIEWPORT_JS = `(function(){try{
  var m=document.querySelector('meta[name=viewport]');
  if(!m){ m=document.createElement('meta'); m.name='viewport'; (document.head||document.documentElement).appendChild(m); }
  m.setAttribute('content','width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}catch(e){}})(); true;`;

// BUG FOUND (device test, round 1): the original version used
// position:absolute + left/top 50% + translate(-50%,-50%) on #dc-root,
// with no explicit body height — body's own box was collapsing toward 0
// height and swallowing hit-testing. Replaced with position:relative +
// margin:auto + scale-only transform, body height explicitly set.
//
// BUG FOUND (device test, round 2): that fix used "contain" scaling
// (fit both width and height, Math.min) — read as "the card doesn't
// reach the edges, gap below and on the sides" on these full-bleed
// screens. Switched to filling the height EXACTLY (S = vh/H, not
// clamped to <=1) so the bottom-anchored card always lands flush with
// the real bottom edge; width is best-effort via overflow:hidden +
// centered margin — same fix applied in run.tsx's copy of this function.
function dcScaleFitJs(bg: string): string {
  return `
  (function(){
    var W=390, H=844;
    var st=document.createElement('style');
    st.textContent='html{background:${bg}!important;overflow:hidden!important;}body{margin:0!important;padding:0!important;background:${bg}!important;overflow:hidden!important;}#dc-root{position:relative!important;margin:0 auto!important;width:'+W+'px!important;transform-origin:top center!important;}*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}';
    (document.head||document.documentElement).appendChild(st);
    var lastS=-1;
    function fit(){
      var root=document.getElementById('dc-root'); if(!root) return;
      var vh=window.innerHeight||H;
      var S=vh/H;
      if(Math.abs(S-lastS)>=0.002){ lastS=S; root.style.setProperty('transform','scale('+S+')','important'); }
      document.body.style.setProperty('height', vh+'px','important');
      document.documentElement.style.setProperty('height', vh+'px','important');
    }
    fit();
    window.addEventListener('resize', fit);
    [0,300,900,1500].forEach(function(d){ setTimeout(fit,d); });

    // The fake status bar ("9:41" + signal/battery icons) baked into
    // every one of these exports duplicates/overlaps the REAL device
    // status bar — hide it everywhere this bootstrap runs.
    function hideStatusBar(){
      var all=document.querySelectorAll('#dc-root div');
      for(var i=0;i<all.length;i++){
        var el=all[i]; if(el.children.length) continue;
        if((el.textContent||'').trim()==='9:41'){
          var row=el.parentElement;
          if(row){ row.style.setProperty('display','none','important'); return true; }
        }
      }
      return false;
    }
    if(!hideStatusBar()) [200,500,1000,2000].forEach(function(d){ setTimeout(hideStatusBar,d); });
  })();
  `;
}

// ─── allsetsfullworkout.html — grid of every exercise/set completed. Also
// 100% hardcoded demo data (fake Squats/Push-ups/Rows/Lunges sets, no
// props read anywhere) — default tiles are torn out and replaced with one
// real tile per actual exercise. NO video thumbnails on them: this app has
// no reliable per-exercise video in workout mode (see this file's own
// top doc comment), and solo/history mode only ever has ONE entry anyway
// — a real thumbnail grid isn't something real data exists for here, so
// plain dark cards with the real name + rep/form stats instead. The
// filter chips and save/search icons are the artboard's own internal demo
// state with no real equivalent to drive them — left in place (harmless,
// just inert) rather than torn out for a cosmetic gap.
function allSetsInject(opts: {
  tiles: { title: string; meta: string }[];
  videoTileIndex: number | null;
}): string {
  const { tiles, videoTileIndex } = opts;
  return dcScaleFitJs('#ffffff') + `
(function(){
  function post(m){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }catch(e){} }
  var TILES = ${JSON.stringify(tiles)};
  var VIDEO_IDX = ${JSON.stringify(videoTileIndex)};
  var built=false, recapWired=false, doneWired=false;
  function build(){
    if(built) return true;
    var grid=document.querySelector('#dc-root div[style*="grid-template-columns: 1fr 1fr"]');
    if(!grid) return false;
    while(grid.firstChild) grid.removeChild(grid.firstChild);
    TILES.forEach(function(t, i){
      var clickable = (i===VIDEO_IDX);
      var tile=document.createElement('div');
      tile.style.cssText='position:relative;height:150px;border-radius:22px;background:linear-gradient(180deg,#2c2c32 0%,#18181c 100%);overflow:hidden;'+(clickable?'cursor:pointer;':'');
      var label=document.createElement('div');
      label.style.cssText='position:absolute;left:12px;right:12px;bottom:12px;color:#ffffff;';
      var titleEl=document.createElement('div');
      titleEl.style.cssText='font-size:15.5px;font-weight:700;letter-spacing:-0.3px;';
      titleEl.textContent=t.title;
      var metaEl=document.createElement('div');
      metaEl.style.cssText='font-size:11.5px;font-weight:500;color:rgba(255,255,255,0.6);padding-top:4px;';
      metaEl.textContent=t.meta;
      label.appendChild(titleEl); label.appendChild(metaEl);
      tile.appendChild(label);
      if(clickable){ tile.addEventListener('click', function(ev){ ev.stopPropagation(); post({type:'viewRepFeedback'}); }, true); }
      grid.appendChild(tile);
    });
    built=true;
    return true;
  }
  function apply(){
    var ok=build();
    var hit=0;
    if(!recapWired){
      var recapLink=document.querySelector('#dc-root a[href="Workout Recap v2.dc.html"]');
      if(recapLink){ recapLink.addEventListener('click', function(ev){ ev.preventDefault(); post({type:'closeAllSets'}); }, true); recapWired=true; hit++; }
    }
    if(!doneWired){
      var doneLink=document.querySelector('#dc-root a[href="Workout Recap.dc.html"]');
      if(doneLink){ doneLink.addEventListener('click', function(ev){ ev.preventDefault(); post({type:'closeAllSets'}); }, true); doneWired=true; hit++; }
    }
    return ok && hit>=2;
  }
  if(!apply()) [200,500,1000,2000,3500,5000].forEach(function(d){ setTimeout(apply,d); });
  var root = document.getElementById('dc-root') || document.body;
  var mo = new MutationObserver(function(){ apply(); });
  mo.observe(root, { childList: true, subtree: true, characterData: true });
})();
true;
`;
}

// ─── muscleranks.html — "today's progress" screen, the real destination
// for the old "See your ranks" celebration moment. stats (Muscles/Lb
// lifted/New PRs/Day streak) ARE prop-driven but this app doesn't track
// lbs-lifted or PRs (bodyweight/rep-based, no such data exists) — those 2
// slots are honestly relabeled to Reps/Moves (real numbers) rather than
// fabricated. hits (the 2 muscle chips over the body diagram) and the
// rank-progress bar fill are NOT prop-driven (hardcoded Quads/Glutes
// demo, no this.props read for them at all) — real top-2 muscle names +
// rep counts swapped in via DOM text replace (their baked-in icon assets
// only exist for Quads/Glutes specifically, so the icon image itself is
// hidden rather than show the wrong muscle's icon); the progress bar's
// width is a style attribute, set directly rather than text-matched.
function muscleRanksInject(opts: {
  rankName: string; nextRank: string; beforePct: number; afterPct: number;
  streak: number; totalReps: number; moves: number; muscleCount: number;
  hits: { name: string; reps: number }[]; note: string;
}): string {
  const { rankName, nextRank, beforePct, afterPct, streak, totalReps, moves, muscleCount, hits, note } = opts;
  const MAP: Record<string, string> = {
    'Bronze II': rankName,
    'Bronze III': nextRank,
    '4': String(muscleCount),
    '6.2k': String(totalReps),
    '2': String(moves),
    '6': String(streak),
    'Lb lifted': 'Reps',
    'New PRs': 'Moves',
    '72%': `${afterPct}%`,
    'Quads': hits[0]?.name ?? '',
    '+6%': hits[0] ? `+${hits[0].reps}` : '',
    'Glutes': hits[1]?.name ?? '',
    '+5%': hits[1] ? `+${hits[1].reps}` : '',
    'Clean, deep squats did most of the work today. Keep that depth next session and Bronze III is about two workouts away.': note,
  };
  return dcScaleFitJs('#f2f2f5') + `
(function(){
  function post(m){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }catch(e){} }
  var MAP = ${JSON.stringify(MAP)};
  var AFTER_PCT = ${JSON.stringify(afterPct + '%')};
  var HIT_COUNT = ${hits.length};
  var fillSet=false, iconsHidden=false, backWired=false, doneWired=false, shareWired=false;
  function apply(){
    var hit=0;
    var all=document.querySelectorAll('#dc-root div,#dc-root span');
    for(var i=0;i<all.length;i++){
      var el=all[i]; if(el.children.length) continue;
      var t=(el.textContent||'').trim();
      if(MAP[t]!=null && t!==MAP[t]){ el.textContent=MAP[t]; hit++; }
    }
    // Rank progress bar fill (inline width style, not text).
    if(!fillSet){
      var fillBar=document.querySelector('#dc-root div[style*="transition: width 1100ms"]');
      if(fillBar){ fillBar.style.setProperty('width', AFTER_PCT, 'important'); fillSet=true; hit++; }
    }
    // Muscle chip icons only exist as real assets for Quads/Glutes
    // specifically (baked into this file's manifest) — hidden rather
    // than risk showing the wrong muscle's icon for whatever the real
    // top-2 muscles were.
    if(!iconsHidden){
      var chipIcons=document.querySelectorAll('#dc-root div[role="img"]');
      for(var c=0;c<chipIcons.length;c++){
        var w=chipIcons[c].style && chipIcons[c].style.width;
        if(w==='24px'){ chipIcons[c].style.display='none'; hit++; }
      }
      iconsHidden=true;
    }
    // A 2nd chip with nothing real to show (fewer than 2 real muscle
    // hits this session) — hide its whole row rather than leave "Glutes"-
    // shaped blank text.
    if(HIT_COUNT<2){
      var chips=document.querySelectorAll('#dc-root div');
      for(var g=0;g<chips.length;g++){
        if((chips[g].textContent||'').trim()==='' && chips[g].style && chips[g].style.position==='absolute' && chips[g].style.top==='284px'){
          chips[g].style.display='none';
        }
      }
    }
    if(!backWired){
      var backLink=document.querySelector('#dc-root a[href="Workout Recap.dc.html"]');
      if(backLink){ backLink.addEventListener('click', function(ev){ ev.preventDefault(); post({type:'closeRanks'}); }, true); backWired=true; hit++; }
    }
    if(!doneWired){
      var divs=document.querySelectorAll('#dc-root div');
      for(var d=0;d<divs.length;d++){
        var de=divs[d]; if(de.children.length) continue;
        if((de.textContent||'').trim()==='Done'){
          de.addEventListener('click', function(ev){ ev.stopPropagation(); post({type:'doneRanks'}); }, true);
          doneWired=true; hit++; break;
        }
      }
    }
    if(!shareWired){
      var shareBtn=document.querySelector('#dc-root div svg path[d^="M8 10V2.5"]');
      if(shareBtn){
        var sbtn=shareBtn.closest('div');
        if(sbtn){ sbtn.addEventListener('click', function(ev){ ev.stopPropagation(); post({type:'shareVideo'}); }, true); }
        shareWired=true; hit++;
      }
    }
    return hit>=4;
  }
  if(!apply()) [200,500,1000,2000,3500,5000].forEach(function(d){ setTimeout(apply,d); });
  else [1000,2500].forEach(function(d){ setTimeout(apply,d); });
  var root = document.getElementById('dc-root') || document.body;
  var mo = new MutationObserver(function(){ apply(); });
  mo.observe(root, { childList: true, subtree: true, characterData: true });
})();
true;
`;
}

// ─── WorkoutSummarySheet — native after-workout screen ─────────────────────
// Replaces workoutrecapInject/workoutrecap.html's WebView for the summary
// view specifically ("the after-workout and rep feedback screens are
// broken, laggy, and the drag has no feel. They're WebViews, which is the
// root problem" — explicit ask to rebuild natively). Full-bleed expo-video
// background (real AVPlayer, not a WebKit <video> tag loaded from a base64
// data: URI — that hack existed only to dodge WKWebView's file-sandbox/
// autoplay restrictions, neither of which apply to a native player, so this
// plays the real local file:// clip directly) + a hand-rolled spring-
// physics bottom sheet (Animated + PanResponder, not @gorhom/bottom-sheet —
// avoids adding a new native dependency / EAS build for this).
const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

type SheetSnap = 'peek' | 'mid' | 'full';

function useBottomSheet(opts: { peekY: number; midY: number; fullY: number; initial: SheetSnap }) {
  const { peekY, midY, fullY } = opts;
  const snapY: Record<SheetSnap, number> = { peek: peekY, mid: midY, full: fullY };
  const translateY = useRef(new Animated.Value(snapY[opts.initial])).current;
  const current = useRef(snapY[opts.initial]);
  const dragStartY = useRef(snapY[opts.initial]);

  const animateTo = useCallback((snap: SheetSnap, velocityY = 0) => {
    current.current = snapY[snap];
    Animated.spring(translateY, {
      toValue: snapY[snap],
      velocity: velocityY,
      tension: 60,
      friction: 11,
      useNativeDriver: true,
    }).start();
  }, [translateY, snapY.peek, snapY.mid, snapY.full]); // eslint-disable-line react-hooks/exhaustive-deps

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderGrant: () => { dragStartY.current = current.current; },
      onPanResponderMove: (_, g) => {
        let y = dragStartY.current + g.dy;
        // Rubber-band past the top (fullY) and bottom (peekY) bounds —
        // same "resistance that gets harder the further you pull" feel
        // the ask referenced ("like Apple Maps' sheet"), not a hard stop.
        if (y < fullY) y = fullY - (fullY - y) * 0.35;
        if (y > peekY) y = peekY + (y - peekY) * 0.35;
        translateY.setValue(y);
      },
      onPanResponderRelease: (_, g) => {
        const y = dragStartY.current + g.dy;
        const vy = g.vy;
        // Fast flick: honor direction regardless of exact position. Slow
        // release: snap to whichever of the 3 points is nearest.
        let target: SheetSnap;
        if (Math.abs(vy) > 0.6) {
          target = vy > 0
            ? (current.current === fullY ? 'mid' : 'peek')
            : (current.current === peekY ? 'mid' : 'full');
        } else {
          const dists: [SheetSnap, number][] = [['full', Math.abs(y - fullY)], ['mid', Math.abs(y - midY)], ['peek', Math.abs(y - peekY)]];
          dists.sort((a, b) => a[1] - b[1]);
          target = dists[0][0];
        }
        animateTo(target, vy * 300);
      },
    })
  ).current;

  return { translateY, panHandlers: panResponder.panHandlers, animateTo };
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={sheetStyles.statCell}>
      <Text style={sheetStyles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={sheetStyles.statLabel}>{label}</Text>
    </View>
  );
}

function WorkoutSummarySheet({
  data, hasFormData, onBack, onShare, onShareVideo, onViewRepFeedback, onViewAllSets, insets,
}: {
  data: RecapData;
  hasFormData: boolean;
  // Same single exit control as the old WebView back-chevron: history mode
  // -> router.back(), live mode -> advance to the muscle-ranks screen. No
  // separate "Continue" button — that's new UI the design didn't have.
  onBack: () => void;
  onShare: () => void;
  onShareVideo: () => void;
  onViewRepFeedback: (() => void) | null;
  onViewAllSets: () => void;
  insets: { top: number; bottom: number };
}) {
  const hasVideo = !!data.videoUri;
  const player = useVideoPlayer(hasVideo ? data.videoUri! : null, p => {
    p.loop = true;
    p.muted = false;
    if (hasVideo) p.play();
  });

  const moves = data.entries.length;
  const formValue = hasFormData && data.totalReps > 0 ? `${data.pct}%` : '—';
  const formLabel = hasFormData ? 'Form' : 'Form n/a';
  const durationValue = data.durationSec != null ? formatDuration(data.durationSec) : '—';
  const overview = generateSummary(data.totalReps, data.totalGoodReps, hasFormData);

  const PEEK_H = 176, MID_H = Math.round(SCREEN_H * 0.46), FULL_Y = insets.top + 54;
  const peekY = SCREEN_H - PEEK_H, midY = SCREEN_H - MID_H;
  const { translateY, panHandlers, animateTo } = useBottomSheet({ peekY, midY, fullY: FULL_Y, initial: 'mid' });

  // Video dims the further the sheet rises, so the stats/text stay legible
  // against it at the 'full' snap — driven off the same translateY so it
  // tracks the drag 1:1 instead of a separately-timed fade.
  const dimOpacity = translateY.interpolate({
    inputRange: [FULL_Y, midY, peekY],
    outputRange: [0.55, 0.15, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={StyleSheet.absoluteFill}>
      {hasVideo ? (
        <VideoView
          style={StyleSheet.absoluteFill}
          player={player}
          contentFit="cover"
          nativeControls={false}
          allowsPictureInPicture={false}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111114' }]} />
      )}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', opacity: dimOpacity }]} pointerEvents="none" />

      <TouchableOpacity onPress={onBack} hitSlop={12} style={[sheetStyles.topBtn, { top: insets.top + 12, left: 16 }]}>
        <SymbolView name="chevron.left" size={16} tintColor="#ffffff" type="monochrome" style={{ width: 16, height: 16 }} />
      </TouchableOpacity>
      <TouchableOpacity onPress={hasVideo ? onShareVideo : onShare} hitSlop={12} style={[sheetStyles.topBtn, { top: insets.top + 12, right: 16 }]}>
        <SymbolView name="square.and.arrow.up" size={16} tintColor="#ffffff" type="monochrome" style={{ width: 16, height: 16 }} />
      </TouchableOpacity>

      <Animated.View
        style={[sheetStyles.sheet, { height: SCREEN_H - FULL_Y + 40, transform: [{ translateY }] }]}
      >
        <View {...panHandlers} style={sheetStyles.handleZone}>
          <View style={sheetStyles.handle} />
          <View style={sheetStyles.statRow}>
            <StatCell label="Reps" value={String(data.totalReps)} />
            <StatCell label="Moves" value={String(moves)} />
            <StatCell label={formLabel} value={formValue} />
            <StatCell label="Time" value={durationValue} />
          </View>
        </View>

        <View style={[sheetStyles.body, { paddingBottom: insets.bottom + 20 }]}>
          <Text style={sheetStyles.overview}>{overview}</Text>
          <View style={sheetStyles.btnCol}>
            {onViewRepFeedback && (
              <TouchableOpacity style={sheetStyles.secondaryBtn} activeOpacity={0.85} onPress={onViewRepFeedback}>
                <Text style={sheetStyles.secondaryBtnTxt}>View rep feedback</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={sheetStyles.primaryBtn} activeOpacity={0.85} onPress={onViewAllSets}>
              <Text style={sheetStyles.primaryBtnTxt}>All sets</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const sheetStyles = StyleSheet.create({
  topBtn: {
    position: 'absolute', width: 34, height: 34, borderRadius: 17, zIndex: 50,
    backgroundColor: 'rgba(20,20,24,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  sheet: {
    position: 'absolute', left: 0, right: 0, top: 0, width: SCREEN_W,
    backgroundColor: '#17171b', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    ...({ boxShadow: '0px -8px 24px rgba(0,0,0,0.35)' } as any),
  },
  handleZone: { paddingTop: 10, paddingBottom: 14 },
  handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', alignSelf: 'center', marginBottom: 14 },
  statRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10 },
  statCell: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, paddingVertical: 12 },
  statValue: { fontFamily: PJS.extrabold, fontSize: 19, color: '#ffffff', letterSpacing: -0.4 },
  statLabel: { fontFamily: PJS.medium, fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 18 },
  overview: { fontFamily: PJS.medium, fontSize: 14.5, lineHeight: 21, color: 'rgba(255,255,255,0.82)' },
  btnCol: { marginTop: 22, gap: 10 },
  secondaryBtn: { height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  secondaryBtnTxt: { fontFamily: PJS.bold, fontSize: 15, color: '#ffffff' },
  primaryBtn: { height: 54, borderRadius: 27, backgroundColor: '#2E7DFF', alignItems: 'center', justifyContent: 'center' },
  primaryBtnTxt: { fontFamily: PJS.bold, fontSize: 16, color: '#ffffff' },
});

// ─── RepFeedbackScreen — native per-rep video review ───────────────────────
// Replaces repFeedbackInject/repfeedback.html's WebView — explicit ask:
// "Tapping 'View rep feedback' must do ONE clean push... No flashes, no
// double mount, no grey screen." This is a plain state swap in the same
// tree (no navigation stack involved at all, which is the actual fix —
// there's nothing left to double-mount or flash), with a real native
// video player: `nativeControls` on so play/pause/scrub/fullscreen/PiP are
// the real AVPlayerViewController, not hand-drawn buttons. The rep tag/
// feedback text/tick scrubber below the player are FormPal's own content,
// not "fake video controls" — they navigate BETWEEN reps, a concept the
// native player has no notion of.
function RepFeedbackScreen({
  exerciseName, videoUri, reps, onClose, onViewAllSets, insets,
}: {
  exerciseName: string;
  videoUri?: string;
  reps: { timeSec: number; what: string }[];
  onClose: () => void;
  onViewAllSets: () => void;
  insets: { top: number; bottom: number };
}) {
  const hasVideo = !!videoUri;
  const hasReps = reps.length > 0;
  const player = useVideoPlayer(hasVideo ? videoUri! : null, p => {
    p.muted = false;
    if (hasVideo) p.play();
  });
  const [idx, setIdx] = useState(0);

  const show = useCallback((i: number) => {
    if (!hasReps) return;
    const clamped = Math.max(0, Math.min(reps.length - 1, i));
    setIdx(clamped);
    const rep = reps[clamped];
    if (rep) { try { player.currentTime = rep.timeSec; } catch {} }
  }, [reps, hasReps, player]);

  const current = hasReps ? reps[idx] : null;
  const VIDEO_H = Math.round(SCREEN_H * 0.42);

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ height: VIDEO_H, backgroundColor: '#0d0d10' }}>
        {hasVideo && (
          <VideoView
            style={StyleSheet.absoluteFill}
            player={player}
            contentFit="cover"
            nativeControls
            allowsFullscreen
            allowsPictureInPicture
          />
        )}
      </View>
      <TouchableOpacity onPress={onClose} hitSlop={12} style={[sheetStyles.topBtn, { top: insets.top + 12, right: 16 }]}>
        <SymbolView name="xmark" size={14} tintColor="#ffffff" type="monochrome" style={{ width: 14, height: 14 }} />
      </TouchableOpacity>

      <View style={feedbackStyles.body}>
        <Text style={feedbackStyles.exBadge}>{exerciseName.toUpperCase()}</Text>

        <View style={feedbackStyles.card}>
          <Text style={feedbackStyles.tag}>{hasReps ? `Rep ${idx + 1} of ${reps.length}` : 'No reps recorded'}</Text>
          <Text style={feedbackStyles.cardBody}>
            {current ? current.what : "This set didn't capture any rep data."}
          </Text>
        </View>

        {hasReps && (
          <View style={feedbackStyles.track}>
            {reps.map((_, i) => (
              <TouchableOpacity key={i} onPress={() => show(i)} style={feedbackStyles.tickHit} hitSlop={4}>
                <View style={[feedbackStyles.tick, i <= idx && feedbackStyles.tickDone]} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={feedbackStyles.navRow}>
          <TouchableOpacity
            onPress={() => show(idx - 1)}
            disabled={!hasReps || idx <= 0}
            style={[feedbackStyles.navBtn, (!hasReps || idx <= 0) && feedbackStyles.navBtnDisabled]}
          >
            <SymbolView name="chevron.left" size={16} tintColor="#ffffff" type="monochrome" style={{ width: 16, height: 16 }} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => show(idx + 1)}
            disabled={!hasReps || idx >= reps.length - 1}
            style={[feedbackStyles.navBtn, (!hasReps || idx >= reps.length - 1) && feedbackStyles.navBtnDisabled]}
          >
            <SymbolView name="chevron.right" size={16} tintColor="#ffffff" type="monochrome" style={{ width: 16, height: 16 }} />
          </TouchableOpacity>
        </View>

        <View style={[feedbackStyles.btnCol, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity style={sheetStyles.secondaryBtn} activeOpacity={0.85} onPress={onViewAllSets}>
            <Text style={sheetStyles.secondaryBtnTxt}>All sets</Text>
          </TouchableOpacity>
          <TouchableOpacity style={sheetStyles.primaryBtn} activeOpacity={0.85} onPress={onClose}>
            <Text style={sheetStyles.primaryBtnTxt}>Finish review</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const feedbackStyles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 18, backgroundColor: '#111114' },
  exBadge: { fontFamily: PJS.extrabold, fontSize: 12, letterSpacing: 0.6, color: 'rgba(255,255,255,0.55)' },
  card: { marginTop: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 18, padding: 16 },
  tag: { fontFamily: PJS.bold, fontSize: 13, color: '#2E7DFF' },
  cardBody: { fontFamily: PJS.medium, fontSize: 15, lineHeight: 21, color: '#ffffff', marginTop: 6 },
  track: { flexDirection: 'row', gap: 6, marginTop: 18 },
  tickHit: { flex: 1, paddingVertical: 8 },
  tick: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)' },
  tickDone: { backgroundColor: '#2E7DFF' },
  navRow: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 18 },
  navBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  navBtnDisabled: { opacity: 0.3 },
  btnCol: { marginTop: 'auto', gap: 10 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function RecapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);

  const {
    reps: repsStr, goodReps: goodRepsStr, videoUri: videoUriParam, events,
    exercise, ts: tsParam, mode, durationSec: durationSecParam,
  } = useLocalSearchParams<{
    reps?: string; goodReps?: string; videoUri?: string; events?: string;
    exercise?: string; ts?: string; mode?: string; durationSec?: string;
  }>();

  const isWorkoutMode = mode === 'workout';
  const isHistoryMode = !isWorkoutMode && tsParam != null;

  const finishWorkout       = useWorkoutSessionStore(s => s.finishWorkout);
  const abortWorkout        = useWorkoutSessionStore(s => s.abortWorkout);
  const markWorkoutComplete = usePlanStore(s => s.markWorkoutComplete);

  const [data, setData]             = useState<RecapData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const initialized = useRef(false);
  const [view, setView] = useState<'summary' | 'feedback' | 'allsets' | 'ranks'>('summary');

  const repEventsParam = useMemo<RepEventData[]>(() => {
    try { return JSON.parse(events ?? '[]'); }
    catch { return []; }
  }, [events]);

  // ── Load recap data (once) — three modes: workout / history / solo-live ────
  // Identical to the previous native version of this screen — only the
  // render target changed.
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    (async () => {
      if (isWorkoutMode) {
        const existing = useWorkoutSessionStore.getState().getSummary();
        const summary = existing ?? finishWorkout();
        if (!summary) { setLoadFailed(true); return; }

        const entries: SessionEntry[] = summary.results
          .filter(r => r.completed)
          .map(r => ({
            ts: summary.finishedAt, exerciseId: r.exerciseId, displayName: r.displayName,
            reps: r.reps, goodReps: r.goodReps, pct: r.formScore,
            formChecked: r.formChecked,
          }));
        if (entries.length > 0) await appendSessions(entries);

        setData({
          ts: summary.finishedAt, entries,
          totalReps: summary.totalReps, totalGoodReps: summary.totalGoodReps,
          pct: summary.overallFormScore, isHistory: false, workoutSummary: summary,
          durationSec: summary.durationSeconds,
          hasFormData: summary.results.some(r => r.completed && r.formChecked),
        });
      } else if (isHistoryMode) {
        const all    = await getAllSessions();
        const groups = groupIntoWorkouts(all);
        const group  = groups.find(g => g.ts === Number(tsParam));
        if (!group) { setLoadFailed(true); return; }
        const historyVideoUri = await findSessionVideoUri(group.ts);
        setData({
          ts: group.ts, entries: group.entries,
          totalReps: group.totalReps, totalGoodReps: group.totalGoodReps,
          pct: group.pct, isHistory: true,
          hasFormData: group.entries.some(e => e.formChecked !== false),
          videoUri: historyVideoUri ?? undefined,
        });
      } else {
        const reps        = parseInt(repsStr ?? '0', 10);
        const goodReps     = parseInt(goodRepsStr ?? '0', 10);
        const formChecked = mode !== 'repCounter';
        const pct         = formChecked && reps > 0 ? Math.round((goodReps / reps) * 100) : 0;
        const soloTs      = Date.now();
        const exId        = exercise ?? 'unknown';
        const entry: SessionEntry = {
          ts: soloTs, exerciseId: exId,
          displayName: EXERCISE_DEFINITIONS[exId as ExerciseId]?.displayName ?? exId,
          reps, goodReps, pct, formChecked,
        };
        if (reps > 0) await appendSessions([entry]);
        const parsedDuration = durationSecParam != null ? parseInt(durationSecParam, 10) : undefined;
        const soloVideoUri = typeof videoUriParam === 'string' && videoUriParam.length > 0 ? videoUriParam : undefined;
        setData({
          ts: soloTs, entries: reps > 0 ? [entry] : [],
          totalReps: reps, totalGoodReps: goodReps, pct, formChecked,
          hasFormData: formChecked,
          videoUri: soloVideoUri,
          repEvents: formChecked ? repEventsParam : [],
          isHistory: false,
          durationSec: parsedDuration != null && !isNaN(parsedDuration) ? parsedDuration : undefined,
        });
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Native video (expo-video) reads the real local file:// uri directly —
  // no more base64 data: URI conversion, that hack existed only to dodge
  // WKWebView's file-sandbox/autoplay restrictions, neither of which apply
  // to a native player.
  const hasVideo = !!data?.videoUri;

  // ── Handlers (same real logic as before, now triggered by postMessage) ────

  const handleShare = useCallback(async () => {
    if (!data) return;
    const text = [
      isWorkoutMode ? 'Workout Complete' : 'Session Complete',
      `${data.totalReps} reps · ${data.entries.length} ${data.entries.length === 1 ? 'move' : 'moves'}` +
        (data.hasFormData && data.totalReps > 0 ? ` · ${data.pct}% form` : ''),
      generateSummary(data.totalReps, data.totalGoodReps, data.hasFormData),
    ].join('\n');
    try { await Share.share({ message: text }); } catch {}
  }, [data, isWorkoutMode]);

  const handleShareVideo = useCallback(async () => {
    if (data?.videoUri) {
      try {
        const available = await Sharing.isAvailableAsync();
        if (available) await Sharing.shareAsync(data.videoUri, { mimeType: 'video/mp4', dialogTitle: 'Share your FormPal replay' });
      } catch {}
    } else {
      await handleShare();
    }
  }, [data, handleShare]);

  // The real session-complete side effects — fires once, from the muscle-
  // ranks screen's "Done" (the real end of the flow now — see handleBack).
  const completeSession = useCallback(async () => {
    if (isWorkoutMode) {
      if (data?.workoutSummary?.workoutId) {
        try { await markWorkoutComplete(data.workoutSummary.workoutId); } catch {}
      }
      abortWorkout();
    }
  }, [isWorkoutMode, data, markWorkoutComplete, abortWorkout]);

  // History mode: a plain back, same as before (reviewing the past, not
  // finishing anything). Everything else: route through the muscle-ranks
  // "today's progress" screen first — explicit ask, "show muscle ranks
  // after the rep feedback, or wherever you exit out, right after all the
  // workout stuff." Its own "Done" (doneRanks message, below) is what
  // actually completes the session and navigates away now.
  const handleBack = useCallback(async () => {
    if (data?.isHistory) { router.back(); return; }
    setView('ranks');
  }, [data, router]);

  const handleDoneRanks = useCallback(async () => {
    await completeSession();
    router.replace((isWorkoutMode ? '/(tabs)/train' : '/(tabs)/') as any);
  }, [isWorkoutMode, completeSession, router]);

  // Real per-rep what/fix text (repFeedbackText — same function this file
  // already used), only meaningful when there's a real video to scrub to.
  const repEvents = useMemo(() => {
    if (!hasVideo || !data) return [];
    return (data.repEvents ?? []).map((ev, i) => {
      const { what } = repFeedbackText(ev.good, ev.reason, i);
      return { timeSec: ev.timeSec, what };
    });
  }, [hasVideo, data]);

  const allSetsInjectJs = useMemo(() => {
    if (!data) return null;
    return allSetsInject({
      tiles: data.entries.map(e => ({
        title: e.displayName,
        meta: e.formChecked !== false
          ? `${e.reps} reps · ${e.reps > 0 ? Math.round((e.goodReps / e.reps) * 100) : 0}% form`
          : `${e.reps} reps`,
      })),
      videoTileIndex: hasVideo && data.entries.length > 0 ? 0 : null,
    });
  }, [data, hasVideo]);

  // "Today's progress" — real standing before vs. after this session
  // (computeOverallStanding's own "weakest muscle" philosophy, same one
  // app/muscle-ranks.tsx already uses), real streak, real top-2 muscles
  // worked THIS session by rep credit. Not computed for history mode —
  // "today's progress" doesn't mean anything for a past session being
  // reviewed, and handleBack never routes there in that case anyway.
  const [rankData, setRankData] = useState<{
    rankName: string; nextRank: string; beforePct: number; afterPct: number;
    streak: number; muscleCount: number; hits: { name: string; reps: number }[];
  } | null>(null);
  useEffect(() => {
    if (!data || data.isHistory) return;
    (async () => {
      const all = await getAllSessions(); // already includes this session's own entries
      const prior = all.filter(s => s.ts < data.ts);
      const afterStanding = computeOverallStanding(computeMuscleTiers(all));
      const beforeStanding = computeOverallStanding(computeMuscleTiers(prior));
      const afterTier: Tier = afterStanding?.tier ?? 'bronze';
      const idx = TIER_ORDER.indexOf(afterTier);
      const nextTier = idx >= 0 && idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : afterTier;
      const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

      const tally = new Map<string, number>();
      for (const e of data.entries) {
        const def = getExerciseDef(e.exerciseId);
        if (!def) continue;
        for (const credit of def.muscles) {
          const { muscle, weight } = muscleCreditParts(credit);
          tally.set(muscle, (tally.get(muscle) ?? 0) + e.reps * weight);
        }
      }
      const hits = [...tally.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([m, reps]) => ({ name: MUSCLE_LABELS[m as keyof typeof MUSCLE_LABELS], reps: Math.round(reps) }));

      setRankData({
        rankName: cap(afterTier), nextRank: cap(nextTier),
        beforePct: Math.round((beforeStanding?.progress ?? 0) * 100),
        afterPct: Math.round((afterStanding?.progress ?? 0) * 100),
        streak: calcStreak(all), muscleCount: tally.size, hits,
      });
    })();
  }, [data]);

  const ranksInjectJs = useMemo(() => {
    if (!data || !rankData) return null;
    return muscleRanksInject({
      ...rankData,
      totalReps: data.totalReps, moves: data.entries.length,
      note: generateSummary(data.totalReps, data.totalGoodReps, data.hasFormData),
    });
  }, [data, rankData]);

  // ── Failure / loading states ────────────────────────────────────────────────

  if (loadFailed) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
      </View>
    );
  }

  // 'ranks' falls back to 'summary' until rankData/its inject finish
  // computing (async) — never shows a view with nothing real injected yet.
  // 'feedback' is gated on hasVideo alone now (native — no inject to wait
  // on), matching the same condition the summary sheet's own button uses
  // to decide whether it's even shown.
  const effectiveView: 'summary' | 'feedback' | 'allsets' | 'ranks' =
    view === 'feedback' && hasVideo         ? 'feedback' :
    view === 'allsets'  && allSetsInjectJs  ? 'allsets'  :
    view === 'ranks'    && ranksInjectJs    ? 'ranks'    :
    'summary';

  // Summary and rep feedback are both native now (WorkoutSummarySheet /
  // RepFeedbackScreen, above) — all sets and muscle ranks are still the
  // real Claude-Design WebView artboards, next in line for the same
  // native rebuild.
  if (effectiveView === 'summary') {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <WorkoutSummarySheet
          data={data}
          hasFormData={data.hasFormData}
          onBack={() => void handleBack()}
          onShare={() => void handleShare()}
          onShareVideo={() => void handleShareVideo()}
          onViewRepFeedback={hasVideo ? () => setView('feedback') : null}
          onViewAllSets={() => setView('allsets')}
          insets={insets}
        />
      </View>
    );
  }

  if (effectiveView === 'feedback') {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <RepFeedbackScreen
          exerciseName={data.entries[0]?.displayName ?? 'Exercise'}
          videoUri={data.videoUri}
          reps={repEvents}
          onClose={() => setView('summary')}
          onViewAllSets={() => setView('allsets')}
          insets={insets}
        />
      </View>
    );
  }

  const SOURCE_BY_VIEW = {
    allsets: ALL_SETS_HTML, ranks: MUSCLE_RANKS_HTML,
  } as const;
  const INJECT_BY_VIEW = {
    allsets: allSetsInjectJs, ranks: ranksInjectJs,
  } as const;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <WebView
        key={effectiveView}
        ref={webRef}
        source={SOURCE_BY_VIEW[effectiveView]}
        originWhitelist={['*']}
        style={styles.web}
        injectedJavaScriptBeforeContentLoaded={DC_VIEWPORT_JS}
        injectedJavaScript={INJECT_BY_VIEW[effectiveView] ?? undefined}
        onMessage={(e) => {
          let msg: InMsg;
          try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
          if (msg.type === 'back') void handleBack();
          else if (msg.type === 'share') void handleShare();
          else if (msg.type === 'shareVideo') void handleShareVideo();
          else if (msg.type === 'viewRepFeedback') setView('feedback');
          else if (msg.type === 'closeRepFeedback') setView('summary');
          else if (msg.type === 'viewAllSets') setView('allsets');
          else if (msg.type === 'closeAllSets') setView('summary');
          else if (msg.type === 'closeRanks') setView('summary');
          else if (msg.type === 'doneRanks') void handleDoneRanks();
        }}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        // iOS-specific WKWebView video props, both missing before — without
        // these a <video> tag either won't play inline at all (WebKit's
        // default forces fullscreen-only playback) or won't start from a
        // JS-triggered play() call without an explicit user tap first. This
        // is very likely why the replay never appeared: not a JS bug, a
        // missing native config prop.
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        bounces={false}
        overScrollMode="never"
        cacheEnabled={false}
      />
      {/* Native fallback back button — completely independent of the
          WebView's own injected JS (which has no visibility into whether
          its own page actually finished loading/rendering). Explicit ask:
          "make sure there's always a working back button so the user can
          never get stuck." */}
      <TouchableOpacity
        onPress={() => setView('summary')}
        hitSlop={12}
        style={[styles.fallbackBack, { top: insets.top + 12 }]}
      >
        <SymbolView name="chevron.left" size={16} tintColor="#ffffff" type="monochrome" style={{ width: 16, height: 16 }} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111114' },
  web:  { flex: 1, backgroundColor: '#111114' },
  fallbackBack: {
    position: 'absolute', left: 16, width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(20,20,24,0.65)', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
});
