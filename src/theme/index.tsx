import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
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
