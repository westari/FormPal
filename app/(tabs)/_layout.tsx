import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

// Tab icons: every tab uses the same OUTLINE weight when idle (it used to mix filled
// house/person/plus with the line-only chart and dumbbell figure), and the filled
// variant only when selected, so stroke weight matches the label weight and the
// active tab is the only thing that changes.
export default function TabLayout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <Icon sf={{ default: 'house', selected: 'house.fill' } as any} />
          <Label>Home</Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="train">
          <Icon sf={'figure.strengthtraining.traditional' as any} />
          <Label>Train</Label>
        </NativeTabs.Trigger>

        {/* Center action tab — sf prop is the only reliable rendering path; no label */}
        <NativeTabs.Trigger name="plus">
          <Icon sf={{ default: 'plus.circle', selected: 'plus.circle.fill' } as any} />
          <Label hidden />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="progress">
          <Icon sf={'chart.line.uptrend.xyaxis' as any} />
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
