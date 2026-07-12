import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useAppStore } from '../../stores/useAppStore';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';
import { Product } from '../../types';
import LiquidButton from '../../components/common/LiquidButton';
import { useTranslation } from '../../hooks/useTranslation';

interface ParsedRow {
  name: string; category: string; costPrice: number; sellingPrice: number;
  quantity: number; barcode: string; unit: string; valid: boolean; error?: string;
}

function parseCSV(raw: string): ParsedRow[] {
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
  const col = (row: string[], names: string[]) => {
    for (const name of names) { const idx = header.indexOf(name); if (idx !== -1 && row[idx] !== undefined) return row[idx].trim().replace(/"/g, ''); }
    return '';
  };
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const row = line.match(/(".*?"|[^,]+)(?=,|$)/g)?.map(v => v.replace(/"/g, '').trim()) || line.split(',');
    const name = col(row, ['name', 'product name', 'item', 'item name', 'product']);
    const sellingPrice = parseFloat(col(row, ['selling price', 'sell price', 'price', 'mrp', 'sp', 'sale price'])) || 0;
    const costPrice = parseFloat(col(row, ['cost price', 'cost', 'purchase price', 'cp', 'buy price'])) || 0;
    const quantity = parseInt(col(row, ['quantity', 'qty', 'stock', 'units'])) || 0;
    const valid = !!name && sellingPrice > 0 && costPrice >= 0 && quantity >= 0;
    return { name, category: col(row, ['category', 'type', 'dept']) || 'General', costPrice, sellingPrice, quantity, barcode: col(row, ['barcode', 'ean', 'sku', 'code']), unit: col(row, ['unit', 'uom']) || 'pcs', valid, error: !name ? 'Name missing' : sellingPrice <= 0 ? 'Price missing' : costPrice < 0 ? 'Negative cost' : quantity < 0 ? 'Negative quantity' : undefined };
  });
}

// Flag rows whose barcode clashes with an existing product or an earlier row in the same file.
function flagDuplicateBarcodes(rows: ParsedRow[], existing: Product[]): ParsedRow[] {
  const existingBarcodes = new Set(existing.map(p => p.barcode).filter(Boolean) as string[]);
  const seen = new Set<string>();
  return rows.map(r => {
    if (!r.valid || !r.barcode) return r;
    if (existingBarcodes.has(r.barcode) || seen.has(r.barcode)) {
      return { ...r, valid: false, error: 'Duplicate barcode' };
    }
    seen.add(r.barcode);
    return r;
  });
}

export default function CsvImportScreen({ navigation }: any) {
  const { addProduct, products } = useAppStore();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/plain', 'application/csv', '*/*'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setFileName(asset.name); setDone(false); setRows([]);
      const content = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const parsed = parseCSV(content);
      if (parsed.length === 0) { Alert.alert(t('error'), t('couldNotParseCsv')); return; }
      setRows(flagDuplicateBarcodes(parsed, products));
    } catch { Alert.alert(t('error'), t('couldNotReadFile')); }
  };

  const runImport = async () => {
    const valid = rows.filter(r => r.valid);
    if (valid.length === 0) return;
    setImporting(true);
    let count = 0;
    for (const row of valid) {
      await addProduct({ name: row.name, category: row.category, costPrice: row.costPrice, sellingPrice: row.sellingPrice, quantity: row.quantity, barcode: row.barcode || undefined, unit: row.unit, lowStockThreshold: 5, gstRate: 0 });
      count++;
    }
    setImportedCount(count); setImporting(false); setDone(true);
  };

  const validRows = rows.filter(r => r.valid);
  const invalidRows = rows.filter(r => !r.valid);
  const s = makeStyles(colors);

  return (
    <View style={[{ backgroundColor: colors.bg, flex: 1 }]}>
    <ScrollView
            style={{ flex: 1, backgroundColor: colors.bg }}
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
      {/* Info card */}
      <View style={[s.infoCard, { backgroundColor: colors.surface }]}>
        <Text style={[s.infoTitle, { color: colors.text }]}>{t('csvFormat')}</Text>
        <Text style={[s.infoText, { color: colors.textSub }]}>{t('csvFormatDesc')}</Text>
        <View style={{ gap: 4, marginBottom: 12 }}>
          {[
            ['name *', 'Product name (required)'],
            ['selling price *', 'Selling price (required)'],
            ['cost price', 'Purchase price'],
            ['quantity', 'Stock quantity'],
            ['category', 'Product category'],
            ['barcode', 'Barcode / EAN / SKU'],
            ['unit', 'Unit (pcs, kg, etc.)'],
          ].map(([col, desc]) => (
            <View key={col} style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={{ fontFamily: 'monospace', fontSize: 12, color: colors.primary, width: 110 }}>{col}</Text>
              <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, flex: 1 }}>{desc}</Text>
            </View>
          ))}
        </View>
        <View style={[s.exampleBox, { backgroundColor: colors.bg }]}>
          <Text style={[s.exampleTitle, { color: colors.textMuted }]}>{t('exampleLabel')}:</Text>
          <Text style={[s.exampleText, { color: colors.success }]}>name,selling price,cost price,quantity{'\n'}Cello Pen,10,6,100{'\n'}A4 Notebook,45,30,50</Text>
        </View>
      </View>

      {/* Pick file */}
      <LiquidButton title={fileName || t('chooseCsvFile')} icon="folder" onPress={pickFile} variant="glass" />

      {/* Preview */}
      {rows.length > 0 && !done && (
        <>
          <View style={s.previewHeader}>
            <Text style={[s.previewTitle, { color: colors.text }]}>{t('previewLabel')} ({rows.length} {t('rows')})</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <View style={[s.badge, { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.success + '20' }]}>
                <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                <Text style={{ fontFamily: fonts.semiBold, fontSize: 12, color: colors.success }}>{validRows.length} {t('valid')}</Text>
              </View>
              {invalidRows.length > 0 && (
                <View style={[s.badge, { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.danger + '20' }]}>
                  <Ionicons name="close-circle" size={13} color={colors.danger} />
                  <Text style={{ fontFamily: fonts.semiBold, fontSize: 12, color: colors.danger }}>{invalidRows.length} skipped</Text>
                </View>
              )}
            </View>
          </View>

          {rows.slice(0, 20).map((row, i) => (
            <View key={i} style={[s.previewRow, { backgroundColor: colors.surface, borderLeftColor: row.valid ? colors.success : colors.danger }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name={row.valid ? 'checkmark-circle' : 'close-circle'} size={15} color={row.valid ? colors.success : colors.danger} />
                <Text style={[s.previewName, { color: colors.text }]} numberOfLines={1}>{row.name || t('noName')}</Text>
              </View>
              <Text style={[s.previewMeta, { color: colors.textMuted }]}>{row.category} · ₹{row.sellingPrice} · {row.quantity} {row.unit}</Text>
              {row.error && <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.danger, marginTop: 2 }}>{row.error}</Text>}
            </View>
          ))}
          {rows.length > 20 && <Text style={[s.moreRows, { color: colors.textMuted }]}>{t('andMore').replace('{count}', String(rows.length - 20))}</Text>}

          <LiquidButton
            title={t('importNProducts').replace('{count}', String(validRows.length))}
            icon="icloud.and.arrow.up"
            onPress={runImport}
            loading={importing}
            disabled={validRows.length === 0}
            variant="glassProminent"
          />
        </>
      )}

      {/* Success */}
      {done && (
        <View style={[s.successCard, { backgroundColor: colors.surface }]}>
          <Ionicons name="checkmark-circle-outline" size={56} color={colors.primary} style={{ marginBottom: 12 }} />
          <Text style={[s.successTitle, { color: colors.text }]}>{t('importCompleteExcl')}</Text>
          <Text style={[s.successSub, { color: colors.textSub }]}>{importedCount} {t('productsAddedToInventory')}</Text>
          <LiquidButton title={t('viewInventory')} icon="arrow.right" onPress={() => navigation.goBack()} variant="glassProminent" />
        </View>
      )}

      </ScrollView>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  infoCard: { borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  infoTitle: { fontFamily: fonts.bold, fontSize: 15, marginBottom: 8 },
  infoText: { fontSize: 13, marginBottom: 10 },
  exampleBox: { borderRadius: 10, padding: 10 },
  exampleTitle: { fontSize: 11, marginBottom: 4 },
  exampleText: { fontFamily: 'monospace', fontSize: 11, lineHeight: 18 },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 12 },
  previewTitle: { fontFamily: fonts.bold, fontSize: 15 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  previewRow: { borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, borderLeftWidth: 3 },
  previewName: { fontFamily: fonts.semiBold, fontSize: 14 },
  previewMeta: { fontSize: 12, marginTop: 2 },
  moreRows: { textAlign: 'center', fontSize: 13, marginVertical: 8 },
  successCard: { borderRadius: 16, padding: 30, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, marginTop: 20, marginHorizontal: 12 },
  successTitle: { fontFamily: fonts.extraBold, fontSize: 22 },
  successSub: { fontSize: 14, marginTop: 6, marginBottom: 20 },
});
