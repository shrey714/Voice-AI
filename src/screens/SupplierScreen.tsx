import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, FlatList, ScrollView, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import LiquidBottomSheet, { LiquidBottomSheetRef } from '../components/common/LiquidBottomSheet';
import LiquidTextField from '../components/common/LiquidTextField';
import LiquidButton from '../components/common/LiquidButton';
import SheetHeader from '../components/common/SheetHeader';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../stores/useAppStore';
import { useTranslation } from '../hooks/useTranslation';
import { Product, Supplier } from '../types';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import { formatCurrency, sanitizeDecimal } from '../utils/helpers';
import EmptyState from '../components/common/EmptyState';
import CollapsibleFab, { useFabScroll } from '../components/common/CollapsibleFab';
import ProductCard from '../components/inventory/ProductCard';
import InlineSearchBar from '../components/common/InlineSearchBar';
import LiquidHeaderIconButton from '../components/common/LiquidHeaderIconButton';

const PAYMENT_MODES_KEYS = [
  { key: 'cash', tKey: 'cash' as const, icon: 'cash-outline' },
  { key: 'upi',  tKey: 'upi' as const,  icon: 'phone-portrait-outline' },
  { key: 'bank', tKey: 'bank' as const, icon: 'card-outline' },
] as const;

const emptyForm = { name: '', phone: '', email: '', address: '', notes: '' };

export default function SupplierScreen() {
  const { colors: c } = useAppTheme();
  const { t } = useTranslation();
  const { suppliers, products, expenses, supplierLedger, purchases, settings, addSupplier, updateSupplier, deleteSupplier, updateProduct, deleteProduct, recordSupplierPayment } = useAppStore();
  const navigation = useNavigation<any>();

  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [stockInput, setStockInput] = useState('');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const { extended, onScroll } = useFabScroll();

  // Payment recording sheet — uses paymentSupplier (separate from selectedSupplier)
  // so the detail sheet's onClose can null selectedSupplier without breaking the payment sheet
  const [paymentSupplier, setPaymentSupplier] = useState<Supplier | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'upi' | 'bank'>('cash');
  const [paymentNote, setPaymentNote] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const paymentSheetRef = useRef<LiquidBottomSheetRef>(null);

  const getOutstanding = (supplierId: string) =>
    purchases
      .filter(p => p.supplierId === supplierId)
      .reduce((s, p) => s + Math.max(0, p.totalAmount - p.paidAmount), 0);

  const filtered = search.trim()
    ? suppliers.filter(sup =>
        sup.name.toLowerCase().includes(search.toLowerCase()) ||
        (sup.phone || '').includes(search) ||
        (sup.address || '').toLowerCase().includes(search.toLowerCase())
      )
    : suppliers;

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <LiquidHeaderIconButton icon="magnifyingglass" androidIcon="search-outline" onPress={() => setSearchOpen(v => !v)} />
      ),
    });
  }, [navigation]);

  const formSheetRef = useRef<LiquidBottomSheetRef>(null);
  const detailSheetRef = useRef<LiquidBottomSheetRef>(null);

  const openFormSheet = useCallback(() => formSheetRef.current?.expand(), []);
  const closeFormSheet = useCallback(() => formSheetRef.current?.close(), []);
  const closeDetailSheet = useCallback(() => {
    detailSheetRef.current?.close();
    setSelectedSupplier(null);
    setEditingStockId(null);
  }, []);

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm }); openFormSheet(); };
  const openEdit = (sup: Supplier) => {
    setEditing(sup);
    setForm({ name: sup.name, phone: sup.phone || '', email: sup.email || '', address: sup.address || '', notes: sup.notes || '' });
    closeDetailSheet();
    openFormSheet();
  };

  const save = async () => {
    if (!form.name.trim()) { Alert.alert(t('error'), t('supplierNameRequired')); return; }
    if (editing) {
      await updateSupplier({ ...editing, ...form, name: form.name.trim() });
    } else {
      await addSupplier({ ...form, name: form.name.trim() });
    }
    closeFormSheet();
  };

  const confirmDeleteSupplier = (supplier: Supplier) => {
    const linkedCount = products.filter(p => p.supplierId === supplier.id).length;
    const msg = linkedCount > 0
      ? `Remove ${supplier.name}? ${linkedCount} product${linkedCount > 1 ? 's' : ''} will be unlinked but NOT deleted.`
      : `Remove ${supplier.name}?`;
    Alert.alert(t('deleteSupplier'), msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteSupplier(supplier.id); closeDetailSheet(); } },
    ]);
  };

  const openPaymentSheet = (supplier: Supplier) => {
    setPaymentSupplier(supplier);
    setPaymentAmount('');
    setPaymentMode('cash');
    setPaymentNote('');
    paymentSheetRef.current?.expand();
  };

  const savePayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) { Alert.alert(t('error'), t('enterValidAmount')); return; }
    if (!paymentSupplier) return;
    const outstanding = getOutstanding(paymentSupplier.id);
    if (amount > outstanding + 0.01) {
      Alert.alert('Error', `Amount (${formatCurrency(amount, settings.currency)}) exceeds outstanding balance (${formatCurrency(outstanding, settings.currency)})`);
      return;
    }
    setSavingPayment(true);
    try {
      await recordSupplierPayment(paymentSupplier.id, amount, paymentMode, paymentNote.trim() || undefined);
      paymentSheetRef.current?.close();
    } catch {
      Alert.alert(t('error'), 'Failed to record payment');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleAddProduct = (supplier: Supplier) => {
    closeDetailSheet();
    navigation.navigate('Inventory', {
      screen: 'ProductForm',
      params: { prefillSupplierId: supplier.id },
    });
  };

  const handleReceiveStock = (supplier: Supplier) => {
    closeDetailSheet();
    navigation.navigate('PurchaseForm', { supplierId: supplier.id });
  };

  const handleEditProduct = (product: Product) => {
    closeDetailSheet();
    navigation.navigate('Inventory', {
      screen: 'ProductForm',
      params: { product },
    });
  };

  const startEditStock = (product: Product) => {
    setEditingStockId(product.id);
    setStockInput(String(product.quantity));
  };

  const saveStock = async (product: Product) => {
    const delta = parseInt(stockInput) || 0;
    if (delta === 0) { setEditingStockId(null); return; }
    await updateProduct({ ...product, quantity: Math.max(0, product.quantity + delta) });
    setEditingStockId(null);
  };

  const confirmDeleteProduct = (product: Product) => {
    Alert.alert(
      t('deleteProduct'),
      t('deleteProductConfirm').replace('{name}', product.name),
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteProduct(product.id) },
      ]
    );
  };

  const s = makeStyles(c);

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      {searchOpen && (
        <InlineSearchBar
          value={search}
          onChangeText={setSearch}
          placeholder={t('searchSuppliers')}
          onClose={() => setSearchOpen(false)}
        />
      )}

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 8, paddingBottom: 120, flexGrow: 1 }}
        renderItem={({ item: supplier, index }) => {
          const linkedCount = products.filter(p => p.supplierId === supplier.id).length;
          const lowCount = products.filter(p => p.supplierId === supplier.id && p.quantity <= p.lowStockThreshold).length;
          const outstanding = getOutstanding(supplier.id);
          return (
            <MotiView from={{ opacity: 0, translateY: 8 }} animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 280, delay: Math.min(index * 40, 400) }}>
              <TouchableOpacity
                style={[s.card, { backgroundColor: c.surface }]}
                onPress={() => { setSelectedSupplier(supplier); setEditingStockId(null); detailSheetRef.current?.expand(); }}
              >
                <View style={[s.cardAvatar, { backgroundColor: c.primaryLight }]}>
                  <Text style={[s.cardAvatarText, { color: c.primary }]}>{supplier.name[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cardName, { color: c.text }]}>{supplier.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                    {supplier.phone ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="call-outline" size={12} color={c.textMuted} />
                        <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: c.textMuted }}>{supplier.phone}</Text>
                      </View>
                    ) : null}
                    {linkedCount > 0 ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="cube-outline" size={12} color={c.textMuted} />
                        <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: c.textMuted }}>{linkedCount} product{linkedCount > 1 ? 's' : ''}</Text>
                      </View>
                    ) : null}
                    {lowCount > 0 ? (
                      <View style={[s.lowBadge, { backgroundColor: c.warning + '20' }]}>
                        <Text style={[s.lowBadgeText, { color: c.warning }]}>{lowCount} low</Text>
                      </View>
                    ) : null}
                    {outstanding > 0 ? (
                      <View style={[s.lowBadge, { backgroundColor: c.danger + '18' }]}>
                        <Text style={[s.lowBadgeText, { color: c.danger }]}>Due {formatCurrency(outstanding, settings.currency)}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
              </TouchableOpacity>
            </MotiView>
          );
        }}
        ListEmptyComponent={
          search.trim()
            ? <EmptyState icon="search-outline" title="No results" subtitle={`No suppliers match "${search}"`} />
            : <EmptyState icon="business-outline" title={t('noSuppliersYet')} subtitle={t('trackSuppliersHere')} actionLabel={t('addSupplier')} onAction={openAdd} />
        }
      />

      <CollapsibleFab bottom={90} icon="add" label={t('addSupplier')} extended={extended} onPress={openAdd} />

      {/* Add/Edit Supplier Form Sheet */}
      <LiquidBottomSheet ref={formSheetRef}>
        <SheetHeader title={editing ? t('editSupplier') : t('addSupplier')} onClose={closeFormSheet} />
        <ScrollView contentContainerStyle={s.sheetContent}>
          {([
            { key: 'name', label: `${t('businessName')} *`, placeholder: 'e.g. Sharma Traders', keyboard: 'default' },
            { key: 'phone', label: t('phone'), placeholder: '+91 XXXXX XXXXX', keyboard: 'phone-pad' },
            { key: 'email', label: t('email'), placeholder: 'supplier@email.com', keyboard: 'email-address' },
            { key: 'address', label: t('address'), placeholder: 'Shop / city', keyboard: 'default' },
            { key: 'notes', label: t('notes'), placeholder: 'What they supply, payment terms, etc.', keyboard: 'default' },
          ] as const).map(field => (
            <View key={field.key} style={{ marginBottom: 8, paddingHorizontal: 8 }}>
              <Text style={[s.fieldLabel, { color: c.textSub }]}>{field.label}</Text>
              <LiquidTextField
                value={(form as any)[field.key]}
                onChangeText={v => setForm(f => ({ ...f, [field.key]: v }))}
                placeholder={field.placeholder}
                keyboardType={field.keyboard as any}
                multiline={field.key === 'notes'}
              />
            </View>
          ))}
          <LiquidButton title={t('save')} onPress={save} variant="glassProminent" style={s.btnRow} />
        </ScrollView>
      </LiquidBottomSheet>

      {/* Record Payment Sheet */}
      <LiquidBottomSheet
        ref={paymentSheetRef}
        onDismiss={() => { setPaymentSupplier(null); setPaymentAmount(''); setPaymentNote(''); }}
      >
        <SheetHeader title={t('recordPayment')} onClose={() => paymentSheetRef.current?.close()} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
          {paymentSupplier && (
            <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: c.textSub, marginBottom: 14 }}>
              {t('toWord')} {paymentSupplier.name}
            </Text>
          )}
          <Text style={[s.fieldLabel, { color: c.textSub, paddingLeft: 0 }]}>{t('amount')}</Text>
          <LiquidTextField
            value={paymentAmount}
            onChangeText={v => setPaymentAmount(sanitizeDecimal(v))}
            placeholder={t('enterAmount')}
            keyboardType="decimal-pad"
            style={{ marginBottom: 12 }}
          />
          <Text style={[s.fieldLabel, { color: c.textSub, paddingLeft: 0, marginBottom: 8 }]}>{t('paymentMode')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {PAYMENT_MODES_KEYS.map(m => {
              const active = paymentMode === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primary : c.surface }}
                  onPress={() => setPaymentMode(m.key)}
                >
                  <Ionicons name={m.icon as any} size={16} color={active ? '#fff' : c.textSub} />
                  <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: active ? '#fff' : c.textSub }}>{t(m.tKey)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[s.fieldLabel, { color: c.textSub, paddingLeft: 0 }]}>{t('noteOptional')}</Text>
          <LiquidTextField
            value={paymentNote}
            onChangeText={setPaymentNote}
            placeholder="e.g. partial payment"
            style={{ marginBottom: 16 }}
          />
          <LiquidButton
            title={savingPayment ? t('savingDots') : t('savePayment')}
            onPress={savePayment}
            loading={savingPayment}
            tintColor={c.success}
            style={s.btnRow}
          />
        </ScrollView>
      </LiquidBottomSheet>

      {/* Supplier Detail Sheet */}
      <LiquidBottomSheet
        ref={detailSheetRef}
        onDismiss={() => { setSelectedSupplier(null); setEditingStockId(null); }}
      >
        <ScrollView contentContainerStyle={s.sheetContent} keyboardShouldPersistTaps="handled">
          {selectedSupplier && (() => {
            const linkedProducts = products.filter(p => p.supplierId === selectedSupplier.id);
            const linkedExpenses = expenses.filter(e => e.supplierId === selectedSupplier.id);
            const totalSpent = linkedExpenses.reduce((sum, e) => sum + e.amount, 0);
            const lowStockProducts = linkedProducts.filter(p => p.quantity <= p.lowStockThreshold);

            const reorderMsg = lowStockProducts.length > 0
              ? `Hi ${selectedSupplier.name},\n\nI need to reorder:\n${lowStockProducts.map(p => `• ${p.name} (${p.quantity} ${p.unit} left)`).join('\n')}\n\nPlease confirm availability.`
              : `Hello ${selectedSupplier.name}, I'd like to place an order.`;

            const openWhatsApp = (msg: string) => {
              const phone = selectedSupplier.phone?.replace(/[^0-9]/g, '');
              Linking.openURL(
                phone
                  ? `whatsapp://send?phone=91${phone}&text=${encodeURIComponent(msg)}`
                  : `whatsapp://send?text=${encodeURIComponent(msg)}`
              ).catch(() => Alert.alert(t('whatsappNotFound'), t('installWhatsappMsg')));
            };

            const outstanding = getOutstanding(selectedSupplier.id);
            const ledgerEntries = supplierLedger.filter(e => e.supplierId === selectedSupplier.id).slice(0, 8);

            return (
              <>
                {/* Header */}
                <View style={[s.detailHeader, { borderBottomColor: c.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={[s.cardAvatar, { backgroundColor: c.primaryLight, width: 52, height: 52, borderRadius: 26 }]}>
                      <Text style={[s.cardAvatarText, { color: c.primary, fontSize: 24 }]}>{selectedSupplier.name[0].toUpperCase()}</Text>
                    </View>
                    <View>
                        <Text style={[s.modalTitle, { color: c.text, marginBottom: 0 }]}>{selectedSupplier.name}</Text>
                        {selectedSupplier.address ? (
                          <View style={s.detailRow}>
                            <Ionicons name="location-outline" size={14} color={c.textSub} />
                            <Text style={[s.detailRowText, { color: c.text }]}>{selectedSupplier.address}</Text>
                          </View>
                        ) : null}
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={closeDetailSheet}
                    accessibilityLabel="Close"
                    accessibilityRole="button"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={[s.closeBtn, { backgroundColor: c.surfaceHigh }]}
                  >
                    <Ionicons name="close" size={18} color={c.textSub} />
                  </TouchableOpacity>
                </View>

                {/* Stats row */}
                  <View style={[s.statsRow, { backgroundColor: c.surfaceHigh, borderColor: c.border }]}>
                      <View style={s.statItem}>
                        <Text style={[s.statValue, { color: c.primary }]}>{linkedProducts.length}</Text>
                        <Text style={[s.statLabel, { color: c.textMuted }]}>Products</Text>
                      </View>
                   <View style={[s.statDivider, { backgroundColor: c.border }]} />
                      <View style={s.statItem}>
                        <Text style={[s.statValue, { color: outstanding > 0 ? c.danger : c.success }]}>
                          {outstanding > 0 ? formatCurrency(outstanding, settings.currency) : 'Clear'}
                        </Text>
                        <Text style={[s.statLabel, { color: c.textMuted }]}>Outstanding</Text>
                      </View>
                    <View style={[s.statDivider, { backgroundColor: c.border }]} />
                      <View style={s.statItem}>
                        <Text style={[s.statValue, { color: c.warning }]}>{lowStockProducts.length}</Text>
                        <Text style={[s.statLabel, { color: c.textMuted }]}>Low Stock</Text>
                      </View>
                  </View>

                {/* Receive Stock + Record Payment buttons */}
                <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 8, marginBottom: 8 }}>
                  <TouchableOpacity
                    style={[s.actionWideBtn, { backgroundColor: c.primary }]}
                    onPress={() => handleReceiveStock(selectedSupplier)}
                  >
                    <Ionicons name="arrow-down-circle-outline" size={18} color="#fff" />
                    <Text style={[s.actionWideBtnText, { color: '#fff' }]}>{t('receiveStock')}</Text>
                  </TouchableOpacity>
                  {outstanding > 0 && (
                    <TouchableOpacity
                      style={[s.actionWideBtn, { backgroundColor: c.success }]}
                      onPress={() => {
                        const sup = selectedSupplier!; // capture before closeDetailSheet nulls it
                        detailSheetRef.current?.close(); // close sheet without calling setSelectedSupplier
                        setTimeout(() => openPaymentSheet(sup), 200);
                      }}
                    >
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={[s.actionWideBtnText, { color: '#fff' }]}>{t('recordPayment')}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Action buttons */}
                <View style={[s.detailActions]}>
                  {selectedSupplier.phone ? (
                    <TouchableOpacity style={[s.actionBtn, { backgroundColor: c.info + '15' }]}
                      onPress={() => Linking.openURL(`tel:${selectedSupplier.phone}`)}>
                      <Ionicons name="call" size={18} color={c.info} />
                      <Text style={[s.actionBtnText, { color: c.info }]}>{selectedSupplier.phone}</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#25D36615' }]}
                    onPress={() => openWhatsApp(`Hello ${selectedSupplier.name}, I'd like to place an order.`)}
                    accessibilityLabel="Message supplier via WhatsApp"
                    accessibilityRole="button">
                    <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: c.primaryLight }]} onPress={() => openEdit(selectedSupplier)} accessibilityLabel="Edit supplier" accessibilityRole="button">
                    <Ionicons name="pencil" size={18} color={c.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: c.danger + '15' }]} onPress={() => confirmDeleteSupplier(selectedSupplier)} accessibilityLabel="Delete supplier" accessibilityRole="button">
                    <Ionicons name="trash" size={18} color={c.danger} />
                  </TouchableOpacity>
                </View>

                {/* Ledger history */}
                {ledgerEntries.length > 0 && (
                  <>
                    <View style={s.sectionHeader}>
                      <Text style={[s.sectionTitle, { color: c.textSub }]}>{t('recentLedger')}</Text>
                      <TouchableOpacity
                        style={[s.addProductBtn, { backgroundColor: c.primaryLight }]}
                        onPress={() => { closeDetailSheet(); navigation.navigate('Purchases'); }}
                      >
                        <Text style={[s.addProductBtnText, { color: c.primary }]}>{t('allPurchases')}</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={[s.productsListContainer, { backgroundColor: c.surfaceHigh, paddingTop: 0 }]}>
                      {ledgerEntries.map(entry => (
                        <View key={entry.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: c.text }} numberOfLines={1}>{entry.description}</Text>
                            <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: c.textMuted }}>
                              {new Date(entry.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            </Text>
                          </View>
                          <Text style={{ fontFamily: fonts.extraBold, fontSize: 14, color: entry.type === 'debit' ? c.danger : c.success }}>
                            {entry.type === 'debit' ? '-' : '+'}{formatCurrency(entry.amount, settings.currency)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {/* Contact info */}
                <View style={{ paddingHorizontal: 8 , gap: 8 }}>
                  {selectedSupplier.email ? (
                    <View style={[s.detailRow, {marginTop: 8}]}>
                      <Ionicons name="mail-outline" size={16} color={c.textSub} />
                      <Text style={[s.detailRowText, { color: c.text }]}>{selectedSupplier.email}</Text>
                    </View>
                  ) : null}
                  {selectedSupplier.notes ? (
                    <View style={[s.notesBox, { backgroundColor: c.surfaceHigh }]}>
                      <Text style={[s.notesText, { color: c.textSub }]}>{selectedSupplier.notes}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Low stock reorder banner */}
                {lowStockProducts.length > 0 && (
                  <View style={[s.reorderBanner, { backgroundColor: c.warning + '18', borderColor: c.warning + '40' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="alert-circle-outline" size={18} color={c.warning} />
                      <Text style={[s.reorderTitle, { color: c.warning }]}>
                        {t('itemsNeedReorder').replace('{count}', String(lowStockProducts.length))}
                      </Text>
                    </View>
                    {lowStockProducts.map(p => (
                      <Text key={p.id} style={[s.reorderItem, { color: c.textSub }]}>
                        • {p.name} — {p.quantity} {p.unit} left
                      </Text>
                    ))}
                    <TouchableOpacity
                      style={[s.reorderBtn, { backgroundColor: '#25D366' }]}
                      onPress={() => openWhatsApp(reorderMsg)}
                    >
                      <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                      <Text style={[s.reorderBtnText, { color: '#fff' }]}>{t('whatsappReorder')}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Linked Products section */}
                  <View style={s.sectionHeader}>
                    <Text style={[s.sectionTitle, { color: c.textSub }]}>{t('products')}</Text>
                    <TouchableOpacity
                      style={[s.addProductBtn, { backgroundColor: c.primaryLight }]}
                      onPress={() => handleAddProduct(selectedSupplier)}
                    >
                      <Ionicons name="add" size={15} color={c.primary} />
                      <Text style={[s.addProductBtnText, { color: c.primary }]}>{t('addProduct')}</Text>
                    </TouchableOpacity>
                  </View>

                <View style={[s.productsListContainer, {backgroundColor: c.surfaceHigh}]}>
                  {linkedProducts.length === 0 ? (
                    <Text style={{ color: c.textMuted, fontFamily: fonts.regular, fontSize: 13, fontStyle: 'italic', padding: 8, alignSelf:'center', paddingBottom: 16 }}>
                      {t('noProductsLinked')} {t('addToStock')}
                    </Text>
                  ) : (
                    linkedProducts.map(p => (
                      <View key={p.id}>
                        <ProductCard
                          product={p}
                          currency={settings.currency}
                          colors={c}
                          animated={false}
                          showMargin={false}
                          onAddStock={() => editingStockId === p.id ? setEditingStockId(null) : startEditStock(p)}
                          onMenu={() =>
                            Alert.alert(p.name, undefined, [
                              { text: t('edit') + ' ' + t('product'), onPress: () => handleEditProduct(p) },
                              { text: t('deleteProduct'), style: 'destructive', onPress: () => confirmDeleteProduct(p) },
                              { text: t('cancel'), style: 'cancel' },
                            ])
                          }
                        />

                        {/* Inline stock adjuster — opens when + tapped */}
                        {editingStockId === p.id && (
                          <MotiView
                            from={{ opacity: 0, translateY: -6 }}
                            animate={{ opacity: 1, translateY: 0 }}
                            transition={{ type: 'timing', duration: 180 }}
                            style={[s.stockEditor, { backgroundColor: c.surfaceHigh, borderColor: c.border }]}
                          >
                            <Text style={[s.stockEditorLabel, { color: c.textSub }]}>
                              {t('addToStock')} — {t('current')}: {p.quantity} {p.unit}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
                              {[1, 5, 10, 25].map(n => (
                                <TouchableOpacity
                                  key={n}
                                  style={[s.quickBtn, { backgroundColor: c.primaryLight }]}
                                  onPress={() => setStockInput(String(n))}
                                >
                                  <Text style={{ color: c.primary, fontFamily: fonts.bold, fontSize: 13 }}>+{n}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
                              <LiquidTextField
                                style={{ flex: 1 }}
                                value={stockInput}
                                onChangeText={setStockInput}
                                keyboardType="numeric"
                                placeholder={t('qtyToAdd')}
                              />
                              <TouchableOpacity
                                style={[s.stockSaveBtn, { backgroundColor: c.primary }]}
                                onPress={() => saveStock(p)}
                              >
                                <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 13 }}>Add</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => setEditingStockId(null)} accessibilityLabel="Cancel stock edit" accessibilityRole="button">
                                <Ionicons name="close-circle" size={26} color={c.textMuted} />
                              </TouchableOpacity>
                            </View>
                          </MotiView>
                        )}
                      </View>
                    ))
                  )}
                </View>
              </>
            );
          })()}
        </ScrollView>
      </LiquidBottomSheet>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  container: { flex: 1 },
  card: { flexDirection: 'row', borderRadius: 10, padding: 12, marginBottom: 8, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, gap: 12 },
  cardAvatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  cardAvatarText: { fontFamily: fonts.extraBold, fontSize: 22 },
  cardName: { fontFamily: fonts.bold, fontSize: 15 },
  lowBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  lowBadgeText: { fontFamily: fonts.bold, fontSize: 11 },
  sheetContent: { paddingHorizontal: 0, paddingBottom: 24 },
  modalTitle: { fontFamily: fonts.extraBold, fontSize: 19, marginBottom: 16, paddingLeft: 8, paddingRight: 14 },
  fieldLabel: { fontFamily: fonts.bold, fontSize: 12, marginBottom: 6, paddingLeft: 4 },
  input: { borderRadius: 10, padding: 12, fontSize: 15, borderWidth: 1, fontFamily: fonts.regular },
  btnRow: { marginTop: 10, paddingHorizontal: 8 },
  // `paddingTop` (not just `paddingBottom`) + a taller bottom gap before the
  // border — this sheet has its own bespoke avatar-header layout instead of
  // the shared `SheetHeader`, which was the one place that top spacing was
  // missing entirely: content started flush under the sheet's drag handle.
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, paddingLeft: 8, paddingRight: 14, marginBottom: 4 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 8 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: fonts.extraBold, fontSize: 16 },
  statLabel: { fontFamily: fonts.regular, fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, marginVertical: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailRowText: { fontFamily: fonts.medium, fontSize: 14 },
  notesBox: { borderRadius: 10, padding: 10 },
  notesText: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  reorderBanner: { borderRadius: 10, borderWidth: 1, padding: 8, marginTop: 8, marginHorizontal: 8 },
  reorderTitle: { fontFamily: fonts.bold, fontSize: 14 },
  reorderItem: { fontFamily: fonts.regular, fontSize: 13, marginTop: 3 },
  reorderBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, justifyContent: 'center', marginTop: 8 },
  reorderBtnText: { fontFamily: fonts.bold, fontSize: 14 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingHorizontal: 8 },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  addProductBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  addProductBtnText: { fontFamily: fonts.bold, fontSize: 12 },
  productsListContainer: {padding: 8, paddingBottom: 0, marginHorizontal: 8, marginTop: 8, borderRadius: 10},
  stockEditor: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8, marginTop: -4 },
  stockEditorLabel: { fontFamily: fonts.semiBold, fontSize: 12 },
  quickBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  stockInput: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, borderWidth: 1, fontFamily: fonts.regular },
  stockSaveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  detailActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
  actionBtnText: { fontFamily: fonts.bold, fontSize: 13 },
  actionWideBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10 },
  actionWideBtnText: { fontFamily: fonts.bold, fontSize: 14 },
});
