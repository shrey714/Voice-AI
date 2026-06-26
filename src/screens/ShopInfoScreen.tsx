import React, { useState } from 'react';
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
  const [shopName, setShopName] = useState(settings.shopName);
  const [ownerName, setOwnerName] = useState(settings.ownerName);
  const [phone, setPhone] = useState(settings.phone);
  const [address, setAddress] = useState(settings.address);
  const [upiId, setUpiId] = useState(settings.upiId || '');
  const [saved, setSaved] = useState(false);
  const s = makeStyles(colors);

  const handleSave = async () => {
    await updateSettings({
      shopName: shopName.trim() || 'My Shop',
      ownerName: ownerName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      upiId: upiId.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
        <Text style={[s.lead, { color: colors.textMuted }]}>
          This appears on your bills and UPI QR. Keep it accurate.
        </Text>
        <View style={[s.section, { backgroundColor: colors.surface }]}>
          <SettingInput label={t('shopName')} value={shopName} onChangeText={setShopName} placeholder="My Shop" colors={colors} />
          <SettingInput label={t('ownerName')} value={ownerName} onChangeText={setOwnerName} placeholder="Your name" colors={colors} />
          <SettingInput label={t('phone')} value={phone} onChangeText={setPhone} placeholder="+91 XXXXX XXXXX" keyboardType="phone-pad" colors={colors} />
          <SettingInput label={t('address')} value={address} onChangeText={setAddress} placeholder="Shop address" multiline colors={colors} />
          <SettingInput label={t('upiId')} value={upiId} onChangeText={setUpiId} placeholder="yourname@upi" colors={colors} />
        </View>

        <TouchableOpacity style={[s.saveBtn, { backgroundColor: saved ? colors.success : colors.primary }]} onPress={handleSave}>
          <Ionicons name={saved ? 'checkmark-circle' : 'save-outline'} size={20} color="#fff" />
          <Text style={s.saveBtnText}>{saved ? 'Saved!' : t('save')}</Text>
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
