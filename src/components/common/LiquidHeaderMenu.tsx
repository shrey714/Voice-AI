import React, { useState } from 'react';
import { Platform, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type SFSymbol } from 'sf-symbols-typescript';
import { Menu as PaperMenu, Divider, Text } from 'react-native-paper';
import { Host, Menu as SwiftUIMenu, Button as SwiftUIButton, Section as SwiftUISection, Image as SwiftUIImage } from '@expo/ui/swift-ui';
import { buttonStyle, cornerRadius, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';

const SIZE = 34;

export type LiquidMenuOption = {
  label: string;
  value: string;
  selected?: boolean;
};

export type LiquidMenuSection = {
  title: string;
  options: LiquidMenuOption[];
  onSelect: (value: string) => void;
};

/**
 * A single header icon button that opens a native dropdown/menu — real
 * SwiftUI `Menu` on iOS (via @expo/ui), `react-native-paper`'s `Menu` on
 * Android. Replaces inline sort-toggle/category-chip rows that used to sit
 * below the header on screens like Inventory; grouped sort + filter options
 * live here instead, same look as `LiquidHeaderIconButton`.
 */
export default function LiquidHeaderMenu({
  icon = 'line.3.horizontal.decrease.circle',
  androidIcon = 'options-outline',
  color,
  sections,
}: {
  icon?: SFSymbol;
  androidIcon?: React.ComponentProps<typeof Ionicons>['name'];
  color?: string;
  sections: LiquidMenuSection[];
}) {
  const { colors, isDark } = useAppTheme();
  const tintColor = color ?? colors.primary;
  const [visible, setVisible] = useState(false);

  if (Platform.OS === 'ios') {
    return (
      <View style={{ width: SIZE, height: SIZE }}>
        <Host colorScheme={isDark ? 'dark' : 'light'} style={{ width: SIZE, height: SIZE }}>
          <SwiftUIMenu
            label={<SwiftUIImage systemName={icon} size={16} color={tintColor} />}
            modifiers={[buttonStyle('glass'), tint(tintColor), frame({ width: SIZE, height: SIZE }), cornerRadius(SIZE / 2)]}
          >
            {sections.map((section, i) => (
              <SwiftUISection key={i} title={section.title}>
                {section.options.map(opt => (
                  <SwiftUIButton
                    key={opt.value}
                    label={opt.label}
                    systemImage={opt.selected ? 'checkmark' : undefined}
                    onPress={() => section.onSelect(opt.value)}
                  />
                ))}
              </SwiftUISection>
            ))}
          </SwiftUIMenu>
        </Host>
      </View>
    );
  }

  return (
    <PaperMenu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={
        <TouchableOpacity
          onPress={() => setVisible(true)}
          style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}
          hitSlop={8}
        >
          <Ionicons name={androidIcon} size={20} color={tintColor} />
        </TouchableOpacity>
      }
    >
      {sections.map((section, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Divider />}
          <Text style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, fontSize: 12, fontFamily: fonts.bold, color: colors.textMuted }}>
            {section.title}
          </Text>
          {section.options.map(opt => (
            <PaperMenu.Item
              key={opt.value}
              title={opt.label}
              leadingIcon={opt.selected ? 'check' : undefined}
              onPress={() => { section.onSelect(opt.value); setVisible(false); }}
            />
          ))}
        </React.Fragment>
      ))}
    </PaperMenu>
  );
}
