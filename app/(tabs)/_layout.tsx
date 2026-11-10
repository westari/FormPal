import { Tabs } from 'expo-router';
import GlassTabBar from '../../components/GlassTabBar';

// The routes of this group. Every name must have a file in app/(tabs) (scripts/test-tabs.js checks that).
// "plus" is not a page any more: the + button on the bar opens the menu (components/PlusMenu.tsx); the file stays only so
// old links to it do not break, and it is hidden from the bar.
export const TAB_NAMES = ['index', 'train', 'plus', 'progress', 'profile'] as const;

// The bar itself: Home / Train / Progress / Profile in one real Liquid Glass capsule, the + on its own
// (components/GlassTabBar.tsx).
export default function TabLayout() {
  if (__DEV__) console.log('[TABS] layout mounted, tabs:', TAB_NAMES.join(', '));
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: '#eeeef1' } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="train" />
      <Tabs.Screen name="plus" options={{ href: null }} />
      <Tabs.Screen name="progress" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
