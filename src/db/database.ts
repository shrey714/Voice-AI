import * as SQLite from 'expo-sqlite';
import { Product, Bill, Expense, Customer, UdhaarEntry, Supplier, BillReturn, CartTemplate, Purchase, SupplierLedgerEntry, StockTakeSession, StockTakeItem, StockTakeSummary, DayClose } from '../types';

let db: SQLite.SQLiteDatabase | null = null;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await SQLite.openDatabaseAsync('shopkeeper.db');
      await initializeDatabase(database);
      db = database;
      return database;
    })();
  }
  return dbPromise;
}

async function initializeDatabase(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      costPrice REAL NOT NULL DEFAULT 0,
      sellingPrice REAL NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 0,
      barcode TEXT,
      imageUri TEXT,
      unit TEXT NOT NULL DEFAULT 'pcs',
      lowStockThreshold INTEGER NOT NULL DEFAULT 5,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY,
      items TEXT NOT NULL,
      subtotal REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      profit REAL NOT NULL,
      paymentMode TEXT NOT NULL DEFAULT 'cash',
      customerName TEXT,
      customerPhone TEXT,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      note TEXT,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS udhaar (
      id TEXT PRIMARY KEY,
      customerId TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL DEFAULT 'debit',
      note TEXT,
      billId TEXT,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      notes TEXT,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS returns (
      id TEXT PRIMARY KEY,
      billId TEXT NOT NULL,
      items TEXT NOT NULL,
      refundAmount REAL NOT NULL DEFAULT 0,
      reason TEXT,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cart_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      items TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      supplierId TEXT,
      supplierName TEXT,
      invoiceNumber TEXT,
      items TEXT NOT NULL,
      totalAmount REAL NOT NULL DEFAULT 0,
      paidAmount REAL NOT NULL DEFAULT 0,
      paymentMode TEXT,
      notes TEXT,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS supplier_ledger (
      id TEXT PRIMARY KEY,
      supplierId TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'debit',
      amount REAL NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      purchaseId TEXT,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_takes (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL DEFAULT 'all',
      status TEXT NOT NULL DEFAULT 'active',
      startedAt INTEGER NOT NULL,
      completedAt INTEGER,
      summary TEXT
    );

    CREATE TABLE IF NOT EXISTS stock_take_items (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      productId TEXT NOT NULL,
      productName TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      systemQty INTEGER NOT NULL DEFAULT 0,
      countedQty INTEGER,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS day_closes (
      id TEXT PRIMARY KEY,
      date INTEGER NOT NULL,
      openingCash REAL NOT NULL DEFAULT 0,
      cashSales REAL NOT NULL DEFAULT 0,
      cashOut REAL NOT NULL DEFAULT 0,
      expected REAL NOT NULL DEFAULT 0,
      counted REAL NOT NULL DEFAULT 0,
      difference REAL NOT NULL DEFAULT 0,
      note TEXT,
      createdAt INTEGER NOT NULL
    );
  `);

  // Column migrations — swallow error when column already exists
  try { await database.execAsync('ALTER TABLE products ADD COLUMN supplierId TEXT'); } catch {}
  try { await database.execAsync('ALTER TABLE expenses ADD COLUMN supplierId TEXT'); } catch {}
  try { await database.execAsync('ALTER TABLE products ADD COLUMN gstRate INTEGER NOT NULL DEFAULT 0'); } catch {}
  try { await database.execAsync('ALTER TABLE products ADD COLUMN hsnCode TEXT'); } catch {}
  try { await database.execAsync('ALTER TABLE products ADD COLUMN expiryDate INTEGER'); } catch {}
  try { await database.execAsync('ALTER TABLE bills ADD COLUMN gstBreakdown TEXT'); } catch {}
  try { await database.execAsync('ALTER TABLE bills ADD COLUMN totalTaxableValue REAL NOT NULL DEFAULT 0'); } catch {}
  try { await database.execAsync('ALTER TABLE bills ADD COLUMN totalGst REAL NOT NULL DEFAULT 0'); } catch {}
  try { await database.execAsync('ALTER TABLE bills ADD COLUMN customerGstin TEXT'); } catch {}
  try { await database.execAsync('ALTER TABLE customers ADD COLUMN lastRemindedAt INTEGER'); } catch {}
}

// Products
export async function getAllProducts(): Promise<Product[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<Product>('SELECT * FROM products ORDER BY name ASC');
  return rows;
}

export async function getProductById(id: string): Promise<Product | null> {
  const database = await getDatabase();
  return await database.getFirstAsync<Product>('SELECT * FROM products WHERE id = ?', [id]);
}

export async function getProductByBarcode(barcode: string): Promise<Product | null> {
  const database = await getDatabase();
  return await database.getFirstAsync<Product>('SELECT * FROM products WHERE barcode = ?', [barcode]);
}

export async function insertProduct(product: Product): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO products (id, name, category, costPrice, sellingPrice, quantity, barcode, imageUri, unit, lowStockThreshold, supplierId, gstRate, hsnCode, expiryDate, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [product.id, product.name, product.category, product.costPrice, product.sellingPrice,
     product.quantity, product.barcode ?? null, product.imageUri ?? null, product.unit,
     product.lowStockThreshold, product.supplierId ?? null, product.gstRate ?? 0,
     product.hsnCode ?? null, product.expiryDate ?? null, product.createdAt, product.updatedAt]
  );
}

export async function updateProduct(product: Product): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE products SET name=?, category=?, costPrice=?, sellingPrice=?, quantity=?, barcode=?, imageUri=?, unit=?, lowStockThreshold=?, supplierId=?, gstRate=?, hsnCode=?, expiryDate=?, updatedAt=?
     WHERE id=?`,
    [product.name, product.category, product.costPrice, product.sellingPrice, product.quantity,
     product.barcode ?? null, product.imageUri ?? null, product.unit, product.lowStockThreshold,
     product.supplierId ?? null, product.gstRate ?? 0, product.hsnCode ?? null,
     product.expiryDate ?? null, product.updatedAt, product.id]
  );
}

export async function deleteProduct(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM products WHERE id = ?', [id]);
}

export async function updateProductImageUri(id: string, imageUri: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE products SET imageUri = ?, updatedAt = ? WHERE id = ?',
    [imageUri || null, Date.now(), id]
  );
}

export async function updateProductQuantity(id: string, newQuantity: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE products SET quantity = ?, updatedAt = ? WHERE id = ?',
    [newQuantity, Date.now(), id]
  );
}

export async function getLowStockProducts(threshold?: number): Promise<Product[]> {
  const database = await getDatabase();
  return await database.getAllAsync<Product>(
    'SELECT * FROM products WHERE quantity <= lowStockThreshold ORDER BY quantity ASC'
  );
}

// Bills
export async function insertBill(bill: Bill): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO bills (id, items, subtotal, discount, total, profit, paymentMode, customerName, customerPhone, customerGstin, gstBreakdown, totalTaxableValue, totalGst, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [bill.id, JSON.stringify(bill.items), bill.subtotal, bill.discount, bill.total,
     bill.profit, bill.paymentMode, bill.customerName ?? null, bill.customerPhone ?? null,
     bill.customerGstin ?? null, JSON.stringify(bill.gstBreakdown ?? []),
     bill.totalTaxableValue ?? 0, bill.totalGst ?? 0, bill.createdAt]
  );
}

export async function getBillsForDateRange(startTs: number, endTs: number): Promise<Bill[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<any>(
    'SELECT * FROM bills WHERE createdAt >= ? AND createdAt <= ? ORDER BY createdAt DESC',
    [startTs, endTs]
  );
  return rows.map(r => ({ ...r, items: JSON.parse(r.items) }));
}

export async function getAllBills(): Promise<Bill[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<any>('SELECT * FROM bills ORDER BY createdAt DESC');
  return rows.map(r => ({
    ...r,
    items: JSON.parse(r.items).map((i: any) => ({
      ...i,
      gstRate: i.gstRate ?? 0,
      taxableValue: i.taxableValue ?? i.sellingPrice * i.quantity,
    })),
    gstBreakdown: r.gstBreakdown ? JSON.parse(r.gstBreakdown) : [],
    totalTaxableValue: r.totalTaxableValue ?? 0,
    totalGst: r.totalGst ?? 0,
  }));
}

// Expenses
export async function insertExpense(expense: Expense): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO expenses (id, title, amount, category, note, supplierId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [expense.id, expense.title, expense.amount, expense.category, expense.note ?? null, expense.supplierId ?? null, expense.createdAt]
  );
}

export async function getExpensesForDateRange(startTs: number, endTs: number): Promise<Expense[]> {
  const database = await getDatabase();
  return await database.getAllAsync<Expense>(
    'SELECT * FROM expenses WHERE createdAt >= ? AND createdAt <= ? ORDER BY createdAt DESC',
    [startTs, endTs]
  );
}

export async function getAllExpenses(): Promise<Expense[]> {
  const database = await getDatabase();
  return await database.getAllAsync<Expense>('SELECT * FROM expenses ORDER BY createdAt DESC');
}

export async function deleteExpense(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM expenses WHERE id = ?', [id]);
}

// Customers
export async function getAllCustomers(): Promise<Customer[]> {
  const database = await getDatabase();
  return await database.getAllAsync<Customer>('SELECT * FROM customers ORDER BY name ASC');
}

export async function insertCustomer(customer: Customer): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT INTO customers (id, name, phone, createdAt, lastRemindedAt) VALUES (?, ?, ?, ?, ?)',
    [customer.id, customer.name, customer.phone ?? null, customer.createdAt, customer.lastRemindedAt ?? null]
  );
}

export async function updateCustomer(customer: Customer): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE customers SET name=?, phone=? WHERE id=?',
    [customer.name, customer.phone ?? null, customer.id]
  );
}

export async function markCustomerReminded(id: string, ts: number = Date.now()): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE customers SET lastRemindedAt=? WHERE id=?', [ts, id]);
}

export async function deleteCustomer(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM customers WHERE id = ?', [id]);
  await database.runAsync('DELETE FROM udhaar WHERE customerId = ?', [id]);
}

// Udhaar
export async function getAllUdhaar(): Promise<UdhaarEntry[]> {
  const database = await getDatabase();
  return await database.getAllAsync<UdhaarEntry>('SELECT * FROM udhaar ORDER BY createdAt DESC');
}

export async function getUdhaarForCustomer(customerId: string): Promise<UdhaarEntry[]> {
  const database = await getDatabase();
  return await database.getAllAsync<UdhaarEntry>(
    'SELECT * FROM udhaar WHERE customerId = ? ORDER BY createdAt DESC',
    [customerId]
  );
}

export async function insertUdhaarEntry(entry: UdhaarEntry): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT INTO udhaar (id, customerId, amount, type, note, billId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [entry.id, entry.customerId, entry.amount, entry.type, entry.note ?? null, entry.billId ?? null, entry.createdAt]
  );
}

export async function deleteUdhaarEntry(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM udhaar WHERE id = ?', [id]);
}

export async function getProductsBySupplier(supplierId: string): Promise<Product[]> {
  const database = await getDatabase();
  return await database.getAllAsync<Product>(
    'SELECT * FROM products WHERE supplierId = ? ORDER BY name ASC',
    [supplierId]
  );
}

export async function getExpensesBySupplier(supplierId: string): Promise<Expense[]> {
  const database = await getDatabase();
  return await database.getAllAsync<Expense>(
    'SELECT * FROM expenses WHERE supplierId = ? ORDER BY createdAt DESC',
    [supplierId]
  );
}

// Suppliers
export async function getAllSuppliers(): Promise<Supplier[]> {
  const database = await getDatabase();
  return await database.getAllAsync<Supplier>('SELECT * FROM suppliers ORDER BY name ASC');
}

export async function insertSupplier(supplier: Supplier): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT INTO suppliers (id, name, phone, email, address, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [supplier.id, supplier.name, supplier.phone ?? null, supplier.email ?? null,
     supplier.address ?? null, supplier.notes ?? null, supplier.createdAt]
  );
}

export async function updateSupplier(supplier: Supplier): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE suppliers SET name=?, phone=?, email=?, address=?, notes=? WHERE id=?',
    [supplier.name, supplier.phone ?? null, supplier.email ?? null,
     supplier.address ?? null, supplier.notes ?? null, supplier.id]
  );
}

export async function deleteSupplier(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE products SET supplierId = NULL WHERE supplierId = ?', [id]);
  await database.runAsync('UPDATE expenses SET supplierId = NULL WHERE supplierId = ?', [id]);
  await database.runAsync('DELETE FROM suppliers WHERE id = ?', [id]);
}

// Returns
export async function getAllReturns(): Promise<BillReturn[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<any>('SELECT * FROM returns ORDER BY createdAt DESC');
  return rows.map(r => ({ ...r, items: JSON.parse(r.items) }));
}

export async function insertReturn(ret: BillReturn): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT INTO returns (id, billId, items, refundAmount, reason, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    [ret.id, ret.billId, JSON.stringify(ret.items), ret.refundAmount, ret.reason ?? null, ret.createdAt]
  );
}

// Cart Templates
export async function getAllTemplates(): Promise<CartTemplate[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<any>('SELECT * FROM cart_templates ORDER BY createdAt DESC');
  return rows.map(r => ({ ...r, items: JSON.parse(r.items) }));
}

export async function insertTemplate(template: CartTemplate): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT INTO cart_templates (id, name, items, createdAt) VALUES (?, ?, ?, ?)',
    [template.id, template.name, JSON.stringify(template.items), template.createdAt]
  );
}

export async function updateTemplateName(id: string, name: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE cart_templates SET name = ? WHERE id = ?', [name, id]);
}

export async function deleteTemplate(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM cart_templates WHERE id = ?', [id]);
}

// Purchases
export async function getAllPurchases(): Promise<Purchase[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<any>('SELECT * FROM purchases ORDER BY createdAt DESC');
  return rows.map(r => ({ ...r, items: JSON.parse(r.items) }));
}

export async function getPurchasesBySupplier(supplierId: string): Promise<Purchase[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<any>(
    'SELECT * FROM purchases WHERE supplierId = ? ORDER BY createdAt DESC',
    [supplierId]
  );
  return rows.map(r => ({ ...r, items: JSON.parse(r.items) }));
}

export async function updatePurchasePaidAmount(id: string, paidAmount: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE purchases SET paidAmount = ? WHERE id = ?', [paidAmount, id]);
}

export async function insertPurchase(purchase: Purchase): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO purchases (id, supplierId, supplierName, invoiceNumber, items, totalAmount, paidAmount, paymentMode, notes, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [purchase.id, purchase.supplierId ?? null, purchase.supplierName ?? null,
     purchase.invoiceNumber ?? null, JSON.stringify(purchase.items),
     purchase.totalAmount, purchase.paidAmount, purchase.paymentMode ?? null,
     purchase.notes ?? null, purchase.createdAt]
  );
}

// Supplier Ledger
export async function getAllLedgerEntries(): Promise<SupplierLedgerEntry[]> {
  const database = await getDatabase();
  return await database.getAllAsync<SupplierLedgerEntry>(
    'SELECT * FROM supplier_ledger ORDER BY createdAt DESC'
  );
}

export async function getLedgerBySupplier(supplierId: string): Promise<SupplierLedgerEntry[]> {
  const database = await getDatabase();
  return await database.getAllAsync<SupplierLedgerEntry>(
    'SELECT * FROM supplier_ledger WHERE supplierId = ? ORDER BY createdAt DESC',
    [supplierId]
  );
}

export async function insertLedgerEntry(entry: SupplierLedgerEntry): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO supplier_ledger (id, supplierId, type, amount, description, purchaseId, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [entry.id, entry.supplierId, entry.type, entry.amount,
     entry.description, entry.purchaseId ?? null, entry.createdAt]
  );
}

// ── Day close (cash reconciliation) ──────────────────────────────────────────
export async function getAllDayCloses(): Promise<DayClose[]> {
  const database = await getDatabase();
  return await database.getAllAsync<DayClose>('SELECT * FROM day_closes ORDER BY date DESC');
}

export async function getDayClose(id: string): Promise<DayClose | null> {
  const database = await getDatabase();
  return (await database.getFirstAsync<DayClose>('SELECT * FROM day_closes WHERE id = ?', [id])) ?? null;
}

export async function upsertDayClose(dc: DayClose): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT OR REPLACE INTO day_closes
       (id, date, openingCash, cashSales, cashOut, expected, counted, difference, note, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [dc.id, dc.date, dc.openingCash, dc.cashSales, dc.cashOut, dc.expected, dc.counted, dc.difference, dc.note ?? null, dc.createdAt]
  );
}

// ── Full backup / restore ────────────────────────────────────────────────────
// Every local table that should travel with the user's backup snapshot.
// Order matters for restore (parents before children where FKs are implied).
export const BACKUP_TABLES = [
  'products', 'bills', 'expenses', 'customers', 'udhaar', 'suppliers',
  'returns', 'cart_templates', 'purchases', 'supplier_ledger',
  'stock_takes', 'stock_take_items', 'day_closes', 'settings',
] as const;

// Device-local settings keys that must never be backed up or restored.
const LOCAL_ONLY_SETTING_KEYS = new Set(['supabase_url', 'supabase_key']);

// Read every backed-up table verbatim (SELECT * keeps all columns, including
// migrated ones and JSON-as-TEXT blobs) into a plain snapshot object.
export async function exportAllTables(): Promise<Record<string, any[]>> {
  const database = await getDatabase();
  const snapshot: Record<string, any[]> = {};
  for (const table of BACKUP_TABLES) {
    let rows = await database.getAllAsync<any>(`SELECT * FROM ${table}`);
    if (table === 'settings') {
      rows = rows.filter((r) => !LOCAL_ONLY_SETTING_KEYS.has(r.key));
    }
    snapshot[table] = rows;
  }
  return snapshot;
}

// Replace local data with a restored snapshot, in a single transaction so a
// failure can't leave the DB half-written. Settings are merged (we never wipe
// the device's own Supabase creds); all other tables are replaced wholesale.
export async function importAllTables(snapshot: Record<string, any[]>): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    for (const table of BACKUP_TABLES) {
      const rows = snapshot[table];
      if (!Array.isArray(rows)) continue;

      if (table === 'settings') {
        for (const row of rows) {
          if (LOCAL_ONLY_SETTING_KEYS.has(row.key)) continue;
          await database.runAsync(
            'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            [row.key, row.value]
          );
        }
        continue;
      }

      await database.runAsync(`DELETE FROM ${table}`);
      for (const row of rows) {
        const cols = Object.keys(row);
        if (cols.length === 0) continue;
        const placeholders = cols.map(() => '?').join(', ');
        const values = cols.map((c) => row[c]);
        await database.runAsync(
          `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
          values
        );
      }
    }
  });
}

// Wipe every business-data table but keep `settings` — the shop profile
// (name, phone, UPI, GST) survives. Used by "Erase data".
export async function resetAllData(): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    for (const table of BACKUP_TABLES) {
      if (table === 'settings') continue;
      await database.runAsync(`DELETE FROM ${table}`);
    }
  });
}

// Full factory reset — wipes every table including `settings`, so onboarding
// runs again for whoever uses the device next. Used by "Log out".
export async function wipeEverything(): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    for (const table of BACKUP_TABLES) {
      await database.runAsync(`DELETE FROM ${table}`);
    }
  });
}

// Settings
export async function getSetting(key: string): Promise<string | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, value]
  );
}

// Stock Takes
export async function insertStockTakeSession(session: StockTakeSession): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT INTO stock_takes (id, scope, status, startedAt, completedAt, summary) VALUES (?, ?, ?, ?, ?, ?)',
    [session.id, session.scope, session.status, session.startedAt, session.completedAt ?? null, session.summary ? JSON.stringify(session.summary) : null]
  );
}

export async function updateStockTakeSession(session: StockTakeSession): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE stock_takes SET status=?, completedAt=?, summary=? WHERE id=?',
    [session.status, session.completedAt ?? null, session.summary ? JSON.stringify(session.summary) : null, session.id]
  );
}

export async function getActiveStockTakeSession(): Promise<StockTakeSession | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<any>('SELECT * FROM stock_takes WHERE status = ? ORDER BY startedAt DESC LIMIT 1', ['active']);
  if (!row) return null;
  return { ...row, summary: row.summary ? JSON.parse(row.summary) : undefined };
}

export async function insertStockTakeItem(item: StockTakeItem): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT INTO stock_take_items (id, sessionId, productId, productName, category, systemQty, countedQty, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [item.id, item.sessionId, item.productId, item.productName, item.category, item.systemQty, item.countedQty ?? null, item.updatedAt]
  );
}

export async function updateStockTakeItemCount(id: string, countedQty: number | null, updatedAt: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE stock_take_items SET countedQty=?, updatedAt=? WHERE id=?',
    [countedQty ?? null, updatedAt, id]
  );
}

export async function getStockTakeItems(sessionId: string): Promise<StockTakeItem[]> {
  const database = await getDatabase();
  return await database.getAllAsync<StockTakeItem>(
    'SELECT * FROM stock_take_items WHERE sessionId = ? ORDER BY category ASC, productName ASC',
    [sessionId]
  );
}

export async function getCompletedStockTakeSessions(): Promise<StockTakeSession[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<any>(
    'SELECT * FROM stock_takes WHERE status = ? ORDER BY completedAt DESC',
    ['completed']
  );
  return rows.map(r => ({ ...r, summary: r.summary ? JSON.parse(r.summary) : undefined }));
}

export async function deleteStockTakeSession(sessionId: string): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync('DELETE FROM stock_take_items WHERE sessionId = ?', [sessionId]);
    await database.runAsync('DELETE FROM stock_takes WHERE id = ?', [sessionId]);
  });
}

export async function deleteAllCompletedStockTakeSessions(): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `DELETE FROM stock_take_items WHERE sessionId IN (SELECT id FROM stock_takes WHERE status = 'completed')`
    );
    await database.runAsync(`DELETE FROM stock_takes WHERE status = 'completed'`);
  });
}

// Atomic commit: update all product quantities + mark session completed in one transaction
export async function commitStockTakeTransaction(
  countedItems: StockTakeItem[],
  session: StockTakeSession,
  summary: StockTakeSummary,
  now: number
): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    for (const item of countedItems) {
      await database.runAsync(
        'UPDATE products SET quantity=?, updatedAt=? WHERE id=?',
        [item.countedQty!, now, item.productId]
      );
    }
    await database.runAsync(
      'UPDATE stock_takes SET status=?, completedAt=?, summary=? WHERE id=?',
      ['completed', now, JSON.stringify(summary), session.id]
    );
  });
}
