import React, { useCallback, useState } from 'react';
import { StyleSheet, TouchableOpacity, View, Platform, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
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

export default function CollapsibleFab({ icon, label, extended, onPress, bottom = 110 }: Props) {
  const { colors } = useAppTheme();
  const [labelW, setLabelW] = useState(0); // natural label width, measured once
  // Real native Liquid Glass background on iOS 26+ (tinted with the app's
  // brand color, same as Apple's own floating action buttons), a plain
  // solid fill everywhere else — all the extend/collapse animation logic
  // below is untouched either way, only the background rendering changes.
  const glass = Platform.OS === 'ios' && isLiquidGlassAvailable();

  return (
    // Shadow lives on this outer view (no overflow:hidden here — RN clips
    // shadows along with content, so the rounded-clip layer for the glass
    // background has to be a separate inner view instead of sharing this
    // one, or the shadow would vanish).
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={[styles.fabShadow, { bottom }]}>
      <View style={[styles.fab, !glass && { backgroundColor: colors.primary }]}>
        {glass && (
          <GlassView
            glassEffectStyle="regular"
            tintColor={colors.primary}
            isInteractive
            style={StyleSheet.absoluteFillObject}
          />
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
  labelWrap: { overflow: 'hidden' },
  label: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },
  measure: { position: 'absolute', opacity: 0, top: 0, left: 0 },
});
