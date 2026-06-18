import React, { useState, createContext, useContext } from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Home, TrendingUp, User } from 'lucide-react-native';

export const TabBarContext = createContext<{ setTabsVisible: (v: boolean) => void }>({
  setTabsVisible: () => {},
});

export const useTabBarVisibility = () => useContext(TabBarContext);

// NativeTabs is only available in dev builds. Gracefully fall back to regular Tabs
// in Expo Go or if the module isn't compiled in.
let NativeTabs: any = null;
try {
  const m = require('expo-router/unstable-native-tabs');
  NativeTabs = m.NativeTabs;
} catch {}

const USE_NATIVE = Platform.OS === 'ios' && NativeTabs !== null;

const ACTIVE = '#F0F0F2';
const INACTIVE = '#62626A';

export default function TabsLayout() {
  // Starts hidden — index.tsx drives visibility via context
  const [tabsVisible, setTabsVisible] = useState(false);

  return (
    <TabBarContext.Provider value={{ setTabsVisible }}>
      <ThemeProvider value={DarkTheme}>
        {USE_NATIVE ? (
          // Real iOS system tab bar; liquid glass kicks in automatically on iOS 26+.
          // Tab visibility during onboarding can't be controlled here — tabs show throughout.
          <NativeTabs screenOptions={{ headerShown: false }}>
            <NativeTabs.Screen
              name="index"
              options={{ title: 'Home', tabBarIcon: { sfSymbol: 'house.fill' } }}
            />
            <NativeTabs.Screen
              name="progress"
              options={{ title: 'Progress', tabBarIcon: { sfSymbol: 'chart.line.uptrend.xyaxis' } }}
            />
            <NativeTabs.Screen
              name="profile"
              options={{ title: 'Profile', tabBarIcon: { sfSymbol: 'person.crop.circle' } }}
            />
          </NativeTabs>
        ) : (
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: ACTIVE,
              tabBarInactiveTintColor: INACTIVE,
              tabBarStyle: tabsVisible
                ? { backgroundColor: '#0A0B0C', borderTopColor: 'rgba(255,255,255,0.08)' }
                : { display: 'none' },
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: 'Home',
                tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
              }}
            />
            <Tabs.Screen
              name="progress"
              options={{
                title: 'Progress',
                tabBarIcon: ({ color, size }) => <TrendingUp size={size} color={color} />,
              }}
            />
            <Tabs.Screen
              name="profile"
              options={{
                title: 'Profile',
                tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
              }}
            />
          </Tabs>
        )}
      </ThemeProvider>
    </TabBarContext.Provider>
  );
}
