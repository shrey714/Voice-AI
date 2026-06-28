import React, { useMemo, useState } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useAppStore } from '../stores/useAppStore';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import { useTranslation } from '../hooks/useTranslation';
import { formatCurrency, formatDate, startOfDay, endOfDay, startOfWeek, startOfMonth } from '../utils/helpers';
import { Bill, Expense, Product } from '../types';

// ─── Period helpers ─────────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month' | 'lastMonth';
type ReportType = 'pl' | 'gst' | 'inventory';

function getPeriodRange(period: Period): { start: number; end: number; label: string } {
  const now = new Date();
  if (period === 'today') {
    return { start: startOfDay(), end: endOfDay(), label: 'Today · ' + formatDate(Date.now()) };
  }
  if (period === 'week') {
    return { start: startOfWeek(), end: endOfDay(), label: 'This Week' };
  }
  if (period === 'month') {
    return { start: startOfMonth(), end: endOfDay(), label: now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) };
  }
  // lastMonth
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
  const end   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return {
    start: start.getTime(),
    end: end.getTime(),
    label: start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
  };
}

// ─── Data computation ────────────────────────────────────────────────────────

function computePL(bills: Bill[], expenses: Expense[], start: number, end: number) {
  const pb = bills.filter(b => b.createdAt >= start && b.createdAt <= end);
  const pe = expenses.filter(e => e.createdAt >= start && e.createdAt <= end);
  const revenue      = pb.reduce((s, b) => s + b.total, 0);
  const grossProfit  = pb.reduce((s, b) => s + b.profit, 0);
  const cogs         = revenue - grossProfit;
  const totalExp     = pe.reduce((s, e) => s + e.amount, 0);
  const netProfit    = grossProfit - totalExp;
  return {
    revenue, cogs, grossProfit, totalExp, netProfit,
    billCount: pb.length,
    grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    netMargin:   revenue > 0 ? (netProfit   / revenue) * 100 : 0,
    bills: pb, expenses: pe,
  };
}

function computeGST(bills: Bill[], start: number, end: number) {
  const pb = bills.filter(b => b.createdAt >= start && b.createdAt <= end);
  const map: Record<number, { taxable: number; cgst: number; sgst: number }> = {};
  for (const bill of pb) {
    for (const slab of bill.gstBreakdown) {
      if (!map[slab.rate]) map[slab.rate] = { taxable: 0, cgst: 0, sgst: 0 };
      map[slab.rate].taxable += slab.taxableValue;
      map[slab.rate].cgst   += slab.cgst;
      map[slab.rate].sgst   += slab.sgst;
    }
  }
  const rows = Object.entries(map).map(([r, d]) => ({ rate: Number(r), ...d, total: d.cgst + d.sgst })).sort((a, b) => a.rate - b.rate);
  return {
    rows,
    totalTaxable: rows.reduce((s, r) => s + r.taxable, 0),
    totalCgst:    rows.reduce((s, r) => s + r.cgst,    0),
    totalSgst:    rows.reduce((s, r) => s + r.sgst,    0),
    totalGst:     rows.reduce((s, r) => s + r.total,   0),
    billCount: pb.length,
  };
}

function computeInventory(products: Product[]) {
  const rows = [...products]
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    .map(p => ({
      name: p.name, category: p.category, qty: p.quantity, unit: p.unit,
      costPrice: p.costPrice, sellingPrice: p.sellingPrice,
      stockValue: p.quantity * p.costPrice,
    }));
  return {
    rows,
    totalValue:    rows.reduce((s, r) => s + r.stockValue, 0),
    totalQty:      rows.reduce((s, r) => s + r.qty,       0),
    productCount:  rows.length,
  };
}

// ─── HTML generators ─────────────────────────────────────────────────────────

const SAGE = '#5B7567';

function htmlHead(shopName: string, address: string, gstin: string, gstRegistered: boolean, title: string, period: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;color:#222;padding:28px;font-size:13px}
    .hdr{border-bottom:3px solid ${SAGE};padding-bottom:12px;margin-bottom:20px}
    .shop{font-size:20px;font-weight:bold;color:${SAGE}}
    .meta{font-size:11px;color:#666;margin-top:3px}
    .title{font-size:17px;font-weight:bold;margin:14px 0 2px}
    .period{font-size:11px;color:#888;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;margin-bottom:20px}
    th{background:${SAGE};color:#fff;padding:9px 12px;text-align:left;font-size:12px}
    td{padding:9px 12px;border-bottom:1px solid #eee;font-size:12px}
    .tr{font-weight:bold;background:#f0f4f2}
    .r{text-align:right} .g{color:#2e7d32} .rd{color:#c62828}
    .footer{margin-top:20px;font-size:10px;color:#bbb;text-align:center}
  </style></head><body>
  <div class="hdr">
    <div class="shop">${shopName}</div>
    ${address ? `<div class="meta">${address}</div>` : ''}
    ${gstRegistered && gstin ? `<div class="meta">GSTIN: ${gstin}</div>` : ''}
  </div>
  <div class="title">${title}</div>
  <div class="period">${period}</div>`;
}

function htmlFoot() {
  const ts = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `<div class="footer">Generated by Shopkeeper · ${ts}</div></body></html>`;
}

function generatePLHtml(d: ReturnType<typeof computePL>, settings: any, period: string, cur: string) {
  const c = (n: number) => `${cur}${n.toFixed(2)}`;
  const expRows = d.expenses.map(e => `<tr><td>${e.category}</td><td>${e.title}</td><td class="r">${c(e.amount)}</td></tr>`).join('');
  return htmlHead(settings.shopName, settings.address, settings.gstin, settings.gstRegistered, 'Profit & Loss Statement', period)
    + `<table>
    <tr><th>Particulars</th><th class="r">Amount</th></tr>
    <tr><td>Revenue (${d.billCount} bills)</td><td class="r">${c(d.revenue)}</td></tr>
    <tr><td>Cost of Goods Sold</td><td class="r">${c(d.cogs)}</td></tr>
    <tr class="tr"><td>Gross Profit (${d.grossMargin.toFixed(1)}%)</td><td class="r ${d.grossProfit >= 0 ? 'g' : 'rd'}">${c(d.grossProfit)}</td></tr>
    <tr><td>Total Expenses</td><td class="r">${c(d.totalExp)}</td></tr>
    <tr class="tr"><td>Net Profit (${d.netMargin.toFixed(1)}%)</td><td class="r ${d.netProfit >= 0 ? 'g' : 'rd'}">${c(d.netProfit)}</td></tr>
  </table>`
    + (expRows ? `<div style="font-size:14px;font-weight:bold;margin-bottom:10px">Expense Breakdown</div><table><tr><th>Category</th><th>Description</th><th class="r">Amount</th></tr>${expRows}</table>` : '')
    + htmlFoot();
}

function generateGSTHtml(d: ReturnType<typeof computeGST>, settings: any, period: string, cur: string) {
  const c = (n: number) => `${cur}${n.toFixed(2)}`;
  const rows = d.rows.map(r =>
    `<tr><td>${r.rate}%</td><td class="r">${c(r.taxable)}</td><td class="r">${c(r.cgst)}</td><td class="r">${c(r.sgst)}</td><td class="r"><b>${c(r.total)}</b></td></tr>`
  ).join('');
  return htmlHead(settings.shopName, settings.address, settings.gstin, settings.gstRegistered, 'GST Summary', period)
    + `<table>
    <tr><th>GST Rate</th><th class="r">Taxable Value</th><th class="r">CGST</th><th class="r">SGST</th><th class="r">Total GST</th></tr>
    ${rows}
    <tr class="tr"><td>Total (${d.billCount} bills)</td><td class="r">${c(d.totalTaxable)}</td><td class="r">${c(d.totalCgst)}</td><td class="r">${c(d.totalSgst)}</td><td class="r g">${c(d.totalGst)}</td></tr>
  </table>` + htmlFoot();
}

function generateInventoryHtml(d: ReturnType<typeof computeInventory>, settings: any, cur: string) {
  const c = (n: number) => `${cur}${n.toFixed(2)}`;
  const rows = d.rows.map(r =>
    `<tr><td>${r.category}</td><td>${r.name}</td><td class="r">${r.qty} ${r.unit}</td><td class="r">${c(r.costPrice)}</td><td class="r">${c(r.sellingPrice)}</td><td class="r"><b>${c(r.stockValue)}</b></td></tr>`
  ).join('');
  return htmlHead(settings.shopName, settings.address, settings.gstin, settings.gstRegistered, 'Inventory Valuation', 'Current Stock Snapshot')
    + `<table>
    <tr><th>Category</th><th>Product</th><th class="r">Qty</th><th class="r">Cost Price</th><th class="r">Selling Price</th><th class="r">Stock Value</th></tr>
    ${rows}
    <tr class="tr"><td colspan="2">Total (${d.productCount} products)</td><td class="r">${d.totalQty}</td><td></td><td></td><td class="r g">${c(d.totalValue)}</td></tr>
  </table>` + htmlFoot();
}

// ─── CSV generators ───────────────────────────────────────────────────────────

function row(...cells: (string | number)[]) {
  return cells.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',') + '\n';
}

function generatePLCsv(d: ReturnType<typeof computePL>, period: string, cur: string) {
  const c = (n: number) => `${cur}${n.toFixed(2)}`;
  let csv = row('Profit & Loss Statement', period);
  csv += row('Particulars', 'Amount');
  csv += row(`Revenue (${d.billCount} bills)`, c(d.revenue));
  csv += row('Cost of Goods Sold', c(d.cogs));
  csv += row(`Gross Profit (${d.grossMargin.toFixed(1)}%)`, c(d.grossProfit));
  csv += row('Total Expenses', c(d.totalExp));
  csv += row(`Net Profit (${d.netMargin.toFixed(1)}%)`, c(d.netProfit));
  if (d.expenses.length > 0) {
    csv += '\n' + row('Expense Breakdown', '', '');
    csv += row('Category', 'Description', 'Amount');
    for (const e of d.expenses) csv += row(e.category, e.title, c(e.amount));
  }
  return csv;
}

function generateGSTCsv(d: ReturnType<typeof computeGST>, period: string, cur: string) {
  const c = (n: number) => `${cur}${n.toFixed(2)}`;
  let csv = row('GST Summary', period);
  csv += row('GST Rate', 'Taxable Value', 'CGST', 'SGST', 'Total GST');
  for (const r of d.rows) csv += row(`${r.rate}%`, c(r.taxable), c(r.cgst), c(r.sgst), c(r.total));
  csv += row('Total', c(d.totalTaxable), c(d.totalCgst), c(d.totalSgst), c(d.totalGst));
  return csv;
}

function generateInventoryCsv(d: ReturnType<typeof computeInventory>, cur: string) {
  const c = (n: number) => `${cur}${n.toFixed(2)}`;
  let csv = row('Inventory Valuation', 'Current Stock Snapshot');
  csv += row('Category', 'Product', 'Qty', 'Unit', 'Cost Price', 'Selling Price', 'Stock Value');
  for (const r of d.rows) csv += row(r.category, r.name, r.qty, r.unit, c(r.costPrice), c(r.sellingPrice), c(r.stockValue));
  csv += row('TOTAL', '', d.totalQty, '', '', '', c(d.totalValue));
  return csv;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today',     label: '' },
  { key: 'week',      label: '' },
  { key: 'month',     label: '' },
  { key: 'lastMonth', label: '' },
];

const REPORT_TYPES: { key: ReportType; label: string; icon: any }[] = [
  { key: 'pl',        label: 'P&L',        icon: 'trending-up-outline' },
  { key: 'gst',       label: 'GST',         icon: 'receipt-outline' },
  { key: 'inventory', label: 'Inventory',   icon: 'cube-outline' },
];

export default function ExportsScreen() {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const { bills, expenses, products, settings } = useAppStore();
  const [period, setPeriod] = useState<Period>('month');
  const [report, setReport] = useState<ReportType>('pl');
  const [exporting, setExporting] = useState(false);

  const cur = settings.currency;
  const { start, end, label: periodLabel } = useMemo(() => getPeriodRange(period), [period]);

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'today',     label: t('today') },
    { key: 'week',      label: t('thisWeek') },
    { key: 'month',     label: t('thisMonth') },
    { key: 'lastMonth', label: t('lastMonth') },
  ];

  const REPORT_TYPES: { key: ReportType; label: string; icon: any }[] = [
    { key: 'pl',        label: t('profitLoss'), icon: 'trending-up-outline' },
    { key: 'gst',       label: t('gstReport'),  icon: 'receipt-outline' },
    { key: 'inventory', label: t('inventoryReport'), icon: 'cube-outline' },
  ];
  const plData        = useMemo(() => computePL(bills, expenses, start, end), [bills, expenses, start, end]);
  const gstData       = useMemo(() => computeGST(bills, start, end),          [bills, start, end]);
  const inventoryData = useMemo(() => computeInventory(products),              [products]);

  const exportPDF = async () => {
    setExporting(true);
    try {
      let html: string;
      let filename: string;
      const slug = periodLabel.replace(/[^a-zA-Z0-9]/g, '_');
      if (report === 'pl') {
        html = generatePLHtml(plData, settings, periodLabel, cur);
        filename = `PL_${slug}.pdf`;
      } else if (report === 'gst') {
        html = generateGSTHtml(gstData, settings, periodLabel, cur);
        filename = `GST_${slug}.pdf`;
      } else {
        html = generateInventoryHtml(inventoryData, settings, cur);
        filename = `Inventory_${new Date().toISOString().slice(0, 10)}.pdf`;
      }
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Share ${filename}` });
    } catch (e) {
      Alert.alert(t('exportFailed'), t('couldNotGeneratePdf'));
    } finally {
      setExporting(false);
    }
  };

  const exportCSV = async () => {
    setExporting(true);
    try {
      let csv: string;
      let filename: string;
      const slug = periodLabel.replace(/[^a-zA-Z0-9]/g, '_');
      if (report === 'pl') {
        csv = generatePLCsv(plData, periodLabel, cur);
        filename = `PL_${slug}.csv`;
      } else if (report === 'gst') {
        csv = generateGSTCsv(gstData, periodLabel, cur);
        filename = `GST_${slug}.csv`;
      } else {
        csv = generateInventoryCsv(inventoryData, cur);
        filename = `Inventory_${new Date().toISOString().slice(0, 10)}.csv`;
      }
      const path = FileSystem.cacheDirectory + filename;
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(path, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: `Share ${filename}` });
    } catch (e) {
      Alert.alert(t('exportFailed'), t('couldNotGenerateCsv'));
    } finally {
      setExporting(false);
    }
  };

  const s = makeStyles(colors);

  return (
    <View style={[{ backgroundColor: colors.bg, flex: 1 }]}>

      {/* Report type tabs */}
      <View style={[s.searchRow, {backgroundColor: colors.surface}]}>
        <View style={[s.tabRow, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
          {REPORT_TYPES.map(rt => (
            <TouchableOpacity
              key={rt.key}
              style={[s.tabBtn, report === rt.key && { backgroundColor: colors.primary }]}
              onPress={() => setReport(rt.key)}
            >
              <Ionicons name={rt.icon} size={15} color={report === rt.key ? '#fff' : colors.textMuted} />
              <Text style={[s.tabBtnText, { color: report === rt.key ? '#fff' : colors.textSub }]}>{rt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Period chips */}
      {report !== 'inventory' && (
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.textSub }]}>{t('period').toUpperCase()}</Text>
          <View style={s.chipRow}>
            {PERIODS.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[s.chip, { borderColor: period === p.key ? colors.primary : colors.border, backgroundColor: period === p.key ? colors.primary : colors.surface }]}
                onPress={() => setPeriod(p.key)}
              >
                <Text style={[s.chipText, { color: period === p.key ? '#fff' : colors.textSub }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

    <ScrollView contentContainerStyle={{ paddingBottom: 120, flexGrow: 1, marginTop: 12, paddingHorizontal: 12 }}>

      {/* Preview */}
      {report === 'pl' && <PLPreview data={plData} cur={cur} colors={colors} t={t} />}
      {report === 'gst' && <GSTPreview data={gstData} cur={cur} colors={colors} settings={settings} t={t} />}
      {report === 'inventory' && <InventoryPreview data={inventoryData} cur={cur} colors={colors} t={t} />}

      {/* Export buttons */}
      <View style={s.exportRow}>
        <TouchableOpacity
          style={[s.exportBtn, { backgroundColor: colors.danger, opacity: exporting ? 0.6 : 1 }]}
          onPress={exportPDF}
          disabled={exporting}
        >
          {exporting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="document-text-outline" size={18} color="#fff" />}
          <Text style={s.exportBtnText}>{t('exportPdf')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.exportBtn, { backgroundColor: colors.success, opacity: exporting ? 0.6 : 1 }]}
          onPress={exportCSV}
          disabled={exporting}
        >
          {exporting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="grid-outline" size={18} color="#fff" />}
          <Text style={s.exportBtnText}>{t('exportCsv')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
    </View>
  );
}

// ─── Preview components ───────────────────────────────────────────────────────

function PLPreview({ data: d, cur, colors, t }: any) {
  const rows = [
    { label: `${t('totalBills')} (${d.billCount})`, value: d.revenue, color: colors.text },
    { label: t('costOfGoodsSold'), value: d.cogs, color: colors.textSub },
    { label: `${t('grossProfit')} · ${d.grossMargin.toFixed(1)}%`, value: d.grossProfit, color: d.grossProfit >= 0 ? colors.success : colors.danger },
    { label: t('totalExpenses'), value: d.totalExp, color: colors.warning ?? colors.danger },
    { label: `${t('netProfit')} · ${d.netMargin.toFixed(1)}%`, value: d.netProfit, color: d.netProfit >= 0 ? colors.success : colors.danger, bold: true },
  ];
  return (
    <View style={[previewCard.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {rows.map((r, i) => (
        <View key={r.label} style={[previewCard.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
          <Text style={[previewCard.label, { color: colors.textSub, fontFamily: r.bold ? fonts.bold : fonts.regular }]}>{r.label}</Text>
          <Text style={[previewCard.value, { color: r.color, fontFamily: r.bold ? fonts.extraBold : fonts.bold }]}>{formatCurrency(r.value, cur)}</Text>
        </View>
      ))}
    </View>
  );
}

function GSTPreview({ data: d, cur, colors, settings, t }: any) {
  if (!settings.gstRegistered) {
    return (
      <View style={[previewCard.wrap, { backgroundColor: colors.surface, borderColor: colors.border, alignItems: 'center', paddingVertical: 28 }]}>
        <Ionicons name="information-circle-outline" size={32} color={colors.textMuted} />
        <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: colors.textMuted, marginTop: 8, textAlign: 'center' }}>
          {t('gstTrackingOff')}{'\n'}{t('enableInSettingsGst')}
        </Text>
      </View>
    );
  }
  if (d.rows.length === 0) {
    return (
      <View style={[previewCard.wrap, { backgroundColor: colors.surface, borderColor: colors.border, alignItems: 'center', paddingVertical: 28 }]}>
        <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted }}>{t('noGstTransactionsInPeriod')}</Text>
      </View>
    );
  }
  return (
    <View style={[previewCard.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[previewCard.row, { backgroundColor: colors.surfaceHigh }]}>
        <Text style={[previewCard.label, { color: colors.textSub, fontFamily: fonts.extraBold, flex: 1 }]}>{t('gstPreviewRate')}</Text>
        <Text style={[previewCard.label, { color: colors.textSub, fontFamily: fonts.extraBold, width: 80, textAlign: 'right' }]}>{t('gstPreviewTaxable')}</Text>
        <Text style={[previewCard.label, { color: colors.textSub, fontFamily: fonts.extraBold, width: 60, textAlign: 'right' }]}>{t('gstTableCgst')}</Text>
      </View>
      {d.rows.map((r: any, i: number) => (
        <View key={r.rate} style={[previewCard.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
          <Text style={[previewCard.label, { color: colors.text, flex: 1 }]}>{r.rate}%</Text>
          <Text style={[previewCard.label, { color: colors.textSub, width: 80, textAlign: 'right' }]}>{formatCurrency(r.taxable, cur)}</Text>
          <Text style={[previewCard.value, { color: colors.primary, width: 60, textAlign: 'right' }]}>{formatCurrency(r.total, cur)}</Text>
        </View>
      ))}
      <View style={[previewCard.row, { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surfaceHigh }]}>
        <Text style={[previewCard.label, { color: colors.text, fontFamily: fonts.bold, flex: 1 }]}>{t('gstPreviewTotal')}</Text>
        <Text style={[previewCard.label, { color: colors.textSub, width: 80, textAlign: 'right', fontFamily: fonts.bold }]}>{formatCurrency(d.totalTaxable, cur)}</Text>
        <Text style={[previewCard.value, { color: colors.success, width: 60, textAlign: 'right' }]}>{formatCurrency(d.totalGst, cur)}</Text>
      </View>
    </View>
  );
}

function InventoryPreview({ data: d, cur, colors, t }: any) {
  const byCategory = useMemo(() => {
    const map: Record<string, { count: number; value: number }> = {};
    for (const r of d.rows) {
      if (!map[r.category]) map[r.category] = { count: 0, value: 0 };
      map[r.category].count++;
      map[r.category].value += r.stockValue;
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [d]);

  return (
    <View style={[previewCard.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[previewCard.row, { backgroundColor: colors.surfaceHigh }]}>
        <Text style={[previewCard.label, { color: colors.textSub, fontFamily: fonts.extraBold, flex: 1 }]}>{t('inventoryPreviewCategory')}</Text>
        <Text style={[previewCard.label, { color: colors.textSub, fontFamily: fonts.extraBold, width: 50, textAlign: 'right' }]}>{t('inventoryPreviewSkus')}</Text>
        <Text style={[previewCard.label, { color: colors.textSub, fontFamily: fonts.extraBold, width: 90, textAlign: 'right' }]}>{t('inventoryPreviewValue')}</Text>
      </View>
      {byCategory.map(([cat, data]) => (
        <View key={cat} style={[previewCard.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
          <Text style={[previewCard.label, { color: colors.text, flex: 1 }]} numberOfLines={1}>{cat}</Text>
          <Text style={[previewCard.label, { color: colors.textSub, width: 50, textAlign: 'right' }]}>{data.count}</Text>
          <Text style={[previewCard.value, { color: colors.primary, width: 90, textAlign: 'right' }]}>{formatCurrency(data.value, cur)}</Text>
        </View>
      ))}
      <View style={[previewCard.row, { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surfaceHigh }]}>
        <Text style={[previewCard.label, { color: colors.text, fontFamily: fonts.bold, flex: 1 }]}>{t('inventoryPreviewTotal').replace('{count}', String(d.productCount))}</Text>
        <Text style={[previewCard.value, { color: colors.success, textAlign: 'right' }]}>{formatCurrency(d.totalValue, cur)}</Text>
      </View>
    </View>
  );
}

const previewCard = StyleSheet.create({
  wrap: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: 12 },
  row:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  label: { fontFamily: fonts.regular, fontSize: 13, flex: 1, color: '#666' },
  value: { fontFamily: fonts.bold, fontSize: 14 },
});

const makeStyles = (c: any) => StyleSheet.create({
  sectionLabel: { fontFamily: fonts.extraBold, fontSize: 11, letterSpacing: 0.7 },
  section: { marginTop: 8, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  searchRow: { flexDirection: 'row', gap: 10, padding: 8.5, alignItems: 'center', borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  chipText: { fontFamily: fonts.bold, fontSize: 13 },
  tabRow: { flexDirection: 'row', borderRadius: 10, padding: 6, borderWidth: 1, borderColor: c.border },
  tabBtn: { flex: 1, padding: 8, borderRadius: 6, alignItems: 'center', flexDirection: 'row', justifyContent:'center', gap: 10 },
  tabBtnText: { fontFamily: fonts.bold, fontSize: 13 },
  exportRow: { flexDirection: 'row', gap: 12 },
  exportBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 10 },
  exportBtnText: { fontFamily: fonts.extraBold, fontSize: 15, color: '#fff' },
});
