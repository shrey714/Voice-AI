import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Linking, Alert, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useScrollHideBar } from '../../hooks/useScrollHideBar';
import ScrollHideBar from '../../components/common/ScrollHideBar';
import { Text, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import LiquidBottomSheet, { LiquidBottomSheetRef } from '../../components/common/LiquidBottomSheet';
import LiquidTextField from '../../components/common/LiquidTextField';
import LiquidButton from '../../components/common/LiquidButton';
import SheetHeader from '../../components/common/SheetHeader';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../stores/useAppStore';
import { useTranslation } from '../../hooks/useTranslation';
import { formatCurrency, formatDate, formatTime, generateBillText, startOfDay, startOfWeek, startOfMonth } from '../../utils/helpers';
import { aggregateReturns, makeCostOf } from '../../utils/stats';
import { Bill, ReturnItem } from '../../types';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';
import EmptyState from '../../components/common/EmptyState';
import { SkeletonList } from '../../components/common/Skeleton';
import FadeSlideIn from '../../components/common/FadeSlideIn';
import DatePickerSheet, { DatePickerSheetRef } from '../../components/common/DatePickerSheet';
import InlineSearchBar from '../../components/common/InlineSearchBar';
import LiquidHeaderIconButton from '../../components/common/LiquidHeaderIconButton';
import { useConfirm } from '../../components/common/ConfirmDialogProvider';

// Converts a number to Indian English words (for invoice)
function amountInWords(n: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const toWords = (num: number): string => {
    if (num === 0) return '';
    if (num < 20) return ones[num] + ' ';
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '') + ' ';
    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred ' + toWords(num % 100);
    if (num < 100000) return toWords(Math.floor(num / 1000)) + 'Thousand ' + toWords(num % 1000);
    if (num < 10000000) return toWords(Math.floor(num / 100000)) + 'Lakh ' + toWords(num % 100000);
    return toWords(Math.floor(num / 10000000)) + 'Crore ' + toWords(num % 10000000);
  };
  const whole = Math.floor(n);
  const paise = Math.round((n - whole) * 100);
  return (toWords(whole) + 'Rupees' + (paise > 0 ? ' and ' + toWords(paise) + 'Paise' : '')).trim();
}

type Filter = 'today' | 'week' | 'month' | 'all' | 'custom';
type PayFilter = 'all' | 'cash' | 'upi' | 'credit';
type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];
const PAY_ICONS: Record<string, string> = { cash: '💵', upi: '📱', credit: '📝' };
const PAY_ICON: Record<string, IoniconsName> = { cash: 'cash-outline', upi: 'phone-portrait-outline', credit: 'document-text-outline' };

// Extracted + memoized — this renders inside a `FlatList`, so without this
// every row re-rendered on any state change anywhere in the screen, not
// just when its own bill/return data actually changed. Takes `colors`/`s`
// (both stable references — `s` is now itself memoized on `colors` in the
// screen below) and `onPress` as a stable top-level callback (`openDetail`,
// passed directly, not wrapped in a fresh per-row closure) so `React.memo`'s
// shallow-equality check can actually skip re-rendering unchanged rows.
const BillRow = React.memo(function BillRow({
  bill, index, colors, s, currency, hasReturn, refunded, returnsLabel, onPress,
}: {
  bill: Bill; index: number; colors: any; s: any; currency: string;
  hasReturn: boolean; refunded: number; returnsLabel: string; onPress: (bill: Bill) => void;
}) {
  const modeColor = bill.paymentMode === 'cash' ? colors.success : bill.paymentMode === 'upi' ? colors.info : colors.warning;
  return (
    <FadeSlideIn index={index}>
      <TouchableOpacity style={[s.billCard, { backgroundColor: colors.surface }]} onPress={() => onPress(bill)} activeOpacity={0.7}>
        <View style={[s.billIconBox, { backgroundColor: modeColor + '1A' }]}>
          <Ionicons name={PAY_ICON[bill.paymentMode]} size={24} color={modeColor} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.billItems, { color: colors.text }]} numberOfLines={1}>
            {bill.items.map(i => `${i.productName} ×${i.quantity}`).join(', ')}
          </Text>
          <View style={s.billMetaRow}>
            <Text style={[s.billDate, { color: colors.textMuted }]}>{formatDate(bill.createdAt)} · {formatTime(bill.createdAt)}</Text>
            {bill.customerName ? (
              <View style={[s.billCustomerPill, { backgroundColor: colors.info + '15' }]}>
                <Ionicons name="person" size={9} color={colors.info} />
                <Text style={[s.billCustomerText, { color: colors.info }]} numberOfLines={1}>{bill.customerName}</Text>
              </View>
            ) : null}
            {hasReturn && (
              <View style={[s.returnBadge, { backgroundColor: colors.warning + '20' }]}>
                <Ionicons name="arrow-undo" size={9} color={colors.warning} />
                <Text style={[s.returnBadgeText, { color: colors.warning }]}>
                  {refunded > 0 ? `${formatCurrency(refunded, currency)}` : returnsLabel}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Text style={[s.billTotal, { color: colors.text }]}>{formatCurrency(bill.total, currency)}</Text>
          <View style={[s.payPill, { backgroundColor: modeColor + '1A' }]}>
            <Text style={[s.payPillText, { color: modeColor }]}>{bill.paymentMode.toUpperCase()}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </FadeSlideIn>
  );
});

export default function BillHistoryScreen() {
  const { colors } = useAppTheme();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const { bills, returns, products, settings, processReturn } = useAppStore(
    useShallow(state => ({
      bills: state.bills,
      returns: state.returns,
      products: state.products,
      settings: state.settings,
      processReturn: state.processReturn,
    }))
  );
  const dataReady = useAppStore(st => st.dataReady);
  const [filter, setFilter] = useState<Filter>('today');
  const [payFilter, setPayFilter] = useState<PayFilter>('all');
  const [returnedOnly, setReturnedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);
  const rangePickerRef = useRef<DatePickerSheetRef>(null);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [returnBill, setReturnBill] = useState<Bill | null>(null);
  const [printing, setPrinting] = useState(false);

  // Return flow state
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('');
  const [returnRefundAmt, setReturnRefundAmt] = useState('');
  const [processingReturn, setProcessingReturn] = useState(false);

  const detailSheetRef = useRef<LiquidBottomSheetRef>(null);
  const returnSheetRef = useRef<LiquidBottomSheetRef>(null);
  const filterSheetRef = useRef<LiquidBottomSheetRef>(null);

  const openFilterSheet = useCallback(() => filterSheetRef.current?.expand(), []);

  // Count of non-default active filters (for the badge)
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filter !== 'today') n++;
    if (payFilter !== 'all') n++;
    if (returnedOnly) n++;
    return n;
  }, [filter, payFilter, returnedOnly]);

  // Memoized — `StyleSheet.create` was being re-invoked (a brand new object
  // every time) on every render regardless of whether `colors` actually
  // changed, which also meant any memoized child given `s` as a prop could
  // never actually skip re-rendering (a "new" prop reference every render
  // always fails `React.memo`'s shallow-equality check).
  const s = useMemo(() => makeStyles(colors), [colors]);

  // O(1) return lookup per bill instead of an O(returns.length) scan per
  // row per render (`billHasReturn`/`billTotalRefunded` below) — with a
  // busy shop's return history this was a real cost multiplied across every
  // visible row on every render.
  const returnsByBill = useMemo(() => {
    const map = new Map<string, { hasReturn: boolean; refunded: number }>();
    for (const r of returns) {
      const entry = map.get(r.billId) ?? { hasReturn: false, refunded: 0 };
      entry.hasReturn = true;
      entry.refunded += r.refundAmount;
      map.set(r.billId, entry);
    }
    return map;
  }, [returns]);

  // Plain flex row, not absolutely-positioned siblings — see
  // AppNavigator's useHeaderOpts comment for why.
  useEffect(() => {
    navigation.setOptions({
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

  const openDetail = useCallback((bill: Bill) => {
    setSelectedBill(bill);
    detailSheetRef.current?.expand();
  }, []);
  const closeDetail = useCallback(() => detailSheetRef.current?.close(), []);

  const returnsLabel = t('returns');
  const renderBillItem = useCallback(({ item, index }: { item: Bill; index: number }) => {
    const entry = returnsByBill.get(item.id);
    return (
      <BillRow
        bill={item}
        index={index}
        colors={colors}
        s={s}
        currency={settings.currency}
        hasReturn={entry?.hasReturn ?? false}
        refunded={entry?.refunded ?? 0}
        returnsLabel={returnsLabel}
        onPress={openDetail}
      />
    );
  }, [returnsByBill, colors, s, settings.currency, returnsLabel, openDetail]);

  const openReturnSheet = useCallback((bill: Bill) => {
    // Capture bill in its own state BEFORE closing detail (which nulls selectedBill)
    setReturnBill(bill);
    const init: Record<string, number> = {};
    bill.items.forEach(i => { init[i.productId] = 0; });
    setReturnQtys(init);
    setReturnReason('');
    setReturnRefundAmt('0');
    closeDetail();
    setTimeout(() => returnSheetRef.current?.expand(), 120);
  }, [closeDetail]);

  const closeReturnSheet = useCallback(() => returnSheetRef.current?.close(), []);

  const filtered = useMemo(() => {
    let start = 0;
    let customEndMs: number | null = null;

    if (filter === 'today') start = startOfDay();
    else if (filter === 'week') start = startOfWeek();
    else if (filter === 'month') start = startOfMonth();
    else if (filter === 'custom') {
      if (customFrom) { const d = new Date(customFrom); d.setHours(0, 0, 0, 0); start = d.getTime(); }
      if (customTo)   { const d = new Date(customTo);   d.setHours(23, 59, 59, 999); customEndMs = d.getTime(); }
    }

    const q = searchQuery.trim().toLowerCase();
    const returnedIds = new Set(returns.map(r => r.billId));

    return bills
      .filter(b => b.createdAt >= start && (customEndMs === null || b.createdAt <= customEndMs))
      .filter(b => payFilter === 'all' || b.paymentMode === payFilter)
      .filter(b => !returnedOnly || returnedIds.has(b.id))
      .filter(b => {
        if (!q) return true;
        return (
          b.customerName?.toLowerCase().includes(q) ||
          b.customerPhone?.includes(q) ||
          b.items.some(i => i.productName.toLowerCase().includes(q))
        );
      });
  }, [bills, returns, filter, payFilter, returnedOnly, searchQuery, customFrom, customTo]);

  // Totals shown for the filtered list, netted of returns on those bills.
  const filteredReturns = useMemo(() => {
    const ids = new Set(filtered.map(b => b.id));
    return aggregateReturns(returns.filter(r => ids.has(r.billId)), makeCostOf(products));
  }, [filtered, returns, products]);
  const totalRevenue = filtered.reduce((s, b) => s + b.total, 0) - filteredReturns.refunds;
  const totalProfit = filtered.reduce((s, b) => s + b.profit, 0) - filteredReturns.profitCut;

  // Helpers — how much has already been returned for a given bill item
  const getAlreadyReturned = (billId: string, productId: string) =>
    returns
      .filter(r => r.billId === billId)
      .flatMap(r => r.items)
      .filter(ri => ri.productId === productId)
      .reduce((s, ri) => s + ri.quantity, 0);

  const billHasReturn = (billId: string) => returnsByBill.get(billId)?.hasReturn ?? false;

  const billTotalRefunded = (billId: string) => returnsByBill.get(billId)?.refunded ?? 0;

  // Auto-compute refund amount whenever returnQtys changes
  const autoRefund = (bill: Bill) =>
    bill.items.reduce((s, i) => s + (returnQtys[i.productId] ?? 0) * i.sellingPrice, 0);

  const setQty = (productId: string, val: number) =>
    setReturnQtys(prev => ({ ...prev, [productId]: val }));

  const handleProcessReturn = async (bill: Bill) => {
    const items: ReturnItem[] = bill.items
      .filter(i => (returnQtys[i.productId] ?? 0) > 0)
      .map(i => ({
        productId: i.productId,
        productName: i.productName,
        quantity: returnQtys[i.productId] ?? 0,
        sellingPrice: i.sellingPrice,
        costPrice: i.costPrice, // captured so profit can be netted accurately later
        gstRate: i.gstRate,     // captured so GST can be reversed at the rate actually charged
      }));

    if (items.length === 0) {
      Alert.alert(t('noItemsSelected'), t('selectItemToReturn'));
      return;
    }

    const refund = parseFloat(returnRefundAmt) || 0;

    const ok = await confirm({
      title: 'Confirm Return',
      message: `Return ${items.length} item type${items.length > 1 ? 's' : ''}${refund > 0 ? ` · Refund ${settings.currency}${refund.toFixed(2)}` : ''}?\n\nReturned stock will be added back to inventory.`,
      confirmLabel: 'Process Return',
      destructive: true,
    });
    if (!ok) return;

    setProcessingReturn(true);
    try {
      await processReturn(bill.id, items, refund, returnReason);
      closeReturnSheet();
      Alert.alert(t('returnProcessed'), t('stockRestocked'));
    } catch {
      Alert.alert(t('error'), t('couldNotProcess'));
    } finally {
      setProcessingReturn(false);
    }
  };

  const shareOnWhatsApp = (bill: Bill) => {
    const msg = generateBillText(bill, settings.shopName, settings.currency);
    const encoded = encodeURIComponent(msg);
    const digits = bill.customerPhone?.replace(/\D/g, '') ?? '';
    const url = digits
      ? `whatsapp://send?phone=${digits.length === 10 ? '91' + digits : digits}&text=${encoded}`
      : `whatsapp://send?text=${encoded}`;
    Linking.openURL(url).catch(() =>
      Alert.alert(t('whatsappNotFound'), t('pleaseInstallWhatsapp'))
    );
  };

  const printBill = async (bill: Bill) => {
    setPrinting(true);
    try {
      const isGst = bill.gstBreakdown?.length > 0;
      const invoiceType = settings.gstRegistered ? (isGst ? t('taxInvoice') : t('billOfSupply')) : t('invoice');

      const itemRows = bill.items.map(i => {
        const gstAmt = i.sellingPrice * i.quantity - (i.taxableValue ?? i.sellingPrice * i.quantity);
        return `<tr>
          <td>${i.productName}${i.hsnCode ? `<br><small style="color:#888">HSN: ${i.hsnCode}</small>` : ''}</td>
          <td style="text-align:center">×${i.quantity}</td>
          <td style="text-align:right">${settings.currency}${(i.taxableValue ?? i.sellingPrice * i.quantity).toFixed(2)}</td>
          ${isGst ? `<td style="text-align:center">${i.gstRate || 0}%</td><td style="text-align:right">${settings.currency}${(gstAmt / 2).toFixed(2)}</td><td style="text-align:right">${settings.currency}${(gstAmt / 2).toFixed(2)}</td>` : ''}
          <td style="text-align:right">${settings.currency}${(i.sellingPrice * i.quantity).toFixed(2)}</td>
        </tr>`;
      }).join('');

      const gstSlabRows = isGst ? bill.gstBreakdown.map(s =>
        `<tr><td>${s.rate}%</td><td style="text-align:right">${settings.currency}${s.taxableValue.toFixed(2)}</td><td style="text-align:right">${settings.currency}${s.cgst.toFixed(2)}</td><td style="text-align:right">${settings.currency}${s.sgst.toFixed(2)}</td><td style="text-align:right">${settings.currency}${(s.cgst + s.sgst).toFixed(2)}</td></tr>`
      ).join('') : '';

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
body{font-family:Arial,sans-serif;margin:24px;font-size:13px;color:#1a1a1a}
.header{text-align:center;border-bottom:2px solid #5B7567;padding-bottom:12px;margin-bottom:16px}
.invoice-type{font-size:18px;font-weight:bold;color:#5B7567;margin:4px 0}
.shop-name{font-size:22px;font-weight:bold;margin:0}
.shop-meta{color:#555;font-size:12px;margin-top:4px}
.parties{display:flex;justify-content:space-between;margin-bottom:16px;gap:20px}
.party-box{flex:1;background:#f8f8f8;border-radius:8px;padding:10px}
.party-label{font-size:11px;color:#888;font-weight:bold;margin-bottom:4px}
table{width:100%;border-collapse:collapse;margin-bottom:14px}
th{background:#5B7567;color:white;padding:8px 6px;text-align:left;font-size:12px}
td{padding:7px 6px;border-bottom:1px solid #eee;font-size:12px}
.totals-table td{border:none;padding:5px 6px}
.grand-total{font-size:16px;font-weight:bold;color:#5B7567}
.gst-table th{background:#e8f0ec}
.gst-table th,.gst-table td{color:#333}
.footer{text-align:center;margin-top:20px;color:#888;font-size:11px;border-top:1px solid #eee;padding-top:12px}
.badge{display:inline-block;background:#5B7567;color:white;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:bold}
</style></head><body>
<div class="header">
  <div class="invoice-type"><span class="badge">${invoiceType}</span></div>
  <div class="shop-name">${settings.shopName}</div>
  <div class="shop-meta">
    ${settings.address ? settings.address + '<br>' : ''}
    ${settings.phone ? 'Ph: ' + settings.phone : ''}
    ${settings.gstin ? ' &nbsp;|&nbsp; GSTIN: <b>' + settings.gstin + '</b>' : ''}
  </div>
</div>

<div class="parties">
  <div class="party-box">
    <div class="party-label">INVOICE DETAILS</div>
    <div>Date: <b>${formatDate(bill.createdAt)}</b></div>
    <div>Time: ${formatTime(bill.createdAt)}</div>
    <div>Payment: <b>${bill.paymentMode.toUpperCase()}</b></div>
  </div>
  ${bill.customerName || bill.customerGstin ? `<div class="party-box">
    <div class="party-label">BILL TO</div>
    ${bill.customerName ? `<div><b>${bill.customerName}</b></div>` : ''}
    ${bill.customerPhone ? `<div>Ph: ${bill.customerPhone}</div>` : ''}
    ${bill.customerGstin ? `<div>GSTIN: <b>${bill.customerGstin}</b></div>` : ''}
  </div>` : ''}
</div>

<table>
  <thead><tr>
    <th>Item</th><th style="text-align:center">Qty</th>
    <th style="text-align:right">Taxable</th>
    ${isGst ? '<th style="text-align:center">GST%</th><th style="text-align:right">CGST</th><th style="text-align:right">SGST</th>' : ''}
    <th style="text-align:right">Amount</th>
  </tr></thead>
  <tbody>${itemRows}</tbody>
</table>

${isGst ? `<table class="gst-table">
  <thead><tr><th>GST Rate</th><th style="text-align:right">Taxable Value</th><th style="text-align:right">CGST</th><th style="text-align:right">SGST</th><th style="text-align:right">Total Tax</th></tr></thead>
  <tbody>${gstSlabRows}</tbody>
</table>` : ''}

<table class="totals-table" style="width:50%;margin-left:auto">
  ${isGst ? `<tr><td>Taxable Value</td><td style="text-align:right">${settings.currency}${bill.totalTaxableValue.toFixed(2)}</td></tr>
  <tr><td>Total GST</td><td style="text-align:right">${settings.currency}${bill.totalGst.toFixed(2)}</td></tr>` : ''}
  ${bill.discount > 0 ? `<tr><td>Discount</td><td style="text-align:right;color:green">-${settings.currency}${bill.discount.toFixed(2)}</td></tr>` : ''}
  <tr class="grand-total"><td><b>TOTAL</b></td><td style="text-align:right"><b>${settings.currency}${bill.total.toFixed(2)}</b></td></tr>
</table>

${isGst ? `<p style="font-size:11px;color:#555;margin-top:8px">Amount in words: <b>${amountInWords(bill.total)} Only</b></p>` : ''}

<div class="footer">
  ${settings.upiId ? `UPI: ${settings.upiId}<br>` : ''}
  Thank you for your business! &nbsp;·&nbsp; This is a computer-generated invoice.
</div>
</body></html>`;

      const { uri } = await Print.printToFileAsync({ html });
      setPrinting(false); // PDF file ready — stop spinner before native dialog
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share Invoice PDF' });
      } else {
        await Print.printAsync({ html });
      }
    } catch {
      Alert.alert('Error', 'Could not generate PDF');
      setPrinting(false);
    }
  };

  const { translateY: stripTranslate, onListScroll, onBarLayout, listPaddingTop } = useScrollHideBar({});

  if (!dataReady) return <View style={{ flex: 1, backgroundColor: colors.bg }}><SkeletonList count={7} /></View>;

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      {searchOpen && (
        <InlineSearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('customerPhoneProduct')}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* Summary bar */}
    <View style={[s.header, { backgroundColor: colors.surface }]}>  
      <View
        style={s.summaryBar}>
        {[
          { label: 'Bills', value: String(filtered.length), color: colors.text },
          { label: 'Revenue', value: formatCurrency(totalRevenue, settings.currency), color: colors.primary },
          { label: 'Profit', value: formatCurrency(totalProfit, settings.currency), color: colors.success },
        ].map((item, i) => (
          <React.Fragment key={item.label}>
            {i > 0 && <View style={[s.summaryDivider, { backgroundColor: colors.border }]} />}
            <View style={s.summaryItem}>
              <Text style={[s.summaryVal, { color: item.color }]}>{item.value}</Text>
              <Text style={[s.summaryLbl, { color: colors.textMuted }]}>{item.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>

      <View style={{ flex: 1, overflow: 'hidden' }}>
        {/* Active filter strip — slides up/down with scroll */}
        {(filter !== 'today' || payFilter !== 'all' || returnedOnly) && (
          <ScrollHideBar translateY={stripTranslate} bgColor={colors.bg} onLayout={onBarLayout}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
              {filter !== 'today' && (
                <TouchableOpacity style={[s.activeChip, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]} onPress={openFilterSheet}>
                  <Ionicons name="time-outline" size={12} color={colors.primary} />
                  <Text style={[s.activeChipText, { color: colors.primary }]}>
                    {filter === 'week' ? t('thisWeek') : filter === 'month' ? t('thisMonth') : filter === 'all' ? t('allTime') : customFrom || customTo
                      ? [customFrom?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), customTo?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })].filter(Boolean).join(' – ')
                      : t('customRange')}
                  </Text>
                  <Ionicons name="close" size={11} color={colors.primary} onPress={() => { setFilter('today'); setCustomFrom(null); setCustomTo(null); }} />
                </TouchableOpacity>
              )}
              {payFilter !== 'all' && (
                <TouchableOpacity style={[s.activeChip, { backgroundColor: colors.info + '18', borderColor: colors.info + '40' }]} onPress={openFilterSheet}>
                  <Ionicons name={PAY_ICON[payFilter]} size={12} color={colors.info} />
                  <Text style={[s.activeChipText, { color: colors.info }]}>{payFilter.charAt(0).toUpperCase() + payFilter.slice(1)}</Text>
                  <Ionicons name="close" size={11} color={colors.info} onPress={() => setPayFilter('all')} />
                </TouchableOpacity>
              )}
              {returnedOnly && (
                <TouchableOpacity style={[s.activeChip, { backgroundColor: colors.danger + '18', borderColor: colors.danger + '40' }]} onPress={openFilterSheet}>
                  <Ionicons name="arrow-undo-outline" size={12} color={colors.danger} />
                  <Text style={[s.activeChipText, { color: colors.danger }]}>{t('returns')}</Text>
                  <Ionicons name="close" size={11} color={colors.danger} onPress={() => setReturnedOnly(false)} />
                </TouchableOpacity>
              )}
            </ScrollView>
          </ScrollHideBar>
        )}

        {/* Bill list */}
        <FlatList
          data={filtered}
          keyExtractor={b => b.id}
          style={{ flex: 1 }}
          onScroll={onListScroll}
          scrollEventThrottle={16}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          contentContainerStyle={{ paddingHorizontal: 8, paddingTop: filter !== 'today' || payFilter !== 'all' || returnedOnly ? listPaddingTop : 8, paddingBottom: 120, flexGrow: 1 }}
        renderItem={renderBillItem}
          ListEmptyComponent={<EmptyState icon="receipt-outline" title={t('noBillsFound')} subtitle={t('tryDifferentFilter')} />}
        />
      </View>

      {/* ── Filter Sheet ── */}
      <LiquidBottomSheet ref={filterSheetRef}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
          {/* Header */}
          <View style={[s.fsHeader, { borderBottomColor: colors.border }]}>
            <Text style={[s.fsTitle, { color: colors.text }]}>{t('filters')}</Text>
            <TouchableOpacity onPress={() => { setFilter('today'); setPayFilter('all'); setReturnedOnly(false); setCustomFrom(null); setCustomTo(null); }}>
              <Text style={[s.fsReset, { color: colors.danger }]}>{t('resetAll')}</Text>
            </TouchableOpacity>
          </View>

          {/* Period */}
          <Text style={[s.fsSectionLabel, { color: colors.textMuted }]}>PERIOD</Text>
          <View style={s.fsChipRow}>
            {([
              { key: 'today', label: t('today'), icon: 'today-outline' },
              { key: 'week',  label: t('thisWeek'), icon: 'calendar-outline' },
              { key: 'month', label: t('thisMonth'), icon: 'calendar-outline' },
              { key: 'all',   label: t('allTime'), icon: 'infinite-outline' },
              { key: 'custom',label: t('custom'), icon: 'options-outline' },
            ] as { key: Filter; label: string; icon: IoniconsName }[]).map(({ key, label, icon }) => {
              const on = filter === key;
              return (
                <TouchableOpacity key={key}
                  style={[s.fsChip, { backgroundColor: on ? colors.primary : colors.surfaceHigh, borderColor: on ? colors.primary : colors.border }]}
                  onPress={() => setFilter(key)}
                >
                  <Ionicons name={icon} size={14} color={on ? '#fff' : colors.textSub} />
                  <Text style={[s.fsChipText, { color: on ? '#fff' : colors.textSub }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Custom date range — calendar range picker */}
          {filter === 'custom' && (
            <View style={[s.fsDateBox, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
              <TouchableOpacity style={s.fsDateRow} onPress={() => rangePickerRef.current?.open()}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.fsDateLabel, { color: colors.textMuted }]}>{t('dateRange').toUpperCase()}</Text>
                  <Text style={[s.fsDateRowValue, { color: (customFrom || customTo) ? colors.text : colors.textMuted }]}>
                    {customFrom || customTo
                      ? [
                          customFrom?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                          customTo?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                        ].filter(Boolean).join('  →  ')
                      : t('tapToSelectRange')}
                  </Text>
                </View>
                <Ionicons name={(customFrom && customTo) ? 'checkmark-circle' : 'calendar-outline'} size={18} color={(customFrom && customTo) ? colors.success : colors.textMuted} />
              </TouchableOpacity>

              {(customFrom || customTo) && (
                <TouchableOpacity style={s.fsClearDates} onPress={() => { setCustomFrom(null); setCustomTo(null); }}>
                  <Ionicons name="close-circle-outline" size={15} color={colors.danger} />
                  <Text style={[s.fsClearDatesText, { color: colors.danger }]}>{t('clearDates')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Payment mode */}
          <Text style={[s.fsSectionLabel, { color: colors.textMuted }]}>PAYMENT</Text>
          <View style={s.fsChipRow}>
            {([
              { key: 'all',    label: 'All',    icon: 'receipt-outline' as IoniconsName },
              { key: 'cash',   label: 'Cash',   icon: PAY_ICON.cash },
              { key: 'upi',    label: 'UPI',    icon: PAY_ICON.upi },
              { key: 'credit', label: 'Credit', icon: PAY_ICON.credit },
            ] as { key: PayFilter; label: string; icon: IoniconsName }[]).map(({ key, label, icon }) => {
              const on = payFilter === key;
              return (
                <TouchableOpacity key={key}
                  style={[s.fsChip, { backgroundColor: on ? colors.primary : colors.surfaceHigh, borderColor: on ? colors.primary : colors.border }]}
                  onPress={() => setPayFilter(key)}
                >
                  <Ionicons name={icon} size={14} color={on ? '#fff' : colors.textSub} />
                  <Text style={[s.fsChipText, { color: on ? '#fff' : colors.textSub }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Returns */}
          <Text style={[s.fsSectionLabel, { color: colors.textMuted }]}>RETURNS</Text>
          <View style={s.fsChipRow}>
            <TouchableOpacity
              style={[s.fsChip, { backgroundColor: returnedOnly ? colors.primary : colors.surfaceHigh, borderColor: returnedOnly ? colors.primary : colors.border }]}
              onPress={() => setReturnedOnly(v => !v)}
            >
              <Ionicons name="arrow-undo-outline" size={14} color={returnedOnly ? '#fff' : colors.textSub} />
              <Text style={[s.fsChipText, { color: returnedOnly ? '#fff' : colors.textSub }]}>{t('returnedBillsOnly')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LiquidBottomSheet>

      {/* ── Bill Detail Sheet ── */}
      <LiquidBottomSheet
        ref={detailSheetRef}
        onDismiss={() => setSelectedBill(null)}
      >
        <SheetHeader title={t('billDetail')} onClose={closeDetail} />
        <ScrollView contentContainerStyle={s.sheetContent}>
          {selectedBill && (() => {
            const hasReturn = billHasReturn(selectedBill.id);
            const refunded = billTotalRefunded(selectedBill.id);
            return (
              <>
                <View style={[s.billHeader, { borderBottomColor: colors.border }]}>
                  <Text style={[s.billShopName, { color: colors.text }]}>{settings.shopName}</Text>
                  <Text style={[s.billDateTime, { color: colors.textMuted }]}>{formatDate(selectedBill.createdAt)} · {formatTime(selectedBill.createdAt)}</Text>
                  {selectedBill.customerName && <Text style={[s.billCustomerDetail, { color: colors.primary }]}>Customer: {selectedBill.customerName}</Text>}
                </View>

                <View style={s.itemsTable}>
                  <View style={[s.tableHeader, { borderBottomColor: colors.border }]}>
                    <Text style={[s.tableCell, { flex: 3, color: colors.textSub, fontFamily: fonts.bold }]}>{t('item')}</Text>
                    <Text style={[s.tableCell, { flex: 1, textAlign: 'center', color: colors.textSub, fontFamily: fonts.bold }]}>{t('qty')}</Text>
                    <Text style={[s.tableCell, { flex: 2, textAlign: 'right', color: colors.textSub, fontFamily: fonts.bold }]}>Amount</Text>
                  </View>
                  {selectedBill.items.map((item, i) => {
                    const returned = getAlreadyReturned(selectedBill.id, item.productId);
                    return (
                      <View key={i} style={[s.tableRow, { borderBottomColor: colors.border }]}>
                        <View style={{ flex: 3 }}>
                          <Text style={[s.tableCell, { color: colors.text }]} numberOfLines={1}>{item.productName}</Text>
                          {returned > 0 && (
                            <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.warning, marginTop: 2 }}>
                              {returned} {t('returned')}
                            </Text>
                          )}
                        </View>
                        <Text style={[s.tableCell, { flex: 1, textAlign: 'center', color: colors.textMuted }]}>×{item.quantity}</Text>
                        <Text style={[s.tableCell, { flex: 2, textAlign: 'right', fontFamily: fonts.semiBold, color: colors.text }]}>
                          {formatCurrency(item.sellingPrice * item.quantity, settings.currency)}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                <View style={[s.totalsBox, { backgroundColor: colors.surfaceHigh }]}>
                  {/* GST breakdown (shown only when bill has GST data) */}
                  {selectedBill.gstBreakdown?.length > 0 && (
                    <>
                      <View style={s.totalRow}>
                        <Text style={{ fontFamily: fonts.bold, color: colors.text, fontSize: 13 }}>{t('gstBreakdown')}</Text>
                        <Text style={{ fontFamily: fonts.bold, color: colors.text, fontSize: 13 }}>
                          {selectedBill.customerGstin ? `${t('buyer')}: ${selectedBill.customerGstin}` : ''}
                        </Text>
                      </View>
                      <View style={[s.totalRow, { paddingBottom: 2 }]}>
                        <Text style={{ fontFamily: fonts.semiBold, color: colors.textMuted, fontSize: 12, flex: 2 }}>{t('rate')}</Text>
                        <Text style={{ fontFamily: fonts.semiBold, color: colors.textMuted, fontSize: 12, flex: 2, textAlign: 'center' }}>{t('taxable')}</Text>
                        <Text style={{ fontFamily: fonts.semiBold, color: colors.textMuted, fontSize: 12, flex: 1.5, textAlign: 'center' }}>{t('cgst')}</Text>
                        <Text style={{ fontFamily: fonts.semiBold, color: colors.textMuted, fontSize: 12, flex: 1.5, textAlign: 'right' }}>{t('sgst')}</Text>
                      </View>
                      {selectedBill.gstBreakdown.map(slab => (
                        <View key={slab.rate} style={[s.totalRow, { paddingVertical: 4 }]}>
                          <Text style={{ fontFamily: fonts.medium, color: colors.text, fontSize: 12, flex: 2 }}>{slab.rate}%</Text>
                          <Text style={{ fontFamily: fonts.medium, color: colors.text, fontSize: 12, flex: 2, textAlign: 'center' }}>{formatCurrency(slab.taxableValue, settings.currency)}</Text>
                          <Text style={{ fontFamily: fonts.medium, color: colors.text, fontSize: 12, flex: 1.5, textAlign: 'center' }}>{formatCurrency(slab.cgst, settings.currency)}</Text>
                          <Text style={{ fontFamily: fonts.medium, color: colors.text, fontSize: 12, flex: 1.5, textAlign: 'right' }}>{formatCurrency(slab.sgst, settings.currency)}</Text>
                        </View>
                      ))}
                      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
                      <View style={s.totalRow}>
                        <Text style={{ fontFamily: fonts.bold, color: colors.textSub, fontSize: 13 }}>{t('totalGst')}</Text>
                        <Text style={{ fontFamily: fonts.bold, color: colors.textSub, fontSize: 13 }}>{formatCurrency(selectedBill.totalGst, settings.currency)}</Text>
                      </View>
                      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
                    </>
                  )}
                  {[
                    { label: selectedBill.totalGst > 0 ? t('taxable') : t('subtotal'), value: formatCurrency(selectedBill.totalGst > 0 ? selectedBill.totalTaxableValue : selectedBill.subtotal, settings.currency), color: colors.textSub },
                    ...(selectedBill.totalGst > 0 ? [{ label: t('totalGstCgstSgst'), value: formatCurrency(selectedBill.totalGst, settings.currency), color: colors.textSub }] : []),
                    ...(selectedBill.discount > 0 ? [{ label: t('discount'), value: `-${formatCurrency(selectedBill.discount, settings.currency)}`, color: colors.success }] : []),
                    { label: t('total'), value: formatCurrency(selectedBill.total, settings.currency), color: colors.primary, bold: true },
                    { label: t('profit'), value: formatCurrency(selectedBill.profit, settings.currency), color: colors.success },
                    { label: t('paymentMode'), value: selectedBill.paymentMode.toUpperCase(), color: selectedBill.paymentMode === 'credit' ? colors.warning : colors.text },
                    ...(refunded > 0 ? [{ label: t('refunded'), value: formatCurrency(refunded, settings.currency), color: colors.warning }] : []),
                  ].map(row => (
                    <View key={row.label} style={s.totalRow}>
                      <Text style={{ fontFamily: fonts.regular, color: colors.textSub, fontSize: 14 }}>{row.label}</Text>
                      <Text style={{ fontFamily: (row as any).bold ? fonts.extraBold : fonts.semiBold, fontSize: (row as any).bold ? 17 : 14, color: row.color }}>{row.value}</Text>
                    </View>
                  ))}
                </View>

                {/* Action buttons */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                  <LiquidButton title="WhatsApp" onPress={() => shareOnWhatsApp(selectedBill)} tintColor="#25D366" style={{ flex: 1 }} />
                  <LiquidButton title="PDF" icon="doc.text" onPress={() => printBill(selectedBill)} loading={printing} tintColor="#FF5722" style={{ flex: 1 }} />
                </View>

                {/* Return button */}
                {selectedBill.items.every(i => getAlreadyReturned(selectedBill.id, i.productId) >= i.quantity) ? (
                  <View style={[s.returnedBanner, { backgroundColor: colors.warning + '18', borderColor: colors.warning + '40' }]}>
                    <Ionicons name="arrow-undo" size={16} color={colors.warning} />
                    <Text style={[s.returnedBannerText, { color: colors.warning }]}>{t('allItemsReturned')}</Text>
                  </View>
                ) : (
                  <LiquidButton
                    title={hasReturn ? t('returnMoreItems') : t('returnItems')}
                    icon="arrow.uturn.backward"
                    onPress={() => openReturnSheet(selectedBill)}
                    tintColor={colors.warning}
                  />
                )}
              </>
            );
          })()}
        </ScrollView>
      </LiquidBottomSheet>

      {/* ── Return Items Sheet ── */}
      <LiquidBottomSheet
        ref={returnSheetRef}
        onDismiss={() => { setReturnQtys({}); setReturnReason(''); setReturnBill(null); }}
      >
        {returnBill && (
          <SheetHeader
            title={t('returnItems')}
            subtitle={returnBill.items.map(i => i.productName).join(', ')}
            onClose={closeReturnSheet}
          />
        )}
        <ScrollView contentContainerStyle={s.sheetContent} keyboardShouldPersistTaps="handled">
          {returnBill && (
            <>
              {/* Item rows */}
              {returnBill.items.map((item, i) => {
                const alreadyRet = getAlreadyReturned(returnBill.id, item.productId);
                const maxQty = item.quantity - alreadyRet;
                const qty = returnQtys[item.productId] ?? 0;
                const fullyReturned = maxQty <= 0;
                return (
                  <View key={i} style={[s.returnItemRow, { borderBottomColor: colors.border, opacity: fullyReturned ? 0.4 : 1 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.returnItemName, { color: colors.text }]} numberOfLines={1}>{item.productName}</Text>
                      <Text style={[s.returnItemSub, { color: colors.textMuted }]}>
                        Sold ×{item.quantity}{alreadyRet > 0 ? ` · Already returned ×${alreadyRet}` : ''} · {formatCurrency(item.sellingPrice, settings.currency)} each
                      </Text>
                    </View>

                    <View style={s.stepper}>
                      <TouchableOpacity
                        onPress={() => { if (!fullyReturned) setQty(item.productId, Math.max(0, qty - 1)); }}
                        style={[s.stepperBtn, { backgroundColor: qty > 0 ? colors.primary + '20' : colors.surfaceHigh }]}
                        disabled={qty === 0 || fullyReturned}
                        accessibilityLabel="Decrement return quantity"
                        accessibilityRole="button"
                      >
                        <Ionicons name="remove" size={18} color={qty > 0 ? colors.primary : colors.textMuted} />
                      </TouchableOpacity>

                      <Text style={[s.stepperVal, { color: qty > 0 ? colors.primary : colors.textMuted }]}>{qty}</Text>

                      <TouchableOpacity
                        onPress={() => {
                          if (!fullyReturned) {
                            const newQty = qty + 1;
                            setQty(item.productId, Math.min(maxQty, newQty));
                            // Auto-update refund amount
                            const newAuto = returnBill.items.reduce((s, ii) => {
                              const q = ii.productId === item.productId ? newQty : (returnQtys[ii.productId] ?? 0);
                              return s + Math.min(q, ii.quantity - getAlreadyReturned(returnBill.id, ii.productId)) * ii.sellingPrice;
                            }, 0);
                            setReturnRefundAmt(newAuto.toFixed(2));
                          }
                        }}
                        style={[s.stepperBtn, { backgroundColor: qty < maxQty ? colors.primary : colors.surfaceHigh }]}
                        disabled={qty >= maxQty || fullyReturned}
                        accessibilityLabel="Increment return quantity"
                        accessibilityRole="button"
                      >
                        <Ionicons name="add" size={18} color={qty < maxQty ? '#fff' : colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              {/* Refund amount */}
              <View style={{ marginTop: 18 }}>
                <Text style={[s.fieldLabel, { color: colors.textSub }]}>{t('refundAmount')} ({settings.currency})</Text>
                <LiquidTextField
                  value={returnRefundAmt}
                  onChangeText={setReturnRefundAmt}
                  keyboardType="numeric"
                />
              </View>

              {/* Reason */}
              <View style={{ marginBottom: 20 }}>
                <Text style={[s.fieldLabel, { color: colors.textSub }]}>{t('reasonOptional')}</Text>
                <LiquidTextField
                  value={returnReason}
                  onChangeText={setReturnReason}
                  placeholder={t('damagedWrongItem')}
                />
              </View>

              {/* Process button */}
              <LiquidButton
                title={processingReturn ? t('processing') : t('processReturn')}
                icon="arrow.uturn.backward"
                onPress={() => handleProcessReturn(returnBill)}
                loading={processingReturn}
                tintColor={colors.warning}
                height={50}
              />
            </>
          )}
        </ScrollView>
      </LiquidBottomSheet>

      {/* Date range picker for custom filter */}
      <DatePickerSheet
        ref={rangePickerRef}
        mode="range"
        title={t('selectDateRange')}
        onSelectRange={({ from, to }) => { setCustomFrom(from); setCustomTo(to); }}
        calendarProps={{
        enableSwipeMonths: true
        }}
      />
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  container: { flex: 1 },
  // Filter badge — positioned relative to LiquidHeaderIconButton's own
  // fixed-size wrapper, not the header container, so this stays safe.
  filterBadge: { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  filterBadgeText: { fontSize: 10, fontFamily: fonts.extraBold },
  // Active filter strip
  activeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  activeChipText: { fontFamily: fonts.semiBold, fontSize: 12 },
  // Filter sheet
  fsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 20 },
  fsTitle: { fontFamily: fonts.extraBold, fontSize: 18 },
  fsReset: { fontFamily: fonts.semiBold, fontSize: 14 },
  fsSectionLabel: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, marginBottom: 10, marginTop: 4 },
  fsChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  fsChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  fsChipText: { fontFamily: fonts.semiBold, fontSize: 13 },
  fsDateBox: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 20 },
  fsDateRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  fsDateLabel: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.5, marginBottom: 3 },
  fsDateRowValue: { fontFamily: fonts.semiBold, fontSize: 15, marginTop: 2 },
  fsClearDates: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, justifyContent: 'center' },
  fsClearDatesText: { fontFamily: fonts.semiBold, fontSize: 13 },
  header: { flexDirection: 'column', padding: 12, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  summaryBar: { flexDirection: 'row'},
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryVal: { fontFamily: fonts.display, fontSize: 18 },
  summaryLbl: { fontFamily: fonts.medium, fontSize: 12, marginTop: 6 },
  summaryDivider: { width: 1, marginVertical: 8 },

  billCard: { flexDirection: 'row', borderRadius: 10, padding: 14, marginBottom: 8, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, gap: 12 },
  billIconBox: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  billItems: { fontFamily: fonts.bold, fontSize: 15 },
  billMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  billDate: { fontFamily: fonts.medium, fontSize: 12 },
  billCustomerPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, maxWidth: 110 },
  billCustomerText: { fontFamily: fonts.semiBold, fontSize: 11 },
  returnBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  returnBadgeText: { fontFamily: fonts.bold, fontSize: 10 },
  billTotal: { fontFamily: fonts.extraBold, fontSize: 16 },
  payPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  payPillText: { fontFamily: fonts.extraBold, fontSize: 11, letterSpacing: 0.3 },

  sheetContent: { paddingHorizontal: 20, paddingBottom: 24 },
  billHeader: { alignItems: 'center', paddingBottom: 16, borderBottomWidth: 1, marginBottom: 14 },
  billShopName: { fontFamily: fonts.extraBold, fontSize: 18 },
  billDateTime: { fontFamily: fonts.medium, fontSize: 13, marginTop: 6 },
  billCustomerDetail: { fontFamily: fonts.bold, fontSize: 14, marginTop: 6 },
  itemsTable: { marginBottom: 16 },
  tableHeader: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1.5, marginBottom: 6 },
  tableRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 0.5, alignItems: 'center' },
  tableCell: { fontFamily: fonts.medium, fontSize: 13 },
  totalsBox: { borderRadius: 14, padding: 16, marginBottom: 18 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
  returnedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 14, borderWidth: 1 },
  returnedBannerText: { fontFamily: fonts.bold, fontSize: 14 },

  // Return sheet
  returnItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  returnItemName: { fontFamily: fonts.semiBold, fontSize: 14 },
  returnItemSub: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepperBtn: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  stepperVal: { fontFamily: fonts.extraBold, fontSize: 18, minWidth: 28, textAlign: 'center' },
  fieldLabel: { fontFamily: fonts.bold, fontSize: 13, marginBottom: 8 },
  input: { borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 1, marginBottom: 14, fontFamily: fonts.regular },
  processBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, borderRadius: 14 },
  processBtnText: { color: '#fff', fontFamily: fonts.bold, fontSize: 15 },
});
