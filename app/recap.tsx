/**
 * app/recap.tsx
 *
 * Every screen in this flow is NATIVE now — WorkoutSummarySheet,
 * RepFeedbackScreen, AllSetsScreen, MuscleRanksScreen, all further down.
 * No WebView left in this file at all. Summary gets a full-screen
 * expo-video replay + a hand-rolled spring-physics bottom sheet; rep
 * feedback gets a nativeControls AVPlayerViewController. Explicit ask
 * after repeated WebView bugs ("laggy, the drag has no feel. They're
 * WebViews, which is the root problem") — rebuilt from scratch rather
 * than patched again. The 4 real Claude-Design artboards this used to
 * render directly (workoutrecap.html, repfeedback.html,
 * allsetsfullworkout.html, muscleranks.html) are no longer loaded here —
 * each native component's layout/copy was matched to its artboard by eye,
 * not pixel-measured, so flag anything that reads visually off.
 *
 * `view` toggles which native component is shown; each one calls the same
 * handlers (`onViewAllSets`, `onDone`, etc.) the old postMessage channel
 * used to carry.
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
  View, Text, StyleSheet, Share, TouchableOpacity, Animated, PanResponder, Dimensions, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
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

// ─── AllSetsScreen — native grid of every exercise/set completed ───────────
// Replaces allSetsInject/allsetsfullworkout.html's WebView. No video
// thumbnails (see the file's original top-doc note: no reliable per-
// exercise video in workout mode, and solo/history mode only ever has ONE
// entry anyway) — plain dark cards with the real name + rep/form stats,
// one tappable through to rep feedback when a real clip exists for it.
function AllSetsScreen({
  tiles, videoTileIndex, onClose, onViewRepFeedback, insets,
}: {
  tiles: { title: string; meta: string }[];
  videoTileIndex: number | null;
  onClose: () => void;
  onViewRepFeedback: () => void;
  insets: { top: number; bottom: number };
}) {
  return (
    <View style={[allSetsStyles.root, { paddingTop: insets.top }]}>
      <View style={allSetsStyles.header}>
        <TouchableOpacity onPress={onClose} hitSlop={12} style={sheetStyles.topBtn}>
          <SymbolView name="chevron.left" size={16} tintColor="#ffffff" type="monochrome" style={{ width: 16, height: 16 }} />
        </TouchableOpacity>
        <Text style={allSetsStyles.title}>All sets</Text>
        <View style={{ width: 34 }} />
      </View>
      <ScrollView contentContainerStyle={[allSetsStyles.grid, { paddingBottom: insets.bottom + 24 }]}>
        {tiles.map((t, i) => {
          const clickable = i === videoTileIndex;
          const Wrap = clickable ? TouchableOpacity : View;
          return (
            <Wrap key={i} style={allSetsStyles.tile} activeOpacity={0.85} {...(clickable ? { onPress: onViewRepFeedback } : {})}>
              <View style={allSetsStyles.tileLabel}>
                <Text style={allSetsStyles.tileTitle} numberOfLines={1}>{t.title}</Text>
                <Text style={allSetsStyles.tileMeta}>{t.meta}</Text>
              </View>
            </Wrap>
          );
        })}
      </ScrollView>
    </View>
  );
}

const allSetsStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111114' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  title: { fontFamily: PJS.bold, fontSize: 16, color: '#ffffff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 12 },
  tile: {
    width: (SCREEN_W - 32 - 12) / 2, height: 150, borderRadius: 22, overflow: 'hidden',
    backgroundColor: '#2c2c32', justifyContent: 'flex-end',
  },
  tileLabel: { padding: 12 },
  tileTitle: { fontFamily: PJS.bold, fontSize: 15.5, color: '#ffffff' },
  tileMeta: { fontFamily: PJS.medium, fontSize: 11.5, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
});

// ─── MuscleRanksScreen — native "today's progress" screen ──────────────────
// Replaces muscleRanksInject/muscleranks.html's WebView. Real standing
// before vs. after this session, real streak, real top-2 muscles worked —
// this app doesn't track lbs-lifted or PRs (bodyweight/rep-based, no such
// data exists), so those 2 stat slots are honestly relabeled Reps/Moves
// rather than fabricated (same policy the WebView version used).
function MuscleRanksScreen({
  rankName, nextRank, beforePct, afterPct, streak, totalReps, moves, muscleCount, hits, note,
  onBack, onShare, onDone, insets,
}: {
  rankName: string; nextRank: string; beforePct: number; afterPct: number;
  streak: number; totalReps: number; moves: number; muscleCount: number;
  hits: { name: string; reps: number }[]; note: string;
  onBack: () => void; onShare: () => void; onDone: () => void;
  insets: { top: number; bottom: number };
}) {
  const fillAnim = useRef(new Animated.Value(beforePct)).current;
  useEffect(() => {
    Animated.timing(fillAnim, { toValue: afterPct, duration: 1100, useNativeDriver: false }).start();
  }, [afterPct]); // eslint-disable-line react-hooks/exhaustive-deps
  const fillWidth = fillAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp' });

  return (
    <View style={[ranksStyles.root, { paddingTop: insets.top }]}>
      <View style={ranksStyles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={12} style={ranksStyles.headerBtn}>
          <SymbolView name="chevron.left" size={16} tintColor="#1a1a1c" type="monochrome" style={{ width: 16, height: 16 }} />
        </TouchableOpacity>
        <Text style={ranksStyles.headerTitle}>Today's progress</Text>
        <TouchableOpacity onPress={onShare} hitSlop={12} style={ranksStyles.headerBtn}>
          <SymbolView name="square.and.arrow.up" size={15} tintColor="#1a1a1c" type="monochrome" style={{ width: 15, height: 15 }} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8 }}>
        <View style={ranksStyles.rankRow}>
          <Text style={ranksStyles.rankName}>{rankName}</Text>
          <Text style={ranksStyles.nextRank}>{nextRank}</Text>
        </View>
        <View style={ranksStyles.track}>
          <Animated.View style={[ranksStyles.fill, { width: fillWidth }]} />
        </View>

        {hits.length > 0 && (
          <View style={ranksStyles.chipRow}>
            {hits.map((h, i) => (
              <View key={i} style={ranksStyles.chip}>
                <Text style={ranksStyles.chipName}>{h.name}</Text>
                <Text style={ranksStyles.chipReps}>+{h.reps}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={ranksStyles.statGrid}>
          <StatBox label="Muscles" value={String(muscleCount)} />
          <StatBox label="Reps" value={String(totalReps)} />
          <StatBox label="Moves" value={String(moves)} />
          <StatBox label="Streak" value={String(streak)} />
        </View>

        <Text style={ranksStyles.note}>{note}</Text>
      </ScrollView>

      <View style={[ranksStyles.btnWrap, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={ranksStyles.doneBtn} activeOpacity={0.85} onPress={onDone}>
          <Text style={ranksStyles.doneBtnTxt}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={ranksStyles.statBox}>
      <Text style={ranksStyles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={ranksStyles.statLabel}>{label}</Text>
    </View>
  );
}

const ranksStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f2f2f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  headerBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.05)' },
  headerTitle: { fontFamily: PJS.bold, fontSize: 16, color: '#1a1a1c' },
  rankRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 },
  rankName: { fontFamily: PJS.extrabold, fontSize: 22, color: '#1a1a1c', letterSpacing: -0.4 },
  nextRank: { fontFamily: PJS.medium, fontSize: 13, color: '#8a8a8e' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#e4e4ea', marginTop: 10, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: '#2E7DFF' },
  chipRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  chip: { flex: 1, backgroundColor: '#ffffff', borderRadius: 16, padding: 14 },
  chipName: { fontFamily: PJS.bold, fontSize: 14, color: '#1a1a1c' },
  chipReps: { fontFamily: PJS.semibold, fontSize: 12, color: '#30D158', marginTop: 4 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  statBox: { width: '47%', backgroundColor: '#ffffff', borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  statValue: { fontFamily: PJS.extrabold, fontSize: 19, color: '#1a1a1c' },
  statLabel: { fontFamily: PJS.medium, fontSize: 11, color: '#8a8a8e', marginTop: 2 },
  note: { fontFamily: PJS.medium, fontSize: 14, lineHeight: 20, color: '#4a4a4e', marginTop: 20, marginBottom: 12 },
  btnWrap: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: '#f2f2f5' },
  doneBtn: { height: 54, borderRadius: 27, backgroundColor: '#1a1a1c', alignItems: 'center', justifyContent: 'center' },
  doneBtnTxt: { fontFamily: PJS.bold, fontSize: 16, color: '#ffffff' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function RecapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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

  // 'ranks' falls back to 'summary' until rankData finishes computing
  // (async) — never shows a view with nothing real to show yet. 'feedback'
  // is gated on hasVideo alone, matching the condition the summary
  // sheet's own button uses to decide whether it's even shown.
  const effectiveView: 'summary' | 'feedback' | 'allsets' | 'ranks' =
    view === 'feedback' && hasVideo  ? 'feedback' :
    view === 'allsets'               ? 'allsets'  :
    view === 'ranks'    && rankData  ? 'ranks'    :
    'summary';

  // Every view is native now — WorkoutSummarySheet / RepFeedbackScreen /
  // AllSetsScreen / MuscleRanksScreen, all above. No WebView left in this
  // screen at all.
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

  if (effectiveView === 'allsets') {
    const tiles = data.entries.map(e => ({
      title: e.displayName,
      meta: e.formChecked !== false
        ? `${e.reps} reps · ${e.reps > 0 ? Math.round((e.goodReps / e.reps) * 100) : 0}% form`
        : `${e.reps} reps`,
    }));
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <AllSetsScreen
          tiles={tiles}
          videoTileIndex={hasVideo && data.entries.length > 0 ? 0 : null}
          onClose={() => setView('summary')}
          onViewRepFeedback={() => setView('feedback')}
          insets={insets}
        />
      </View>
    );
  }

  // effectiveView === 'ranks' (rankData is non-null here, narrowed above)
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <MuscleRanksScreen
        {...rankData!}
        totalReps={data.totalReps}
        moves={data.entries.length}
        note={generateSummary(data.totalReps, data.totalGoodReps, data.hasFormData)}
        onBack={() => setView('summary')}
        onShare={() => void handleShareVideo()}
        onDone={() => void handleDoneRanks()}
        insets={insets}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111114' },
});
