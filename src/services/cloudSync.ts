import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as db from '../db/database';
import { Product, Bill, Expense } from '../types';

let supabase: SupabaseClient | null = null;

export async function initSupabase(): Promise<boolean> {
  const url = await db.getSetting('supabase_url') || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = await db.getSetting('supabase_key') || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  supabase = createClient(url, key);
  return true;
}

export async function setSupabaseCredentials(url: string, anonKey: string): Promise<void> {
  await db.setSetting('supabase_url', url);
  await db.setSetting('supabase_key', anonKey);
  supabase = createClient(url, anonKey);
}

export async function getSupabaseCredentials(): Promise<{ url: string; key: string } | null> {
  const url = await db.getSetting('supabase_url');
  const key = await db.getSetting('supabase_key');
  if (!url || !key) return null;
  return { url, key };
}

export async function syncToCloud(): Promise<{ products: number; bills: number; expenses: number }> {
  if (!supabase) {
    const ok = await initSupabase();
    if (!ok) throw new Error('Supabase not configured. Add URL and key in Settings → Cloud Sync.');
  }

  const [products, bills, expenses] = await Promise.all([
    db.getAllProducts(), db.getAllBills(), db.getAllExpenses(),
  ]);

  const upsert = async (table: string, rows: any[]) => {
    if (rows.length === 0) return 0;
    const { error } = await supabase!.from(table).upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`Sync error (${table}): ${error.message}`);
    return rows.length;
  };

  const [pc, bc, ec] = await Promise.all([
    upsert('products', products),
    upsert('bills', bills.map(b => ({ ...b, items: JSON.stringify(b.items) }))),
    upsert('expenses', expenses),
  ]);

  return { products: pc, bills: bc, expenses: ec };
}

export async function syncFromCloud(): Promise<{ products: number; bills: number; expenses: number }> {
  if (!supabase) {
    const ok = await initSupabase();
    if (!ok) throw new Error('Supabase not configured.');
  }

  const fetchAll = async (table: string) => {
    const { data, error } = await supabase!.from(table).select('*');
    if (error) throw new Error(`Fetch error (${table}): ${error.message}`);
    return data || [];
  };

  const [products, billRows, expenses] = await Promise.all([
    fetchAll('products'), fetchAll('bills'), fetchAll('expenses'),
  ]);

  let pc = 0, bc = 0, ec = 0;
  for (const p of products) { try { await db.insertProduct(p); pc++; } catch { /* skip dup */ } }
  for (const b of billRows) {
    try { await db.insertBill({ ...b, items: typeof b.items === 'string' ? JSON.parse(b.items) : b.items }); bc++; } catch { /* skip dup */ }
  }
  for (const e of expenses) { try { await db.insertExpense(e); ec++; } catch { /* skip dup */ } }

  return { products: pc, bills: bc, expenses: ec };
}
