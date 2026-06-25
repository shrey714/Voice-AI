import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { MotiView } from 'moti';
import { Easing } from 'react-native-reanimated';
import { useAppTheme } from '../../theme';

/** A single placeholder block with a gentle opacity pulse (no shimmer sweep, no bounce). */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useAppTheme();
  return (
    <MotiView
      from={{ opacity: 0.4 }}
      animate={{ opacity: 0.8 }}
      transition={{ loop: true, repeatReverse: true, type: 'timing', duration: 700, easing: Easing.inOut(Easing.ease) }}
      style={[{ backgroundColor: colors.surfaceHigh, borderRadius: 8 }, style]}
    />
  );
}

/** Card-shaped skeletons that mirror the list-card layout while data loads. */
export function SkeletonList({ count = 6 }: { count?: number }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ padding: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.card, { borderColor: colors.border }]}>
          <Skeleton style={{ width: 48, height: 48, borderRadius: 24 }} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton style={{ width: '55%', height: 13 }} />
            <Skeleton style={{ width: '35%', height: 11 }} />
          </View>
          <Skeleton style={{ width: 54, height: 16 }} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, marginBottom: 10 },
});
