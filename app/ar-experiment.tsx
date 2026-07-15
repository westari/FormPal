/**
 * app/ar-experiment.tsx — ARKit body-tracking experiment screen.
 *
 * DEV ONLY. Isolated from the main workout flow.
 * Reach via: Profile → "ARKit Body Experiment (DEV)"
 *
 * Test protocol:
 *   1. Stand ~6-8 ft back, full body in frame, wait for TRACKING status.
 *   2. 3-4 GOOD curls (elbow pinned). Tap MARK PEAK at top of each.
 *   3. 3-4 DRIFTED curls (elbow pushed toward camera, still fully flexed).
 *      Tap MARK PEAK at top of each.
 *   4. SHARE LOG and paste the exported text for analysis.
 *
 * SUCCESS: drifted-but-flexed curls read LOW elbow angle (~30-50°), same as
 * good curls. That means ARKit's hardware depth sees what 2D can't.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Share,
  Platform,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ARBodyExperimentView,
  mark,
  isARModuleLinked,
} from '../modules/athlt-camera/src/ar-body-experiment';

const MAX_LOGS = 25;

export default function ARExperimentScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const notLinked = !isARModuleLinked();

  const [logs, setLogs] = useState<string[]>([]);
  const scrollRef = useRef<ScrollView | null>(null);

  // Stable callback — passed as onDebugLog prop to native view
  const handleDebugLog = useCallback((e: { message: string }) => {
    console.log('[AR]', e.message);
    setLogs(prev => [...prev.slice(-(MAX_LOGS - 1)), e.message]);
  }, []);

  // Auto-scroll to bottom on new log
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 0);
  }, [logs]);

  const handleMark = () => mark();

  const handleShare = async () => {
    if (logs.length === 0) return;
    await Share.share({ message: logs.join('\n') });
  };

  if (notLinked) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>
          ARBodyExperiment native module not linked.{'\n'}
          Run a dev build — Expo Go does not include this module.
        </Text>
        <Pressable style={s.pill} onPress={() => router.back()}>
          <Text style={s.pillText}>← BACK</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.root}>
      {/* AR view fills the entire screen */}
      <ARBodyExperimentView
        style={StyleSheet.absoluteFill}
        onDebugLog={handleDebugLog}
      />

      {/* Top bar: back + title */}
      <View style={[s.topBar, { paddingTop: insets.top + 6 }]}>
        <Pressable
          style={({ pressed }) => [s.pill, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
        >
          <Text style={s.pillText}>← BACK</Text>
        </Pressable>
        <Text style={s.topTitle}>ARKit 3D Body Experiment</Text>
      </View>

      {/* Bottom panel: log + buttons */}
      <View style={[s.bottomPanel, { paddingBottom: Math.max(insets.bottom, 10) + 6 }]}>

        {/* Debug log */}
        <View style={s.logBox}>
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
          >
            {logs.length === 0 ? (
              <Text style={s.logPlaceholder}>
                Waiting for AR session…{'\n'}Stand back so your FULL body is in frame.
              </Text>
            ) : (
              logs.map((line, i) => (
                <Text key={i} style={[s.logLine, line.startsWith('[AR-MARK]') && s.logMark]}>
                  {line}
                </Text>
              ))
            )}
          </ScrollView>
        </View>

        {/* Action buttons */}
        <View style={s.btnRow}>
          <Pressable
            style={({ pressed }) => [s.markBtn, pressed && { opacity: 0.8 }]}
            onPress={handleMark}
          >
            <Text style={s.markBtnText}>MARK PEAK</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.shareBtn, pressed && { opacity: 0.7 }]}
            onPress={handleShare}
          >
            <Text style={s.shareBtnText}>SHARE LOG</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A0B0C',
    gap: 20,
    padding: 24,
  },
  errorText: {
    color: '#9A9AA2',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Top bar
  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  topTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    flex: 1,
  },

  // Pill button (back + error back)
  pill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
  },
  pillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  // Bottom panel
  bottomPanel: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(10,11,14,0.90)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 12,
    gap: 10,
  },

  // Log box
  logBox: {
    height: 185,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  logPlaceholder: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 16,
  },
  logLine: {
    color: '#b8f7c0',
    fontSize: 10,
    lineHeight: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  logMark: {
    color: '#FFD60A',   // [AR-MARK] lines in gold so they stand out
    fontWeight: '700',
  },

  // Buttons
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  markBtn: {
    flex: 2,
    backgroundColor: '#0a84ff',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  markBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  shareBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  shareBtnText: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
