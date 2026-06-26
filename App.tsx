import 'react-native-url-polyfill/auto';
import React, { useEffect, useState } from 'react';
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
import OnboardingScreen from './src/screens/OnboardingScreen';
import { useAppStore } from './src/stores/useAppStore';
import { ThemeProvider, useAppTheme } from './src/theme';
import { fonts } from './src/theme/typography';

function AppLoader() {
  const { loadProducts, loadBills, loadExpenses, loadSettings, loadSuppliers, loadReturns, loadTemplates, loadPurchases, loadSupplierLedger, loadActiveStockTake } = useAppStore();
  const onboardingDone = useAppStore(state => state.settings.onboardingDone);
  const { colors, paperTheme, isDark } = useAppTheme();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await loadSettings();
        await Promise.all([loadProducts(), loadBills(), loadExpenses(), loadSuppliers(), loadReturns(), loadTemplates(), loadPurchases(), loadSupplierLedger(), loadActiveStockTake()]);
        setReady(true);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, []);

  return (
    <PaperProvider theme={paperTheme}>
      {error ? (
        <View style={[styles.center, { backgroundColor: colors.bg }]}>
          <Text style={{ color: colors.danger, textAlign: 'center', padding: 24 }}>Error: {error}</Text>
        </View>
      ) : !ready ? (
        <View style={[styles.center, { backgroundColor: colors.bg }]}>
          <MotiView
            from={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'timing', duration: 300 }}
            style={styles.splashCard}
          >
            <Text style={{ fontSize: 56, textAlign: 'center' }}>🏪</Text>
            <Text style={[styles.splashTitle, { color: colors.primary }]}>Shopkeeper AI</Text>
            <Text style={[styles.splashSub, { color: colors.textMuted }]}>Loading your shop...</Text>
            <ActivityIndicator color={colors.primary} size="small" style={{ marginTop: 16 }} />
          </MotiView>
        </View>
      ) : !onboardingDone ? (
        <OnboardingScreen />
      ) : (
        <AppNavigator />
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
