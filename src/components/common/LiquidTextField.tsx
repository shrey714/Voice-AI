import React, { useEffect, useState } from 'react';
import { Platform, View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Host, TextInput as UniversalTextInput, useNativeState } from '@expo/ui';
import { glassEffect, lineLimit } from '@expo/ui/swift-ui/modifiers';
import { border as androidBorder } from '@expo/ui/jetpack-compose/modifiers';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';

export type LiquidTextFieldKeyboard = 'default' | 'numeric' | 'phone-pad' | 'email-address' | 'decimal-pad';

/**
 * A single-line text input that renders as real native iOS 26 Liquid Glass
 * on iOS and a real native Jetpack Compose `BasicTextField` on Android — one
 * shared render path via `@expo/ui`'s stable SDK 56 universal `TextInput`
 * (`Host`/`TextInput` from `@expo/ui`, not the old platform-split
 * `@expo/ui/swift-ui`-only import), instead of a plain RN `TextInput`
 * fallback on Android.
 *
 * `style` carries the cross-platform look (background/border/radius/padding
 * — the universal component translates these to the right SwiftUI/Compose
 * modifiers per platform on its own). The `modifiers` escape hatch is used
 * only for the truly platform-exclusive pieces that have no cross-platform
 * equivalent: iOS's `glassEffect` material, and Android's `border` (kept
 * separate from `style.borderWidth`/`borderColor` since iOS deliberately has
 * no border — just background + glass).
 *
 * `TextInput` is properly controlled via an `ObservableState<string>`
 * (`useNativeState` + `value`/`onChangeText`), no imperative ref workaround
 * needed.
 */
export default function LiquidTextField({
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  autoFocus = false,
  height = 48,
  multiline = false,
  style,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: LiquidTextFieldKeyboard;
  autoFocus?: boolean;
  /** Fixed height for a single-line field; ignored (min height only) when `multiline`. */
  height?: number;
  /** Grows vertically instead of scrolling horizontally — same intent as RN TextInput's `multiline`. */
  multiline?: boolean;
  style?: any;
}) {
  const { colors, isDark } = useAppTheme();
  const text = useNativeState(value);
  useEffect(() => {
    // `.value` (not `.get()`/`.set()`) — those methods exist on the real
    // native `ObservableState` but aren't part of the universal `@expo/ui`
    // entrypoint's *type* (only its per-platform `.ios`/`.android` type
    // files declare them, which `tsc`'s module resolution doesn't pick for
    // a bare `@expo/ui` import the way Metro's bundler resolution does).
    // `.value` is the one accessor declared on every variant, so it's both
    // correctly typed and functionally identical here.
    if (value !== text.value) {
      text.value = value;
    }
  }, [value]);

  const [measuredWidth, setMeasuredWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== measuredWidth) setMeasuredWidth(w);
  };

  const fieldHeight = multiline ? Math.max(height, 80) : height;

  // Reserve layout space immediately so nothing jumps once the real width is
  // measured on the first layout pass — same pattern LiquidButton uses for
  // the same reason (the native `frame`/`width` modifiers need a concrete
  // pixel width, not `maxWidth: Infinity`, which doesn't survive the JSON
  // bridge).
  if (measuredWidth === 0) {
    return <View style={[{ height: fieldHeight, width: '100%' }, style]} onLayout={onLayout} />;
  }

  return (
    // onLayout lives on this plain wrapping View, not `Host` — `Host` is a
    // custom Fabric-hosted view (see LiquidButton/LiquidBottomSheet for the
    // same established gotcha) and its RN prop passthrough doesn't reliably
    // behave like a plain View's.
    <View style={[{ height: fieldHeight, width: '100%' }, style]} onLayout={onLayout}>
    {/* `key={measuredWidth}`: same reasoning as LiquidButton — Host's
        native content doesn't reliably re-layout from a post-mount
        style.width change, so remount fresh whenever the real measured
        width lands instead of risking it getting stuck at an early,
        too-small size.
        colorScheme: this app's dark mode is its own setting, independent of
        the OS's — Host defaults to following the system otherwise. */}
    <Host key={measuredWidth} colorScheme={isDark ? 'dark' : 'light'} style={{ height: fieldHeight, width: measuredWidth }}>
      <UniversalTextInput
        value={text}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoFocus={autoFocus}
        multiline={multiline}
        keyboardType={keyboardType}
        textStyle={{ fontFamily: fonts.regular, fontSize: 15, color: colors.text }}
        style={{
          width: measuredWidth,
          height: fieldHeight,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 10 : 0,
          borderRadius: 12,
          // Backing the field with the app's own `surfaceHigh` tone (dimmed
          // via alpha) before iOS's glass modifier keeps it legible against
          // an already-transparent `LiquidBottomSheet` instead of the glass
          // reading as nearly invisible with nothing solid behind it.
          backgroundColor: colors.surfaceHigh + 'CC',
        }}
        modifiers={[
          Platform.OS === 'ios'
            ? glassEffect({ glass: { variant: 'regular' }, shape: 'roundedRectangle', cornerRadius: 12 })
            : androidBorder(StyleSheet.hairlineWidth, colors.border),
          ...(multiline && Platform.OS === 'ios' ? [lineLimit({ min: 3, max: 8 })] : []),
        ]}
      />
    </Host>
    </View>
  );
}
