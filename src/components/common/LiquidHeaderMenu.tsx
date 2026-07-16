import React from 'react';
import { Platform, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type SFSymbol } from 'sf-symbols-typescript';
import { Menu as SwiftUIMenu, Section as SwiftUISection } from '@expo/ui/swift-ui';
import { buttonStyle, cornerRadius, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { Host, Button, Icon, Row, Text } from '@expo/ui';
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
 *
 * `Menu`/`Section` (SwiftUI's own menu composition) have no universal
 * `@expo/ui` equivalent, so those two stay on `@expo/ui/swift-ui` — but the
 * trigger's `Host`/icon and the individual menu-item buttons don't have that
 * blocker (unlike `ConfirmDialogProvider`'s buttons, these don't need the
 * swift-ui-only `role` prop), so they're on the universal layer.
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
            label={<Icon name={icon} size={16} color={tintColor} />}
            modifiers={[buttonStyle('plain'), tint(tintColor), frame({ width: SIZE, height: SIZE }), cornerRadius(SIZE / 2)]}
          >
            {sections.map((section, i) => (
              <SwiftUISection key={i} title={section.title}>
                {section.options.map(opt => (
                  // `variant="text"` (→ SwiftUI's `plain` style) — the
                  // universal `Button` defaults to `'filled'`
                  // (`borderedProminent`), which would paint each row as a
                  // bordered pill instead of a plain menu row; the original
                  // bare `swift-ui` `Button` here had no `buttonStyle` at
                  // all, so `plain` is the actual equivalent.
                  <Button key={opt.value} variant="text" onPress={() => section.onSelect(opt.value)}>
                    <Row spacing={6} alignment="center">
                      {opt.selected && <Icon name="checkmark" size={16} />}
                      <Text>{opt.label}</Text>
                    </Row>
                  </Button>
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
  //
  // `displayInline`'s own `title` only renders as a section header on iOS —
  // @expo/ui's Android `MenuView` has no title slot for inline groups at all
  // (confirmed in its own source/docs: "with this action's title as the
  // section header **on iOS**"), so "Sort by"/"Category" silently never
  // showed up there. Faked on Android by prepending a disabled, muted row
  // with the section title as the first "subaction" instead — it can't be
  // pressed (`attributes.disabled`) and its id is never matched in
  // `onPressAction` below, so it's purely a label.
  const actions: MenuAction[] = sections.map((section, i) => ({
    title: section.title,
    displayInline: true,
    subactions: [
      ...(Platform.OS === 'android'
        ? [{ id: `${i}:__label__`, title: section.title.toUpperCase(), attributes: { disabled: true }, titleColor: colors.textMuted }]
        : []),
      ...section.options.map(opt => ({
        id: `${i}:${opt.value}`,
        title: opt.label,
        state: opt.selected ? 'on' as const : 'off' as const,
      })),
    ],
  }));

  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => {
        const [sectionIndex, value] = nativeEvent.event.split(/:(.*)/s);
        if (value === '__label__') return;
        sections[Number(sectionIndex)]?.onSelect(value);
      }}
    >
      <TouchableOpacity
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: SIZE / 2,
          backgroundColor: tintColor + '14',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        hitSlop={8}
      >
        <Ionicons name={androidIcon} size={20} color={tintColor} />
      </TouchableOpacity>
    </MenuView>
  );
}
