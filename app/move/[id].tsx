import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MOVES } from '../../constants/moves';
import { LIBRARY } from '../../constants/exerciseLibrary';

// ---------------------------------------------------------------------------
// Palette (matches the rest of FormPal)
// ---------------------------------------------------------------------------
const C = {
  bg:            '#0A0B0C',
  surface:       '#15161A',
  surfaceBorder: 'rgba(255,255,255,0.08)',
  iconBg:        'rgba(255,255,255,0.06)',
  textPrimary:   '#F0F0F2',
  textSecondary: '#9A9AA2',
  textMuted:     '#62626A',
  primary:       '#D6D7DC',
  primarySoft:   'rgba(214,215,220,0.14)',
};

const CURATED_IDS = new Set(MOVES.map(m => m.id));

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function MoveDetailScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const [imgFailed, setImgFailed] = useState(false);

  const resolvedId = Array.isArray(id) ? id[0] : id;
  const exercise   = MOVES.find(m => m.id === resolvedId)
                  ?? LIBRARY.find(e => e.id === resolvedId);
  const isCurated  = resolvedId ? CURATED_IDS.has(resolvedId) : false;

  // ── Not found ─────────────────────────────────────────────────────────
  if (!exercise) {
    return (
      <View style={[s.c, { paddingTop: insets.top + 20, paddingHorizontal: 24 }]}>
        <TouchableOpacity style={s.backBtnStandalone} onPress={() => router.back()}>
          <ChevronLeft size={22} color={C.textPrimary} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={{ fontSize: 15, color: C.textSecondary, marginTop: 60, lineHeight: 22 }}>
          Exercise not found: {resolvedId}
        </Text>
      </View>
    );
  }

  const imageUri = exercise.images?.[0] ?? null;

  return (
    <View style={s.c}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + (isCurated ? 110 : 40) }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero image ────────────────────────────────────────────── */}
        <View style={s.heroWrap}>
          {imageUri && !imgFailed ? (
            <Image
              source={{ uri: imageUri }}
              style={s.heroImg}
              resizeMode="cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <View style={[s.heroImg, s.heroFallback]}>
              <Text style={s.heroFallbackTxt}>
                {exercise.name.slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(10,11,12,0.55)', 'rgba(10,11,12,1)']}
            locations={[0.5, 0.78, 1]}
            style={StyleSheet.absoluteFill}
          />
          <TouchableOpacity
            style={[s.backBtn, { top: insets.top + 12 }]}
            onPress={() => router.back()}
            activeOpacity={0.75}
          >
            <ChevronLeft size={22} color={C.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* ── Body ──────────────────────────────────────────────────── */}
        <View style={s.body}>

          {/* Name */}
          <Text style={s.moveName}>{exercise.name}</Text>

          {/* Meta chips: target · equipment · difficulty */}
          <View style={s.metaRow}>
            {!!exercise.target && (
              <Text style={s.metaChip}>{exercise.target}</Text>
            )}
            {!!exercise.equipment && exercise.equipment !== 'other' && (
              <Text style={s.metaChip}>{exercise.equipment}</Text>
            )}
            {!!exercise.difficulty && (
              <Text style={s.metaChip}>{exercise.difficulty}</Text>
            )}
          </View>

          {/* How to do it */}
          {exercise.instructions.length > 0 && (
            <>
              <Text style={s.sectionHeader}>How to do it</Text>
              <View style={s.stepsWrap}>
                {exercise.instructions.map((step, i) => (
                  <View key={i} style={[s.stepRow, i === exercise.instructions.length - 1 && { marginBottom: 0 }]}>
                    <View style={s.stepNumWrap}>
                      <Text style={s.stepNum}>{i + 1}</Text>
                    </View>
                    <Text style={s.stepText}>{step}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Muscles worked */}
          {(exercise.target || exercise.secondaryMuscles.length > 0) && (
            <>
              <Text style={s.sectionHeader}>Muscles worked</Text>
              <View style={s.chipRow}>
                {!!exercise.target && (
                  <View style={s.chipPrimary}>
                    <Text style={s.chipPrimaryTxt}>{exercise.target}</Text>
                  </View>
                )}
                {exercise.secondaryMuscles.map((m, i) => (
                  <View key={i} style={s.chip}>
                    <Text style={s.chipTxt}>{m}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* ── Check my form — curated moves only ────────────────────── */}
      {isCurated && (
        <View style={[s.formBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={s.formBtn}
            onPress={() => Alert.alert('Form check', 'Form check coming soon.')}
            activeOpacity={0.85}
          >
            <Text style={s.formBtnTxt}>Check my form</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: C.bg },

  // Hero
  heroWrap:       { position: 'relative', height: 360 },
  heroImg:        { width: '100%', height: 360, backgroundColor: C.surface },
  heroFallback:   { alignItems: 'center', justifyContent: 'center' },
  heroFallbackTxt: { fontSize: 52, fontWeight: '700', color: C.textMuted },

  backBtn: {
    position:        'absolute',
    left:            16,
    width:           38,
    height:          38,
    borderRadius:    19,
    backgroundColor: 'rgba(10,11,12,0.55)',
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.12)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  backBtnStandalone: {
    width:           38,
    height:          38,
    borderRadius:    19,
    backgroundColor: C.surface,
    borderWidth:     1,
    borderColor:     C.surfaceBorder,
    alignItems:      'center',
    justifyContent:  'center',
  },

  // Body
  body:     { paddingHorizontal: 22, paddingTop: 20 },
  moveName: {
    fontSize:      34,
    fontWeight:    '800',
    color:         C.textPrimary,
    letterSpacing: -0.8,
    lineHeight:    40,
    marginBottom:  10,
  },

  // Meta chips
  metaRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 30 },
  metaChip: {
    fontSize:         12,
    fontWeight:       '500',
    color:            C.textSecondary,
    backgroundColor:  C.surface,
    borderWidth:      1,
    borderColor:      C.surfaceBorder,
    paddingHorizontal: 10,
    paddingVertical:  4,
    borderRadius:     100,
    textTransform:    'capitalize',
  },

  // Section header
  sectionHeader: {
    fontSize:      12,
    fontWeight:    '700',
    color:         C.textMuted,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop:     8,
    marginBottom:  16,
  },

  // Steps
  stepsWrap: {
    backgroundColor: C.surface,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     C.surfaceBorder,
    padding:         18,
    marginBottom:    28,
  },
  stepRow: {
    flexDirection:  'row',
    gap:            14,
    marginBottom:   18,
    alignItems:     'flex-start',
  },
  stepNumWrap: {
    width:           26,
    height:          26,
    borderRadius:    13,
    backgroundColor: C.iconBg,
    borderWidth:     1,
    borderColor:     C.surfaceBorder,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
    marginTop:       1,
  },
  stepNum:  { fontSize: 12, fontWeight: '700', color: C.textSecondary },
  stepText: { flex: 1, fontSize: 15, color: C.textSecondary, lineHeight: 23, letterSpacing: -0.1 },

  // Muscle chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  chipPrimary: {
    backgroundColor:   C.primarySoft,
    borderWidth:       1,
    borderColor:       C.primary,
    paddingHorizontal: 12,
    paddingVertical:   6,
    borderRadius:      100,
  },
  chipPrimaryTxt: {
    fontSize:      13,
    fontWeight:    '600',
    color:         C.textPrimary,
    textTransform: 'capitalize',
  },
  chip: {
    backgroundColor:   C.surface,
    borderWidth:       1,
    borderColor:       C.surfaceBorder,
    paddingHorizontal: 12,
    paddingVertical:   6,
    borderRadius:      100,
  },
  chipTxt: {
    fontSize:      13,
    fontWeight:    '500',
    color:         C.textSecondary,
    textTransform: 'capitalize',
  },

  // Form check bar
  formBar: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    paddingHorizontal: 22,
    paddingTop:      16,
    backgroundColor: C.bg,
    borderTopWidth:  1,
    borderTopColor:  C.surfaceBorder,
  },
  formBtn: {
    backgroundColor: C.primary,
    borderRadius:    100,
    paddingVertical: 18,
    alignItems:      'center',
  },
  formBtnTxt: { fontSize: 16, fontWeight: '700', color: C.bg, letterSpacing: 0.2 },
});
