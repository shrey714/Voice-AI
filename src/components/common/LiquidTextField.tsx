import React, { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Host, TextInput as UniversalTextInput, useNativeState } from '@expo/ui';
import { lineLimit } from '@expo/ui/swift-ui/modifiers';
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
 * Sizing follows the SDK docs' own examples
 * (docs.expo.dev/versions/v56.0.0/sdk/ui/universal/textinput): `Host` just
 * fills its parent via plain RN percentage layout (`width: '100%'`, no
 * `matchContents` for width), and `TextInput` fills the `Host` the same way
 * — neither needs a manually-measured pixel width via `onLayout`. An
 * earlier version of this file hand-measured width to work around a
 * `frame`/`width`-*modifier* gotcha from `LiquidButton`, but that gotcha is
 * for `@expo/ui`'s Compose/SwiftUI `modifiers` escape hatch specifically,
 * not for `Host`/`TextInput`'s own plain `style.width` — percentages work
 * fine there, and the manual-measure version was the actual cause of the
 * "fields pop in a beat after everything else, and briefly at the wrong
 * width" glitch (an empty placeholder View rendered until `onLayout` fired,
 * then remounted again once the real width settled).
 *
 * `style` carries the cross-platform look (background/radius/padding — the
 * universal component translates these to the right SwiftUI/Compose
 * modifiers per platform on its own). No border on either platform, and no
 * `glassEffect()` on iOS either — both were tried and both rendered as a
 * mismatched box nested inside the field instead of blending with it (glass:
 * doesn't fill the same bounds as the flat backing fill under it; Android's
 * `border()` modifier has no shape parameter, so it always draws a plain
 * rectangle regardless of this field's `borderRadius`). Flat `backgroundColor`
 * fill only, same look on both platforms.
 *
 * Android's vertical centering uses `Host matchContents={{ vertical: true }}`
 * (sizes the Host to the field's real, small content height instead of a
 * forced-tall box) plus the outer View's `justifyContent: 'center'` — same
 * pattern the SDK docs' own Android example uses.
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

  const fieldHeight = multiline ? Math.max(height, 80) : height;
  const isAndroid = Platform.OS === 'android';

  return (
    <View style={[{ height: fieldHeight, width: '100%', justifyContent: isAndroid ? 'center' : undefined }, style]}>
      {/* colorScheme: this app's dark mode is its own setting, independent
          of the OS's — Host defaults to following the system otherwise. */}
      <Host
        colorScheme={isDark ? 'dark' : 'light'}
        style={isAndroid ? undefined : { height: fieldHeight }}
        matchContents={isAndroid ? { vertical: true } : undefined}
      >
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
            ...(isAndroid ? {} : { height: fieldHeight }),
            paddingHorizontal: 14,
            paddingVertical: multiline ? 10 : (isAndroid ? 13 : 0),
            borderRadius: 12,
            // Flat fill on both platforms — a `glassEffect()` modifier was
            // tried on iOS layered on top of this same `backgroundColor`,
            // but the glass material doesn't fill the exact same bounds as
            // the flat backing fill underneath it, so it rendered as a
            // visibly mismatched inset box nested inside the field instead
            // of a single seamless surface. Matches Android's already-fine
            // flat-fill look instead.
            backgroundColor: colors.surfaceHigh + 'CC',
          }}
          modifiers={[
            ...(multiline && Platform.OS === 'ios' ? [lineLimit({ min: 3, max: 8 })] : []),
          ]}
        />
      </Host>
    </View>
  );
}
