import React, { createContext, useContext, useMemo, useState } from 'react';

/**
 * 'pro' switches the floating tab bar to the Eazee Pro palette so it matches
 * the paywall background it sits on. Screens that paint their own background
 * set this while they are visible.
 */
export type TabBarTheme = 'default' | 'pro';

type TabContextType = {
  glowingTab: string | null;
  setGlowingTab: (tab: string | null) => void;
  tabBarTheme: TabBarTheme;
  setTabBarTheme: (theme: TabBarTheme) => void;
};

const TabContext = createContext<TabContextType>({
  glowingTab: null,
  setGlowingTab: () => {},
  tabBarTheme: 'default',
  setTabBarTheme: () => {},
});

export const TabProvider = ({ children }: { children: React.ReactNode }) => {
  const [glowingTab, setGlowingTab] = useState<string | null>(null);
  const [tabBarTheme, setTabBarTheme] = useState<TabBarTheme>('default');

  const value = useMemo(
    () => ({ glowingTab, setGlowingTab, tabBarTheme, setTabBarTheme }),
    [glowingTab, tabBarTheme]
  );

  return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
};

export const useTabContext = () => useContext(TabContext);
