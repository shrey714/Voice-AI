import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme, Appearance } from 'react-native';
import { MD3LightTheme, MD3DarkTheme, configureFonts } from 'react-native-paper';
import { fonts } from './typography';
import { LIGHT, DARK, AppColors } from './colors';
import * as db from '../db/database';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  colors: AppColors;
  isDark: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  paperTheme: typeof MD3LightTheme;
}

const paperFonts = configureFonts({
  config: {
    displayLarge:   { fontFamily: fonts.black },
    displayMedium:  { fontFamily: fonts.extraBold },
    displaySmall:   { fontFamily: fonts.bold },
    headlineLarge:  { fontFamily: fonts.extraBold },
    headlineMedium: { fontFamily: fonts.bold },
    headlineSmall:  { fontFamily: fonts.bold },
    titleLarge:     { fontFamily: fonts.bold },
    titleMedium:    { fontFamily: fonts.semiBold },
    titleSmall:     { fontFamily: fonts.semiBold },
    labelLarge:     { fontFamily: fonts.bold },
    labelMedium:    { fontFamily: fonts.semiBold },
    labelSmall:     { fontFamily: fonts.medium },
    bodyLarge:      { fontFamily: fonts.regular },
    bodyMedium:     { fontFamily: fonts.regular },
    bodySmall:      { fontFamily: fonts.regular },
  },
});

const ThemeContext = createContext<ThemeContextType>({
  colors: LIGHT,
  isDark: false,
  themeMode: 'system',
  setThemeMode: async () => {},
  paperTheme: MD3LightTheme,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    db.getSetting('theme_mode').then(val => {
      if (val === 'light' || val === 'dark' || val === 'system') {
        setThemeModeState(val);
      }
    });
  }, []);

  const isDark = themeMode === 'system' ? systemScheme === 'dark' : themeMode === 'dark';
  const colors = isDark ? DARK : LIGHT;

  // This app's dark mode is its own setting, independent of the OS's — but
  // native chrome we don't fully control (system sheet presentation
  // backgrounds, alerts, etc. — anything @expo/ui's `Host`/SwiftUI
  // environment-based colorScheme doesn't reach, confirmed by reading
  // HostView.swift's ColorSchemeModifier: it only sets a SwiftUI
  // `.environment(\.colorScheme, …)`, which content respects but system
  // chrome derives its appearance from the real UIKit/window trait
  // collection instead) only follows the ACTUAL OS appearance unless that
  // trait collection itself is overridden. `Appearance.setColorScheme` is
  // RN's own supported API for exactly this — it forces the real native
  // trait collection app-wide, so anything native (including sheets)
  // correctly follows our in-app choice instead of just the OS's. Pass
  // 'unspecified' when following system so it stops overriding and reverts
  // to actually tracking the OS, rather than getting stuck on a stale forced
  // value (this RN version's `ColorSchemeName` type is 'light' | 'dark' |
  // 'unspecified' — no `null` option, despite some older docs/examples).
  useEffect(() => {
    Appearance.setColorScheme(themeMode === 'system' ? 'unspecified' : (isDark ? 'dark' : 'light'));
  }, [themeMode, isDark]);

  const paperTheme = isDark
    ? {
        ...MD3DarkTheme,
        fonts: paperFonts,
        colors: {
          ...MD3DarkTheme.colors,
          primary: colors.primary,
          background: colors.bg,
          surface: colors.surface,
          surfaceVariant: colors.surfaceHigh,
          onSurface: colors.text,
          outline: colors.border,
        },
      }
    : {
        ...MD3LightTheme,
        fonts: paperFonts,
        colors: {
          ...MD3LightTheme.colors,
          primary: colors.primary,
          background: colors.bg,
          surface: colors.surface,
          surfaceVariant: colors.surfaceHigh,
          onSurface: colors.text,
          outline: colors.border,
        },
      };

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await db.setSetting('theme_mode', mode);
  };

  return (
    <ThemeContext.Provider value={{ colors, isDark, themeMode, setThemeMode, paperTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
