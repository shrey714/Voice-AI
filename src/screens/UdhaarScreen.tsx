import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Alert, ScrollView, Linking } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import BottomSheet, { BottomSheetScrollView, BottomSheetTextInput, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { useAppStore } from '../stores/useAppStore';
import { formatCurrency, formatDate, formatTime, generateId } from '../utils/helpers';
import * as db from '../db/database';
import { Customer, UdhaarEntry, Bill } from '../types';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import EmptyState from '../components/common/EmptyState';
import CollapsibleFab, { useFabScroll } from '../components/common/CollapsibleFab';
import FadeSlideIn from '../components/common/FadeSlideIn';
import { SkeletonList } from '../components/common/Skeleton';

export default function UdhaarScreen() {
  const { colors } = useAppTheme();
  const { settings, bills } = useAppStore();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<UdhaarEntry[]>([]);
  const [txType, setTxType] = useState<'debit' | 'credit'>('debit');
  const [txAmount, setTxAmount] = useState('');
  const [txNote, setTxNote] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [detailTab, setDetailTab] = useState<'ledger' | 'bills'>('ledger');
  const { extended, onScroll } = useFabScroll();

  const customerBills = useMemo<Bill[]>(() => {
    if (!selectedCustomer) return [];
    return bills
      .filter(b => {
        if (selectedCustomer.phone && b.customerPhone)
          return b.customerPhone === selectedCustomer.phone;
        if (b.customerName && selectedCustomer.name)
          return b.customerName.trim().toLowerCase() === selectedCustomer.name.trim().toLowerCase();
        return false;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [bills, selectedCustomer]);

  const addCustomerSheetRef = useRef<BottomSheet>(null);
  const customerDetailSheetRef = useRef<BottomSheet>(null);
  const addTxSheetRef = useRef<BottomSheet>(null);
  const addCustomerSnapPoints = useMemo(() => ['50%'], []);
  const customerDetailSnapPoints = useMemo(() => ['88%'], []);
  const addTxSnapPoints = useMemo(() => ['50%'], []);

  const openAddCustomer = useCallback(() => addCustomerSheetRef.current?.expand(), []);
  const closeAddCustomer = useCallback(() => addCustomerSheetRef.current?.close(), []);
  const closeCustomerDetail = useCallback(() => { customerDetailSheetRef.current?.close(); setSelectedCustomer(null); }, []);
  const openAddTx = useCallback(() => addTxSheetRef.current?.expand(), []);
  const closeAddTx = useCallback(() => addTxSheetRef.current?.close(), []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} pressBehavior="close" />
    ), []
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [custs, allEntries] = await Promise.all([db.getAllCustomers(), db.getAllUdhaar()]);
      const bal: Record<string, number> = {};
      for (const entry of allEntries) {
        if (!bal[entry.customerId]) bal[entry.customerId] = 0;
        bal[entry.customerId] += entry.type === 'debit' ? entry.amount : -entry.amount;
      }
      setCustomers(custs);
      setBalances(bal);
    } catch (e) {
      console.error('UdhaarScreen loadData:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setDetailTab('ledger');
    setTransactions(await db.getUdhaarForCustomer(customer.id));
    customerDetailSheetRef.current?.expand();
  };

  const saveCustomer = async () => {
    if (!newName.trim()) { Alert.alert('Error', 'Name is required'); return; }
    if (editingCustomer) {
      await db.updateCustomer({ ...editingCustomer, name: newName.trim(), phone: newPhone.trim() || undefined });
    } else {
      await db.insertCustomer({ id: generateId(), name: newName.trim(), phone: newPhone.trim() || undefined, createdAt: Date.now() });
    }
    setNewName(''); setNewPhone(''); setEditingCustomer(null); closeAddCustomer();
    await loadData();
  };

  const editCustomer = (customer: Customer) => {
    setEditingCustomer(customer); setNewName(customer.name); setNewPhone(customer.phone || '');
    addCustomerSheetRef.current?.expand();
  };

  const confirmDeleteCustomer = (customer: Customer) => {
    Alert.alert('Delete Customer', `Remove ${customer.name} and all their transactions?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await db.deleteCustomer(customer.id); closeCustomerDetail(); await loadData(); }},
    ]);
  };

  const addTransaction = async () => {
    const amt = parseFloat(txAmount);
    if (!amt || isNaN(amt) || amt <= 0) { Alert.alert('Error', 'Enter a valid amount'); return; }
    if (!selectedCustomer) return;
    await db.insertUdhaarEntry({ id: generateId(), customerId: selectedCustomer.id, amount: amt, type: txType, note: txNote.trim() || undefined, createdAt: Date.now() });
    setTxAmount(''); setTxNote(''); closeAddTx();
    setTransactions(await db.getUdhaarForCustomer(selectedCustomer.id));
    await loadData();
  };

  const sendReminder = (customer: Customer) => {
    const balance = balances[customer.id] || 0;
    if (balance <= 0) { Alert.alert('No dues', `${customer.name} has no pending dues.`); return; }
    const msg = `नमस्ते ${customer.name} जी 🙏\n\n${settings.shopName} से आपका ${formatCurrency(balance, settings.currency)} बकाया है।\nकृपया जल्द भुगतान करें।\n\nधन्यवाद 🙏`;
    const phone = customer.phone?.replace(/[^0-9]/g, '');
    Linking.openURL(phone ? `whatsapp://send?phone=91${phone}&text=${encodeURIComponent(msg)}` : `whatsapp://send?text=${encodeURIComponent(msg)}`).catch(() => Alert.alert('WhatsApp not found'));
  };

  const totalOutstanding = Object.values(balances).filter(b => b > 0).reduce((s, b) => s + b, 0);
  const sorted = [...customers].sort((a, b) => (balances[b.id] || 0) - (balances[a.id] || 0));
  const s = makeStyles(colors);

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      {/* Summary Banner */}
      <MotiView
        style={[s.summaryCard, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[s.summaryAmount, {color: colors.danger}]}>{formatCurrency(totalOutstanding, settings.currency)}</Text>
        <Text style={[s.summaryLabel, { color: colors.textMuted }]}>Total Outstanding (उधार)</Text>
      </MotiView>

      {loading ? <SkeletonList /> : (
        <FlatList
          data={sorted}
          keyExtractor={c => c.id}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 8, paddingBottom: 120, flexGrow: 1 }}
          renderItem={({ item: customer, index }) => {
            const balance = balances[customer.id] || 0;
            const hasBalance = balance > 0;
            return (
              <FadeSlideIn index={index}>
                <TouchableOpacity style={[s.customerCard, { backgroundColor: colors.surface }]}
                  onPress={() => openCustomer(customer)}
                  onLongPress={() => Alert.alert(customer.name, 'What would you like to do?', [
                    { text: 'Edit', onPress: () => editCustomer(customer) },
                    { text: 'Delete', style: 'destructive', onPress: () => confirmDeleteCustomer(customer) },
                    { text: 'Cancel', style: 'cancel' },
                  ])}>
                  <View style={[s.avatar, { backgroundColor: hasBalance ? colors.danger + '15' : colors.success + '15' }]}>
                    <Text style={[s.avatarText, { color: hasBalance ? colors.danger : colors.success }]}>{customer.name[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.customerName, { color: colors.text }]} numberOfLines={1}>{customer.name}</Text>
                    {customer.phone ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                        <Ionicons name="call-outline" size={12} color={colors.textMuted} />
                        <Text style={[s.customerPhone, { color: colors.textMuted }]}>{customer.phone}</Text>
                      </View>
                    ) : null}
                    {hasBalance && (
                      <TouchableOpacity onPress={() => sendReminder(customer)} style={[s.waBadge, { backgroundColor: '#25D36615', marginTop: 8, alignSelf: 'flex-start' }]}>
                        <Ionicons name="logo-whatsapp" size={12} color="#25D366" />
                        <Text style={[s.waBadgeText, { color: '#25D366' }]}>Remind</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={{ fontFamily: fonts.extraBold, fontSize: 16, color: hasBalance ? colors.danger : balance < 0 ? colors.success : colors.textMuted }}>
                      {hasBalance ? formatCurrency(balance, settings.currency) : balance < 0 ? formatCurrency(Math.abs(balance), settings.currency) : '—'}
                    </Text>
                    <MotiView key={hasBalance ? 'due' : balance < 0 ? 'adv' : 'settled'}
                      from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 240 }}
                      style={[s.balCaption, { backgroundColor: (hasBalance ? colors.danger : balance < 0 ? colors.success : colors.textMuted) + '1A' }]}>
                      <Text style={[s.balCaptionText, { color: hasBalance ? colors.danger : balance < 0 ? colors.success : colors.textMuted }]}>
                        {hasBalance ? 'DUE' : balance < 0 ? 'ADVANCE' : 'SETTLED'}
                      </Text>
                    </MotiView>
                  </View>
                </TouchableOpacity>
              </FadeSlideIn>
            );
          }}
          ListEmptyComponent={<EmptyState icon="book-outline" title="No customers yet" subtitle="Tap + to add a customer" />}
        />
      )}

      <CollapsibleFab bottom={90} icon="add" label="Add Customer" extended={extended} onPress={() => { setEditingCustomer(null); setNewName(''); setNewPhone(''); openAddCustomer(); }} />

      {/* Add/Edit Customer Sheet */}
      <BottomSheet
        ref={addCustomerSheetRef}
        index={-1}
        snapPoints={addCustomerSnapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.primary, width: 40 }}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        <BottomSheetScrollView contentContainerStyle={s.sheetContent}>
          <Text style={[s.modalTitle, { color: colors.text }]}>{editingCustomer ? 'Edit Customer' : 'Add Customer'}</Text>
          <BottomSheetTextInput style={[s.input, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
            value={newName} onChangeText={setNewName} placeholder="Customer name *" placeholderTextColor={colors.textMuted} />
          <BottomSheetTextInput style={[s.input, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
            value={newPhone} onChangeText={setNewPhone} placeholder="Phone (for WhatsApp reminder)" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" />
          <View style={s.btnRow}>
            <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.border }]} onPress={closeAddCustomer}>
              <Text style={{ color: colors.textSub, fontFamily: fonts.semiBold }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.primaryBtn, { backgroundColor: colors.primary }]} onPress={saveCustomer}>
              <Text style={{ color: '#fff', fontFamily: fonts.bold }}>Save</Text>
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Customer Detail Sheet */}
      <BottomSheet
        ref={customerDetailSheetRef}
        index={-1}
        snapPoints={customerDetailSnapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.primary, width: 40 }}
        onClose={() => setSelectedCustomer(null)}
      >
        <BottomSheetScrollView contentContainerStyle={s.sheetContent}>
          {selectedCustomer && (
            <>
              <View style={s.detailHeader}>
                <View>
                  <Text style={[s.modalTitle, { color: colors.text, marginBottom: 4 }]}>{selectedCustomer.name}</Text>
                  {selectedCustomer.phone ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Ionicons name="call-outline" size={12} color={colors.textMuted} />
                      <Text style={[s.customerPhone, { color: colors.textMuted }]}>{selectedCustomer.phone}</Text>
                    </View>
                  ) : null}
                </View>
                <TouchableOpacity onPress={closeCustomerDetail}>
                  <Ionicons name="close" size={24} color={colors.textSub} />
                </TouchableOpacity>
              </View>

              <View style={[s.balanceBanner, { backgroundColor: (balances[selectedCustomer.id] || 0) > 0 ? colors.danger + '10' : colors.success + '10' }]}>
                <Text style={[s.balanceBannerLabel, { color: colors.textSub }]}>Outstanding Amount</Text>
                <Text style={[s.balanceBannerAmt, { color: (balances[selectedCustomer.id] || 0) > 0 ? colors.danger : colors.success }]}>
                  {formatCurrency(Math.abs(balances[selectedCustomer.id] || 0), settings.currency)}
                </Text>
              </View>

              {/* Tab switcher */}
              <View style={[s.tabRow, { borderBottomColor: colors.border }]}>
                {(['ledger', 'bills'] as const).map(tab => (
                  <TouchableOpacity
                    key={tab}
                    style={[s.tab, detailTab === tab && { borderBottomColor: colors.primary }]}
                    onPress={() => setDetailTab(tab)}
                  >
                    <Ionicons
                      name={tab === 'ledger' ? 'book-outline' : 'receipt-outline'}
                      size={13}
                      color={detailTab === tab ? colors.primary : colors.textMuted}
                    />
                    <Text style={[s.tabText, { color: detailTab === tab ? colors.primary : colors.textMuted }]}>
                      {tab === 'ledger' ? 'Ledger' : `Purchase History${customerBills.length > 0 ? ` (${customerBills.length})` : ''}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {detailTab === 'ledger' ? (
                transactions.length === 0 ? (
                  <Text style={{ fontFamily: fonts.regular, textAlign: 'center', color: colors.textMuted, marginTop: 24, marginBottom: 16 }}>No transactions yet</Text>
                ) : transactions.map(tx => (
                  <View key={tx.id} style={[s.txRow, { borderLeftColor: tx.type === 'debit' ? colors.danger : colors.success }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.txNote, { color: colors.text }]}>{tx.note || (tx.type === 'debit' ? 'Credit given' : 'Payment received')}</Text>
                      <Text style={[s.txDate, { color: colors.textMuted }]}>{formatDate(tx.createdAt)} · {formatTime(tx.createdAt)}</Text>
                    </View>
                    <Text style={[s.txAmt, { color: tx.type === 'debit' ? colors.danger : colors.success }]}>
                      {tx.type === 'debit' ? '−' : '+'}{formatCurrency(tx.amount, settings.currency)}
                    </Text>
                  </View>
                ))
              ) : (
                customerBills.length === 0 ? (
                  <Text style={{ fontFamily: fonts.regular, textAlign: 'center', color: colors.textMuted, marginTop: 24, marginBottom: 16 }}>
                    No bills found for this customer
                  </Text>
                ) : customerBills.map(bill => (
                  <View key={bill.id} style={[s.billRow, { borderBottomColor: colors.border }]}>
                    <View style={[s.billIcon, { backgroundColor: colors.primaryLight }]}>
                      <Ionicons name="receipt-outline" size={16} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.txNote, { color: colors.text }]}>{formatDate(bill.createdAt)} · {formatTime(bill.createdAt)}</Text>
                      <Text style={[s.txDate, { color: colors.textMuted }]}>
                        {bill.items.length} item{bill.items.length !== 1 ? 's' : ''} · {bill.items.map(i => i.productName).join(', ')}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={[s.txAmt, { color: colors.text }]}>{formatCurrency(bill.total, settings.currency)}</Text>
                      <View style={[s.modePill, {
                        backgroundColor: bill.paymentMode === 'credit' ? colors.danger + '15'
                          : bill.paymentMode === 'upi' ? colors.primary + '15' : colors.success + '15',
                      }]}>
                        <Text style={[s.modeText, {
                          color: bill.paymentMode === 'credit' ? colors.danger
                            : bill.paymentMode === 'upi' ? colors.primary : colors.success,
                        }]}>
                          {bill.paymentMode.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}

              <View style={s.detailActions}>
                <TouchableOpacity style={[s.detailActionBtn, { backgroundColor: colors.danger + '15' }]}
                  onPress={() => { setTxType('debit'); setTxAmount(''); setTxNote(''); openAddTx(); }}>
                  <Ionicons name="pencil-outline" size={16} color={colors.danger} />
                  <Text style={{ color: colors.danger, fontFamily: fonts.bold, fontSize: 12 }}>Give Credit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.detailActionBtn, { backgroundColor: colors.success + '15' }]}
                  onPress={() => { setTxType('credit'); setTxAmount(''); setTxNote(''); openAddTx(); }}>
                  <Ionicons name="cash-outline" size={16} color={colors.success} />
                  <Text style={{ color: colors.success, fontFamily: fonts.bold, fontSize: 12 }}>Mark Paid</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.detailActionBtn, { backgroundColor: '#25D36615' }]}
                  onPress={() => sendReminder(selectedCustomer)}>
                  <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                  <Text style={{ color: '#25D366', fontFamily: fonts.bold, fontSize: 12 }}>Remind</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Add Transaction Sheet */}
      <BottomSheet
        ref={addTxSheetRef}
        index={-1}
        snapPoints={addTxSnapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.primary, width: 40 }}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        <BottomSheetScrollView contentContainerStyle={s.sheetContent}>
          <Text style={[s.modalTitle, { color: colors.text }]}>{txType === 'debit' ? 'Give Credit' : 'Payment Received'}</Text>
          <BottomSheetTextInput style={[s.input, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
            value={txAmount} onChangeText={setTxAmount} placeholder={`Amount (${settings.currency})`} placeholderTextColor={colors.textMuted} keyboardType="numeric" />
          <BottomSheetTextInput style={[s.input, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
            value={txNote} onChangeText={setTxNote} placeholder="Note (optional)" placeholderTextColor={colors.textMuted} />
          <View style={s.btnRow}>
            <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.border }]} onPress={closeAddTx}>
              <Text style={{ color: colors.textSub, fontFamily: fonts.semiBold }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.primaryBtn, { backgroundColor: txType === 'debit' ? colors.danger : colors.success }]} onPress={addTransaction}>
              <Text style={{ color: '#fff', fontFamily: fonts.bold }}>Save</Text>
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  container: { flex: 1 },
  summaryCard: { paddingHorizontal: 18, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  summaryLabel: { fontFamily: fonts.medium, fontSize: 12, marginTop: 6 },
  summaryAmount: { fontFamily: fonts.display, fontSize: 18 },
  customerCard: { flexDirection: 'row', borderRadius: 10, padding: 14, marginBottom: 8, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontFamily: fonts.extraBold, fontSize: 22 },
  customerName: { fontFamily: fonts.bold, fontSize: 15 },
  customerPhone: { fontFamily: fonts.regular, fontSize: 12, marginTop: 3 },
  waBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, gap: 4 },
  waBadgeText: { fontFamily: fonts.semiBold, fontSize: 11 },
  balCaption: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  balCaptionText: { fontFamily: fonts.extraBold, fontSize: 11, letterSpacing: 0.5 },
  sheetContent: { paddingHorizontal: 20, paddingBottom: 40 },
  modalTitle: { fontFamily: fonts.extraBold, fontSize: 18, marginBottom: 16 },
  input: { borderRadius: 14, padding: 16, fontSize: 15, borderWidth: 1, marginBottom: 14, fontFamily: fonts.regular },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, padding: 16, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  primaryBtn: { flex: 1, padding: 16, borderRadius: 14, alignItems: 'center' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  balanceBanner: { borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 16 },
  balanceBannerLabel: { fontFamily: fonts.medium, fontSize: 12 },
  balanceBannerAmt: { fontFamily: fonts.display, fontSize: 28, marginTop: 6 },
  txRow: { borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  txNote: { fontFamily: fonts.semiBold, fontSize: 14 },
  txDate: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  txAmt: { fontFamily: fonts.extraBold, fontSize: 16, marginLeft: 8 },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 16, paddingBottom: 20 },
  detailActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 13, borderRadius: 14, gap: 6 },
  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 12 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontFamily: fonts.bold, fontSize: 13 },
  billRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  billIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  modePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  modeText: { fontFamily: fonts.extraBold, fontSize: 10, letterSpacing: 0.4 },
});
