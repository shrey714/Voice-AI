import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

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

const supabaseUrl = normalizeProjectUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// Single shared Supabase client for the whole app — one phone-OTP sign-in
// gates both the local cloud backup and the online shop, backed by the same
// auth.uid() that every RLS policy checks against.
export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
