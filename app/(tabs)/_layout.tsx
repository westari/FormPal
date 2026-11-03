import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

export default function TabLayout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <Icon sf={'house.fill' as any} />
          <Label>Home</Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="train">
          <Icon sf={'figure.strengthtraining.traditional' as any} />
          <Label>Train</Label>
        </NativeTabs.Trigger>

        {/* Center action tab — sf prop is the only reliable rendering path; no label */}
        <NativeTabs.Trigger name="plus">
          <Icon sf={'plus.circle.fill' as any} />
          <Label hidden />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="progress">
          <Icon sf={'chart.line.uptrend.xyaxis' as any} />
          <Label>Progress</Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="profile">
          <Icon sf={'person.fill' as any} />
          <Label>Profile</Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </ThemeProvider>
  );
}
