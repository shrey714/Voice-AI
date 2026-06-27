import 'react-native-url-polyfill/auto';
import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { PaperProvider, ActivityIndicator } from 'react-native-paper';
import { Text } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import {
  useFonts,
  NunitoSans_400Regular,
  NunitoSans_500Medium,
  NunitoSans_600SemiBold,
  NunitoSans_700Bold,
  NunitoSans_800ExtraBold,
  NunitoSans_900Black,
} from '@expo-google-fonts/nunito-sans';
import { LibreBaskerville_400Regular } from '@expo-google-fonts/libre-baskerville';
import AppNavigator from './src/navigation/AppNavigator';
import AiProvider from './src/components/AiProvider';
import OnboardingScreen from './src/screens/OnboardingScreen';
import SplashScreen from './src/screens/SplashScreen';
import ErrorScreen from './src/screens/ErrorScreen';
import { useAppStore } from './src/stores/useAppStore';
import { ThemeProvider, useAppTheme } from './src/theme';
import { fonts } from './src/theme/typography';

function AppLoader() {
  const { loadProducts, loadBills, loadExpenses, loadSettings, loadSuppliers, loadReturns, loadTemplates, loadPurchases, loadSupplierLedger, loadActiveStockTake, setDataReady } = useAppStore();
  const onboardingDone = useAppStore(state => state.settings.onboardingDone);
  const { paperTheme } = useAppTheme();
  // Settings load first (needed for theme + onboarding gate); the rest loads in the
  // background so the app shell appears immediately and screens show skeletons.
  const [settingsReady, setSettingsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      setError(null);
      setDataReady(false);
      setSettingsReady(false);
      await loadSettings();
      setSettingsReady(true);
      await Promise.all([loadProducts(), loadBills(), loadExpenses(), loadSuppliers(), loadReturns(), loadTemplates(), loadPurchases(), loadSupplierLedger(), loadActiveStockTake()]);
      setDataReady(true);
    } catch (e: any) {
      setError(e?.message || 'Unknown error');
    }
  }, []);

  useEffect(() => { loadAll(); }, []);

  const handleRetry = () => { loadAll(); };

  return (
    <PaperProvider theme={paperTheme}>
      {error ? (
        <ErrorScreen message={error} onRetry={handleRetry} />
      ) : !settingsReady ? (
        <SplashScreen />
      ) : !onboardingDone ? (
        <OnboardingScreen />
      ) : (
        <AiProvider>
          <AppNavigator />
        </AiProvider>
      )}
    </PaperProvider>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    NunitoSans_400Regular,
    NunitoSans_500Medium,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
    NunitoSans_800ExtraBold,
    NunitoSans_900Black,
    LibreBaskerville_400Regular,
  });

  // Keep the native splash up until fonts are ready — avoids FOUT
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <BottomSheetModalProvider>
            <AppLoader />
          </BottomSheetModalProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  splashCard: { alignItems: 'center', padding: 32 },
  splashTitle: { fontFamily: fonts.extraBold, fontSize: 28, marginTop: 12, letterSpacing: 0.5 },
  splashSub: { fontFamily: fonts.regular, fontSize: 14, marginTop: 6 },
});
