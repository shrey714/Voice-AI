import React, { useCallback, useState } from 'react';
import { StyleSheet, TouchableOpacity, View, Platform, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

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

export default function CollapsibleFab({ icon, label, extended, onPress, bottom = 24 }: Props) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [labelW, setLabelW] = useState(0); // natural label width, measured once
  // Real native Liquid Glass background on iOS 26+ (tinted with the app's
  // brand color, same as Apple's own floating action buttons), a plain
  // solid fill everywhere else — all the extend/collapse animation logic
  // below is untouched either way, only the background rendering changes.
  const glass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  const resolvedBottom = bottom + (Platform.OS === 'ios' ? IOS_TAB_BAR_HEIGHT + insets.bottom : 0);

  return (
    // Shadow lives on this outer view (no overflow:hidden here — RN clips
    // shadows along with content, so the rounded-clip layer for the glass
    // background has to be a separate inner view instead of sharing this
    // one, or the shadow would vanish).
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={[
        styles.fabShadow,
        { bottom: resolvedBottom },
        // A tinted, more diffuse glow instead of a plain black shadow reads
        // as "glass catching light" rather than "flat card with a drop
        // shadow" — small thing, but it's most of what made this look less
        // like the rest of the app's real Liquid Glass buttons.
        glass && { shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
      ]}
    >
      <View style={[styles.fab, glass ? styles.fabGlassBorder : { backgroundColor: colors.primary }]}>
        {glass && (
          <>
            {/* `isInteractive` deliberately omitted (and pointerEvents:'none'
                set) — GlassView is a real interactive UIKit responder when
                `isInteractive` is true (that's what drives the native
                "squish on press" glass feedback), and as an absolute-fill
                layer sitting inside this already-tappable TouchableOpacity it
                was intercepting the touch before TouchableOpacity's own
                onPress ever fired — this is a purely decorative background
                layer, not the tap target itself. */}
            <GlassView
              glassEffectStyle="regular"
              tintColor={colors.primary}
              colorScheme={isDark ? 'dark' : 'light'}
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
            />
            {/* A thin bright-to-transparent sheen along the top edge —
                approximates the light-catching highlight real Liquid Glass
                surfaces have along their upper rim, which the flat
                `GlassView` fill alone doesn't render. */}
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 0.6 }}
            />
          </>
        )}
        <Ionicons name={icon} size={20} color="#fff" />

        {/* Visible label — clipped by a width-animated wrapper */}
        <MotiView
          animate={{ width: extended ? labelW : 0, opacity: extended ? 1 : 0, marginLeft: extended ? 8 : 0 }}
          transition={{ type: 'timing', duration: 220 }}
          style={styles.labelWrap}
        >
          <Text numberOfLines={1} style={[styles.label, labelW ? { width: labelW } : null]}>{label}</Text>
        </MotiView>

        {/* Off-screen measurer — gives the label's natural width */}
        <Text
          numberOfLines={1}
          style={[styles.label, styles.measure]}
          onLayout={e => { const w = Math.ceil(e.nativeEvent.layout.width); if (w && w !== labelW) setLabelW(w); }}
        >{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fabShadow: {
    position: 'absolute', right: 16, borderRadius: 24,
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  fab: {
    flexDirection: 'row', alignItems: 'center',
    height: 48, borderRadius: 24, paddingHorizontal: 14, overflow: 'hidden',
  },
  // A faint bright rim around the whole pill — real Liquid Glass surfaces
  // have a subtle edge highlight from refraction; a flat fill with no
  // border reads as a plain colored card instead.
  fabGlassBorder: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  labelWrap: { overflow: 'hidden' },
  label: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },
  measure: { position: 'absolute', opacity: 0, top: 0, left: 0 },
});
