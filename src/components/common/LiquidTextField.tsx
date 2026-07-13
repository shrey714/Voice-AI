import React, { useEffect, useState } from 'react';
import { Platform, TextInput, View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Host, TextField as SwiftUITextField, useNativeState } from '@expo/ui/swift-ui';
import { glassEffect, textFieldStyle, padding, keyboardType as keyboardTypeMod, frame, lineLimit, background, shapes } from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';

export type LiquidTextFieldKeyboard = 'default' | 'numeric' | 'phone-pad' | 'email-address' | 'decimal-pad';

/**
 * A single-line text input that renders as real native iOS 26 Liquid Glass
 * on iOS (via @expo/ui's SwiftUI `TextField` + the `glassEffect` modifier —
 * there's no `textFieldStyle('glass')`, glass is a general-purpose modifier
 * applied to the field itself) and the app's existing themed `Input` look
 * on Android.
 *
 * As of stable @expo/ui (SDK 56), `TextField` is properly controlled via an
 * `ObservableState<string>` (`useNativeState` + `text`/`onTextChange`)
 * instead of the old `defaultValue`-only API, so it no longer needs the
 * imperative `setText`-via-ref workaround this used to require.
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
    if (Platform.OS === 'ios' && value !== text.get()) {
      text.set(value);
    }
  }, [value]);

  const [measuredWidth, setMeasuredWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== measuredWidth) setMeasuredWidth(w);
  };

  if (Platform.OS === 'ios') {
    const fieldHeight = multiline ? Math.max(height, 80) : height;

    // Reserve layout space immediately so nothing jumps once the real width
    // is measured on the first layout pass — same pattern LiquidButton uses
    // for the same reason (SwiftUI's `frame` needs a concrete pixel width,
    // not `maxWidth: Infinity`, which doesn't survive the JSON bridge).
    if (measuredWidth === 0) {
      return <View style={[{ height: fieldHeight, width: '100%' }, style]} onLayout={onLayout} />;
    }

    return (
      // onLayout lives on this plain wrapping View, not `Host` — `Host` is a
      // custom Fabric-hosted view (see LiquidButton/LiquidBottomSheet for
      // the same established gotcha) and its RN prop passthrough doesn't
      // reliably behave like a plain View's.
      <View style={[{ height: fieldHeight, width: '100%' }, style]} onLayout={onLayout}>
      {/* `key={measuredWidth}`: same reasoning as LiquidButton — Host's
          SwiftUI content doesn't reliably re-layout from a post-mount
          style.width change, so remount fresh whenever the real measured
          width lands instead of risking it getting stuck at an early,
          too-small size.
          colorScheme: this app's dark mode is its own setting, independent
          of the OS's — Host defaults to following the system otherwise. */}
      <Host key={measuredWidth} colorScheme={isDark ? 'dark' : 'light'} style={{ height: fieldHeight, width: measuredWidth }}>
        <SwiftUITextField
          text={text}
          placeholder={placeholder}
          autoFocus={autoFocus}
          axis={multiline ? 'vertical' : 'horizontal'}
          onTextChange={onChangeText}
          modifiers={[
            // Order matters a lot here, and it's subtle: `padding` insets
            // whatever it's applied to at that point in the chain, and
            // `frame` locks in a size from that point onward — so `padding`
            // has to come BEFORE `frame`, or the padding ends up wrapping
            // *outside* the already-fixed-size box instead of inset *within*
            // it, which is exactly why text was starting flush against the
            // left edge with zero visible margin.
            padding({ horizontal: 14, vertical: multiline ? 10 : 0 }),
            // `minWidth` (not a fixed `width`) + `alignment: 'leading'`: the
            // padded text field's own natural size is just "text + padding",
            // much narrower than the box. `minWidth` stretches it out to
            // fill the full measured width regardless, while `leading`
            // keeps the (already-padded) text pinned to the left instead of
            // SwiftUI's default centering it as a small pill in the middle
            // of all that extra space.
            frame({ minWidth: measuredWidth, height: fieldHeight, alignment: 'leading' }),
            // A pure `glassEffect` here reads as nearly invisible against an
            // already-transparent `LiquidBottomSheet` — there's no longer a
            // solid surface behind it to contrast against, so the field's
            // edges (and placeholder/typed text) become hard to make out.
            // Backing it with the app's own `surfaceHigh` tone first (dimmed
            // slightly via alpha rather than fully opaque) keeps the field
            // legible while the glass modifier on top still gives it a real
            // native material/highlight, instead of looking like flat paint.
            background(colors.surfaceHigh + 'CC', shapes.roundedRectangle({ cornerRadius: 12 })),
            glassEffect({ glass: { variant: 'regular' }, shape: 'roundedRectangle', cornerRadius: 12 }),
            textFieldStyle('plain'),
            ...(multiline ? [lineLimit({ min: 3, max: 8 })] : []),
            keyboardTypeMod(keyboardType),
          ]}
        />
      </Host>
      </View>
    );
  }

  // Android / fallback — existing themed input look.
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      autoFocus={autoFocus}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      keyboardType={
        keyboardType === 'numeric' ? 'numeric'
          : keyboardType === 'decimal-pad' ? 'decimal-pad'
          : keyboardType === 'phone-pad' ? 'phone-pad'
          : keyboardType === 'email-address' ? 'email-address'
          : 'default'
      }
      style={[
        styles.androidInput,
        { height: multiline ? Math.max(height, 80) : height, color: colors.text, backgroundColor: colors.surfaceHigh, borderColor: colors.border },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  androidInput: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
});
