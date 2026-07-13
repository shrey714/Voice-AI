import React from 'react';
import { Platform, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type SFSymbol } from 'sf-symbols-typescript';
import { Host, Menu as SwiftUIMenu, Button as SwiftUIButton, Section as SwiftUISection, Image as SwiftUIImage } from '@expo/ui/swift-ui';
import { buttonStyle, cornerRadius, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { MenuView, type MenuAction } from '@expo/ui/community/menu';
import { useAppTheme } from '../../theme';

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
 * SwiftUI `Menu` on iOS and a real native Jetpack Compose `DropdownMenu` on
 * Android (both via @expo/ui's stable SDK 56 APIs — the Android side used to
 * fall back to `react-native-paper`'s JS-rendered `Menu` before a genuine
 * native equivalent existed). Replaces inline sort-toggle/category-chip rows
 * that used to sit below the header on screens like Inventory; grouped sort
 * + filter options live here instead, same look as `LiquidHeaderIconButton`.
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

  // Ids are namespaced `${sectionIndex}:${value}` since `onPressAction` only
  // gives back a flat id — this recovers which section's `onSelect` to call
  // (sections can otherwise share option values, e.g. two independent
  // filters both having a "none" choice).
  const actions: MenuAction[] = sections.map((section, i) => ({
    title: section.title,
    displayInline: true,
    subactions: section.options.map(opt => ({
      id: `${i}:${opt.value}`,
      title: opt.label,
      state: opt.selected ? 'on' : 'off',
    })),
  }));

  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => {
        const [sectionIndex, value] = nativeEvent.event.split(/:(.*)/s);
        sections[Number(sectionIndex)]?.onSelect(value);
      }}
    >
      <TouchableOpacity
        style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}
        hitSlop={8}
      >
        <Ionicons name={androidIcon} size={20} color={tintColor} />
      </TouchableOpacity>
    </MenuView>
  );
}
