export interface GstSlab {
  rate: number;       // 5 | 12 | 18 | 28
  taxableValue: number;
  cgst: number;
  sgst: number;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  costPrice: number;
  sellingPrice: number;  // GST-inclusive (MRP)
  quantity: number;
  barcode?: string;
  imageUri?: string;
  unit: string;
  lowStockThreshold: number;
  supplierId?: string;
  gstRate: number;    // 0 | 5 | 12 | 18 | 28
  hsnCode?: string;
  expiryDate?: number; // Unix timestamp ms, midnight of expiry day
  createdAt: number;
  updatedAt: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface BillItem {
  productId: string;
  productName: string;
  quantity: number;
  sellingPrice: number;  // GST-inclusive unit price
  costPrice: number;
  gstRate: number;        // captured at time of sale
  taxableValue: number;   // pre-tax line total (sellingPrice*qty / (1+rate/100))
  hsnCode?: string;
}

export interface Bill {
  id: string;
  items: BillItem[];
  subtotal: number;
  discount: number;
  total: number;
  profit: number;
  paymentMode: 'cash' | 'upi' | 'credit';
  customerName?: string;
  customerPhone?: string;
  customerGstin?: string;
  gstBreakdown: GstSlab[];
  totalTaxableValue: number;
  totalGst: number;
  createdAt: number;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  // Built-in keys (rent/electricity/supplier/salary/other) or a user-defined category.
  category: string;
  note?: string;
  supplierId?: string;
  createdAt: number;
}

export interface DailySummary {
  date: string;
  revenue: number;
  profit: number;
  expenses: number;
  netProfit: number;
  billCount: number;
  topItems: { name: string; quantity: number }[];
}

export interface ReturnItem {
  productId: string;
  productName: string;
  quantity: number;
  sellingPrice: number;
  costPrice?: number; // captured at return time so profit can be netted (optional: older returns lack it)
}

export interface BillReturn {
  id: string;
  billId: string;
  items: ReturnItem[];
  refundAmount: number;
  reason?: string;
  createdAt: number;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  createdAt: number;
  lastRemindedAt?: number; // when a WhatsApp payment reminder was last sent
}

export interface UdhaarEntry {
  id: string;
  customerId: string;
  amount: number;
  type: 'debit' | 'credit'; // debit = you gave credit, credit = they paid back
  note?: string;
  billId?: string;
  createdAt: number;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  createdAt: number;
}

export interface CartTemplate {
  id: string;
  name: string;
  items: { productId: string; productName: string; quantity: number }[];
  createdAt: number;
}

export interface PurchaseItem {
  productId: string;
  productName: string;
  quantity: number;
  costPrice: number;
  totalCost: number;
}

export interface Purchase {
  id: string;
  supplierId?: string;
  supplierName?: string;
  invoiceNumber?: string;
  items: PurchaseItem[];
  totalAmount: number;
  paidAmount: number;
  paymentMode?: 'cash' | 'upi' | 'bank';
  notes?: string;
  createdAt: number;
}

export interface SupplierLedgerEntry {
  id: string;
  supplierId: string;
  type: 'debit' | 'credit';
  amount: number;
  description: string;
  purchaseId?: string;
  createdAt: number;
}

export interface StockTakeItem {
  id: string;
  sessionId: string;
  productId: string;
  productName: string;
  category: string;
  systemQty: number;
  countedQty: number | null; // null = not counted yet
  updatedAt: number;
}

export interface StockTakeSummary {
  counted: number;
  short: number;
  over: number;
  exact: number;
  skipped: number;
  netAdjustment: number;
}

export interface StockTakeSession {
  id: string;
  scope: string; // 'all' or a category name
  status: 'active' | 'completed';
  startedAt: number;
  completedAt?: number;
  summary?: StockTakeSummary;
}

export type Language = 'en' | 'hi' | 'kn' | 'gu';

export type ReminderLang = 'hi' | 'en' | 'hinglish';
export type ReminderTone = 'polite' | 'firm';

export interface AppSettings {
  shopName: string;
  ownerName: string;
  phone: string;
  address: string;
  language: Language;
  currency: string;
  lowStockThreshold: number;
  upiId?: string;
  gstin: string;
  gstRegistered: boolean;
  // User-customizable option lists (managed in Manage Lists).
  productCategories: string[];
  units: string[];
  expenseCategories: string[]; // custom extras beyond the built-in expense categories
  btScannerEnabled: boolean;   // Bluetooth HID barcode scanner support on the billing screen
  onboardingDone: boolean;     // first-run setup completed
  dailyGoal: number;           // daily revenue target (0 = not set)
  // Udhaar WhatsApp payment reminders
  reminderLang: ReminderLang;       // message language (Hindi / English / Hinglish)
  reminderTone: ReminderTone;       // polite or firm wording
  reminderIncludeUpi: boolean;      // append a "Pay via UPI: <id>" line
  reminderTemplate: string;         // custom override ('' = use preset); placeholders {name} {shop} {amount} {upi}
  // Supplier stock-reorder message
  reorderLang: ReminderLang;        // reorder message language
  reorderTemplate: string;          // custom override ('' = use preset); placeholders {shop} {supplier} {items}
}
