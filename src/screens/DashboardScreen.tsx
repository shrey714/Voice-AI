import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Linking, Alert, RefreshControl, Dimensions, Platform } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedProps, withRepeat, withTiming, Easing, SharedValue } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useAppStore } from '../stores/useAppStore';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Animated circular progress ring (fills to `progress` 0..1 on mount).
function GoalRing({ progress, size = 96, stroke = 10, color, track }: { progress: number; size?: number; stroke?: number; color: string; track: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = useSharedValue(circ);
  useEffect(() => {
    off.value = withTiming(circ * (1 - Math.min(Math.max(progress, 0), 1)), { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [progress, circ]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: off.value }));
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
      <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={circ} animatedProps={animatedProps} rotation={-90} origin={`${size / 2}, ${size / 2}`} />
    </Svg>
  );
}

// Auto-rotating, swipeable carousel of insight cards with a dots indicator.
function InsightSlider({ insights, colors }: { insights: { icon: any; text: string }[]; colors: any }) {
  const { width } = Dimensions.get('window');
  // Page = full ScrollView width so pagingEnabled snaps correctly; the 16px side
  // padding lives inside each page so the card lines up with the other cards.
  const pageW = width;
  const ref = useRef<ScrollView>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (insights.length < 2) return;
    const t = setInterval(() => {
      setIdx((prev) => {
        const next = (prev + 1) % insights.length;
        ref.current?.scrollTo({ x: next * pageW, animated: true });
        return next;
      });
    }, 4500);
    return () => clearInterval(t);
  }, [insights.length, pageW]);

  return (
    <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400, delay: 280 }} style={{ marginTop: 14 }}>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / pageW))}
      >
        {insights.map((ins, i) => (
          <View key={i} style={{ width: pageW, paddingHorizontal: 16 }}>
            <View style={[isl.card, { backgroundColor: colors.primaryLight }]}>
              <View style={[isl.icon, { backgroundColor: colors.surface }]}>
                <Ionicons name={ins.icon} size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[isl.lbl, { color: colors.primary }]}>INSIGHT</Text>
                <Text style={[isl.text, { color: colors.text }]}>{ins.text}</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
      {insights.length > 1 && (
        <View style={isl.dots}>
          {insights.map((_, i) => (
            <View key={i} style={[isl.dot, { width: i === idx ? 16 : 6, backgroundColor: i === idx ? colors.primary : colors.border }]} />
          ))}
        </View>
      )}
    </MotiView>
  );
}

const isl = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 16, minHeight: 74 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  lbl: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.2 },
  text: { fontFamily: fonts.semiBold, fontSize: 13, lineHeight: 18, marginTop: 2 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 8 },
  dot: { height: 6, borderRadius: 3 },
});
import { formatCurrency, startOfDay, endOfDay } from '../utils/helpers';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import AnimatedNumber from '../components/common/AnimatedNumber';
import PressableScale from '../components/common/PressableScale';
import { DashboardSkeleton } from '../components/common/Skeleton';
import BusiestHours from '../components/common/BusiestHours';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { computeSalesStats, makeCostOf } from '../utils/stats';
import { toast } from '../utils/toast';
import * as db from '../db/database';

// A single letter whose brightness peaks as the shimmer sweep passes its position.
function ShimmerLetter({ char, t, progress, base, peakAdd, color, textStyle }: {
  char: string; t: number; progress: SharedValue<number>;
  base: number; peakAdd: number; color: string; textStyle: any;
}) {
  const style = useAnimatedStyle(() => {
    const d = progress.value - t;
    const peak = Math.exp(-(d * d) * 55); // tight gaussian → a focused band of light
    return { opacity: base + peak * peakAdd };
  });
  return <Animated.Text style={[textStyle, { color }, style]}>{char}</Animated.Text>;
}

// Big faded wordmark with a light that glides left→right through the letters.
function ShimmerBrand({ colors }: { colors: any }) {
  const brand = 'shopkeeper.ai';
  const chars = brand.split('');
  const n = chars.length;
  const { width } = Dimensions.get('window');
  const size = Math.min(60, Math.round((width - 36) / 7.2));
  const textStyle = { fontFamily: fonts.extraBold, fontSize: size, lineHeight: size * 1.04, includeFontPadding: false };

  const progress = useSharedValue(-0.3);
  useEffect(() => {
    // Sweep from before the first letter to past the last, then loop seamlessly
    // (everything is back at base brightness at the wrap point, so no flicker).
    progress.value = withRepeat(withTiming(1.3, { duration: 3000, easing: Easing.inOut(Easing.ease) }), -1, false);
  }, []);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      {chars.map((c, i) => {
        const isDot = c === '.';
        return (
          <ShimmerLetter
            key={i}
            char={c}
            t={i / (n - 1)}
            progress={progress}
            base={isDot ? 0.85 : 0.07}
            peakAdd={isDot ? 0.15 : 0.6}
            color={isDot ? colors.primary : colors.text}
            textStyle={textStyle}
          />
        );
      })}
    </View>
  );
}

export default function DashboardScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const { products, bills, expenses, returns, loadProducts, loadBills, loadExpenses, settings } = useAppStore();
  const dataReady = useAppStore(state => state.dataReady);
  const [refreshing, setRefreshing] = useState(false);

  // All sales numbers are netted of returns via the shared stats helper. Memoized
  // so the 9 computeSalesStats passes (today + yesterday + 7 days) don't re-run on
  // every unrelated re-render — only when bills/returns/products change.
  const { todayStats, yesterdayRevenue, week } = useMemo(() => {
    const costOf = makeCostOf(products);
    const dayMs = 86400000;
    const today = computeSalesStats({ bills, returns, from: startOfDay(), to: endOfDay(), costOf });
    const yRev = computeSalesStats({ bills, returns, from: startOfDay() - dayMs, to: startOfDay() - 1, costOf }).revenue;
    const wk = Array.from({ length: 7 }).map((_, idx) => {
      const ds = startOfDay() - (6 - idx) * dayMs;
      const rev = computeSalesStats({ bills, returns, from: ds, to: ds + dayMs - 1, costOf }).revenue;
      return {
        rev,
        label: new Date(ds).toLocaleDateString('en-IN', { weekday: 'narrow' }),
        full: new Date(ds).toLocaleDateString('en-IN', { weekday: 'long' }),
        isToday: idx === 6,
      };
    });
    return { todayStats: today, yesterdayRevenue: yRev, week: wk };
  }, [bills, returns, products]);

  const todayBills = bills.filter(b => b.createdAt >= startOfDay() && b.createdAt <= endOfDay());
  const todayRevenue = todayStats.revenue;
  const todayProfit = todayStats.profit;
  const todayExpenses = expenses.filter(e => e.createdAt >= startOfDay() && e.createdAt <= endOfDay()).reduce((s, e) => s + e.amount, 0);
  const lowStockItems = products.filter(p => p.quantity <= p.lowStockThreshold);
  const now = Date.now();
  const expiringItems = products
    .filter(p => p.expiryDate && p.expiryDate > 0)
    .map(p => ({ ...p, daysLeft: Math.ceil((p.expiryDate! - now) / 86400000) }))
    .filter(p => p.daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const expiredCount = expiringItems.filter(p => p.daysLeft <= 0).length;
  const expiringSoonCount = expiringItems.length - expiredCount;

  // Net top-sellers & units sold (returned quantities removed).
  const topSelling: [string, number][] = todayStats.topItems.slice(0, 5).map(it => [it.name, it.qty]);
  const itemsSold = todayStats.itemsSold;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (settings.ownerName || '').trim().split(' ')[0];
  const netProfit = todayProfit - todayExpenses;

  // vs yesterday
  const deltaPct = yesterdayRevenue > 0 ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 : null;

  const weekMax = Math.max(...week.map(d => d.rev), 1);
  const weekTotal = week.reduce((s, d) => s + d.rev, 0);

  // Daily goal
  const dailyGoal = settings.dailyGoal || 0;
  const goalProgress = dailyGoal > 0 ? todayRevenue / dailyGoal : 0;
  const goalReached = dailyGoal > 0 && todayRevenue >= dailyGoal;

  // Goal-reached toast: fire once the day's revenue crosses the goal, at most once
  // per day (persisted by date so reopening the app won't re-show it).
  const celebratedRef = useRef(false);
  useEffect(() => {
    if (!goalReached || celebratedRef.current) return;
    let cancelled = false;
    (async () => {
      const todayKey = String(startOfDay());
      const last = await db.getSetting('goalCelebratedDate');
      if (cancelled) return;
      celebratedRef.current = true;
      if (last === todayKey) return; // already shown today
      await db.setSetting('goalCelebratedDate', todayKey);
      toast.success("🎯 Goal reached!", { description: `You crossed today's goal of ${formatCurrency(dailyGoal, settings.currency)} — great work!` });
    })();
    return () => { cancelled = true; };
  }, [goalReached, dailyGoal]);

  // Smart insights — all applicable (shown in a rotating slider)
  const margin = todayRevenue > 0 ? (todayProfit / todayRevenue) * 100 : 0;
  const bestDay = week.reduce((a, b) => (b.rev > a.rev ? b : a), week[0]);
  const insights: { icon: any; text: string }[] = [];
  if (goalReached) insights.push({ icon: 'trophy-outline', text: `You hit today's goal of ${formatCurrency(dailyGoal, settings.currency)} — great work!` });
  if (topSelling.length > 0) insights.push({ icon: 'flame-outline', text: `${topSelling[0][0]} is your top seller today (${topSelling[0][1]} sold).` });
  if (deltaPct !== null) insights.push({ icon: deltaPct >= 0 ? 'trending-up-outline' : 'trending-down-outline', text: deltaPct >= 0 ? `You're up ${Math.abs(deltaPct).toFixed(0)}% vs yesterday — keep it going!` : `You're down ${Math.abs(deltaPct).toFixed(0)}% vs yesterday.` });
  if (todayRevenue > 0) insights.push({ icon: 'analytics-outline', text: `Today's profit margin is ${margin.toFixed(0)}%.` });
  if (weekTotal > 0 && bestDay.rev > 0 && !bestDay.isToday) insights.push({ icon: 'calendar-outline', text: `Your best day this week was ${bestDay.full}. Try to beat it!` });
  if (lowStockItems.length > 0) insights.push({ icon: 'cube-outline', text: `${lowStockItems.length} item${lowStockItems.length > 1 ? 's are' : ' is'} running low on stock.` });

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      setTimeout(async() => {
        await Promise.all([loadProducts(), loadBills(), loadExpenses()]);
      }, 1000);
    } catch (e) {
      // ignore — still stop the spinner below
    } finally {
      setRefreshing(false);
    }
  };

  const sendSummary = () => {
    const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
    const msg = [`📊 *${settings.shopName} — Daily Summary*`, `📅 ${date}`, `━━━━━━━━━━━━━`,
      `💰 Revenue: *${formatCurrency(todayRevenue, settings.currency)}*`,
      `📈 Profit: *${formatCurrency(todayProfit, settings.currency)}*`,
      `💸 Expenses: ${formatCurrency(todayExpenses, settings.currency)}`,
      `✅ Net: *${formatCurrency(todayProfit - todayExpenses, settings.currency)}*`,
      `🧾 Bills: ${todayBills.length}`,
    ].join('\n');
    const phone = settings.phone?.replace(/[^0-9]/g, '');
    Linking.openURL(phone ? `whatsapp://send?phone=91${phone}&text=${encodeURIComponent(msg)}` : `whatsapp://send?text=${encodeURIComponent(msg)}`).catch(() => Alert.alert('WhatsApp not found'));
  };

  const s = makeStyles(colors);

  const insets = useSafeAreaInsets();

  if (!dataReady) return <DashboardSkeleton />;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={[]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollIndicatorInsets={{ top: 0, bottom: 0, left: 0, right: 0 }}
        contentInset={Platform.OS === 'ios' ? { top: insets.top + 8 } : undefined}
        contentOffset={Platform.OS === 'ios' ? { y: -(insets.top + 8), x: 0 } : undefined}
        scrollEnabled={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        {/* HERO — greeting + headline earnings */}
        <LinearGradient colors={[colors.primary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.hero, { paddingTop: insets.top + 16, marginTop: Platform.OS === 'ios' ? -(insets.top + 8) : 0 }]}>
          <MotiView from={{ opacity: 0, translateY: -8 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 450 }}>
            <View style={s.heroTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.greeting}>{greeting}{firstName ? `, ${firstName}` : ''}</Text>
                <Text style={s.shopName} numberOfLines={1}>{settings.shopName}</Text>
              </View>
              <TouchableOpacity style={s.waPill} onPress={sendSummary} activeOpacity={0.85}>
                <Ionicons name="logo-whatsapp" size={15} color="#fff" />
                <Text style={s.waPillText}>Summary</Text>
              </TouchableOpacity>
            </View>

            <View style={s.earnBlock}>
              <Text style={s.earnLbl}>TODAY'S EARNINGS</Text>
              <AnimatedNumber value={todayRevenue} format={(n) => formatCurrency(n, settings.currency)} style={s.earnVal} />
              {deltaPct !== null && (
                <View style={s.deltaRow}>
                  <Ionicons name={deltaPct >= 0 ? 'arrow-up' : 'arrow-down'} size={12} color={deltaPct >= 0 ? '#A5E8B5' : '#F2B8AE'} />
                  <Text style={[s.deltaPct, { color: deltaPct >= 0 ? '#A5E8B5' : '#F2B8AE' }]}>{Math.abs(deltaPct).toFixed(0)}%</Text>
                  <Text style={s.deltaMuted}>vs yesterday</Text>
                </View>
              )}
              <View style={s.heroChips}>
                <View style={[s.chip, { backgroundColor: 'rgba(165,232,181,0.18)' }]}>
                  <Ionicons name="trending-up" size={13} color="#A5E8B5" />
                  <Text style={s.chipText}>{formatCurrency(todayProfit, settings.currency)} profit</Text>
                </View>
                <View style={[s.chip, { backgroundColor: 'rgba(244,213,138,0.18)' }]}>
                  <Ionicons name="receipt-outline" size={13} color="#F4D58A" />
                  <Text style={s.chipText}>{todayBills.length} bills</Text>
                </View>
              </View>
            </View>
          </MotiView>
        </LinearGradient>

        {/* FLOATING BENTO METRICS — overlap the hero for depth */}
        <View style={s.bentoRow}>
          {[
            { label: 'Net Profit', value: formatCurrency(netProfit, settings.currency), icon: 'wallet-outline' as const, accent: netProfit >= 0 ? colors.success : colors.danger },
            { label: 'Expenses', value: formatCurrency(todayExpenses, settings.currency), icon: 'arrow-down-circle-outline' as const, accent: colors.warning },
            { label: 'Items Sold', value: String(itemsSold), icon: 'cube-outline' as const, accent: colors.info },
          ].map((m, i) => (
            <MotiView key={m.label} style={{ flex: 1 }} from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 380, delay: 120 + i * 70 }}>
              <View style={[s.bentoCard, { backgroundColor: colors.surface }]}>
                <View style={s.bentoTopBar}>
                  <View style={[s.bentoIcon, { backgroundColor: m.accent + '1A' }]}>
                    <Ionicons name={m.icon} size={16} color={m.accent} />
                  </View>
                  <View style={[s.bentoDot, { backgroundColor: m.accent }]} />
                </View>
                <Text style={[s.bentoVal, { color: m.accent }]} numberOfLines={1} adjustsFontSizeToFit>{m.value}</Text>
                <Text style={[s.bentoLbl, { color: colors.textMuted }]}>{m.label}</Text>
              </View>
            </MotiView>
          ))}
        </View>

        {/* Ask AI bar */}
        <MotiView from={{ opacity: 0, translateY: 14 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 380, delay: 200 }}>
          <PressableScale style={[s.askBar, { backgroundColor: colors.surface, borderColor: colors.primary + '40' }]} onPress={() => navigation.navigate('AskAi')}>
            <View style={[s.askIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="sparkles" size={17} color={colors.primary} />
            </View>
            <Text style={[s.askText, { color: colors.textMuted }]} numberOfLines={1}>Ask anything about your shop…</Text>
            <Ionicons name="arrow-forward-circle" size={24} color={colors.primary} />
          </PressableScale>
        </MotiView>

        {/* Daily goal ring */}
        {dailyGoal > 0 ? (
          <MotiView from={{ opacity: 0, translateY: 14 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400, delay: 220 }}>
            <PressableScale style={[s.goalCard, { backgroundColor: colors.surface }]} onPress={() => navigation.navigate('Billing')}>
              <View style={s.goalRingWrap}>
                <GoalRing progress={goalProgress} color={goalReached ? colors.success : colors.primary} track={colors.primaryLight} />
                <View style={s.goalRingCenter}>
                  <Text style={[s.goalPct, { color: goalReached ? colors.success : colors.primary }]}>{Math.round(goalProgress * 100)}%</Text>
                </View>
              </View>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={goalReached ? 'trophy' : 'flag'} size={14} color={goalReached ? colors.success : colors.primary} />
                  <Text style={[s.goalLbl, { color: colors.textMuted }]}>{goalReached ? 'GOAL REACHED' : 'DAILY GOAL'}</Text>
                </View>
                <Text style={[s.goalAmount, { color: colors.text }]}>
                  {formatCurrency(todayRevenue, settings.currency)}<Text style={{ color: colors.textMuted }}> of {formatCurrency(dailyGoal, settings.currency)}</Text>
                </Text>
                <Text style={[s.goalRemain, { color: goalReached ? colors.success : colors.textSub }]}>
                  {goalReached ? 'You smashed today’s target!' : `${formatCurrency(dailyGoal - todayRevenue, settings.currency)} to go`}
                </Text>
              </View>
            </PressableScale>
          </MotiView>
        ) : (
          <MotiView from={{ opacity: 0, translateY: 14 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400, delay: 220 }}>
            <PressableScale style={[s.goalPrompt, { backgroundColor: colors.surface }]} onPress={() => navigation.navigate('More', { screen: 'ManageOptions' })}>
              <View style={[s.bentoIcon, { backgroundColor: colors.primaryLight, width: 36, height: 36, borderRadius: 11 }]}>
                <Ionicons name="flag-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.goalAmount, { color: colors.text }]}>Set a daily goal</Text>
                <Text style={[s.goalRemain, { color: colors.textMuted }]}>Track your progress with a goal ring</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </PressableScale>
          </MotiView>
        )}

        {/* Smart insights — rotating slider */}
        {insights.length > 0 && <InsightSlider insights={insights} colors={colors} />}

        {/* 7-day revenue sparkline — tap to open Analytics */}
        {weekTotal > 0 && (
          <MotiView from={{ opacity: 0, translateY: 14 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400, delay: 240 }}>
            <View style={[s.weekCard, { backgroundColor: colors.surface }]}>
              <View style={s.weekHead}>
                <View>
                  <Text style={[s.weekTitle, { color: colors.text }]}>Last 7 days</Text>
                  <Text style={[s.weekSub, { color: colors.textMuted }]}>Revenue trend</Text>
                </View>
              </View>
              <View style={s.weekBars}>
                {week.map((d, i) => (
                  <View key={i} style={s.weekCol}>
                    <View style={s.weekBarTrack}>
                      <MotiView
                        from={{ height: 0 }}
                        animate={{ height: Math.max(4, (d.rev / weekMax) * 64) }}
                        transition={{ type: 'timing', duration: 500, delay: 300 + i * 55 }}
                        style={s.weekBar}
                      >
                        <LinearGradient
                          colors={d.isToday ? [colors.primary, colors.primaryDark] : [colors.primaryLight, colors.primary + '40']}
                          style={StyleSheet.absoluteFill}
                        />
                      </MotiView>
                    </View>
                    <Text style={[s.weekDay, { color: d.isToday ? colors.primary : colors.textMuted, fontFamily: d.isToday ? fonts.bold : fonts.medium }]}>{d.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </MotiView>
        )}

        {/* Busiest hours heatmap */}
        <BusiestHours onPress={() => navigation.navigate('More', { screen: 'Analytics' })} />

        {/* Alerts */}
        {lowStockItems.length > 0 && (
          <MotiView from={{ opacity: 0, translateX: -10 }} animate={{ opacity: 1, translateX: 0 }} transition={{ type: 'timing', duration: 350, delay: 220 }}>
            <TouchableOpacity style={[s.alertCard, { backgroundColor: colors.warning + '14' }]} onPress={() => navigation.navigate('More', { screen: 'Reorder' })} activeOpacity={0.8}>
              <View style={[s.alertIcon, { backgroundColor: colors.warning + '24' }]}><Ionicons name="warning" size={18} color={colors.warning} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[s.alertTitle, { color: colors.warning }]}>{lowStockItems.length} items low on stock</Text>
                <Text style={[s.alertSub, { color: colors.textSub }]} numberOfLines={1}>Tap to reorder · {lowStockItems.slice(0, 3).map(p => p.name).join(', ')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.warning} />
            </TouchableOpacity>
          </MotiView>
        )}
        {expiringItems.length > 0 && (
          <MotiView from={{ opacity: 0, translateX: -10 }} animate={{ opacity: 1, translateX: 0 }} transition={{ type: 'timing', duration: 350, delay: 280 }}>
            <TouchableOpacity style={[s.alertCard, { backgroundColor: colors.danger + '14' }]} onPress={() => navigation.navigate('Inventory')} activeOpacity={0.8}>
              <View style={[s.alertIcon, { backgroundColor: colors.danger + '24' }]}><Ionicons name="calendar-outline" size={18} color={colors.danger} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[s.alertTitle, { color: colors.danger }]}>
                  {expiredCount > 0 && expiringSoonCount > 0
                    ? `${expiredCount} expired · ${expiringSoonCount} expiring soon`
                    : expiredCount > 0
                      ? `${expiredCount} item${expiredCount > 1 ? 's' : ''} expired`
                      : `${expiringSoonCount} item${expiringSoonCount > 1 ? 's' : ''} expiring within 30 days`}
                </Text>
                <Text style={[s.alertSub, { color: colors.textSub }]} numberOfLines={1}>{expiringItems.slice(0, 3).map(p => p.name).join(', ')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.danger} />
            </TouchableOpacity>
          </MotiView>
        )}

        {/* Quick Actions — horizontal scroll */}
        <Text style={[s.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}>
          {[
            { label: 'New Bill',    icon: 'cart-outline' as const,        onPress: () => navigation.navigate('Billing') },
            { label: 'Add Product', icon: 'add-circle-outline' as const,  onPress: () => navigation.navigate('Inventory') },
            { label: 'Analytics',   icon: 'bar-chart-outline' as const,   onPress: () => navigation.navigate('More', { screen: 'Analytics' }) },
            { label: 'Expenses',    icon: 'wallet-outline' as const,      onPress: () => navigation.navigate('More', { screen: 'Expenses' }) },
            { label: 'Udhaar',      icon: 'book-outline' as const,        onPress: () => navigation.navigate('More', { screen: 'Udhaar' }) },
            { label: 'Day Close',   icon: 'lock-closed-outline' as const, onPress: () => navigation.navigate('More', { screen: 'DayClose' }) },
            { label: 'Suppliers',   icon: 'business-outline' as const,    onPress: () => navigation.navigate('More', { screen: 'Supplier' }) },
          ].map((action, i) => (
            <MotiView key={action.label} from={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'timing', duration: 280, delay: 150 + i * 45 }}>
              <PressableScale style={s.qaItem} onPress={action.onPress}>
                <View style={[s.qaCircle, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name={action.icon} size={24} color={colors.primary} />
                </View>
                <Text style={[s.qaLabel, { color: colors.textSub }]}>{action.label}</Text>
              </PressableScale>
            </MotiView>
          ))}
        </ScrollView>

        {/* Top Selling */}
        {topSelling.length > 0 && (
          <View style={[s.section, { backgroundColor: colors.surface }]}>
            <Text style={[s.sectionInTitle, { color: colors.text }]}>Top Selling Today</Text>
            {topSelling.map(([name, qty], i) => (
              <MotiView key={name} from={{ opacity: 0, translateX: -10 }} animate={{ opacity: 1, translateX: 0 }}
                transition={{ type: 'timing', duration: 300, delay: i * 50 + 400 }}
                style={[s.topRow, { borderBottomColor: colors.border, borderBottomWidth: i === topSelling.length - 1 ? 0 : 0.5 }]}>
                <View style={[s.topRankBadge, { backgroundColor: i === 0 ? colors.primary : colors.primaryLight }]}>
                  <Text style={[s.topRank, { color: i === 0 ? '#fff' : colors.primary }]}>{i + 1}</Text>
                </View>
                <Text style={[s.topName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
                <View style={[s.topQtyBadge, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[s.topQty, { color: colors.primary }]}>{qty} sold</Text>
                </View>
              </MotiView>
            ))}
          </View>
        )}

        {/* Recent bills */}
        {todayBills.length > 0 && (
          <View style={[s.section, { backgroundColor: colors.surface }]}>
            <View style={s.sectionRow}>
              <Text style={[s.sectionInTitle, { color: colors.text, marginBottom: 0 }]}>Recent Bills</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Records')} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Text style={[s.seeAll, { color: colors.primary }]}>See all</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
            {todayBills.slice(0, 5).map((bill, i) => {
              const mc = bill.paymentMode === 'cash' ? colors.success : bill.paymentMode === 'upi' ? colors.info : colors.warning;
              return (
                <MotiView key={bill.id} from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 300, delay: i * 50 + 400 }}
                  style={[s.billRow, { borderBottomColor: colors.border, borderBottomWidth: i === Math.min(todayBills.length, 5) - 1 ? 0 : 0.5 }]}>
                  <View style={[s.billMode, { backgroundColor: mc + '15' }]}>
                    <Ionicons name={bill.paymentMode === 'cash' ? 'cash-outline' : bill.paymentMode === 'upi' ? 'phone-portrait-outline' : 'document-text-outline'} size={18} color={mc} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.billTime, { color: colors.text }]}>
                      {new Date(bill.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      {bill.customerName ? `  ·  ${bill.customerName}` : ''}
                    </Text>
                    <Text style={[s.billItems, { color: colors.textSub }]} numberOfLines={1}>{bill.items.map(i => i.productName).join(', ')}</Text>
                  </View>
                  <Text style={[s.billAmt, { color: colors.primary }]}>{formatCurrency(bill.total, settings.currency)}</Text>
                </MotiView>
              );
            })}
          </View>
        )}

        {/* Empty state — no sales yet today */}
        {todayBills.length === 0 && (
          <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400, delay: 280 }} style={[s.emptyCard, { backgroundColor: colors.surface }]}>
            <View style={[s.emptyIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="receipt-outline" size={30} color={colors.primary} />
            </View>
            <Text style={[s.emptyTitle, { color: colors.text }]}>No sales yet today</Text>
            <Text style={[s.emptySub, { color: colors.textMuted }]}>Create your first bill — today's earnings, top items and recent sales will show up here.</Text>
            <PressableScale style={[s.emptyBtn, { backgroundColor: colors.primary }]} onPress={() => navigation.navigate('Billing')}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={s.emptyBtnText}>New Bill</Text>
            </PressableScale>
          </MotiView>
        )}

        {/* Brand watermark footer — shimmer sweeps through the letters */}
        <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 600 }} style={s.brandWrap}>
          <Text style={[s.brandTagline, { color: colors.textMuted }]}>RUN YOUR SHOP, BY VOICE</Text>
          <ShimmerBrand colors={colors} />
        </MotiView>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  // Brand watermark footer
  brandWrap: { marginTop: 24, paddingTop: 28, paddingBottom: 6, alignItems: 'center', justifyContent: 'flex-end' },
  brandTagline: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 2.5, marginBottom: 10 },

  // Hero — greeting + headline earnings
  hero: { paddingHorizontal: 20, paddingBottom: 30, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  greeting: { fontFamily: fonts.medium, fontSize: 13, color: 'rgba(255,255,255,0.72)' },
  shopName: { fontFamily: fonts.extraBold, fontSize: 22, color: '#fff', letterSpacing: -0.4, marginTop: 2 },
  waPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20 },
  waPillText: { color: '#fff', fontFamily: fonts.bold, fontSize: 12 },
  earnBlock: { marginTop: 16 },
  earnLbl: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 1.5, color: 'rgba(255,255,255,0.6)' },
  earnVal: { fontFamily: fonts.display, fontSize: 40, color: '#fff', marginTop: 3, letterSpacing: -1 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8 },
  deltaPct: { fontFamily: fonts.bold, fontSize: 12.5 },
  deltaMuted: { fontFamily: fonts.medium, fontSize: 12, color: 'rgba(255,255,255,0.6)', marginLeft: 2 },
  heroChips: { flexDirection: 'row', gap: 8, marginTop: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14 },
  chipText: { color: '#fff', fontFamily: fonts.semiBold, fontSize: 12 },

  // Floating bento metric tiles
  bentoRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: -22 },
  bentoCard: { borderRadius: 18, padding: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, gap: 9, elevation: 3, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  bentoTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bentoIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  bentoDot: { width: 6, height: 6, borderRadius: 3, opacity: 0.55 },
  bentoVal: { fontFamily: fonts.extraBold, fontSize: 16 },
  bentoLbl: { fontFamily: fonts.medium, fontSize: 11 },

  // Ask AI bar
  askBar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 14, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1 },
  askIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  askText: { flex: 1, fontFamily: fonts.medium, fontSize: 14 },

  // Daily goal ring
  goalCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 14, borderRadius: 18, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  goalRingWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  goalRingCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  goalPct: { fontFamily: fonts.extraBold, fontSize: 22 },
  goalLbl: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 1 },
  goalAmount: { fontFamily: fonts.extraBold, fontSize: 16, marginTop: 6 },
  goalRemain: { fontFamily: fonts.medium, fontSize: 12.5, marginTop: 4 },
  goalPrompt: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 14, borderRadius: 18, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },

  // 7-day sparkline
  weekCard: { marginHorizontal: 16, marginTop: 14, borderRadius: 18, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  weekHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  weekTitle: { fontFamily: fonts.extraBold, fontSize: 15 },
  weekSub: { fontFamily: fonts.medium, fontSize: 11.5, marginTop: 1 },
  weekTotal: { fontFamily: fonts.extraBold, fontSize: 16 },
  weekBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  weekCol: { flex: 1, alignItems: 'center', gap: 8 },
  weekBarTrack: { height: 64, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  weekBar: { width: '70%', borderRadius: 6, minHeight: 4, overflow: 'hidden' },
  weekDay: { fontSize: 11 },

  // Alert card
  alertCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 14, borderRadius: 16, padding: 13, gap: 12 },
  alertIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  alertTitle: { fontFamily: fonts.bold, fontSize: 13 },
  alertSub: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },

  // Section titles
  sectionTitle: { fontFamily: fonts.extraBold, fontSize: 17, paddingHorizontal: 16, marginTop: 14, marginBottom: 14, letterSpacing: -0.3 },

  // Quick actions — circular
  qaItem: { alignItems: 'center', width: 70 },
  qaCircle: { width: 60, height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  qaLabel: { fontFamily: fonts.semiBold, fontSize: 11.5, textAlign: 'center' },

  // Sections — top selling, recent bills
  section: { marginHorizontal: 16, marginTop: 14, borderRadius: 18, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, marginBottom: 0 },
  sectionInTitle: { fontFamily: fonts.extraBold, fontSize: 16, marginBottom: 14 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  seeAll: { fontFamily: fonts.bold, fontSize: 13 },

  // Top selling rows
  topRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 12 },
  topRankBadge: { width: 30, height: 30, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  topRank: { fontFamily: fonts.extraBold, fontSize: 13 },
  topName: { flex: 1, fontFamily: fonts.semiBold, fontSize: 14 },
  topQtyBadge: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 12 },
  topQty: { fontFamily: fonts.bold, fontSize: 12 },

  // Empty state
  emptyCard: { marginHorizontal: 16, marginTop: 14, borderRadius: 18, paddingVertical: 30, paddingHorizontal: 24, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  emptyIcon: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontFamily: fonts.extraBold, fontSize: 17 },
  emptySub: { fontFamily: fonts.medium, fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 6, marginBottom: 18, paddingHorizontal: 8 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 14 },
  emptyBtnText: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },

  // Bill rows
  billRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 12 },
  billMode: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  billTime: { fontFamily: fonts.bold, fontSize: 13 },
  billItems: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  billAmt: { fontFamily: fonts.extraBold, fontSize: 15 },
});
