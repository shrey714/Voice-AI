import React, { useState, useRef, useCallback, useMemo } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import BottomSheet, { BottomSheetScrollView, BottomSheetTextInput, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { useAppStore } from '../stores/useAppStore';
import { useTranslation } from '../hooks/useTranslation';
import { formatCurrency, formatDate, startOfDay, endOfDay } from '../utils/helpers';
import { Expense } from '../types';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import EmptyState from '../components/common/EmptyState';
import CollapsibleFab, { useFabScroll } from '../components/common/CollapsibleFab';
import FadeSlideIn from '../components/common/FadeSlideIn';
import { BUILTIN_EXPENSE_CATEGORIES, CUSTOM_EXPENSE_ICON } from '../constants/options';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

export default function ExpensesScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { expenses, addExpense, deleteExpense, settings, suppliers } = useAppStore();
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

  const formSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['80%'], []);
  const openForm = useCallback(() => formSheetRef.current?.expand(), []);
  const closeForm = useCallback(() => formSheetRef.current?.close(), []);
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} pressBehavior="close" />
    ), []
  );

  const todayTotal = expenses.filter(e => e.createdAt >= startOfDay() && e.createdAt <= endOfDay()).reduce((s, e) => s + e.amount, 0);
  const totalAll = expenses.reduce((s, e) => s + e.amount, 0);

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('Error', 'Please enter a title'); return; }
    if (!amount || parseFloat(amount) <= 0) { Alert.alert('Error', 'Enter a valid amount'); return; }
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

  const handleDelete = (expense: Expense) => {
    if (expense.category === 'supplier') {
      Alert.alert(
        'Warning: Linked Record',
        `Deleting "${expense.title}" only removes it from this list.\n\nThe linked supplier payment or stock receipt will NOT be reversed — your purchase records and outstanding balance stay unchanged.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete Anyway', style: 'destructive', onPress: () => deleteExpense(expense.id) },
        ]
      );
    } else {
      Alert.alert('Delete Expense', `Delete "${expense.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteExpense(expense.id) },
      ]);
    }
  };

  const getCatInfo = (key: string) => CATEGORIES.find(c => c.key === key) || CATEGORIES[4];
  const s = makeStyles(colors);

  return (
   <View style={[{ backgroundColor: colors.bg, flex: 1 }]}>
      {/* Summary bar */}
      <MotiView
        style={[s.summaryBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {[
          { label: 'Today', value: formatCurrency(todayTotal, settings.currency), color: colors.warning },
          { label: 'All Time', value: formatCurrency(totalAll, settings.currency), color: colors.danger },
          { label: 'Entries', value: String(expenses.length), color: colors.primary },
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

      {/* Category chips — flexGrow:0 + alignItems center stops vertical stretch */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll} contentContainerStyle={{ paddingHorizontal: 8, gap: 8, alignItems: 'center' }}>
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

      <FlatList
        data={expenses}
        keyExtractor={e => e.id}
        style={{ flex: 1 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 0, paddingBottom: 120, flexGrow: 1 }}
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
                  <Text style={[s.deleteBtnLabel, { color: colors.danger }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </FadeSlideIn>
          );
        }}
        ListEmptyComponent={<EmptyState icon="wallet-outline" title="No expenses yet" subtitle="Track your shop expenses here" />}
      />

      <CollapsibleFab bottom={90} icon="add" label={t('saveExpense')} extended={extended} onPress={openForm} />

      <BottomSheet
        ref={formSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.primary, width: 40 }}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        <BottomSheetScrollView contentContainerStyle={s.sheetContent}>
          <Text style={[s.modalTitle, { color: colors.text }]}>Add Expense</Text>

          <BottomSheetTextInput style={[s.input, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
            placeholder="Title (e.g. Electricity Bill)" placeholderTextColor={colors.textMuted}
            value={title} onChangeText={setTitle} />

          <BottomSheetTextInput style={[s.input, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
            placeholder={`Amount (${settings.currency})`} placeholderTextColor={colors.textMuted}
            value={amount} onChangeText={setAmount} keyboardType="numeric" />

          <Text style={[s.fieldLabel, { color: colors.textSub }]}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity key={cat.key}
                style={[s.catChip, { flexDirection: 'row', alignItems: 'center', gap: 6, borderColor: category === cat.key ? colors.primary : colors.border, backgroundColor: category === cat.key ? colors.primary : 'transparent' }]}
                onPress={() => setCategory(cat.key)}>
                <Ionicons name={cat.icon} size={14} color={category === cat.key ? '#fff' : colors.primary} />
                <Text style={{ color: category === cat.key ? '#fff' : colors.textSub, fontFamily: fonts.semiBold, fontSize: 13 }}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {category === 'supplier' && suppliers.length > 0 && (
            <>
              <Text style={[s.fieldLabel, { color: colors.textSub }]}>Supplier</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <TouchableOpacity
                  style={[s.catChip, { borderColor: !supplierId ? colors.primary : colors.border, backgroundColor: !supplierId ? colors.primary : 'transparent' }]}
                  onPress={() => setSupplierId('')}>
                  <Text style={{ color: !supplierId ? '#fff' : colors.textSub, fontFamily: fonts.semiBold, fontSize: 13 }}>Any</Text>
                </TouchableOpacity>
                {suppliers.map(sup => (
                  <TouchableOpacity key={sup.id}
                    style={[s.catChip, { flexDirection: 'row', alignItems: 'center', gap: 6, borderColor: supplierId === sup.id ? colors.primary : colors.border, backgroundColor: supplierId === sup.id ? colors.primary : 'transparent' }]}
                    onPress={() => setSupplierId(sup.id)}>
                    <Text style={{ color: supplierId === sup.id ? '#fff' : colors.textSub, fontFamily: fonts.semiBold, fontSize: 13 }}>{sup.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          <BottomSheetTextInput style={[s.input, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
            placeholder="Note (optional)" placeholderTextColor={colors.textMuted}
            value={note} onChangeText={setNote} />

          <View style={s.btnRow}>
            <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.border }]} onPress={closeForm}>
              <Text style={{ color: colors.textSub, fontFamily: fonts.semiBold }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave}>
              <Text style={{ color: '#fff', fontFamily: fonts.bold }}>Save</Text>
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  // Summary bar — bigger values, better spacing
  summaryBar: { flexDirection: 'row',paddingHorizontal: 18, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontFamily: fonts.display, fontSize: 18 },
  summaryLabel: { fontFamily: fonts.medium, fontSize: 12, marginTop: 6 },
  divider: { width: 1, marginVertical: 8 },

  // Category chips — better spacing & styling
  catScroll: { marginVertical: 8, flexGrow: 0 },
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

  sheetContent: { paddingHorizontal: 20, paddingBottom: 40 },
  modalTitle: { fontFamily: fonts.extraBold, fontSize: 18, marginBottom: 16 },
  input: { borderRadius: 14, padding: 16, fontSize: 15, borderWidth: 1, marginBottom: 14, fontFamily: fonts.regular },
  fieldLabel: { fontFamily: fonts.bold, fontSize: 13, marginBottom: 8 },
  catChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5, marginRight: 10 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, padding: 16, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  saveBtn: { flex: 1, padding: 16, borderRadius: 14, alignItems: 'center' },
});
