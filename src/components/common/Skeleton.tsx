import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { MotiView } from 'moti';
import { Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme';

// ──────────────────────────────────────────────────────────────────────────────
// Central home for every loading skeleton in the app. Add new screen skeletons
// here so they stay consistent and easy to tweak in one place.
// ──────────────────────────────────────────────────────────────────────────────

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

/** Full Dashboard placeholder — mirrors the hero + bento + cards layout. */
export function DashboardSkeleton() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const onSage = 'rgba(255,255,255,0.22)';
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ backgroundColor: colors.primary, paddingTop: insets.top + 22, paddingHorizontal: 20, paddingBottom: 40, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <Skeleton style={{ width: 130, height: 12, backgroundColor: onSage }} />
        <Skeleton style={{ width: 170, height: 22, marginTop: 8, backgroundColor: onSage }} />
        <Skeleton style={{ width: 210, height: 40, marginTop: 20, backgroundColor: onSage }} />
        <Skeleton style={{ width: 150, height: 16, marginTop: 14, borderRadius: 14, backgroundColor: onSage }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: -22 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.bento, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Skeleton style={{ width: 30, height: 30, borderRadius: 9 }} />
            <Skeleton style={{ width: '80%', height: 16 }} />
            <Skeleton style={{ width: '55%', height: 10 }} />
          </View>
        ))}
      </View>
      <View style={[styles.block, { borderColor: colors.border }]}>
        <Skeleton style={{ width: '40%', height: 14 }} />
        <Skeleton style={{ width: '100%', height: 44, marginTop: 14 }} />
      </View>
      <SkeletonList count={3} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, marginBottom: 10 },
  bento: { flex: 1, borderRadius: 18, padding: 13, gap: 9, borderWidth: StyleSheet.hairlineWidth },
  block: { marginHorizontal: 16, marginTop: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
});
