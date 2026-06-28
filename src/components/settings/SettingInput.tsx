import React, { useRef } from 'react';
import { View, Text, TextInput } from 'react-native';
import { fonts } from '../../theme/typography';

export default function SettingInput({
  label, value, onBlur, placeholder, keyboardType, multiline, secureTextEntry, colors, autoCapitalize,
}: any) {
  const textRef = useRef<string>(value ?? '');

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.textSub, marginBottom: 8 }}>{label}</Text>
      <TextInput
        style={{ backgroundColor: colors.surfaceHigh, borderRadius: 14, padding: 16, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border, fontFamily: fonts.regular, height: multiline ? 90 : undefined, textAlignVertical: multiline ? 'top' : undefined }}
        secureTextEntry={secureTextEntry}
        defaultValue={value}
        onChangeText={t => { textRef.current = t; }}
        onBlur={() => onBlur?.(textRef.current)}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
        autoCapitalize={autoCapitalize ?? 'none'}
      />
    </View>
  );
}
