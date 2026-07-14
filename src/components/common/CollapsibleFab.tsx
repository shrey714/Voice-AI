import React, { useCallback, useState } from 'react';
import { View, Platform, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type SFSymbol } from 'sf-symbols-typescript';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LiquidButton from './LiquidButton';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

// `CollapsibleFab`'s public API takes an Ionicons name (every call site
// already passes `icon="add"`) — `LiquidButton` takes an SF Symbol instead,
// so this maps the one icon actually used today. Extend if a future caller
// needs a different icon.
const ICON_TO_SF: Partial<Record<IoniconsName, SFSymbol>> = {
  add: 'plus',
};

/**
 * Drives the FAB's `extended` state from a list's scroll position:
 * full (icon + label) at the top / when scrolling up, icon-only when scrolling down.
 * Wire `onScroll` to a FlatList/ScrollView (with `scrollEventThrottle={16}`).
 */
export function useFabScroll() {
  const [extended, setExtended] = useState(true);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setExtended(e.nativeEvent.contentOffset.y <= 4);
  }, []);
  return { extended, onScroll };
}

interface Props {
  icon: IoniconsName;
  label: string;
  extended: boolean;
  onPress: () => void;
  bottom?: number;
}

// iOS screens sit under `createNativeBottomTabNavigator` (a real
// UITabBarController), whose content area extends full-height *behind* the
// tab bar — unlike Android's classic JS bottom-tabs, where the screen's own
// layout already stops above the tab bar. So on iOS, `bottom` needs the tab
// bar's own height (standard UIKit tab bar content height) plus the home
// indicator safe area added on top, or this floats behind the bar instead
// of above it. 49 is UIKit's standard tab bar height; `insets.bottom`
// covers the home indicator separately.
const IOS_TAB_BAR_HEIGHT = 49;

/**
 * Now a thin wrapper around `LiquidButton` (real native Liquid Glass on iOS,
 * flat themed pill on Android — same as every other button in the app)
 * instead of its own hand-rolled `expo-glass-effect` `GlassView` background.
 *
 * Trade-off: `LiquidButton`'s width is a concrete native `frame`/`Host` size
 * that remounts on change (an established `@expo/ui` gotcha throughout this
 * app — Host doesn't reliably re-layout from a post-mount size change), so
 * the extend/collapse transition SNAPS between icon-only and icon+label
 * instead of the old hand-animated `MotiView` glide. If that snap reads as
 * worse than the old smooth version in practice, that's the concrete thing
 * to revert this for — the previous `GlassView`-based version is straightforward
 * to restore from git history.
 */
export default function CollapsibleFab({ icon, label, extended, onPress, bottom = 24 }: Props) {
  const insets = useSafeAreaInsets();
  const resolvedBottom = bottom + (Platform.OS === 'ios' ? IOS_TAB_BAR_HEIGHT + insets.bottom : 0);
  const sfIcon = ICON_TO_SF[icon] ?? 'plus';

  return (
    <View style={{ position: 'absolute', right: 16, bottom: resolvedBottom }}>
      <LiquidButton
        title={extended ? label : ''}
        icon={sfIcon}
        onPress={onPress}
        variant="glassProminent"
        fullWidth={false}
        height={48}
      />
    </View>
  );
}
