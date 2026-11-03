import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

// One accent for the active tab, one neutral grey for the rest. Every tab uses the same pair of SF Symbols
// (outline when idle, filled when selected) at the same weight, and the same label style, so the icons and the
// labels read as one set. The bar itself is the system's floating glass bar.
const ACTIVE = '#2E7DFF';
const IDLE = '#8E8E93';
const LABEL = { fontSize: 10, fontWeight: '600' as const };

export default function TabLayout() {
  return (
    <ThemeProvider value={DefaultTheme}>
      <NativeTabs
        tintColor={ACTIVE}
        iconColor={{ default: IDLE, selected: ACTIVE }}
        labelStyle={{ default: { ...LABEL, color: IDLE }, selected: { ...LABEL, color: ACTIVE } }}
      >
        <NativeTabs.Trigger name="index">
          <Icon sf={{ default: 'house', selected: 'house.fill' } as any} />
          <Label>Home</Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="train">
          <Icon sf={{ default: 'figure.strengthtraining.traditional', selected: 'figure.strengthtraining.traditional' } as any} />
          <Label>Train</Label>
        </NativeTabs.Trigger>

        {/* Center action tab — sf prop is the only reliable rendering path; no label */}
        <NativeTabs.Trigger name="plus">
          <Icon sf={{ default: 'plus.circle', selected: 'plus.circle.fill' } as any} />
          <Label hidden />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="progress">
          <Icon sf={{ default: 'chart.line.uptrend.xyaxis', selected: 'chart.line.uptrend.xyaxis' } as any} />
          <Label>Progress</Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="profile">
          <Icon sf={{ default: 'person', selected: 'person.fill' } as any} />
          <Label>Profile</Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </ThemeProvider>
  );
}
