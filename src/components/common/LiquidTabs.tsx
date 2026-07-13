import React, { useState } from 'react';
import { Platform, TouchableOpacity, View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Host, Picker, Text as SwiftUIText } from '@expo/ui/swift-ui';
import { pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';

export interface LiquidTabItem {
  key: string;
  label: string;
  /** Shown only on Android — iOS's native segmented control is text-only. */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

/**
 * A tab/segment switcher — real native iOS 26 Liquid Glass segmented control
 * on iOS (via @expo/ui's SwiftUI `Picker` + `pickerStyle('segmented')`,
 * which iOS 26 renders with the same glass material as everything else in
 * this app) and the app's existing pill-tab look on Android, where there's
 * no equivalent native segmented-glass component.
 *
 * Replaces every screen's own bespoke tab-row implementation (each of which
 * had slightly different padding/height/selected-state styling) with one
 * shared component.
 */
export default function LiquidTabs({
  tabs,
  selected,
  onSelect,
}: {
  tabs: LiquidTabItem[];
  selected: string;
  onSelect: (key: string) => void;
}) {
  const { colors, isDark } = useAppTheme();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== measuredWidth) setMeasuredWidth(w);
  };

  if (Platform.OS === 'ios') {
    return (
      <View style={{ height: 36, width: '100%' }} onLayout={onLayout}>
        {measuredWidth > 0 && (
          // `key={measuredWidth}`: same reasoning as LiquidButton/
          // LiquidTextField — remount fresh whenever the real measured
          // width lands rather than risk Host getting stuck at an early,
          // too-small size. colorScheme: this app's dark mode is its own
          // setting, independent of the OS's — Host defaults to following
          // the system otherwise.
          <Host key={measuredWidth} colorScheme={isDark ? 'dark' : 'light'} style={{ width: measuredWidth, height: 36 }}>
            <Picker
              selection={selected}
              onSelectionChange={onSelect}
              modifiers={[pickerStyle('segmented'), tint(colors.primary)]}
            >
              {tabs.map(t => (
                <SwiftUIText key={t.key} modifiers={[tag(t.key)]}>{t.label}</SwiftUIText>
              ))}
            </Picker>
          </Host>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.androidRow, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
      {tabs.map(t => {
        const active = t.key === selected;
        return (
          <TouchableOpacity
            key={t.key}
            style={[styles.androidTab, active && { backgroundColor: colors.primary }]}
            onPress={() => onSelect(t.key)}
          >
            {t.icon && <Ionicons name={t.icon} size={14} color={active ? '#fff' : colors.textMuted} />}
            <Text style={{ color: active ? '#fff' : colors.textSub, fontFamily: fonts.bold, fontSize: 13 }}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  androidRow: { flexDirection: 'row', borderRadius: 10, padding: 4, borderWidth: 1, gap: 4 },
  androidTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8 },
});
