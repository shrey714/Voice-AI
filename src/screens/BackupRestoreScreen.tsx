import React, { useState, useLayoutEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { Text } from 'react-native-paper';
import LiquidButton from '../components/common/LiquidButton';
import { exportBackup, importBackup } from '../services/backup';
import BackupSection from '../components/settings/BackupSection';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import { useTranslation } from '../hooks/useTranslation';
import { useConfirm } from '../components/common/ConfirmDialogProvider';

export default function BackupRestoreScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const [backupWorking, setBackupWorking] = useState(false);
  const s = makeStyles(colors);

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
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 140 }}
    >
        <Text style={[s.lead, { color: colors.textMuted }]}>
          {t('keepDataSafe')}
        </Text>

        {/* Cloud backup (phone login + full snapshot incl. images) */}
        <BackupSection colors={colors} />

        {/* Local file backup */}
        <View style={[s.section, { backgroundColor: colors.surface }]}>
          <Text style={[s.title, { color: colors.text }]}>{t('fileBackup')}</Text>
          <Text style={[s.hint, { color: colors.textMuted }]}>{t('fileBackupDesc')}</Text>
          <LiquidButton
            title={t('exportToFile')}
            icon="square.and.arrow.down"
            onPress={async () => {
              setBackupWorking(true);
              try { await exportBackup(); }
              catch { Alert.alert(t('error'), t('exportFailed')); }
              finally { setBackupWorking(false); }
            }}
            disabled={backupWorking}
            variant="glassProminent"
            style={{ marginTop: 12 }}
          />
          <LiquidButton
            title={t('importFromFile')}
            icon="square.and.arrow.up"
            onPress={async () => {
              const ok = await confirm({
                title: t('importBackup'),
                message: t('importBackupConfirm'),
                confirmLabel: t('importWord'),
                cancelLabel: t('cancel'),
              });
              if (!ok) return;
              setBackupWorking(true);
              try {
                const result = await importBackup();
                if (result) Alert.alert(t('importComplete'), `Products: ${result.products}\nBills: ${result.bills}\nExpenses: ${result.expenses}\nCustomers: ${result.customers}\nSuppliers: ${result.suppliers}`);
              } catch (e: any) { Alert.alert('Error', e.message || 'Import failed'); }
              finally { setBackupWorking(false); }
            }}
            disabled={backupWorking}
            variant="glass"
            tintColor={colors.warning}
            style={{ marginTop: 12 }}
          />
        </View>
      </ScrollView>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  lead: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, padding: 16, paddingBottom: 4 },
  section: { marginHorizontal: 8, marginTop: 8, borderRadius: 14, padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  title: { fontFamily: fonts.extraBold, fontSize: 15, marginBottom: 6 },
  hint: { fontFamily: fonts.medium, fontSize: 12, marginBottom: 12, lineHeight: 18 },
});
