import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts } from '../../theme/typography';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { backupNow, restoreNow, getBackupMeta } from '../../services/cloudSync';
import { useAppStore } from '../../stores/useAppStore';
import { BackupSectionSkeleton } from '../common/Skeleton';

// Pull every loader so a restore refreshes the whole in-memory store at once.
function reloadAllStores() {
  const s = useAppStore.getState();
  return Promise.all([
    s.loadProducts(), s.loadBills(), s.loadExpenses(), s.loadReturns(),
    s.loadTemplates(), s.loadSuppliers(), s.loadPurchases(),
    s.loadSupplierLedger(), s.loadSettings(), s.loadActiveStockTake(),
  ]);
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'No cloud backup yet';
  const d = new Date(iso);
  return `Last backed up ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function BackupSection({ colors }: { colors: any }) {
  const s = makeStyles(colors);
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  const imgProgress = (verb: string) => (done: number, total: number) =>
    setStatus(total > 0 ? `${verb} images ${done}/${total}` : '');

  useEffect(() => {
    (async () => {
      try {
        if (session) {
          const meta = await getBackupMeta();
          setLastBackup(meta.updatedAt);
        }
      } catch { /* offline / not configured */ }
      finally { setLoading(false); }
    })();
  }, [session]);

  const handleBackup = async () => {
    setBusy(true);
    try {
      const r = await backupNow(imgProgress('Uploading'));
      setLastBackup(r.updatedAt);
      Alert.alert('Backup complete', 'Your data and product photos are safely backed up.');
    } catch (e: any) { Alert.alert('Backup failed', e.message); }
    finally { setBusy(false); setStatus(''); }
  };

  const handleRestore = () => {
    Alert.alert(
      'Restore from cloud?',
      'This will REPLACE the data on this device with your last cloud backup. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore', style: 'destructive', onPress: async () => {
            setBusy(true);
            try {
              const ok = await restoreNow(imgProgress('Downloading'));
              if (!ok) { Alert.alert('Nothing to restore', 'You have no cloud backup yet.'); return; }
              await reloadAllStores();
              Alert.alert('Restore complete', 'Your data and photos have been restored.');
            } catch (e: any) { Alert.alert('Restore failed', e.message); }
            finally { setBusy(false); setStatus(''); }
          },
        },
      ]
    );
  };

  return (
    <View style={[s.section, { backgroundColor: colors.surface }]}>
      <Text style={[s.title, { color: colors.text }]}>Cloud Backup</Text>

      {!isSupabaseConfigured ? (
        <Text style={[s.hint, { color: colors.textMuted }]}>
          Cloud backup isn’t available in this build.
        </Text>
      ) : loading ? (
        <BackupSectionSkeleton />
      ) : (
        <>
          <View style={[s.accountRow, { borderColor: colors.border }]}>
            <Ionicons name="shield-checkmark" size={20} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={[s.accountPhone, { color: colors.text }]}>{session?.user.phone || 'Logged in'}</Text>
              <Text style={[s.hint, { color: colors.textMuted, marginTop: 2 }]}>{formatWhen(lastBackup)}</Text>
            </View>
          </View>

          <TouchableOpacity style={[s.btn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]} disabled={busy} onPress={handleBackup}>
            <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
            <Text style={s.btnText}>{busy ? 'Working…' : 'Back up now'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[s.btn, { backgroundColor: colors.warning, opacity: busy ? 0.6 : 1 }]} disabled={busy} onPress={handleRestore}>
            <Ionicons name="cloud-download-outline" size={18} color="#fff" />
            <Text style={s.btnText}>Restore from cloud</Text>
          </TouchableOpacity>

          {busy && status ? (
            <Text style={[s.hint, { color: colors.primary, textAlign: 'center', marginBottom: 8 }]}>{status}</Text>
          ) : null}
        </>
      )}
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  section: { marginHorizontal: 8, marginTop: 8, borderRadius: 10, padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  title: { fontFamily: fonts.extraBold, fontSize: 15, marginBottom: 14 },
  hint: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, borderRadius: 14, marginTop: 4, marginBottom: 8, gap: 8 },
  btnText: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 14 },
  accountPhone: { fontFamily: fonts.bold, fontSize: 15 },
});
