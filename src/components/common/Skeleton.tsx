import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme';

// ──────────────────────────────────────────────────────────────────────────────
// Central home for every loading skeleton in the app. Add new screen skeletons
// here so they stay consistent and easy to tweak in one place.
// ──────────────────────────────────────────────────────────────────────────────

/** A single static placeholder block (no pulse/shimmer animation). */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useAppTheme();
  return (
    <View style={[{ backgroundColor: colors.surfaceHigh, borderRadius: 8, opacity: 0.6 }, style]} />
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

/** Online Shop dashboard placeholder — mirrors DashboardSkeleton's hero + bento + list pattern, since the real screen now uses the app's actual theme (colors.primary hero, colors.surface cards), not a bespoke fixed palette. */
export function OnlineShopDashboardSkeleton() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const onPrimary = 'rgba(255,255,255,0.22)';
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ backgroundColor: colors.primary, paddingTop: insets.top + 22, paddingHorizontal: 20, paddingBottom: 40, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <Skeleton style={{ width: 150, height: 20, backgroundColor: onPrimary }} />
        <Skeleton style={{ width: 110, height: 12, marginTop: 10, backgroundColor: onPrimary }} />
        <Skeleton style={{ width: '100%', height: 68, borderRadius: 34, marginTop: 20, backgroundColor: onPrimary }} />
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

      <Skeleton style={{ width: 90, height: 11, marginLeft: 24, marginTop: 22, marginBottom: 10 }} />
      <View style={[styles.actionsCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.actionRow, i < 2 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
            <Skeleton style={{ width: 38, height: 38, borderRadius: 12 }} />
            <Skeleton style={{ width: '40%', height: 15 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Online Shop settings placeholder — mirrors the repeated "section" card
 * shape. Rendered inside `ShopInfoScreen`'s `ScrollView` (not as a separate
 * early-returned screen) — that `ScrollView` already provides padding/
 * background, so this doesn't need its own `flex`/padding/background fill.
 */
export function OnlineShopSettingsSkeleton() {
  const { colors } = useAppTheme();
  return (
    <>
      {[
        { fields: 1 },   // master switch
        { fields: 3 },   // basic info
        { fields: 2 },   // order settings
        { fields: 2 },   // delivery
        { fields: 3 },   // pickup location
      ].map((section, i) => (
        <View key={i} style={[styles.settingsSection, { backgroundColor: colors.surface }]}>
          <Skeleton style={{ width: 100, height: 11, marginBottom: 14 }} />
          {Array.from({ length: section.fields }).map((_, j) => (
            <Skeleton key={j} style={{ width: '100%', height: 44, borderRadius: 12, marginBottom: 12 }} />
          ))}
        </View>
      ))}
    </>
  );
}

/**
 * Online Orders list placeholder — mirrors the order-card shape
 * (name/phone/items + total/status). Rendered inside `FlatList`'s
 * `ListEmptyComponent` (not as a full-screen early return) — the real
 * period/status filter chip row already lives in `ListHeaderComponent`
 * above this and stays mounted throughout loading, so this doesn't
 * duplicate it with a second fake chip row anymore, and doesn't need its
 * own `flex`/background fill either (the FlatList's own container already
 * provides that).
 */
export function OnlineOrdersSkeleton() {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 8 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={i} style={[styles.card, { borderColor: colors.border, alignItems: 'flex-start' }]}>
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton style={{ width: '45%', height: 14 }} />
            <Skeleton style={{ width: '30%', height: 11 }} />
            <Skeleton style={{ width: '70%', height: 11 }} />
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Skeleton style={{ width: 54, height: 15 }} />
            <Skeleton style={{ width: 60, height: 18, borderRadius: 8 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Online Inventory placeholder — mirrors product rows only. Rendered inside
 * `FlatList`'s `ListEmptyComponent` — the real "X of Y listings visible"
 * summary row already lives in `ListHeaderComponent` above this and stays
 * mounted throughout loading, so this doesn't duplicate it with a second
 * fake summary/search bar anymore, and doesn't need its own `flex`/
 * background fill either.
 */
export function OnlineInventorySkeleton() {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 8 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={[styles.card, { borderColor: colors.border }]}>
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton style={{ width: '60%', height: 14 }} />
            <Skeleton style={{ width: '40%', height: 11 }} />
          </View>
          <Skeleton style={{ width: 44, height: 26, borderRadius: 13 }} />
        </View>
      ))}
    </View>
  );
}

/** Online Order detail placeholder — mirrors status card + info blocks. */
export function OnlineOrderDetailSkeleton() {
  const { colors } = useAppTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 14 }}>
      <View style={[styles.orderStatusCard, { backgroundColor: colors.surface }]}>
        <Skeleton style={{ width: 90, height: 22, borderRadius: 20, marginBottom: 10 }} />
        <Skeleton style={{ width: 130, height: 14 }} />
        <Skeleton style={{ width: 160, height: 12, marginTop: 6 }} />
      </View>
      {[3, 3, 2].map((rows, i) => (
        <View key={i} style={[styles.settingsSection, { backgroundColor: colors.surface }]}>
          <Skeleton style={{ width: 80, height: 11, marginBottom: 12 }} />
          {Array.from({ length: rows }).map((_, j) => (
            <Skeleton key={j} style={{ width: j === 0 ? '70%' : '45%', height: 13, marginBottom: 8 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Backup & Restore section placeholder — mirrors the account row + two action buttons. */
export function BackupSectionSkeleton() {
  const { colors } = useAppTheme();
  return (
    <View>
      <View style={[styles.backupAccountRow, { borderColor: colors.border }]}>
        <Skeleton style={{ width: 20, height: 20, borderRadius: 10 }} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton style={{ width: '45%', height: 14 }} />
          <Skeleton style={{ width: '65%', height: 11 }} />
        </View>
      </View>
      <Skeleton style={{ width: '100%', height: 48, borderRadius: 14, marginBottom: 8 }} />
      <Skeleton style={{ width: '100%', height: 48, borderRadius: 14 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, marginBottom: 10 },
  bento: { flex: 1, borderRadius: 18, padding: 13, gap: 9, borderWidth: StyleSheet.hairlineWidth },
  block: { marginHorizontal: 16, marginTop: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 16 },

  heroCard: { margin: 12, borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  statsCard: { marginHorizontal: 12, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center' },
  actionsCard: { marginHorizontal: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },

  settingsSection: { borderRadius: 16, padding: 16, marginBottom: 12 },
  summaryBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },

  orderStatusCard: { borderRadius: 14, padding: 16, marginBottom: 10 },

  backupAccountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 14 },
});
