import React, { useState, useMemo, useRef, useCallback } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Linking, Alert, ScrollView, TextInput } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import BottomSheet, { BottomSheetScrollView, BottomSheetTextInput, BottomSheetBackdrop } from '@gorhom/bottom-sheet'; // BottomSheetTextInput used in return sheet
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useAppStore } from '../../stores/useAppStore';
import { formatCurrency, formatDate, formatTime, generateBillText, startOfDay, startOfWeek, startOfMonth } from '../../utils/helpers';
import { Bill, ReturnItem } from '../../types';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';
import EmptyState from '../../components/common/EmptyState';
import FadeSlideIn from '../../components/common/FadeSlideIn';
import DatePickerSheet, { DatePickerSheetRef } from '../../components/common/DatePickerSheet';

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

export default function BillHistoryScreen() {
  const { colors } = useAppTheme();
  const { bills, returns, settings, processReturn } = useAppStore();
  const [filter, setFilter] = useState<Filter>('today');
  const [payFilter, setPayFilter] = useState<PayFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
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

  const detailSheetRef = useRef<BottomSheet>(null);
  const returnSheetRef = useRef<BottomSheet>(null);
  const filterSheetRef = useRef<BottomSheet>(null);
  const detailSnapPoints  = useMemo(() => ['88%'], []);
  const returnSnapPoints  = useMemo(() => ['88%'], []);
  const filterSnapPoints  = useMemo(() => ['80%'], []);

  const openFilterSheet = useCallback(() => filterSheetRef.current?.snapToIndex(0), []);

  // Count of non-default active filters (for the badge)
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filter !== 'today') n++;
    if (payFilter !== 'all') n++;
    return n;
  }, [filter, payFilter]);

  const openDetail = useCallback((bill: Bill) => {
    setSelectedBill(bill);
    detailSheetRef.current?.expand();
  }, []);
  const closeDetail = useCallback(() => detailSheetRef.current?.close(), []);

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

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} pressBehavior="close" />
    ), []
  );

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

    return bills
      .filter(b => b.createdAt >= start && (customEndMs === null || b.createdAt <= customEndMs))
      .filter(b => payFilter === 'all' || b.paymentMode === payFilter)
      .filter(b => {
        if (!q) return true;
        return (
          b.customerName?.toLowerCase().includes(q) ||
          b.customerPhone?.includes(q) ||
          b.items.some(i => i.productName.toLowerCase().includes(q))
        );
      });
  }, [bills, filter, payFilter, searchQuery, customFrom, customTo]);

  const totalRevenue = filtered.reduce((s, b) => s + b.total, 0);
  const totalProfit = filtered.reduce((s, b) => s + b.profit, 0);

  // Helpers — how much has already been returned for a given bill item
  const getAlreadyReturned = (billId: string, productId: string) =>
    returns
      .filter(r => r.billId === billId)
      .flatMap(r => r.items)
      .filter(ri => ri.productId === productId)
      .reduce((s, ri) => s + ri.quantity, 0);

  const billHasReturn = (billId: string) => returns.some(r => r.billId === billId);

  const billTotalRefunded = (billId: string) =>
    returns.filter(r => r.billId === billId).reduce((s, r) => s + r.refundAmount, 0);

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
      }));

    if (items.length === 0) {
      Alert.alert('No items selected', 'Select at least one item to return.');
      return;
    }

    const refund = parseFloat(returnRefundAmt) || 0;

    Alert.alert(
      'Confirm Return',
      `Return ${items.length} item type${items.length > 1 ? 's' : ''}${refund > 0 ? ` · Refund ${settings.currency}${refund.toFixed(2)}` : ''}?\n\nReturned stock will be added back to inventory.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Process Return',
          style: 'destructive',
          onPress: async () => {
            setProcessingReturn(true);
            try {
              await processReturn(bill.id, items, refund, returnReason);
              closeReturnSheet();
              Alert.alert('Return processed', 'Stock has been restocked.');
            } catch {
              Alert.alert('Error', 'Could not process return.');
            } finally {
              setProcessingReturn(false);
            }
          },
        },
      ]
    );
  };

  const shareOnWhatsApp = (bill: Bill) => {
    const msg = generateBillText(bill, settings.shopName, settings.currency);
    const encoded = encodeURIComponent(msg);
    const digits = bill.customerPhone?.replace(/\D/g, '') ?? '';
    const url = digits
      ? `whatsapp://send?phone=${digits.length === 10 ? '91' + digits : digits}&text=${encoded}`
      : `whatsapp://send?text=${encoded}`;
    Linking.openURL(url).catch(() =>
      Alert.alert('WhatsApp not found', 'Please install WhatsApp to share bills.')
    );
  };

  const printBill = async (bill: Bill) => {
    setPrinting(true);
    try {
      const isGst = bill.gstBreakdown?.length > 0;
      const invoiceType = settings.gstRegistered ? (isGst ? 'TAX INVOICE' : 'BILL OF SUPPLY') : 'INVOICE';

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

  const s = makeStyles(colors);

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>

      {/* Summary bar */}
      <MotiView from={{ opacity: 0, translateY: -6 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300 }}
        style={[s.summaryBar, { backgroundColor: colors.surface }]}>
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
      </MotiView>

      {/* Search + Filter button */}
      <View style={[s.topRow]}>
        <View style={[s.searchBox, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={[s.searchInput, { color: colors.text }]}
            placeholder="Customer, phone, product…"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[s.filterBtn, { backgroundColor: activeFilterCount > 0 ? colors.primary : colors.surfaceHigh, borderColor: activeFilterCount > 0 ? colors.primary : colors.border }]}
          onPress={openFilterSheet}
        >
          <Ionicons name="options-outline" size={18} color={activeFilterCount > 0 ? '#fff' : colors.textSub} />
          {activeFilterCount > 0 && (
            <View style={[s.filterBadge, { backgroundColor: '#fff' }]}>
              <Text style={[s.filterBadgeText, { color: colors.primary }]}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Active filter summary strip */}
      {(filter !== 'today' || payFilter !== 'all') && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 7, gap: 8 }}>
          {filter !== 'today' && (
            <TouchableOpacity style={[s.activeChip, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]} onPress={openFilterSheet}>
              <Ionicons name="time-outline" size={12} color={colors.primary} />
              <Text style={[s.activeChipText, { color: colors.primary }]}>
                {filter === 'week' ? 'This Week' : filter === 'month' ? 'This Month' : filter === 'all' ? 'All Time' : customFrom || customTo
                  ? [customFrom?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), customTo?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })].filter(Boolean).join(' – ')
                  : 'Custom Range'}
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
        </ScrollView>
      )}


      {/* Bill list */}
      <FlatList
        data={filtered}
        keyExtractor={b => b.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 0, paddingBottom: 120, flexGrow: 1 }}
        renderItem={({ item: bill, index }) => {
          const modeColor = bill.paymentMode === 'cash' ? colors.success : bill.paymentMode === 'upi' ? colors.info : colors.warning;
          const hasReturn = billHasReturn(bill.id);
          const refunded = billTotalRefunded(bill.id);
          return (
            <FadeSlideIn index={index}>
              <TouchableOpacity style={[s.billCard, { backgroundColor: colors.surface }]} onPress={() => openDetail(bill)} activeOpacity={0.7}>
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
                          {refunded > 0 ? `${formatCurrency(refunded, settings.currency)}` : 'Returned'}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={[s.billTotal, { color: colors.text }]}>{formatCurrency(bill.total, settings.currency)}</Text>
                  <View style={[s.payPill, { backgroundColor: modeColor + '1A' }]}>
                    <Text style={[s.payPillText, { color: modeColor }]}>{bill.paymentMode.toUpperCase()}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </FadeSlideIn>
          );
        }}
        ListEmptyComponent={<EmptyState icon="receipt-outline" title="No bills found" subtitle="Try a different time period or filter" />}
      />

      {/* ── Filter Sheet ── */}
      <BottomSheet
        ref={filterSheetRef}
        index={-1}
        snapPoints={filterSnapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.primary, width: 40 }}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}>
          {/* Header */}
          <View style={[s.fsHeader, { borderBottomColor: colors.border }]}>
            <Text style={[s.fsTitle, { color: colors.text }]}>Filters</Text>
            <TouchableOpacity onPress={() => { setFilter('today'); setPayFilter('all'); setCustomFrom(null); setCustomTo(null); }}>
              <Text style={[s.fsReset, { color: colors.danger }]}>Reset all</Text>
            </TouchableOpacity>
          </View>

          {/* Period */}
          <Text style={[s.fsSectionLabel, { color: colors.textMuted }]}>PERIOD</Text>
          <View style={s.fsChipRow}>
            {([
              { key: 'today', label: 'Today', icon: 'today-outline' },
              { key: 'week',  label: 'This Week', icon: 'calendar-outline' },
              { key: 'month', label: 'This Month', icon: 'calendar-outline' },
              { key: 'all',   label: 'All Time', icon: 'infinite-outline' },
              { key: 'custom',label: 'Custom', icon: 'options-outline' },
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
        </BottomSheetScrollView>
      </BottomSheet>

      {/* ── Bill Detail Sheet ── */}
      <BottomSheet
        ref={detailSheetRef}
        index={-1}
        snapPoints={detailSnapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.primary, width: 40 }}
        onClose={() => setSelectedBill(null)}
      >
        <BottomSheetScrollView contentContainerStyle={s.sheetContent}>
          {selectedBill && (() => {
            const hasReturn = billHasReturn(selectedBill.id);
            const refunded = billTotalRefunded(selectedBill.id);
            return (
              <>
                <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
                  <Text style={[s.modalTitle, { color: colors.text }]}>Bill Detail</Text>
                  <TouchableOpacity onPress={closeDetail}>
                    <Ionicons name="close" size={22} color={colors.textSub} />
                  </TouchableOpacity>
                </View>

                <View style={[s.billHeader, { borderBottomColor: colors.border }]}>
                  <Text style={[s.billShopName, { color: colors.text }]}>{settings.shopName}</Text>
                  <Text style={[s.billDateTime, { color: colors.textMuted }]}>{formatDate(selectedBill.createdAt)} · {formatTime(selectedBill.createdAt)}</Text>
                  {selectedBill.customerName && <Text style={[s.billCustomerDetail, { color: colors.primary }]}>Customer: {selectedBill.customerName}</Text>}
                </View>

                <View style={s.itemsTable}>
                  <View style={[s.tableHeader, { borderBottomColor: colors.border }]}>
                    <Text style={[s.tableCell, { flex: 3, color: colors.textSub, fontFamily: fonts.bold }]}>Item</Text>
                    <Text style={[s.tableCell, { flex: 1, textAlign: 'center', color: colors.textSub, fontFamily: fonts.bold }]}>Qty</Text>
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
                              {returned} returned
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
                        <Text style={{ fontFamily: fonts.bold, color: colors.text, fontSize: 13 }}>GST Breakdown</Text>
                        <Text style={{ fontFamily: fonts.bold, color: colors.text, fontSize: 13 }}>
                          {selectedBill.customerGstin ? `Buyer: ${selectedBill.customerGstin}` : ''}
                        </Text>
                      </View>
                      <View style={[s.totalRow, { paddingBottom: 2 }]}>
                        <Text style={{ fontFamily: fonts.semiBold, color: colors.textMuted, fontSize: 12, flex: 2 }}>Rate</Text>
                        <Text style={{ fontFamily: fonts.semiBold, color: colors.textMuted, fontSize: 12, flex: 2, textAlign: 'center' }}>Taxable</Text>
                        <Text style={{ fontFamily: fonts.semiBold, color: colors.textMuted, fontSize: 12, flex: 1.5, textAlign: 'center' }}>CGST</Text>
                        <Text style={{ fontFamily: fonts.semiBold, color: colors.textMuted, fontSize: 12, flex: 1.5, textAlign: 'right' }}>SGST</Text>
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
                        <Text style={{ fontFamily: fonts.bold, color: colors.textSub, fontSize: 13 }}>Total GST</Text>
                        <Text style={{ fontFamily: fonts.bold, color: colors.textSub, fontSize: 13 }}>{formatCurrency(selectedBill.totalGst, settings.currency)}</Text>
                      </View>
                      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
                    </>
                  )}
                  {[
                    { label: selectedBill.totalGst > 0 ? 'Taxable Value' : 'Subtotal', value: formatCurrency(selectedBill.totalGst > 0 ? selectedBill.totalTaxableValue : selectedBill.subtotal, settings.currency), color: colors.textSub },
                    ...(selectedBill.totalGst > 0 ? [{ label: 'Total GST (CGST+SGST)', value: formatCurrency(selectedBill.totalGst, settings.currency), color: colors.textSub }] : []),
                    ...(selectedBill.discount > 0 ? [{ label: 'Discount', value: `-${formatCurrency(selectedBill.discount, settings.currency)}`, color: colors.success }] : []),
                    { label: 'Total', value: formatCurrency(selectedBill.total, settings.currency), color: colors.primary, bold: true },
                    { label: 'Profit', value: formatCurrency(selectedBill.profit, settings.currency), color: colors.success },
                    { label: 'Payment', value: selectedBill.paymentMode.toUpperCase(), color: selectedBill.paymentMode === 'credit' ? colors.warning : colors.text },
                    ...(refunded > 0 ? [{ label: 'Refunded', value: formatCurrency(refunded, settings.currency), color: colors.warning }] : []),
                  ].map(row => (
                    <View key={row.label} style={s.totalRow}>
                      <Text style={{ fontFamily: fonts.regular, color: colors.textSub, fontSize: 14 }}>{row.label}</Text>
                      <Text style={{ fontFamily: (row as any).bold ? fonts.extraBold : fonts.semiBold, fontSize: (row as any).bold ? 17 : 14, color: row.color }}>{row.value}</Text>
                    </View>
                  ))}
                </View>

                {/* Action buttons */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                  <TouchableOpacity style={[s.shareBtn, { backgroundColor: '#25D366' }]} onPress={() => shareOnWhatsApp(selectedBill)}>
                    <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                    <Text style={s.shareBtnText}>WhatsApp</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.shareBtn, { backgroundColor: '#FF5722' }]} onPress={() => printBill(selectedBill)} disabled={printing}>
                    {printing ? <ActivityIndicator color="#fff" size="small" /> : (
                      <>
                        <Ionicons name="document-outline" size={18} color="#fff" />
                        <Text style={s.shareBtnText}>PDF</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Return button */}
                {selectedBill.items.every(i => getAlreadyReturned(selectedBill.id, i.productId) >= i.quantity) ? (
                  <View style={[s.returnedBanner, { backgroundColor: colors.warning + '18', borderColor: colors.warning + '40' }]}>
                    <Ionicons name="arrow-undo" size={16} color={colors.warning} />
                    <Text style={[s.returnedBannerText, { color: colors.warning }]}>All items fully returned</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[s.returnBtn, { backgroundColor: colors.warning + '18', borderColor: colors.warning + '40' }]}
                    onPress={() => openReturnSheet(selectedBill)}
                  >
                    <Ionicons name="arrow-undo-outline" size={18} color={colors.warning} />
                    <Text style={[s.returnBtnText, { color: colors.warning }]}>
                      {hasReturn ? 'Return More Items' : 'Return Items'}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            );
          })()}
        </BottomSheetScrollView>
      </BottomSheet>

      {/* ── Return Items Sheet ── */}
      <BottomSheet
        ref={returnSheetRef}
        index={-1}
        snapPoints={returnSnapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.warning, width: 40 }}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        onClose={() => { setReturnQtys({}); setReturnReason(''); setReturnBill(null); }}
      >
        <BottomSheetScrollView contentContainerStyle={s.sheetContent} keyboardShouldPersistTaps="handled">
          {returnBill && (
            <>
              <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
                <View>
                  <Text style={[s.modalTitle, { color: colors.text }]}>Return Items</Text>
                  <Text style={[s.returnSheetSub, { color: colors.textMuted }]}>{returnBill.items.map(i => i.productName).join(', ')}</Text>
                </View>
                <TouchableOpacity onPress={closeReturnSheet}>
                  <Ionicons name="close" size={22} color={colors.textSub} />
                </TouchableOpacity>
              </View>

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
                      >
                        <Ionicons name="add" size={18} color={qty < maxQty ? '#fff' : colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              {/* Refund amount */}
              <View style={{ marginTop: 18 }}>
                <Text style={[s.fieldLabel, { color: colors.textSub }]}>Refund Amount ({settings.currency})</Text>
                <BottomSheetTextInput
                  style={[s.input, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
                  value={returnRefundAmt}
                  onChangeText={setReturnRefundAmt}
                  keyboardType="numeric"
                  selectTextOnFocus
                />
              </View>

              {/* Reason */}
              <View style={{ marginBottom: 20 }}>
                <Text style={[s.fieldLabel, { color: colors.textSub }]}>Reason (optional)</Text>
                <BottomSheetTextInput
                  style={[s.input, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
                  value={returnReason}
                  onChangeText={setReturnReason}
                  placeholder="Damaged, wrong item, etc."
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              {/* Process button */}
              <TouchableOpacity
                style={[s.processBtn, { backgroundColor: colors.warning, opacity: processingReturn ? 0.7 : 1 }]}
                onPress={() => handleProcessReturn(returnBill)}
                disabled={processingReturn}
              >
                {processingReturn
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Ionicons name="arrow-undo" size={18} color="#fff" />}
                <Text style={s.processBtnText}>
                  {processingReturn ? 'Processing…' : 'Process Return'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Date range picker for custom filter */}
      <DatePickerSheet
        ref={rangePickerRef}
        mode="range"
        title="Select Date Range"
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
  // Search + filter row
  topRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 8, paddingVertical: 8, alignItems: 'center' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 14, padding: 0 },
  filterBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  filterBadge: { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  filterBadgeText: { fontSize: 10, fontFamily: fonts.extraBold },
  // Active filter strip
  activeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  activeChipText: { fontFamily: fonts.semiBold, fontSize: 12 },
  // Filter sheet
  fsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 20 },
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
  summaryBar: { flexDirection: 'row', paddingHorizontal: 18, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border },
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

  sheetContent: { paddingHorizontal: 20, paddingBottom: 120 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, paddingBottom: 14, borderBottomWidth: 0.5 },
  modalTitle: { fontFamily: fonts.extraBold, fontSize: 18 },
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
  shareBtn: { flex: 1, flexDirection: 'row', borderRadius: 14, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 8 },
  shareBtnText: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },
  returnBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 14, borderWidth: 1 },
  returnBtnText: { fontFamily: fonts.bold, fontSize: 15 },
  returnedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 14, borderWidth: 1 },
  returnedBannerText: { fontFamily: fonts.bold, fontSize: 14 },

  // Return sheet
  returnSheetSub: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2, maxWidth: 240 },
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
