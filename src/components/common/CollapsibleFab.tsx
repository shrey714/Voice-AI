import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
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
  const lastY = useRef(0);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const diff = y - lastY.current;
    if (y <= 4) setExtended(true);            // at the top → always full
    else if (diff > 6) setExtended(false);    // scrolling down → collapse
    else if (diff < -6) setExtended(true);    // scrolling up → expand
    lastY.current = y;
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

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={[styles.fab, { backgroundColor: colors.primary, bottom }]}
    >
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
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', right: 16,
    flexDirection: 'row', alignItems: 'center',
    height: 48, borderRadius: 24, paddingHorizontal: 14,
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  labelWrap: { overflow: 'hidden' },
  label: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },
  measure: { position: 'absolute', opacity: 0, top: 0, left: 0 },
});
