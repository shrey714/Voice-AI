import React, { useState } from 'react';
import { Platform, ActivityIndicator, StyleSheet, View, LayoutChangeEvent } from 'react-native';
import { Text } from 'react-native-paper';
import { type SFSymbol } from 'sf-symbols-typescript';
import { Host, Button as SwiftUIButton } from '@expo/ui/swift-ui';
import { buttonStyle, tint, disabled as disabledMod, frame, cornerRadius } from '@expo/ui/swift-ui/modifiers';
import PressableScale from './PressableScale';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';

export type LiquidButtonVariant = 'glass' | 'glassProminent' | 'destructive';

/**
 * A button that renders as real native iOS 26 Liquid Glass on iOS (via
 * @expo/ui's SwiftUI Button + `buttonStyle('glass'|'glassProminent')`) and
 * the app's existing themed pill button on Android — same drop-in pattern
 * as the native bottom tabs / native headers split elsewhere in this app.
 *
 * iOS only supports a text `label` + optional SF Symbol icon for the native
 * button (no arbitrary children) — keep usage to title/icon buttons, not
 * custom layouts, the same constraint the native tab bar icons already have.
 *
 * For `fullWidth`, the SwiftUI `frame` modifier's native implementation
 * (ViewModifierRegistry.swift's FrameModifier) takes an EXCLUSIVE branch:
 * if either `width` or `height` is set, `maxWidth` is silently ignored
 * entirely — `frame({ height, maxWidth: Infinity })` would do nothing, and
 * `Infinity` doesn't survive JSON bridge serialization anyway. So instead of
 * fighting SwiftUI's intrinsic content sizing, this measures its own
 * available width via onLayout and passes a concrete pixel `width` alongside
 * `height` in one frame() call — the one branch that's actually reliable.
 */
export default function LiquidButton({
  title,
  onPress,
  icon,
  variant = 'glassProminent',
  tintColor: tintColorOverride,
  disabled = false,
  loading = false,
  height = 50,
  fullWidth = true,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: SFSymbol;
  variant?: LiquidButtonVariant;
  /** Overrides the variant's default tint (primary/danger) — e.g. a success green. */
  tintColor?: string;
  disabled?: boolean;
  loading?: boolean;
  height?: number;
  fullWidth?: boolean;
  style?: any;
}) {
  const { colors, isDark } = useAppTheme();
  const isDisabled = disabled || loading;
  const [measuredWidth, setMeasuredWidth] = useState(0);

  if (Platform.OS === 'ios') {
    const swiftUIStyle = variant === 'destructive' ? 'glassProminent' : variant;
    const tintColor = tintColorOverride ?? (variant === 'destructive' ? colors.danger : variant === 'glassProminent' ? colors.primary : undefined);
    const onLayout = (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      if (fullWidth && w > 0 && w !== measuredWidth) setMeasuredWidth(w);
    };
    // Reserve layout space at `height` immediately so nothing jumps once the
    // real width is measured on the first layout pass.
    if (fullWidth && measuredWidth === 0) {
      return <View style={[{ height, width: '100%' }, style]} onLayout={onLayout} />;
    }
    return (
      <View style={[fullWidth && { width: '100%' }, { height }, style]} onLayout={fullWidth ? onLayout : undefined}>
        {/* colorScheme: this app's dark mode is its own setting, independent
            of the OS's — Host defaults to following the system otherwise. */}
        <Host colorScheme={isDark ? 'dark' : 'light'} style={{ width: fullWidth ? measuredWidth : undefined, height }} matchContents={!fullWidth ? { horizontal: true, vertical: true } : undefined}>
          <SwiftUIButton
            label={loading ? 'Loading…' : title}
            systemImage={loading ? undefined : icon}
            onPress={onPress}
            modifiers={[
              buttonStyle(swiftUIStyle),
              ...(tintColor ? [tint(tintColor)] : []),
              ...(fullWidth ? [frame({ width: measuredWidth, height })] : [frame({ height })]),
              cornerRadius(height / 2),
              disabledMod(isDisabled),
            ]}
          />
        </Host>
      </View>
    );
  }

  // Android / fallback — existing pill-button look, primary/danger fill.
  const bg = tintColorOverride ?? (variant === 'destructive' ? colors.danger : variant === 'glassProminent' ? colors.primary : colors.surfaceHigh);
  const fg = variant === 'glass' ? colors.text : '#fff';
  return (
    <PressableScale
      onPress={isDisabled ? undefined : onPress}
      style={[
        styles.androidBtn,
        { height, backgroundColor: bg, opacity: isDisabled ? 0.5 : 1, borderRadius: height / 2 },
        fullWidth && { width: '100%' },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <Text style={{ color: fg, fontFamily: fonts.bold, fontSize: 15 }}>{title}</Text>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  androidBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
});
