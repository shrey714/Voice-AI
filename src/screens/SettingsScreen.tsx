import React, { useEffect, useLayoutEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../stores/useAppStore';
import { useTranslation } from '../hooks/useTranslation';
import { Language } from '../types';
import { setupNotifications } from '../services/notifications';
import { supabase } from '../lib/supabase';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import { useScreenRadius } from '../utils/screenRadius';
import { useConfirm } from '../components/common/ConfirmDialogProvider';

const LANGUAGES: { code: Language; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
];

const THEME_MODE_KEYS = [
  { key: 'light' as const, labelKey: 'light' as const, icon: 'sunny-outline' },
  { key: 'dark' as const, labelKey: 'dark' as const, icon: 'moon-outline' },
  { key: 'system' as const, labelKey: 'system' as const, icon: 'phone-portrait-outline' },
];

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

export default function SettingsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { colors, themeMode, setThemeMode } = useAppTheme();
  const { settings, updateSettings, resetApp, factoryReset } = useAppStore(
    useShallow(state => ({
      settings: state.settings,
      updateSettings: state.updateSettings,
      resetApp: state.resetApp,
      factoryReset: state.factoryReset,
    }))
  );
  const { confirm } = useConfirm();
  const s = makeStyles(colors);
  const radius = useScreenRadius();
  const [erasing, setErasing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => { setupNotifications(); }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTransparent: true,
      headerStyle: { backgroundColor: 'transparent' },
    });
  }, [navigation]);

  // Erase data only clears business records — products, bills, expenses,
  // customers, suppliers. Shop profile (name, phone, UPI, GST) is kept, and
  // the user stays signed in.
  const handleEraseData = async () => {
    const ok = await confirm({
      title: t('eraseDataConfirmTitle'),
      message: t('eraseDataConfirmMsg'),
      confirmLabel: t('eraseData'),
      cancelLabel: t('cancel'),
      destructive: true,
    });
    if (!ok) return;
    setErasing(true);
    try { await resetApp(); } finally { setErasing(false); }
  };

  // Logging out is a full factory reset: every table including settings, so
  // onboarding runs again for whoever uses the device next. Online-shop
  // orders live in the cloud and come back on re-login.
  const handleLogout = async () => {
    const ok = await confirm({
      title: t('logOutConfirmTitle'),
      message: t('logOutConfirmMsg'),
      confirmLabel: t('logOut'),
      cancelLabel: t('cancel'),
      destructive: true,
    });
    if (!ok) return;
    setLoggingOut(true);
    try {
      await factoryReset();
      await supabase.auth.signOut();
    } finally { setLoggingOut(false); }
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
    // `ScrollView` is the root here (no wrapping `View`, and the profile
    // card moved to be its first child instead of a sibling before it) —
    // same fix as InventoryScreen/ShopInfoScreen: react-native-screens
    // needs the scroll view reachable as the screen's first native child
    // for `headerTransparent`/`tabBarMinimizeBehavior` to detect it, and a
    // non-scrollable sibling in front of it blocks that.
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 130 }}
    >
        {/* Shop profile card → Shop Information */}
        <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 280 }}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('ShopInfo')}
            style={[s.profileCard, { backgroundColor: colors.surface }]}>
            <View style={[s.avatar, { backgroundColor: colors.primary }]}>
              <Ionicons name="storefront" size={26} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.shopName, { color: colors.text }]} numberOfLines={1}>{settings.shopName || t('myShop')}</Text>
              <Text style={[s.shopSub, { color: colors.textMuted }]} numberOfLines={1}>
                {settings.ownerName || settings.phone || t('tapToEditShopDetails')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </MotiView>

        {/* Navigation group */}
        <Text style={[s.groupLabel, { color: colors.textMuted }]}>{t('manage').toUpperCase()}</Text>
        <View style={[s.card, { backgroundColor: colors.surface }]}>
          <NavRow icon="options-outline" label={t('preferences')} sub={t('preferencesSub')} onPress={() => navigation.navigate('ManageOptions')} />
          <NavRow icon="logo-whatsapp" label={t('whatsappMessages')} sub={t('whatsappMessagesSub')} onPress={() => navigation.navigate('ReminderSettings')} />
          <NavRow icon="share-outline" label={t('exportReports')} sub={t('exportReportsSub')} onPress={() => navigation.navigate('Exports')} />
          <NavRow icon="cloud-upload-outline" label={t('backupRestore')} sub={t('backupRestoreSub')} onPress={() => navigation.navigate('BackupRestore')} />
          <NavRow icon="sparkles-outline" label={t('runSetupAgain')} sub={t('runSetupAgainSub')} onPress={() => updateSettings({ onboardingDone: false })} last />
        </View>

        {/* Appearance */}
        <Text style={[s.groupLabel, { color: colors.textMuted }]}>{t('appearance').toUpperCase()}</Text>
        <View style={[s.card, { backgroundColor: colors.surface, padding: 16 }]}>
          <View style={s.themeRow}>
            {THEME_MODE_KEYS.map(m => {
              const active = themeMode === m.key;
              return (
                <TouchableOpacity key={m.key}
                  style={[s.themeBtn, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primaryLight : colors.surfaceHigh }]}
                  onPress={() => setThemeMode(m.key)}>
                  <Ionicons name={m.icon as any} size={20} color={active ? colors.primary : colors.textSub} />
                  <Text style={[s.themeBtnLabel, { color: active ? colors.primary : colors.textSub }]}>{t(m.labelKey)}</Text>
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
         <Text style={[s.groupLabel, { color: colors.textMuted }]}>{t('about').toUpperCase()}</Text>
         <View style={[s.card, { backgroundColor: colors.surface, paddingHorizontal: 16 }]}>
           {[
             [t('version'), '1.0.0'],
             [t('builtFor'), t('india')],
             [t('offline'), t('worksWithoutInternet')],
             ['Border radius', radius]
           ].map(([label, value], i, arr) => (
             <View key={label} style={[s.infoRow, i < arr.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
               <Text style={[s.infoLabel, { color: colors.textSub }]}>{label}</Text>
               <Text style={[s.infoValue, { color: colors.text }]}>{value}</Text>
             </View>
           ))}
         </View>

         {/* Account / danger */}
         <Text style={[s.groupLabel, { color: colors.textMuted }]}>{t('account').toUpperCase()}</Text>
         <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
           <TouchableOpacity style={[s.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]} onPress={handleEraseData} activeOpacity={0.7} disabled={erasing}>
             <View style={[s.iconTile, { backgroundColor: colors.danger + '22' }]}>
               <Ionicons name="trash-outline" size={20} color={colors.danger} />
             </View>
             <View style={{ flex: 1 }}>
               <Text style={[s.rowLabel, { color: colors.danger }]}>{t('eraseData')}</Text>
               <Text style={[s.rowSub, { color: colors.textMuted }]}>{t('eraseDataSub')}</Text>
             </View>
             {erasing ? <ActivityIndicator color={colors.danger} /> : <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
           </TouchableOpacity>
           <TouchableOpacity style={s.row} onPress={handleLogout} activeOpacity={0.7} disabled={loggingOut}>
             <View style={[s.iconTile, { backgroundColor: colors.danger + '22' }]}>
               <Ionicons name="log-out-outline" size={20} color={colors.danger} />
             </View>
             <View style={{ flex: 1 }}>
               <Text style={[s.rowLabel, { color: colors.danger }]}>{t('logOut')}</Text>
               <Text style={[s.rowSub, { color: colors.textMuted }]}>{t('logOutSub')}</Text>
             </View>
             {loggingOut ? <ActivityIndicator color={colors.danger} /> : <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
           </TouchableOpacity>
         </View>
      </ScrollView>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 18 },
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
