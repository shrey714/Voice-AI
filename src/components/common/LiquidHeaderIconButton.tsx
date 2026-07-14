import React from 'react';
import { Platform, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type SFSymbol } from 'sf-symbols-typescript';
import { Host, Button, Icon } from '@expo/ui';
import { buttonStyle, cornerRadius, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../theme';

const SIZE = 34;
// Matches `LiquidHeaderMenu`'s Android trigger icon size — the two used to
// diverge (this component rendered its icon at 16, the menu trigger at 20),
// which is why the document/search icons looked noticeably smaller than the
// filter icon sitting right next to them in the same header row.
const ANDROID_ICON_SIZE = 20;

type AndroidIconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * A small icon-only button for use in `headerRight` — real native iOS 26
 * Liquid Glass on iOS. Android renders as a plain `TouchableOpacity` with a
 * themed circular fill, same as `LiquidHeaderMenu`'s Android trigger, rather
 * than `@expo/ui`'s universal Jetpack Compose `Button`: that Compose
 * `Button` carries its own default Material shape/min-size/elevation that
 * the app's manual `clip`/`background` overrides never fully suppressed —
 * visible as a boxy halo behind the intended circular button. A plain RN
 * touchable has no such intrinsics to fight, and gives full pixel control
 * over size to match sibling header buttons exactly.
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
  /** Ionicons name, used on Android. */
  androidIcon: AndroidIconName;
  onPress: () => void;
  color?: string;
  /** Small dot/count badge in the top-right corner. */
  badge?: React.ReactNode;
}) {
  const { colors, isDark } = useAppTheme();
  const tintColor = color ?? colors.primary;

  if (Platform.OS !== 'ios') {
    return (
      <View style={{ width: SIZE, height: SIZE }}>
        <TouchableOpacity
          onPress={onPress}
          hitSlop={8}
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            backgroundColor: tintColor + '14',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={androidIcon} size={ANDROID_ICON_SIZE} color={tintColor} />
        </TouchableOpacity>
        {badge}
      </View>
    );
  }

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
            buttonStyle('plain'),
            tint(tintColor),
            cornerRadius(SIZE / 2),
          ]}
        >
          <Icon name={icon} size={16} color={tintColor} />
        </Button>
      </Host>
      {badge}
    </View>
  );
}
