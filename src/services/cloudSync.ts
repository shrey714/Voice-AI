import { supabase } from '../lib/supabase';
import * as db from '../db/database';
import { uploadProductImages, downloadProductImages, ImgProgress } from './imageBackup';

// One shared table holds a single full-snapshot row per user (see SQL in docs):
//   backups ( user_id uuid primary key, data jsonb, updated_at timestamptz )
// RLS restricts every row to user_id = auth.uid().
const BACKUP_TABLE = 'backups';

export interface AuthUser {
  id: string;
  phone: string | null;
}

// Sign-in happens once, globally, via PhoneAuthScreen — this just reads the
// resulting session. Resolves from the persisted session.
export async function getCurrentUser(): Promise<AuthUser | null> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  return user ? { id: user.id, phone: user.phone ?? null } : null;
}

// ── Backup / restore (full snapshot) ─────────────────────────────────────────

export interface BackupMeta {
  updatedAt: string | null; // ISO timestamp of the cloud snapshot, or null if none
}

// Upload a full snapshot of every local table, then any new/changed product
// images. `onImageProgress` fires per-image during the (optional) image phase.
export async function backupNow(onImageProgress?: ImgProgress): Promise<{ updatedAt: string }> {
  const client = supabase;
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
  const client = supabase;
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
  const client = supabase;
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
