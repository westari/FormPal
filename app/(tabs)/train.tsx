import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function TrainScreen() {
  return (
    <View style={s.c}>
      <Text style={s.title}>Train</Text>
      <Text style={s.sub}>Coming soon</Text>
    </View>
  );
}

const s = StyleSheet.create({
  c:     { flex: 1, backgroundColor: '#0A0B0C', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '600', color: '#F0F0F2', letterSpacing: -0.4 },
  sub:   { fontSize: 14, color: '#62626A', marginTop: 6 },
});
