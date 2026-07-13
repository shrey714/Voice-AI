import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, Switch } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../stores/useAppStore';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import { BUILTIN_EXPENSE_CATEGORIES, LOCKED_CATEGORIES, LOCKED_UNITS } from '../constants/options';
import SettingInput from '../components/settings/SettingInput';
import { useTranslation } from '../hooks/useTranslation';

// A single editable list: locked/built-in chips (no delete) + removable chips + add row.
function OptionGroup({
  title, hint, icon, items, locked = [], readonly = [], onAdd, onRemove, placeholder, colors,
}: {
  title: string; hint: string; icon: any;
  items: string[]; locked?: string[]; readonly?: string[];
  onAdd: (v: string) => void; onRemove: (v: string) => void;
  placeholder: string; colors: any;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const s = makeStyles(colors);

  const submit = () => {
    const v = draft.trim();
    if (!v) return;
    const exists = [...readonly, ...items].some(x => x.toLowerCase() === v.toLowerCase());
    if (exists) { Alert.alert(t('alreadyExists'), `"${v}" is already in the list.`); return; }
    onAdd(v);
    setDraft('');
  };

  return (
    <View style={[s.section, { backgroundColor: colors.surface }]}>
      <View style={s.sectionHead}>
        <Ionicons name={icon} size={18} color={colors.primary} />
        <Text style={[s.sectionTitle, { color: colors.text }]}>{title}</Text>
      </View>
      <Text style={[s.hint, { color: colors.textMuted }]}>{hint}</Text>

      <View style={s.chips}>
        {readonly.map(item => (
          <View key={`ro-${item}`} style={[s.chip, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
            <Ionicons name="lock-closed" size={11} color={colors.textMuted} />
            <Text style={[s.chipText, { color: colors.textSub }]}>{item}</Text>
          </View>
        ))}
        {items.map(item => {
          const isLocked = locked.includes(item);
          return (
            <View key={item} style={[s.chip, { backgroundColor: colors.primaryLight, borderColor: colors.border }]}>
              <Text style={[s.chipText, { color: colors.text }]}>{item}</Text>
              {isLocked ? (
                <Ionicons name="lock-closed" size={11} color={colors.textMuted} />
              ) : (
                <TouchableOpacity hitSlop={8} onPress={() => onRemove(item)} accessibilityLabel={`Remove ${item}`} accessibilityRole="button">
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>

      <View style={s.addRow}>
        <TextInput
          style={[s.input, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={submit}
          returnKeyType="done"
        />
        <TouchableOpacity style={[s.addBtn, { backgroundColor: colors.primary, opacity: draft.trim() ? 1 : 0.5 }]} disabled={!draft.trim()} onPress={submit} accessibilityLabel={`Add ${title}`} accessibilityRole="button">
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ManageOptionsScreen() {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppStore(
    useShallow(state => ({
      settings: state.settings,
      updateSettings: state.updateSettings,
    }))
  );
  const s = makeStyles(colors);

  const cats = settings.productCategories ?? [];
  const units = settings.units ?? [];
  const customExpense = settings.expenseCategories ?? [];

  const [btEnabled, setBtEnabled] = useState(settings.btScannerEnabled !== false);
  const toggleBt = (val: boolean) => { setBtEnabled(val); updateSettings({ btScannerEnabled: val }); };

  const saveLowStock = (v: string) => updateSettings({ lowStockThreshold: parseInt(v) || 5 });
  const saveDailyGoal = (v: string) => updateSettings({ dailyGoal: parseInt(v) || 0 });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 8, paddingBottom: 140 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={[s.lead, { color: colors.textMuted }]}>
          {t('customizeApp')}
        </Text>

        {/* Alerts */}
        <View style={[s.section, { backgroundColor: colors.surface }]}>
          <View style={s.sectionHead}>
            <Ionicons name="notifications-outline" size={18} color={colors.primary} />
            <Text style={[s.sectionTitle, { color: colors.text }]}>{t('alertsSection')}</Text>
          </View>
          <SettingInput label={t('lowStockAlertThreshold')} value={String(settings.lowStockThreshold ?? 5)} onBlur={saveLowStock} keyboardType="numeric" placeholder="5" colors={colors} />
          <Text style={[s.hint, { color: colors.textMuted }]}>{t('lowStockAlertHint')}</Text>
        </View>

        {/* Goals */}
        <View style={[s.section, { backgroundColor: colors.surface }]}>
          <View style={s.sectionHead}>
            <Ionicons name="flag-outline" size={18} color={colors.primary} />
            <Text style={[s.sectionTitle, { color: colors.text }]}>{t('dailyGoal')}</Text>
          </View>
          <SettingInput label={`${t('dailySalesTarget')} (₹)`} value={settings.dailyGoal ? String(settings.dailyGoal) : ''} onBlur={saveDailyGoal} keyboardType="numeric" placeholder="e.g. 10000" colors={colors} />
          <Text style={[s.hint, { color: colors.textMuted }]}>{t('goalProgressHint')}</Text>
        </View>

        {/* Billing */}
        <View style={[s.section, { backgroundColor: colors.surface }]}>
          <View style={s.sectionHead}>
            <Ionicons name="bluetooth-outline" size={18} color={colors.primary} />
            <Text style={[s.sectionTitle, { color: colors.text }]}>{t('billingSection')}</Text>
          </View>
          <View style={[s.toggleRow, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.text }}>{t('bluetoothScanner')}</Text>
              <Text style={[s.hint, { color: colors.textMuted, marginTop: 2 }]}>{t('bluetoothScannerHint')}</Text>
            </View>
            <Switch value={btEnabled} onValueChange={toggleBt} trackColor={{ true: colors.primary }} thumbColor="#fff" />
          </View>
          <Text style={[s.hint, { color: colors.textMuted }]}>{t('bluetoothScannerHint')}</Text>
        </View>

        <OptionGroup
          title={t('category')} icon="pricetags-outline"
          hint="Used when adding products and filtering inventory."
          items={cats} locked={LOCKED_CATEGORIES}
          onAdd={(v) => updateSettings({ productCategories: [...cats, v] })}
          onRemove={(v) => updateSettings({ productCategories: cats.filter(c => c !== v) })}
          placeholder="e.g. Cosmetics" colors={colors}
        />

        <OptionGroup
          title={t('unitsLabel')} icon="cube-outline"
          hint={t('unitsHint')}
          items={units} locked={LOCKED_UNITS}
          onAdd={(v) => updateSettings({ units: [...units, v] })}
          onRemove={(v) => updateSettings({ units: units.filter(u => u !== v) })}
          placeholder="e.g. quintal" colors={colors}
        />

        <OptionGroup
          title={t('expenseCategories')} icon="wallet-outline"
          hint={t('builtInFixed')}
          items={customExpense}
          readonly={BUILTIN_EXPENSE_CATEGORIES.map(c => c.label)}
          onAdd={(v) => updateSettings({ expenseCategories: [...customExpense, v] })}
          onRemove={(v) => updateSettings({ expenseCategories: customExpense.filter(c => c !== v) })}
          placeholder="e.g. Transport" colors={colors}
        />
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  lead: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, padding: 12, paddingBottom: 4 },
  section: { marginHorizontal: 8, marginTop: 12, borderRadius: 14, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionTitle: { fontFamily: fonts.extraBold, fontSize: 15 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, marginVertical: 10 },
  hint: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  chipText: { fontFamily: fonts.semiBold, fontSize: 13 },
  addRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: { flex: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1, fontFamily: fonts.regular },
  addBtn: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
