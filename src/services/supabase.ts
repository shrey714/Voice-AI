import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Single shared Supabase project, owned by us. The anon key is safe to bundle in
// the app because Row Level Security (RLS) restricts every row to its owner — a
// logged-in user can only read/write their own backup. Customers never see or
// enter these values; they just log in with their phone number.
// The client needs the bare project origin (https://xxxx.supabase.co) — NOT a
// REST/auth path or trailing slash, or every request 404s with "invalid path".
// Normalize defensively so a misconfigured .env can't break auth.
function normalizeProjectUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/(rest|auth)\/v\d+\/?$/i, '').replace(/\/+$/, '');
  }
}

const url = normalizeProjectUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// `null` when the build has no Supabase keys — callers guard on this and surface
// a friendly "backup not available" message instead of crashing.
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          // Persist the session so the shopkeeper stays logged in across restarts.
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          // No URL-based auth in a native app.
          detectSessionInUrl: false,
        },
      })
    : null;

export const isBackupConfigured = supabase !== null;
