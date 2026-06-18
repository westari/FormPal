import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ProgressScreen() {
  return (
    <View style={s.c}>
      <Text style={s.t}>Progress — coming soon</Text>
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: '#0A0B0C', alignItems: 'center', justifyContent: 'center' },
  t: { fontSize: 16, color: '#9A9AA2' },
});
