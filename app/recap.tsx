/**
 * app/recap.tsx
 *
 * Renders the REAL Claude-Design artboards (assets/app screens/
 * workoutrecap.html for the summary, repfeedback.html for the per-rep
 * drill-down) directly via WebView — not the earlier hand-rebuilt
 * workoutrecap-screen.html, and not a native recreation. `view` toggles
 * which of the two files is mounted in the same WebView (swapping
 * `source`, forced to remount via `key`); "View rep feedback" on the
 * summary screen posts {type:'viewRepFeedback'} to switch to the detail
 * view, whose own close/back controls post {type:'closeRepFeedback'} to
 * switch back — no real navigation, both live in this one screen.
 *
 * workoutrecap.html IS prop-driven (reps/sets/form/duration/overview) —
 * personalized via literal-text DOM injection matching its real defaults
 * (see workoutrecapInject). repfeedback.html is NOT — its dc-script never
 * reads this.props at all, 100% hardcoded demo data (a fake "Rows"
 * exercise, fixed fake rep text) — its real data goes in by replacing the
 * default demo ticks/text with real ones after mount instead, bypassing
 * the artboard's own internal rep-cycling logic (see repFeedbackInject).
 *
 * All the actual data logic is unchanged from before (still real, still
 * correct): the three-mode load effect (workout / history / solo-live),
 * repFeedbackText for the rep card's text, generateSummary for the
 * overview line, and the Share/Share Video/markWorkoutComplete handlers —
 * just triggered via postMessage from the WebView instead of a native
 * onPress.
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
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

// The real Claude-Design artboards, used directly via WebView — not the
// earlier hand-rebuilt workoutrecap-screen.html (that approach is being
// dropped in favor of using the exact files directly, same direction as
// the rest of this session's work). workoutrecap.html IS prop-driven (see
// workoutrecapInject); repfeedback.html is NOT — its dc-script never reads
// this.props at all, 100% hardcoded design-tool demo data (a fake "Rows"
// exercise, fixed fake rep text) — so its real data goes in entirely via
// DOM injection/replacement after mount instead (see repFeedbackInject).
const RECAP_HTML = require('../assets/app screens/workoutrecap.html');
const REP_FEEDBACK_HTML = require('../assets/app screens/repfeedback.html');
// Also 100% hardcoded demo data, no props channel — same DOM-replacement
// approach as repfeedback.html (see allSetsInject / muscleRanksInject).
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
  videoDataUri?:   string;
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

// The recorded clip lives in a different app directory than the bundled HTML
// the WebView loads, and in Expo dev builds that HTML is often served over
// Metro's HTTP server rather than a real file:// URL — in which case iOS's
// file-sandbox read-access props don't even apply, and a WebKit page loaded
// over HTTP can't pull in a local file:// video src regardless. Embedding
// the clip as a data: URI sidesteps all of that: the <video> tag's src is
// self-contained in the injected JS, no external file access required no
// matter how the page itself was loaded. Recorded clips are short single-
// exercise takes, so the base64 size is acceptable.
async function videoToDataUrl(uri: string): Promise<string | undefined> {
  try {
    const base64 = await new File(uri).base64();
    return `data:video/quicktime;base64,${base64}`;
  } catch (err) {
    // Logged, not swallowed silently — "video not playing" has been hard to
    // pin down over several rounds; if base64 conversion itself is the
    // failure point, this is how the next test actually proves it instead
    // of guessing a fifth fix blind.
    if (__DEV__) console.error('[recap] videoToDataUrl failed for', uri, err);
    return undefined;
  }
}

// Both artboards are FIXED 390x844 canvases (raw Claude-Design exports,
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

// ─── workoutrecap.html — the main recap screen ─────────────────────────────
// Prop-driven (reps/sets/form/duration/overview/title), defaults matched
// from its real dc-script. "Sets" is relabeled "Moves" — this app tracks
// distinct exercises completed, not literal weightlifting sets, and the
// artboard's 4-cell stat grid has no spare slot for a 5th metric.
function workoutrecapInject(opts: {
  totalReps: number; moves: number; pct: number; hasFormData: boolean;
  durationSec?: number; overview: string; hasVideo: boolean; videoDataUri?: string;
}): string {
  const { totalReps, moves, pct, hasFormData, durationSec, overview, hasVideo, videoDataUri } = opts;
  const formValue = hasFormData && totalReps > 0 ? `${pct}%` : '\u2014';
  const formLabel = hasFormData ? 'Form' : 'Form n/a';
  const durationValue = durationSec != null ? formatDuration(durationSec) : '\u2014';
  const MAP: Record<string, string> = {
    '148': String(totalReps),
    '12': String(moves),
    '86%': formValue,
    '38:12': durationValue,
    'Sets': 'Moves',
    'Form': formLabel,
    'Push-up depth improved every set and squats stayed steady. Next time, slow the way down on pull-ups.': overview,
  };
  return dcScaleFitJs('#111114') + `
(function(){
  function post(m){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }catch(e){} }
  var MAP = ${JSON.stringify(MAP)};
  var HAS_VIDEO = ${JSON.stringify(hasVideo)};
  var VIDEO_SRC = ${JSON.stringify(videoDataUri ?? '')};
  var videoBuilt = false;
  var backWired=false, feedbackWired=false, shareWired=false, allSetsWired=false;
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
        videoEl.muted = false;
        videoEl.controls = false;
        videoEl.autoplay = true;
        videoEl.loop = true;
        videoEl.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        slot.parentElement && slot.parentElement.insertBefore(videoEl, slot);
        slot.style.display = 'none';
        videoBuilt = true;
        hit++;
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
    return hit>=3;
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

// ─── repfeedback.html — per-rep video review, opened from "View rep
// feedback" above. Its dc-script never reads this.props at all — 100%
// hardcoded demo data (a fake "Rows" exercise, 3 fixed fake rep
// sentences). The visual chrome (video area, scrubber track, nav buttons,
// feedback card) is real and worth using as-is; the DATA it's driven by
// is entirely fake, so this bypasses the artboard's own internal rep-
// cycling logic rather than fighting it: the default demo ticks are
// removed and replaced with one real tick per actual rep, each wired to
// show OUR OWN real what/fix text (from repFeedbackText) and seek the
// real video — the artboard's own go()/REPS/SETS machinery never runs.
function repFeedbackInject(opts: {
  exerciseName: string; videoDataUri?: string;
  reps: { timeSec: number; what: string }[];
}): string {
  const { exerciseName, videoDataUri, reps } = opts;
  return dcScaleFitJs('#0d0d10') + `
(function(){
  function post(m){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }catch(e){} }
  var REPS = ${JSON.stringify(reps)};
  var EX_NAME = ${JSON.stringify(exerciseName.toUpperCase())};
  var VIDEO_SRC = ${JSON.stringify(videoDataUri ?? '')};
  var idx = 0;
  var videoEl = null;
  var tagEl = null, bodyEl = null, exCapsEl = null;
  var trackEl = null, fillEl = null, thumbEl = null;
  var closeWired=false, allSetsWired=false, finishWired=false;
  var built = false;

  function show(i){
    // BUG FOUND: with REPS.length===0 (a real video but zero captured rep
    // events — possible now that this screen opens on hasVideo alone, not
    // hasVideo-and-reps), this indexed into REPS[0] (undefined) and threw
    // reading .what — an actual crash, not just a cosmetic empty state.
    if(REPS.length === 0){
      if(tagEl) tagEl.textContent = 'No reps recorded';
      if(bodyEl) bodyEl.textContent = 'This set didn\\'t capture any rep data.';
      if(fillEl) fillEl.style.setProperty('width', '0%', 'important');
      if(thumbEl) thumbEl.style.setProperty('left', '0%', 'important');
      return;
    }
    idx = Math.max(0, Math.min(REPS.length - 1, i));
    if(tagEl) tagEl.textContent = 'Rep ' + (idx + 1);
    if(bodyEl) bodyEl.textContent = REPS[idx].what;
    var pct = ((idx + 0.5) / REPS.length * 100).toFixed(1) + '%';
    if(fillEl) fillEl.style.setProperty('width', pct, 'important');
    if(thumbEl) thumbEl.style.setProperty('left', pct, 'important');
    if(videoEl && REPS[idx]) { try { videoEl.currentTime = REPS[idx].timeSec; } catch(e){} }
  }

  function build(){
    if(built) return true;
    // Video: the design uses a custom <image-slot> placeholder with no
    // real rendering of its own — replace it with a real <video>.
    var slot = document.getElementById('recap-replay');
    if(slot && VIDEO_SRC){
      videoEl = document.createElement('video');
      videoEl.src = VIDEO_SRC;
      videoEl.setAttribute('playsinline','');
      videoEl.muted = false;
      videoEl.controls = false;
      videoEl.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      slot.parentElement && slot.parentElement.insertBefore(videoEl, slot);
      slot.style.display = 'none';
    }

    // exCaps badge ("ROWS · SET 2" by default) -> real exercise name.
    var all = document.querySelectorAll('#dc-root div,#dc-root span');
    for(var i=0;i<all.length;i++){
      var el=all[i]; if(el.children.length) continue;
      var t=(el.textContent||'').trim();
      if(/\\u00b7/.test(t) && t===t.toUpperCase() && t.length<40){ exCapsEl=el; el.textContent=EX_NAME; break; }
    }

    // tag badge ("Rep 1") + body (feedback sentence, inline svg + text).
    var tagCands=document.querySelectorAll('#dc-root div[style*="border-radius: 7px"] span, #dc-root span');
    for(var j=0;j<tagCands.length;j++){
      var tt=(tagCands[j].textContent||'').trim();
      if(/^Rep \\d+$/i.test(tt) || /^Set \\d+ of \\d+$/i.test(tt)){ tagEl=tagCands[j]; break; }
    }
    var bodyCands=document.querySelectorAll('#dc-root div');
    for(var k=0;k<bodyCands.length;k++){
      if(bodyCands[k].querySelector && bodyCands[k].querySelector('svg') && bodyCands[k].children.length===1 && (bodyCands[k].textContent||'').trim().length>10){
        bodyEl=bodyCands[k]; break;
      }
    }

    // Scrubber track: the relative-positioned flex-1 30px-tall container
    // holding the grey background bar, the white fill bar and the round
    // thumb (left-to-right in its own children).
    var tracks=document.querySelectorAll('#dc-root div');
    for(var m=0;m<tracks.length;m++){
      var cs=tracks[m].style;
      if(cs && cs.position==='relative' && cs.flex==='1' && cs.height==='30px'){ trackEl=tracks[m]; break; }
    }
    if(trackEl){
      var kids=trackEl.children;
      if(kids.length>=3){ fillEl=kids[1]; thumbEl=kids[2]; }
      // Remove the default demo ticks (sc-for rendered <div> rows between
      // the background bar and the thumb) and lay down one per real rep.
      for(var r=trackEl.children.length-1; r>=3; r--){ trackEl.removeChild(trackEl.children[r]); }
      REPS.forEach(function(rep, i){
        var tick=document.createElement('div');
        var leftPct=((i+0.5)/REPS.length*100).toFixed(2)+'%';
        tick.style.cssText='position:absolute;left:'+leftPct+';top:0;bottom:0;width:16px;margin-left:-8px;cursor:pointer;';
        tick.addEventListener('click', function(ii){ return function(ev){ ev.stopPropagation(); show(ii); }; }(i), true);
        trackEl.appendChild(tick);
      });
    }

    built = (tagEl||bodyEl||trackEl) ? true : false;
    return built;
  }

  function wireNav(){
    var hit=0;
    // prev/next circles — identified by their chevron path shape.
    var prevEl=document.querySelector('#dc-root div svg path[d="M10 3 5 8l5 5"]');
    if(prevEl){ var pbtn=prevEl.closest('div'); if(pbtn && !pbtn.__wired){ pbtn.__wired=true; pbtn.addEventListener('click', function(ev){ ev.stopPropagation(); show(idx-1); }, true); hit++; } }
    var nextEl=document.querySelector('#dc-root div svg path[d="M6 3l5 5-5 5"]');
    if(nextEl){ var nbtn=nextEl.closest('div'); if(nbtn && !nbtn.__wired){ nbtn.__wired=true; nbtn.addEventListener('click', function(ev){ ev.stopPropagation(); show(idx+1); }, true); hit++; } }
    if(!closeWired){
      var closeEl=document.querySelector('#dc-root div svg path[d="M2.5 2.5l9 9M11.5 2.5l-9 9"]');
      if(closeEl){ var cbtn=closeEl.closest('div'); if(cbtn){ cbtn.addEventListener('click', function(ev){ ev.stopPropagation(); post({type:'closeRepFeedback'}); }, true); closeWired=true; hit++; } }
    }
    if(!allSetsWired){
      var allSets=document.querySelector('#dc-root a[href="Form Review.dc.html"]');
      if(allSets){ allSets.addEventListener('click', function(ev){ ev.preventDefault(); post({type:'viewAllSets'}); }, true); allSetsWired=true; hit++; }
    }
    if(!finishWired){
      var all=document.querySelectorAll('#dc-root div');
      for(var i=0;i<all.length;i++){
        var el=all[i]; if(el.children.length) continue;
        if((el.textContent||'').trim()==='Finish review'){
          el.addEventListener('click', function(ev){ ev.stopPropagation(); post({type:'closeRepFeedback'}); }, true);
          finishWired=true; hit++; break;
        }
      }
    }
    return hit;
  }

  function apply(){
    var ok = build();
    wireNav();
    if(ok) show(0);
    return ok;
  }
  if(!apply()) [200,500,1000,2000,3500,5000].forEach(function(d){ setTimeout(apply,d); });
  var root = document.getElementById('dc-root') || document.body;
  var mo = new MutationObserver(function(){ wireNav(); });
  mo.observe(root, { childList: true, subtree: true, characterData: true });
})();
true;
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
        const historyVideoDataUri = historyVideoUri ? await videoToDataUrl(historyVideoUri) : undefined;
        setData({
          ts: group.ts, entries: group.entries,
          totalReps: group.totalReps, totalGoodReps: group.totalGoodReps,
          pct: group.pct, isHistory: true,
          hasFormData: group.entries.some(e => e.formChecked !== false),
          videoUri: historyVideoUri ?? undefined,
          videoDataUri: historyVideoDataUri,
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
        const soloVideoDataUri = soloVideoUri ? await videoToDataUrl(soloVideoUri) : undefined;
        setData({
          ts: soloTs, entries: reps > 0 ? [entry] : [],
          totalReps: reps, totalGoodReps: goodReps, pct, formChecked,
          hasFormData: formChecked,
          videoUri: soloVideoUri,
          videoDataUri: soloVideoDataUri,
          repEvents: formChecked ? repEventsParam : [],
          isHistory: false,
          durationSec: parsedDuration != null && !isNaN(parsedDuration) ? parsedDuration : undefined,
        });
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasVideo = !!data?.videoDataUri;

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
      hasVideo, videoDataUri: data.videoDataUri,
    });
  }, [data, hasVideo]);

  const feedbackInjectJs = useMemo(() => {
    // Gated on hasVideo alone — matching the SAME condition
    // workoutrecapInject uses to decide whether "View rep feedback" is
    // even visible. These had drifted apart (this used to also require
    // repEvents.length > 0): a real video with zero captured rep events
    // left the button visible but tapping it silently did nothing
    // (effectiveView fell back to 'summary' with no feedback inject to
    // show) — not what caused the reported crash, but a real bug either
    // way. Now it always opens when the button is visible, just with
    // zero ticks on the scrubber if there's genuinely no rep data.
    if (!data || !hasVideo) return null;
    return repFeedbackInject({
      exerciseName: data.entries[0]?.displayName ?? 'Exercise',
      videoDataUri: data.videoDataUri,
      reps: repEvents,
    });
  }, [data, repEvents]);

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

  if (!data || !summaryInjectJs) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
      </View>
    );
  }

  // 'ranks' falls back to 'summary' until rankData/its inject finish
  // computing (async) — never shows a view with nothing real injected yet.
  const effectiveView: 'summary' | 'feedback' | 'allsets' | 'ranks' =
    view === 'feedback' && feedbackInjectJs ? 'feedback' :
    view === 'allsets'  && allSetsInjectJs  ? 'allsets'  :
    view === 'ranks'    && ranksInjectJs    ? 'ranks'    :
    'summary';

  const SOURCE_BY_VIEW = {
    summary: RECAP_HTML, feedback: REP_FEEDBACK_HTML, allsets: ALL_SETS_HTML, ranks: MUSCLE_RANKS_HTML,
  } as const;
  const INJECT_BY_VIEW = {
    summary: summaryInjectJs, feedback: feedbackInjectJs, allsets: allSetsInjectJs, ranks: ranksInjectJs,
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
          never get stuck." Only shown on the 3 non-summary views — the
          summary screen already has its own real back/exit flow. */}
      {effectiveView !== 'summary' && (
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
