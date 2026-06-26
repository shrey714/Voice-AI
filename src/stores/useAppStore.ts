import { create } from 'zustand';
import { Product, CartItem, Bill, BillItem, GstSlab, BillReturn, ReturnItem, Expense, AppSettings, Language, Supplier, CartTemplate, Purchase, SupplierLedgerEntry, StockTakeSession, StockTakeItem, StockTakeSummary } from '../types';
import * as db from '../db/database';
import { generateId } from '../utils/helpers';
import { sendLowStockAlerts } from '../services/notifications';
import { DEFAULT_PRODUCT_CATEGORIES, DEFAULT_UNITS } from '../constants/options';

interface AppState {
  products: Product[];
  cart: CartItem[];
  bills: Bill[];
  expenses: Expense[];
  suppliers: Supplier[];
  returns: BillReturn[];
  templates: CartTemplate[];
  purchases: Purchase[];
  supplierLedger: SupplierLedgerEntry[];
  activeStockTake: StockTakeSession | null;
  stockTakeItems: StockTakeItem[];
  settings: AppSettings;
  isLoading: boolean;

  // Actions
  loadProducts: () => Promise<void>;
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateProduct: (product: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;

  checkout: (paymentMode: Bill['paymentMode'], discount: number, customerName?: string, customerPhone?: string, customerGstin?: string) => Promise<Bill>;
  loadBills: () => Promise<void>;

  addExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  loadExpenses: () => Promise<void>;

  loadReturns: () => Promise<void>;
  processReturn: (billId: string, items: ReturnItem[], refundAmount: number, reason?: string) => Promise<void>;

  loadTemplates: () => Promise<void>;
  saveTemplate: (name: string) => Promise<void>;
  renameTemplate: (id: string, name: string) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;

  loadSuppliers: () => Promise<void>;
  addSupplier: (supplier: Omit<Supplier, 'id' | 'createdAt'>) => Promise<Supplier>;
  updateSupplier: (supplier: Supplier) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;

  loadPurchases: () => Promise<void>;
  createPurchase: (purchaseData: Omit<Purchase, 'id' | 'createdAt'>, costPriceUpdates?: Record<string, number>) => Promise<Purchase>;

  loadSupplierLedger: () => Promise<void>;
  recordSupplierPayment: (supplierId: string, amount: number, paymentMode: string, note?: string) => Promise<void>;

  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
  loadSettings: () => Promise<void>;
  setLanguage: (lang: Language) => void;
  resetApp: () => Promise<void>;

  loadActiveStockTake: () => Promise<void>;
  startStockTake: (scope: string) => Promise<void>;
  updateStockTakeCount: (itemId: string, countedQty: number | null) => Promise<void>;
  commitStockTake: () => Promise<void>;
  cancelStockTake: () => Promise<void>;
}

const defaultSettings: AppSettings = {
  shopName: 'My Shop',
  ownerName: '',
  phone: '',
  address: '',
  language: 'en',
  currency: '₹',
  lowStockThreshold: 5,
  upiId: '',
  gstin: '',
  gstRegistered: false,
  productCategories: DEFAULT_PRODUCT_CATEGORIES,
  units: DEFAULT_UNITS,
  expenseCategories: [],
  btScannerEnabled: true,
  onboardingDone: false,
};

// Settings keys whose values are arrays — stored as JSON, not String().
const JSON_SETTING_KEYS = new Set<string>(['productCategories', 'units', 'expenseCategories']);

export const useAppStore = create<AppState>((set, get) => ({
  products: [],
  cart: [],
  bills: [],
  expenses: [],
  suppliers: [],
  returns: [],
  templates: [],
  purchases: [],
  supplierLedger: [],
  activeStockTake: null,
  stockTakeItems: [],
  settings: defaultSettings,
  isLoading: false,

  loadProducts: async () => {
    const products = await db.getAllProducts();
    set({ products });
  },

  addProduct: async (productData) => {
    const product: Product = {
      ...productData,
      id: generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.insertProduct(product);
    set(state => ({ products: [product, ...state.products] }));
  },

  updateProduct: async (product) => {
    const updated = { ...product, updatedAt: Date.now() };
    await db.updateProduct(updated);
    set(state => ({
      products: state.products.map(p => p.id === updated.id ? updated : p),
    }));
  },

  deleteProduct: async (id) => {
    await db.deleteProduct(id);
    set(state => ({ products: state.products.filter(p => p.id !== id) }));
  },

  addToCart: (product, quantity = 1) => {
    set(state => {
      const stock = product.quantity;
      if (stock <= 0) return state; // out of stock — nothing to add
      const existing = state.cart.find(i => i.product.id === product.id);
      if (existing) {
        // never let the cart hold more than is in stock
        const newQty = Math.min(existing.quantity + quantity, stock);
        return {
          cart: state.cart.map(i =>
            i.product.id === product.id ? { ...i, quantity: newQty } : i
          ),
        };
      }
      return { cart: [...state.cart, { product, quantity: Math.min(quantity, stock) }] };
    });
  },

  removeFromCart: (productId) => {
    set(state => ({ cart: state.cart.filter(i => i.product.id !== productId) }));
  },

  updateCartQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeFromCart(productId);
      return;
    }
    set(state => ({
      cart: state.cart.map(i =>
        // clamp to the item's available stock so you can't sell more than you have
        i.product.id === productId ? { ...i, quantity: Math.min(quantity, i.product.quantity) } : i
      ),
    }));
  },

  clearCart: () => set({ cart: [] }),

  checkout: async (paymentMode, discount, customerName, customerPhone, customerGstin) => {
    const { cart } = get();

    // Build bill items with GST breakdown (inclusive pricing)
    const items: BillItem[] = cart.map(i => {
      const gstRate = i.product.gstRate || 0;
      const lineTotal = i.product.sellingPrice * i.quantity;
      const taxableValue = gstRate > 0 ? lineTotal / (1 + gstRate / 100) : lineTotal;
      return {
        productId: i.product.id,
        productName: i.product.name,
        quantity: i.quantity,
        sellingPrice: i.product.sellingPrice,
        costPrice: i.product.costPrice,
        gstRate,
        taxableValue,
        hsnCode: i.product.hsnCode,
      };
    });

    // GST slab aggregation
    const slabMap: Record<number, GstSlab> = {};
    items.forEach(item => {
      if (item.gstRate === 0) return;
      if (!slabMap[item.gstRate]) slabMap[item.gstRate] = { rate: item.gstRate, taxableValue: 0, cgst: 0, sgst: 0 };
      const gstAmt = item.sellingPrice * item.quantity - item.taxableValue;
      slabMap[item.gstRate].taxableValue += item.taxableValue;
      slabMap[item.gstRate].cgst += gstAmt / 2;
      slabMap[item.gstRate].sgst += gstAmt / 2;
    });
    const gstBreakdown = Object.values(slabMap).sort((a, b) => a.rate - b.rate);
    const totalTaxableValue = items.reduce((s, i) => s + i.taxableValue, 0);
    const totalGst = items.reduce((s, i) => s + (i.sellingPrice * i.quantity - i.taxableValue), 0);

    const subtotal = items.reduce((sum, i) => sum + i.sellingPrice * i.quantity, 0);
    const total = subtotal - discount;
    const profit = items.reduce(
      (sum, i) => sum + (i.sellingPrice - i.costPrice) * i.quantity, 0
    ) - discount;

    const bill: Bill = {
      id: generateId(),
      items,
      subtotal,
      discount,
      total,
      profit,
      paymentMode,
      customerName,
      customerPhone,
      customerGstin: customerGstin || undefined,
      gstBreakdown,
      totalTaxableValue,
      totalGst,
      createdAt: Date.now(),
    };

    await db.insertBill(bill);

    // Credit sale → record it on the customer's Udhaar (credit book) as a `debit`
    // (debit = the customer now owes this amount). Matches an existing customer by
    // phone, then by name; otherwise creates one. Non-fatal if it fails.
    if (paymentMode === 'credit' && ((customerName && customerName.trim()) || (customerPhone && customerPhone.trim()))) {
      try {
        const customers = await db.getAllCustomers();
        const phoneDigits = (customerPhone || '').replace(/\D/g, '');
        const nameKey = (customerName || '').trim().toLowerCase();
        let match = phoneDigits ? customers.find(c => (c.phone || '').replace(/\D/g, '') === phoneDigits) : undefined;
        if (!match && nameKey) match = customers.find(c => c.name.trim().toLowerCase() === nameKey);

        let customerId: string;
        if (match) {
          customerId = match.id;
          if (phoneDigits && !match.phone) await db.updateCustomer({ ...match, phone: customerPhone });
        } else {
          customerId = generateId();
          await db.insertCustomer({
            id: customerId,
            name: (customerName || '').trim() || customerPhone || 'Customer',
            phone: customerPhone || undefined,
            createdAt: Date.now(),
          });
        }

        await db.insertUdhaarEntry({
          id: generateId(),
          customerId,
          amount: total,
          type: 'debit',
          note: `Bill · ${items.length} item${items.length > 1 ? 's' : ''}`,
          billId: bill.id,
          createdAt: Date.now(),
        });
      } catch {
        // non-fatal — the bill itself is already saved
      }
    }

    // Deduct stock
    for (const item of cart) {
      const newQty = Math.max(0, item.product.quantity - item.quantity);
      await db.updateProductQuantity(item.product.id, newQty);
    }

    // Refresh products and check low stock
    await get().loadProducts();
    const { suppliers } = get();
    const lowStock = get().products.filter(
      p => cart.some(c => c.product.id === p.id) && p.quantity <= p.lowStockThreshold
    );
    if (lowStock.length > 0) {
      const enriched = lowStock.map(p => {
        const supplier = p.supplierId ? suppliers.find(s => s.id === p.supplierId) : undefined;
        return { ...p, supplierName: supplier?.name, supplierPhone: supplier?.phone };
      });
      sendLowStockAlerts(enriched).catch(() => {});
    }

    set(state => ({ bills: [bill, ...state.bills], cart: [] }));
    return bill;
  },

  loadBills: async () => {
    const bills = await db.getAllBills();
    set({ bills });
  },

  addExpense: async (expenseData) => {
    const expense: Expense = {
      ...expenseData,
      id: generateId(),
      createdAt: Date.now(),
    };
    await db.insertExpense(expense);
    set(state => ({ expenses: [expense, ...state.expenses] }));
  },

  deleteExpense: async (id) => {
    await db.deleteExpense(id);
    set(state => ({ expenses: state.expenses.filter(e => e.id !== id) }));
  },

  loadExpenses: async () => {
    const expenses = await db.getAllExpenses();
    set({ expenses });
  },

  loadReturns: async () => {
    const returns = await db.getAllReturns();
    set({ returns });
  },

  processReturn: async (billId, items, refundAmount, reason) => {
    const ret: BillReturn = {
      id: generateId(),
      billId,
      items: items.filter(i => i.quantity > 0),
      refundAmount,
      reason: reason?.trim() || undefined,
      createdAt: Date.now(),
    };
    await db.insertReturn(ret);

    // Restock each returned item
    const { products } = get();
    for (const ri of ret.items) {
      const product = products.find(p => p.id === ri.productId);
      if (product) {
        await db.updateProductQuantity(product.id, product.quantity + ri.quantity);
      }
    }

    await get().loadProducts();
    set(state => ({ returns: [ret, ...state.returns] }));
  },

  loadTemplates: async () => {
    const templates = await db.getAllTemplates();
    set({ templates });
  },

  saveTemplate: async (name) => {
    const { cart } = get();
    const template: CartTemplate = {
      id: generateId(),
      name: name.trim(),
      items: cart.map(i => ({ productId: i.product.id, productName: i.product.name, quantity: i.quantity })),
      createdAt: Date.now(),
    };
    await db.insertTemplate(template);
    set(state => ({ templates: [template, ...state.templates] }));
  },

  renameTemplate: async (id, name) => {
    await db.updateTemplateName(id, name);
    set(state => ({ templates: state.templates.map(t => t.id === id ? { ...t, name } : t) }));
  },

  deleteTemplate: async (id) => {
    await db.deleteTemplate(id);
    set(state => ({ templates: state.templates.filter(t => t.id !== id) }));
  },

  loadSuppliers: async () => {
    const suppliers = await db.getAllSuppliers();
    set({ suppliers });
  },

  addSupplier: async (supplierData) => {
    const supplier: Supplier = { ...supplierData, id: generateId(), createdAt: Date.now() };
    await db.insertSupplier(supplier);
    set(state => ({
      suppliers: [...state.suppliers, supplier].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return supplier;
  },

  updateSupplier: async (supplier) => {
    await db.updateSupplier(supplier);
    set(state => ({ suppliers: state.suppliers.map(s => s.id === supplier.id ? supplier : s) }));
  },

  deleteSupplier: async (id) => {
    await db.deleteSupplier(id);
    set(state => ({
      suppliers: state.suppliers.filter(s => s.id !== id),
      products: state.products.map(p => p.supplierId === id ? { ...p, supplierId: undefined } : p),
      expenses: state.expenses.map(e => e.supplierId === id ? { ...e, supplierId: undefined } : e),
    }));
  },

  loadPurchases: async () => {
    const purchases = await db.getAllPurchases();
    set({ purchases });
  },

  createPurchase: async (purchaseData, costPriceUpdates = {}) => {
    const purchase: Purchase = {
      ...purchaseData,
      id: generateId(),
      createdAt: Date.now(),
    };

    await db.insertPurchase(purchase);

    // Update stock and optionally cost price for each item
    const { products } = get();
    for (const item of purchase.items) {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        const newQty = product.quantity + item.quantity;
        await db.updateProductQuantity(product.id, newQty);
        if (costPriceUpdates[item.productId] !== undefined) {
          await db.updateProduct({ ...product, costPrice: costPriceUpdates[item.productId], updatedAt: Date.now() });
        }
      }
    }

    // Ledger audit trail (only when supplier is linked)
    // Debit = full purchase liability; Credit = amount paid immediately
    // Net = outstanding. recordSupplierPayment adds further credits later.
    if (purchase.supplierId && purchase.totalAmount > 0.001) {
      const label = `Purchase${purchase.invoiceNumber ? ` #${purchase.invoiceNumber}` : ''} · ${purchase.items.length} item${purchase.items.length !== 1 ? 's' : ''}`;
      await db.insertLedgerEntry({
        id: generateId(),
        supplierId: purchase.supplierId,
        type: 'debit',
        amount: purchase.totalAmount,
        description: label,
        purchaseId: purchase.id,
        createdAt: purchase.createdAt,
      });
      if (purchase.paidAmount > 0) {
        await db.insertLedgerEntry({
          id: generateId(),
          supplierId: purchase.supplierId,
          type: 'credit',
          amount: purchase.paidAmount,
          description: `Paid at purchase · ${label}`,
          purchaseId: purchase.id,
          createdAt: purchase.createdAt,
        });
      }
    }

    // Expense record for the paid portion
    if (purchase.paidAmount > 0) {
      const expense: Expense = {
        id: generateId(),
        title: `Stock Purchase${purchase.supplierName ? ` · ${purchase.supplierName}` : ''}${purchase.invoiceNumber ? ` #${purchase.invoiceNumber}` : ''}`,
        amount: purchase.paidAmount,
        category: 'supplier',
        note: purchase.notes,
        supplierId: purchase.supplierId,
        createdAt: purchase.createdAt,
      };
      await db.insertExpense(expense);
      set(state => ({ expenses: [expense, ...state.expenses] }));
    }

    await get().loadProducts();
    await get().loadSupplierLedger();
    set(state => ({ purchases: [purchase, ...state.purchases] }));
    return purchase;
  },

  loadSupplierLedger: async () => {
    const supplierLedger = await db.getAllLedgerEntries();
    set({ supplierLedger });
  },

  recordSupplierPayment: async (supplierId, amount, paymentMode, note) => {
    const { suppliers, purchases } = get();
    const supplier = suppliers.find(s => s.id === supplierId);
    const now = Date.now();

    // Apply payment FIFO to outstanding purchases (oldest first)
    const outstanding = purchases
      .filter(p => p.supplierId === supplierId && p.paidAmount < p.totalAmount)
      .sort((a, b) => a.createdAt - b.createdAt);

    let remaining = amount;
    const updatedIds: Record<string, number> = {};
    for (const p of outstanding) {
      if (remaining <= 0.001) break;
      const due = p.totalAmount - p.paidAmount;
      const applied = Math.min(due, remaining);
      remaining -= applied;
      updatedIds[p.id] = p.paidAmount + applied;
      await db.updatePurchasePaidAmount(p.id, updatedIds[p.id]);
    }

    // Ledger credit entry (audit trail)
    await db.insertLedgerEntry({
      id: generateId(),
      supplierId,
      type: 'credit',
      amount,
      description: note?.trim() || `Payment to ${supplier?.name || 'supplier'}`,
      createdAt: now,
    });

    const expense: Expense = {
      id: generateId(),
      title: `Payment to ${supplier?.name || 'Supplier'}`,
      amount,
      category: 'supplier',
      note: note?.trim() || undefined,
      supplierId,
      createdAt: now,
    };
    await db.insertExpense(expense);

    await get().loadSupplierLedger();
    set(state => ({
      purchases: state.purchases.map(p =>
        updatedIds[p.id] !== undefined ? { ...p, paidAmount: updatedIds[p.id] } : p
      ),
      expenses: [expense, ...state.expenses],
    }));
  },

  updateSettings: async (partial) => {
    const updated = { ...get().settings, ...partial };
    for (const [key, value] of Object.entries(partial)) {
      await db.setSetting(key, JSON_SETTING_KEYS.has(key) ? JSON.stringify(value) : String(value));
    }
    set({ settings: updated });
  },

  loadSettings: async () => {
    const keys = Object.keys(defaultSettings) as (keyof AppSettings)[];
    const loaded: Partial<AppSettings> = {};
    for (const key of keys) {
      const val = await db.getSetting(key);
      if (val !== null) {
        if (key === 'lowStockThreshold') (loaded as any)[key] = parseInt(val);
        else if (key === 'gstRegistered' || key === 'btScannerEnabled' || key === 'onboardingDone') (loaded as any)[key] = val === 'true';
        else if (JSON_SETTING_KEYS.has(key)) {
          try { (loaded as any)[key] = JSON.parse(val); } catch { /* keep default */ }
        }
        else (loaded as any)[key] = val;
      }
    }
    set({ settings: { ...defaultSettings, ...loaded } });
  },

  resetApp: async () => {
    await db.resetAllData();
    const st = get();
    await Promise.all([
      st.loadProducts(), st.loadBills(), st.loadExpenses(), st.loadReturns(),
      st.loadTemplates(), st.loadSuppliers(), st.loadPurchases(),
      st.loadSupplierLedger(), st.loadActiveStockTake(), st.loadSettings(),
    ]);
    set({ cart: [] });
  },

  setLanguage: (lang) => {
    set(state => ({ settings: { ...state.settings, language: lang } }));
    db.setSetting('language', lang);
  },

  loadActiveStockTake: async () => {
    const session = await db.getActiveStockTakeSession();
    if (session) {
      const items = await db.getStockTakeItems(session.id);
      set({ activeStockTake: session, stockTakeItems: items });
    } else {
      set({ activeStockTake: null, stockTakeItems: [] });
    }
  },

  startStockTake: async (scope) => {
    const { activeStockTake, products } = get();
    // Cancel any running session first
    if (activeStockTake) {
      await db.updateStockTakeSession({ ...activeStockTake, status: 'completed', completedAt: Date.now() });
    }
    const session: StockTakeSession = {
      id: generateId(),
      scope,
      status: 'active',
      startedAt: Date.now(),
    };
    await db.insertStockTakeSession(session);
    // Snapshot all in-scope products at current quantities
    const scopedProducts = scope === 'all' ? products : products.filter(p => p.category === scope);
    const items: StockTakeItem[] = scopedProducts.map(p => ({
      id: generateId(),
      sessionId: session.id,
      productId: p.id,
      productName: p.name,
      category: p.category,
      systemQty: p.quantity,
      countedQty: null,
      updatedAt: Date.now(),
    }));
    for (const item of items) {
      await db.insertStockTakeItem(item);
    }
    set({ activeStockTake: session, stockTakeItems: items });
  },

  updateStockTakeCount: async (itemId, countedQty) => {
    const updatedAt = Date.now();
    await db.updateStockTakeItemCount(itemId, countedQty, updatedAt);
    set(state => ({
      stockTakeItems: state.stockTakeItems.map(i =>
        i.id === itemId ? { ...i, countedQty, updatedAt } : i
      ),
    }));
  },

  commitStockTake: async () => {
    const { activeStockTake, stockTakeItems } = get();
    if (!activeStockTake) return;
    const countedItems = stockTakeItems.filter(i => i.countedQty !== null);
    const now = Date.now();
    const summary: StockTakeSummary = {
      counted: countedItems.length,
      short: countedItems.filter(i => i.countedQty! < i.systemQty).length,
      over: countedItems.filter(i => i.countedQty! > i.systemQty).length,
      exact: countedItems.filter(i => i.countedQty! === i.systemQty).length,
      skipped: stockTakeItems.length - countedItems.length,
      netAdjustment: countedItems.reduce((s, i) => s + (i.countedQty! - i.systemQty), 0),
    };
    // Atomic DB transaction: update all product quantities + complete the session
    await db.commitStockTakeTransaction(countedItems, activeStockTake, summary, now);
    // Reload products so rest of app sees updated quantities
    await get().loadProducts();
    set({ activeStockTake: null, stockTakeItems: [] });
  },

  cancelStockTake: async () => {
    const { activeStockTake } = get();
    if (!activeStockTake) return;
    await db.deleteStockTakeSession(activeStockTake.id);
    set({ activeStockTake: null, stockTakeItems: [] });
  },
}));
