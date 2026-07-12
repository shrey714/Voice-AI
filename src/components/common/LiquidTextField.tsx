import React, { useEffect, useRef } from 'react';
import { Platform, TextInput, StyleSheet } from 'react-native';
import { Host, TextField as SwiftUITextField, type TextFieldRef } from '@expo/ui/swift-ui';
import { glassEffect, textFieldStyle, padding, keyboardType as keyboardTypeMod, frame, lineLimit } from '@expo/ui/swift-ui/modifiers';
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
 * @expo/ui's TextField is UNCONTROLLED (`defaultValue`, not `value` — a
 * genuine API constraint, not an oversight here). This wraps it with a
 * controlled-feeling `value`/`onChangeText` API by imperatively pushing
 * external value changes into the native field via its `setText` ref
 * method, skipping the push when the change originated from the field's own
 * `onValueChange` (tracked via `lastEmitted`) — otherwise every keystroke
 * would fight itself and the cursor would jump to the end on each render.
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
  const ref = useRef<TextFieldRef>(null);
  const lastEmitted = useRef(value);
  useEffect(() => {
    if (Platform.OS === 'ios' && value !== lastEmitted.current) {
      lastEmitted.current = value;
      ref.current?.setText(value);
    }
  }, [value]);

  if (Platform.OS === 'ios') {
    return (
      // colorScheme: this app's dark mode is its own setting, independent
      // of the OS's — Host defaults to following the system otherwise.
      <Host colorScheme={isDark ? 'dark' : 'light'} style={[{ height: multiline ? Math.max(height, 80) : height, width: '100%' }, style]}>
        <SwiftUITextField
          ref={ref}
          defaultValue={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          axis={multiline ? 'vertical' : 'horizontal'}
          onValueChange={(v) => { lastEmitted.current = v; onChangeText(v); }}
          modifiers={[
            glassEffect({ glass: { variant: 'regular' }, shape: 'roundedRectangle', cornerRadius: 12 }),
            textFieldStyle('plain'),
            padding({ horizontal: 14, vertical: multiline ? 10 : 0 }),
            ...(multiline ? [lineLimit({ min: 3, max: 8 })] : [frame({ height })]),
            keyboardTypeMod(keyboardType),
          ]}
        />
      </Host>
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
