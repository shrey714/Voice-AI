import React, { useEffect } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { useAppStore } from '../stores/useAppStore';
import { useTranslation } from '../hooks/useTranslation';
import { Language } from '../types';
import { setupNotifications } from '../services/notifications';
import { signOut } from '../services/cloudSync';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import { useScreenRadius } from '../utils/screenRadius';

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

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

export default function SettingsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { colors, themeMode, setThemeMode } = useAppTheme();
  const { settings, updateSettings, resetApp } = useAppStore();
  const s = makeStyles(colors);
  const radius = useScreenRadius();

  useEffect(() => { setupNotifications(); }, []);

  const handleLogout = () => {
    Alert.alert('Log out of cloud backup?', 'Your data stays on this device. You can log back in anytime to sync.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: async () => { await signOut(); Alert.alert('Logged out', 'You are signed out of cloud backup.'); } },
    ]);
  };

  const handleReset = () => {
    Alert.alert('Reset app?', 'This permanently deletes ALL local data — products, bills, expenses, customers, suppliers and settings. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset everything', style: 'destructive', onPress: () => {
        Alert.alert('Are you absolutely sure?', 'Tip: take a backup first if you might need this data later.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Yes, erase all', style: 'destructive', onPress: () => resetApp() },
        ]);
      } },
    ]);
  };

  const NavRow = ({ icon, label, sub, onPress, last }: { icon: IoniconsName; label: string; sub: string; onPress: () => void; last?: boolean }) => (
    <TouchableOpacity style={[s.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.iconTile, { backgroundColor: colors.primaryLight }]}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[s.rowSub, { color: colors.textMuted }]}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <View style={{ backgroundColor: colors.bg, flex: 1 }}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>

        {/* Shop profile card → Shop Information */}
        <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 280 }}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('ShopInfo')}
            style={[s.profileCard, { backgroundColor: colors.surface }]}>
            <View style={[s.avatar, { backgroundColor: colors.primary }]}>
              <Ionicons name="storefront" size={26} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.shopName, { color: colors.text }]} numberOfLines={1}>{settings.shopName || 'My Shop'}</Text>
              <Text style={[s.shopSub, { color: colors.textMuted }]} numberOfLines={1}>
                {settings.ownerName || settings.phone || 'Tap to edit shop details'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </MotiView>

        {/* Navigation group */}
        <Text style={[s.groupLabel, { color: colors.textMuted }]}>MANAGE</Text>
        <View style={[s.card, { backgroundColor: colors.surface }]}>
          <NavRow icon="options-outline" label="Preferences" sub="Categories, units, GST & alerts" onPress={() => navigation.navigate('ManageOptions')} />
          <NavRow icon="share-outline" label="Export Reports" sub="PDF & CSV · P&L, GST, inventory" onPress={() => navigation.navigate('Exports')} />
          <NavRow icon="cloud-upload-outline" label="Backup & Restore" sub="Cloud sync & file backup" onPress={() => navigation.navigate('BackupRestore')} />
          <NavRow icon="sparkles-outline" label="Run setup again" sub="Re-enter your shop details" onPress={() => updateSettings({ onboardingDone: false })} last />
        </View>

        {/* Appearance */}
        <Text style={[s.groupLabel, { color: colors.textMuted }]}>APPEARANCE</Text>
        <View style={[s.card, { backgroundColor: colors.surface, padding: 16 }]}>
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
        </View>

        {/* Language */}
        <Text style={[s.groupLabel, { color: colors.textMuted }]}>{t('language').toUpperCase()}</Text>
        <View style={[s.card, { backgroundColor: colors.surface, padding: 16 }]}>
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

        {/* App Info */}
        <Text style={[s.groupLabel, { color: colors.textMuted }]}>ABOUT</Text>
        <View style={[s.card, { backgroundColor: colors.surface, paddingHorizontal: 16 }]}>
          {[
            ['Version', '1.0.0'],
            ['Built for', 'India'],
            ['Offline', 'Works without internet'],
            ['Border radius', radius]
          ].map(([label, value], i, arr) => (
            <View key={label} style={[s.infoRow, i < arr.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
              <Text style={[s.infoLabel, { color: colors.textSub }]}>{label}</Text>
              <Text style={[s.infoValue, { color: colors.text }]}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Account / danger */}
        <Text style={[s.groupLabel, { color: colors.textMuted }]}>ACCOUNT</Text>
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity style={[s.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]} onPress={handleLogout} activeOpacity={0.7}>
            <View style={[s.iconTile, { backgroundColor: colors.surfaceHigh }]}>
              <Ionicons name="log-out-outline" size={20} color={colors.textSub} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowLabel, { color: colors.text }]}>Log out</Text>
              <Text style={[s.rowSub, { color: colors.textMuted }]}>Sign out of cloud backup</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={s.row} onPress={handleReset} activeOpacity={0.7}>
            <View style={[s.iconTile, { backgroundColor: colors.danger + '22' }]}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowLabel, { color: colors.danger }]}>Reset app</Text>
              <Text style={[s.rowSub, { color: colors.textMuted }]}>Erase all data & start over</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 12, marginTop: 14, padding: 16, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  shopName: { fontFamily: fonts.extraBold, fontSize: 18 },
  shopSub: { fontFamily: fonts.medium, fontSize: 13, marginTop: 2 },

  groupLabel: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, marginLeft: 24, marginTop: 22, marginBottom: 8 },
  card: { marginHorizontal: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, overflow: 'hidden' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, padding: 14 },
  iconTile: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontFamily: fonts.bold, fontSize: 15 },
  rowSub: { fontFamily: fonts.medium, fontSize: 12, marginTop: 1 },

  themeRow: { flexDirection: 'row', gap: 12 },
  themeBtn: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 16, borderWidth: 1.5, gap: 6 },
  themeBtnLabel: { fontFamily: fonts.bold, fontSize: 12 },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  langBtn: { flex: 1, minWidth: '45%', padding: 16, borderRadius: 16, borderWidth: 1.5, alignItems: 'center' },
  langNative: { fontFamily: fonts.extraBold, fontSize: 20 },
  langLabel: { fontSize: 12, marginTop: 4 },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14 },
  infoLabel: { fontFamily: fonts.medium, fontSize: 14 },
  infoValue: { fontFamily: fonts.semiBold, fontSize: 14 },
});
