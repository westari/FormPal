import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, Pressable, ScrollView, Share, Platform, Easing,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Defs, LinearGradient as SvgLinearGradient, RadialGradient, Stop, Rect, Ellipse,
} from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GlassButton from '../components/GlassButton';
import RepFeedback from '../components/RepFeedback';
import {
  ATHLTCameraView,
  startSession,
  stopSession,
  startTracking,
  stopTracking,
  flipCamera,
  setDiagnosticMode,
  setExercise,
  setExerciseDefinition,
  setExerciseStandard,
  addRepListener,
  addDebugStatsListener,
  addCameraStateListener,
  addErrorListener,
  addSetupStatusListener,
  addDebugLogListener,
  isNativeModuleLinked,
} from '../modules/athlt-camera/src/index';
import { EXERCISE_STANDARDS } from '../constants/exerciseStandards';
import { EXERCISE_DEFINITIONS } from '../constants/exerciseDefinitions';
import type { ExerciseId } from '../constants/exercises';
import { getCalibration, applyOverride } from '../lib/calibration/store';
import { handleRepAudio, playReadyCue } from '../lib/audioFeedback';
import { useAudioSettingsStore } from '../store/audioSettingsStore';
import type { DebugStatsEvent, RepEvent, ExerciseType } from '../modules/athlt-camera/src/index';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg:     '#0A0B0C',
  glass:  'rgba(21,22,26,0.82)',
  text:   '#F0F0F2',
  muted:  '#9A9AA2',
  dim:    '#62626A',
  good:   '#4ADE80',
  warn:   '#FB923C',
  border: 'rgba(255,255,255,0.08)',
};

// App display font — Bricolage Grotesque, loaded in app/_layout.tsx. The
// camera overlays were rendering in the bare system font, which read as
// off-brand next to the rest of the app.
const F = {
  regular: 'BricolageGrotesque_400Regular',
  bold:    'BricolageGrotesque_700Bold',
  extra:   'BricolageGrotesque_800ExtraBold',
};

const VIDEO_LOG_KEY = 'formpal_video_log';

async function logSessionVideo(uri: string) {
  try {
    const raw = await AsyncStorage.getItem(VIDEO_LOG_KEY);
    const log: { uri: string; ts: number }[] = raw ? JSON.parse(raw) : [];
    log.push({ uri, ts: Date.now() });
    await AsyncStorage.setItem(VIDEO_LOG_KEY, JSON.stringify(log));
  } catch {}
}

// Record<ExerciseId, ...> — every catalog exercise required, checked at
// compile time. A missing entry here was the LITERAL mechanism of the
// squat fallback (see exerciseType below: `exercise in SETUP_INFO ? exercise
// : 'squat'`) — now impossible to ship without an entry for every exercise.
const SETUP_INFO: Record<ExerciseId, { icon: string; title: string; sub: string }> = {
  // Side-view exercises
  squat:               { icon: 'arrow.left.and.right', title: 'Stand sideways',                   sub: 'Full body in frame — ankle to shoulder' },
  lunge:               { icon: 'arrow.left.and.right', title: 'Stand sideways',                   sub: 'Full body in frame — ankle to shoulder' },
  gobletSquat:         { icon: 'arrow.left.and.right', title: 'Stand sideways',                   sub: 'Full body in frame — ankle to shoulder' },
  airSquat:            { icon: 'arrow.left.and.right', title: 'Stand sideways',                   sub: 'Full body in frame — ankle to shoulder' },
  frontSquat:          { icon: 'arrow.left.and.right', title: 'Stand sideways',                   sub: 'Full body in frame — ankle to shoulder' },
  backSquat:           { icon: 'arrow.left.and.right', title: 'Stand sideways',                   sub: 'Full body in frame — ankle to shoulder' },
  sumoSquat:           { icon: 'arrow.left.and.right', title: 'Stand sideways',                   sub: 'Full body in frame — ankle to shoulder' },
  splitSquat:          { icon: 'arrow.left.and.right', title: 'Stand sideways',                   sub: 'Full body in frame — ankle to shoulder' },
  reverseLunge:        { icon: 'arrow.left.and.right', title: 'Stand sideways',                   sub: 'Full body in frame — ankle to shoulder' },
  stepUp:              { icon: 'arrow.left.and.right', title: 'Stand sideways',                   sub: 'Full body and box in frame' },
  bulgarianSplitSquat: { icon: 'arrow.left.and.right', title: 'Stand sideways',                   sub: 'Full body and bench in frame' },
  // Phone-on-floor exercises (push-up family)
  pushup:              { icon: 'iphone', title: 'Phone on the floor, to your side',               sub: 'Get in position — full body in frame' },
  kneePushup:          { icon: 'iphone', title: 'Phone on the floor, to your side',               sub: 'Get in position — knees and hands in frame' },
  inclinePushup:       { icon: 'iphone', title: 'Phone on the floor, to your side',               sub: 'Get in position — shoulders and hands in frame' },
  widePushup:          { icon: 'iphone', title: 'Phone on the floor, to your side',               sub: 'Get in position — full body in frame' },
  diamondPushup:       { icon: 'iphone', title: 'Phone on the floor, to your side',               sub: 'Get in position — full body in frame' },
  declinePushup:       { icon: 'iphone', title: 'Phone on the floor, to your side',               sub: 'Get in position — shoulders and hands in frame' },
  // Face-camera exercises (curl + shoulder press families)
  curl:                { icon: 'camera.fill', title: 'Face the camera',                           sub: 'Stand back — both arms and hands in view' },
  hammerCurl:          { icon: 'camera.fill', title: 'Face the camera',                           sub: 'Stand back — both arms and hands in view' },
  concentrationCurl:   { icon: 'camera.fill', title: 'Face the camera',                           sub: 'Working arm and elbow clearly visible' },
  preacherCurl:        { icon: 'camera.fill', title: 'Face the camera',                           sub: 'Both arms and elbows fully in frame' },
  reverseCurl:         { icon: 'camera.fill', title: 'Face the camera',                           sub: 'Stand back — both arms and hands in view' },
  cableCurl:           { icon: 'camera.fill', title: 'Face the cable machine',                    sub: 'Stand back — both arms and hands in view' },
  shoulderPress:         { icon: 'camera.fill', title: 'Face the camera',                         sub: 'Stand back — arms and shoulders in frame' },
  overheadPress:         { icon: 'camera.fill', title: 'Face the camera',                         sub: 'Stand back — arms and shoulders in frame' },
  arnoldPress:           { icon: 'camera.fill', title: 'Face the camera',                         sub: 'Stand back — arms and shoulders in frame' },
  dumbbellShoulderPress: { icon: 'camera.fill', title: 'Face the camera',                         sub: 'Stand back — arms and shoulders in frame' },
  machineShoulderPress:  { icon: 'camera.fill', title: 'Face the camera',                         sub: 'Stand back — arms and shoulders in frame' },
  // Chest press — unlike the squat/tricep/row side-camera families, this one
  // is normally done LYING DOWN (bench/floor dumbbell press), not standing;
  // the exerciseDefinitions.ts cameraSetup.setupInstruction already said
  // "Stand or lie sideways" — this copy just hadn't matched it, and reading
  // "Stand sideways" while lying on a bench is what prompted the complaint.
  chestPress:            { icon: 'arrow.left.and.right', title: 'Stand or lie sideways',           sub: 'Shoulder, elbow, and wrist in frame' },
  // Copy matched EXACTLY to exerciseDefinitions.ts's own setupInstruction
  // text (see the comment on chestPress just above — a mismatch here once
  // already caused a real complaint, "stand sideways" shown while the
  // person was actually lying on a bench).
  barbellBenchPress:     { icon: 'arrow.left.and.right', title: 'Lie on a bench, side-on',          sub: 'Shoulder, elbow, and wrist in frame' },
  jumpingJack:           { icon: 'camera.fill', title: 'Face the camera',                         sub: 'Full body in frame — arms and legs visible' },
  // Close-grip push-up (push-up family) — same as other push-up variants
  closegripPushup:          { icon: 'iphone', title: 'Phone on the floor, to your side',          sub: 'Get in position — shoulders and hands in frame' },
  // Tricep family — side-on camera
  tricepPushdown:           { icon: 'arrow.left.and.right', title: 'Stand sideways',              sub: 'Arms in frame — shoulder to wrist' },
  overheadTricepExtension:  { icon: 'arrow.left.and.right', title: 'Stand sideways',              sub: 'Arms fully above head in frame' },
  skullcrusher:             { icon: 'arrow.left.and.right', title: 'Set camera to your side',     sub: 'Lie flat on bench — arms in frame' },
  // Row family — all side-on camera
  bentOverRow:    { icon: 'arrow.left.and.right', title: 'Stand sideways',            sub: 'Hinge forward — shoulder to wrist in frame' },
  barbellRow:     { icon: 'arrow.left.and.right', title: 'Stand sideways',            sub: 'Hinge forward over bar — shoulder to wrist in frame' },
  singleArmRow:   { icon: 'arrow.left.and.right', title: 'Stand sideways',            sub: 'Working arm in frame — shoulder to wrist visible' },
  invertedRow:    { icon: 'arrow.left.and.right', title: 'Set camera to your side',   sub: 'Body straight under bar — arms clearly in frame' },
  tBarRow:        { icon: 'arrow.left.and.right', title: 'Stand sideways',            sub: 'Hinge forward over bar — shoulder to wrist in frame' },
  seatedCableRow: { icon: 'arrow.left.and.right', title: 'Sit sideways to camera',   sub: 'Hip and wrist both in frame — arm extended toward cable' },
  machineRow:     { icon: 'arrow.left.and.right', title: 'Sit sideways to camera',   sub: 'Hip and wrist both in frame — arm extended toward handles' },
  // Hip-hinge family — side-on camera, torso travel + hip movement both visible
  romanianDeadlift: { icon: 'arrow.left.and.right', title: 'Stand sideways', sub: 'Full body in frame — hips and shoulders visible' },
  deadlift:         { icon: 'arrow.left.and.right', title: 'Stand sideways', sub: 'Full body in frame — hips and shoulders visible' },
  goodMorning:      { icon: 'arrow.left.and.right', title: 'Stand sideways', sub: 'Full body in frame — hips and shoulders visible' },
  kettlebellSwing:  { icon: 'arrow.left.and.right', title: 'Stand sideways', sub: 'Full body in frame — hips and shoulders visible' },
  singleLegRDL:     { icon: 'arrow.left.and.right', title: 'Stand sideways', sub: 'Full body in frame — hips and shoulders visible' },
  // Shoulder/arm isolation raise family
  lateralRaise: { icon: 'camera.fill', title: 'Face the camera', sub: 'Stand back — both arms and shoulders in view' },
  frontRaise:   { icon: 'arrow.left.and.right', title: 'Stand sideways', sub: 'Full arm in frame — shoulder to wrist visible' },
  // Lat pulldown — back-to-camera, seated (CHANGED this round — was
  // front-facing; see constants/exerciseDefinitions.ts's latPulldownVariant()
  // for the full orientation investigation). Grip variants removed — one
  // exercise only.
  latPulldown: { icon: 'camera.fill', title: 'Back to the camera', sub: 'Sit back — both arms in frame, overhead to shoulders' },
  // Standing glute kickback — side-on camera, standing (replaces the old
  // gluteBridge/hipThrust, which required lying down and never worked —
  // Apple Vision's body-pose model can't track a person lying down).
  standingGluteKickback: { icon: 'arrow.left.and.right', title: 'Stand sideways', sub: 'Hip, knee, and ankle in frame' },
  // Face pull — front-facing, both arms visible at once (no near/far-side
  // ambiguity, unlike every side-on pull family). Copy matched to
  // facePullVariant()'s own setupInstruction, same convention as chestPress/
  // barbellBenchPress above.
  facePull: { icon: 'camera.fill', title: 'Face the camera', sub: 'Stand back — both arms fully in frame' },
  // Cable pull-through — same side-on, standing camera copy as the rest of
  // the hip-hinge family (romanianDeadlift/deadlift/etc above).
  cablePullThrough: { icon: 'arrow.left.and.right', title: 'Stand sideways', sub: 'Full body in frame — hips and shoulders visible' },
  // Pull-up — front-facing, matches pullup's own cameraSetup.setupInstruction
  // in exerciseDefinitions.ts (shoulders/elbows/hips visible, hands don't
  // need to be — that's the whole point of the wrist-free metric).
  pullup: { icon: 'camera.fill', title: 'Face the camera', sub: "Shoulders, elbows, and hips in frame — hands don't need to be" },
  // Calf raise — side-on, matches its own setupInstruction. See that
  // exercise's own comment for the "may not be reliably trackable at all"
  // feasibility flag — this copy doesn't hide that from the setup screen,
  // it's just the standard side-on instruction the metric itself needs.
  calfRaise: { icon: 'arrow.left.and.right', title: 'Stand sideways', sub: 'Knees and ankles in frame' },
  // Leg curl (machine) — side-on, matches its own setupInstruction.
  legCurl: { icon: 'arrow.left.and.right', title: 'Set camera to your side', sub: 'Hip, knee, and ankle in frame' },
  // Crunch — lying down, side-on. Matches its own setupInstruction; see
  // that exercise's comment for the confirmed on-device
  // lying-pose-detection risk this shares with the removed gluteBridge.
  crunch: { icon: 'arrow.left.and.right', title: 'Lie on your back, phone to your side', sub: 'Back up so your whole body is well inside the frame' },
};

// ─── Positioning-guide box orientation ───────────────────────────────────────
// The exercise definition's `guideBox` ('standing' | 'floor') is the override;
// this set is the practical default for the floor/horizontal exercises that
// don't set it. Anything not here and without a definition value → 'standing'.
const FLOOR_GUIDE = new Set<string>([
  'pushup', 'kneePushup', 'inclinePushup', 'widePushup', 'diamondPushup',
  'declinePushup', 'closegripPushup', 'crunch', 'skullcrusher', 'barbellBenchPress',
]);

function guideBoxFor(id: string): 'standing' | 'floor' {
  return (EXERCISE_DEFINITIONS as Record<string, { guideBox?: 'standing' | 'floor' }>)[id]?.guideBox
    ?? (FLOOR_GUIDE.has(id) ? 'floor' : 'standing');
}

// ─── Liquid Glass panel ─────────────────────────────────────────────────────
// Apple's Liquid Glass (iOS 26) is a THIN, mostly-clear material: you see the
// content behind it, softened — the "glass" read comes from the EDGE, not a
// heavy frost. So: expo-blur's real `systemThinMaterialDark` (the same UIKit
// material Apple's own menus use), only a whisper of dark scrim for white-text
// legibility over a bright camera, a bright specular highlight along the top
// edge, a crisp light rim, a continuous (squircle) corner curve, and a soft
// wide drop shadow to float it. No dark slab fill — that reads as a card, not
// glass.
function GlassPanel({ children, style, radius = 28 }: {
  children?: React.ReactNode;
  style?: any;
  radius?: number;
}) {
  return (
    <View style={[gp.shadow, { borderRadius: radius, borderCurve: 'continuous' }, style]}>
      <BlurView
        intensity={28}
        tint="systemThinMaterialDark"
        style={[gp.clip, { borderRadius: radius, borderCurve: 'continuous' }]}
      >
        {/* legibility scrim — a soft neutral grey wash, kept light so it still
            reads as glass, not a card */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(24,26,30,0.34)' }]} />
        {/* specular highlight raking across the top edge — the glass "tell" */}
        <LinearGradient
          colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']}
          locations={[0, 0.12, 0.5]}
          start={{ x: 0.1, y: 0 }} end={{ x: 0.6, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {children}
        {/* crisp light rim, a touch brighter along the top */}
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { borderRadius: radius, borderCurve: 'continuous', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' }]}
        />
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { borderRadius: radius, borderCurve: 'continuous', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.45)' }]}
        />
      </BlurView>
    </View>
  );
}
const gp = StyleSheet.create({
  shadow: { shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.38, shadowRadius: 34, elevation: 12 },
  clip:   { overflow: 'hidden' },
});

// ─── Liquid Glass frame ──────────────────────────────────────────────────────
// A thick beveled rounded-rect "glass tube" edge, same visual language as the
// RepFeedback orb's rim: a vertical bevel gradient (bright top → faint mid →
// dark bottom), a bright inner hairline, a dark outer hairline for depth, and
// a soft specular glint along the top edge. Drawn as an absolutely-positioned
// SVG overlay sized to its parent (pass measured w/h). `accent` tints the
// bevel (e.g. green when the guide box is locked on).
function LiquidFrame({
  w, h, radius, thickness, accent,
}: { w: number; h: number; radius: number; thickness: number; accent?: string }) {
  if (w <= 0 || h <= 0) return null;
  const T   = thickness;
  const hi  = accent ?? '#ffffff';
  const rID = `lf${Math.round(radius)}_${Math.round(w)}x${Math.round(h)}`;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id={`${rID}-bevel`} x1="0" y1="0" x2="0.12" y2="1">
          <Stop offset="0"    stopColor={hi}      stopOpacity="1" />
          <Stop offset="0.36" stopColor={hi}      stopOpacity="0.34" />
          <Stop offset="0.7"  stopColor={hi}      stopOpacity="0.14" />
          <Stop offset="1"    stopColor="#000000" stopOpacity="0.52" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${rID}-inner`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"   stopColor="#ffffff" stopOpacity="0.92" />
          <Stop offset="0.45" stopColor="#ffffff" stopOpacity="0.06" />
          <Stop offset="1"   stopColor="#ffffff" stopOpacity="0" />
        </SvgLinearGradient>
        <RadialGradient id={`${rID}-glint`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* faint outer dark line — separates the frame from the scene */}
      <Rect x={0.75} y={0.75} width={w - 1.5} height={h - 1.5} rx={radius} ry={radius}
        fill="none" stroke="#000000" strokeOpacity="0.35" strokeWidth={1.25} />

      {/* thick beveled body */}
      <Rect x={T / 2} y={T / 2} width={w - T} height={h - T}
        rx={Math.max(radius - T / 2, 4)} ry={Math.max(radius - T / 2, 4)}
        fill="none" stroke={`url(#${rID}-bevel)`} strokeWidth={T} />

      {/* bright inner hairline riding just inside the bevel */}
      <Rect x={T - 1} y={T - 1} width={w - 2 * (T - 1)} height={h - 2 * (T - 1)}
        rx={Math.max(radius - T, 3)} ry={Math.max(radius - T, 3)}
        fill="none" stroke={`url(#${rID}-inner)`} strokeWidth={1.5} />

      {/* specular glint on the top edge */}
      <Ellipse cx={w * 0.3} cy={T * 0.62} rx={Math.min(w * 0.24, 100)} ry={T * 0.5}
        fill={`url(#${rID}-glint)`} />
    </Svg>
  );
}

// ─── Positioning-guide box overlay ───────────────────────────────────────────
// A thick Liquid Glass frame (see LiquidFrame) over a faint glass tint with a
// soft outer glow — same look as the RepFeedback orb's rim. Goes green
// (+ green glow) the instant SETUP's joint check passes, then stays through
// the set. Sized generously (legs / full standing body fit inside). Purely
// visual — doesn't hit-test joints (that's native).
function PositioningGuide({
  box, ready, children,
}: { box: 'standing' | 'floor'; ready: boolean; children?: React.ReactNode }) {
  const rect = box === 'floor'
    ? { top: '33%', bottom: '5%',  side: '4%'  }
    : { top: '16%', bottom: '7%',  side: '9%'  };
  const R = 36;

  const [size, setSize] = useState({ w: 0, h: 0 });

  // Subtle breathe while waiting (0.86 -> 1); locks solid on ready.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (ready) { pulse.stopAnimation(); pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.86, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [ready, pulse]);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Animated.View
        onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        style={{
          position: 'absolute',
          top: rect.top as any, bottom: rect.bottom as any,
          left: rect.side as any, right: rect.side as any,
          borderRadius: R, borderCurve: 'continuous',
          backgroundColor: ready ? 'rgba(50,215,75,0.07)' : 'rgba(255,255,255,0.025)',
          opacity: pulse,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: ready ? C.good : '#000',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: ready ? 0.95 : 0.5,
          shadowRadius: ready ? 26 : 18,
          elevation: 8,
        }}
      >
        <LiquidFrame w={size.w} h={size.h} radius={R} thickness={8} accent={ready ? '#8affb0' : undefined} />
        {children}
      </Animated.View>
    </View>
  );
}

// ─── Rep counter — bare number + label, no frame ─────────────────────────────
// repCounterOnly: this exercise's form isn't judged (see exerciseDefinitions
// `mode`), so show a neutral "REP COUNTER" tag instead of a good-rep count.
function RepCounter({ reps, goodReps, repCounterOnly }: { reps: number; goodReps: number; repCounterOnly: boolean }) {
  return (
    <View style={s.repBlock} pointerEvents="none">
      <Text style={s.repNum}>{reps}</Text>
      {repCounterOnly ? (
        <Text style={s.repCounterTag}>REP COUNTER · FORM NOT SCORED</Text>
      ) : (
        <View style={s.repSubRow}>
          <View style={s.repDot} />
          <Text style={s.repSub}>{goodReps} good</Text>
        </View>
      )}
    </View>
  );
}

// ─── Debug log panel — set false to hide without removing code ────────────────
const DEBUG_LOG_ENABLED = true;

// ─── Phase type ───────────────────────────────────────────────────────────────
type Phase = 'idle' | 'starting' | 'setup' | 'setup-done' | 'tracking' | 'stopping' | 'review';

// ─── Rep summary parsed from [REP] log lines ─────────────────────────────────
// Format: [REP] #N top=X.X bottom=Y.Y swing=Z.Z ROM=ok/short cue=CUE [ | key=val ...]
// The optional " | key=val ..." suffix carries raw form check values. Parse cue from the
// main section only (before the pipe) so `cue === 'GOOD'` comparison works correctly.
type RepSummary = { num: number; good: boolean; peak: string; cue: string };

function parseRepSummaries(lines: string[]): RepSummary[] {
  const result: RepSummary[] = [];
  for (const line of lines) {
    const pipeIdx = line.indexOf(' | ');
    const main = pipeIdx >= 0 ? line.slice(0, pipeIdx) : line;
    const m = main.match(/^\[REP\] #(\d+) .*?bottom=([-\d.]+) .*?cue=(.+)/);
    if (!m) continue;
    const cue = m[3].trim();
    result.push({ num: parseInt(m[1]), good: cue === 'GOOD', peak: m[2], cue });
  }
  return result;
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function FormCheckScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    exercise = 'squat',
    returnTo,
    workoutExerciseId,
  } = useLocalSearchParams<{
    exercise?:          string;
    returnTo?:          string;
    workoutExerciseId?: string;
  }>();
  const exerciseType = (exercise in SETUP_INFO ? exercise : 'squat') as ExerciseType;
  // 'repCounter' exercises: still count reps live, but no ✓/✗ coaching and no
  // form score reaches ranks/stats. See exerciseDefinitions.ts `mode`.
  const repCounterOnly = (EXERCISE_DEFINITIONS[exerciseType]?.mode ?? 'formCheck') === 'repCounter';

  const [phase,    setPhase]    = useState<Phase>('idle');
  const [error,    setError]    = useState<string | null>(null);
  const [stats,    setStats]    = useState<DebugStatsEvent | null>(null);
  const [reps,     setReps]     = useState(0);
  const [goodReps, setGoodReps] = useState(0);

  const [setupAllVisible,   setSetupAllVisible]   = useState(false);
  const [setupHoldProgress, setSetupHoldProgress] = useState(0);
  const [setupHint,         setSetupHint]         = useState('');

  const [feedback, setFeedback] = useState<{ good: boolean; reason: string; seq: number } | null>(null);
  const feedbackSeq    = useRef(0);
  const flashAnim      = useRef(new Animated.Value(0)).current;
  const notLinked      = !isNativeModuleLinked();

  const startTimestamp = useRef<number | null>(null);
  const repEvents      = useRef<{ timeSec: number; good: boolean; reason: string }[]>([]);
  const sessionStopped = useRef(false);
  const isTrackingRef  = useRef(false);
  // True only once real native tracking has genuinely begun (after
  // startTracking() resolves and phase actually becomes 'tracking') — see
  // the setupSub listener below for why this is a SEPARATE flag from
  // isTrackingRef (which flips true earlier, before the 1.5s setup-done
  // grace period even starts).
  const trackingActiveRef = useRef(false);
  const hintTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setupDoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Full session log buffer — accumulates EVERY line for post-session review.
  // Not a state value; we never need it to trigger re-renders during the session.
  const sessionLogRef = useRef<string[]>([]);

  // Pending nav params stored right before switching to 'review' phase, so the
  // review's Done button can navigate with the correct final rep counts/videoUri.
  const pendingNavRef = useRef<{
    reps: number; goodReps: number; videoUri: string;
  } | null>(null);

  // Live push-up metric readout (elbow angle)
  const [liveMetric, setLiveMetric] = useState<{
    value: number; state: string; enter: number; exit: number; rom: number;
  } | null>(null);

  // ── Debug log listener ────────────────────────────────────────────────────

  useEffect(() => {
    if (!DEBUG_LOG_ENABLED || notLinked) return;
    const sub = addDebugLogListener(e => {
      console.log('[DEBUG]', e.message);
      // Full session buffer: every line, no limit — feeds the post-session review only.
      sessionLogRef.current.push(e.message);
      // Parse [METRIC] lines for live push-up readout
      if (e.message.startsWith('[METRIC]')) {
        const vMatch  = e.message.match(/value=([-\d.]+)/);
        const sMatch  = e.message.match(/state=(\w+)/);
        const enMatch = e.message.match(/enter=([-\d.]+)/);
        const exMatch = e.message.match(/exit=([-\d.]+)/);
        const romMatch = e.message.match(/rom=([-\d.]+)/);
        if (vMatch && sMatch) {
          setLiveMetric({
            value: parseFloat(vMatch[1]),
            state: sMatch[1],
            enter: enMatch  ? parseFloat(enMatch[1])  : 0,
            exit:  exMatch  ? parseFloat(exMatch[1])  : 0,
            rom:   romMatch ? parseFloat(romMatch[1]) : 0,
          });
        }
      }
      // [GATE] lines no longer exist — the ready gate that emitted them was removed natively.
    });
    return () => sub.remove();
  }, []);

  // ── Session lifecycle ──────────────────────────────────────────────────────

  useEffect(() => {
    if (notLinked) {
      setError('ATHLTCamera native module not linked.\nRun a dev build — Expo Go does not support this screen.');
      return;
    }

    let mounted = true;
    sessionStopped.current  = false;
    isTrackingRef.current   = false;
    trackingActiveRef.current = false;

    const errSub   = addErrorListener(e => { if (mounted) setError(e.message); });
    const camSub   = addCameraStateListener(e => {
      if (mounted && e.running) setPhase(p => (p === 'starting' ? 'setup' : p));
    });
    const setupSub = addSetupStatusListener(event => {
      if (!mounted) return;
      setSetupAllVisible(event.allJointsVisible);
      setSetupHoldProgress(event.holdProgress);

      if (event.hint) {
        if (hintTimer.current) clearTimeout(hintTimer.current);
        hintTimer.current = setTimeout(() => {
          if (mounted) setSetupHint(event.hint);
        }, 400);
      } else {
        if (hintTimer.current) { clearTimeout(hintTimer.current); hintTimer.current = null; }
        if (mounted) setSetupHint('');
      }

      if (event.passed) {
        if (!isTrackingRef.current) {
          isTrackingRef.current = true;
          setPhase('setup-done');
          // Spoken cue right at the settle moment — see playReadyCue's own
          // comment for why this needs to work for every exercise, not just
          // back-facing ones (the user can't see this screen change either
          // way if they're not looking at the phone).
          playReadyCue();
          if (setupDoneTimer.current) clearTimeout(setupDoneTimer.current);
          setupDoneTimer.current = setTimeout(async () => {
            if (!mounted) return;
            setStats(null);
            setReps(0);
            setGoodReps(0);
            setLiveMetric(null);
            sessionLogRef.current = []; // clear buffer at start of each tracking session
            startTimestamp.current = Date.now();
            repEvents.current      = [];
            setPhase('tracking');
            trackingActiveRef.current = true;
            await startTracking();
            setupDoneTimer.current = null;
          }, 1500);
        } else {
          setPhase('tracking');
          trackingActiveRef.current = true;
        }
      } else {
        // ROOT CAUSE ("FACE THE CAMERA" reappearing mid-set on lat pulldown,
        // reported as a misfiring live cue): native's runSetupCheck() only
        // ever runs while enginePhase == .setup, and enginePhase never goes
        // back to .setup once it flips to .active — so a genuine, in-order
        // onSetupStatus event can't legitimately arrive once real tracking
        // has begun. But isTrackingRef flips true the INSTANT the first
        // passed:true event arrives — well before startTracking() is even
        // called (there's a deliberate 1.5s grace delay first) — so for that
        // whole window native can still be emitting a stream of genuine
        // .setup-phase events, some of which are passed:false from ordinary
        // micro-movement (adjusting grip, settling). Any one of those,
        // delivered with the bridge's normal event-queue latency, could
        // arrive AFTER this JS side already committed to 'tracking'
        // (isTrackingRef.current was already true, setupDoneTimer already
        // cleared) and incorrectly re-trigger setPhase('setup') below,
        // showing the setup screen's "Face the camera" title as if it were a
        // live correction. trackingActiveRef only flips true once tracking
        // has GENUINELY started (after the grace delay, right where
        // startTracking() is actually called) — once that's true, any
        // further not-passed event is definitely stale and is ignored
        // entirely instead of reverting the phase.
        if (trackingActiveRef.current) return;
        if (setupDoneTimer.current) {
          clearTimeout(setupDoneTimer.current);
          setupDoneTimer.current = null;
          isTrackingRef.current = false;
        }
        if (isTrackingRef.current) {
          setPhase('setup');
        }
      }
    });

    setPhase('starting');
    void setDiagnosticMode(true);
    startSession().then(async result => {
      if (!mounted) return;
      if (!result.success) {
        setError(result.error ?? 'Camera failed to start. Check camera permission in Settings.');
        setPhase('idle');
      } else {
        await setExercise(exerciseType);
        const baseDef = EXERCISE_DEFINITIONS[exerciseType] ?? null;
        const calib = baseDef ? await getCalibration(exerciseType).catch(() => null) : null;
        const defEntry = baseDef ? applyOverride(baseDef, calib?.overrides) : null;
        // Explicit applied/none (not just omitted) so a silent bad override left over
        // from testing the calibration tool is easy to spot in the session log.
        const defMsg = `[DEF-LOOKUP] id=${exerciseType} found=${defEntry !== null ? 'yes' : 'no'} ` +
          (calib ? `overrides=applied(${new Date(calib.calibratedAt).toLocaleDateString()})` : 'overrides=none');
        console.log(defMsg);
        if (DEBUG_LOG_ENABLED) sessionLogRef.current.push(defMsg);
        await setExerciseDefinition(defEntry);
        void setExerciseStandard(EXERCISE_STANDARDS[exerciseType] ?? null);
      }
    });

    return () => {
      mounted = false;
      errSub.remove();
      camSub.remove();
      setupSub.remove();
      if (hintTimer.current)      { clearTimeout(hintTimer.current);      hintTimer.current = null; }
      if (setupDoneTimer.current) { clearTimeout(setupDoneTimer.current); setupDoneTimer.current = null; }
      if (!sessionStopped.current) void stopSession();
    };
  }, []);

  // ── Tracking listeners ────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'tracking') return;
    const repSub = addRepListener((rep: RepEvent) => {
      setReps(rep.reps);
      setGoodReps(rep.goodReps);
      flashAnim.setValue(1);
      Animated.timing(flashAnim, { toValue: 0, duration: 700, useNativeDriver: true }).start();
      if (repCounterOnly) {
        // Reps only — no ✓/✗ orb, no corrective speech. Just a rep tick + the
        // milestone count announcement, driven by total reps.
        handleRepAudio(true, '', rep.reps, false);
      } else {
        setFeedback({ good: rep.good, reason: rep.reason, seq: ++feedbackSeq.current });
        handleRepAudio(rep.good, rep.reason, rep.goodReps);
      }
      const timeSec = startTimestamp.current != null
        ? (Date.now() - startTimestamp.current) / 1000 : 0;
      repEvents.current.push({ timeSec, good: rep.good, reason: rep.reason });
    });
    const dbgSub = addDebugStatsListener((e: DebugStatsEvent) => {
      setStats(e);
      setReps(e.reps);
      setGoodReps(e.goodReps);
    });
    return () => { repSub.remove(); dbgSub.remove(); };
  }, [phase]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  // Shared navigation logic — called either directly from handleStop (no log)
  // or from the review screen's Done button (after user reviewed the log).
  const doNavigate = useCallback((navParams: { reps: number; goodReps: number; videoUri: string }) => {
    if (returnTo) {
      router.replace({
        pathname: returnTo as any,
        params: {
          exerciseId: workoutExerciseId ?? exerciseType,
          reps:       String(navParams.reps),
          goodReps:   String(navParams.goodReps),
          // Feeds recap.tsx's rep breakdown section for workout mode — see
          // store/workoutSessionStore.ts's ExerciseResult.repEvents.
          events:     JSON.stringify(repEvents.current),
          mode:       repCounterOnly ? 'repCounter' : 'formCheck',
        },
      });
    } else {
      const durationSec = startTimestamp.current != null
        ? Math.round((Date.now() - startTimestamp.current) / 1000) : 0;
      router.replace({
        pathname: '/recap',
        params: {
          exercise: exerciseType,
          reps:     String(navParams.reps),
          goodReps: String(navParams.goodReps),
          videoUri: navParams.videoUri,
          events:   JSON.stringify(repEvents.current),
          durationSec: String(durationSec),
          mode:     repCounterOnly ? 'repCounter' : 'formCheck',
        },
      });
    }
  }, [router, returnTo, workoutExerciseId, exerciseType, repCounterOnly]);

  const handleStop = useCallback(async () => {
    setPhase('stopping');
    isTrackingRef.current = false;
    const final = await stopTracking();
    sessionStopped.current = true;
    await stopSession();
    if (final.videoUri) void logSessionVideo(final.videoUri);

    const navParams = { reps: final.reps, goodReps: final.goodReps, videoUri: final.videoUri ?? '' };

    if (DEBUG_LOG_ENABLED && sessionLogRef.current.length > 0) {
      // Store nav params and show review; Done button will call doNavigate.
      pendingNavRef.current = navParams;
      setPhase('review');
    } else {
      doNavigate(navParams);
    }
  }, [doNavigate]);

  const handleReviewDone = useCallback(() => {
    if (pendingNavRef.current) doNavigate(pendingNavRef.current);
  }, [doNavigate]);

  const handleFlip = useCallback(() => void flipCamera(), []);

  const audioEnabled    = useAudioSettingsStore(st => st.audioEnabled);
  const setAudioEnabled = useAudioSettingsStore(st => st.setAudioEnabled);
  const handleToggleMute = useCallback(() => setAudioEnabled(!audioEnabled), [audioEnabled, setAudioEnabled]);

  const handleBack = useCallback(async () => {
    sessionStopped.current = true;
    const wasTracking = isTrackingRef.current;
    isTrackingRef.current  = false;
    if (setupDoneTimer.current) { clearTimeout(setupDoneTimer.current); setupDoneTimer.current = null; }
    if (wasTracking) await stopTracking().catch(() => {});
    await stopSession();
    router.back();
  }, [router]);

  const isTracking     = phase === 'tracking';
  const isStopping     = phase === 'stopping';
  const showRepCounter = isStopping || isTracking;
  const isPushupFamily = ['pushup','kneePushup','inclinePushup','widePushup','diamondPushup','declinePushup'].includes(exerciseType);
  // Raise family also gets the live numeric readout — needed to read arms-down
  // vs arms-up directly on-screen while calibrating real thresholds, same as
  // push-up used it for elbow angle during its own calibration.
  const isRaiseFamily = ['lateralRaise', 'frontRaise'].includes(exerciseType);
  // Tricep family too — added to investigate the zero-rep-count report: this
  // makes the live metric vs enter/exit/rom thresholds visible on-screen while
  // actually doing reps, not just in the post-session log.
  const isTricepFamily = ['tricepPushdown', 'overheadTricepExtension', 'skullcrusher'].includes(exerciseType);
  const showPushupMetric = (isPushupFamily || isRaiseFamily || isTricepFamily) && isTracking && liveMetric != null;
  const liveMetricLabel = isPushupFamily ? 'ELBOW ANGLE' : isTricepFamily ? 'FOREARM ANGLE' : 'ARM ANGLE';

  return (
    <View style={s.root}>
      <ATHLTCameraView style={StyleSheet.absoluteFill} />

      {/* Green flash on rep */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: C.good, opacity: Animated.multiply(flashAnim, 0.15) }]}
      />

      {/* Rep feedback badge */}
      {feedback && (
        <RepFeedback good={feedback.good} reason={feedback.reason} seq={feedback.seq} onComplete={() => setFeedback(null)} />
      )}

      {/* Positioning-guide box. Border goes green the instant SETUP's joint
          check passes, then stays up through the set. During SETUP the
          instruction panel is centred INSIDE the box so it never crosses the
          border. The rep counter is its own element up top (below). */}
      {(phase === 'setup' || phase === 'starting' || phase === 'setup-done' || phase === 'tracking') && (
        <PositioningGuide
          box={guideBoxFor(exerciseType)}
          ready={setupAllVisible || phase === 'setup-done' || phase === 'tracking'}
        >
          {phase === 'setup' && (
            <GlassPanel radius={30} style={s.setupPanel}>
              <View style={s.setupPanelInner}>
                <Text style={s.setupBig}>
                  {setupAllVisible ? 'Hold still…' : 'Line yourself up'}
                </Text>
                <Text style={s.setupHint}>
                  {setupHint
                    || (setupAllVisible
                          ? 'Locking on — keep steady'
                          : `${SETUP_INFO[exerciseType].title} · ${SETUP_INFO[exerciseType].sub}`)}
                </Text>
              </View>
            </GlassPanel>
          )}
        </PositioningGuide>
      )}

      {/* Rep counter — fixed near the top, same Liquid Glass frame as the box. */}
      {showRepCounter && <RepCounter reps={reps} goodReps={goodReps} repCounterOnly={repCounterOnly} />}

      {/* Ready → tracking */}
      {phase === 'setup-done' && (
        <View style={s.setupDoneOverlay} pointerEvents="none">
          <GlassPanel radius={999} style={s.setupSuccessCard}>
            <View style={s.setupSuccessInner}>
              <SymbolView name="checkmark.circle.fill" size={40} tintColor={C.good} type="monochrome" style={{ width: 40, height: 40 }} />
              <Text style={s.setupSuccessText}>Ready — go!</Text>
            </View>
          </GlassPanel>
        </View>
      )}

      {/* Top bar */}
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <GlassButton circular={40} onPress={handleBack}>
          <SymbolView name="chevron.left" size={18} tintColor={C.text} type="monochrome" style={{ width: 18, height: 18 }} />
        </GlassButton>
        <Text style={s.title} numberOfLines={1}>
          {phase === 'tracking' || phase === 'setup' || phase === 'setup-done' || phase === 'starting'
            ? ''
            : (EXERCISE_DEFINITIONS[exerciseType]?.displayName ?? exerciseType)}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <GlassButton circular={40} onPress={handleToggleMute}>
            <SymbolView
              name={audioEnabled ? 'speaker.wave.2.fill' : 'speaker.slash.fill'}
              size={18} tintColor={C.text} type="monochrome" style={{ width: 18, height: 18 }}
            />
          </GlassButton>
          <GlassButton circular={40} onPress={handleFlip}>
            <SymbolView name="arrow.triangle.2.circlepath.camera.fill" size={18} tintColor={C.text} type="monochrome" style={{ width: 18, height: 18 }} />
          </GlassButton>
        </View>
      </View>

      {/* Error */}
      {error && (
        <View style={s.errorCard}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {/* Rep counter now lives INSIDE the positioning box (see PositioningGuide
          children above) — no separate floating panel. */}

      {/* Live metric readout — push-up elbow angle, or raise-family arm angle */}
      {showPushupMetric && (
        <View style={s.metricReadout} pointerEvents="none">
          <Text style={s.metricLabel}>{liveMetricLabel}</Text>
          <Text style={[s.metricValue, liveMetric!.state === 'down' && s.metricValueDown]}>
            {liveMetric!.value.toFixed(1)}°
          </Text>
          <Text style={[s.metricState, liveMetric!.state === 'down' && s.metricStateDown]}>
            {liveMetric!.state === 'down' ? '▼  IN REP' : liveMetric!.state === 'up' ? '▲  AT TOP' : '·  WAITING'}
          </Text>
          <Text style={s.metricThresh}>
            {'enter<'}{Math.round(liveMetric!.enter)}°{'  exit>'}{Math.round(liveMetric!.exit)}°
          </Text>
          <Text style={s.metricThresh}>good rom {'≤'} {Math.round(liveMetric!.rom)}°</Text>
        </View>
      )}

      {/* Live planarity hint */}
      {isTracking && !!stats?.outOfPlaneCue && (
        <View style={s.outOfPlaneHint} pointerEvents="none">
          <GlassPanel radius={999} style={s.outOfPlaneGlass}>
            <View style={s.outOfPlaneInner}>
              <Text style={s.outOfPlaneText}>{stats.outOfPlaneCue}</Text>
            </View>
          </GlassPanel>
        </View>
      )}

      {/* Debug stats */}
      {stats && isTracking && (
        <View style={s.debugPanel}>
          <Row label="person"  value={stats.personDetected ? 'yes' : 'no'} good={stats.personDetected} />
          <Row label="ready"   value={stats.ready ? 'yes' : 'no'} good={stats.ready} />
          <Row
            label={
              (['seatedCableRow', 'machineRow'] as string[]).includes(exerciseType) ? 'wrHip' :
              (['curl','hammerCurl','concentrationCurl','preacherCurl','reverseCurl','cableCurl','pushup','kneePushup','inclinePushup','widePushup','diamondPushup','declinePushup','closegripPushup','tricepPushdown','overheadTricepExtension','skullcrusher','bentOverRow','barbellRow','singleArmRow','invertedRow','tBarRow'] as string[]).includes(exerciseType) ? 'elbow°' :
              'knee°'
            }
            value={stats.kneeAngle.toFixed((['seatedCableRow', 'machineRow'] as string[]).includes(exerciseType) ? 2 : 1)}
          />
          <Row label="back°"   value={stats.backAngle.toFixed(1)} />
          <Row label="phase"   value={stats.phase} />
          <Row label="frames"  value={`${stats.totalFramesAnalyzed} / ${stats.totalFramesReceived}`} />
        </View>
      )}

      {/* Bottom controls */}
      <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom + 16, 32) }]}>
        {phase === 'starting' && <Text style={s.hint}>Starting camera…</Text>}
        {isStopping          && <Text style={s.hint}>Saving session…</Text>}
        {isTracking && (
          <GlassButton style={{ height: 56, width: 240 }} onPress={handleStop}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <SymbolView name="stop.fill" size={18} tintColor={C.warn} type="monochrome" style={{ width: 18, height: 18 }} />
              <Text style={[s.trackLabel, s.trackLabelStop]}>Stop</Text>
            </View>
          </GlassButton>
        )}
      </View>

      {/* ── Post-session debug log review (phase === 'review') ──────────────── */}
      {/* Full-screen overlay, shown after Stop when DEBUG_LOG_ENABLED and log is non-empty. */}
      {/* The user can scroll through the entire session log, then tap Done to go to recap. */}
      {phase === 'review' && (
        <SessionLogReview
          log={sessionLogRef.current}
          reps={reps}
          goodReps={goodReps}
          exerciseType={exerciseType}
          insetTop={insets.top}
          insetBottom={insets.bottom}
          onDone={handleReviewDone}
        />
      )}
    </View>
  );
}

// ─── Debug row ────────────────────────────────────────────────────────────────
function Row({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <View style={d.row}>
      <Text style={d.key}>{label}</Text>
      <Text style={[d.val, good === true && d.valGood, good === false && d.valDim]}>{value}</Text>
    </View>
  );
}

// ─── Session log review component ─────────────────────────────────────────────
//
// Shown after a set ends (phase === 'review'). Displays the full in-memory
// session log, grouped with [REP #N] lines highlighted so the user can scroll
// through at their own pace and see exactly what happened on each rep.
// The Share button exports the full log as text (readable on a computer).

function SessionLogReview({
  log, reps, goodReps, exerciseType, insetTop, insetBottom, onDone,
}: {
  log: string[];
  reps: number;
  goodReps: number;
  exerciseType: string;
  insetTop: number;
  insetBottom: number;
  onDone: () => void;
}) {
  const scrollRef = useRef<ScrollView | null>(null);
  const repSummaries = parseRepSummaries(log);

  const shareLog = () => {
    const header = [
      '=== ATHLT Session Debug Log ===',
      `Exercise: ${exerciseType}`,
      `Date: ${new Date().toLocaleDateString()}`,
      `Reps: ${reps} total / ${goodReps} good`,
      '================================',
      '',
    ].join('\n');
    Share.share({ message: header + log.join('\n') });
  };

  return (
    <View style={[r.overlay, { paddingTop: insetTop, paddingBottom: insetBottom }]}>
      {/* Header */}
      <View style={r.header}>
        <View style={{ flex: 1 }}>
          <Text style={r.headerTitle}>SESSION LOG</Text>
          <Text style={r.headerSub}>{reps} reps · {goodReps} good · {log.length} lines</Text>
        </View>
        <Pressable style={r.shareBtn} onPress={shareLog}>
          <Text style={r.shareBtnTxt}>Share</Text>
        </Pressable>
        <Pressable style={r.doneBtn} onPress={onDone}>
          <Text style={r.doneBtnTxt}>Done</Text>
        </Pressable>
      </View>

      {/* Rep summary chips — one per [REP #N] found in the log */}
      {repSummaries.length > 0 && (
        <View style={r.repRow}>
          {repSummaries.map(rep => (
            <View key={rep.num} style={[r.repChip, rep.good ? r.repChipGood : r.repChipBad]}>
              <Text style={[r.repChipNum, rep.good ? r.repChipNumGood : r.repChipNumBad]}>
                #{rep.num} {rep.good ? '✓' : '✗'}
              </Text>
              <Text style={r.repChipPeak}>peak {rep.peak}</Text>
              {rep.cue ? <Text style={r.repChipCue} numberOfLines={1}>{rep.cue}</Text> : null}
            </View>
          ))}
        </View>
      )}

      {/* Divider */}
      <View style={r.divider} />

      {/* Full log — each line styled by type */}
      <ScrollView ref={scrollRef} style={r.scroll} contentContainerStyle={r.scrollContent}>
        {log.map((line, i) => {
          const type = logLineType(line);
          if (type === 'rep-good' || type === 'rep-bad') {
            return (
              <View key={i} style={r.repBlock}>
                <View style={r.repBlockDivider} />
                <Text style={type === 'rep-good' ? r.lineRepGood : r.lineRepBad}>{line}</Text>
              </View>
            );
          }
          return (
            <Text key={i} style={logLineStyle(type)}>{line}</Text>
          );
        })}
        {log.length === 0 && (
          <Text style={r.emptyTxt}>No log lines captured.</Text>
        )}
      </ScrollView>
    </View>
  );
}

function logLineType(line: string): 'rep-good' | 'rep-bad' | 'metric' | 'gate' | 'univ' | 'dim' | 'normal' {
  // [REP] #N ... cue=GOOD  →  rep-good
  // [REP] #N ... cue=OTHER →  rep-bad
  // [REP] rejected ...      →  rep-bad
  if (line.startsWith('[REP]')) return line.includes('cue=GOOD') ? 'rep-good' : 'rep-bad';
  if (line.startsWith('[METRIC]')) return 'metric';
  if (line.startsWith('[GATE]'))   return 'gate';
  if (line.startsWith('[UNIV') || line.startsWith('[STD') || line.startsWith('[COMPARE') ||
      line.startsWith('[DEF') || line.startsWith('[CALIB')) return 'dim';
  return 'normal';
}

function logLineStyle(type: ReturnType<typeof logLineType>) {
  switch (type) {
    case 'metric':  return r.lineMetric;
    case 'gate':    return r.lineGate;
    case 'dim':     return r.lineDim;
    default:        return r.lineNormal;
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#000' },
  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  title:      { flex: 1, textAlign: 'center', marginHorizontal: 10, fontFamily: F.bold, fontSize: 15, color: C.text, letterSpacing: 0.2 },
  errorCard:  { position: 'absolute', left: 24, right: 24, top: '38%', backgroundColor: C.glass, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: C.border },
  errorText:  { color: C.warn, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  outOfPlaneHint:  { position: 'absolute', top: '43%', left: 0, right: 0, alignItems: 'center' },
  outOfPlaneGlass: { alignSelf: 'center' },
  outOfPlaneInner: { paddingHorizontal: 22, paddingVertical: 11 },
  outOfPlaneText:  { fontFamily: F.bold, fontSize: 16, color: C.warn, letterSpacing: 0.3 },

  // Rep count — bare, no frame; own shadow for legibility over the camera.
  repBlock:  { position: 'absolute', top: '12%', left: 0, right: 0, alignItems: 'center' },
  repNum:    {
    fontFamily: F.extra, fontSize: 108, lineHeight: 114, color: '#fff', letterSpacing: -2,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 18,
  },
  repSubRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  repDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: C.good },
  repSub:    {
    fontFamily: F.bold, fontSize: 15, color: 'rgba(255,255,255,0.92)', letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 10,
  },
  repCounterTag: {
    fontFamily: F.bold, fontSize: 11, color: 'rgba(255,255,255,0.62)', letterSpacing: 1.4,
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 10,
  },
  debugPanel: { position: 'absolute', bottom: 140, left: 16, backgroundColor: C.glass, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, minWidth: 210, borderWidth: 1, borderColor: C.border },
  bottomBar:  { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingTop: 12, paddingHorizontal: 24, gap: 12 },
  hint:       { color: C.muted, fontSize: 13 },
  trackLabel:     { fontSize: 16, fontWeight: '600', color: C.text },
  trackLabelStop: { color: C.warn },

  // ── Live push-up metric readout ───────────────────────────────────────────
  metricReadout: {
    position: 'absolute', bottom: 160, left: 16,
    backgroundColor: 'rgba(0,0,0,0.86)', borderRadius: 18,
    paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', minWidth: 148, gap: 3,
  },
  metricLabel:     { fontSize: 8, fontWeight: '700', color: C.dim, letterSpacing: 1.2, marginBottom: 2 },
  metricValue:     { fontFamily: 'Menlo', fontSize: 36, fontWeight: '700', color: C.text, lineHeight: 40 },
  metricValueDown: { color: C.good },
  metricState:     { fontSize: 12, fontWeight: '600', color: C.muted, marginTop: 4 },
  metricStateDown: { color: C.good },
  metricThresh:    { fontFamily: 'Menlo', fontSize: 8, color: C.dim, marginTop: 2 },

  // ── Setup instruction — centred inside the guide box (see PositioningGuide
  // children), so it never crosses the box border. ───────────────────────
  setupPanel:      { alignSelf: 'center', maxWidth: 320, marginHorizontal: 16 },
  setupPanelInner: { paddingHorizontal: 28, paddingTop: 20, paddingBottom: 22, alignItems: 'center', gap: 8 },
  setupBig:        { fontFamily: F.extra, fontSize: 25, color: '#fff', textAlign: 'center' },
  setupHint:       { fontFamily: F.regular, fontSize: 14, color: 'rgba(255,255,255,0.86)', textAlign: 'center', lineHeight: 20 },

  setupDoneOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },

  // ── "Ready — go!" pill ───────────────────────────────────────────────────
  setupSuccessCard:  { alignSelf: 'center' },
  setupSuccessInner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 30, paddingVertical: 18 },
  setupSuccessText:  { fontFamily: F.extra, fontSize: 21, color: C.good },
});

const d = StyleSheet.create({
  row:     { flexDirection: 'row', justifyContent: 'space-between', gap: 20, paddingVertical: 3 },
  key:     { fontSize: 11, color: C.dim },
  val:     { fontSize: 11, color: C.text },
  valGood: { color: C.good },
  valDim:  { color: '#444' },
});

// ─── Session log review styles ─────────────────────────────────────────────────
const r = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#080909',
    flexDirection: 'column',
  },

  // Header row: title + share + done
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  headerTitle: { fontSize: 12, fontWeight: '700', color: C.text, letterSpacing: 0.8 },
  headerSub:   { fontSize: 11, color: C.muted, marginTop: 1 },
  shareBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
    backgroundColor: 'rgba(103,206,255,0.12)', borderWidth: 1,
    borderColor: 'rgba(103,206,255,0.28)',
  },
  shareBtnTxt: { fontSize: 13, fontWeight: '600', color: '#67CEFF' },
  doneBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
    backgroundColor: 'rgba(74,222,128,0.12)', borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.30)',
  },
  doneBtnTxt: { fontSize: 13, fontWeight: '600', color: C.good },

  // Rep summary chips
  repRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  repChip: {
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, minWidth: 72,
  },
  repChipGood:    { backgroundColor: 'rgba(74,222,128,0.08)', borderColor: 'rgba(74,222,128,0.25)' },
  repChipBad:     { backgroundColor: 'rgba(251,146,60,0.08)', borderColor: 'rgba(251,146,60,0.28)' },
  repChipNum:     { fontSize: 12, fontWeight: '700' },
  repChipNumGood: { color: C.good },
  repChipNumBad:  { color: C.warn },
  repChipPeak:    { fontFamily: 'Menlo', fontSize: 9, color: C.muted, marginTop: 2 },
  repChipCue:     { fontSize: 8.5, color: C.dim, marginTop: 1 },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)' },

  // Full log scroll
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 1 },
  emptyTxt:      { fontSize: 12, color: C.dim, textAlign: 'center', marginTop: 40 },

  // Per-line styles
  // [REP #N] lines get a visual separator + prominent text
  repBlock:        { marginTop: 10, marginBottom: 2 },
  repBlockDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.10)', marginBottom: 5 },
  lineRepGood: {
    fontFamily: 'Menlo', fontSize: 10, fontWeight: '700',
    color: C.good, lineHeight: 15,
  },
  lineRepBad: {
    fontFamily: 'Menlo', fontSize: 10, fontWeight: '700',
    color: C.warn, lineHeight: 15,
  },
  // [METRIC] lines — the ones the user most wants to read
  lineMetric: {
    fontFamily: 'Menlo', fontSize: 9, color: '#C8C8CC', lineHeight: 14,
  },
  // [GATE] lines — useful but noisy; dim them
  lineGate: {
    fontFamily: 'Menlo', fontSize: 8, color: C.dim, lineHeight: 13,
  },
  // [UNIV] / [STD] / [DEF] / [CALIB] / [COMPARE] — secondary info
  lineDim: {
    fontFamily: 'Menlo', fontSize: 8.5, color: '#4A4A52', lineHeight: 13,
  },
  // Everything else
  lineNormal: {
    fontFamily: 'Menlo', fontSize: 9, color: C.muted, lineHeight: 14,
  },
});
