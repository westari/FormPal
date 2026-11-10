/**
 * app/(tabs)/plus.tsx
 *
 * Not a page any more. The + on the tab bar opens a menu drawn by the bar itself (components/PlusMenu.tsx: the page behind
 * is blurred, real Liquid Glass buttons). This file only exists so the route name stays registered; it is hidden from the
 * bar, and if something ever navigates here it just goes back to Home.
 */
import { Redirect } from 'expo-router';

export default function PlusRedirect() {
  return <Redirect href={'/(tabs)' as any} />;
}
