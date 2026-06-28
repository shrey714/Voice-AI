import React, { useState, useMemo } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Text } from 'react-native-paper';
import { LineChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { useAppStore } from '../stores/useAppStore';
import { useTranslation } from '../hooks/useTranslation';
import { formatCurrency, startOfDay, startOfWeek, startOfMonth } from '../utils/helpers';
import { computeSalesStats, makeCostOf, returnGstImpact, salesHeat } from '../utils/stats';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';

const { width } = Dimensions.get('window');
type Period = 'daily' | 'weekly' | 'monthly';

export default function AnalyticsScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { bills, expenses, products, settings, returns, suppliers, purchases } = useAppStore();
  const [period, setPeriod] = useState<Period>('daily');

  const rangeStart = period === 'daily' ? startOfDay() : period === 'weekly' ? startOfWeek() : startOfMonth();
  const periodBills = bills.filter(b => b.createdAt >= rangeStart);
  const periodExpenses = expenses.filter(e => e.createdAt >= rangeStart);

  // All sales metrics come from the shared helper (returns netted consistently).
  const costOf = makeCostOf(products);
  const stats = computeSalesStats({ bills, returns, from: rangeStart, to: Date.now(), costOf });
  const revenue = stats.revenue;
  const profit = stats.profit;
  const totalExpenses = periodExpenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = profit - totalExpenses;

  const topItems = stats.topItems.slice(0, 5).map(it => [it.name, { qty: it.qty, revenue: it.revenue }] as [string, { qty: number; revenue: number }]);

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i)); d.setHours(0, 0, 0, 0); return d;
  });
  const chartData = last7Days.map(d => {
    const s = d.getTime(), e = s + 86400000;
    return computeSalesStats({ bills, returns, from: s, to: e - 1, costOf }).revenue;
  });
  const chartLabels = last7Days.map(d => d.toLocaleDateString('en', { weekday: 'short' }));

  const payBreakdown = stats.paymentSplit;

  // Busiest-hours heatmap (fixed 60-day window, independent of the period filter).
  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const heat = salesHeat(bills, Date.now() - 60 * 86400000, Date.now());
  const heatPeak = useMemo(() => {
    let best = { day: 0, hour: 0, v: 0 };
    heat.grid.forEach((row, d) => row.forEach((v, h) => { if (v > best.v) best = { day: d, hour: h, v }; }));
    return best;
  }, [heat]);
  const fmtH = (h: number) => `${(h % 12) || 12} ${h < 12 ? 'AM' : 'PM'}`;

  const lowStock = products.filter(p => p.quantity <= p.lowStockThreshold);

  // GST Summary — output tax from bills, net of GST reversed on returns in the period.
  const gstSlabMap: Record<number, { taxableValue: number; cgst: number; sgst: number }> = {};
  let totalOutputCgst = 0, totalOutputSgst = 0, totalOutputTaxable = 0;
  periodBills.forEach(b => {
    (b.gstBreakdown || []).forEach(slab => {
      if (!gstSlabMap[slab.rate]) gstSlabMap[slab.rate] = { taxableValue: 0, cgst: 0, sgst: 0 };
      gstSlabMap[slab.rate].taxableValue += slab.taxableValue;
      gstSlabMap[slab.rate].cgst += slab.cgst;
      gstSlabMap[slab.rate].sgst += slab.sgst;
      totalOutputCgst += slab.cgst;
      totalOutputSgst += slab.sgst;
      totalOutputTaxable += slab.taxableValue;
    });
  });
  // Reverse GST for items returned in the period (rate from the product).
  const rateOf = (id: string) => products.find(p => p.id === id)?.gstRate ?? 0;
  const gstReversal = returnGstImpact(returns, rangeStart, Date.now(), rateOf);
  for (const [rateStr, v] of Object.entries(gstReversal.bySlab)) {
    const rate = Number(rateStr);
    if (!gstSlabMap[rate]) gstSlabMap[rate] = { taxableValue: 0, cgst: 0, sgst: 0 };
    gstSlabMap[rate].taxableValue -= v.taxableValue;
    gstSlabMap[rate].cgst -= v.cgst;
    gstSlabMap[rate].sgst -= v.sgst;
  }
  totalOutputCgst -= gstReversal.totalCgst;
  totalOutputSgst -= gstReversal.totalSgst;
  totalOutputTaxable -= gstReversal.totalTaxable;
  const gstSlabs = Object.entries(gstSlabMap)
    .map(([rate, v]) => ({ rate: Number(rate), ...v }))
    .filter(s => s.taxableValue > 0.01 || s.cgst > 0.01 || s.sgst > 0.01)
    .sort((a, b) => a.rate - b.rate);
  const totalOutputGst = totalOutputCgst + totalOutputSgst;
  const hasGstData = gstSlabs.length > 0;

  // Supplier payables — sum of unpaid portions across all purchases per supplier
  const supplierPayables = suppliers.map(sup => ({
    supplier: sup,
    outstanding: purchases
      .filter(p => p.supplierId === sup.id)
      .reduce((s, p) => s + Math.max(0, p.totalAmount - p.paidAmount), 0),
  })).filter(x => x.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding);
  const totalPayables = supplierPayables.reduce((s, x) => s + x.outstanding, 0);

  const statCards = [
    { label: t('revenue'), value: formatCurrency(revenue, settings.currency), icon: 'cash-outline', color: colors.primary },
    { label: t('profit'), value: formatCurrency(profit, settings.currency), icon: 'trending-up-outline', color: colors.success },
    { label: t('expenses'), value: formatCurrency(totalExpenses, settings.currency), icon: 'wallet-outline', color: colors.warning },
    { label: t('netProfit'), value: formatCurrency(netProfit, settings.currency), icon: 'ribbon-outline', color: netProfit >= 0 ? colors.success : colors.danger },
  ];

  const s = makeStyles(colors);

  return (
    <View style={[{ backgroundColor: colors.bg, flex: 1 }]}>


      {/* Period filter */}
    <View style={[s.searchRow, {backgroundColor: colors.surface, borderBottomColor: colors.border}]}>
      <View style={[s.periodRow, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
        {(['daily', 'weekly', 'monthly'] as Period[]).map(f => (
          <TouchableOpacity key={f} style={[s.periodBtn, period === f && { backgroundColor: colors.primary }]} onPress={() => setPeriod(f)}>
            <Text style={[s.periodBtnText, { color: period === f ? '#fff' : colors.textSub }]}>
              {t(f)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>

      
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 12 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >

      {/* Stat cards */}
      <View style={s.cardsGrid}>
        {statCards.map((c, i) => (
          <MotiView key={c.label} from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 320, delay: i * 60 }}
            style={[s.summaryCard, { backgroundColor: colors.surface, borderTopColor: c.color }]}>
            <Ionicons name={c.icon as any} size={22} color={c.color} style={s.summaryIcon} />
            <Text style={[s.summaryValue, { color: c.color }]}>{c.value}</Text>
            <Text style={[s.summaryLabel, { color: colors.textMuted }]}>{c.label}</Text>
          </MotiView>
        ))}
      </View>

      {/* 7-Day chart */}
      <View style={[s.chartCard, { backgroundColor: colors.surface }]}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>Revenue — Last 7 Days</Text>
        {chartData.some(v => v > 0) ? (
          <LineChart
            data={{ labels: chartLabels, datasets: [{ data: chartData }] }}
            width={width - 56}
            height={170}
            chartConfig={{
              backgroundColor: colors.surface,
              backgroundGradientFrom: colors.surface,
              backgroundGradientTo: colors.surface,
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(108, 99, 255, ${opacity})`,
              labelColor: () => colors.textMuted,
              propsForDots: { r: '4', strokeWidth: '2', stroke: colors.primary },
            }}
            bezier
            style={{ borderRadius: 12 }}
          />
        ) : (
          <View style={s.noDataView}>
            <Text style={[s.noDataText, { color: colors.textMuted }]}>No sales data yet</Text>
          </View>
        )}
      </View>

      {/* Busiest hours heatmap (weekday × hour) */}
      {heat.billCount >= 5 && (
        <View style={[s.section, { backgroundColor: colors.surface }]}>
          <Text style={[s.sectionTitle, { color: colors.text, marginBottom: 4 }]}>Busiest Hours</Text>
          <Text style={[s.noDataText, { color: colors.textMuted, textAlign: 'left', marginBottom: 12 }]}>Last 60 days · darker = busier</Text>
          {heat.grid.map((row, day) => (
            <View key={day} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 2 }}>
              <Text style={{ width: 30, fontFamily: fonts.semiBold, fontSize: 10, color: colors.textMuted }}>{DAY_LABELS[day]}</Text>
              {row.map((v, h) => (
                <View key={h} style={{ flex: 1, height: 13, borderRadius: 2, backgroundColor: colors.primary, opacity: 0.07 + 0.93 * (heat.gridMax > 0 ? v / heat.gridMax : 0) }} />
              ))}
            </View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginLeft: 32, marginTop: 5 }}>
            {[0, 6, 12, 18, 23].map(h => <Text key={h} style={{ fontFamily: fonts.medium, fontSize: 9, color: colors.textMuted }}>{(h % 12) || 12}{h < 12 ? 'a' : 'p'}</Text>)}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: colors.primaryLight, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 11, marginTop: 14 }}>
            <Ionicons name="flame" size={13} color={colors.primary} />
            <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: colors.primary }}>
              Busiest: {DAY_LABELS[heatPeak.day]} {fmtH(heatPeak.hour)}–{fmtH((heatPeak.hour + 1) % 24)}
            </Text>
          </View>
        </View>
      )}

      {/* Top Selling */}
      {topItems.length > 0 && (
        <View style={[s.section, { backgroundColor: colors.surface }]}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>{t('topSelling')}</Text>
          {topItems.map(([name, data], i) => (
            <MotiView key={name} from={{ opacity: 0, translateX: -10 }} animate={{ opacity: 1, translateX: 0 }}
              transition={{ type: 'timing', duration: 280, delay: i * 50 }} style={s.topRow}>
              <Text style={[s.topRank, { color: colors.textMuted }]}>#{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.topName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
                <View style={[s.topBar, { width: `${(data.qty / topItems[0][1].qty) * 100}%`, backgroundColor: colors.primary }]} />
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.topQty, { color: colors.primary }]}>{data.qty} sold</Text>
                <Text style={[s.topRev, { color: colors.textMuted }]}>{formatCurrency(data.revenue, settings.currency)}</Text>
              </View>
            </MotiView>
          ))}
        </View>
      )}

      {/* Payment breakdown */}
      <View style={[s.section, { backgroundColor: colors.surface }]}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>Payment Modes</Text>
        {Object.entries(payBreakdown).map(([mode, amount]) => (
          <View key={mode} style={[s.payRow, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={mode === 'cash' ? 'cash-outline' : mode === 'upi' ? 'phone-portrait-outline' : 'document-text-outline'} size={16} color={colors.textSub} />
              <Text style={[s.payMode, { color: colors.text }]}>{mode.charAt(0).toUpperCase() + mode.slice(1)}</Text>
            </View>
            <Text style={[s.payAmt, { color: colors.primary }]}>{formatCurrency(amount, settings.currency)}</Text>
          </View>
        ))}
        {periodBills.length === 0 && <Text style={[s.noDataText, { color: colors.textMuted }]}>No transactions</Text>}
      </View>

      {/* Returns */}
      {stats.returnCount > 0 && (
        <View style={[s.section, { backgroundColor: colors.surface }]}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Returns</Text>
          <View style={[s.payRow, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="arrow-undo-outline" size={16} color={colors.danger} />
              <Text style={[s.payMode, { color: colors.text }]}>{stats.returnCount} return{stats.returnCount > 1 ? 's' : ''} · {stats.returnedUnits} unit{stats.returnedUnits > 1 ? 's' : ''}</Text>
            </View>
            <Text style={[s.payAmt, { color: colors.danger }]}>−{formatCurrency(stats.refunds, settings.currency)}</Text>
          </View>
          <View style={[s.payRow, { borderBottomColor: colors.border, borderBottomWidth: 0 }]}>
            <Text style={[s.payMode, { color: colors.textSub }]}>Profit impact</Text>
            <Text style={[s.payAmt, { color: colors.danger }]}>−{formatCurrency(stats.profitCut, settings.currency)}</Text>
          </View>
          <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, marginTop: 8 }}>
            Revenue & profit above are already net of these returns.
          </Text>
        </View>
      )}

      {/* GST Summary */}
      {settings.gstRegistered && (
        <View style={[s.section, { backgroundColor: colors.surface }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Ionicons name="receipt-outline" size={18} color={colors.primary} />
            <Text style={[s.sectionTitle, { color: colors.text, marginBottom: 0 }]}>GST Summary (Output Tax)</Text>
          </View>

          {!hasGstData ? (
            <Text style={{ color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13 }}>
              No GST transactions in this period. Add GST rates to your products to track output tax.
            </Text>
          ) : (
            <>
              {/* Slab breakdown */}
              <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 6 }}>
                {['Rate', 'Taxable', 'CGST', 'SGST'].map(h => (
                  <Text key={h} style={{ flex: 1, fontFamily: fonts.bold, fontSize: 12, color: colors.textSub, textAlign: h === 'Rate' ? 'left' : 'right' }}>{h}</Text>
                ))}
              </View>
              {gstSlabs.map(slab => (
                <View key={slab.rate} style={{ flexDirection: 'row', paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                  <Text style={{ flex: 1, fontFamily: fonts.semiBold, fontSize: 13, color: colors.text }}>{slab.rate}%</Text>
                  <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.text, textAlign: 'right' }}>{formatCurrency(slab.taxableValue, settings.currency)}</Text>
                  <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.text, textAlign: 'right' }}>{formatCurrency(slab.cgst, settings.currency)}</Text>
                  <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.text, textAlign: 'right' }}>{formatCurrency(slab.sgst, settings.currency)}</Text>
                </View>
              ))}
              {/* Totals */}
              <View style={{ flexDirection: 'row', marginTop: 10, paddingTop: 8, borderTopWidth: 1.5, borderTopColor: colors.primary + '40' }}>
                <Text style={{ flex: 1, fontFamily: fonts.extraBold, fontSize: 13, color: colors.text }}>Total</Text>
                <Text style={{ flex: 1, fontFamily: fonts.extraBold, fontSize: 13, color: colors.primary, textAlign: 'right' }}>{formatCurrency(totalOutputTaxable, settings.currency)}</Text>
                <Text style={{ flex: 1, fontFamily: fonts.extraBold, fontSize: 13, color: colors.primary, textAlign: 'right' }}>{formatCurrency(totalOutputCgst, settings.currency)}</Text>
                <Text style={{ flex: 1, fontFamily: fonts.extraBold, fontSize: 13, color: colors.primary, textAlign: 'right' }}>{formatCurrency(totalOutputSgst, settings.currency)}</Text>
              </View>
              <View style={[{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, backgroundColor: colors.primaryLight, borderRadius: 10, padding: 12 }]}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.primary }}>Total GST Payable</Text>
                <Text style={{ fontFamily: fonts.extraBold, fontSize: 16, color: colors.primary }}>{formatCurrency(totalOutputGst, settings.currency)}</Text>
              </View>
              <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, marginTop: 8 }}>
                This is output GST collected from customers. Subtract ITC (input tax from purchases) to get net payable.
              </Text>
            </>
          )}
        </View>
      )}

      {/* Supplier Payables */}
      {totalPayables > 0 && (
        <View style={[s.section, { backgroundColor: colors.surface }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Ionicons name="business-outline" size={18} color={colors.danger} />
            <Text style={[s.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Supplier Payables</Text>
          </View>
          {supplierPayables.map(({ supplier, outstanding }) => (
            <View key={supplier.id} style={[s.payRow, { borderBottomColor: colors.border }]}>
              <Text style={[s.payMode, { color: colors.text }]} numberOfLines={1}>{supplier.name}</Text>
              <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.danger }}>{formatCurrency(outstanding, settings.currency)}</Text>
            </View>
          ))}
          <View style={[{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, backgroundColor: colors.danger + '12', borderRadius: 10, padding: 12 }]}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.danger }}>Total Outstanding</Text>
            <Text style={{ fontFamily: fonts.extraBold, fontSize: 16, color: colors.danger }}>{formatCurrency(totalPayables, settings.currency)}</Text>
          </View>
        </View>
      )}

      {/* Low Stock */}
      {lowStock.length > 0 && (
        <View style={[s.section, { backgroundColor: colors.surface }]}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>{t('lowStock')} Items</Text>
          {lowStock.slice(0, 8).map(p => (
            <View key={p.id} style={[s.payRow, { borderBottomColor: colors.border }]}>
              <Text style={[s.payMode, { color: colors.text }]} numberOfLines={1}>{p.name}</Text>
              <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: p.quantity === 0 ? colors.danger : colors.warning }}>
                {p.quantity === 0 ? 'Out of stock' : `${p.quantity} left`}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Summary stats */}
      <View style={[s.section, { backgroundColor: colors.surface }]}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>Summary</Text>
        {[
          ['Total Bills', stats.fullyReturnedCount > 0 ? `${stats.billCount}  (${stats.fullyReturnedCount} returned)` : String(stats.billCount)],
          ['Avg Bill', stats.netBillCount > 0 ? formatCurrency(revenue / stats.netBillCount, settings.currency) : '—'],
          ['Total Products', String(products.length)],
          ['Profit Margin', revenue > 0 ? `${((profit / revenue) * 100).toFixed(1)}%` : '—'],
        ].map(([label, value]) => (
          <View key={label} style={[s.payRow, { borderBottomColor: colors.border }]}>
            <Text style={[s.payMode, { color: colors.textSub }]}>{label}</Text>
            <Text style={{ fontFamily: fonts.bold, color: colors.text, fontSize: 14 }}>{value}</Text>
          </View>
        ))}
      </View>

        <View style={{ height: 120 }} />

  </ScrollView>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  // Period selector — cleaner, better spaced
  periodRow: { flexDirection: 'row', borderRadius: 10, padding: 6, borderWidth: 1, borderColor: c.border },
  periodBtn: { flex: 1, padding: 8, borderRadius: 6, alignItems: 'center' },
  periodBtnText: { fontFamily: fonts.bold, fontSize: 13 },

  // period filter
  searchRow: { flexDirection: 'row', gap: 10, padding: 8.5, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },

  // Stat cards grid — 2x2 with better spacing
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 12, marginBottom: 12 },
  summaryCard: { width: '47.5%', borderRadius: 16, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  summaryIcon: { fontSize: 24, marginBottom: 8 },
  summaryValue: { fontFamily: fonts.display, fontSize: 20 },
  summaryLabel: { fontFamily: fonts.medium, fontSize: 12, marginTop: 6 },

  // Chart card — more breathing room
  chartCard: { marginHorizontal: 16, borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  sectionTitle: { fontFamily: fonts.extraBold, fontSize: 16, marginBottom: 14 },
  noDataView: { height: 120, justifyContent: 'center', alignItems: 'center' },
  noDataText: { fontFamily: fonts.medium, fontSize: 14 },

  // Sections — better spacing
  section: { marginHorizontal: 16, marginBottom: 14, borderRadius: 16, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },

  // Top selling rows — cleaner spacing
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12 },
  topRank: { fontFamily: fonts.extraBold, width: 32, fontSize: 13 },
  topName: { fontFamily: fonts.semiBold, fontSize: 14, marginBottom: 4 },
  topBar: { height: 6, borderRadius: 3, minWidth: 16 },
  topQty: { fontFamily: fonts.bold, fontSize: 14 },
  topRev: { fontFamily: fonts.medium, fontSize: 12 },

  // Payment & data rows — better spacing
  payRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 0.5 },
  payMode: { fontFamily: fonts.medium, fontSize: 14 },
  payAmt: { fontFamily: fonts.bold, fontSize: 14 },
});
