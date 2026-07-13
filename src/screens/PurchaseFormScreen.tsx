import React, { useState, useRef, useMemo } from 'react';
import {
  View, ScrollView, FlatList, StyleSheet, TouchableOpacity, Alert,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import LiquidBottomSheet, { LiquidBottomSheetRef } from '../components/common/LiquidBottomSheet';
import LiquidButton from '../components/common/LiquidButton';
import SheetHeader, { SHEET_PADDING } from '../components/common/SheetHeader';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../stores/useAppStore';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import { formatCurrency, sanitizeDecimal, sanitizeInteger } from '../utils/helpers';
import { Product, PurchaseItem } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { useConfirm } from '../components/common/ConfirmDialogProvider';

interface FormItem extends PurchaseItem {
  originalCostPrice: number;
}

const PAYMENT_MODES = [
  { key: 'cash', label: 'Cash', icon: 'cash-outline' },
  { key: 'upi',  label: 'UPI',  icon: 'phone-portrait-outline' },
  { key: 'bank', label: 'Bank', icon: 'card-outline' },
] as const;

export default function PurchaseFormScreen({ route, navigation }: any) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const { products, suppliers, createPurchase, settings } = useAppStore(
    useShallow(state => ({
      products: state.products,
      suppliers: state.suppliers,
      createPurchase: state.createPurchase,
      settings: state.settings,
    }))
  );

  const prefillSupplierId: string | undefined = route?.params?.supplierId;
  // Optional reorder prefill: [{ productId, quantity }] (e.g. from the Reorder screen).
  const prefillItems: { productId: string; quantity: number }[] | undefined = route?.params?.items;

  const [supplierId, setSupplierId] = useState<string | null>(prefillSupplierId ?? null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [items, setItems] = useState<FormItem[]>(() => {
    if (!prefillItems?.length) return [];
    return prefillItems
      .map((pi) => {
        const p = products.find((pp) => pp.id === pi.productId);
        if (!p) return null;
        const qty = Math.max(1, pi.quantity);
        return { productId: p.id, productName: p.name, quantity: qty, costPrice: p.costPrice, originalCostPrice: p.costPrice, totalCost: qty * p.costPrice };
      })
      .filter(Boolean) as FormItem[];
  });
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'upi' | 'bank'>('cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Product picker sheet state
  const [productSearch, setProductSearch] = useState('');
  const pickerSheetRef = useRef<LiquidBottomSheetRef>(null);

  // Supplier picker sheet state
  const [supplierSearch, setSupplierSearch] = useState('');
  const supplierSheetRef = useRef<LiquidBottomSheetRef>(null);

  const selectedSupplier = suppliers.find(s => s.id === supplierId);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.barcode || '').includes(q)
    );
  }, [products, productSearch]);

  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(s => s.name.toLowerCase().includes(q));
  }, [suppliers, supplierSearch]);

  const totalAmount = items.reduce((s, i) => s + i.totalCost, 0);
  const paid = parseFloat(paidAmount) || 0;
  const outstanding = Math.max(0, totalAmount - paid);

  const openProductPicker = () => {
    setProductSearch('');
    pickerSheetRef.current?.expand();
  };

  const selectProduct = (product: Product) => {
    pickerSheetRef.current?.close();
    const already = items.find(i => i.productId === product.id);
    if (already) {
      setItems(prev => prev.map(i =>
        i.productId === product.id ? { ...i, quantity: i.quantity + 1, totalCost: (i.quantity + 1) * i.costPrice } : i
      ));
      return;
    }
    setItems(prev => [...prev, {
      productId: product.id,
      productName: product.name,
      quantity: 1,
      costPrice: product.costPrice,
      originalCostPrice: product.costPrice,
      totalCost: product.costPrice,
    }]);
  };

  const updateItemQty = (productId: string, qty: number) => {
    if (qty <= 0) { removeItem(productId); return; }
    setItems(prev => prev.map(i =>
      i.productId === productId ? { ...i, quantity: qty, totalCost: qty * i.costPrice } : i
    ));
  };

  const updateItemCost = (productId: string, cost: string) => {
    const n = parseFloat(cost) || 0;
    setItems(prev => prev.map(i =>
      i.productId === productId ? { ...i, costPrice: n, totalCost: i.quantity * n } : i
    ));
  };

  const removeItem = (productId: string) => {
    setItems(prev => prev.filter(i => i.productId !== productId));
  };

  // Prompt user for each item whose cost price changed, then save
  const handleSave = async () => {
    if (saving) return; // guard against double-tap during alert prompts
    if (items.length === 0) {
      Alert.alert('Error', t('addAtLeastOneItem'));
      return;
    }
    if (paid > totalAmount + 0.01) {
      Alert.alert('Error', `${t('paidExceedsTotal')} (${formatCurrency(paid, settings.currency)} / ${formatCurrency(totalAmount, settings.currency)})`);
      return;
    }

    // Collect items where cost price differs from stored cost price
    const changed = items.filter(i => Math.abs(i.costPrice - i.originalCostPrice) > 0.001);

    // Prompt sequentially for each changed item
    const costPriceUpdates: Record<string, number> = {};

    const promptNext = async (index: number) => {
      if (index >= changed.length) {
        // All prompts answered — proceed to save
        doSave(costPriceUpdates);
        return;
      }
      const item = changed[index];
      const update = await confirm({
        title: t('costPriceChanged'),
        message: `${item.productName}\nStored cost: ${formatCurrency(item.originalCostPrice, settings.currency)}\nPurchase cost: ${formatCurrency(item.costPrice, settings.currency)}\n\n${t('updateStoredCost')}`,
        confirmLabel: t('update'),
        cancelLabel: t('skip'),
      });
      if (update) costPriceUpdates[item.productId] = item.costPrice;
      promptNext(index + 1);
    };

    promptNext(0);
  };

  const doSave = async (costPriceUpdates: Record<string, number>) => {
    setSaving(true);
    try {
      await createPurchase(
        {
          supplierId: supplierId ?? undefined,
          supplierName: selectedSupplier?.name,
          invoiceNumber: invoiceNumber.trim() || undefined,
          items: items.map(({ originalCostPrice, ...rest }) => rest),
          totalAmount,
          paidAmount: paid,
          paymentMode: paid > 0 ? paymentMode : undefined,
          notes: notes.trim() || undefined,
        },
        costPriceUpdates
      );
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save purchase');
    } finally {
      setSaving(false);
    }
  };

  const s = makeStyles(colors);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">

        {/* Supplier */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.textSub }]}>{t('selectSupplierLabel').toUpperCase()}</Text>
          <TouchableOpacity
            style={[s.pickerBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => { setSupplierSearch(''); supplierSheetRef.current?.expand(); }}
          >
            {selectedSupplier ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View style={[s.avatar, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[s.avatarText, { color: colors.primary }]}>{selectedSupplier.name[0]}</Text>
                </View>
                <Text style={[s.pickerBtnText, { color: colors.text }]}>{selectedSupplier.name}</Text>
              </View>
            ) : (
              <Text style={[s.pickerBtnText, { color: colors.textMuted }]}>{t('selectSupplierOpt')}</Text>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {selectedSupplier && (
                <TouchableOpacity onPress={() => setSupplierId(null)} hitSlop={8} accessibilityLabel="Clear supplier" accessibilityRole="button">
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Invoice number */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.textSub }]}>{t('invoiceChallan').toUpperCase()}</Text>
          <TextInput
            style={[s.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            value={invoiceNumber}
            onChangeText={setInvoiceNumber}
            placeholder="e.g. INV-2024-001"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        {/* Items */}
        <View style={s.section}>
          <View style={s.sectionRow}>
            <Text style={[s.sectionTitle, { color: colors.textSub }]}>ITEMS</Text>
            <TouchableOpacity
              style={[s.addItemBtn, { backgroundColor: colors.primaryLight }]}
              onPress={openProductPicker}
            >
              <Ionicons name="add" size={16} color={colors.primary} />
              <Text style={[s.addItemBtnText, { color: colors.primary }]}>{t('addItem')}</Text>
            </TouchableOpacity>
          </View>

          {items.length === 0 ? (
            <TouchableOpacity
              style={[s.emptyItemsBox, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={openProductPicker}
            >
              <Ionicons name="add-circle-outline" size={28} color={colors.textMuted} />
              <Text style={[s.emptyItemsText, { color: colors.textMuted }]}>{t('tapToAddItems')}</Text>
            </TouchableOpacity>
          ) : (
            items.map(item => {
              const costChanged = Math.abs(item.costPrice - item.originalCostPrice) > 0.001;
              return (
                <View key={item.productId} style={[s.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={s.itemTop}>
                    <Text style={[s.itemName, { color: colors.text }]} numberOfLines={1}>{item.productName}</Text>
                    <TouchableOpacity onPress={() => removeItem(item.productId)} hitSlop={6} accessibilityLabel="Remove item" accessibilityRole="button">
                      <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  <View style={s.itemRow}>
                    {/* Quantity */}
                    <View style={s.itemField}>
                      <Text style={[s.itemFieldLabel, { color: colors.textSub }]}>Qty</Text>
                      <View style={[s.qtyRow]}>
                        <TouchableOpacity
                          style={[s.qtyBtn, { backgroundColor: colors.surfaceHigh }]}
                          onPress={() => updateItemQty(item.productId, item.quantity - 1)}
                          accessibilityLabel="Decrease quantity"
                          accessibilityRole="button"
                        >
                          <Ionicons name="remove" size={16} color={colors.text} />
                        </TouchableOpacity>
                        <TextInput
                          style={[s.qtyInput, { color: colors.text, borderColor: colors.border }]}
                          value={String(item.quantity)}
                          onChangeText={v => updateItemQty(item.productId, parseInt(sanitizeInteger(v)) || 0)}
                          keyboardType="numeric"
                          selectTextOnFocus
                        />
                        <TouchableOpacity
                          style={[s.qtyBtn, { backgroundColor: colors.primaryLight }]}
                          onPress={() => updateItemQty(item.productId, item.quantity + 1)}
                          accessibilityLabel="Increase quantity"
                          accessibilityRole="button"
                        >
                          <Ionicons name="add" size={16} color={colors.primary} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Cost price */}
                    <View style={[s.itemField, { flex: 2 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={[s.itemFieldLabel, { color: colors.textSub }]}>Cost Price</Text>
                        {costChanged && (
                          <View style={[s.changedDot, { backgroundColor: colors.warning + '30' }]}>
                            <Text style={[s.changedDotText, { color: colors.warning }]}>
                              {t('was')} {formatCurrency(item.originalCostPrice, settings.currency)}
                            </Text>
                          </View>
                        )}
                      </View>
                      <TextInput
                        style={[s.costInput, {
                          backgroundColor: costChanged ? colors.warning + '10' : colors.surfaceHigh,
                          color: colors.text,
                          borderColor: costChanged ? colors.warning + '60' : colors.border,
                        }]}
                        value={item.costPrice > 0 ? String(item.costPrice) : ''}
                        onChangeText={v => updateItemCost(item.productId, sanitizeDecimal(v))}
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                      />
                    </View>

                    {/* Line total */}
                    <View style={s.itemField}>
                      <Text style={[s.itemFieldLabel, { color: colors.textSub }]}>Total</Text>
                      <Text style={[s.itemTotal, { color: colors.primary }]}>
                        {formatCurrency(item.totalCost, settings.currency)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Payment */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.textSub }]}>PAYMENT</Text>
          <View style={[s.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.summaryRow}>
              <Text style={[s.summaryLabel, { color: colors.textSub }]}>{t('totalAmount')}</Text>
              <Text style={[s.summaryValue, { color: colors.text }]}>{formatCurrency(totalAmount, settings.currency)}</Text>
            </View>

            {/* Paid amount input */}
            <View style={[s.summaryRow, { marginTop: 8 }]}>
              <Text style={[s.summaryLabel, { color: colors.textSub }]}>{t('paidNow')}</Text>
              <TextInput
                style={[s.paidInput, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
                value={paidAmount}
                onChangeText={v => setPaidAmount(sanitizeDecimal(v))}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
            </View>

            {outstanding > 0.001 && (
              <View style={[s.outstandingRow, { backgroundColor: colors.danger + '10', borderColor: colors.danger + '30' }]}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.outstandingText, { color: colors.danger }]}>
                    Outstanding: {formatCurrency(outstanding, settings.currency)}
                  </Text>
                  {!supplierId && (
                    <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.danger, marginTop: 2 }}>
                      {t('selectSupplierToTrack')}
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* Payment mode (only relevant if paid > 0) */}
          {paid > 0 && (
            <View style={s.payModeRow}>
              {PAYMENT_MODES.map(m => {
                const active = paymentMode === m.key;
                return (
                  <TouchableOpacity
                    key={m.key}
                    style={[s.payModeBtn, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface }]}
                    onPress={() => setPaymentMode(m.key)}
                  >
                    <Ionicons name={m.icon as any} size={16} color={active ? '#fff' : colors.textSub} />
                    <Text style={[s.payModeBtnText, { color: active ? '#fff' : colors.textSub }]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Notes */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.textSub }]}>{t('notesOptional').toUpperCase()}</Text>
          <TextInput
            style={[s.input, s.notesInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('anyAdditionalNotes')}
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Save button */}
        <View style={s.section}>
          <LiquidButton
            title={saving ? t('savingDots') : `${t('savePurchase')} · ${formatCurrency(totalAmount, settings.currency)}`}
            icon="checkmark.circle.fill"
            onPress={handleSave}
            loading={saving}
            disabled={items.length === 0}
            variant={items.length > 0 ? 'glassProminent' : 'glass'}
            height={52}
          />
        </View>
      </ScrollView>

      {/* Product picker sheet */}
      <LiquidBottomSheet ref={pickerSheetRef} heightFraction={0.8}>
        <View style={{ flex: 1 }}>
          <SheetHeader title={t('selectProduct')} onClose={() => pickerSheetRef.current?.close()} />
          <View style={[s.searchBox, { backgroundColor: colors.surfaceHigh, borderColor: colors.border, marginHorizontal: SHEET_PADDING }]}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
            <TextInput
              style={[s.searchInput, { color: colors.text }]}
              placeholder="Search products..."
              placeholderTextColor={colors.textMuted}
              value={productSearch}
              onChangeText={setProductSearch}
              autoFocus
            />
          </View>
          <FlatList
            data={filteredProducts}
            keyExtractor={p => p.id}
            contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: SHEET_PADDING }}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews
            renderItem={({ item: p }) => (
              <TouchableOpacity
                style={[s.productRow, { borderBottomColor: colors.border }]}
                onPress={() => selectProduct(p)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.productRowName, { color: colors.text }]}>{p.name}</Text>
                  <Text style={[s.productRowSub, { color: colors.textMuted }]}>
                    Stock: {p.quantity} {p.unit} · Cost: {formatCurrency(p.costPrice, settings.currency)}
                  </Text>
                </View>
                <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              </TouchableOpacity>
            )}
          />
        </View>
      </LiquidBottomSheet>

      {/* Supplier picker sheet */}
      <LiquidBottomSheet ref={supplierSheetRef} heightFraction={0.6}>
        <View style={{ flex: 1 }}>
          <SheetHeader title={t('selectSupplierLabel')} onClose={() => supplierSheetRef.current?.close()} />
          <View style={[s.searchBox, { backgroundColor: colors.surfaceHigh, borderColor: colors.border, marginHorizontal: SHEET_PADDING }]}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
            <TextInput
              style={[s.searchInput, { color: colors.text }]}
              placeholder="Search suppliers..."
              placeholderTextColor={colors.textMuted}
              value={supplierSearch}
              onChangeText={setSupplierSearch}
              autoFocus
            />
          </View>
          <FlatList
            data={filteredSuppliers}
            keyExtractor={s => s.id}
            contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: SHEET_PADDING }}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews
            renderItem={({ item: sup }) => (
              <TouchableOpacity
                style={[s.productRow, { borderBottomColor: colors.border }]}
                onPress={() => { setSupplierId(sup.id); supplierSheetRef.current?.close(); }}
              >
                <View style={[s.avatar, { backgroundColor: colors.primaryLight, marginRight: 10 }]}>
                  <Text style={[s.avatarText, { color: colors.primary }]}>{sup.name[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.productRowName, { color: colors.text }]}>{sup.name}</Text>
                  {sup.phone ? <Text style={[s.productRowSub, { color: colors.textMuted }]}>{sup.phone}</Text> : null}
                </View>
                {supplierId === sup.id && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
              </TouchableOpacity>
            )}
          />
        </View>
      </LiquidBottomSheet>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  section: { paddingHorizontal: 14, paddingTop: 16 },
  sectionTitle: { fontFamily: fonts.extraBold, fontSize: 11, letterSpacing: 0.7, marginBottom: 8 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, padding: 12, borderWidth: 1 },
  pickerBtnText: { fontFamily: fonts.medium, fontSize: 15 },
  avatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontFamily: fonts.extraBold, fontSize: 16 },
  input: { borderRadius: 10, padding: 12, fontSize: 15, borderWidth: 1, fontFamily: fonts.regular },
  notesInput: { height: 72, paddingTop: 10 },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  addItemBtnText: { fontFamily: fonts.bold, fontSize: 13 },
  emptyItemsBox: { borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', padding: 28, alignItems: 'center', gap: 8 },
  emptyItemsText: { fontFamily: fonts.medium, fontSize: 14 },
  itemCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  itemName: { fontFamily: fonts.bold, fontSize: 14, flex: 1, marginRight: 8 },
  itemRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  itemField: { flex: 1 },
  itemFieldLabel: { fontFamily: fonts.semiBold, fontSize: 11, marginBottom: 5 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  qtyInput: { flex: 1, textAlign: 'center', fontFamily: fonts.bold, fontSize: 15, borderBottomWidth: 1, paddingVertical: 4 },
  costInput: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 14, fontFamily: fonts.medium, borderWidth: 1 },
  changedDot: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  changedDotText: { fontFamily: fonts.bold, fontSize: 10 },
  itemTotal: { fontFamily: fonts.extraBold, fontSize: 15, paddingVertical: 7 },
  summaryCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontFamily: fonts.medium, fontSize: 14 },
  summaryValue: { fontFamily: fonts.extraBold, fontSize: 16 },
  paidInput: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, fontSize: 16, fontFamily: fonts.bold, borderWidth: 1, minWidth: 100, textAlign: 'right' },
  outstandingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, padding: 8, borderRadius: 8, borderWidth: 1 },
  outstandingText: { fontFamily: fonts.bold, fontSize: 13 },
  payModeRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  payModeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  payModeBtnText: { fontFamily: fonts.bold, fontSize: 13 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 14 },
  saveBtnText: { fontFamily: fonts.extraBold, fontSize: 16 },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 14, padding: 0, fontFamily: fonts.regular },
  productRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  productRowName: { fontFamily: fonts.bold, fontSize: 14 },
  productRowSub: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
});
