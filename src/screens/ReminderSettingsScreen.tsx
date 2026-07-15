import React, { useState, useLayoutEffect } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Switch, TextInput } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../stores/useAppStore';
import { ReminderLang, ReminderTone } from '../types';
import { buildReminderMessage, buildReorderMessage } from '../utils/reminder';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import { useTranslation } from '../hooks/useTranslation';

const LANGS: { key: ReminderLang; label: string }[] = [
  { key: 'hi', label: 'हिन्दी' },
  { key: 'hinglish', label: 'Hinglish' },
  { key: 'en', label: 'English' },
];

export default function ReminderSettingsScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppStore(
    useShallow(state => ({
      settings: state.settings,
      updateSettings: state.updateSettings,
    }))
  );
  const s = makeStyles(colors);
  const [template, setTemplate] = useState(settings.reminderTemplate || '');
  const [reorderTpl, setReorderTpl] = useState(settings.reorderTemplate || '');

  const TONES: { key: ReminderTone; label: string; sub: string }[] = [
    { key: 'polite', label: t('polite'), sub: t('friendlyNudge') },
    { key: 'firm', label: t('firm'), sub: t('paySoon') },
  ];

  // Live preview with a sample customer + balance.
  const preview = buildReminderMessage({
    name: 'Ramesh',
    balance: 1250,
    settings: { ...settings, reminderTemplate: template },
  });

  // Live reorder preview with sample items.
  const reorderPreview = buildReorderMessage({
    shop: settings.shopName || 'our shop',
    lang: settings.reorderLang || 'hinglish',
    template: reorderTpl,
    supplier: 'Verma Traders',
    items: [{ name: 'Parle-G', qty: 24, unit: 'pcs' }, { name: 'Amul Milk', qty: 12, unit: 'pcs' }],
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTransparent: true,
      headerStyle: { backgroundColor: 'transparent' },
    });
  }, [navigation]);

  return (
    // `ScrollView` is the root here (no wrapping `View`) — same fix as
    // InventoryScreen/SettingsScreen/ManageOptionsScreen: react-native-screens
    // needs the scroll view reachable as the screen's first native child
    // for `headerTransparent`/`tabBarMinimizeBehavior` to detect it.
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 130 }}
      keyboardShouldPersistTaps="handled"
    >

        <View style={s.sectionHead}>
          <Ionicons name="cash-outline" size={18} color={colors.primary} />
          <Text style={[s.sectionTitle, { color: colors.text }]}>{t('paymentReminder')}</Text>
        </View>

        {/* Language */}
         <Text style={[s.group, { color: colors.textMuted }]}>{t('language')}</Text>
         <View style={[s.card, { backgroundColor: colors.surface }]}>
           <View style={s.segRow}>
             {LANGS.map(l => {
               const active = (settings.reminderLang || 'hinglish') === l.key;
               return (
                 <TouchableOpacity key={l.key}
                   style={[s.seg, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surfaceHigh }]}
                   onPress={() => updateSettings({ reminderLang: l.key })}>
                   <Text style={[s.segText, { color: active ? '#fff' : colors.text }]}>{l.label}</Text>
                 </TouchableOpacity>
               );
             })}
           </View>
         </View>

         {/* Tone */}
         <Text style={[s.group, { color: colors.textMuted }]}>{t('tone')}</Text>
        <View style={[s.card, { backgroundColor: colors.surface }]}>
          <View style={s.segRow}>
            {TONES.map(tn => {
              const active = (settings.reminderTone || 'polite') === tn.key;
              return (
                <TouchableOpacity key={tn.key}
                  style={[s.segTall, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primaryLight : colors.surfaceHigh }]}
                  onPress={() => updateSettings({ reminderTone: tn.key })}>
                  <Text style={[s.segText, { color: active ? colors.primary : colors.text }]}>{tn.label}</Text>
                  <Text style={[s.segSub, { color: colors.textMuted }]}>{tn.sub}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

         {/* UPI */}
         <Text style={[s.group, { color: colors.textMuted }]}>{t('payment')}</Text>
         <View style={[s.card, { backgroundColor: colors.surface, paddingHorizontal: 16 }]}>
           <View style={s.switchRow}>
             <View style={{ flex: 1 }}>
               <Text style={[s.rowLabel, { color: colors.text }]}>{t('includeUpiPayLine')}</Text>
               <Text style={[s.rowSub, { color: colors.textMuted }]}>
                 {settings.upiId ? t('addsUpiLine').replace('{upi}', settings.upiId) : t('setUpiIdFirst')}
               </Text>
             </View>
            <Switch
              value={settings.reminderIncludeUpi && !!settings.upiId}
              disabled={!settings.upiId}
              onValueChange={(v) => updateSettings({ reminderIncludeUpi: v })}
              trackColor={{ true: colors.primary }}
            />
          </View>
        </View>

         {/* Custom template */}
         <Text style={[s.group, { color: colors.textMuted }]}>{t('customMessageOptional')}</Text>
         <View style={[s.card, { backgroundColor: colors.surface, padding: 16 }]}>
           <Text style={[s.rowSub, { color: colors.textMuted, marginBottom: 10 }]}>
             {t('leaveEmptyForPreset')}
           </Text>
           <TextInput
             style={[s.template, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
             value={template}
             onChangeText={setTemplate}
             onEndEditing={() => updateSettings({ reminderTemplate: template.trim() })}
             placeholder="e.g. Namaste {name}, {shop} ka {amount} baaki hai…"
             placeholderTextColor={colors.textMuted}
             multiline
           />
          {template.trim().length > 0 && (
            <TouchableOpacity onPress={() => { setTemplate(''); updateSettings({ reminderTemplate: '' }); }} style={{ alignSelf: 'flex-start', marginTop: 10 }}>
               <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: colors.primary }}>{t('resetToPreset')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Live preview */}
         <Text style={[s.group, { color: colors.textMuted }]}>{t('preview')}</Text>
        <View style={[s.card, { backgroundColor: colors.surface, padding: 16 }]}>
          <View style={[s.bubble, { backgroundColor: '#DCF8C6' }]}>
            <Text style={s.bubbleText}>{preview}</Text>
          </View>
           <Text style={[s.rowSub, { color: colors.textMuted, marginTop: 10 }]}>{t('sampleRameshOwes')}</Text>
         </View>

        {/* ── Stock reorder ── */}
        <View style={[s.sectionHead, { marginTop: 28 }]}>
          <Ionicons name="cube-outline" size={18} color={colors.primary} />
           <Text style={[s.sectionTitle, { color: colors.text }]}>{t('stockReorder')}</Text>
        </View>

         {/* Reorder language */}
         <Text style={[s.group, { color: colors.textMuted }]}>{t('language')}</Text>
        <View style={[s.card, { backgroundColor: colors.surface }]}>
          <View style={s.segRow}>
            {LANGS.map(l => {
              const active = (settings.reorderLang || 'hinglish') === l.key;
              return (
                <TouchableOpacity key={l.key}
                  style={[s.seg, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surfaceHigh }]}
                  onPress={() => updateSettings({ reorderLang: l.key })}>
                  <Text style={[s.segText, { color: active ? '#fff' : colors.text }]}>{l.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

         {/* Reorder custom template */}
         <Text style={[s.group, { color: colors.textMuted }]}>{t('customMessageOptional')}</Text>
         <View style={[s.card, { backgroundColor: colors.surface, padding: 16 }]}>
           <Text style={[s.rowSub, { color: colors.textMuted, marginBottom: 10 }]}>
             {t('leaveEmptyForReorderPreset')}
           </Text>
          <TextInput
            style={[s.template, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
            value={reorderTpl}
            onChangeText={setReorderTpl}
            onEndEditing={() => updateSettings({ reorderTemplate: reorderTpl.trim() })}
             placeholder={t('reorderPlaceholderExample')}
             placeholderTextColor={colors.textMuted}
             multiline
           />
           {reorderTpl.trim().length > 0 && (
             <TouchableOpacity onPress={() => { setReorderTpl(''); updateSettings({ reorderTemplate: '' }); }} style={{ alignSelf: 'flex-start', marginTop: 10 }}>
               <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: colors.primary }}>{t('resetToPreset')}</Text>
             </TouchableOpacity>
           )}
         </View>

         {/* Reorder preview */}
         <Text style={[s.group, { color: colors.textMuted }]}>{t('preview')}</Text>
         <View style={[s.card, { backgroundColor: colors.surface, padding: 16 }]}>
           <View style={[s.bubble, { backgroundColor: '#DCF8C6' }]}>
             <Text style={s.bubbleText}>{reorderPreview}</Text>
           </View>
           <Text style={[s.rowSub, { color: colors.textMuted, marginTop: 10 }]}>{t('sampleItemsForSupplier')}</Text>
         </View>
      </ScrollView>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 16, marginTop: 18 },
  sectionTitle: { fontFamily: fonts.extraBold, fontSize: 18 },
  group: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, marginLeft: 24, marginTop: 22, marginBottom: 8 },
  card: { marginHorizontal: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, overflow: 'hidden' },
  segRow: { flexDirection: 'row', gap: 10, padding: 14 },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1.5 },
  segTall: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, gap: 3 },
  segText: { fontFamily: fonts.bold, fontSize: 14 },
  segSub: { fontFamily: fonts.medium, fontSize: 11 },
  switchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  rowLabel: { fontFamily: fonts.bold, fontSize: 15 },
  rowSub: { fontFamily: fonts.medium, fontSize: 12, marginTop: 2, lineHeight: 17 },
  template: { borderRadius: 14, borderWidth: 1, padding: 14, minHeight: 110, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, textAlignVertical: 'top' },
  bubble: { borderRadius: 14, borderTopLeftRadius: 4, padding: 12, alignSelf: 'flex-start', maxWidth: '92%' },
  bubbleText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: '#1f2c34' },
});
