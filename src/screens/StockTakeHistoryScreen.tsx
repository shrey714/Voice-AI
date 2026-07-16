import React, { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View, FlatList, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import LiquidBottomSheet, { LiquidBottomSheetRef } from '../components/common/LiquidBottomSheet';
import SheetHeader, { SHEET_PADDING } from '../components/common/SheetHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import { StockTakeSession, StockTakeItem } from '../types';
import { SkeletonList } from '../components/common/Skeleton';
import { getCompletedStockTakeSessions, getStockTakeItems, deleteAllCompletedStockTakeSessions } from '../db/database';
import { useTranslation } from '../hooks/useTranslation';
import { useConfirm } from '../components/common/ConfirmDialogProvider';

function fmtDateTime(ts: number) {
  return new Date(ts).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDateShort(ts: number) {
  return new Date(ts).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// Extracted + memoized — renders inside a `FlatList`; `onPress` is a stable
// top-level callback (`handleSelect`, passed directly, not wrapped in a
// fresh per-row closure) so `React.memo`'s shallow-equality check can
// actually skip re-rendering unchanged rows.
const SessionRow = React.memo(function SessionRow({
  session, index, colors, s, onPress,
}: {
  session: StockTakeSession; index: number; colors: any; s: any; onPress: (session: StockTakeSession) => void;
}) {
  const sum = session.summary;
  const net = sum?.netAdjustment ?? 0;
  return (
    <MotiView
      from={{ opacity: 0, translateY: 8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 220, delay: Math.min(index * 40, 280) }}
    >
      <TouchableOpacity
        style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => onPress(session)}
        activeOpacity={0.75}
      >
        <View style={[s.cardIcon, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="clipboard-outline" size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 7 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text style={[s.cardDate, { color: colors.text }]} numberOfLines={1}>
              {fmtDateTime(session.completedAt!)}
            </Text>
            <View style={[s.scopePill, { backgroundColor: colors.primaryLight }]}>
              <Text style={[s.scopeText, { color: colors.primary }]}>
                {session.scope === 'all' ? 'All' : session.scope}
              </Text>
            </View>
          </View>
          {sum && (
            <View style={s.statsRow}>
              <StatChip value={sum.counted} label="counted" color={colors.primary} />
              <StatChip value={sum.short} label="short" color={sum.short > 0 ? colors.danger : colors.textMuted} />
              <StatChip value={sum.over} label="over" color={sum.over > 0 ? colors.success : colors.textMuted} />
              <View style={[s.netPill, {
                backgroundColor: net === 0
                  ? colors.border + '40'
                  : net < 0 ? colors.danger + '15' : colors.success + '15',
              }]}>
                <Ionicons
                  name={net === 0 ? 'remove' : net < 0 ? 'trending-down-outline' : 'trending-up-outline'}
                  size={11}
                  color={net === 0 ? colors.textMuted : net < 0 ? colors.danger : colors.success}
                />
                <Text style={[s.netText, {
                  color: net === 0 ? colors.textMuted : net < 0 ? colors.danger : colors.success,
                }]}>
                  {net > 0 ? '+' : ''}{net} net
                </Text>
              </View>
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </MotiView>
  );
});

export default function StockTakeHistoryScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<StockTakeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<StockTakeSession | null>(null);
  const [sessionItems, setSessionItems] = useState<StockTakeItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const sheetRef = useRef<LiquidBottomSheetRef>(null);

  const handleDeleteAll = useCallback(async () => {
    const ok = await confirm({
      title: t('deleteAllHistory'),
      message: `This will permanently delete ${sessions.length} stock take session${sessions.length !== 1 ? 's' : ''} and all their records. This cannot be undone.`,
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      destructive: true,
    });
    if (ok) {
      await deleteAllCompletedStockTakeSessions();
      setSessions([]);
    }
  }, [sessions.length]);

  useLayoutEffect(() => {
    navigation.setOptions({
      // iOS-only — see InventoryScreen's header comment for why.
      ...(Platform.OS === 'ios' ? { headerTransparent: true, headerStyle: { backgroundColor: 'transparent' } } : null),
      headerRight: sessions.length > 0 && !loading
        ? () => (
            <TouchableOpacity onPress={handleDeleteAll} hitSlop={12} accessibilityLabel="Delete all history" accessibilityRole="button">
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
            </TouchableOpacity>
          )
        : undefined,
    });
  }, [navigation, handleDeleteAll, sessions.length, loading, colors.danger]);

  useEffect(() => {
    getCompletedStockTakeSessions().then(data => {
      setSessions(data);
      setLoading(false);
    });
  }, []);

  const handleSelect = useCallback(async (session: StockTakeSession) => {
    setSelectedSession(session);
    setSessionItems([]);
    sheetRef.current?.expand();
    setItemsLoading(true);
    const items = await getStockTakeItems(session.id);
    setSessionItems(items.filter(i => i.countedQty !== null));
    setItemsLoading(false);
  }, []);

  const handleSheetClose = useCallback(() => {
    setSelectedSession(null);
    setSessionItems([]);
  }, []);

  const s = useMemo(() => makeStyles(colors), [colors]);

  const renderSession = useCallback(({ item, index }: { item: StockTakeSession; index: number }) => (
    <SessionRow session={item} index={index} colors={colors} s={s} onPress={handleSelect} />
  ), [colors, s, handleSelect]);

  return (
    <>
      {/* `FlatList` is a direct child here (Fragment root) so react-native-screens
          can detect it — same fix as InventoryScreen. The loading skeleton moved
          into `ListEmptyComponent` instead of an early return, so this stays
          mounted from the very first render (see ShopInfoScreen for why that
          matters for the header's automatic inset). */}
      <FlatList
        data={sessions}
        keyExtractor={item => item.id}
        renderItem={renderSession}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={{ padding: 14, paddingBottom: 40, flexGrow: 1 }}
        ListEmptyComponent={
          loading ? (
            <SkeletonList count={5} />
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
              <Ionicons name="clipboard-outline" size={52} color={colors.textMuted} />
              <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.text }}>{t('noHistoryYet')}</Text>
              <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 40 }}>
                {t('completedStockTakesHere')}
              </Text>
            </View>
          )
        }
      />

      {/* Session detail bottom sheet */}
      <LiquidBottomSheet ref={sheetRef} onDismiss={handleSheetClose}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          <SheetHeader
            title={selectedSession ? fmtDateShort(selectedSession.completedAt!) : ''}
            subtitle={selectedSession?.scope === 'all' ? 'All products' : selectedSession?.scope ?? ''}
          />

          {/* Summary stats */}
          {selectedSession?.summary && (() => {
            const sum = selectedSession.summary!;
            const net = sum.netAdjustment;
            return (
              <View style={[s.sheetStats, { backgroundColor: colors.surfaceHigh, borderBottomColor: colors.border }]}>
                {([
                  { label: 'Counted', value: String(sum.counted), color: colors.primary },
                  { label: t('short'),   value: String(sum.short),   color: sum.short > 0 ? colors.danger  : colors.textMuted },
                  { label: t('over'),    value: String(sum.over),    color: sum.over  > 0 ? colors.success : colors.textMuted },
                  { label: 'Skipped', value: String(sum.skipped), color: colors.textMuted },
                  { label: t('netLabel'), value: (net > 0 ? '+' : '') + net, color: net < 0 ? colors.danger : net > 0 ? colors.success : colors.textMuted },
                ]).map((stat, i) => (
                  <React.Fragment key={stat.label}>
                    {i > 0 && <View style={[s.statDivider, { backgroundColor: colors.border }]} />}
                    <View style={s.sheetStatItem}>
                      <Text style={[s.sheetStatVal, { color: stat.color }]}>{stat.value}</Text>
                      <Text style={[s.sheetStatLbl, { color: colors.textMuted }]}>{stat.label}</Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            );
          })()}

          {/* Items */}
          {itemsLoading ? (
            <View style={{ paddingVertical: 48, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <>
              {/* Column header */}
              <View style={[s.colHeader, { backgroundColor: colors.surfaceHigh, borderBottomColor: colors.border }]}>
                <Text style={[s.colLbl, { color: colors.textMuted, flex: 1 }]}>PRODUCT</Text>
                <Text style={[s.colLbl, { color: colors.textMuted, width: 36, textAlign: 'center' }]}>WAS</Text>
                <View style={{ width: 18 }} />
                <Text style={[s.colLbl, { color: colors.textMuted, width: 36, textAlign: 'center' }]}>NOW</Text>
                <Text style={[s.colLbl, { color: colors.textMuted, width: 46, textAlign: 'center' }]}>DIFF</Text>
              </View>

              {sessionItems.map((item, idx) => {
                const diff = (item.countedQty ?? 0) - item.systemQty;
                return (
                  <View
                    key={item.id}
                    style={[
                      s.itemRow,
                      {
                        borderBottomColor: colors.border,
                        backgroundColor: idx % 2 === 0 ? colors.surface : colors.surfaceHigh + '60',
                      },
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.itemName, { color: colors.text }]} numberOfLines={1}>{item.productName}</Text>
                      <Text style={[s.itemCat, { color: colors.textMuted }]}>{item.category}</Text>
                    </View>
                    <Text style={[s.qty, { color: colors.textSub, width: 36, textAlign: 'center' }]}>{item.systemQty}</Text>
                    <View style={{ width: 18, alignItems: 'center' }}>
                      <Ionicons name="arrow-forward" size={11} color={colors.textMuted} />
                    </View>
                    <Text style={[s.qty, { color: colors.text, width: 36, textAlign: 'center' }]}>{item.countedQty}</Text>
                    {diff === 0 ? (
                      <View style={[s.diffBadge, { backgroundColor: colors.success + '18' }]}>
                        <Ionicons name="checkmark" size={12} color={colors.success} />
                      </View>
                    ) : diff > 0 ? (
                      <View style={[s.diffBadge, { backgroundColor: colors.success + '18' }]}>
                        <Text style={[s.diffText, { color: colors.success }]}>+{diff}</Text>
                      </View>
                    ) : (
                      <View style={[s.diffBadge, { backgroundColor: colors.danger + '18' }]}>
                        <Text style={[s.diffText, { color: colors.danger }]}>{diff}</Text>
                      </View>
                    )}
                  </View>
                );
              })}

              {sessionItems.length === 0 && (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted }}>
                    {t('noItemsRecorded')}
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </LiquidBottomSheet>
    </>
  );
}

function StatChip({ value, label, color }: { value: number; label: string; color: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Text style={{ fontFamily: fonts.extraBold, fontSize: 13, color }}>{value}</Text>
      <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted }}>{label}</Text>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    padding: 14, marginBottom: 10,
  },
  cardIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  cardDate: { fontFamily: fonts.bold, fontSize: 13, flex: 1 },
  scopePill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  scopeText: { fontFamily: fonts.semiBold, fontSize: 11 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  netPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  netText: { fontFamily: fonts.bold, fontSize: 11 },

  sheetStats: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: SHEET_PADDING, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetStatItem: { flex: 1, alignItems: 'center' },
  sheetStatVal: { fontFamily: fonts.extraBold, fontSize: 18 },
  sheetStatLbl: { fontFamily: fonts.medium, fontSize: 10, marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },

  colHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SHEET_PADDING, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colLbl: { fontFamily: fonts.extraBold, fontSize: 10, letterSpacing: 0.6 },

  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SHEET_PADDING, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 4,
  },
  itemName: { fontFamily: fonts.bold, fontSize: 13 },
  itemCat: { fontFamily: fonts.regular, fontSize: 11, marginTop: 2 },
  qty: { fontFamily: fonts.extraBold, fontSize: 14 },
  diffBadge: { width: 46, height: 28, borderRadius: 7, justifyContent: 'center', alignItems: 'center' },
  diffText: { fontFamily: fonts.extraBold, fontSize: 12 },
});
