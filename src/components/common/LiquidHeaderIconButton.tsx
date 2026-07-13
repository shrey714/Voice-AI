import React from 'react';
import { View, type ImageSourcePropType } from 'react-native';
import { type SFSymbol } from 'sf-symbols-typescript';
import { Host, Button, Icon } from '@expo/ui';
import { buttonStyle, cornerRadius, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { border, clip, Shapes } from '@expo/ui/jetpack-compose/modifiers';
import { useAppTheme } from '../../theme';

const SIZE = 34;

// This component's public API takes an Ionicons name for `androidIcon` (used
// at every call site app-wide) — mapping it here to the matching Material
// Symbols XML asset means adopting @expo/ui's universal `Icon` (which needs
// a bundled vector asset on Android, not an arbitrary RN component) doesn't
// require touching every caller. Only the handful of icons actually used by
// this component are mapped; add to this list as new `androidIcon` values
// are introduced.
const ANDROID_ICON_ASSET = {
  'search-outline': require('@expo/material-symbols/search.xml') as ImageSourcePropType,
  'options-outline': require('@expo/material-symbols/tune.xml') as ImageSourcePropType,
  'document-text-outline': require('@expo/material-symbols/description.xml') as ImageSourcePropType,
  'chevron-back': require('@expo/material-symbols/chevron_left.xml') as ImageSourcePropType,
};

type AndroidIconName = keyof typeof ANDROID_ICON_ASSET;

/**
 * A small icon-only button for use in `headerRight` — real native iOS 26
 * Liquid Glass on iOS and a real native Jetpack Compose button on Android,
 * via `@expo/ui`'s stable SDK 56 universal `Button`/`Icon` (one shared
 * render path, not a platform-split `@expo/ui/swift-ui`-only iOS branch +
 * plain RN `TouchableOpacity` Android fallback). Always a fixed-size,
 * non-absolutely-positioned view — a normal flex sibling wherever it's
 * placed, deliberately not the `position: 'absolute'` + percentage-centering
 * pattern that broke several header buttons under native-stack's real
 * native header (see AppNavigator's useHeaderOpts comment).
 */
export default function LiquidHeaderIconButton({
  icon,
  androidIcon,
  onPress,
  color,
  badge,
}: {
  /** SF Symbol name, used on iOS. */
  icon: SFSymbol;
  /** Ionicons-style name, mapped internally to a Material Symbols asset for Android. */
  androidIcon: AndroidIconName;
  onPress: () => void;
  color?: string;
  /** Small dot/count badge in the top-right corner. */
  badge?: React.ReactNode;
}) {
  const { colors, isDark } = useAppTheme();
  const tintColor = color ?? colors.primary;

  return (
    <View style={{ width: SIZE, height: SIZE }}>
      {/* colorScheme: this app's dark mode is its own setting, independent
          of the OS's — Host defaults to following the system otherwise. */}
      <Host colorScheme={isDark ? 'dark' : 'light'} style={{ width: SIZE, height: SIZE }}>
        <Button
          variant="text"
          onPress={onPress}
          modifiers={[
            frame({ width: SIZE, height: SIZE }),
            // `variant="text"` alone renders as SwiftUI's plain `.plain`
            // button style on iOS (universal `Button`'s "text" variant maps
            // to no material at all) — a user-supplied `buttonStyle`
            // modifier takes ownership of that slot and overrides it
            // (confirmed in @expo/ui's own `omitUserOverridden`), which is
            // how this restores the real native Liquid Glass material
            // instead of a flat icon.
            buttonStyle('glass'),
            tint(tintColor),
            cornerRadius(SIZE / 2),
            // Android has no glass material — approximate the same
            // circular tap target with a plain themed outline instead.
            border(1, tintColor + '33'),
            clip(Shapes.Circle),
          ]}
        >
          <Icon
            name={{ ios: icon, android: ANDROID_ICON_ASSET[androidIcon] }}
            size={16}
            color={tintColor}
          />
        </Button>
      </Host>
      {badge}
    </View>
  );
}
