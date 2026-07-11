import React, { useEffect, useRef } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';

/**
 * A search input rendered in the SCREEN BODY (not the header) — deliberately
 * not another header-embedded expand-in-place box like the old
 * HeaderSearchToggle. That component's `position: 'absolute'` centering
 * depended on the exact fixed-height container the old custom AppHeader
 * gave it; native-stack's real native header doesn't provide the same
 * container shape, which broke it (and several sibling header buttons)
 * across 6 screens at once — a class of bug only visible on-device. A plain
 * in-body row has no such dependency: it lays out with normal flow like
 * everything else on the screen.
 *
 * Toggle it open via a plain (non-absolute) icon button in `headerRight`.
 */
export default function InlineSearchBar({
  autoFocus = true,
  value,
  onChangeText,
  placeholder = 'Search…',
  onClose,
}: {
  autoFocus?: boolean;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <View style={[styles.row, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
      <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
      <TextInput
        ref={inputRef}
        style={[styles.input, { color: colors.text }]}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        returnKeyType="search"
      />
      <TouchableOpacity
        onPress={() => { onChangeText(''); onClose(); }}
        hitSlop={8}
        accessibilityLabel="Close search"
        accessibilityRole="button"
      >
        <Ionicons name="close" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  input: { flex: 1, fontSize: 14, padding: 0, fontFamily: fonts.regular },
});
