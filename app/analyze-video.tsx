// ── Analyze a Video (Phase 2) ────────────────────────────────────────────────
// Real upload flow, replacing recap.tsx's temporary "run analyzeVideoFile()"
// debug harness: pick any video from the photo library, pick which exercise
// it is (reusing exercise-picker.tsx via its new `returnTo` param), run it
// through analyzeVideoFile with that exercise's real JS definition (same
// EXERCISE_DEFINITIONS + calibration-override lookup formcheck.tsx uses for
// live sessions — see Part 1's native/JS wiring in ATHLTCameraModule.swift
// and modules/athlt-camera/src/index.ts), then hand off to recap.tsx with
// the EXACT SAME route params a live session uses (exercise/reps/goodReps/
// videoUri/events/durationSec). That's deliberate, not a shortcut: it means
// the results screen is really recap.tsx's existing, already-polished UI —
// not a second results screen to build and keep in sync.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert, Share } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import ScreenBackground from '../components/ScreenBackground';
import Card from '../components/Card';
import { analyzeVideoFile, addRepListener, addDebugLogListener, clearDebugLog, type RepEvent } from '../modules/athlt-camera/src/index';
import { EXERCISE_CATALOG, type ExerciseId } from '../constants/exercises';
import { EXERCISE_DEFINITIONS } from '../constants/exerciseDefinitions';
import { getCalibration, applyOverride } from '../lib/calibration/store';
import { FONT, Col, Sp, Sz, W, R, Elev } from '../constants/theme';

type Status = 'idle' | 'analyzing' | 'error';

export default function AnalyzeVideoScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { exercise } = useLocalSearchParams<{ exercise?: string }>();

  const [videoUri,   setVideoUri]   = useState<string | null>(null);
  const [exerciseId, setExerciseId] = useState<ExerciseId | null>(null);
  const [status,     setStatus]     = useState<Status>('idle');
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);
  const [liveReps,     setLiveReps]     = useState(0);
  const [liveGoodReps, setLiveGoodReps] = useState(0);

  // Orientation. 'auto' (default) lets the native [ORIENT-TEST] probe run
  // Vision under all four rotations on a sample of frames and pick the one
  // that yields an upright, high-confidence body — see analyzeVideoFile's
  // doc comment and probeOrientation() in ATHLTCameraModule.swift. The four
  // explicit values force a single rotation and skip the probe, for A/B
  // testing only.
  const [devOrientation, setDevOrientation] =
    useState<'auto' | 'up' | 'down' | 'left' | 'right'>('auto');

  // Full debug log buffer for this screen's lifetime — same accumulation
  // formcheck.tsx's SessionLogReview does with sessionLogRef, so a failed
  // analysis (0 reps, or a real error) can still be shared: this was
  // previously only reachable from recap.tsx, which a failed/0-rep
  // analysis never navigates to (see the error-card Share button below).
  const debugLogRef = useRef<string[]>([]);
  useEffect(() => {
    const sub = addDebugLogListener(e => { debugLogRef.current.push(e.message); });
    return () => sub.remove();
  }, []);

  const shareLog = () => {
    const header = [
      '=== ATHLT Video Analysis Debug Log ===',
      `Exercise: ${exerciseName ?? exerciseId ?? 'unknown'}`,
      `Date: ${new Date().toLocaleDateString()}`,
      `Result: ${liveReps} rep${liveReps === 1 ? '' : 's'} / ${liveGoodReps} good`,
      '=======================================',
      '',
    ].join('\n');
    Share.share({ message: header + debugLogRef.current.join('\n') });
  };

  // Returning from exercise-picker?returnTo=/analyze-video — pick up its choice.
  useEffect(() => {
    if (exercise && EXERCISE_CATALOG.some(e => e.id === exercise)) {
      setExerciseId(exercise as ExerciseId);
    }
  }, [exercise]);

  const player = useVideoPlayer(videoUri, p => { p.loop = false; });
  useEffect(() => { if (videoUri) player.pause(); }, [videoUri, player]);

  const exerciseName = exerciseId
    ? EXERCISE_CATALOG.find(e => e.id === exerciseId)?.displayName ?? exerciseId
    : null;

  const handlePickVideo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo access needed', 'Allow photo library access in Settings to pick a video.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setVideoUri(result.assets[0].uri);
      setStatus('idle');
      setErrorMsg(null);
    }
  };

  const analyzeStartedAt = useRef(0);

  const handleAnalyze = async () => {
    if (!videoUri || !exerciseId || status === 'analyzing') return;
    setStatus('analyzing');
    setErrorMsg(null);
    setLiveReps(0);
    setLiveGoodReps(0);
    // Fresh log for THIS run — otherwise Share Logs on recap.tsx (which
    // reads the module-level buffer, not this screen's own debugLogRef)
    // would include leftover lines from a previous attempt.
    clearDebugLog();

    const repEvents: { timeSec: number; good: boolean; reason: string }[] = [];
    analyzeStartedAt.current = Date.now();
    const repSub = addRepListener((rep: RepEvent) => {
      setLiveReps(rep.reps);
      setLiveGoodReps(rep.goodReps);
      // Prefer the video's own clock (rep.videoTimeSec) — wall-clock time
      // since this call started drifts from the video's actual timeline by
      // however long native setup took before the analysis loop began,
      // which was throwing off recap's rep markers/overlay. Falls back to
      // the old approximation only against a stale native build that
      // hasn't been rebuilt with the videoTimeSec field yet.
      const timeSec = rep.videoTimeSec ?? (Date.now() - analyzeStartedAt.current) / 1000;
      repEvents.push({ timeSec, good: rep.good, reason: rep.reason });
    });

    try {
      // Same lookup formcheck.tsx does for a live session — the video path
      // now gets the exact same tuned definition, calibration override
      // included, not a stripped-down copy.
      const baseDef = EXERCISE_DEFINITIONS[exerciseId] ?? null;
      const calib   = baseDef ? await getCalibration(exerciseId).catch(() => null) : null;
      const defEntry = baseDef ? applyOverride(baseDef, calib?.overrides) : null;

      // ExerciseDefinitionDef has no index signature, so it doesn't
      // structurally satisfy Record<string, unknown> — same pre-existing
      // mismatch formcheck.tsx's setExerciseDefinition(defEntry) call has;
      // both are plain serializable objects at runtime, just cast here.
      const result = await analyzeVideoFile(
        videoUri, exerciseId, defEntry as Record<string, unknown> | null,
        devOrientation === 'auto' ? undefined : devOrientation,
      );
      repSub.remove();

      if (!result.success) {
        setStatus('error');
        setErrorMsg(result.error ?? 'Analysis failed — no further detail from the engine.');
        return;
      }

      const finalReps = result.reps ?? repEvents.length;
      if (finalReps === 0) {
        setStatus('error');
        setErrorMsg("We couldn't detect any reps — make sure your full body is visible and the camera angle matches how you'd film the exercise.");
        return;
      }

      const durationSec = Math.round((Date.now() - analyzeStartedAt.current) / 1000);
      router.replace({
        pathname: '/recap',
        params: {
          exercise:    exerciseId,
          reps:        String(result.reps ?? repEvents.length),
          goodReps:    String(result.goodReps ?? repEvents.filter(r => r.good).length),
          videoUri,
          events:      JSON.stringify(repEvents),
          durationSec: String(durationSec),
          mode:        (EXERCISE_DEFINITIONS[exerciseId]?.mode ?? 'formCheck') === 'repCounter' ? 'repCounter' : 'formCheck',
        },
      });
    } catch (e: any) {
      repSub.remove();
      setStatus('error');
      setErrorMsg(e?.message ?? String(e));
    }
  };

  const canAnalyze = !!videoUri && !!exerciseId && status !== 'analyzing';

  return (
    <ScreenBackground>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} disabled={status === 'analyzing'}>
            <SymbolView name="chevron.left" size={16} tintColor={Col.textSub} type="monochrome" style={{ width: 16, height: 16 }} />
          </Pressable>
          <Text style={styles.title}>Analyze a Video</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.subtitle}>
            Already have a set on video? Pick the clip and the exercise — we'll run the same rep and form analysis a live session gets.
          </Text>

          {/* Step 1 — video */}
          <Card style={styles.stepCard}>
            <Text style={styles.stepLabel}>1 · VIDEO</Text>
            {videoUri ? (
              <>
                <View style={styles.previewWrap}>
                  <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
                </View>
                <Pressable
                  onPress={handlePickVideo}
                  disabled={status === 'analyzing'}
                  style={({ pressed }) => [styles.changeBtn, pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.changeBtnText}>Choose a different video</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={handlePickVideo}
                style={({ pressed }) => [styles.pickBtn, pressed && { opacity: 0.85 }]}
              >
                <SymbolView name="video.badge.plus" size={22} tintColor={Col.text} type="monochrome" style={{ width: 22, height: 22 }} />
                <Text style={styles.pickBtnText}>Pick a video</Text>
              </Pressable>
            )}
          </Card>

          {/* Step 2 — exercise */}
          <Card style={styles.stepCard}>
            <Text style={styles.stepLabel}>2 · EXERCISE</Text>
            <Pressable
              onPress={() => router.push('/exercise-picker?returnTo=/analyze-video' as any)}
              disabled={status === 'analyzing'}
              style={({ pressed }) => [styles.exerciseRow, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.exerciseRowText, !exerciseName && styles.exerciseRowPlaceholder]}>
                {exerciseName ?? 'Choose exercise'}
              </Text>
              <SymbolView name="chevron.right" size={14} tintColor={Col.textDim} type="monochrome" style={{ width: 14, height: 14 }} />
            </Pressable>
          </Card>

          {/* Orientation. 'auto' runs the native [ORIENT-TEST] probe (all four
              rotations, picks the upright one). The explicit values force one
              rotation and skip the probe — A/B testing only. */}
          <Card style={styles.stepCard}>
            <Text style={styles.stepLabel}>DEV · VIDEO ORIENTATION</Text>
            <View style={styles.orientRow}>
              {(['auto', 'up', 'down', 'left', 'right'] as const).map(o => (
                <Pressable
                  key={o}
                  onPress={() => setDevOrientation(o)}
                  disabled={status === 'analyzing'}
                  style={[styles.orientBtn, devOrientation === o && styles.orientBtnActive]}
                >
                  <Text style={[styles.orientBtnText, devOrientation === o && styles.orientBtnTextActive]}>
                    {o}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Card>

          {/* Analyzing state */}
          {status === 'analyzing' && (
            <Card style={styles.stepCard} elevation="low">
              <View style={styles.analyzingRow}>
                <ActivityIndicator color={styles.accent.color} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.analyzingTitle}>Analyzing…</Text>
                  <Text style={styles.analyzingSub}>
                    Takes about as long as the clip itself — {liveReps} rep{liveReps === 1 ? '' : 's'} found so far
                    {liveReps > 0 ? `, ${liveGoodReps} good` : ''}.
                  </Text>
                </View>
              </View>
            </Card>
          )}

          {/* Error state */}
          {status === 'error' && errorMsg && (
            <Card style={styles.stepCard} elevation="low">
              <Text style={styles.errorTitle}>Couldn't analyze that video</Text>
              <Text style={styles.errorBody}>{errorMsg}</Text>
              <Pressable
                onPress={shareLog}
                style={({ pressed }) => [styles.shareLogBtn, pressed && { opacity: 0.7 }]}
              >
                <SymbolView name="square.and.arrow.up" size={14} tintColor={styles.accent.color} type="monochrome" style={{ width: 14, height: 14 }} />
                <Text style={styles.shareLogBtnText}>Share Logs</Text>
              </Pressable>
            </Card>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Sp.sm }]}>
          <Pressable
            onPress={handleAnalyze}
            disabled={!canAnalyze}
            style={({ pressed }) => [styles.cta, !canAnalyze && styles.ctaDisabled, pressed && canAnalyze && { opacity: 0.88 }]}
          >
            <Text style={styles.ctaText}>{status === 'analyzing' ? 'Analyzing…' : 'Analyze Video'}</Text>
          </Pressable>
        </View>
      </View>
    </ScreenBackground>
  );
}

const CTA_DARK = '#0B1020'; // matches app/onboarding.tsx's L.btnDark

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Sp.lg, paddingBottom: Sp.sm,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Col.card, borderWidth: 1, borderColor: 'rgba(17,24,39,0.06)',
    ...({ boxShadow: Elev.low.shadow } as any),
  },
  title: { fontFamily: FONT.displayBold, fontSize: Sz.h3, color: Col.text },

  scroll: { paddingHorizontal: Sp.lg, paddingTop: Sp.sm, paddingBottom: Sp.xxl, gap: Sp.md },

  subtitle: { fontSize: Sz.body, color: Col.textSub, lineHeight: 21, marginBottom: Sp.xs },

  stepCard: { padding: Sp.lg },
  stepLabel: {
    fontFamily: FONT.body, fontSize: Sz.caption, fontWeight: W.semi,
    color: Col.textSub, letterSpacing: 0.8, marginBottom: Sp.sm,
  },

  pickBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Sp.sm,
    borderRadius: R.inner, borderWidth: 1.5, borderColor: 'rgba(17,24,39,0.10)', borderStyle: 'dashed',
    paddingVertical: Sp.xl,
  },
  pickBtnText: { fontFamily: FONT.body, fontSize: Sz.body, fontWeight: W.semi, color: Col.text },

  previewWrap: {
    width: '100%', aspectRatio: 9 / 16, maxHeight: 320, borderRadius: R.inner,
    overflow: 'hidden', backgroundColor: '#000', alignSelf: 'center',
  },
  changeBtn: { alignItems: 'center', paddingTop: Sp.md },
  changeBtnText: { fontFamily: FONT.body, fontSize: Sz.small, fontWeight: W.semi, color: '#2E7DFF' },

  exerciseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exerciseRowText: { fontFamily: FONT.body, fontSize: Sz.body, fontWeight: W.semi, color: Col.text },
  exerciseRowPlaceholder: { color: Col.textDim, fontWeight: W.regular },

  orientRow: { flexDirection: 'row', gap: Sp.sm },
  orientBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: R.inner,
    borderWidth: 1, borderColor: 'rgba(17,24,39,0.10)',
  },
  orientBtnActive: { backgroundColor: CTA_DARK, borderColor: CTA_DARK },
  orientBtnText: { fontFamily: FONT.body, fontSize: Sz.small, fontWeight: W.semi, color: Col.text, textTransform: 'capitalize' },
  orientBtnTextActive: { color: '#fff' },

  analyzingRow: { flexDirection: 'row', alignItems: 'center', gap: Sp.md },
  analyzingTitle: { fontFamily: FONT.body, fontSize: Sz.body, fontWeight: W.semi, color: Col.text, marginBottom: 2 },
  analyzingSub: { fontSize: Sz.small, color: Col.textSub, lineHeight: 18 },

  errorTitle: { fontFamily: FONT.body, fontSize: Sz.body, fontWeight: W.bold, color: Col.low, marginBottom: 4 },
  errorBody: { fontSize: Sz.small, color: Col.textSub, lineHeight: 18 },
  shareLogBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    marginTop: Sp.md, paddingVertical: 6,
  },
  shareLogBtnText: { fontFamily: FONT.body, fontSize: Sz.small, fontWeight: W.semi, color: '#2E7DFF' },

  accent: { color: '#2E7DFF' },

  footer: { paddingHorizontal: Sp.lg, paddingTop: Sp.sm },
  cta: {
    backgroundColor: CTA_DARK, borderRadius: R.pill,
    paddingVertical: 18, alignItems: 'center',
    ...({ boxShadow: Elev.medium.shadow } as any),
  },
  ctaDisabled: { backgroundColor: Col.textDim },
  ctaText: { fontFamily: FONT.displayBold, fontSize: Sz.body, color: '#fff', letterSpacing: 0.2 },
});
