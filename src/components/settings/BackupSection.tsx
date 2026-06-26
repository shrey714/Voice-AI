import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts } from '../../theme/typography';
import { isBackupConfigured } from '../../services/supabase';
import {
  sendOtp, verifyOtp, getCurrentUser, signOut,
  backupNow, restoreNow, getBackupMeta, AuthUser,
} from '../../services/cloudSync';
import { useAppStore } from '../../stores/useAppStore';

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
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [phase, setPhase] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  const imgProgress = (verb: string) => (done: number, total: number) =>
    setStatus(total > 0 ? `${verb} images ${done}/${total}` : '');

  useEffect(() => {
    (async () => {
      try {
        const u = await getCurrentUser();
        setUser(u);
        if (u) {
          const meta = await getBackupMeta();
          setLastBackup(meta.updatedAt);
        }
      } catch { /* offline / not configured */ }
      finally { setLoading(false); }
    })();
  }, []);

  const handleSend = async () => {
    if (phone.replace(/\D/g, '').length < 10) {
      Alert.alert('Invalid number', 'Enter a valid 10-digit mobile number.');
      return;
    }
    setBusy(true);
    try {
      await sendOtp(phone);
      setPhase('otp');
    } catch (e: any) { Alert.alert('Could not send OTP', e.message); }
    finally { setBusy(false); }
  };

  const handleVerify = async () => {
    if (otp.replace(/\D/g, '').length < 4) {
      Alert.alert('Invalid code', 'Enter the code from the SMS.');
      return;
    }
    setBusy(true);
    try {
      const u = await verifyOtp(phone, otp);
      setUser(u);
      setOtp('');
      const meta = await getBackupMeta();
      setLastBackup(meta.updatedAt);
    } catch (e: any) { Alert.alert('Verification failed', e.message); }
    finally { setBusy(false); }
  };

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

  const handleLogout = async () => {
    setBusy(true);
    try {
      await signOut();
      setUser(null);
      setPhase('phone');
      setPhone('');
      setLastBackup(null);
    } finally { setBusy(false); }
  };

  return (
    <View style={[s.section, { backgroundColor: colors.surface }]}>
      <Text style={[s.title, { color: colors.text }]}>Cloud Backup</Text>

      {!isBackupConfigured ? (
        <Text style={[s.hint, { color: colors.textMuted }]}>
          Cloud backup isn’t available in this build.
        </Text>
      ) : loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
      ) : user ? (
        // ── Logged in ──────────────────────────────────────────────
        <>
          <View style={[s.accountRow, { borderColor: colors.border }]}>
            <Ionicons name="shield-checkmark" size={20} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={[s.accountPhone, { color: colors.text }]}>{user.phone || 'Logged in'}</Text>
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

          <TouchableOpacity style={[s.linkBtn]} disabled={busy} onPress={handleLogout}>
            <Text style={[s.linkText, { color: colors.danger }]}>Log out</Text>
          </TouchableOpacity>
        </>
      ) : phase === 'phone' ? (
        // ── Enter phone ────────────────────────────────────────────
        <>
          <Text style={[s.hint, { color: colors.textMuted, marginBottom: 14 }]}>
            Log in with your phone number to back up your shop data and restore it on any device.
          </Text>
          <TextInput
            style={[s.input, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
            value={phone}
            onChangeText={setPhone}
            placeholder="Mobile number (e.g. 98765 43210)"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            maxLength={15}
          />
          <TouchableOpacity style={[s.btn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]} disabled={busy} onPress={handleSend}>
            <Ionicons name="paper-plane-outline" size={18} color="#fff" />
            <Text style={s.btnText}>{busy ? 'Sending…' : 'Send OTP'}</Text>
          </TouchableOpacity>
        </>
      ) : (
        // ── Enter OTP ──────────────────────────────────────────────
        <>
          <Text style={[s.hint, { color: colors.textMuted, marginBottom: 14 }]}>
            Enter the code sent to {phone}.
          </Text>
          <TextInput
            style={[s.input, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border, letterSpacing: 8, textAlign: 'center', fontSize: 22 }]}
            value={otp}
            onChangeText={setOtp}
            placeholder="••••••"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={6}
          />
          <TouchableOpacity style={[s.btn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]} disabled={busy} onPress={handleVerify}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
            <Text style={s.btnText}>{busy ? 'Verifying…' : 'Verify & log in'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.linkBtn} disabled={busy} onPress={() => { setPhase('phone'); setOtp(''); }}>
            <Text style={[s.linkText, { color: colors.textSub }]}>Change number</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  section: { marginHorizontal: 8, marginTop: 8, borderRadius: 10, padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  title: { fontFamily: fonts.extraBold, fontSize: 15, marginBottom: 14 },
  hint: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  input: { borderRadius: 14, padding: 16, fontSize: 16, borderWidth: 1, fontFamily: fonts.regular, marginBottom: 12 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, borderRadius: 14, marginTop: 4, marginBottom: 8, gap: 8 },
  btnText: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },
  linkBtn: { alignItems: 'center', paddingVertical: 8 },
  linkText: { fontFamily: fonts.bold, fontSize: 13 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 14 },
  accountPhone: { fontFamily: fonts.bold, fontSize: 15 },
});
