import { supabase } from './supabase';
import * as db from '../db/database';
import { uploadProductImages, downloadProductImages, ImgProgress } from './imageBackup';

// One shared table holds a single full-snapshot row per user (see SQL in docs):
//   backups ( user_id uuid primary key, data jsonb, updated_at timestamptz )
// RLS restricts every row to user_id = auth.uid().
const BACKUP_TABLE = 'backups';

function requireClient() {
  if (!supabase) {
    throw new Error('Backup is not available in this build (Supabase not configured).');
  }
  return supabase;
}

// ── Auth (phone OTP) ─────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  phone: string | null;
}

// Normalize an Indian number to E.164 (+91XXXXXXXXXX) which Supabase/Twilio expect.
export function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+')) return '+' + digits;
  if (digits.length === 10) return '+91' + digits;       // bare 10-digit Indian mobile
  if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
  return '+' + digits;
}

// Send an SMS OTP to the phone number.
export async function sendOtp(phoneRaw: string): Promise<void> {
  const client = requireClient();
  const phone = toE164(phoneRaw);
  const { error } = await client.auth.signInWithOtp({ phone });
  if (error) throw new Error(error.message);
}

// Verify the 6-digit code; on success the session is persisted automatically.
export async function verifyOtp(phoneRaw: string, token: string): Promise<AuthUser> {
  const client = requireClient();
  const phone = toE164(phoneRaw);
  const { data, error } = await client.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw new Error(error.message);
  const user = data.user;
  if (!user) throw new Error('Verification failed. Please try again.');
  return { id: user.id, phone: user.phone ?? phone };
}

// Currently logged-in user, or null. Resolves from the persisted session.
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  return user ? { id: user.id, phone: user.phone ?? null } : null;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

// ── Backup / restore (full snapshot) ─────────────────────────────────────────

export interface BackupMeta {
  updatedAt: string | null; // ISO timestamp of the cloud snapshot, or null if none
}

// Upload a full snapshot of every local table, then any new/changed product
// images. `onImageProgress` fires per-image during the (optional) image phase.
export async function backupNow(onImageProgress?: ImgProgress): Promise<{ updatedAt: string }> {
  const client = requireClient();
  const user = await getCurrentUser();
  if (!user) throw new Error('Please log in to back up.');

  const data = await db.exportAllTables();
  const updatedAt = new Date().toISOString();
  const { error } = await client
    .from(BACKUP_TABLE)
    .upsert({ user_id: user.id, data, updated_at: updatedAt }, { onConflict: 'user_id' });
  if (error) throw new Error(`Backup failed: ${error.message}`);

  // Images are best-effort: a Storage hiccup must not fail the data backup.
  try { await uploadProductImages(user.id, onImageProgress); } catch { /* ignore */ }
  return { updatedAt };
}

// Fetch metadata about the user's existing cloud backup (for "last backed up …").
export async function getBackupMeta(): Promise<BackupMeta> {
  const client = requireClient();
  const user = await getCurrentUser();
  if (!user) return { updatedAt: null };

  const { data, error } = await client
    .from(BACKUP_TABLE)
    .select('updated_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { updatedAt: data?.updated_at ?? null };
}

// Download the user's cloud snapshot and overwrite local data. Returns false if
// there is no backup yet. Caller should reload the in-memory store afterwards.
export async function restoreNow(onImageProgress?: ImgProgress): Promise<boolean> {
  const client = requireClient();
  const user = await getCurrentUser();
  if (!user) throw new Error('Please log in to restore.');

  const { data, error } = await client
    .from(BACKUP_TABLE)
    .select('data')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw new Error(`Restore failed: ${error.message}`);
  if (!data?.data) return false;

  const snapshot = data.data as Record<string, any[]>;
  await db.importAllTables(snapshot);

  // Pull product images and rewrite local paths — best-effort.
  try { await downloadProductImages(user.id, snapshot.products || [], onImageProgress); } catch { /* ignore */ }
  return true;
}
