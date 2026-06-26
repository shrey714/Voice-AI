import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Linking, Alert, RefreshControl, Dimensions, Platform } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, SharedValue } from 'react-native-reanimated';
import { useAppStore } from '../stores/useAppStore';
import { formatCurrency, startOfDay, endOfDay } from '../utils/helpers';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import AnimatedNumber from '../components/common/AnimatedNumber';
import PressableScale from '../components/common/PressableScale';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const { products, bills, expenses, loadProducts, loadBills, loadExpenses, settings } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);

  const todayBills = bills.filter(b => b.createdAt >= startOfDay() && b.createdAt <= endOfDay());
  const todayRevenue = todayBills.reduce((s, b) => s + b.total, 0);
  const todayProfit = todayBills.reduce((s, b) => s + b.profit, 0);
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

  const topItems: Record<string, number> = {};
  todayBills.forEach(b => b.items.forEach(i => { topItems[i.productName] = (topItems[i.productName] || 0) + i.quantity; }));
  const topSelling = Object.entries(topItems).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      setTimeout(async() => {
        await Promise.all([loadProducts(), loadBills(), loadExpenses()]);
      }, 1000);
    } catch (e) {
      // ignore — still stop the spinner below
    } finally {
      setRefreshing(false); // ALWAYS reset, else the Android loader gets stuck
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
        {/* Hero gradient header — extends under status bar for colored status bar effect */}
        <LinearGradient colors={[colors.primary, colors.primaryDark, '#35423A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.hero, { paddingTop: insets.top + 20, marginTop: Platform.OS === 'ios' ? -(insets.top + 8) : 0, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 }]}>
          <MotiView from={{ opacity: 0, translateY: -8 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 500 }}>
            <Text style={s.shopName}>{settings.shopName}</Text>
            <Text style={s.heroDate}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Text>
          </MotiView>

          <TouchableOpacity style={s.waBtn} onPress={sendSummary}>
            <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
            <Text style={s.waBtnText}>Send Summary</Text>
          </TouchableOpacity>

          {/* Stat cards inside hero — polished with better spacing */}
          <View style={s.heroStats}>
            {[
              { label: 'Revenue', num: todayRevenue, fmt: (n: number) => formatCurrency(n, settings.currency), icon: 'cash-outline' as const, color: '#fff' },
              { label: 'Profit', num: todayProfit, fmt: (n: number) => formatCurrency(n, settings.currency), icon: 'trending-up-outline' as const, color: '#A5F3A5' },
              { label: 'Bills', num: todayBills.length, fmt: (n: number) => String(Math.round(n)), icon: 'receipt-outline' as const, color: '#FDE68A' },
            ].map((stat, i) => (
              <MotiView key={stat.label} style={{ flex: 1 }} from={{ opacity: 0, translateY: 8 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300, delay: 100 + i * 70 }}>
                <View style={s.heroStatCard}>
                  <Ionicons name={stat.icon} size={28} color={stat.color} />
                  <Text style={[s.heroStatLbl, { color: 'rgba(255,255,255,0.7)' }]}>{stat.label}</Text>
                  <AnimatedNumber value={stat.num} format={stat.fmt} style={[s.heroStatVal, { color: stat.color }]} />
                </View>
              </MotiView>
            ))}
          </View>
        </LinearGradient>

        {/* Low stock warning */}
        {lowStockItems.length > 0 && (
          <MotiView from={{ opacity: 0, translateX: -10 }} animate={{ opacity: 1, translateX: 0 }} transition={{ type: 'timing', duration: 350, delay: 200 }}>
            <TouchableOpacity style={[s.alertCard, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '40' }]}
              onPress={() => navigation.navigate('Inventory')}>
              <Ionicons name="warning" size={20} color={colors.warning} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[s.alertTitle, { color: colors.warning }]}>{lowStockItems.length} items low on stock</Text>
                <Text style={[s.alertSub, { color: colors.textSub }]} numberOfLines={1}>
                  {lowStockItems.slice(0, 3).map(p => p.name).join(', ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.warning} />
            </TouchableOpacity>
          </MotiView>
        )}

        {/* Expiry warning */}
        {expiringItems.length > 0 && (
          <MotiView from={{ opacity: 0, translateX: -10 }} animate={{ opacity: 1, translateX: 0 }} transition={{ type: 'timing', duration: 350, delay: 260 }}>
            <TouchableOpacity
              style={[s.alertCard, { backgroundColor: colors.danger + '15', borderColor: colors.danger + '40' }]}
              onPress={() => navigation.navigate('Inventory')}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.danger} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[s.alertTitle, { color: colors.danger }]}>
                  {expiredCount > 0 && expiringSoonCount > 0
                    ? `${expiredCount} expired · ${expiringSoonCount} expiring soon`
                    : expiredCount > 0
                      ? `${expiredCount} item${expiredCount > 1 ? 's' : ''} expired`
                      : `${expiringSoonCount} item${expiringSoonCount > 1 ? 's' : ''} expiring within 30 days`}
                </Text>
                <Text style={[s.alertSub, { color: colors.textSub }]} numberOfLines={1}>
                  {expiringItems.slice(0, 3).map(p => p.name).join(', ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.danger} />
            </TouchableOpacity>
          </MotiView>
        )}

        {/* Quick Actions — bigger, better spaced */}
        <Text style={[s.sectionTitle]}>Quick Actions</Text>
        <View style={s.actionsGrid}>
          {[
            { label: 'New Bill',    icon: 'cart-outline' as const,        color: colors.primary, onPress: () => navigation.navigate('Billing') },
            { label: 'Add Product', icon: 'add-circle-outline' as const,  color: colors.primary, onPress: () => navigation.navigate('Inventory') },
            { label: 'Analytics',   icon: 'bar-chart-outline' as const,   color: colors.primary, onPress: () => navigation.navigate('More', { screen: 'Analytics' }) },
            { label: 'Expenses',    icon: 'wallet-outline' as const,      color: colors.primary, onPress: () => navigation.navigate('More', { screen: 'Expenses' }) },
            { label: 'Udhaar',      icon: 'book-outline' as const,        color: colors.primary, onPress: () => navigation.navigate('More', { screen: 'Udhaar' }) },
            { label: 'Suppliers',   icon: 'business-outline' as const,    color: colors.primary, onPress: () => navigation.navigate('More', { screen: 'Supplier' }) },
          ].map((action, i) => (
            <MotiView key={action.label} from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 300, delay: 150 + i * 45 }}>
              <PressableScale style={[s.actionCard, { backgroundColor: colors.surface }]} onPress={action.onPress}>
                <View style={[s.actionIcon, { backgroundColor: action.color + '18' }]}>
                  <Ionicons name={action.icon} size={28} color={action.color} />
                </View>
                <Text style={[s.actionLabel, { color: colors.text }]}>{action.label}</Text>
              </PressableScale>
            </MotiView>
          ))}
        </View>

        {/* Today's performance */}
        <Text style={[s.sectionTitle]}>Today's Performance</Text>
        <View style={s.perfRow}>
          {[
            { label: 'Revenue', num: todayRevenue, color: colors.primary, bg: colors.primaryLight },
            { label: 'Net Profit', num: todayProfit - todayExpenses, color: todayProfit - todayExpenses >= 0 ? colors.success : colors.danger, bg: (todayProfit - todayExpenses >= 0 ? colors.success : colors.danger) + '12' },
          ].map((item, i) => (
            <MotiView key={item.label} from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 400, delay: 300 + i * 80 }}
              style={[s.perfCard, { backgroundColor: colors.surface, flex: 1 }]}>
              <View style={[s.perfBg, { backgroundColor: item.bg }]}>
                <AnimatedNumber value={item.num} format={(n) => formatCurrency(n, settings.currency)} style={[s.perfVal, { color: item.color }]} />
                <Text style={[s.perfLbl, { color: colors.textMuted }]}>{item.label}</Text>
              </View>
            </MotiView>
          ))}
        </View>

        {/* Top Selling */}
        {topSelling.length > 0 && (
          <View style={[s.section, { backgroundColor: colors.surface }]}>
            <Text style={[s.sectionInTitle, { color: colors.text }]}>Top Selling Today</Text>
            {topSelling.map(([name, qty], i) => (
              <MotiView key={name} from={{ opacity: 0, translateX: -10 }} animate={{ opacity: 1, translateX: 0 }}
                transition={{ type: 'timing', duration: 300, delay: i * 50 + 400 }}
                style={[s.topRow, { borderBottomColor: colors.border }]}>
                <View style={[s.topRankBadge, { backgroundColor: i === 0 ? '#FDE68A' : i === 1 ? '#E2E8F0' : colors.surfaceHigh }]}>
                  <Text style={[s.topRank, { color: i === 0 ? '#92400E' : colors.textSub }]}>#{i + 1}</Text>
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
              <Text style={[s.sectionInTitle, { color: colors.text }]}>Recent Bills</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Records')} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Text style={[s.seeAll, { color: colors.primary }]}>See all</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
            {todayBills.slice(0, 5).map((bill, i) => {
              const mc = bill.paymentMode === 'cash' ? colors.success : bill.paymentMode === 'upi' ? colors.info : colors.warning;
              return (
                <MotiView key={bill.id} from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 300, delay: i * 50 + 400 }}
                  style={[s.billRow, { borderBottomColor: colors.border }]}>
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

  // Hero section — generous padding & spacing
  hero: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 },
  shopName: { fontFamily: fonts.display, fontSize: 28, color: '#fff', letterSpacing: -0.5 },
  heroDate: { fontFamily: fonts.medium, fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 4 },
  waBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  waBtnText: { color: '#fff', fontFamily: fonts.bold, fontSize: 12 },

  // Stat cards
  heroStats: { flexDirection: 'row', marginTop: 20, gap: 12 },
  heroStatCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 16, padding: 16, alignItems: 'center', gap: 8 },
  heroStatVal: { fontFamily: fonts.display, fontSize: 20, textAlign: 'center' },
  heroStatLbl: { fontFamily: fonts.semiBold, fontSize: 11, color: 'rgba(255,255,255,0.7)' },

  // Alert card
  alertCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 16, borderWidth: 1 },
  alertTitle: { fontFamily: fonts.bold, fontSize: 13 },
  alertSub: { fontFamily: fonts.regular, fontSize: 12, marginTop: 3 },

  // Section titles
  sectionTitle: { fontFamily: fonts.extraBold, color: '#fff', fontSize: 16, paddingHorizontal: 16, marginTop: 24, marginBottom: 14, letterSpacing: -0.3 },

  // Quick action cards
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 12 },
  actionCard: { width: (Dimensions.get('window').width - 56) / 3, alignItems: 'center', paddingVertical: 18, paddingHorizontal: 8, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  actionIcon: { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  actionLabel: { fontFamily: fonts.bold, fontSize: 12, textAlign: 'center', lineHeight: 14 },

  // Performance row — DM Serif for the big numbers
  perfRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginBottom: 8 },
  perfCard: { borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, flex: 1 },
  perfBg: { padding: 18, alignItems: 'center' },
  perfVal: { fontFamily: fonts.display, fontSize: 24 },
  perfLbl: { fontFamily: fonts.semiBold, fontSize: 12, marginTop: 6 },

  // Sections — top selling, recent bills
  section: { marginHorizontal: 16, marginTop: 8, borderRadius: 16, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, marginBottom: 12 },
  sectionInTitle: { fontFamily: fonts.extraBold, fontSize: 16, marginBottom: 14 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  seeAll: { fontFamily: fonts.bold, fontSize: 13 },

  // Top selling rows
  topRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, gap: 12 },
  topRankBadge: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  topRank: { fontFamily: fonts.extraBold, fontSize: 12 },
  topName: { flex: 1, fontFamily: fonts.semiBold, fontSize: 14 },
  topQtyBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  topQty: { fontFamily: fonts.bold, fontSize: 12 },

  // Bill rows
  billRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, gap: 12 },
  billMode: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  billTime: { fontFamily: fonts.bold, fontSize: 13 },
  billItems: { fontFamily: fonts.regular, fontSize: 12, marginTop: 3 },
  billAmt: { fontFamily: fonts.extraBold, fontSize: 15 },
});
