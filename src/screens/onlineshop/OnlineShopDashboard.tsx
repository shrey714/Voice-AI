import React, { useEffect, useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, Share, Platform } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView, AnimatePresence } from 'moti';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  interpolateColor,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';
import { useOnlineShopStore } from '../../stores/useOnlineShopStore';
import { useOrderRealtime } from '../../hooks/useOrderRealtime';
import { OnlineShopDashboardSkeleton } from '../../components/common/Skeleton';
import AnimatedNumber from '../../components/common/AnimatedNumber';
import PressableScale from '../../components/common/PressableScale';
import { formatCurrency } from '../../utils/helpers';
import { isShopOpenNow } from '../../utils/shopStatus';
import { useAppStore } from '../../stores/useAppStore';
import { toast } from '../../utils/toast';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const STORE_HOST = 'shop.app';


const THUMB = 56;
const TRACK_PAD = 6;

/**
 * The centerpiece — a big, physical-feeling power switch, sitting on the
 * gradient hero the same way Home's WhatsApp-summary pill sits on its hero:
 * translucent white for the "off" state, solid white for "on", so it reads
 * correctly against colors.primary in both light and dark theme (the
 * gradient's exact hue shifts a little between modes; white-on-gradient
 * doesn't need to know which). Tap either half, or drag the knob and let go
 * on whichever side — same drag-then-snap idiom already used by the app's
 * bottom tab bar (capture start progress, translate by delta, spring to the
 * nearest side on release).
 */
function PowerToggle({ isOpen, disabled, loading, onChange, colors }: { isOpen: boolean; disabled: boolean; loading: boolean; onChange: (wantOpen: boolean) => void; colors: any }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = useSharedValue(isOpen ? 1 : 0);
  const dragStart = useSharedValue(0);
  const travel = Math.max(0, trackWidth - THUMB - TRACK_PAD * 2);

  // External state (e.g. a pull-to-refresh pulling fresh config) re-syncs the
  // knob; this also re-settles it after an optimistic drag gets reverted.
  useEffect(() => {
    progress.value = withTiming(isOpen ? 1 : 0, { duration: 200 });
  }, [isOpen]);

  const commit = useCallback((wantOpen: boolean) => {
    if (wantOpen === isOpen) return;
    Haptics.notificationAsync(wantOpen ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
    onChange(wantOpen);
  }, [isOpen, onChange]);

  const gesture = Gesture.Pan()
    .enabled(!disabled && !loading)
    .activeOffsetX([-6, 6])
    .failOffsetY([-14, 14])
    .onBegin(() => { dragStart.value = progress.value; })
    .onUpdate((e) => {
      if (travel <= 0) return;
      progress.value = Math.max(0, Math.min(1, dragStart.value + e.translationX / travel));
    })
    .onEnd(() => {
      const wantOpen = progress.value > 0.5;
      progress.value = withTiming(wantOpen ? 1 : 0, { duration: 200 });
      runOnJS(commit)(wantOpen);
    });

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.95)']),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: TRACK_PAD + progress.value * travel }],
  }));
  const offLabelStyle = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0, 0.4], [1, 0]) }));
  const onLabelStyle = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0.6, 1], [0, 1]) }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.toggleOuter} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
        <Animated.View style={[styles.toggleTrack, trackStyle]}>
          <Animated.Text style={[styles.toggleLabel, styles.toggleLabelOff, offLabelStyle]}>CLOSED</Animated.Text>
          <Animated.Text style={[styles.toggleLabel, styles.toggleLabelOn, { color: colors.primary }, onLabelStyle]}>YOU'RE LIVE</Animated.Text>

          <Animated.View style={[styles.toggleThumb, thumbStyle]}>
            <View style={styles.toggleKnobFace}>
              {loading ? (
                <ActivityIndicator size="small" color={isOpen ? colors.primary : colors.danger} />
              ) : (
                <Ionicons name="power" size={24} color={isOpen ? colors.primary : colors.danger} />
              )}
            </View>
          </Animated.View>
        </Animated.View>

        {/* Halo rings live OUTSIDE the track (which clips to its pill shape
            via overflow:hidden for the background color) — same transform as
            the thumb so they still track its position, but free to expand
            past the track's rounded edge instead of getting cut off. */}
        {isOpen && !loading && (
          <Animated.View style={[styles.toggleHaloLayer, thumbStyle]} pointerEvents="none">
            {[0, 1].map((i) => (
              <MotiView
                key={i}
                from={{ scale: 1, opacity: 0.5 }}
                animate={{ scale: 2.1, opacity: 0 }}
                transition={{ type: 'timing', duration: 1600, loop: true, repeatReverse: false, delay: i * 500 }}
                style={styles.toggleHalo}
              />
            ))}
          </Animated.View>
        )}
      </View>
    </GestureDetector>
  );
}

// Live feed strip — cycles through pending order summaries every few
// seconds, like a ticker. Only rendered when there's something to show.
function OrderTicker({ items, colors }: { items: string[]; colors: any }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 3200);
    return () => clearInterval(t);
  }, [items.length]);

  return (
    <View style={[styles.tickerRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <MotiView
        from={{ scale: 1, opacity: 0.5 }}
        animate={{ scale: 1.8, opacity: 0 }}
        transition={{ type: 'timing', duration: 1200, loop: true, repeatReverse: false }}
        style={[styles.tickerHalo, { backgroundColor: colors.warning }]}
      />
      <View style={[styles.tickerDot, { backgroundColor: colors.warning }]} />
      <AnimatePresence exitBeforeEnter>
        <MotiView key={idx} from={{ opacity: 0, translateY: 6 }} animate={{ opacity: 1, translateY: 0 }} exit={{ opacity: 0, translateY: -6 }} transition={{ type: 'timing', duration: 220 }} style={{ flex: 1 }}>
          <Text style={[styles.tickerText, { color: colors.text }]} numberOfLines={1}>{items[idx]}</Text>
        </MotiView>
      </AnimatePresence>
    </View>
  );
}

export default function OnlineShopDashboard({ navigation }: any) {
  const { colors } = useAppTheme();
  const { settings } = useAppStore();
  const { config, orders, isLoadingConfig, isSavingConfig, fetchShopConfig, fetchOrders, updateConfig } = useOnlineShopStore();
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  useOrderRealtime(config.shopId);

  // `fetchShopConfig` is already called once, globally, by usePushSetup at
  // app launch — calling it again here on mount was a pure duplicate network
  // request. Combined with this navigator being `lazy: false` (so the
  // portion-switch pager can animate — see AppNavigator) and Orders/Inventory
  // doing the same thing, every online screen was racing to re-fetch the
  // instant Online mode was first entered, which is what made that first
  // switch feel slow — not the entrance animations themselves. `fetchOrders`
  // is legitimately screen-specific, so it stays, just gated on focus.
  const isFocused = useIsFocused();
  useEffect(() => { if (isFocused && config.shopId) fetchOrders(config.shopId); }, [isFocused, config.shopId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchShopConfig();
    const shopId = useOnlineShopStore.getState().config.shopId;
    if (shopId) await fetchOrders(shopId);
    setRefreshing(false);
  }, [fetchShopConfig, fetchOrders]);

  const isOpen = isShopOpenNow(config);
  const storeUrl = `https://${STORE_HOST}/${config.shopSlug}`;

  const setShopOpen = useCallback(async (wantOpen: boolean) => {
    const previous = config.manualOverride;
    updateConfig({ manualOverride: wantOpen ? 'open' : 'closed' });
    try {
      await useOnlineShopStore.getState().saveConfigToSupabase();
      toast.success(wantOpen ? 'Shop is now open for orders' : 'Shop is now closed');
    } catch (e: any) {
      updateConfig({ manualOverride: previous });
      toast.error('Could not update shop status', { description: e?.message ?? 'Check your connection and try again.' });
    }
  }, [config.manualOverride]);

  const copyLink = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(storeUrl);
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard needs a rebuild */ }
  }, [storeUrl]);

  const shareLink = useCallback(() => {
    Share.share({ message: `Order from ${config.shopName || settings.shopName} online: ${storeUrl}` }).catch(() => {});
  }, [storeUrl, config.shopName, settings.shopName]);

  const insets = useSafeAreaInsets();

  if (isLoadingConfig) {
    return <OnlineShopDashboardSkeleton />;
  }

  const isSetup = Boolean(config.shopId);

  if (!isSetup) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        <LinearGradient colors={[colors.primary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.launchRoot}>
          <MotiView from={{ opacity: 0, translateY: -10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 450 }} style={{ alignItems: 'center' }}>
            <View style={styles.launchBadgeWrap}>
              <MotiView
                from={{ scale: 1, opacity: 0.4 }}
                animate={{ scale: 1.6, opacity: 0 }}
                transition={{ type: 'timing', duration: 2200, loop: true, repeatReverse: false }}
                style={styles.launchBadgeHalo}
              />
              <View style={styles.launchBadge}>
                <Ionicons name="power" size={36} color={colors.primary} />
              </View>
            </View>
            <Text style={styles.launchTitle}>Go Live Online</Text>
            <Text style={styles.launchSub}>One switch away from a real storefront — customers order straight from their phone, no WhatsApp back-and-forth.</Text>
          </MotiView>

          <MotiView from={{ opacity: 0, translateY: 14 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 450, delay: 150 }} style={styles.launchFeatures}>
            {[
              { icon: 'flash-outline' as const, text: 'Live in about 2 minutes' },
              { icon: 'card-outline' as const, text: 'Zero commission — every rupee is yours' },
              { icon: 'notifications-outline' as const, text: 'Instant order alerts, right here' },
            ].map((f) => (
              <View key={f.text} style={styles.launchFeatureRow}>
                <View style={styles.launchFeatureIcon}><Ionicons name={f.icon} size={16} color="#fff" /></View>
                <Text style={styles.launchFeatureText}>{f.text}</Text>
              </View>
            ))}
          </MotiView>

          <MotiView from={{ opacity: 0, translateY: 14 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 450, delay: 260 }} style={{ width: '100%' }}>
            <PressableScale style={styles.launchBtn} onPress={() => navigation.navigate('ShopInfo')}>
              <Text style={[styles.launchBtnText, { color: colors.primary }]}>Set Up Online Shop</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.primary} />
            </PressableScale>
          </MotiView>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  const pendingOrders = orders.filter((o) => o.status === 'pending');
  const todayOrders = orders.filter((o) => new Date(o.createdAt).toDateString() === new Date().toDateString());
  const todayRevenue = todayOrders
    .filter((o) => o.status === 'completed' || o.status === 'accepted' || o.status === 'ready')
    .reduce((sum, o) => sum + o.total, 0);

  const dayMs = 86400000;
  const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const week = Array.from({ length: 7 }).map((_, idx) => {
    const ds = startOfDay() - (6 - idx) * dayMs;
    const count = orders.filter((o) => { const t = new Date(o.createdAt).getTime(); return t >= ds && t < ds + dayMs; }).length;
    return { count, label: new Date(ds).toLocaleDateString('en-IN', { weekday: 'narrow' }), isToday: idx === 6 };
  });
  const weekMax = Math.max(...week.map((d) => d.count), 1);
  const weekTotal = week.reduce((sum, d) => sum + d.count, 0);

  const tickerItems = pendingOrders.slice(0, 6).map((o) => `${o.customerName} · ${formatCurrency(o.total, settings.currency)} · ${o.items.length} item${o.items.length > 1 ? 's' : ''}`);

  const ACTIONS: { label: string; sub: string; icon: IoniconsName; screen: string; badge?: number }[] = [
    { label: 'Orders', sub: 'Accept, prepare, fulfil', icon: 'bag-handle-outline', screen: 'OnlineOrders', badge: pendingOrders.length },
    { label: 'Products', sub: 'What customers can buy', icon: 'cube-outline', screen: 'OnlineInventory' },
    { label: 'Settings', sub: 'Hours, delivery, pickup', icon: 'settings-outline', screen: 'ShopInfo' },
  ];

  return (
    <SafeAreaView style={{ flex: 1 }} edges={[]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInset={Platform.OS === 'ios' ? { top: insets.top + 8 } : undefined}
        contentOffset={Platform.OS === 'ios' ? { y: -(insets.top + 8), x: 0 } : undefined}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* HERO — identity + the power switch, same treatment as Home's hero */}
        <LinearGradient colors={[colors.primary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 16, marginTop: Platform.OS === 'ios' ? -(insets.top + 8) : 0 }]}>
          <MotiView from={{ opacity: 0, translateY: -8 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 450 }}>
            <Text style={styles.heroShopName} numberOfLines={1}>{config.shopName || settings.shopName}</Text>
            <View style={styles.linkRow}>
              <Ionicons name="link-outline" size={13} color="rgba(255,255,255,0.7)" />
              <Text style={styles.linkText} numberOfLines={1}>{STORE_HOST}/{config.shopSlug}</Text>
              <TouchableOpacity onPress={copyLink} hitSlop={6} style={styles.linkBtn}>
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={shareLink} hitSlop={6} style={styles.linkBtn}>
                <Ionicons name="share-social-outline" size={16} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.toggleWrap}>
              <PowerToggle isOpen={isOpen} disabled={isSavingConfig} loading={isSavingConfig} onChange={setShopOpen} colors={colors} />
              <Text style={styles.toggleHint}>{isSavingConfig ? 'Saving…' : isOpen ? 'Swipe to close' : 'Swipe to go live'}</Text>
            </View>
          </MotiView>
        </LinearGradient>

        {/* FLOATING BENTO METRICS — overlap the hero, identical to Home's */}
        <View style={s2.bentoRow}>
          {[
            { label: 'Revenue Today', value: todayRevenue, format: (n: number) => formatCurrency(n, settings.currency), icon: 'trending-up-outline' as const, accent: colors.success },
            { label: 'Orders Today', value: todayOrders.length, format: (n: number) => String(Math.round(n)), icon: 'receipt-outline' as const, accent: colors.info },
            { label: 'Pending', value: pendingOrders.length, format: (n: number) => String(Math.round(n)), icon: 'time-outline' as const, accent: pendingOrders.length > 0 ? colors.warning : colors.textMuted },
          ].map((m, i) => (
            <MotiView key={m.label} style={{ flex: 1 }} from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 280, delay: i * 40 }}>
              <View style={[s2.bentoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={s2.bentoTopBar}>
                  <View style={[s2.bentoIcon, { backgroundColor: m.accent + '1A' }]}>
                    <Ionicons name={m.icon} size={16} color={m.accent} />
                  </View>
                  <View style={[s2.bentoDot, { backgroundColor: m.accent }]} />
                </View>
                <AnimatedNumber value={m.value} format={m.format} style={[s2.bentoVal, { color: m.accent }]} />
                <Text style={[s2.bentoLbl, { color: colors.textMuted }]} numberOfLines={1}>{m.label}</Text>
              </View>
            </MotiView>
          ))}
        </View>

        {/* Live order ticker */}
        {tickerItems.length > 0 && (
          <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 280, delay: 80 }}>
            <TouchableOpacity onPress={() => navigation.navigate('OnlineOrders', { screen: 'OnlineOrdersMain', params: { filterStatus: 'pending' } })} activeOpacity={0.8}>
              <OrderTicker items={tickerItems} colors={colors} />
            </TouchableOpacity>
          </MotiView>
        )}

        {/* 7-day trend — same sparkline card as Home's */}
        {weekTotal > 0 && (
          <MotiView from={{ opacity: 0, translateY: 14 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300, delay: 140 }}>
            <View style={[s2.weekCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[s2.weekTitle, { color: colors.text }]}>Orders — last 7 days</Text>
              <View style={s2.weekBars}>
                {week.map((d, i) => (
                  <View key={i} style={s2.weekCol}>
                    <View style={s2.weekBarTrack}>
                      <MotiView
                        from={{ height: 0 }}
                        animate={{ height: Math.max(4, (d.count / weekMax) * 64) }}
                        transition={{ type: 'timing', duration: 380, delay: 160 + i * 35 }}
                        style={s2.weekBar}
                      >
                        <LinearGradient
                          colors={d.isToday ? [colors.primary, colors.primaryDark] : [colors.primaryLight, colors.primary + '40']}
                          style={StyleSheet.absoluteFill}
                        />
                      </MotiView>
                    </View>
                    <Text style={[s2.weekDay, { color: d.isToday ? colors.primary : colors.textMuted, fontFamily: d.isToday ? fonts.bold : fonts.medium }]}>{d.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </MotiView>
        )}

        {/* Manage — same section-card list style as Home's */}
        <Text style={[s2.sectionTitle, { color: colors.text }]}>Manage</Text>
        <View style={[s2.manageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {ACTIONS.map((action, i) => (
            <TouchableOpacity
              key={action.label}
              style={[s2.manageRow, i < ACTIONS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
              onPress={() => navigation.navigate(action.screen)}
              activeOpacity={0.7}
            >
              <View style={[s2.manageIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name={action.icon} size={19} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s2.manageLabel, { color: colors.text }]}>{action.label}</Text>
                <Text style={[s2.manageSub, { color: colors.textMuted }]}>{action.sub}</Text>
              </View>
              {action.badge != null && action.badge > 0 && (
                <View style={[s2.manageBadge, { backgroundColor: colors.warning }]}>
                  <Text style={s2.manageBadgeText}>{action.badge}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Static styles (no theme dependency) — the gradient hero + toggle, which use
// white-alpha overlays that read correctly against colors.primary regardless
// of light/dark mode, same convention Home's hero chips already rely on.
const styles = StyleSheet.create({
  launchRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  launchBadgeWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  launchBadgeHalo: { position: 'absolute', width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: '#fff' },
  launchBadge: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  launchTitle: { fontFamily: fonts.extraBold, fontSize: 26, color: '#fff', textAlign: 'center' },
  launchSub: { fontFamily: fonts.medium, fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: 10, lineHeight: 21, paddingHorizontal: 6 },
  launchFeatures: { width: '100%', marginTop: 28, gap: 14 },
  launchFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  launchFeatureIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  launchFeatureText: { fontFamily: fonts.semiBold, fontSize: 14, color: '#fff', flex: 1 },
  launchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 16, marginTop: 30 },
  launchBtnText: { fontFamily: fonts.extraBold, fontSize: 16 },

  hero: { paddingHorizontal: 20, paddingBottom: 30, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroShopName: { fontFamily: fonts.extraBold, fontSize: 22, color: '#fff', letterSpacing: -0.4 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  linkText: { flex: 1, fontFamily: fonts.medium, fontSize: 12.5, color: 'rgba(255,255,255,0.85)' },
  linkBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },

  toggleWrap: { marginTop: 22 },
  // Un-clipped wrapper — the track below clips to its pill shape via
  // overflow:hidden, but the halo layer is a sibling of it here so its
  // expanding rings aren't cut off by that clip.
  toggleOuter: { width: '100%', height: 68 },
  toggleTrack: { width: '100%', height: 68, borderRadius: 34, justifyContent: 'center', overflow: 'hidden' },
  toggleLabel: { position: 'absolute', fontFamily: fonts.extraBold, fontSize: 12.5, letterSpacing: 1.2 },
  toggleLabelOff: { right: 22, color: 'rgba(255,255,255,0.8)' },
  toggleLabelOn: { left: 22 },
  toggleThumb: {
    position: 'absolute', top: TRACK_PAD, width: THUMB, height: THUMB, borderRadius: THUMB / 2,
    alignItems: 'center', justifyContent: 'center',
  },
  toggleHaloLayer: {
    position: 'absolute', top: TRACK_PAD, width: THUMB, height: THUMB,
    alignItems: 'center', justifyContent: 'center',
  },
  toggleHalo: { position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, borderWidth: 2, borderColor: '#fff' },
  toggleKnobFace: {
    width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  toggleHint: { fontFamily: fonts.medium, fontSize: 11.5, color: 'rgba(255,255,255,0.7)', marginTop: 10, textAlign: 'center' },

  tickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 11, paddingHorizontal: 14, overflow: 'hidden' },
  tickerDot: { width: 7, height: 7, borderRadius: 3.5 },
  tickerHalo: { position: 'absolute', left: 14, width: 7, height: 7, borderRadius: 3.5 },
  tickerText: { fontFamily: fonts.semiBold, fontSize: 12.5 },
});

// Same bento/week/section styling as DashboardScreen (Home) — literal reuse
// of those values so the "three boxes" (and everything else here) match the
// local landing page's spacing and card design, not a bespoke one.
const s2 = StyleSheet.create({
  bentoRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: -22 },
  bentoCard: { borderRadius: 18, padding: 13, borderWidth: StyleSheet.hairlineWidth, gap: 9, elevation: 3, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  bentoTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bentoIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  bentoDot: { width: 6, height: 6, borderRadius: 3, opacity: 0.55 },
  bentoVal: { fontFamily: fonts.extraBold, fontSize: 16 },
  bentoLbl: { fontFamily: fonts.medium, fontSize: 11 },

  weekCard: { marginHorizontal: 16, marginTop: 14, borderRadius: 18, padding: 16, borderWidth: StyleSheet.hairlineWidth },
  weekTitle: { fontFamily: fonts.extraBold, fontSize: 15, marginBottom: 16 },
  weekBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  weekCol: { flex: 1, alignItems: 'center', gap: 8 },
  weekBarTrack: { height: 64, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  weekBar: { width: '70%', borderRadius: 6, minHeight: 4, overflow: 'hidden' },
  weekDay: { fontSize: 11 },

  sectionTitle: { fontFamily: fonts.extraBold, fontSize: 17, paddingHorizontal: 16, marginTop: 14, marginBottom: 14, letterSpacing: -0.3 },
  manageCard: { marginHorizontal: 16, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  manageRow: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14 },
  manageIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  manageLabel: { fontFamily: fonts.bold, fontSize: 15 },
  manageSub: { fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  manageBadge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  manageBadgeText: { fontFamily: fonts.extraBold, fontSize: 11, color: '#fff' },
});
