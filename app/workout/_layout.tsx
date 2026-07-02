import { Slot } from 'expo-router';

// Transparent group layout — each workout screen is a root Stack entry.
// Keeps navigation simple: push/replace directly in root navigator.
export default function WorkoutLayout() {
  return <Slot />;
}
