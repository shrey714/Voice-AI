import React, { useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../stores/useAppStore';
import { useTranslation } from '../hooks/useTranslation';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import SettingInput from '../components/settings/SettingInput';

export default function ShopInfoScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { settings, updateSettings } = useAppStore();
  const [saved, setSaved] = useState(false);
  const s = makeStyles(colors);

  // Track field values via refs — no state updates while typing
  const refs = useRef({
    shopName: settings.shopName ?? '',
    ownerName: settings.ownerName ?? '',
    phone: settings.phone ?? '',
    address: settings.address ?? '',
    upiId: settings.upiId ?? '',
  });

  const handleSave = async () => {
    await updateSettings({
      shopName: refs.current.shopName.trim() || 'My Shop',
      ownerName: refs.current.ownerName.trim(),
      phone: refs.current.phone.trim(),
      address: refs.current.address.trim(),
      upiId: refs.current.upiId.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
        <Text style={[s.lead, { color: colors.textMuted }]}>
          {t('appearsOnBills')}
        </Text>
        <View style={[s.section, { backgroundColor: colors.surface }]}>
          <SettingInput label={t('shopName')} value={settings.shopName ?? ''} onBlur={(v: string) => { refs.current.shopName = v; }} placeholder="My Shop" colors={colors} autoCapitalize="words" />
          <SettingInput label={t('ownerName')} value={settings.ownerName ?? ''} onBlur={(v: string) => { refs.current.ownerName = v; }} placeholder="Your name" colors={colors} autoCapitalize="words" />
          <SettingInput label={t('phone')} value={settings.phone ?? ''} onBlur={(v: string) => { refs.current.phone = v; }} placeholder="+91 XXXXX XXXXX" keyboardType="phone-pad" colors={colors} />
          <SettingInput label={t('address')} value={settings.address ?? ''} onBlur={(v: string) => { refs.current.address = v; }} placeholder="Shop address" multiline colors={colors} autoCapitalize="sentences" />
          <SettingInput label={t('upiId')} value={settings.upiId ?? ''} onBlur={(v: string) => { refs.current.upiId = v; }} placeholder="yourname@upi" colors={colors} />
        </View>

        <TouchableOpacity style={[s.saveBtn, { backgroundColor: saved ? colors.success : colors.primary }]} onPress={handleSave}>
          <Ionicons name={saved ? 'checkmark-circle' : 'save-outline'} size={20} color="#fff" />
          <Text style={s.saveBtnText}>{saved ? t('savedExcl') : t('save')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  lead: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, padding: 16, paddingBottom: 4 },
  section: { marginHorizontal: 8, marginTop: 8, borderRadius: 14, padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: 16, padding: 16, borderRadius: 16, gap: 8 },
  saveBtnText: { color: '#fff', fontFamily: fonts.extraBold, fontSize: 16 },
});
