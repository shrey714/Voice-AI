import React from 'react';
import { View, Text, TextInput } from 'react-native';
import { fonts } from '../../theme/typography';

export default function SettingInput({
  label, value, onChangeText, placeholder, keyboardType, multiline, secureTextEntry, onBlur, colors,
}: any) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.textSub, marginBottom: 8 }}>{label}</Text>
      <TextInput
        style={{ backgroundColor: colors.surfaceHigh, borderRadius: 14, padding: 16, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border, fontFamily: fonts.regular, height: multiline ? 90 : undefined, textAlignVertical: multiline ? 'top' : undefined }}
        secureTextEntry={secureTextEntry}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
      />
    </View>
  );
}
