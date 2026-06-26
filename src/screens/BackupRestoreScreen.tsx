import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { exportBackup, importBackup } from '../services/backup';
import BackupSection from '../components/settings/BackupSection';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';

export default function BackupRestoreScreen() {
  const { colors } = useAppTheme();
  const [backupWorking, setBackupWorking] = useState(false);
  const s = makeStyles(colors);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
        <Text style={[s.lead, { color: colors.textMuted }]}>
          Keep your shop data safe. Cloud backup syncs across devices; file backup saves a copy you control.
        </Text>

        {/* Cloud backup (phone login + full snapshot incl. images) */}
        <BackupSection colors={colors} />

        {/* Local file backup */}
        <View style={[s.section, { backgroundColor: colors.surface }]}>
          <Text style={[s.title, { color: colors.text }]}>File Backup</Text>
          <Text style={[s.hint, { color: colors.textMuted }]}>Export all data as a JSON file you can share or store yourself.</Text>
          <TouchableOpacity style={[s.btn, { backgroundColor: colors.primary, opacity: backupWorking ? 0.6 : 1 }]}
            disabled={backupWorking}
            onPress={async () => {
              setBackupWorking(true);
              try { await exportBackup(); }
              catch { Alert.alert('Error', 'Export failed'); }
              finally { setBackupWorking(false); }
            }}>
            <Ionicons name="download-outline" size={18} color="#fff" />
            <Text style={s.btnText}>Export to file</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, { backgroundColor: colors.warning, opacity: backupWorking ? 0.6 : 1 }]}
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
            <Text style={s.btnText}>Import from file</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  lead: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, padding: 16, paddingBottom: 4 },
  section: { marginHorizontal: 8, marginTop: 8, borderRadius: 14, padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  title: { fontFamily: fonts.extraBold, fontSize: 15, marginBottom: 6 },
  hint: { fontFamily: fonts.medium, fontSize: 12, marginBottom: 12, lineHeight: 18 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, borderRadius: 14, marginTop: 12, gap: 8 },
  btnText: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },
});
