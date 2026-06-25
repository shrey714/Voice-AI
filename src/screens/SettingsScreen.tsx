import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, Switch } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { useAppStore } from '../stores/useAppStore';
import { useTranslation } from '../hooks/useTranslation';
import { Language } from '../types';
import { exportBackup, importBackup } from '../services/backup';
import { setupNotifications } from '../services/notifications';
import { setSupabaseCredentials, getSupabaseCredentials, syncToCloud, syncFromCloud } from '../services/cloudSync';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';

const LANGUAGES: { code: Language; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
];

const THEME_MODES: { key: 'light' | 'dark' | 'system'; label: string; icon: string }[] = [
  { key: 'light', label: 'Light', icon: 'sunny-outline' },
  { key: 'dark', label: 'Dark', icon: 'moon-outline' },
  { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
];

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { colors, themeMode, setThemeMode } = useAppTheme();
  const { settings, updateSettings } = useAppStore();
  const [shopName, setShopName] = useState(settings.shopName);
  const [ownerName, setOwnerName] = useState(settings.ownerName);
  const [phone, setPhone] = useState(settings.phone);
  const [address, setAddress] = useState(settings.address);
  const [upiId, setUpiId] = useState(settings.upiId || '');
  const [lowStock, setLowStock] = useState(String(settings.lowStockThreshold));
  const [gstin, setGstin] = useState(settings.gstin || '');
  const [gstRegistered, setGstRegistered] = useState(settings.gstRegistered || false);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [backupWorking, setBackupWorking] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    getSupabaseCredentials().then(c => { if (c) { setSupabaseUrl(c.url); setSupabaseKey(c.key); } });
    setupNotifications();
  }, []);

  const handleSave = async () => {
    const gstinVal = gstin.trim().toUpperCase();
    if (gstinVal && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstinVal)) {
      Alert.alert('Invalid GSTIN', 'GSTIN must be 15 characters in format: 22AAAAA0000A1Z5');
      return;
    }
    await updateSettings({
      shopName: shopName.trim() || 'My Shop',
      ownerName: ownerName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      upiId: upiId.trim(),
      lowStockThreshold: parseInt(lowStock) || 5,
      gstin: gstinVal,
      gstRegistered,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const s = makeStyles(colors);

  return (
    <View style={[{ backgroundColor: colors.bg, flex: 1 }]}>

       <ScrollView
          style={{ flex: 1, backgroundColor: colors.bg }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

      {/* Appearance */}
      <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300 }}
        style={[s.section, { backgroundColor: colors.surface }]}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>Appearance</Text>
        <View style={s.themeRow}>
          {THEME_MODES.map(m => {
            const active = themeMode === m.key;
            return (
              <TouchableOpacity key={m.key}
                style={[s.themeBtn, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primaryLight : colors.surfaceHigh }]}
                onPress={() => setThemeMode(m.key)}>
                <Ionicons name={m.icon as any} size={20} color={active ? colors.primary : colors.textSub} />
                <Text style={[s.themeBtnLabel, { color: active ? colors.primary : colors.textSub }]}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </MotiView>

      {/* Shop Info */}
      <View style={[s.section, { backgroundColor: colors.surface }]}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>Shop Information</Text>
        <SettingInput label={t('shopName')} value={shopName} onChangeText={setShopName} placeholder="My Shop" colors={colors} />
        <SettingInput label={t('ownerName')} value={ownerName} onChangeText={setOwnerName} placeholder="Your name" colors={colors} />
        <SettingInput label={t('phone')} value={phone} onChangeText={setPhone} placeholder="+91 XXXXX XXXXX" keyboardType="phone-pad" colors={colors} />
        <SettingInput label={t('address')} value={address} onChangeText={setAddress} placeholder="Shop address" multiline colors={colors} />
        <SettingInput label={t('upiId')} value={upiId} onChangeText={setUpiId} placeholder="yourname@upi" colors={colors} />
      </View>

      {/* Language */}
      <View style={[s.section, { backgroundColor: colors.surface }]}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>{t('language')}</Text>
        <View style={s.langGrid}>
          {LANGUAGES.map(lang => {
            const active = settings.language === lang.code;
            return (
              <TouchableOpacity key={lang.code}
                style={[s.langBtn, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surfaceHigh }]}
                onPress={() => updateSettings({ language: lang.code })}>
                <Text style={[s.langNative, { color: active ? '#fff' : colors.text }]}>{lang.native}</Text>
                <Text style={[s.langLabel, { color: active ? 'rgba(255,255,255,0.75)' : colors.textMuted }]}>{lang.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* GST */}
      <View style={[s.section, { backgroundColor: colors.surface }]}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>GST Settings</Text>
        <View style={[s.toggleRow, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.text }}>GST Registered</Text>
            <Text style={[s.hint, { color: colors.textMuted, marginTop: 2 }]}>Show CGST+SGST breakdown on invoices</Text>
          </View>
          <Switch value={gstRegistered} onValueChange={setGstRegistered} trackColor={{ true: colors.primary }} thumbColor="#fff" />
        </View>
        {gstRegistered && (
          <>
            <SettingInput label="GSTIN" value={gstin} onChangeText={(v: string) => setGstin(v.toUpperCase())} placeholder="22AAAAA0000A1Z5" colors={colors} />
            <Text style={[s.hint, { color: colors.textMuted }]}>15-character GST Identification Number</Text>
          </>
        )}
        {!gstRegistered && (
          <Text style={[s.hint, { color: colors.textMuted }]}>
            Enable if you are registered under GST. Bills will show as "Tax Invoice" with CGST+SGST split.
          </Text>
        )}
      </View>

      {/* Alerts */}
      <View style={[s.section, { backgroundColor: colors.surface }]}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>Alerts</Text>
        <SettingInput label="Low Stock Alert Threshold" value={lowStock} onChangeText={setLowStock} keyboardType="numeric" placeholder="5" colors={colors} />
        <Text style={[s.hint, { color: colors.textMuted }]}>Alert when stock falls below this number</Text>
      </View>

      {/* AI — env-only notice */}
      <View style={[s.section, { backgroundColor: colors.surface }]}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>AI Features</Text>
        <View style={[s.envCard, { backgroundColor: colors.primaryLight, borderColor: colors.primary + '30' }]}>
          <Ionicons name="key-outline" size={18} color={colors.primary} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={[s.envTitle, { color: colors.primary }]}>API keys are configured in .env</Text>
            <Text style={[s.envBody, { color: colors.textSub }]}>
              Voice transcription (Groq), smart extraction (Gemini), photo recognition (Google Vision), and OpenAI fallback keys are set in the{' '}
              <Text style={{ fontFamily: fonts.bold }}>shopkeeper-app/.env</Text> file and loaded at build time.
            </Text>
          </View>
        </View>
      </View>

      {/* Cloud Sync */}
      <View style={[s.section, { backgroundColor: colors.surface }]}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>Cloud Sync</Text>
        <Text style={[s.hint, { color: colors.textMuted }]}>Sync data across devices. Create a free Supabase project.</Text>
        <SettingInput label="Supabase URL" value={supabaseUrl} onChangeText={setSupabaseUrl} placeholder="https://xxxx.supabase.co" colors={colors} />
        <SettingInput label="Supabase Anon Key" value={supabaseKey} onChangeText={setSupabaseKey} placeholder="eyJhbGciOi..." secureTextEntry colors={colors} />
        <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#2563EB', opacity: (syncing || !supabaseUrl) ? 0.6 : 1 }]}
          disabled={syncing || !supabaseUrl}
          onPress={async () => {
            setSyncing(true);
            try {
              await setSupabaseCredentials(supabaseUrl.trim(), supabaseKey.trim());
              const r = await syncToCloud();
              Alert.alert('Synced to Cloud', `Products: ${r.products}\nBills: ${r.bills}\nExpenses: ${r.expenses}`);
            } catch (e: any) { Alert.alert('Sync Failed', e.message); }
            finally { setSyncing(false); }
          }}>
          <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
          <Text style={s.actionBtnText}>{syncing ? 'Syncing...' : 'Upload to Cloud'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#7C3AED', opacity: (syncing || !supabaseUrl) ? 0.6 : 1 }]}
          disabled={syncing || !supabaseUrl}
          onPress={async () => {
            setSyncing(true);
            try {
              await setSupabaseCredentials(supabaseUrl.trim(), supabaseKey.trim());
              const r = await syncFromCloud();
              Alert.alert('Downloaded from Cloud', `Products: ${r.products}, Bills: ${r.bills}, Expenses: ${r.expenses}`);
            } catch (e: any) { Alert.alert('Sync Failed', e.message); }
            finally { setSyncing(false); }
          }}>
          <Ionicons name="cloud-download-outline" size={18} color="#fff" />
          <Text style={s.actionBtnText}>{syncing ? 'Syncing...' : 'Download from Cloud'}</Text>
        </TouchableOpacity>
      </View>

      {/* Backup */}
      <View style={[s.section, { backgroundColor: colors.surface }]}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>Backup & Restore</Text>
        <Text style={[s.hint, { color: colors.textMuted }]}>Export all products, bills, expenses, customers, and suppliers as JSON.</Text>
        <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.primary, opacity: backupWorking ? 0.6 : 1 }]}
          disabled={backupWorking}
          onPress={async () => {
            setBackupWorking(true);
            try { await exportBackup(); }
            catch { Alert.alert('Error', 'Export failed'); }
            finally { setBackupWorking(false); }
          }}>
          <Ionicons name="download-outline" size={18} color="#fff" />
          <Text style={s.actionBtnText}>Export Backup</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.warning, opacity: backupWorking ? 0.6 : 1 }]}
          disabled={backupWorking}
          onPress={async () => {
            Alert.alert('Import Backup', 'This will ADD data (no duplicates). Continue?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Import', onPress: async () => {
                setBackupWorking(true);
                try {
                  const result = await importBackup();
                  if (result) Alert.alert('Import Complete', `Products: ${result.products}\nBills: ${result.bills}\nExpenses: ${result.expenses}\nCustomers: ${result.customers}\nSuppliers: ${result.suppliers}`);
                } catch (e: any) { Alert.alert('Error', e.message || 'Import failed'); }
                finally { setBackupWorking(false); }
              }},
            ]);
          }}>
          <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
          <Text style={s.actionBtnText}>Import Backup</Text>
        </TouchableOpacity>
      </View>

      {/* Save */}
      <TouchableOpacity style={[s.saveBtn, { backgroundColor: saved ? colors.success : colors.primary }]} onPress={handleSave}>
        <Ionicons name={saved ? 'checkmark-circle' : 'save-outline'} size={20} color="#fff" />
        <Text style={s.saveBtnText}>{saved ? 'Saved!' : t('save')}</Text>
      </TouchableOpacity>

      {/* App Info */}
      <View style={[s.section, { backgroundColor: colors.surface }]}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>App Info</Text>
        {[
          ['Version', '1.0.0'],
          ['Built for', 'India'],
          ['Languages', 'Hindi, English, Kannada, Gujarati'],
          ['Offline', 'Works without internet'],
        ].map(([label, value]) => (
          <View key={label} style={[s.infoRow, { borderBottomColor: colors.border }]}>
            <Text style={[s.infoLabel, { color: colors.textSub }]}>{label}</Text>
            <Text style={[s.infoValue, { color: colors.text }]}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={{ height: 120 }} />
         </ScrollView>
    </View>
  );
}

function SettingInput({ label, value, onChangeText, placeholder, keyboardType, multiline, secureTextEntry, colors }: any) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.textSub, marginBottom: 8 }}>{label}</Text>
      <TextInput
        style={{ backgroundColor: colors.surfaceHigh, borderRadius: 14, padding: 16, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border, fontFamily: fonts.regular, height: multiline ? 90 : undefined, textAlignVertical: multiline ? 'top' : undefined }}
        secureTextEntry={secureTextEntry}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
      />
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  section: { marginHorizontal: 8, marginTop: 8, borderRadius: 10, padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 14 },
  sectionTitle: { fontFamily: fonts.extraBold, fontSize: 15, marginBottom: 16 },
  hint: { fontFamily: fonts.medium, fontSize: 12, marginTop: 6, lineHeight: 18 },
  envCard: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'flex-start' },
  envTitle: { fontFamily: fonts.bold, fontSize: 13 },
  envBody: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  themeRow: { flexDirection: 'row', gap: 12 },
  themeBtn: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 16, borderWidth: 1.5, gap: 6 },
  themeBtnLabel: { fontFamily: fonts.bold, fontSize: 12 },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  langBtn: { flex: 1, minWidth: '45%', padding: 16, borderRadius: 16, borderWidth: 1.5, alignItems: 'center' },
  langNative: { fontFamily: fonts.extraBold, fontSize: 20 },
  langLabel: { fontSize: 12, marginTop: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, borderRadius: 14, marginTop: 12, gap: 8 },
  actionBtnText: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: 16, padding: 16, borderRadius: 16, gap: 8 },
  saveBtnText: { color: '#fff', fontFamily: fonts.extraBold, fontSize: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 0.5 },
  infoLabel: { fontFamily: fonts.medium, fontSize: 14 },
  infoValue: { fontFamily: fonts.semiBold, fontSize: 14, flex: 1, textAlign: 'right' },
});
