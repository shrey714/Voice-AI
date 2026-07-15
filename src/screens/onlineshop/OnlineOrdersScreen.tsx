import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, RefreshControl, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { useIsFocused } from '@react-navigation/native';
import LiquidBottomSheet, { LiquidBottomSheetRef } from '../../components/common/LiquidBottomSheet';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';
import { useOnlineShopStore } from '../../stores/useOnlineShopStore';
import { OnlineOrder, OrderStatus } from '../../types/online';
import { formatCurrency, startOfDay, startOfWeek, startOfMonth } from '../../utils/helpers';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../stores/useAppStore';
import EmptyState from '../../components/common/EmptyState';
import { OnlineOrdersSkeleton } from '../../components/common/Skeleton';
import DatePickerSheet, { DatePickerSheetRef } from '../../components/common/DatePickerSheet';
import InlineSearchBar from '../../components/common/InlineSearchBar';
import LiquidHeaderIconButton from '../../components/common/LiquidHeaderIconButton';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];
type PeriodFilter = 'today' | 'week' | 'month' | 'all' | 'custom';

const PERIOD_TABS: { key: PeriodFilter; label: string; icon: IoniconsName }[] = [
  { key: 'today', label: 'Today', icon: 'today-outline' },
  { key: 'week', label: 'This Week', icon: 'calendar-outline' },
  { key: 'month', label: 'This Month', icon: 'calendar-outline' },
  { key: 'all', label: 'All Time', icon: 'infinite-outline' },
  { key: 'custom', label: 'Custom', icon: 'options-outline' },
];

const STATUS_TABS: { key: OrderStatus | 'all'; label: string; icon: IoniconsName }[] = [
  { key: 'all', label: 'All', icon: 'apps-outline' },
  { key: 'pending', label: 'Pending', icon: 'time-outline' },
  { key: 'accepted', label: 'Accepted', icon: 'checkmark-circle-outline' },
  { key: 'ready', label: 'Ready', icon: 'bag-check-outline' },
  { key: 'completed', label: 'Done', icon: 'checkmark-done-outline' },
  { key: 'rejected', label: 'Rejected', icon: 'close-circle-outline' },
];

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending: '#A98545',
  accepted: '#5B7567',
  ready: '#5B7567',
  completed: '#5B7567',
  rejected: '#A65A4D',
  cancelled: '#A65A4D',
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

// Extracted + memoized — renders inside a `FlatList`; `onPress` is a stable
// top-level callback (`openOrderDetail`, passed directly, not wrapped in a
// fresh per-row closure) so `React.memo`'s shallow-equality check can
// actually skip re-rendering unchanged rows.
const OrderRow = React.memo(function OrderRow({
  order, index, colors, s, currency, onPress,
}: {
  order: OnlineOrder; index: number; colors: any; s: any; currency: string; onPress: (order: OnlineOrder) => void;
}) {
  const statusColor = STATUS_COLOR[order.status] ?? colors.textMuted;
  return (
    <MotiView
      from={{ opacity: 0, translateY: 8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 250, delay: Math.min(index * 30, 300) }}
    >
      <TouchableOpacity
        style={[s.card, { backgroundColor: colors.surface }]}
        onPress={() => onPress(order)}
        activeOpacity={0.8}
      >
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[s.customerName, { color: colors.text }]}>{order.customerName}</Text>
            {order.customerPhone ? (
              <Text style={[s.customerPhone, { color: colors.textMuted }]}>{order.customerPhone}</Text>
            ) : null}
            <Text style={[s.itemsText, { color: colors.textSub }]}>
              {order.items.length} item{order.items.length !== 1 ? 's' : ''} ·{' '}
              {order.items.map((i) => i.productName).join(', ')}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Text style={[s.total, { color: colors.text }]}>{formatCurrency(order.total, currency)}</Text>
            <View style={[s.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[s.statusText, { color: statusColor }]}>{order.status.toUpperCase()}</Text>
            </View>
          </View>
        </View>
        <View style={[s.cardBottom, { borderTopColor: colors.border }]}>
          <Ionicons name="time-outline" size={13} color={colors.textMuted} />
          <Text style={[s.timeText, { color: colors.textMuted }]}>
            {formatDate(order.createdAt)} · {formatTime(order.createdAt)}
          </Text>
          {order.deliveryFee > 0 && (
            <Text style={[s.deliveryTag, { color: colors.info }]}>
              + {formatCurrency(order.deliveryFee, currency)} delivery
            </Text>
          )}
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
        </View>
      </TouchableOpacity>
    </MotiView>
  );
});

export default function OnlineOrdersScreen({ navigation, route }: any) {
  const { colors } = useAppTheme();
  const { settings } = useAppStore(
    useShallow(state => ({
      settings: state.settings,
    }))
  );
  const { config, orders, isLoadingConfig, isLoadingOrders, fetchShopConfig, fetchOrders } = useOnlineShopStore(
    useShallow(state => ({
      config: state.config,
      orders: state.orders,
      isLoadingConfig: state.isLoadingConfig,
      isLoadingOrders: state.isLoadingOrders,
      fetchShopConfig: state.fetchShopConfig,
      fetchOrders: state.fetchOrders,
    }))
  );
  const [activeTab, setActiveTab] = useState<OrderStatus | 'all'>(route?.params?.filterStatus ?? 'all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('today');
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const filterSheetRef = useRef<LiquidBottomSheetRef>(null);
  const rangePickerRef = useRef<DatePickerSheetRef>(null);
  const openFilterSheet = useCallback(() => filterSheetRef.current?.expand(), []);

  const activeFilterCount = (activeTab !== 'all' ? 1 : 0) + (periodFilter !== 'today' ? 1 : 0);
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  // Same as InventoryScreen: `headerTransparent` no longer reserves layout
  // space for the native header on either platform, so content needs to
  // compensate manually. 44 is UIKit's standard compact nav bar height on
  // iOS; 56 is Material's standard app-bar height on Android. `insets.top`
  // covers the status bar/notch on both.
  const headerCompensation = insets.top + (Platform.OS === 'ios' ? 44 : 56);
  const openOrderDetail = useCallback((order: OnlineOrder) => {
    navigation.navigate('OnlineOrderDetail', { orderId: order.id });
  }, [navigation]);

  // Plain flex row, not absolutely-positioned siblings — see
  // AppNavigator's useHeaderOpts comment for why.
  useEffect(() => {
    navigation.setOptions({
      headerTransparent: true,
      headerStyle: { backgroundColor: 'transparent' },
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <LiquidHeaderIconButton
            icon="line.3.horizontal.decrease.circle"
            androidIcon="options-outline"
            color={activeFilterCount > 0 ? colors.primary : colors.textMuted}
            onPress={openFilterSheet}
            badge={activeFilterCount > 0 ? (
              <View style={[s.filterBadge, { backgroundColor: colors.primary }]}>
                <Text style={[s.filterBadgeText, { color: '#fff' }]}>{activeFilterCount}</Text>
              </View>
            ) : undefined}
          />
          <LiquidHeaderIconButton
            icon="magnifyingglass"
            androidIcon="search-outline"
            onPress={() => setSearchOpen(v => !v)}
          />
        </View>
      ),
    });
  }, [navigation, colors, activeFilterCount, openFilterSheet, s]);

  // Both this screen and the Inventory tab sit in a `lazy: false` navigator
  // (needed so the tab-switch pager can animate a slide — see AppNavigator),
  // which mounts all three online tabs immediately, not just the focused
  // one. Gating the actual fetches on focus means mounting stays cheap and
  // the real network calls only fire once the shopkeeper actually visits
  // this tab, instead of every online screen racing to fetch at once the
  // moment Online mode is first entered.
  const isFocused = useIsFocused();

  // Self-sufficient like the other gated screens — this can be reached
  // directly from a push notification, bypassing the dashboard, so it can't
  // assume something else already loaded the shop/orders for it.
  useEffect(() => {
    if (isFocused && !config.shopId) fetchShopConfig();
  }, [isFocused]);

  useEffect(() => {
    if (isFocused && config.shopId) fetchOrders(config.shopId);
  }, [isFocused, config.shopId]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchShopConfig();
    const shopId = useOnlineShopStore.getState().config.shopId;
    if (shopId) await fetchOrders(shopId);
    setRefreshing(false);
  }, [fetchShopConfig, fetchOrders]);

  const filtered = useMemo(() => {
    let start = 0;
    let customEndMs: number | null = null;

    if (periodFilter === 'today') start = startOfDay();
    else if (periodFilter === 'week') start = startOfWeek();
    else if (periodFilter === 'month') start = startOfMonth();
    else if (periodFilter === 'custom') {
      if (customFrom) { const d = new Date(customFrom); d.setHours(0, 0, 0, 0); start = d.getTime(); }
      if (customTo) { const d = new Date(customTo); d.setHours(23, 59, 59, 999); customEndMs = d.getTime(); }
    }

    const q = searchQuery.trim().toLowerCase();
    return orders
      .filter((o) => {
        const t = new Date(o.createdAt).getTime();
        return t >= start && (customEndMs === null || t <= customEndMs);
      })
      .filter((o) => activeTab === 'all' || o.status === activeTab)
      .filter((o) => {
        if (!q) return true;
        return (
          o.customerName?.toLowerCase().includes(q) ||
          o.customerPhone?.includes(q) ||
          o.items.some((i) => i.productName.toLowerCase().includes(q))
        );
      });
  }, [orders, activeTab, periodFilter, customFrom, customTo, searchQuery]);

  const renderOrder = useCallback(({ item, index }: { item: OnlineOrder; index: number }) => (
    <OrderRow order={item} index={index} colors={colors} s={s} currency={settings.currency} onPress={openOrderDetail} />
  ), [colors, s, settings.currency, openOrderDetail]);

  if (isLoadingConfig || isLoadingOrders) {
    return <OnlineOrdersSkeleton />;
  }

  const activeStatusTab = STATUS_TABS.find((t) => t.key === activeTab)!;

  return (
    <>
      {searchOpen && (
        // `headerTransparent` (iOS) means this row is no longer pushed below
        // a solid header by normal flow — see InventoryScreen's identical
        // comment for the full explanation.
        <View style={Platform.OS === 'ios' ? { marginTop: headerCompensation } : undefined}>
          <InlineSearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search customer, phone, product…"
            onClose={() => setSearchOpen(false)}
          />
        </View>
      )}
      {/* `FlatList` is a direct child here, not wrapped in an extra `View` —
          same fix as InventoryScreen: react-native-screens needs the scroll
          view reachable as (close to) the screen's first native child for
          `headerTransparent`/`tabBarMinimizeBehavior` to detect it, and that
          wrapper (needed only to `overflow: 'hidden'`-clip `ScrollHideBar`'s
          slide animation) was blocking it. The filter strip moved from a
          `ScrollHideBar` sibling into `ListHeaderComponent` below — it no
          longer auto-hides on scroll-down (that behavior depended entirely
          on the wrapper), it now just scrolls away with the list. */}
      <FlatList
        data={filtered}
        style={{ flex: 1 }}
        keyExtractor={(o) => o.id}
        renderItem={renderOrder}
        scrollEventThrottle={16}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={{
          paddingHorizontal: 10,
          // No manual `headerCompensation` here (unlike the search bar
          // below) — same as InventoryScreen: once a `FlatList`/`ScrollView`
          // is properly detected as the screen's first-descendant scroll
          // view, iOS 26 applies `contentInsetAdjustmentBehavior: automatic`
          // to it natively, insetting it below the transparent header on its
          // own. Adding manual padding on top of that doubles the gap.
          paddingTop: 8,
          paddingBottom: 120,
          flexGrow: 1,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListHeaderComponent={
          // Active filter strip — always visible so the current period +
          // status selection reads as "selected", not just when non-default.
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8, gap: 8 }}>
            <TouchableOpacity style={[s.activeChip, { backgroundColor: colors.info + '18', borderColor: colors.info + '40' }]} onPress={openFilterSheet}>
              <Ionicons name="calendar-outline" size={12} color={colors.info} />
              <Text style={[s.activeChipText, { color: colors.info }]}>
                {periodFilter === 'today' ? 'Today' : periodFilter === 'week' ? 'This Week' : periodFilter === 'month' ? 'This Month' : periodFilter === 'all' ? 'All Time' : customFrom || customTo
                  ? [customFrom?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), customTo?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })].filter(Boolean).join(' – ')
                  : 'Custom'}
              </Text>
              {periodFilter !== 'today' && (
                <Ionicons name="close" size={11} color={colors.info} onPress={() => { setPeriodFilter('today'); setCustomFrom(null); setCustomTo(null); }} />
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[s.activeChip, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]} onPress={openFilterSheet}>
              <Ionicons name={activeStatusTab.icon} size={12} color={colors.primary} />
              <Text style={[s.activeChipText, { color: colors.primary }]}>{activeStatusTab.label}</Text>
              {activeTab !== 'all' && (
                <Ionicons name="close" size={11} color={colors.primary} onPress={() => setActiveTab('all')} />
              )}
            </TouchableOpacity>
          </ScrollView>
        }
        ListEmptyComponent={
          <EmptyState
            icon="bag-outline"
            title={isLoadingOrders ? 'Loading orders…' : 'No orders found'}
            subtitle={isLoadingOrders ? '' : (searchQuery || activeFilterCount > 0) ? 'Try a different search or filter.' : 'Orders from your online customers will appear here.'}
          />
        }
      />

      {/* Filter Sheet */}
      <LiquidBottomSheet ref={filterSheetRef}>
          <View style={[s.fsHeader, { borderBottomColor: colors.border }]}>
            <Text style={[s.fsTitle, { color: colors.text }]}>Filters</Text>
            <TouchableOpacity onPress={() => { setActiveTab('all'); setPeriodFilter('today'); setCustomFrom(null); setCustomTo(null); }}>
              <Text style={[s.fsReset, { color: colors.danger }]}>Reset</Text>
            </TouchableOpacity>
          </View>

          <Text style={[s.fsSectionLabel, { color: colors.textMuted }]}>PERIOD</Text>
          <View style={s.fsChipRow}>
            {PERIOD_TABS.map(({ key, label, icon }) => {
              const on = periodFilter === key;
              return (
                <TouchableOpacity key={key}
                  style={[s.fsChip, { backgroundColor: on ? colors.primary : colors.surfaceHigh, borderColor: on ? colors.primary : colors.border }]}
                  onPress={() => setPeriodFilter(key)}
                >
                  <Ionicons name={icon} size={14} color={on ? '#fff' : colors.textSub} />
                  <Text style={[s.fsChipText, { color: on ? '#fff' : colors.textSub }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {periodFilter === 'custom' && (
            <View style={[s.fsDateBox, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
              <TouchableOpacity style={s.fsDateRow} onPress={() => rangePickerRef.current?.open()}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.fsDateLabel, { color: colors.textMuted }]}>DATE RANGE</Text>
                  <Text style={[s.fsDateRowValue, { color: (customFrom || customTo) ? colors.text : colors.textMuted }]}>
                    {customFrom || customTo
                      ? [
                          customFrom?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                          customTo?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                        ].filter(Boolean).join('  →  ')
                      : 'Tap to select range'}
                  </Text>
                </View>
                <Ionicons name={(customFrom && customTo) ? 'checkmark-circle' : 'calendar-outline'} size={18} color={(customFrom && customTo) ? colors.success : colors.textMuted} />
              </TouchableOpacity>

              {(customFrom || customTo) && (
                <TouchableOpacity style={s.fsClearDates} onPress={() => { setCustomFrom(null); setCustomTo(null); }}>
                  <Ionicons name="close-circle-outline" size={15} color={colors.danger} />
                  <Text style={[s.fsClearDatesText, { color: colors.danger }]}>Clear dates</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <Text style={[s.fsSectionLabel, { color: colors.textMuted }]}>ORDER STATUS</Text>
          <View style={s.fsChipRow}>
            {STATUS_TABS.map(({ key, label, icon }) => {
              const on = activeTab === key;
              return (
                <TouchableOpacity key={key}
                  style={[s.fsChip, { backgroundColor: on ? colors.primary : colors.surfaceHigh, borderColor: on ? colors.primary : colors.border }]}
                  onPress={() => setActiveTab(key)}
                >
                  <Ionicons name={icon} size={14} color={on ? '#fff' : colors.textSub} />
                  <Text style={[s.fsChipText, { color: on ? '#fff' : colors.textSub }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
      </LiquidBottomSheet>

      {/* Custom date range picker */}
      <DatePickerSheet
        ref={rangePickerRef}
        mode="range"
        title="Select Date Range"
        onSelectRange={({ from, to }) => { setCustomFrom(from); setCustomTo(to); }}
        calendarProps={{ enableSwipeMonths: true }}
      />
    </>
  );
}

const makeStyles = (c: any) =>
  StyleSheet.create({
    // Positioned relative to LiquidHeaderIconButton's own fixed-size
    // wrapper, not the header container, so this stays safe.
    filterBadge: { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    filterBadgeText: { fontSize: 10, fontFamily: fonts.extraBold },

    activeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
    activeChipText: { fontFamily: fonts.semiBold, fontSize: 12 },

    fsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 20 },
    fsTitle: { fontFamily: fonts.extraBold, fontSize: 18 },
    fsReset: { fontFamily: fonts.semiBold, fontSize: 14 },
    fsSectionLabel: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, marginBottom: 10, marginTop: 4 },
    fsChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
    fsChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
    fsChipText: { fontFamily: fonts.semiBold, fontSize: 13 },
    fsDateBox: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 20 },
    fsDateRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
    fsDateLabel: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.5, marginBottom: 3 },
    fsDateRowValue: { fontFamily: fonts.semiBold, fontSize: 15, marginTop: 2 },
    fsClearDates: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, justifyContent: 'center' },
    fsClearDatesText: { fontFamily: fonts.semiBold, fontSize: 13 },

    card: { borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
    cardTop: { flexDirection: 'row', gap: 10 },
    customerName: { fontFamily: fonts.bold, fontSize: 15 },
    customerPhone: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
    itemsText: { fontFamily: fonts.regular, fontSize: 12, marginTop: 4 },
    total: { fontFamily: fonts.extraBold, fontSize: 16 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    statusText: { fontFamily: fonts.bold, fontSize: 11 },
    cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
    timeText: { fontFamily: fonts.regular, fontSize: 12 },
    deliveryTag: { fontFamily: fonts.semiBold, fontSize: 12 },
  });
