import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput, Alert, Image, ScrollView, type TextInput as TI } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppStore } from '../../stores/useAppStore';
import { useTranslation } from '../../hooks/useTranslation';
import { formatCurrency, sanitizeDecimal, sanitizeInteger } from '../../utils/helpers';
import { Product } from '../../types';
import BarcodeScannerModal from '../../components/billing/BarcodeScannerModal';
import DatePickerSheet, { DatePickerSheetRef } from '../../components/common/DatePickerSheet';
import { identifyProductFromImage, getVisionApiKey } from '../../services/vision';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';
import LiquidTextField from '../../components/common/LiquidTextField';
import { useConfirm } from '../../components/common/ConfirmDialogProvider';

const GST_RATES = [0, 5, 12, 18, 28]; // government-fixed slabs — not user-editable
const emptyForm = { name: '', category: 'General', costPrice: '', sellingPrice: '', quantity: '', barcode: '', unit: 'pcs', lowStockThreshold: '5', imageUri: '', supplierId: '', gstRate: 0, hsnCode: '', expiryDay: '', expiryMonth: '', expiryYear: '' };

export default function ProductFormScreen({ route, navigation }: any) {
  const { t } = useTranslation();
  const { confirm, confirmActions } = useConfirm();
  const { colors } = useAppTheme();
  const { addProduct, updateProduct, settings, products, suppliers } = useAppStore();

  const editingProduct: Product | null = route?.params?.product ?? null;
  const prefillBarcode: string = route?.params?.prefillBarcode ?? '';
  const prefillSupplierId: string = route?.params?.prefillSupplierId ?? '';

  const [form, setForm] = useState({ ...emptyForm, barcode: prefillBarcode, supplierId: prefillSupplierId });
  const [saving, setSaving] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [visionLoading, setVisionLoading] = useState(false);

  const monthRef = useRef<TI>(null);
  const yearRef = useRef<TI>(null);
  const expiryPickerRef = useRef<DatePickerSheetRef>(null);

  useEffect(() => {
    if (editingProduct) {
      let expiryDay = '', expiryMonth = '', expiryYear = '';
      if (editingProduct.expiryDate) {
        const d = new Date(editingProduct.expiryDate);
        expiryDay = String(d.getDate()).padStart(2, '0');
        expiryMonth = String(d.getMonth() + 1).padStart(2, '0');
        expiryYear = String(d.getFullYear());
      }
      setForm({
        name: editingProduct.name,
        category: editingProduct.category,
        costPrice: String(editingProduct.costPrice),
        sellingPrice: String(editingProduct.sellingPrice),
        quantity: String(editingProduct.quantity),
        barcode: editingProduct.barcode || '',
        unit: editingProduct.unit,
        lowStockThreshold: String(editingProduct.lowStockThreshold),
        imageUri: editingProduct.imageUri || '',
        supplierId: editingProduct.supplierId || '',
        gstRate: editingProduct.gstRate ?? 0,
        hsnCode: editingProduct.hsnCode || '',
        expiryDay,
        expiryMonth,
        expiryYear,
      });
    }
  }, []);

  const doSave = async (data: any) => {
    setSaving(true);
    try {
      if (editingProduct) {
        await updateProduct({ ...editingProduct, ...data, updatedAt: Date.now() });
      } else {
        await addProduct(data);
      }
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const name = form.name.trim();
    const costPrice = parseFloat(form.costPrice) || 0;
    const sellingPrice = parseFloat(form.sellingPrice) || 0;
    const quantity = parseInt(form.quantity) || 0;
    const lowStockThreshold = parseInt(form.lowStockThreshold) || 5;
    const barcode = form.barcode.trim();

    // Required + sanity validation
    if (!name) { Alert.alert(t('error'), t('productNameRequired')); return; }
    if (sellingPrice <= 0) { Alert.alert(t('error'), t('sellingPriceMustBeGreaterThanZero')); return; }
    if (costPrice < 0 || quantity < 0 || lowStockThreshold < 0) {
      Alert.alert(t('error'), t('pricesCannotBeNegative')); return;
    }

    // Barcode must be unique across products
    if (barcode) {
      const clash = products.find(p => p.barcode === barcode && p.id !== editingProduct?.id);
      if (clash) { Alert.alert(t('duplicateBarcode'), `This barcode is already used by "${clash.name}". Each product needs a unique barcode.`); return; }
    }

    // Parse expiry date — all three fields must be present if any is filled
    let expiryDate: number | undefined;
    const hasAny = form.expiryDay || form.expiryMonth || form.expiryYear;
    if (hasAny) {
      const d = parseInt(form.expiryDay);
      const m = parseInt(form.expiryMonth);
      const y = parseInt(form.expiryYear);
      if (!form.expiryDay || !form.expiryMonth || form.expiryYear.length < 4 ||
          isNaN(d) || isNaN(m) || isNaN(y) ||
          d < 1 || d > 31 || m < 1 || m > 12 || y < 2000) {
        Alert.alert(t('invalidDate'), 'Enter a complete expiry date (DD / MM / YYYY)');
        return;
      }
      const parsed = new Date(y, m - 1, d);
      if (isNaN(parsed.getTime()) || parsed.getDate() !== d) {
        Alert.alert(t('invalidDate'), `${form.expiryDay}/${form.expiryMonth}/${form.expiryYear} is not a valid date`);
        return;
      }
      expiryDate = parsed.getTime();
    }

    const data = {
      name,
      category: form.category,
      costPrice,
      sellingPrice,
      quantity,
      barcode: barcode || undefined,
      imageUri: form.imageUri || undefined,
      unit: form.unit,
      lowStockThreshold,
      supplierId: form.supplierId || undefined,
      gstRate: form.gstRate,
      hsnCode: form.hsnCode.trim() || undefined,
      expiryDate,
    };

    // Warn (don't block) when selling below cost — it might be an intentional clearance.
    if (costPrice > 0 && sellingPrice < costPrice) {
      const ok = await confirm({
        title: t('sellingBelowCost'),
        message: `Selling price (${formatCurrency(sellingPrice, settings.currency)}) is below cost (${formatCurrency(costPrice, settings.currency)}). You'll lose money on each sale.`,
        confirmLabel: t('saveAnyway'),
        cancelLabel: t('cancel'),
        destructive: true,
      });
      if (ok) doSave(data);
      return;
    }

    doSave(data);
  };

  const handleImagePicked = async (uri: string) => {
    setForm(f => ({ ...f, imageUri: uri }));
    const visionKey = getVisionApiKey();
    if (!visionKey) return;
    setVisionLoading(true);
    try {
      const result = await identifyProductFromImage(uri, visionKey);
      if (!result.ok) { Alert.alert('Vision API Error', result.error); return; }
      const { name, category, labels, rawTexts } = result;
      if (!name) { Alert.alert(t('nothingIdentified'), t('tryClearerPhoto')); return; }
      const apply = await confirm({
        title: t('productIdentified'),
        message: `Name: "${name}"\nCategory: ${category}\n\nApply?`,
        confirmLabel: t('apply'),
        cancelLabel: t('skip'),
      });
      if (apply) setForm(f => ({ ...f, name, category }));
    } finally { setVisionLoading(false); }
  };

  const pickImage = async () => {
    const choice = await confirmActions({
      title: t('productPhoto'),
      message: t('chooseSource'),
      actions: [
        { label: t('takePhoto'), value: 'camera' },
        { label: t('galleryLabel'), value: 'gallery' },
      ],
      cancelLabel: t('cancel'),
    });
    if (choice === 'camera') {
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 });
      if (!r.canceled && r.assets[0]) await handleImagePicked(r.assets[0].uri);
    } else if (choice === 'gallery') {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
      if (!r.canceled && r.assets[0]) await handleImagePicked(r.assets[0].uri);
    }
  };

  // Render the Save action in the shared navigator header (AppHeader).
  // saveRef always points at the latest handleSave so the closure never goes stale.
  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;
  useLayoutEffect(() => {
    navigation.setOptions({
      title: editingProduct ? 'Edit Product' : 'Add Product',
      headerRight: () => (
        <TouchableOpacity onPress={() => saveRef.current()} disabled={saving} hitSlop={10} style={{ paddingHorizontal: 4 }}>
          {saving
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Text style={{ color: colors.primary, fontFamily: fonts.extraBold, fontSize: 16 }}>Save</Text>}
        </TouchableOpacity>
      ),
    });
  }, [navigation, saving, editingProduct, colors]);

  const s = makeStyles(colors);

  return (
    <View style={[s.root, { backgroundColor: colors.bg }]}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Photo picker */}
        <TouchableOpacity
          style={[s.imagePicker, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={pickImage}
          disabled={visionLoading}
        >
          {form.imageUri
            ? <Image source={{ uri: form.imageUri }} style={s.productImage} />
            : (
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Ionicons name="camera-outline" size={32} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: fonts.regular }}>{t('addPhotoAi')}</Text>
              </View>
            )}
          {visionLoading && (
            <View style={s.visionOverlay}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={{ color: '#fff', fontFamily: fonts.semiBold, fontSize: 12, marginTop: 6 }}>{t('identifying')}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Product Name */}
        <Field label="Product Name *" colors={colors}>
          <LiquidTextField
            value={form.name}
            onChangeText={v => setForm(f => ({ ...f, name: v }))}
            placeholder="e.g. Cello Pen Blue"
          />
        </Field>

        {/* Category */}
        <Field label="Category" colors={colors}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {(settings.productCategories ?? []).map(cat => {
              const active = form.category === cat;
              return (
                <TouchableOpacity key={cat}
                  style={[s.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface }]}
                  onPress={() => setForm(f => ({ ...f, category: cat }))}>
                  <Text style={{ color: active ? '#fff' : colors.textSub, fontFamily: fonts.semiBold, fontSize: 13 }}>{cat}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Field>

        {/* Prices row */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label={`Cost Price (${settings.currency})`} colors={colors} flex>
            <TextInput
              style={[s.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={form.costPrice}
              onChangeText={v => setForm(f => ({ ...f, costPrice: sanitizeDecimal(v) }))}
              keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted}
            />
          </Field>
          <Field label={`Selling Price * (${settings.currency})`} colors={colors} flex>
            <TextInput
              style={[s.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={form.sellingPrice}
              onChangeText={v => setForm(f => ({ ...f, sellingPrice: sanitizeDecimal(v) }))}
              keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted}
            />
          </Field>
        </View>

        {/* Qty + Unit row */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="Quantity" colors={colors} flex>
            <TextInput
              style={[s.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={form.quantity}
              onChangeText={v => setForm(f => ({ ...f, quantity: sanitizeInteger(v) }))}
              keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted}
            />
          </Field>
          <Field label="Unit" colors={colors} flex>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {(settings.units ?? []).map(u => {
                const active = form.unit === u;
                return (
                  <TouchableOpacity key={u}
                    style={[s.unitChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface}]}
                    onPress={() => setForm(f => ({ ...f, unit: u }))}>
                    <Text style={{ color: active ? '#fff' : colors.textSub, fontFamily: fonts.semiBold, fontSize: 12 }}>{u}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Field>
        </View>

        {/* Barcode */}
        <Field label={t('barcodeOptional')} colors={colors}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[s.input, { flex: 1, backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={form.barcode}
              onChangeText={v => setForm(f => ({ ...f, barcode: v }))}
              placeholder={t('scanOrTypeBarcode')}
              placeholderTextColor={colors.textMuted}
            />
            <TouchableOpacity
              style={[s.scanBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowBarcodeScanner(true)}>
              <Ionicons name="scan-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </Field>

        {/* GST Rate */}
        <Field label="GST Rate" colors={colors}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {GST_RATES.map(rate => {
              const active = form.gstRate === rate;
              return (
                <TouchableOpacity key={rate}
                  style={[s.chip, { flex: 1, alignItems: 'center', borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface }]}
                  onPress={() => setForm(f => ({ ...f, gstRate: rate }))}>
                  <Text style={{ color: active ? '#fff' : colors.textSub, fontFamily: fonts.semiBold, fontSize: 13 }}>
                    {rate === 0 ? t('nil') : `${rate}%`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {form.gstRate > 0 && (() => {
            const sp = parseFloat(form.sellingPrice) || 0;
            const taxable = sp > 0 ? sp / (1 + form.gstRate / 100) : 0;
            const gstAmt = sp - taxable;
            return (
              <Text style={{ color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, marginTop: 6 }}>
                On ₹{sp.toFixed(2)} MRP → Taxable ₹{taxable.toFixed(2)} + GST ₹{gstAmt.toFixed(2)} (CGST ₹{(gstAmt/2).toFixed(2)} + SGST ₹{(gstAmt/2).toFixed(2)})
              </Text>
            );
          })()}
        </Field>

        {/* HSN Code */}
        <Field label={t('hsnSacOptional')} colors={colors}>
          <TextInput
            style={[s.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            value={form.hsnCode}
            onChangeText={v => setForm(f => ({ ...f, hsnCode: v }))}
            placeholder="e.g. 4820 (books), 3304 (cosmetics)"
            placeholderTextColor={colors.textMuted}
            keyboardType="default"
          />
        </Field>

        {/* Supplier */}
        <Field label={t('supplierOptional')} colors={colors}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <TouchableOpacity
              style={[s.chip, { borderColor: !form.supplierId ? colors.primary : colors.border, backgroundColor: !form.supplierId ? colors.primary : colors.surface }]}
              onPress={() => setForm(f => ({ ...f, supplierId: '' }))}>
              <Text style={{ color: !form.supplierId ? '#fff' : colors.textSub, fontFamily: fonts.semiBold, fontSize: 13 }}>{t('noneLabel')}</Text>
            </TouchableOpacity>
            {suppliers.map(sup => {
              const active = form.supplierId === sup.id;
              return (
                <TouchableOpacity key={sup.id}
                  style={[s.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface }]}
                  onPress={() => setForm(f => ({ ...f, supplierId: sup.id }))}>
                  <Text style={{ color: active ? '#fff' : colors.textSub, fontFamily: fonts.semiBold, fontSize: 13 }}>{sup.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Field>

        {/* Low stock */}
        <Field label="Low Stock Alert Threshold" colors={colors}>
          <TextInput
            style={[s.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            value={form.lowStockThreshold}
            onChangeText={v => setForm(f => ({ ...f, lowStockThreshold: v }))}
            keyboardType="numeric" placeholder="5" placeholderTextColor={colors.textMuted}
          />
        </Field>

        {/* Expiry date */}
        <Field label={t('expiryDateOptional')} colors={colors}>
          <TouchableOpacity
            style={[s.input, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
            onPress={() => expiryPickerRef.current?.open()}
            activeOpacity={0.7}
          >
            <Text style={{ fontFamily: fonts.regular, fontSize: 15, color: (form.expiryDay && form.expiryMonth && form.expiryYear) ? colors.text : colors.textMuted }}>
              {(form.expiryDay && form.expiryMonth && form.expiryYear)
                ? `${form.expiryDay}/${form.expiryMonth}/${form.expiryYear}`
                : t('tapToSelectExpiry')}
            </Text>
            {(form.expiryDay || form.expiryMonth || form.expiryYear) ? (
              <TouchableOpacity onPress={() => setForm(f => ({ ...f, expiryDay: '', expiryMonth: '', expiryYear: '' }))} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            ) : (
              <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
            )}
          </TouchableOpacity>
        </Field>
      </ScrollView>

      <DatePickerSheet
        ref={expiryPickerRef}
        mode="single"
        title="Expiry Date"
        onSelectDate={d => setForm(f => ({
          ...f,
          expiryDay: String(d.getDate()).padStart(2, '0'),
          expiryMonth: String(d.getMonth() + 1).padStart(2, '0'),
          expiryYear: String(d.getFullYear()),
        }))}
        calendarProps={{ minDate: new Date().toISOString().split('T')[0], enableSwipeMonths: true }}
      />
      <BarcodeScannerModal
        visible={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onScanned={barcode => { setForm(f => ({ ...f, barcode })); setShowBarcodeScanner(false); }}
      />
    </View>
  );
}

function Field({ label, children, colors, flex }: any) {
  return (
    <View style={{ marginBottom: 16, flex: flex ? 1 : undefined }}>
      <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: colors.textSub, marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  root: { flex: 1 },
  imagePicker: {
    borderRadius: 14, height: 120, justifyContent: 'center', alignItems: 'center',
    marginBottom: 16, borderStyle: 'dashed', borderWidth: 1.5, overflow: 'hidden',
  },
  productImage: { width: '100%', height: 120, borderRadius: 14 },
  visionOverlay: {
    ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', borderRadius: 14,
  },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1, fontFamily: fonts.regular },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  unitChip: {borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 0},
  scanBtn: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
});
