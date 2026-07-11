import React from 'react';
import { Platform, StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

// Real iOS Liquid Glass where the OS supports it (iOS 26+, checked at
// runtime via isLiquidGlassAvailable — some iOS 26 betas shipped without the
// API, see expo/expo#40911), a frosted BlurView everywhere else (older iOS,
// Android). Drop-in replacement for a bare BlurView wherever a "floating
// glass pill/card" surface is wanted — same children/style contract.
export default function GlassSurface({
  children,
  style,
  tint,
  isInteractive = false,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tint?: 'light' | 'dark';
  isInteractive?: boolean;
}) {
  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return (
      <GlassView
        glassEffectStyle="regular"
        isInteractive={isInteractive}
        colorScheme={tint ?? 'auto'}
        style={style}
      >
        {children}
      </GlassView>
    );
  }
  return (
    <BlurView intensity={50} tint={tint ?? 'light'} experimentalBlurMethod="dimezisBlurView" style={style}>
      {children}
    </BlurView>
  );
}
