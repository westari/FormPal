import React, { createContext, useContext, useState } from 'react';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

/**
 * TabBarContext is kept for backward compat with index.tsx onboarding flow.
 * NativeTabs wraps UITabBarController — the bar cannot be hidden from JS.
 * During onboarding, index.tsx renders a full-screen overlay that visually
 * covers the bar. setTabsVisible still tracks state so the rest of the logic
 * (e.g. revealing the bar after onboarding) works without changes to index.tsx.
 */
export const TabBarContext = createContext<{
  visible: boolean;
  setTabsVisible: (v: boolean) => void;
}>({ visible: false, setTabsVisible: () => {} });

export const useTabBarVisibility = () => useContext(TabBarContext);

export default function TabLayout() {
  const [visible, setTabsVisible] = useState(false);

  return (
    <TabBarContext.Provider value={{ visible, setTabsVisible }}>
      <ThemeProvider value={DarkTheme}>
        <NativeTabs>
          <NativeTabs.Trigger name="index">
            <Icon sf="house.fill" />
            <Label>Home</Label>
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="train">
            <Icon sf="figure.strengthtraining.traditional" />
            <Label>Train</Label>
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="plus">
            <Icon sf="plus.circle.fill" />
            <Label>Plus</Label>
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="progress">
            <Icon sf="chart.line.uptrend.xyaxis" />
            <Label>Progress</Label>
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="profile">
            <Icon sf="person.fill" />
            <Label>Profile</Label>
          </NativeTabs.Trigger>
        </NativeTabs>
      </ThemeProvider>
    </TabBarContext.Provider>
  );
}
