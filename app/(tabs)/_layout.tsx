import { Tabs } from 'expo-router';
import GlassTabBar from '../../components/GlassTabBar';

// The routes of this group. Every name must have a file in app/(tabs) (scripts/test-tabs.js checks that).
// "plus" is not a page any more: the + button on the bar opens the menu (components/PlusMenu.tsx); the file stays only so
// old links to it do not break, and it is hidden from the bar.
export const TAB_NAMES = ['index', 'train', 'plus', 'progress', 'profile'] as const;

// The bar itself: Home / Train / Progress / Profile in one real Liquid Glass capsule, the + on its own
// (components/GlassTabBar.tsx).
export default function TabLayout() {
  if (__DEV__) console.log('[TABS] layout mounted, tabs:', TAB_NAMES.join(', '), '| inactive tabs detached natively (web views stay loaded)');
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      // Every tab is built at launch and the other tabs are detached natively (the default). NEVER turn detachInactiveScreens off
      // here: the fallback then hides an inactive tab with display:none, React Native unmounts its web view and the page loads
      // again on every visit (the log showed "web view load start" on every Train / Profile tap, 0.4-0.6s each). With the native
      // detach the web view lives on, and a tab tap only brings the already-loaded page back. (components/GlassTabBar.tsx visits
      // each tab once at launch, behind a cover, so even the first open is instant.)
      screenOptions={{ headerShown: false, lazy: false, animation: 'none', sceneStyle: { backgroundColor: '#eeeef1' } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="train" />
      <Tabs.Screen name="plus" options={{ href: null, lazy: true }} />
      <Tabs.Screen name="progress" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
