import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Updates from 'expo-updates';
import { BRAND } from './common/brandKit';
import { fonts } from '../theme/typography';

interface State {
  crashed: boolean;
  error: Error | null;
}

async function restartApp() {
  try {
    await Updates.reloadAsync();
  } catch {
    // reloadAsync throws in Expo Go — nothing to do, state reset already fired
  }
}

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { crashed: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { crashed: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Render crash caught:', error.message);
    console.error(info.componentStack);
  }

  handleRestart = () => {
    // First try to reset React tree (works in all environments)
    this.setState({ crashed: false, error: null });
    // Also trigger a full JS reload in dev
    restartApp();
  };

  render() {
    if (!this.state.crashed) return this.props.children;

    const msg = __DEV__ && this.state.error ? this.state.error.message : undefined;

    return (
      <LinearGradient
        colors={[BRAND.sage, BRAND.sageDark]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={s.fill}
      >
        <View style={s.center}>
          <View style={s.iconCircle}>
            <Ionicons name="warning-outline" size={44} color={BRAND.cream} />
          </View>
          <Text style={s.title}>Something went wrong</Text>
          <Text style={s.sub}>
            {msg || 'The app hit an unexpected error. Tap below to restart.'}
          </Text>
          <TouchableOpacity style={s.btn} onPress={this.handleRestart} activeOpacity={0.85}>
            <Ionicons name="refresh" size={18} color={BRAND.sageDark} />
            <Text style={s.btnText}>Restart App</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  iconCircle: { width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  title: { fontFamily: fonts.extraBold, fontSize: 24, color: BRAND.cream, textAlign: 'center' },
  sub: { fontFamily: fonts.medium, fontSize: 14, color: 'rgba(255,255,255,0.82)', textAlign: 'center', lineHeight: 22, marginTop: 12 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND.cream, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 30, marginTop: 30 },
  btnText: { fontFamily: fonts.extraBold, fontSize: 15, color: BRAND.sageDark },
});
