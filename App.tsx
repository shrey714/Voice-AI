import 'react-native-url-polyfill/auto';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { PaperProvider, ActivityIndicator } from 'react-native-paper';
import { Text } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
import ErrorBoundary from './src/components/ErrorBoundary';
import OnboardingScreen from './src/screens/OnboardingScreen';
import SplashScreen from './src/screens/SplashScreen';
import PhoneAuthScreen from './src/screens/PhoneAuthScreen';
import ErrorScreen from './src/screens/ErrorScreen';
import { useAppStore } from './src/stores/useAppStore';
import { useOnlineShopStore } from './src/stores/useOnlineShopStore';
import { ThemeProvider, useAppTheme } from './src/theme';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { ConfirmDialogProvider } from './src/components/common/ConfirmDialogProvider';
import { usePushSetup } from './src/hooks/usePushSetup';
import { fonts } from './src/theme/typography';

function AppLoader() {
  usePushSetup();
  const { loadProducts, loadBills, loadExpenses, loadSettings, loadSuppliers, loadReturns, loadTemplates, loadPurchases, loadSupplierLedger, loadActiveStockTake, setDataReady } = useAppStore();
  const onboardingDone = useAppStore(state => state.settings.onboardingDone);
  const { paperTheme } = useAppTheme();
  const { isSignedIn, loading: authLoading } = useAuth();
  const fetchShopConfig = useOnlineShopStore(state => state.fetchShopConfig);
  // Settings load first (needed for theme + onboarding gate); the rest loads in the
  // background so the app shell appears immediately and screens show skeletons.
  const [settingsReady, setSettingsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Right after a fresh sign-in (not a cold start that resumes an already-valid
  // session), pull any existing cloud shop profile before deciding whether
  // onboarding is needed — a returning shopkeeper (or one who just did a
  // "Log out" factory reset on this device) already has an `online_shops`
  // row, and fetchShopConfig's mirror marks onboardingDone true when it finds
  // one, so they skip straight to the main app instead of redoing setup.
  const [syncingAfterLogin, setSyncingAfterLogin] = useState(false);
  const wasSignedIn = useRef(false);
  const hasResolvedAuthOnce = useRef(false);
  useEffect(() => {
    if (authLoading) return;
    if (isSignedIn && !wasSignedIn.current && hasResolvedAuthOnce.current) {
      setSyncingAfterLogin(true);
      fetchShopConfig().finally(() => setSyncingAfterLogin(false));
    }
    wasSignedIn.current = isSignedIn;
    hasResolvedAuthOnce.current = true;
  }, [isSignedIn, authLoading]);

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
      <ConfirmDialogProvider>
      {error ? (
        <ErrorScreen message={error} onRetry={handleRetry} />
      ) : !settingsReady || authLoading ? (
        <SplashScreen />
      ) : !isSignedIn ? (
        <PhoneAuthScreen />
      ) : syncingAfterLogin ? (
        <SplashScreen />
      ) : !onboardingDone ? (
        <OnboardingScreen />
      ) : (
        <AiProvider>
          <AppNavigator />
        </AiProvider>
      )}
      </ConfirmDialogProvider>
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
          <ErrorBoundary>
            <AuthProvider>
              <AppLoader />
            </AuthProvider>
          </ErrorBoundary>
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
