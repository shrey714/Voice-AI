import React, { useState } from 'react';
import { Platform, ActivityIndicator, StyleSheet, View, LayoutChangeEvent } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { type SFSymbol } from 'sf-symbols-typescript';
import { Host, Button as SwiftUIButton } from '@expo/ui/swift-ui';
import { buttonStyle, tint, disabled as disabledMod, frame, cornerRadius } from '@expo/ui/swift-ui/modifiers';
import PressableScale from './PressableScale';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';

export type LiquidButtonVariant = 'glass' | 'glassProminent' | 'destructive';

// The `icon` prop is an SF Symbol name (iOS-only concept) — Android has no
// equivalent, so every LiquidButton call site that passes `icon` silently
// rendered text-only on Android. Mapping the SF Symbols actually used across
// the app to their closest Ionicons equivalent means Android buttons get an
// icon too instead of just being a strictly worse rendering of the same
// button. Unmapped/future symbols fall back to text-only (safer than
// guessing a mismatched icon).
const SF_TO_IONICON: Partial<Record<SFSymbol, React.ComponentProps<typeof Ionicons>['name']>> = {
  'arrow.right': 'arrow-forward',
  'arrow.uturn.backward': 'arrow-undo-outline',
  'bag.fill': 'bag',
  'checkmark': 'checkmark',
  'checkmark.circle': 'checkmark-circle-outline',
  'checkmark.circle.fill': 'checkmark-circle',
  'doc.text': 'document-text-outline',
  'eye': 'eye-outline',
  'icloud.and.arrow.down': 'cloud-download-outline',
  'icloud.and.arrow.up': 'cloud-upload-outline',
  'lock.fill': 'lock-closed',
  'play.fill': 'play',
  'plus': 'add',
  'qrcode': 'qr-code-outline',
  'square.and.arrow.down': 'download-outline',
  'square.and.arrow.up': 'share-outline',
  'square.grid.2x2': 'grid-outline',
  'xmark': 'close',
};

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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon && SF_TO_IONICON[icon] && <Ionicons name={SF_TO_IONICON[icon]!} size={18} color={fg} />}
          <Text style={{ color: fg, fontFamily: fonts.bold, fontSize: 15 }}>{title}</Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  androidBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
});
