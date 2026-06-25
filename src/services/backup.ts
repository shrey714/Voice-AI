import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as db from '../db/database';

export async function exportBackup(): Promise<void> {
  const [products, bills, expenses, customers, suppliers] = await Promise.all([
    db.getAllProducts(),
    db.getAllBills(),
    db.getAllExpenses(),
    db.getAllCustomers(),
    db.getAllSuppliers(),
  ]);

  const backup = {
    version: 2,
    exportedAt: Date.now(),
    products,
    bills,
    expenses,
    customers,
    suppliers,
  };

  const fileName = `shopkeeper-backup-${new Date().toISOString().split('T')[0]}.json`;
  const fileUri = `${FileSystem.documentDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backup, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: 'Export Backup' });
  }
}

export interface ImportResult {
  products: number;
  bills: number;
  expenses: number;
  customers: number;
  suppliers: number;
}

export async function importBackup(): Promise<ImportResult | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const content = await FileSystem.readAsStringAsync(result.assets[0].uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const backup = JSON.parse(content);
  if (!backup.products) throw new Error('Invalid backup file');

  const counts: ImportResult = { products: 0, bills: 0, expenses: 0, customers: 0, suppliers: 0 };

  for (const p of backup.products || []) {
    try { await db.insertProduct(p); counts.products++; } catch { /* duplicate */ }
  }
  for (const b of backup.bills || []) {
    try { await db.insertBill(b); counts.bills++; } catch { /* duplicate */ }
  }
  for (const e of backup.expenses || []) {
    try { await db.insertExpense(e); counts.expenses++; } catch { /* duplicate */ }
  }
  for (const c of backup.customers || []) {
    try { await db.insertCustomer(c); counts.customers++; } catch { /* duplicate */ }
  }
  for (const s of backup.suppliers || []) {
    try { await db.insertSupplier(s); counts.suppliers++; } catch { /* duplicate */ }
  }

  return counts;
}
