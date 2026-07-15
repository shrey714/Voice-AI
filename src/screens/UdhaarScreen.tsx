import React, { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Alert, ScrollView, Linking, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import LiquidBottomSheet, { LiquidBottomSheetRef } from '../components/common/LiquidBottomSheet';
import LiquidTextField from '../components/common/LiquidTextField';
import LiquidButton from '../components/common/LiquidButton';
import SheetHeader from '../components/common/SheetHeader';
import LiquidTabs from '../components/common/LiquidTabs';
import LiquidHeaderIconButton from '../components/common/LiquidHeaderIconButton';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../stores/useAppStore';
import { useTranslation } from '../hooks/useTranslation';
import { formatCurrency, formatDate, formatTime, generateId, sanitizeDecimal } from '../utils/helpers';
import { buildReminderMessage, whatsappUrl, remindedAgo } from '../utils/reminder';
import * as db from '../db/database';
import { Customer, UdhaarEntry, Bill } from '../types';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import EmptyState from '../components/common/EmptyState';
import CollapsibleFab, { useFabScroll } from '../components/common/CollapsibleFab';
import FadeSlideIn from '../components/common/FadeSlideIn';
import { SkeletonList } from '../components/common/Skeleton';
import { useConfirm } from '../components/common/ConfirmDialogProvider';

// Customers who owe money, largest balance first.
const sortedDebtors = (customers: Customer[], balances: Record<string, number>): Customer[] =>
  customers.filter(c => (balances[c.id] || 0) > 0).sort((a, b) => (balances[b.id] || 0) - (balances[a.id] || 0));

// Extracted + memoized — renders inside a `FlatList`; `onPress`/`onLongPress`
// are stable top-level callbacks (passed directly, not wrapped in a fresh
// per-row closure) and `remindLabel`/`lastRemindedTemplate` are precomputed
// translation strings (not the `t` function itself, which isn't stable
// across renders) so `React.memo`'s shallow-equality check can actually
// skip re-rendering unchanged rows.
const CustomerRow = React.memo(function CustomerRow({
  customer, index, colors, s, currency, balance, remindLabel, lastRemindedTemplate, onPress, onLongPress, onRemind,
}: {
  customer: Customer; index: number; colors: any; s: any; currency: string; balance: number;
  remindLabel: string; lastRemindedTemplate: string;
  onPress: (c: Customer) => void; onLongPress: (c: Customer) => void; onRemind: (c: Customer) => void;
}) {
  const hasBalance = balance > 0;
  return (
    <FadeSlideIn index={index}>
      <TouchableOpacity style={[s.customerCard, { backgroundColor: colors.surface }]}
        onPress={() => onPress(customer)}
        onLongPress={() => onLongPress(customer)}>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <TouchableOpacity onPress={() => onRemind(customer)} style={[s.waBadge, { backgroundColor: '#25D36615', alignSelf: 'flex-start' }]}>
                <Ionicons name="logo-whatsapp" size={12} color="#25D366" />
                <Text style={[s.waBadgeText, { color: '#25D366' }]}>{remindLabel}</Text>
              </TouchableOpacity>
              {customer.lastRemindedAt ? (
                <Text style={[s.remindedAgo, { color: colors.textMuted, marginTop: 0 }]}>· {lastRemindedTemplate.replace('{time}', remindedAgo(customer.lastRemindedAt) ?? '')}</Text>
              ) : null}
            </View>
          )}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Text style={{ fontFamily: fonts.extraBold, fontSize: 16, color: hasBalance ? colors.danger : balance < 0 ? colors.success : colors.textMuted }}>
            {hasBalance ? formatCurrency(balance, currency) : balance < 0 ? formatCurrency(Math.abs(balance), currency) : '—'}
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
});

export default function UdhaarScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { confirm, confirmActions } = useConfirm();
  const { settings, bills } = useAppStore(
    useShallow(state => ({
      settings: state.settings,
      bills: state.bills,
    }))
  );
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

  const addCustomerSheetRef = useRef<LiquidBottomSheetRef>(null);
  const customerDetailSheetRef = useRef<LiquidBottomSheetRef>(null);
  const addTxSheetRef = useRef<LiquidBottomSheetRef>(null);

  const openAddCustomer = useCallback(() => addCustomerSheetRef.current?.expand(), []);
  const closeAddCustomer = useCallback(() => addCustomerSheetRef.current?.close(), []);
  const closeCustomerDetail = useCallback(() => { customerDetailSheetRef.current?.close(); setSelectedCustomer(null); }, []);
  const openAddTx = useCallback(() => addTxSheetRef.current?.expand(), []);
  const closeAddTx = useCallback(() => addTxSheetRef.current?.close(), []);

  const handleAddCustomer = useCallback(() => {
    setEditingCustomer(null); setNewName(''); setNewPhone(''); openAddCustomer();
  }, [openAddCustomer]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTransparent: true,
      headerStyle: { backgroundColor: 'transparent' },
    });
  }, [navigation]);

  // `bottomAccessory` (iOS 26+ only) — same conversion as InventoryScreen.
  // Scoped with `useFocusEffect` (set on focus, cleared on blur), not a
  // plain mount effect — see ExpensesScreen for why that matters (this
  // screen's tab stack has other screens too, e.g. reached via the
  // customer-detail sheet's navigation elsewhere in the app).
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'ios') return;
      const parent = navigation.getParent();
      parent?.setOptions({
        bottomAccessory: ({ placement }: { placement: 'regular' | 'inline' }) =>
              <TouchableOpacity
                onPress={handleAddCustomer}
                style={{ width: '100%', height: '100%', flexDirection: 'row', alignItems: 'center', gap: 8,  borderRadius: 24, paddingHorizontal: 18, justifyContent: 'center' }}
                accessibilityLabel={t('addCustomer')}
                accessibilityRole="button"
              >
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 14 }}>{t('addCustomer')}</Text>
              </TouchableOpacity>
      });
      return () => { parent?.setOptions({ bottomAccessory: undefined }); };
    }, [navigation, handleAddCustomer, colors, t])
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

  const openCustomer = useCallback(async (customer: Customer) => {
    setSelectedCustomer(customer);
    setDetailTab('ledger');
    setTransactions(await db.getUdhaarForCustomer(customer.id));
    customerDetailSheetRef.current?.expand();
  }, []);

  const saveCustomer = async () => {
    if (!newName.trim()) { Alert.alert(t('error'), t('nameRequired')); return; }
    if (editingCustomer) {
      await db.updateCustomer({ ...editingCustomer, name: newName.trim(), phone: newPhone.trim() || undefined });
    } else {
      await db.insertCustomer({ id: generateId(), name: newName.trim(), phone: newPhone.trim() || undefined, createdAt: Date.now() });
    }
    setNewName(''); setNewPhone(''); setEditingCustomer(null); closeAddCustomer();
    await loadData();
  };

  const editCustomer = useCallback((customer: Customer) => {
    setEditingCustomer(customer); setNewName(customer.name); setNewPhone(customer.phone || '');
    addCustomerSheetRef.current?.expand();
  }, []);

  const confirmDeleteCustomer = useCallback(async (customer: Customer) => {
    const ok = await confirm({
      title: t('deleteCustomer'),
      message: t('removeCustomerConfirm').replace('{name}', customer.name),
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
    });
    if (ok) { await db.deleteCustomer(customer.id); closeCustomerDetail(); await loadData(); }
  }, [confirm, t, closeCustomerDetail, loadData]);

  const handleCustomerLongPress = useCallback((customer: Customer) => {
    confirmActions({
      title: customer.name,
      message: 'What would you like to do?',
      actions: [
        { label: 'Edit', value: 'edit' },
        { label: 'Delete', value: 'delete', destructive: true },
      ],
      cancelLabel: 'Cancel',
    }).then(choice => {
      if (choice === 'edit') editCustomer(customer);
      else if (choice === 'delete') confirmDeleteCustomer(customer);
    });
  }, [confirmActions, editCustomer, confirmDeleteCustomer]);

  // Open WhatsApp pre-filled with the dues reminder, then record that we reminded.
  const sendReminder = useCallback(async (customer: Customer) => {
    const balance = balances[customer.id] || 0;
    if (balance <= 0) { Alert.alert(t('noDues'), t('noDuesMsg').replace('{name}', customer.name)); return; }
    const msg = buildReminderMessage({ name: customer.name, balance, settings });
    try {
      await Linking.openURL(whatsappUrl(customer.phone, msg));
      await db.markCustomerReminded(customer.id);
      setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, lastRemindedAt: Date.now() } : c));
    } catch {
      Alert.alert(t('whatsappNotFound'), t('pleaseInstallWhatsapp'));
    }
  }, [balances, t, settings]);

  const remindLabel = t('remind');
  const lastRemindedTemplate = t('lastReminded');
  const renderCustomerItem = useCallback(({ item, index }: { item: Customer; index: number }) => (
    <CustomerRow
      customer={item}
      index={index}
      colors={colors}
      s={s}
      currency={settings.currency}
      balance={balances[item.id] || 0}
      remindLabel={remindLabel}
      lastRemindedTemplate={lastRemindedTemplate}
      onPress={openCustomer}
      onLongPress={handleCustomerLongPress}
      onRemind={sendReminder}
    />
  ), [colors, s, settings.currency, balances, remindLabel, lastRemindedTemplate, openCustomer, handleCustomerLongPress, sendReminder]);

  const addTransaction = async () => {
    const amt = parseFloat(txAmount);
    if (!amt || isNaN(amt) || amt <= 0) { Alert.alert(t('error'), t('enterValidAmount')); return; }
    if (!selectedCustomer) return;
    await db.insertUdhaarEntry({ id: generateId(), customerId: selectedCustomer.id, amount: amt, type: txType, note: txNote.trim() || undefined, createdAt: Date.now() });
    setTxAmount(''); setTxNote(''); closeAddTx();
    setTransactions(await db.getUdhaarForCustomer(selectedCustomer.id));
    await loadData();
  };

  // Sequential "remind everyone who owes" — WhatsApp can't bulk-send, so we step
  // through debtors one at a time (open → you tap send → next).
  const debtors = useMemo(() => sortedDebtors(customers, balances), [customers, balances]);
  const [queueIndex, setQueueIndex] = useState<number | null>(null);
  const queueSheetRef = useRef<LiquidBottomSheetRef>(null);

  const startRemindAll = useCallback(() => {
    if (debtors.length === 0) { Alert.alert(t('allClear'), t('allClearMsg')); return; }
    setQueueIndex(0);
    queueSheetRef.current?.expand();
  }, [debtors.length]);

  const queueSendCurrent = async () => {
    if (queueIndex === null) return;
    const customer = debtors[queueIndex];
    if (customer) await sendReminder(customer);
    queueAdvance();
  };

  const queueAdvance = () => {
    setQueueIndex(i => (i === null ? null : i + 1));
  };

  const queueBack = () => {
    setQueueIndex(i => (i === null || i <= 0 ? i : i - 1));
  };

  const closeQueue = useCallback(() => { queueSheetRef.current?.close(); setQueueIndex(null); }, []);

  const totalOutstanding = Object.values(balances).filter(b => b > 0).reduce((s, b) => s + b, 0);
  const sorted = [...customers].sort((a, b) => (balances[b.id] || 0) - (balances[a.id] || 0));

  return (
    <>
      <FlatList
        data={sorted}
        keyExtractor={c => c.id}
        onScroll={onScroll}
        scrollEventThrottle={16}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 8, paddingBottom: 120, flexGrow: 1 }}
        renderItem={renderCustomerItem}
        ListHeaderComponent={
          <View style={[s.summaryCard, { backgroundColor: colors.surface }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.summaryAmount, {color: colors.danger}]}>{formatCurrency(totalOutstanding, settings.currency)}</Text>
              <Text style={[s.summaryLabel, { color: colors.textMuted }]}>{t('totalOutstandingUdhaar')}</Text>
            </View>
            {debtors.length > 0 && (
              <TouchableOpacity style={[s.remindAllBtn, { backgroundColor: '#25D366' }]} onPress={startRemindAll} activeOpacity={0.85}>
                <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                <Text style={s.remindAllText}>{t('remindAll')} ({debtors.length})</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        ListEmptyComponent={loading ? <SkeletonList /> : <EmptyState icon="book-outline" title={t('noCustomersYet')} subtitle={t('tapToAddCustomer')} />}
      />

      {Platform.OS !== 'ios' && (
        <CollapsibleFab bottom={24} icon="add" label={t('addCustomer')} extended={extended} onPress={handleAddCustomer} />
      )}

      {/* Add/Edit Customer Sheet */}
      <LiquidBottomSheet ref={addCustomerSheetRef}>
        <SheetHeader title={editingCustomer ? t('editCustomer') : t('addCustomer')} onClose={closeAddCustomer} />
        <ScrollView contentContainerStyle={s.sheetContent}>
          <LiquidTextField
            value={newName} onChangeText={setNewName} placeholder={t('customerName') + ' *'} style={{ marginBottom: 14 }} />
          <LiquidTextField
            value={newPhone} onChangeText={setNewPhone} placeholder={t('phoneForWhatsapp')} keyboardType="phone-pad" style={{ marginBottom: 14 }} />
          <LiquidButton title={t('save')} onPress={saveCustomer} variant="glassProminent" style={s.btnRow} />
        </ScrollView>
      </LiquidBottomSheet>

      {/* Customer Detail Sheet */}
      <LiquidBottomSheet
        ref={customerDetailSheetRef}
        onDismiss={() => setSelectedCustomer(null)}
      >
        {selectedCustomer && (
          <SheetHeader title={selectedCustomer.name} subtitle={selectedCustomer.phone} onClose={closeCustomerDetail} />
        )}
        <ScrollView contentContainerStyle={s.sheetContent}>
          {selectedCustomer && (
            <>
              <View style={[s.balanceBanner, { backgroundColor: (balances[selectedCustomer.id] || 0) > 0 ? colors.danger + '10' : colors.success + '10' }]}>
                <Text style={[s.balanceBannerLabel, { color: colors.textSub }]}>{t('outstandingAmount')}</Text>
                <Text style={[s.balanceBannerAmt, { color: (balances[selectedCustomer.id] || 0) > 0 ? colors.danger : colors.success }]}>
                  {formatCurrency(Math.abs(balances[selectedCustomer.id] || 0), settings.currency)}
                </Text>
              </View>

              {/* Tab switcher */}
              <View style={{ marginBottom: 12 }}>
                <LiquidTabs
                  tabs={[
                    { key: 'ledger', label: t('ledger'), icon: 'book-outline' },
                    { key: 'bills', label: `${t('purchaseHistory')}${customerBills.length > 0 ? ` (${customerBills.length})` : ''}`, icon: 'receipt-outline' },
                  ]}
                  selected={detailTab}
                  onSelect={(key) => setDetailTab(key as 'ledger' | 'bills')}
                />
              </View>

              {detailTab === 'ledger' ? (
                transactions.length === 0 ? (
                  <Text style={{ fontFamily: fonts.regular, textAlign: 'center', color: colors.textMuted, marginTop: 24, marginBottom: 16 }}>{t('noTransactionsYet')}</Text>
                ) : transactions.map(tx => (
                  <View key={tx.id} style={[s.txRow, { borderLeftColor: tx.type === 'debit' ? colors.danger : colors.success }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.txNote, { color: colors.text }]}>{tx.note || (tx.type === 'debit' ? t('creditGiven') : t('paymentReceived'))}</Text>
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
                    {t('noBillsForCustomer')}
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
                  <Text style={{ color: colors.danger, fontFamily: fonts.bold, fontSize: 12 }}>{t('giveCredit')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.detailActionBtn, { backgroundColor: colors.success + '15' }]}
                  onPress={() => { setTxType('credit'); setTxAmount(''); setTxNote(''); openAddTx(); }}>
                  <Ionicons name="cash-outline" size={16} color={colors.success} />
                  <Text style={{ color: colors.success, fontFamily: fonts.bold, fontSize: 12 }}>{t('markPaid')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.detailActionBtn, { backgroundColor: '#25D36615' }]}
                  onPress={() => sendReminder(selectedCustomer)}>
                  <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                  <Text style={{ color: '#25D366', fontFamily: fonts.bold, fontSize: 12 }}>{t('remind')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </LiquidBottomSheet>

      {/* Add Transaction Sheet */}
      <LiquidBottomSheet ref={addTxSheetRef}>
        <SheetHeader title={txType === 'debit' ? t('giveCredit') : t('paymentReceived')} onClose={closeAddTx} />
        <ScrollView contentContainerStyle={s.sheetContent}>
          <LiquidTextField
            value={txAmount} onChangeText={v => setTxAmount(sanitizeDecimal(v))} placeholder={`${t('amount')} (${settings.currency})`} keyboardType="numeric" style={{ marginBottom: 14 }} />
          <LiquidTextField
            value={txNote} onChangeText={setTxNote} placeholder={t('noteOptional')} style={{ marginBottom: 14 }} />
          <LiquidButton
            title={t('save')}
            onPress={addTransaction}
            tintColor={txType === 'debit' ? colors.danger : colors.success}
            style={s.btnRow}
          />
        </ScrollView>
      </LiquidBottomSheet>

      {/* Remind-All queue Sheet — step through every debtor */}
      <LiquidBottomSheet
        ref={queueSheetRef}
        onDismiss={() => setQueueIndex(null)}
      >
        <SheetHeader
          title={t('remindAll')}
          subtitle={queueIndex !== null && queueIndex < debtors.length ? `${queueIndex + 1} of ${debtors.length}` : undefined}
          onClose={closeQueue}
        />
        <ScrollView contentContainerStyle={s.sheetContent}>
          {queueIndex !== null && (
            queueIndex >= debtors.length ? (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Ionicons name="checkmark-circle" size={56} color={colors.success} />
                <Text style={[s.modalTitle, { color: colors.text, marginTop: 12, marginBottom: 4 }]}>{t('allDone')}</Text>
                <Text style={{ fontFamily: fonts.regular, color: colors.textMuted, textAlign: 'center' }}>
                  {t('wentThroughAll').replace('{count}', String(debtors.length))}
                </Text>
                <LiquidButton title={t('close')} onPress={closeQueue} variant="glassProminent" style={{ marginTop: 22 }} />
              </View>
            ) : (() => {
              const cust = debtors[queueIndex];
              const bal = balances[cust.id] || 0;
              const preview = buildReminderMessage({ name: cust.name, balance: bal, settings });
              return (
                <>
                  <View style={[s.balanceBanner, { backgroundColor: colors.danger + '10' }]}>
                    <Text style={[s.balanceBannerLabel, { color: colors.textSub }]}>{cust.name}{cust.phone ? ` · ${cust.phone}` : ''}</Text>
                    <Text style={[s.balanceBannerAmt, { color: colors.danger }]}>{formatCurrency(bal, settings.currency)}</Text>
                  </View>
                  {cust.lastRemindedAt ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                      <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                      <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted }}>{t('lastReminded').replace('{time}', remindedAgo(cust.lastRemindedAt) ?? '')}</Text>
                    </View>
                  ) : null}
                  {!cust.phone && (
                    <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.warning, marginBottom: 10 }}>
                      {t('noPhoneSaved')}
                    </Text>
                  )}
                  <Text style={[s.previewBox, { backgroundColor: colors.surfaceHigh, color: colors.textSub, borderColor: colors.border }]}>{preview}</Text>
                  <View style={s.btnRow}>
                    <LiquidHeaderIconButton
                      icon="chevron.left"
                      androidIcon="chevron-back"
                      onPress={queueIndex === 0 ? () => {} : queueBack}
                      color={queueIndex === 0 ? colors.textMuted : colors.text}
                    />
                    <LiquidButton title={t('skip')} onPress={queueAdvance} variant="glass" style={{ flex: 1 }} />
                    {/* No standard SF Symbol for the WhatsApp logo, and
                        LiquidButton doesn't support arbitrary icon images —
                        text-only (WhatsApp-green tint) rather than forcing a
                        mismatched icon or a custom-layout button. */}
                    <LiquidButton title={t('sendAndNext')} onPress={queueSendCurrent} tintColor="#25D366" style={{ flex: 1 }} />
                  </View>
                </>
              );
            })()
          )}
        </ScrollView>
      </LiquidBottomSheet>
    </>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  container: { flex: 1 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 16 },
  summaryLabel: { fontFamily: fonts.medium, fontSize: 12, marginTop: 6 },
  summaryAmount: { fontFamily: fonts.display, fontSize: 18 },
  remindAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  remindAllText: { fontFamily: fonts.bold, fontSize: 12.5, color: '#fff' },
  remindedAgo: { fontFamily: fonts.medium, fontSize: 10.5, marginTop: 5 },
  previewBox: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 14 },
  customerCard: { flexDirection: 'row', borderRadius: 10, padding: 14, marginBottom: 8, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontFamily: fonts.extraBold, fontSize: 22 },
  customerName: { fontFamily: fonts.bold, fontSize: 15 },
  customerPhone: { fontFamily: fonts.regular, fontSize: 12, marginTop: 3 },
  waBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, gap: 4 },
  waBadgeText: { fontFamily: fonts.semiBold, fontSize: 11 },
  balCaption: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  balCaptionText: { fontFamily: fonts.extraBold, fontSize: 11, letterSpacing: 0.5 },
  sheetContent: { paddingHorizontal: 4, paddingBottom: 20 },
  modalTitle: { fontFamily: fonts.extraBold, fontSize: 18, marginBottom: 16 },
  input: { borderRadius: 14, padding: 16, fontSize: 15, borderWidth: 1, marginBottom: 14, fontFamily: fonts.regular },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  balanceBanner: { borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 16 },
  balanceBannerLabel: { fontFamily: fonts.medium, fontSize: 12 },
  balanceBannerAmt: { fontFamily: fonts.display, fontSize: 28, marginTop: 6 },
  txRow: { borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  txNote: { fontFamily: fonts.semiBold, fontSize: 14 },
  txDate: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  txAmt: { fontFamily: fonts.extraBold, fontSize: 16, marginLeft: 8 },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 16, paddingBottom: 20 },
  detailActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 13, borderRadius: 14, gap: 6 },
  billRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  billIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  modePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  modeText: { fontFamily: fonts.extraBold, fontSize: 10, letterSpacing: 0.4 },
});
