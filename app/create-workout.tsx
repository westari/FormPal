/**
 * app/create-workout.tsx
 *
 * "Create workout" — build a custom workout (name + pick exercises from the
 * real 56-exercise EXERCISE_CATALOG, same catalog app/log-session.tsx and
 * app/exercise-picker.tsx already use) and save it into the real plan as the
 * next session (inserted at plan.currentWorkoutIndex).
 *
 * SCOPE NOTE: same as app/my-workouts.tsx — the new Claude-Design artboard
 * (assets/app screens/createworkout.html) is a fully self-contained
 * interactive component with its own internal state; built as a plain
 * native screen instead given tonight's time budget. See
 * OVERNIGHT_REPORT.md.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, FlatList, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { EXERCISE_CATALOG, type ExerciseId } from '../constants/exercises';
import { loadPlan, savePlan } from '../lib/planStorage';
import type { PlannedExercise, Workout } from '../types/plan';

const C = { bg: '#0A0B0C', surface: '#15161A', border: 'rgba(255,255,255,0.08)', text: '#F0F0F2', muted: '#9A9AA2', accent: '#67CEFF' };

interface PickedRow { exerciseId: ExerciseId; displayName: string; sets: number; reps: number }

export default function CreateWorkoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<PickedRow[]>([]);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const already = new Set(picked.map(p => p.exerciseId));
    return EXERCISE_CATALOG.filter(def =>
      !already.has(def.id as ExerciseId) && (!q || def.displayName.toLowerCase().includes(q))
    ).slice(0, 20);
  }, [query, picked]);

  const addExercise = useCallback((id: ExerciseId, displayName: string, defaultSets: number, defaultReps: number) => {
    setPicked(prev => [...prev, { exerciseId: id, displayName, sets: defaultSets, reps: defaultReps }]);
    setQuery('');
  }, []);

  const bump = useCallback((id: ExerciseId, key: 'sets' | 'reps', delta: number) => {
    setPicked(prev => prev.map(p => p.exerciseId === id ? { ...p, [key]: Math.max(1, Math.min(key === 'sets' ? 10 : 50, p[key] + delta)) } : p));
  }, []);

  const removeExercise = useCallback((id: ExerciseId) => {
    setPicked(prev => prev.filter(p => p.exerciseId !== id));
  }, []);

  const save = useCallback(async () => {
    if (!name.trim()) { Alert.alert('Name your workout', 'Give this workout a name before saving.'); return; }
    if (picked.length === 0) { Alert.alert('Add an exercise', 'Add at least one exercise before saving.'); return; }
    setSaving(true);
    try {
      const plan = await loadPlan();
      if (!plan) { Alert.alert('No plan yet', "You need a generated plan before you can add a custom workout to it."); setSaving(false); return; }
      const exercises: PlannedExercise[] = picked.map(p => ({
        exerciseId: p.exerciseId,
        displayName: p.displayName,
        targetSets: p.sets,
        targetReps: p.reps,
        restSeconds: 60,
        currentVariationId: p.exerciseId,
      }));
      const newWorkout: Workout = {
        id: `custom-${Date.now()}`,
        sessionNumber: plan.workouts.length + 1,
        splitLabel: name.trim(),
        rationale: 'Custom workout you built yourself.',
        exercises,
        completed: false,
      };
      const nextWorkouts = [...plan.workouts];
      nextWorkouts.splice(plan.currentWorkoutIndex, 0, newWorkout);
      await savePlan({ ...plan, workouts: nextWorkouts });
      router.back();
    } catch (e) {
      Alert.alert('Something went wrong', 'Could not save this workout. Try again.');
    }
    setSaving(false);
  }, [name, picked, router]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()} hitSlop={10}>
          <SymbolView name="xmark" size={16} tintColor={C.text} type="monochrome" style={{ width: 16, height: 16 }} />
        </Pressable>
        <Text style={s.headerTitle}>Create workout</Text>
        <Pressable onPress={save} disabled={saving} hitSlop={10}>
          <Text style={[s.saveTxt, saving && { opacity: 0.4 }]}>Save</Text>
        </Pressable>
      </View>

      <View style={{ padding: 16 }}>
        <TextInput
          style={s.nameInput}
          placeholder="Workout name"
          placeholderTextColor={C.muted}
          value={name}
          onChangeText={setName}
        />
      </View>

      {picked.length > 0 && (
        <View style={{ paddingHorizontal: 16, gap: 10, marginBottom: 8 }}>
          {picked.map(p => (
            <View key={p.exerciseId} style={s.pickedRow}>
              <Text style={s.pickedName} numberOfLines={1}>{p.displayName}</Text>
              <View style={s.stepperGroup}>
                <Pressable onPress={() => bump(p.exerciseId, 'sets', -1)} hitSlop={8}><Text style={s.stepperBtn}>–</Text></Pressable>
                <Text style={s.stepperVal}>{p.sets} sets</Text>
                <Pressable onPress={() => bump(p.exerciseId, 'sets', 1)} hitSlop={8}><Text style={s.stepperBtn}>+</Text></Pressable>
              </View>
              <View style={s.stepperGroup}>
                <Pressable onPress={() => bump(p.exerciseId, 'reps', -1)} hitSlop={8}><Text style={s.stepperBtn}>–</Text></Pressable>
                <Text style={s.stepperVal}>{p.reps} reps</Text>
                <Pressable onPress={() => bump(p.exerciseId, 'reps', 1)} hitSlop={8}><Text style={s.stepperBtn}>+</Text></Pressable>
              </View>
              <Pressable onPress={() => removeExercise(p.exerciseId)} hitSlop={8}>
                <SymbolView name="trash" size={15} tintColor="#e0454f" type="monochrome" style={{ width: 15, height: 15 }} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={{ paddingHorizontal: 16 }}>
        <TextInput
          style={s.searchInput}
          placeholder="Search exercises to add…"
          placeholderTextColor={C.muted}
          value={query}
          onChangeText={setQuery}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
        renderItem={({ item }) => (
          <Pressable style={s.catalogRow} onPress={() => addExercise(item.id as ExerciseId, item.displayName, item.defaultSets, item.defaultReps)}>
            <Text style={s.catalogName}>{item.displayName}</Text>
            <SymbolView name="plus.circle.fill" size={20} tintColor={C.accent} type="monochrome" style={{ width: 20, height: 20 }} />
          </Pressable>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  saveTxt: { fontSize: 15, fontWeight: '700', color: C.accent },
  nameInput: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, fontWeight: '600', color: C.text },
  searchInput: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14.5, color: C.text },
  pickedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 10 },
  pickedName: { flex: 1, fontSize: 13.5, fontWeight: '600', color: C.text },
  stepperGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepperBtn: { fontSize: 16, fontWeight: '700', color: C.accent, width: 18, textAlign: 'center' },
  stepperVal: { fontSize: 11.5, color: C.muted, width: 46, textAlign: 'center' },
  catalogRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  catalogName: { fontSize: 14.5, color: C.text },
});
