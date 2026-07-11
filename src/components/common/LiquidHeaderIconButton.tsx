import React from 'react';
import { Platform, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type SFSymbol } from 'sf-symbols-typescript';
import { Host, Button as SwiftUIButton, Image as SwiftUIImage } from '@expo/ui/swift-ui';
import { buttonStyle, cornerRadius, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../theme';

const SIZE = 34;

/**
 * A small icon-only button for use in `headerRight` — real native iOS 26
 * Liquid Glass on iOS (via @expo/ui), the app's existing plain icon-button
 * look on Android. Always a fixed-size, non-absolutely-positioned view — a
 * normal flex sibling wherever it's placed, deliberately not the
 * `position: 'absolute'` + percentage-centering pattern that broke several
 * header buttons under native-stack's real native header (see
 * AppNavigator's useHeaderOpts comment).
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
  /** Ionicons name, used on Android (and as a type-safe icon set). */
  androidIcon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  color?: string;
  /** Small dot/count badge in the top-right corner. */
  badge?: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  const tintColor = color ?? colors.primary;

  if (Platform.OS === 'ios') {
    return (
      <View style={{ width: SIZE, height: SIZE }}>
        <Host style={{ width: SIZE, height: SIZE }}>
          <SwiftUIButton
            onPress={onPress}
            modifiers={[buttonStyle('glass'), tint(tintColor), frame({ width: SIZE, height: SIZE }), cornerRadius(SIZE / 2)]}
          >
            <SwiftUIImage systemName={icon} size={16} color={tintColor} />
          </SwiftUIButton>
        </Host>
        {badge}
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}
      hitSlop={8}
    >
      <Ionicons name={androidIcon} size={20} color={tintColor} />
      {badge}
    </TouchableOpacity>
  );
}
