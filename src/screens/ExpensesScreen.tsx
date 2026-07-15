import React, { useState, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Alert, ScrollView, Platform } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import LiquidBottomSheet, { LiquidBottomSheetRef } from '../components/common/LiquidBottomSheet';
import LiquidTextField from '../components/common/LiquidTextField';
import LiquidButton from '../components/common/LiquidButton';
import SheetHeader from '../components/common/SheetHeader';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../stores/useAppStore';
import { useTranslation } from '../hooks/useTranslation';
import { formatCurrency, formatDate, startOfDay, endOfDay, sanitizeDecimal } from '../utils/helpers';
import { Expense } from '../types';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import EmptyState from '../components/common/EmptyState';
import CollapsibleFab, { useFabScroll } from '../components/common/CollapsibleFab';
import FadeSlideIn from '../components/common/FadeSlideIn';
import { BUILTIN_EXPENSE_CATEGORIES, CUSTOM_EXPENSE_ICON } from '../constants/options';
import { useConfirm } from '../components/common/ConfirmDialogProvider';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

export default function ExpensesScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { confirm } = useConfirm();
  const { expenses, addExpense, deleteExpense, settings, suppliers } = useAppStore(
    useShallow(state => ({
      expenses: state.expenses,
      addExpense: state.addExpense,
      deleteExpense: state.deleteExpense,
      settings: state.settings,
      suppliers: state.suppliers,
    }))
  );
  // Built-in categories + the user's custom ones (managed in Manage Lists).
  const CATEGORIES = useMemo<{ key: string; label: string; icon: IoniconsName }[]>(() => [
    ...BUILTIN_EXPENSE_CATEGORIES,
    ...(settings.expenseCategories ?? []).map(label => ({ key: label, label, icon: CUSTOM_EXPENSE_ICON })),
  ], [settings.expenseCategories]);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Expense['category']>('other');
  const [note, setNote] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const { extended, onScroll } = useFabScroll();

  const formSheetRef = useRef<LiquidBottomSheetRef>(null);
  const openForm = useCallback(() => formSheetRef.current?.expand(), []);
  const closeForm = useCallback(() => formSheetRef.current?.close(), []);

  // `bottomAccessory` (iOS 26+ only) — same conversion as InventoryScreen.
  useLayoutEffect(() => {
    if (Platform.OS !== 'ios') return;
    navigation.getParent()?.setOptions({
      bottomAccessory: ({ placement }: { placement: 'regular' | 'inline' }) =>
            <TouchableOpacity
              onPress={openForm}
              style={{ width: '100%', height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 24, paddingHorizontal: 18 }}
              accessibilityLabel={t('saveExpense')}
              accessibilityRole="button"
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 14 }}>{t('saveExpense')}</Text>
            </TouchableOpacity>
    });
  }, [navigation, openForm, colors, t]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTransparent: true,
      headerStyle: { backgroundColor: 'transparent' },
    });
  }, [navigation]);

  const todayTotal = expenses.filter(e => e.createdAt >= startOfDay() && e.createdAt <= endOfDay()).reduce((s, e) => s + e.amount, 0);
  const totalAll = expenses.reduce((s, e) => s + e.amount, 0);

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert(t('error'), t('enterTitle')); return; }
    if (!amount || parseFloat(amount) <= 0) { Alert.alert(t('error'), t('enterValidAmount')); return; }
    await addExpense({
      title: title.trim(),
      amount: parseFloat(amount),
      category,
      note: note.trim() || undefined,
      supplierId: category === 'supplier' && supplierId ? supplierId : undefined,
    });
    setTitle(''); setAmount(''); setNote(''); setCategory('other'); setSupplierId('');
    closeForm();
  };

  const handleDelete = async (expense: Expense) => {
    const ok = expense.category === 'supplier'
      ? await confirm({
          title: t('warningLinkedRecord'),
          message: t('deleteLinkedMsg').replace('{title}', expense.title),
          confirmLabel: t('deleteAnyway'),
          cancelLabel: t('cancel'),
          destructive: true,
        })
      : await confirm({
          title: t('deleteExpense'),
          message: t('deleteExpenseConfirm').replace('{title}', expense.title),
          confirmLabel: t('delete'),
          cancelLabel: t('cancel'),
          destructive: true,
        });
    if (ok) deleteExpense(expense.id);
  };

  const getCatInfo = (key: string) => CATEGORIES.find(c => c.key === key) || CATEGORIES[4];
  const s = makeStyles(colors);

  return (
    <>
    {/* `FlatList` is a direct child here, not wrapped in an extra `View` —
        same fix as InventoryScreen/BillHistoryScreen: react-native-screens
        needs the scroll view reachable as the screen's first native child.
        Summary bar + category strip (previously a `ScrollHideBar` sibling,
        needing that wrapper to clip its slide animation) both moved into
        `ListHeaderComponent` — the category strip no longer auto-hides on
        scroll-down, it scrolls away with the list now, same trade-off as
        BillHistoryScreen/OnlineOrdersScreen. */}
    <FlatList
      data={expenses}
      keyExtractor={e => e.id}
      style={{ flex: 1, backgroundColor: colors.bg }}
      scrollEventThrottle={16}
      initialNumToRender={12}
      maxToRenderPerBatch={10}
      windowSize={7}
      removeClippedSubviews
      contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 8, paddingBottom: 120, flexGrow: 1 }}
      ListHeaderComponent={
        <>
          {/* Summary bar */}
          <MotiView style={[s.summaryBar, { backgroundColor: colors.surface }]}>
            {[
              { label: t('today'), value: formatCurrency(todayTotal, settings.currency), color: colors.warning },
              { label: t('allTime'), value: formatCurrency(totalAll, settings.currency), color: colors.danger },
              { label: t('entries'), value: String(expenses.length), color: colors.primary },
            ].map((item, i) => (
              <React.Fragment key={item.label}>
                {i > 0 && <View style={[s.divider, { backgroundColor: colors.border }]} />}
                <View style={s.summaryItem}>
                  <Text style={[s.summaryValue, { color: item.color }]}>{item.value}</Text>
                  <Text style={[s.summaryLabel, { color: colors.textMuted }]}>{item.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </MotiView>

          {/* Category strip */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll} contentContainerStyle={{ gap: 8, paddingVertical: 8, alignItems: 'center' }}>
            {CATEGORIES.map(cat => {
              const total = expenses.filter(e => e.category === cat.key).reduce((s, e) => s + e.amount, 0);
              return (
                <View key={cat.key} style={[s.catCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name={cat.icon} size={22} color={colors.primary} />
                  <View>
                    <Text style={[s.catLabel, { color: colors.textSub }]}>{cat.label}</Text>
                    <Text style={[s.catAmt, { color: colors.text }]}>{formatCurrency(total, settings.currency)}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </>
      }
      renderItem={({ item, index }) => {
          const cat = getCatInfo(item.category);
          return (
            <FadeSlideIn index={index} style={[s.expenseCard, { backgroundColor: colors.surface }]}>
              <View style={[s.expenseIconBox, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name={cat.icon} size={22} color={colors.primary} />
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.expenseTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
                <Text style={[s.expenseMeta, { color: colors.textMuted }]}>
                  {item.category === 'supplier' && item.supplierId
                    ? (suppliers.find(sup => sup.id === item.supplierId)?.name ?? cat.label)
                    : cat.label} · {formatDate(item.createdAt)}
                </Text>
                {item.note ? <Text style={[s.expenseNote, { color: colors.textSub }]} numberOfLines={1}>{item.note}</Text> : null}
              </View>

              {/* Amount + delete — vertically centered, delete gets its own row */}
              <View style={s.cardRight}>
                <Text style={[s.expenseAmt, { color: colors.danger }]}>{formatCurrency(item.amount, settings.currency)}</Text>
                <TouchableOpacity
                  onPress={() => handleDelete(item)}
                  style={[s.deleteBtn, { backgroundColor: colors.danger + '14', borderColor: colors.danger + '35' }]}
                  hitSlop={6}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.danger} />
                  <Text style={[s.deleteBtnLabel, { color: colors.danger }]}>{t('delete')}</Text>
                </TouchableOpacity>
              </View>
            </FadeSlideIn>
          );
        }}
      ListEmptyComponent={<EmptyState icon="wallet-outline" title={t('noExpensesYet')} subtitle={t('trackExpensesHere')} />}
    />

    {/* iOS gets the native `bottomAccessory` (set up above via
        `navigation.getParent()?.setOptions`) instead — Android has no such
        API, so it keeps this floating overlay. */}
    {Platform.OS !== 'ios' && (
      <CollapsibleFab bottom={24} icon="add" label={t('saveExpense')} extended={extended} onPress={openForm} />
    )}

    <LiquidBottomSheet ref={formSheetRef}>
        <SheetHeader title={t('addExpense')} onClose={closeForm} />
        <ScrollView contentContainerStyle={s.sheetContent}>
          <LiquidTextField
            placeholder={t('titlePlaceholder')}
            value={title} onChangeText={setTitle} style={{ marginBottom: 14 }} />

          <LiquidTextField
            placeholder={t('amountPlaceholder').replace('{currency}', settings.currency)}
            value={amount} onChangeText={v => setAmount(sanitizeDecimal(v))} keyboardType="numeric" style={{ marginBottom: 14 }} />

          <Text style={[s.fieldLabel, { color: colors.textSub }]}>{t('category')}</Text>
          <View style={s.chipWrap}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity key={cat.key}
                style={[s.catChip, { flexDirection: 'row', alignItems: 'center', gap: 6, borderColor: category === cat.key ? colors.primary : colors.border, backgroundColor: category === cat.key ? colors.primary : colors.surfaceHigh }]}
                onPress={() => setCategory(cat.key)}>
                <Ionicons name={cat.icon} size={14} color={category === cat.key ? '#fff' : colors.primary} />
                <Text style={{ color: category === cat.key ? '#fff' : colors.textSub, fontFamily: fonts.semiBold, fontSize: 13 }}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {category === 'supplier' && suppliers.length > 0 && (
            <>
              <Text style={[s.fieldLabel, { color: colors.textSub }]}>{t('supplier')}</Text>
              <View style={s.chipWrap}>
                <TouchableOpacity
                  style={[s.catChip, { borderColor: !supplierId ? colors.primary : colors.border, backgroundColor: !supplierId ? colors.primary : colors.surfaceHigh }]}
                  onPress={() => setSupplierId('')}>
                  <Text style={{ color: !supplierId ? '#fff' : colors.textSub, fontFamily: fonts.semiBold, fontSize: 13 }}>{t('any')}</Text>
                </TouchableOpacity>
                {suppliers.map(sup => (
                  <TouchableOpacity key={sup.id}
                    style={[s.catChip, { flexDirection: 'row', alignItems: 'center', gap: 6, borderColor: supplierId === sup.id ? colors.primary : colors.border, backgroundColor: supplierId === sup.id ? colors.primary : colors.surfaceHigh }]}
                    onPress={() => setSupplierId(sup.id)}>
                    <Text style={{ color: supplierId === sup.id ? '#fff' : colors.textSub, fontFamily: fonts.semiBold, fontSize: 13 }}>{sup.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <LiquidTextField
            placeholder={t('noteOptional')}
            value={note} onChangeText={setNote} style={{ marginBottom: 14 }} />

          <LiquidButton title={t('save')} onPress={handleSave} variant="glassProminent" style={s.btnRow} />
        </ScrollView>
      </LiquidBottomSheet>
    </>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  // Summary bar — bigger values, better spacing
  summaryBar: { flexDirection: 'row',paddingHorizontal: 18, paddingVertical: 11, borderRadius: 16 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontFamily: fonts.display, fontSize: 18 },
  summaryLabel: { fontFamily: fonts.medium, fontSize: 12, marginTop: 6 },
  divider: { width: 1, marginVertical: 8 },

  catScroll: { flexGrow: 0 },
  catCard: { alignItems: 'center', flexDirection: 'row' , paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, gap: 10 },
  catLabel: { fontFamily: fonts.bold, fontSize: 12 },
  catAmt: { fontFamily: fonts.bold, fontSize: 13 },

  // Expense list cards — cleaner & more spaced
  expenseCard: { flexDirection: 'row', borderRadius: 10, padding: 14, marginBottom: 8, alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  expenseIconBox: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  expenseTitle: { fontFamily: fonts.bold, fontSize: 15 },
  expenseMeta: { fontFamily: fonts.regular, fontSize: 12, marginTop: 3 },
  expenseNote: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2, fontStyle: 'italic' },
  expenseAmt: { fontFamily: fonts.extraBold, fontSize: 16 },
  cardRight: { alignItems: 'flex-end', gap: 8, paddingLeft: 4 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  deleteBtnLabel: { fontFamily: fonts.semiBold, fontSize: 11 },

  sheetContent: { paddingHorizontal: 4, paddingBottom: 20 },
  input: { borderRadius: 14, padding: 16, fontSize: 15, borderWidth: 1, marginBottom: 14, fontFamily: fonts.regular },
  fieldLabel: { fontFamily: fonts.bold, fontSize: 13, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  catChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5 },
  btnRow: { marginTop: 8 },
});
