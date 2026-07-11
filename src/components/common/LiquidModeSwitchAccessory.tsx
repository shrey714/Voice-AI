import React from 'react';
import { Host, Button as SwiftUIButton, Image as SwiftUIImage } from '@expo/ui/swift-ui';
import { buttonStyle, frame, cornerRadius, tint } from '@expo/ui/swift-ui/modifiers';
import { type SFSymbol } from 'sf-symbols-typescript';

const SIZE = 44;

/**
 * The Local/Online portion-switch button, rendered via the native bottom
 * tab bar's `bottomAccessory` option (iOS 26+ only — see AppNavigator's
 * LocalTabs/OnlineTabs screenOptions) so it sits as a real native Liquid
 * Glass control right beside the tab bar itself, matching the platform's
 * own accessory-button convention instead of floating custom UI over it.
 */
export default function LiquidModeSwitchAccessory({ icon, onPress, tintColor }: { icon: SFSymbol; onPress: () => void; tintColor: string }) {
  return (
    <Host style={{ width: SIZE, height: SIZE }}>
      <SwiftUIButton
        onPress={onPress}
        modifiers={[
          buttonStyle('glass'),
          tint(tintColor),
          frame({ width: SIZE, height: SIZE }),
          cornerRadius(SIZE / 2),
        ]}
      >
        <SwiftUIImage systemName={icon} size={20} color={tintColor} />
      </SwiftUIButton>
    </Host>
  );
}
