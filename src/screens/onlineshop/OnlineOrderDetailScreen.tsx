import React, { useEffect, useLayoutEffect, useMemo, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';
import { useOnlineShopStore } from '../../stores/useOnlineShopStore';
import { OnlineOrderDetailSkeleton } from '../../components/common/Skeleton';
import { formatCurrency } from '../../utils/helpers';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../stores/useAppStore';
import LiquidButton from '../../components/common/LiquidButton';
import { OrderStatus } from '../../types/online';
import { toast } from '../../utils/toast';
import { useConfirm } from '../../components/common/ConfirmDialogProvider';

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending: '#A98545',
  accepted: '#5B7567',
  ready: '#5B7567',
  completed: '#5B7567',
  rejected: '#A65A4D',
  cancelled: '#A65A4D',
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

export default function OnlineOrderDetailScreen({ route, navigation }: any) {
  const { colors } = useAppTheme();
  const { settings } = useAppStore(
    useShallow(state => ({
      settings: state.settings,
    }))
  );
  const { confirm } = useConfirm();
  const { orders, updateOrderStatus, fetchOrderById } = useOnlineShopStore(
    useShallow(state => ({
      orders: state.orders,
      updateOrderStatus: state.updateOrderStatus,
      fetchOrderById: state.fetchOrderById,
    }))
  );
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const orderId = route?.params?.orderId;
  const order = useMemo(() => orders.find((o) => o.id === orderId), [orders, orderId]);

  // Not in the store yet — e.g. a push notification opened this screen
  // directly before the dashboard's fetchOrders ever ran. Fetch it directly
  // instead of assuming "not found" just because the in-memory list is empty.
  useEffect(() => {
    if (order || !orderId) return;
    fetchOrderById(orderId).then((found) => {
      if (!found) setNotFound(true);
    });
  }, [order, orderId]);

  const onRefresh = useCallback(async () => {
    if (!orderId) return;
    setRefreshing(true);
    const found = await fetchOrderById(orderId);
    if (!found) setNotFound(true);
    setRefreshing(false);
  }, [orderId, fetchOrderById]);

  const s = makeStyles(colors);

  // iOS-only — see InventoryScreen's header comment for why `headerTransparent`
  // needs this: it no longer reserves layout space for the native header, so
  // content needs to compensate (here, by the ScrollView below being the
  // screen's own first native child, which lets react-native-screens'
  // automatic content-inset adjustment handle it — no manual padding needed).
  useLayoutEffect(() => {
    navigation.setOptions({
      ...(Platform.OS === 'ios' ? { headerTransparent: true, headerStyle: { backgroundColor: 'transparent' } } : null),
    });
  }, [navigation]);

  const handleAction = useCallback(async (action: 'accepted' | 'rejected' | 'ready' | 'completed') => {
    if (!order) return;
    const labels: Record<string, string> = {
      accepted: 'Accept Order',
      rejected: 'Reject Order',
      ready: 'Mark as Ready',
      completed: 'Mark as Completed',
    };
    const msg: Record<string, string> = {
      accepted: 'Accept this order and start preparing?',
      rejected: 'Reject this order? The customer will be notified.',
      ready: 'Mark this order as ready for pickup/delivery?',
      completed: 'Mark this order as completed?',
    };
    const successMsg: Record<string, string> = {
      accepted: 'Order accepted',
      rejected: 'Order rejected',
      ready: 'Order marked as ready',
      completed: 'Order completed',
    };
    const ok = await confirm({
      title: labels[action],
      message: msg[action],
      confirmLabel: labels[action],
      destructive: action === 'rejected',
    });
    if (!ok) return;
    setLoading(true);
    try {
      await updateOrderStatus(order.id, action);
      toast.success(successMsg[action]);
    } catch (e: any) {
      toast.error('Could not update order', { description: e?.message ?? 'Check your connection and try again.' });
    } finally {
      setLoading(false);
    }
  }, [order, confirm, updateOrderStatus]);

  // `bottomAccessory` (iOS 26+ only) — same conversion as DayCloseScreen/
  // ExpensesScreen/BillingScreen. Scoped with `useFocusEffect` (set on
  // focus, cleared on blur), not a plain mount effect — this screen sits
  // inside the Online Orders stack alongside the list screen, and a stale
  // closure would otherwise keep floating there after navigating away.
  // Content varies with order status: a spinner while an action is in
  // flight, Reject+Accept for a pending order, a single follow-up action for
  // accepted/ready, or nothing at all for a terminal status.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'ios') return;
      const parent = navigation.getParent();

      if (!order) {
        parent?.setOptions({ bottomAccessory: undefined });
      } else if (loading) {
        parent?.setOptions({
          bottomAccessory: () => (
            <View style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ),
        });
      } else if (order.status === 'pending') {
        parent?.setOptions({
          bottomAccessory: ({ placement }: { placement: 'regular' | 'inline' }) => (
            <View style={{ flexDirection: 'row', width: '100%', height: '100%', gap: 10, paddingHorizontal: placement === 'inline' ? 10 : 16 }}>
              <TouchableOpacity
                onPress={() => handleAction('rejected')}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 20 }}
                accessibilityLabel="Reject order"
                accessibilityRole="button"
              >
                <Ionicons name="close" size={placement === 'inline' ? 14 : 17} color={colors.danger} />
                <Text style={{ color: colors.danger, fontFamily: fonts.bold, fontSize: placement === 'inline' ? 12 : 14 }}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleAction('accepted')}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 20, backgroundColor: colors.primary }}
                accessibilityLabel="Accept order"
                accessibilityRole="button"
              >
                <Ionicons name="checkmark" size={placement === 'inline' ? 14 : 17} color="#fff" />
                <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: placement === 'inline' ? 12 : 14 }}>Accept</Text>
              </TouchableOpacity>
            </View>
          ),
        });
      } else if (order.status === 'accepted' || order.status === 'ready') {
        const next = order.status === 'accepted' ? 'ready' : 'completed';
        const label = order.status === 'accepted' ? 'Mark Ready' : 'Mark Completed';
        const icon = order.status === 'accepted' ? 'bag' : 'checkmark-circle';
        const tint = order.status === 'accepted' ? colors.primary : colors.success;
        parent?.setOptions({
          bottomAccessory: () => (
            <TouchableOpacity
              onPress={() => handleAction(next)}
              style={{ width: '100%', height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 24, paddingHorizontal: 18, backgroundColor: tint }}
              accessibilityLabel={label}
              accessibilityRole="button"
            >
              <Ionicons name={icon as any} size={18} color="#fff" />
              <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 14 }}>{label}</Text>
            </TouchableOpacity>
          ),
        });
      } else {
        // Terminal status (completed/rejected/cancelled) — nothing to show.
        parent?.setOptions({ bottomAccessory: undefined });
      }

      return () => { parent?.setOptions({ bottomAccessory: undefined }); };
    }, [navigation, order, loading, colors, handleAction])
  );

  if (!order && !notFound) {
    return <OnlineOrderDetailSkeleton />;
  }

  if (!order) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.regular }}>Order not found.</Text>
      </View>
    );
  }

  const statusColor = STATUS_COLOR[order.status] ?? colors.textMuted;

  return (
    // `ScrollView` is the root here (no wrapping `View`) — same fix as
    // InventoryScreen/DayCloseScreen: react-native-screens needs the scroll
    // view reachable as the screen's first native child both for automatic
    // header content-inset adjustment (so content isn't hidden under the now
    // see-through `headerTransparent` header) and for the iOS 26 collapsing/
    // minimizing tab+accessory bar to find the scroll view at all.
    <>
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
    >

        {/* Status header */}
        <View style={[s.statusCard, { backgroundColor: colors.surface, borderColor: statusColor + '40' }]}>
          <View style={[s.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[s.statusText, { color: statusColor }]}>{order.status.toUpperCase()}</Text>
          </View>
          <Text style={[s.orderId, { color: colors.textMuted }]}>#{order.id.slice(0, 8).toUpperCase()}</Text>
          <Text style={[s.orderTime, { color: colors.textMuted }]}>{formatDateTime(order.createdAt)}</Text>
          {order.expiresAt && order.status === 'pending' && (
            <Text style={[s.expiryText, { color: colors.warning }]}>
              Auto-cancels at {formatDateTime(order.expiresAt)}
            </Text>
          )}
        </View>

        {/* Customer info */}
        <View style={[s.section, { backgroundColor: colors.surface }]}>
          <Text style={[s.sectionTitle, { color: colors.textMuted }]}>CUSTOMER</Text>
          <Text style={[s.customerName, { color: colors.text }]}>{order.customerName}</Text>
          {order.customerPhone && (
            <View style={s.infoRow}>
              <Ionicons name="call-outline" size={14} color={colors.textMuted} />
              <Text style={[s.infoText, { color: colors.textSub }]}>{order.customerPhone}</Text>
            </View>
          )}
          {order.customerAddress && (
            <View style={s.infoRow}>
              <Ionicons name="location-outline" size={14} color={colors.textMuted} />
              <Text style={[s.infoText, { color: colors.textSub }]}>{order.customerAddress}</Text>
            </View>
          )}
          {order.note && (
            <View style={[s.noteBox, { backgroundColor: colors.surfaceHigh }]}>
              <Ionicons name="chatbubble-outline" size={14} color={colors.textMuted} />
              <Text style={[s.noteText, { color: colors.textSub }]}>{order.note}</Text>
            </View>
          )}
        </View>

        {/* Items */}
        <View style={[s.section, { backgroundColor: colors.surface }]}>
          <Text style={[s.sectionTitle, { color: colors.textMuted }]}>ITEMS</Text>
          {order.items.map((item, i) => (
            <View key={i} style={[s.itemRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <Text style={[s.itemQty, { color: colors.textMuted }]}>{item.quantity}×</Text>
              <Text style={[s.itemName, { color: colors.text }]}>{item.productName}</Text>
              <Text style={[s.itemPrice, { color: colors.text }]}>{formatCurrency(item.totalPrice, settings.currency)}</Text>
            </View>
          ))}
        </View>

        {/* Bill summary */}
        <View style={[s.section, { backgroundColor: colors.surface }]}>
          <Text style={[s.sectionTitle, { color: colors.textMuted }]}>BILL</Text>
          <View style={s.billRow}>
            <Text style={[s.billLabel, { color: colors.textSub }]}>Subtotal</Text>
            <Text style={[s.billValue, { color: colors.textSub }]}>{formatCurrency(order.subtotal, settings.currency)}</Text>
          </View>
          {order.deliveryFee > 0 && (
            <View style={s.billRow}>
              <Text style={[s.billLabel, { color: colors.textSub }]}>Delivery</Text>
              <Text style={[s.billValue, { color: colors.textSub }]}>{formatCurrency(order.deliveryFee, settings.currency)}</Text>
            </View>
          )}
          <View style={[s.billRow, s.totalRow]}>
            <Text style={[s.billLabel, { color: colors.text, fontFamily: fonts.bold }]}>Total</Text>
            <Text style={[s.totalValue, { color: colors.text }]}>{formatCurrency(order.total, settings.currency)}</Text>
          </View>
        </View>
        {/* iOS gets the native `bottomAccessory` (set up above via
            `useFocusEffect` + `navigation.getParent()?.setOptions`) instead
            — Android has no such API, so it keeps these in-flow buttons as
            the last scrollable item. */}
        {Platform.OS !== 'ios' && (
          loading ? (
            <View style={s.actionBar}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : order.status === 'pending' ? (
            <View style={s.actionBar}>
              <LiquidButton title="Reject" icon="xmark" onPress={() => handleAction('rejected')} variant="glass" tintColor={colors.danger} style={{ flex: 1 }} />
              <LiquidButton title="Accept" icon="checkmark" onPress={() => handleAction('accepted')} variant="glassProminent" style={{ flex: 1 }} />
            </View>
          ) : order.status === 'accepted' ? (
            <View style={s.actionBar}>
              <LiquidButton title="Mark Ready" icon="bag.fill" onPress={() => handleAction('ready')} variant="glassProminent" />
            </View>
          ) : order.status === 'ready' ? (
            <View style={s.actionBar}>
              <LiquidButton title="Mark Completed" icon="checkmark.circle.fill" onPress={() => handleAction('completed')} tintColor={colors.success} />
            </View>
          ) : null
        )}
    </ScrollView>
    </>
  );
}

const makeStyles = (c: any) =>
  StyleSheet.create({
    statusCard: { borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1 },
    statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 8 },
    statusText: { fontFamily: fonts.bold, fontSize: 12 },
    orderId: { fontFamily: fonts.bold, fontSize: 14 },
    orderTime: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
    expiryText: { fontFamily: fonts.semiBold, fontSize: 12, marginTop: 6 },

    section: { borderRadius: 14, padding: 14, marginBottom: 10 },
    sectionTitle: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, marginBottom: 10 },
    customerName: { fontFamily: fonts.extraBold, fontSize: 17, marginBottom: 6 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    infoText: { fontFamily: fonts.regular, fontSize: 14 },
    noteBox: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: 10, marginTop: 6 },
    noteText: { fontFamily: fonts.regular, fontSize: 13, flex: 1, lineHeight: 18 },

    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    itemQty: { fontFamily: fonts.bold, fontSize: 13, width: 28 },
    itemName: { fontFamily: fonts.semiBold, fontSize: 14, flex: 1 },
    itemPrice: { fontFamily: fonts.bold, fontSize: 14 },

    billRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
    totalRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, marginTop: 4, paddingTop: 10 },
    billLabel: { fontFamily: fonts.regular, fontSize: 14 },
    billValue: { fontFamily: fonts.regular, fontSize: 14 },
    totalValue: { fontFamily: fonts.extraBold, fontSize: 17 },

    // Android-only now (iOS uses the native `bottomAccessory` instead) — this
    // is just the last item inside the scroll content, not a fixed overlay
    // anymore, so no more `marginBottom` clearance for a floating tab bar.
    actionBar: { flexDirection: 'row', gap: 12, marginTop: 4, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
    actionBtnText: { fontFamily: fonts.bold, fontSize: 16 },
  });
