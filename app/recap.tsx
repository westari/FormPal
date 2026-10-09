/**
 * app/recap.tsx
 *
 * Renders the REAL Claude-Design artboards (assets/app screens/
 * workoutrecap.html for the summary, allsetsfullworkout.html,
 * muscleranks.html) directly via WebView, exactly as uploaded — explicit,
 * standing instruction: these files are used as-is, never rebuilt,
 * recreated, or redesigned, even to fix bugs/performance. `view` toggles
 * which is mounted (swapping `source`, forced to remount via `key`).
 *
 * Rep feedback (repfeedback.html) is its OWN route — app/rep-feedback.tsx
 * — still the exact same file, just reached by a real router.push instead
 * of a same-screen view-state swap (a navigation-architecture change, not
 * a redesign of the artboard itself). "View rep feedback" (from this
 * screen OR from the all-sets grid) posts {type:'viewRepFeedback'},
 * handled below by that router.push with the data it needs as params.
 *
 * All the actual data logic is unchanged from before (still real, still
 * correct): the three-mode load effect (workout / history / solo-live),
 * generateSummary for the overview line, and the Share/Share Video/
 * markWorkoutComplete handlers — just triggered via postMessage from the
 * WebView instead of a native onPress.
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
import { View, StyleSheet, Share, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import { repFeedbackText } from '../lib/repFeedbackSentences';
import { getLocalVideoHttpUrl } from '../lib/localVideoServer';
import {
  getAllSessions, appendSessions, groupIntoWorkouts, calcStreak, computeMuscleTiers,
  TIER_ORDER, type SessionEntry, type RepEventData, type Tier,
} from '../lib/sessionLog';
import { findSessionVideoUri } from '../lib/sessionVideo';
import { EXERCISE_DEFINITIONS } from '../constants/exerciseDefinitions';
import { getExerciseDef, muscleCreditParts, Muscle, type ExerciseId } from '../constants/exercises';
import { computeOverallStanding, MUSCLE_LABELS, MUSCLE_ICON_SOURCES } from '../components/MuscleTierMap';
import { Asset } from 'expo-asset';
import { useWorkoutSessionStore } from '../store/workoutSessionStore';
import type { WorkoutSummary } from '../store/workoutSessionStore';
import { usePlanStore } from '../store/planStore';

// The real Claude-Design artboards, used directly via WebView. Reverted
// back to this exactly — explicit instruction: "use those files as-is,
// never rebuild/recreate/redesign." Rep feedback is its own route
// (app/rep-feedback.tsx), still the exact repfeedback.html, not loaded
// here. Also 100% hardcoded demo data, no props channel — same DOM-
// replacement approach as everywhere else (see allSetsInject /
// muscleRanksInject).
const RECAP_HTML = require('../assets/app screens/workoutrecap.html');
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
  type: 'back' | 'seeRanks' | 'share' | 'shareVideo' | 'viewRepFeedback'
      | 'viewAllSets' | 'closeAllSets' | 'closeRanks' | 'doneRanks' | 'ready' | 'videoDebug';
  msg?: string;
  code?: number;
};

// Both artboards are FIXED 390x844 canvases (raw Claude-Design exports,
// same as onboarding's DC pages and run.tsx's demo/connect-music screens)
// — scaled to fit both width and height, centered, same technique as
// everywhere else in the app this applies.
// viewport-fit=cover added — explicit retry at the "card not flush to the
// bottom" bug. The contentInsetAdjustmentBehavior="never" WebView prop
// tried earlier did NOT fix it. Without viewport-fit=cover, WKWebView's
// window.innerHeight reports the LAYOUT viewport height with the home-
// indicator safe area already excluded — shorter than the real screen —
// so dcScaleFitJs's own "scale #dc-root to exactly vh" math was scaling
// to a target that was already too short, landing the bottom-anchored
// card above the true bottom edge every time. viewport-fit=cover makes
// window.innerHeight report the FULL device height instead.
const DC_VIEWPORT_JS = `(function(){try{
  var m=document.querySelector('meta[name=viewport]');
  if(!m){ m=document.createElement('meta'); m.name='viewport'; (document.head||document.documentElement).appendChild(m); }
  m.setAttribute('content','width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
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
// BUG FOUND (git diff against the last known-working commit, explicit
// ask): the previous round's "measure the gap and nudge" fix had
// `lastNudge = lastNudge + gap` inside fit()'s own requestAnimationFrame
// callback — fit() runs at LEAST 5 times in the first 1.5s (immediately,
// then at 300/900/1500ms, plus on resize), and each call ADDED its
// measured gap on top of the PREVIOUS nudge instead of recalculating
// fresh. Any small residual gap on more than one of those passes made the
// card visibly jump downward in discrete steps — exactly "glitches a lot"
// right when this screen appears (every finished workout). Reverted the
// transform back to the original simple scale(S)-only (byte-identical to
// the last known-good commit, zero drift risk) — the gap is handled
// completely differently now, see fillBottomGap below.
function dcScaleFitJs(bg: string, bottomFillColor?: string): string {
  return `
  (function(){
    var W=390, H=844;
    var st=document.createElement('style');
    // animation:none added — "card appears at the top with wrong info,
    // then slides down" was this artboard's own CSS entrance animation
    // playing against stale default data before the real data gets
    // injected. Killing it means the card just appears already in its
    // resting position — no slide — whatever data is in the DOM at reveal
    // time (which, with the ready-gate below, is always the real data).
    st.textContent='html{background:${bg}!important;overflow:hidden!important;}body{margin:0!important;padding:0!important;background:${bg}!important;overflow:hidden!important;}#dc-root{position:relative!important;margin:0 auto!important;width:'+W+'px!important;transform-origin:top center!important;}#dc-root *{animation:none!important;-webkit-animation:none!important;}*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}';
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

    ${bottomFillColor ? `
    // BUG FOUND (still showed a gap after the first attempt): this
    // measured #dc-root's OWN bottom edge against vh — but #dc-root is
    // deliberately scaled to EXACTLY vh tall (that's the whole point of
    // fit() above), so that gap is always ~0. It was measuring the wrong
    // box. The REAL gap the design has is INSIDE #dc-root: the white
    // card's own layout stops at top 484px + height 352px = 836px of the
    // artboard's 844px canvas, leaving an 8px dark strip below the card
    // (scaled along with everything else) — that strip is what reads as
    // "the gap under the card." Fixed by measuring the CARD's own bottom
    // edge (the rounded white sheet, border-radius 36px) against the real
    // viewport bottom instead of #dc-root's.
    // "Don't move the card — add white padding/background at the bottom
    // instead." A plain filler rectangle, OUTSIDE #dc-root, pinned to the
    // true bottom edge, resized to whatever gap is actually measured —
    // idempotent (always SETS the height fresh, never adds to a running
    // total), so calling it repeatedly can only converge, never drift.
    // Never touches the card's own transform/position at all.
    function fillBottomGap(){
      var vh=window.innerHeight||H;
      var card=document.querySelector('#dc-root div[style*="border-radius: 36px"]');
      var ref=card||document.getElementById('dc-root');
      if(!ref) return;
      var rect=ref.getBoundingClientRect();
      var gap=vh-rect.bottom;
      var filler=document.getElementById('__formpalBottomFiller');
      if(!filler){
        filler=document.createElement('div');
        filler.id='__formpalBottomFiller';
        filler.style.cssText='position:fixed;left:0;right:0;bottom:0;background:${bottomFillColor};z-index:5;pointer-events:none;';
        document.body.appendChild(filler);
      }
      filler.style.height = (gap>0 ? Math.ceil(gap) : 0) + 'px';
    }
    window.__fpFillBottomGap = fillBottomGap;
    [0,300,900,1500].forEach(function(d){ setTimeout(fillBottomGap,d); });
    window.addEventListener('resize', function(){ setTimeout(fillBottomGap, 50); });
    ` : ''}

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
  // Real per-muscle icon, base64 data: URI, resolved from
  // MUSCLE_ICON_SOURCES (bronze tier — see the "bronze highlight" note
  // below), same order as `hits`. null for a muscle with no Flaticon art
  // yet (Forearms/LowerBack/Calves) — that chip's icon stays hidden, same
  // as the old behavior, rather than show nothing-shaped wrong art.
  hitIconUris: (string | null)[];
}): string {
  const { rankName, nextRank, beforePct, afterPct, streak, totalReps, moves, muscleCount, hits, note, hitIconUris } = opts;
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
  var HIT_ICON_URIS = ${JSON.stringify(hitIconUris)};
  var fillSet=false, iconsSet=false, backWired=false, doneWired=false, shareWired=false;
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
    // BUG FOUND (explicit report): this artboard's own baked-in chip icon
    // art only ever covers Quads/Glutes (its design-time manifest), so for
    // any other muscle it was showing THAT icon regardless of the real
    // label — "Shoulders shows legs, Triceps shows the wrong muscle." Real
    // fix: embed the REAL per-muscle PNG (resolved to a data: URI in
    // recap.tsx from components/MuscleTierMap.tsx's own verified-correct
    // MUSCLE_ICON_SOURCES) as a plain <img>, replacing whatever wrong art
    // the artboard's own <div role="img"> was showing — not hiding it
    // unless there's genuinely no real art yet for that muscle. Also adds
    // the bronze highlight (explicit ask: "muscles that were just trained
    // in this workout get a bronze highlight") — both chips always qualify
    // since hits is already exactly "top muscles worked THIS session."
    if(!iconsSet){
      var chipIcons=document.querySelectorAll('#dc-root div[role="img"]');
      var idx=0;
      for(var c=0;c<chipIcons.length;c++){
        var el=chipIcons[c];
        var w=el.style && el.style.width;
        if(w!=='24px') continue;
        var uri = HIT_ICON_URIS[idx];
        if(uri){
          while(el.firstChild) el.removeChild(el.firstChild);
          var img=document.createElement('img');
          img.src=uri;
          img.style.cssText='width:100%;height:100%;object-fit:contain;';
          el.appendChild(img);
          el.style.setProperty('background','linear-gradient(135deg,#F0C9A0,#B97A42)','important');
          el.style.setProperty('border','1.5px solid #7A4A22','important');
          el.style.setProperty('border-radius','50%','important');
        } else {
          el.style.display='none';
        }
        idx++;
        hit++;
      }
      iconsSet=true;
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

// ─── workoutrecap.html — the main recap screen ─────────────────────────────
// Restored EXACTLY as it was before the native rebuild (git history,
// commit 31d13a0) — explicit instruction: "revert... back to my original
// design files exactly as they were... do not keep any part of the
// rebuild." Prop-driven (reps/sets/form/duration/overview/title), defaults
// matched from its real dc-script. "Sets" is relabeled "Moves" — this app
// tracks distinct exercises completed, not literal weightlifting sets, and
// the artboard's 4-cell stat grid has no spare slot for a 5th metric.
function workoutrecapInject(opts: {
  totalReps: number; moves: number; pct: number; hasFormData: boolean;
  durationSec?: number; overview: string; hasVideo: boolean;
  // A loopback http:// URL (see lib/localVideoServer.ts), not a file://
  // path — the <video> tag loads this directly.
  videoUri?: string;
}): string {
  const { totalReps, moves, pct, hasFormData, durationSec, overview, hasVideo, videoUri } = opts;
  const formValue = hasFormData && totalReps > 0 ? `${pct}%` : '—';
  const formLabel = hasFormData ? 'Form' : 'Form n/a';
  const durationValue = durationSec != null ? formatDuration(durationSec) : '—';
  const MAP: Record<string, string> = {
    '148': String(totalReps),
    '12': String(moves),
    '86%': formValue,
    '38:12': durationValue,
    'Sets': 'Moves',
    'Form': formLabel,
    'Push-up depth improved every set and squats stayed steady. Next time, slow the way down on pull-ups.': overview,
  };
  return dcScaleFitJs('#111114', '#ffffff') + `
(function(){
  function post(m){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }catch(e){} }
  var MAP = ${JSON.stringify(MAP)};
  var HAS_VIDEO = ${JSON.stringify(hasVideo)};
  var VIDEO_SRC = ${JSON.stringify(videoUri ?? '')};
  var videoBuilt = false;
  var videoReady = !HAS_VIDEO;
  var backWired=false, feedbackWired=false, shareWired=false, allSetsWired=false;
  var readyPosted=false;
  // "Dragging the card down is laggy" — traced to the artboard's OWN
  // grabStart/grabEnd logic on the grab-handle pill: it only reacts on
  // RELEASE (measures total pointerdown->pointerup distance, then snaps
  // the card to one of two fixed positions over a 480ms CSS transition),
  // it never follows the finger while held. That release-only snap is
  // what read as laggy/unresponsive. This adds a SECOND pair of listeners
  // on the same handle (the artboard's own grabStart/grabEnd still run
  // too, unchanged) that live-tracks the card's "top" during the hold so
  // it follows the finger in real time; on release the artboard's own
  // logic takes over exactly as before (same 30px threshold, same snap
  // animation) — it just now animates from wherever the finger actually
  // let go instead of jumping from the original fixed position.
  var dragWired = false;
  function wireLiveDrag(){
    if(dragWired) return;
    var handle = document.querySelector('#dc-root div[style*="cursor: grab"]');
    var card = document.querySelector('#dc-root div[style*="border-radius: 36px"]');
    if(!handle || !card) return;
    dragWired = true;
    var TOP_UP=484, TOP_DOWN=814;
    var dragging=false, startY=0, startTop=TOP_UP;
    handle.addEventListener('pointerdown', function(e){
      dragging = true;
      startY = e.clientY;
      var t = parseFloat(card.style.top);
      startTop = isNaN(t) ? TOP_UP : t;
      card.style.setProperty('transition', 'none', 'important');
    }, true);
    handle.addEventListener('pointermove', function(e){
      if(!dragging) return;
      var next = startTop + (e.clientY - startY);
      if(next < TOP_UP) next = TOP_UP;
      if(next > TOP_DOWN) next = TOP_DOWN;
      card.style.setProperty('top', next + 'px', 'important');
    }, true);
    function endDrag(){
      dragging = false;
      // Restore the artboard's OWN authored transition value (not just
      // remove mine) — can't guarantee whether this listener or the
      // artboard's own sc-camel-on-pointer-up handler (attached first, at
      // mount) runs first on the same pointerup event, so setting the
      // exact value the HTML itself authors is safe either order:
      // either it runs before the artboard's re-render (restores it in
      // time for the snap) or after (same value, no-op).
      card.style.setProperty('transition', 'top 480ms cubic-bezier(.22,.9,.24,1)', 'important');
    }
    handle.addEventListener('pointerup', endDrag, true);
    handle.addEventListener('pointercancel', endDrag, true);
  }
  function apply(){
    var hit=0;
    // BUG FOUND: this screen's own replay background was never actually
    // wired to the real recorded clip — only repFeedbackInject's detail
    // screen got a real <video> element. The design uses a custom
    // <image-slot> placeholder with no rendering of its own, so without
    // this it just always showed blank/the placeholder text — "the
    // background video doesn't play."
    if(!videoBuilt && VIDEO_SRC){
      var slot = document.getElementById('recap-replay');
      if(slot){
        var videoEl = document.createElement('video');
        videoEl.src = VIDEO_SRC;
        videoEl.setAttribute('playsinline','');
        videoEl.setAttribute('controls','');
        videoEl.muted = false;
        videoEl.controls = true;
        videoEl.autoplay = true;
        videoEl.loop = true;
        // REVERTED the earlier height cap (484px) — that was a wrong guess
        // (iOS's native video controls overlay the WHOLE video box when
        // tapped, they don't just live in a slim bottom strip, so capping
        // the height didn't help the controls and broke the full-bleed
        // background look instead, leaving the wrapper's dark placeholder
        // color visible below 484px). Back to covering the full replay
        // area exactly like the original design — card sits on top of it,
        // dragging the card down (wireLiveDrag above) reveals more of it,
        // same as before.
        videoEl.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        slot.parentElement && slot.parentElement.insertBefore(videoEl, slot);
        slot.style.display = 'none';
        videoBuilt = true;
        hit++;
        // DIAGNOSTIC — "tap the video, nothing happens, no native controls
        // ever appear": logging actual playback events so next test tells
        // us whether the video is even loading/playing at all, instead of
        // guessing at the cause a third time.
        videoEl.addEventListener('error', function(){ post({type:'videoDebug', msg:'error', code: videoEl.error && videoEl.error.code}); });
        videoEl.addEventListener('canplay', function(){ post({type:'videoDebug', msg:'canplay'}); });
        videoEl.addEventListener('play', function(){ post({type:'videoDebug', msg:'play'}); });
        videoEl.addEventListener('pause', function(){ post({type:'videoDebug', msg:'pause'}); });
        // Don't reveal the screen until the video actually has a real
        // frame decoded — otherwise the card appears first (text/stats
        // ready before the video finishes loading) and the video visibly
        // pops in a beat later. Wait for it, then re-run apply() so the
        // ready-check below re-evaluates with videoReady now true.
        videoEl.addEventListener('loadeddata', function(){ videoReady = true; apply(); }, { once: true });
      }
    }
    var all=document.querySelectorAll('#dc-root div,#dc-root span');
    for(var i=0;i<all.length;i++){
      var el=all[i]; if(el.children.length) continue;
      var t=(el.textContent||'').trim();
      if(MAP[t]!=null && t!==MAP[t]){ el.textContent=MAP[t]; hit++; }
    }
    // Back chevron (top-left circle, no handler on this fresh export).
    if(!backWired){
      var circles=document.querySelectorAll('#dc-root div');
      for(var c=0;c<circles.length;c++){
        var cel=circles[c];
        if(cel.querySelector && cel.querySelector('svg path[d="M10 3 5 8l5 5"]') && cel.offsetWidth<=34){
          cel.addEventListener('click', function(ev){ ev.stopPropagation(); post({type:'back'}); }, true);
          backWired=true; hit++; break;
        }
      }
    }
    // "View rep feedback" -> only a real feature with a real video+reps to
    // show (solo/history mode) — matches the file's own "only show what's
    // real" policy. Without a video, hide it rather than let it open a
    // review screen with nothing real in it.
    if(!feedbackWired){
      var link=document.querySelector('#dc-root a[href="Workout Recap v2.dc.html"]');
      if(link){
        if(!HAS_VIDEO){ link.style.display='none'; }
        else { link.addEventListener('click', function(ev){ ev.preventDefault(); post({type:'viewRepFeedback'}); }, true); }
        feedbackWired=true; hit++;
      }
    }
    // Share icon (the up-arrow-into-tray circle next to "View rep feedback").
    if(!shareWired){
      var shareBtn=document.querySelector('#dc-root div svg path[d^="M8 10V2.5"]');
      if(shareBtn){
        var btn=shareBtn.closest('div');
        if(btn){ btn.addEventListener('click', function(ev){ ev.stopPropagation(); post({type:'shareVideo'}); }, true); }
        shareWired=true; hit++;
      }
    }
    // "All sets" chip (top-right, grid icon + "All sets" text).
    if(!allSetsWired){
      var asLink=document.querySelector('#dc-root a[href="Form Review.dc.html"]');
      if(asLink){ asLink.addEventListener('click', function(ev){ ev.preventDefault(); post({type:'viewAllSets'}); }, true); allSetsWired=true; hit++; }
    }
    wireLiveDrag();
    // Recompute the bottom-fill strip every time real content actually
    // lands (this fires on the MutationObserver's re-apply calls too, not
    // just the fixed early timeouts inside dcScaleFitJs) — keeps it
    // correct even if something shifts the card's layout after the first
    // few hundred ms.
    if(window.__fpFillBottomGap) window.__fpFillBottomGap();
    var ok = hit>=3;
    if(ok && videoReady && !readyPosted){ readyPosted=true; post({type:'ready'}); }
    return ok;
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

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function RecapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);

  // BUG FOUND (item 3, "flashes then goes back to a grey screen"): the
  // strongest explanation for content showing then reverting is a SECOND
  // router.push to /rep-feedback firing right after the first — React
  // Navigation then has two instances of that route stacking, the first
  // (which had already shown real content) gets replaced/unmounted, and
  // the second starts from scratch (its own video-conversion effect
  // resets to the loading state) — which reads exactly as "flash, then
  // grey." The WebView's own click handler IS guarded against re-firing
  // (feedbackWired), but this guards the RECEIVING end too, which is more
  // robust regardless of why a second message might arrive — one tap can
  // only ever trigger one push. Reset when this screen regains focus
  // (i.e. the user came back from rep-feedback and might tap again).
  const navigatingToFeedback = useRef(false);
  useFocusEffect(
    useCallback(() => {
      navigatingToFeedback.current = false;
    }, [])
  );

  // DIAGNOSTIC — mount/unmount of the WHOLE RecapScreen (distinguishes "the
  // WebView remounted because its own key changed" from "the entire screen
  // got pushed/popped/remounted by navigation," which would show up here
  // as a second RecapScreen mount instead of just a WebView one).
  useEffect(() => {
    if (__DEV__) console.log('[recap-debug] RecapScreen MOUNTED');
    return () => { if (__DEV__) console.log('[recap-debug] RecapScreen UNMOUNTED'); };
  }, []);

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
  const [view, setView] = useState<'summary' | 'allsets' | 'ranks'>('summary');

  // The recorded clip's real file:// path resolved to a loopback http://
  // URL (see lib/localVideoServer.ts) — a <video> tag can load this
  // directly, unlike a bare file:// src which WKWebView's
  // allowingReadAccessToURL couldn't be made to actually permit (two
  // confirmed-correct attempts at the grant still failed; see that file's
  // header comment for the full history).
  const [videoHttpUrl, setVideoHttpUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!data?.videoUri) { setVideoHttpUrl(null); return; }
    (async () => {
      try {
        const url = await getLocalVideoHttpUrl(data.videoUri!);
        if (!cancelled) setVideoHttpUrl(url);
      } catch (err) {
        if (__DEV__) console.error('[recap] getLocalVideoHttpUrl failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [data?.videoUri]);

  // Reveal-gate for the summary screen only (the one with the reported
  // "grey -> wrong data at top -> slides into place" bug). Stays hidden
  // until workoutrecapInject's apply() confirms real data was actually
  // injected (posts {type:'ready'}), so the WebView never shows the
  // artboard's own placeholder numbers mid-load. Backstop timeout is a
  // safety net in case the 'ready' message never arrives. allsets/ranks
  // are untouched — they don't have this reported bug, so no gating.
  const [webReady, setWebReady] = useState(false);
  useEffect(() => {
    setWebReady(false);
    const backstop = setTimeout(() => setWebReady(true), 2500);
    return () => clearTimeout(backstop);
  }, [view]);

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

  const summaryInjectJs = useMemo(() => {
    if (!data) return null;
    return workoutrecapInject({
      totalReps: data.totalReps, moves: data.entries.length, pct: data.pct,
      hasFormData: data.hasFormData, durationSec: data.durationSec,
      overview: generateSummary(data.totalReps, data.totalGoodReps, data.hasFormData),
      hasVideo, videoUri: videoHttpUrl ?? undefined,
    });
  }, [data, hasVideo, videoHttpUrl]);

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
    streak: number; muscleCount: number; hits: { muscle: Muscle; name: string; reps: number }[];
  } | null>(null);
  // Real per-muscle icon for each hit chip, resolved once rankData is set
  // (see the effect right after it) — bronze tier specifically, since both
  // hits are by definition muscles trained THIS session (explicit ask:
  // "muscles that were just trained in this workout get a bronze
  // highlight"). Replaces the old behavior of hiding the chip's icon
  // entirely whenever the muscle wasn't Quads/Glutes (the only 2 the
  // artboard's own baked-in icon manifest has art for) — this resolves
  // the REAL per-muscle PNG (components/MuscleTierMap.tsx's
  // MUSCLE_ICON_SOURCES, already correct/verified for all but 3 muscles)
  // to a base64 data: URI and embeds it directly, so every label shows
  // its own real muscle, not a placeholder or nothing.
  const [hitIconUris, setHitIconUris] = useState<(string | null)[]>([]);
  useEffect(() => {
    if (!rankData || rankData.hits.length === 0) { setHitIconUris([]); return; }
    let cancelled = false;
    (async () => {
      const uris = await Promise.all(rankData.hits.map(async (h) => {
        const src = MUSCLE_ICON_SOURCES[h.muscle]?.bronze;
        if (!src) return null; // Forearms/LowerBack/Calves have no Flaticon art yet
        try {
          // All MUSCLE_ICON_SOURCES entries are require()'d local PNGs,
          // which always resolve to a numeric module id — ImageSourcePropType
          // is a broader type (could also be {uri}) that Asset.fromModule's
          // own signature doesn't cover, hence the cast.
          const asset = Asset.fromModule(src as number);
          await asset.downloadAsync();
          const uri = asset.localUri || asset.uri;
          const base64 = await new File(uri).base64();
          return `data:image/png;base64,${base64}`;
        } catch (err) {
          if (__DEV__) console.error('[recap] muscle icon data-uri failed for', h.muscle, err);
          return null;
        }
      }));
      if (!cancelled) setHitIconUris(uris);
    })();
    return () => { cancelled = true; };
  }, [rankData]);
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
        .map(([m, reps]) => ({ muscle: m as Muscle, name: MUSCLE_LABELS[m as keyof typeof MUSCLE_LABELS], reps: Math.round(reps) }));

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
      hitIconUris,
    });
  }, [data, rankData, hitIconUris]);

  // ── Failure / loading states ────────────────────────────────────────────────

  if (loadFailed) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
      </View>
    );
  }

  if (!data || !summaryInjectJs || (hasVideo && !videoHttpUrl)) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
      </View>
    );
  }

  // 'ranks' falls back to 'summary' until rankData/its inject finish
  // computing (async) — never shows a view with nothing real injected yet.
  const effectiveView: 'summary' | 'allsets' | 'ranks' =
    view === 'allsets' && allSetsInjectJs ? 'allsets' :
    view === 'ranks'   && ranksInjectJs   ? 'ranks'   :
    'summary';

  const SOURCE_BY_VIEW = {
    summary: RECAP_HTML, allsets: ALL_SETS_HTML, ranks: MUSCLE_RANKS_HTML,
  } as const;
  const INJECT_BY_VIEW = {
    summary: summaryInjectJs, allsets: allSetsInjectJs, ranks: ranksInjectJs,
  } as const;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <WebView
        key={effectiveView}
        ref={webRef}
        source={SOURCE_BY_VIEW[effectiveView]}
        originWhitelist={['*']}
        style={effectiveView === 'summary' ? [styles.web, { opacity: webReady ? 1 : 0 }] : styles.web}
        injectedJavaScriptBeforeContentLoaded={DC_VIEWPORT_JS}
        injectedJavaScript={INJECT_BY_VIEW[effectiveView] ?? undefined}
        // DIAGNOSTIC LOGGING — explicit ask ("add console logs on every
        // mount, unmount, and navigation call... reproduce the path, find
        // the real cause"). I can't run a device myself, so this can't be
        // verified blind — rebuild, reproduce the viewRepFeedback flash/
        // grey/stuck sequence, and paste the Metro console output (every
        // line below is tagged [recap-debug]) back so the actual sequence
        // of mounts/messages can be read off it.
        onLoadStart={() => { if (__DEV__) console.log('[recap-debug] WebView onLoadStart, view=', effectiveView, 'key=', effectiveView); }}
        onLoadEnd={() => { if (__DEV__) console.log('[recap-debug] WebView onLoadEnd, view=', effectiveView); }}
        onError={(e) => { if (__DEV__) console.log('[recap-debug] WebView onError, view=', effectiveView, e.nativeEvent); }}
        onHttpError={(e) => { if (__DEV__) console.log('[recap-debug] WebView onHttpError, view=', effectiveView, e.nativeEvent); }}
        // Kept as a safety net regardless of how the video loads.
        onContentProcessDidTerminate={() => {
          if (__DEV__) console.log('[recap-debug] WebView onContentProcessDidTerminate, view=', effectiveView, '— reloading');
          webRef.current?.reload();
        }}
        onMessage={(e) => {
          let msg: InMsg;
          try { msg = JSON.parse(e.nativeEvent.data); } catch {
            if (__DEV__) console.log('[recap-debug] onMessage: unparseable data=', e.nativeEvent.data);
            return;
          }
          if (__DEV__) console.log('[recap-debug] onMessage:', msg.type, 'current view=', view, 'effectiveView=', effectiveView);
          if (msg.type === 'ready') setWebReady(true);
          else if (msg.type === 'videoDebug') { if (__DEV__) console.log('[recap-debug] video event:', msg.msg, msg.code); }
          else if (msg.type === 'back') void handleBack();
          else if (msg.type === 'share') void handleShare();
          else if (msg.type === 'shareVideo') void handleShareVideo();
          else if (msg.type === 'viewRepFeedback') {
            // Guard against a second push firing before this screen loses
            // focus (see navigatingToFeedback above) — one tap, one push.
            if (navigatingToFeedback.current) {
              if (__DEV__) console.log('[recap-debug] viewRepFeedback ignored — already navigating');
              return;
            }
            navigatingToFeedback.current = true;
            if (__DEV__) console.log('[recap-debug] router.push(/rep-feedback)');
            router.push({
              pathname: '/rep-feedback',
              params: {
                exerciseName: data.entries[0]?.displayName ?? 'Exercise',
                videoUri: data.videoUri ?? '',
                repEvents: JSON.stringify(repEvents),
              },
            } as any);
          }
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
        // "card isn't flush with the bottom of the screen" — WKWebView's
        // default content-inset-adjustment inserts extra space at the
        // bottom to clear the home-indicator safe area, which would throw
        // off dcScaleFitJs's own "scale to exactly vh" math (the page
        // itself ends up shorter than the real screen regardless of what
        // the JS computes window.innerHeight as). Disabling it explicitly
        // is additive/safe — doesn't change anything else — so this is a
        // targeted guess at the one remaining bug, not a rebuild.
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
      />
      {/* Native fallback back button — completely independent of the
          WebView's own injected JS (which has no visibility into whether
          its own page actually finished loading/rendering). Explicit ask:
          "make sure there's always a working back button so the user can
          never get stuck." Summary has its own real back/exit flow, and
          'ranks' ALSO already has its own real, working back button
          (muscleRanksInject's backWired) — showing this one too on that
          screen specifically was a visible literal duplicate ("two back
          buttons"), not a safety net. */}
      {effectiveView !== 'summary' && effectiveView !== 'ranks' && (
        <TouchableOpacity
          onPress={() => setView('summary')}
          hitSlop={12}
          style={[styles.fallbackBack, { top: insets.top + 12 }]}
        >
          <SymbolView name="chevron.left" size={16} tintColor="#ffffff" type="monochrome" style={{ width: 16, height: 16 }} />
        </TouchableOpacity>
      )}
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
