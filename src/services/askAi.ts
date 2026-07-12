import { getGeminiApiKey } from './gemini';
import { getGroqApiKey } from './groq';
import { useAppStore } from '../stores/useAppStore';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
import * as db from '../db/database';
import { startOfDay, startOfWeek, startOfMonth } from '../utils/helpers';
import { computeSalesStats, makeCostOf } from '../utils/stats';

const URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// A structured card list the UI renders below the AI's text (e.g. product/customer cards).
export type AiWidget = {
  kind: 'products' | 'customers' | 'stock' | 'expiring' | 'bills' | 'expenses';
  title: string;
  items: { name: string; metric: string; sub?: string }[];
};
export type ChatMsg = { role: 'user' | 'ai'; text: string; widget?: AiWidget };
export type AskResult = { ok: true; text: string; widget?: AiWidget } | { ok: false; error: string };

// Static "how to use the app" knowledge so the assistant can answer usage / how-to
// questions (not just data questions). Keep in sync with the app's navigation.
const APP_GUIDE = `APP GUIDE — how to do things in this app.
Bottom tabs: Home, Inventory, Billing, More.
- Make a sale / create a bill: open the "Billing" tab (New Bill), add products (scan barcode or search), pick payment mode (Cash / UPI / Credit-udhaar), then Save. Saved bills appear under More → Bill History.
- Return / refund a bill: More → Bill History → open the bill → Return, pick items + refund amount. Returned stock goes back to inventory and your revenue/profit auto-adjust (netted by the return date). Filter to returned bills via the Bill History filter; see totals in Analytics → Returns.
- Add a product: "Inventory" tab → the add (+) button → fill name, price, cost, stock, unit, category, optional barcode & expiry → Save. To add many at once: Inventory → Bulk Import CSV.
- Edit / update stock of a product: Inventory tab → tap the product → edit.
- Bulk-edit prices/stock fast: More → Quick Edit → pick a category, then swipe each product card right to save or left to skip (edit price, cost, stock, low-stock level on each card).
- Record an expense: More → Expenses → add a new expense (amount + category).
- Close the day / count cash (reconcile drawer): Home → Day Close, or More → Day Close. Enter opening cash + counted cash; it shows expected vs counted (over/short) and saves a daily record.
- Ask AI by voice: tap the mic in the Ask AI input bar, speak your question, and it transcribes and asks automatically.
- Customer credit / udhaar (paisa baaki): More → Udhaar. Open a customer, add an entry — "debit" = they took on credit (owe you), "credit" = they paid you back.
- Send a WhatsApp payment reminder: More → Udhaar → tap "Remind" on a customer, or "Remind all" to go through everyone who owes one by one. Customise the message language/tone/UPI line at More → Settings → WhatsApp Messages.
- Suppliers (vendors): More → Suppliers.
- Record stock purchases / payables (GRN): More → Purchases → New Purchase / GRN.
- Count shelves & fix stock differences: More → Stock Take.
- Reorder low stock: tap the "low on stock" alert on Home, or More → Reorder Stock. Items are grouped by supplier — adjust quantities, then "WhatsApp reorder" to message the supplier the list, or "Draft purchase" to pre-fill a new purchase. Customise the reorder message at More → Settings → WhatsApp Messages.
- See charts (revenue & profit): More → Analytics.
- See busiest hours / when sales happen: the "Busiest hours" card on Home, or More → Analytics (weekday × hour heatmap with your peak time).
- Export reports (PDF/CSV): More → Export Reports.
- Settings: More → Settings. Inside: Shop Information (name, owner, phone, address, UPI, GST, and the Online Shop toggle — this ONE screen is the only place shop details and GST live), Preferences (customise product categories, units, expense categories, toggle the Bluetooth barcode scanner), and Backup & Restore.
- Signing in: the app requires a mobile-number OTP sign-in right at the start, before anything else — this same login is what backs up your data to the cloud and (if enabled) runs your Online Shop.
- Sell online / Online Shop: More → Settings → Shop Information → turn on "Use Online Shop" (or tap the "Sell online too" card on the Home screen) → fill in shop URL, description, delivery, pickup location, hours, and auto-cancel timeout for unaccepted orders (5–30 minutes) → Save. Once it's on, a mode-switch button appears beside the bottom tab bar — tap it to flip between the "Local" portion (Home/Inventory/Billing/More) and a separate "Online" portion with its own three tabs: Dashboard (live/closed toggle, today's orders, 7-day trend), Orders (accept/reject/mark ready, filter by status/date, search), and Products (a fully independent online catalog — add by importing a local product as a one-time copy, or create an online-only listing; edit/remove/toggle visibility and set a different online price per item). Shop Information itself is reachable from either portion. Requires an internet connection to save — shop info is otherwise cached locally so billing keeps working offline.
- Backup & restore data to the cloud: More → Settings → Backup & Restore (uses the same sign-in as the rest of the app — Back up or Restore).
- Re-run the setup wizard: More → Settings → Preferences.
- Erase data vs Log out: More → Settings has two separate destructive options — "Erase data" clears products/bills/expenses/customers/suppliers on this device but KEEPS the shop profile and sign-in; "Log out" wipes this device completely (everything, like a fresh install) and signs out — online-shop data is safe in the cloud and comes back on next login with the same phone number.
- Ask AI (this assistant): Home screen → the "Ask AI" bar.`;

const r = (n: number) => Math.round(n);
const sum = <T,>(arr: T[], f: (x: T) => number) => arr.reduce((s, x) => s + f(x), 0);

// Compact JSON of useful aggregates the model can reason over (no raw dumps).
async function buildContext() {
  const st = useAppStore.getState();
  const { products, bills, expenses, returns } = st;
  const dayS = startOfDay(), weekS = startOfWeek(), monthS = startOfMonth();
  const dayMs = 86400000;
  const nowTs = Date.now();

  // Revenue/profit/items are netted of returns (matches Dashboard & Analytics).
  const costOf = makeCostOf(products);
  const netAgg = (from: number, to: number = nowTs) => {
    const x = computeSalesStats({ bills, returns, from, to, costOf });
    return { revenue: r(x.revenue), profit: r(x.profit), bills: x.billCount, itemsSold: x.itemsSold };
  };
  const billsToday = bills.filter(b => b.createdAt >= dayS);
  const billsMonth = bills.filter(b => b.createdAt >= monthS);
  const monthStats = computeSalesStats({ bills, returns, from: monthS, to: nowTs, costOf });

  const topMonth: Record<string, number> = {};
  billsMonth.forEach(b => b.items.forEach(i => { topMonth[i.productName] = (topMonth[i.productName] || 0) + i.quantity; }));
  const topProductsThisMonth = Object.entries(topMonth).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, qty]) => ({ name, qtySold: qty }));

  const paymentSplitToday = ['cash', 'upi', 'credit'].map(mode => ({ mode, total: r(sum(billsToday.filter(b => b.paymentMode === mode), b => b.total)) }));

  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  // Compact per-product list so the model can answer specific questions
  // (price / stock / expiry / category of a named product).
  const productList = products.slice(0, 120).map(p => ({
    name: p.name,
    stock: p.quantity,
    unit: p.unit,
    price: p.sellingPrice,
    category: p.category,
    ...(p.expiryDate && p.expiryDate > 0 ? { expiry: fmtDate(p.expiryDate) } : {}),
  }));

  const expiringSoon = products
    .filter(p => p.expiryDate && p.expiryDate > 0)
    .map(p => ({ name: p.name, expiry: fmtDate(p.expiryDate!), daysLeft: Math.ceil((p.expiryDate! - Date.now()) / dayMs) }))
    .filter(p => p.daysLeft <= 60)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 20);

  const recentBills = bills.slice(0, 8).map(b => ({
    when: new Date(b.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    total: r(b.total),
    mode: b.paymentMode,
    customer: b.customerName || null,
  }));

  const expCat: Record<string, number> = {};
  expenses.filter(e => e.createdAt >= monthS).forEach(e => { expCat[e.category] = (expCat[e.category] || 0) + e.amount; });
  const expensesByCategory = Object.entries(expCat).sort((a, b) => b[1] - a[1]).map(([category, total]) => ({ category, total: r(total) }));

  // Customers who owe money (udhaar: debit = owes, credit = paid)
  let customersWhoOwe: { name: string; balance: number }[] = [];
  let totalOutstanding = 0;
  try {
    const [customers, udhaar] = await Promise.all([db.getAllCustomers(), db.getAllUdhaar()]);
    const nameById: Record<string, string> = {};
    customers.forEach(c => { nameById[c.id] = c.name; });
    const bal: Record<string, number> = {};
    udhaar.forEach(u => { bal[u.customerId] = (bal[u.customerId] || 0) + (u.type === 'debit' ? u.amount : -u.amount); });
    customersWhoOwe = Object.entries(bal).filter(([, v]) => v > 0).map(([id, v]) => ({ name: nameById[id] || 'Unknown', balance: r(v) })).sort((a, b) => b.balance - a.balance).slice(0, 15);
    totalOutstanding = r(customersWhoOwe.reduce((s, c) => s + c.balance, 0));
  } catch { /* udhaar optional */ }

  // Supplier dues (ledger: debit = we owe more, credit = we paid)
  let totalSupplierPayable = 0;
  try {
    const ledger = await db.getAllLedgerEntries();
    totalSupplierPayable = r(sum(ledger, e => (e.type === 'debit' ? e.amount : -e.amount)));
  } catch { /* optional */ }

  return {
    today: netAgg(dayS),
    yesterday: netAgg(dayS - dayMs, dayS - 1),
    thisWeek: netAgg(weekS),
    thisMonth: netAgg(monthS),
    returnsThisMonth: { count: monthStats.returnCount, refunded: r(monthStats.refunds), unitsReturned: monthStats.returnedUnits },
    expenses: { today: r(sum(expenses.filter(e => e.createdAt >= dayS), e => e.amount)), thisMonth: r(sum(expenses.filter(e => e.createdAt >= monthS), e => e.amount)), byCategoryThisMonth: expensesByCategory },
    paymentSplitToday,
    topProductsThisMonth,
    recentBills,
    expiringSoon,
    productList,
    inventory: {
      totalProducts: products.length,
      lowStockItems: products.filter(p => p.quantity <= p.lowStockThreshold).map(p => ({ name: p.name, qty: p.quantity })).slice(0, 25),
      stockValueAtCost: r(sum(products, p => p.costPrice * p.quantity)),
      stockValueAtRetail: r(sum(products, p => p.sellingPrice * p.quantity)),
    },
    udhaar: { totalOutstanding, customersWhoOwe },
    suppliers: { totalPayable: totalSupplierPayable },
  };
}

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// ── Tools the model can call. Each reads from the already-built context and
// returns both the data (fed back to the model for grounding) and an optional
// card widget for the UI. This is real OpenAI-style function calling on Groq. ──
type ToolDef = {
  schema: any;
  run: (args: any, ctx: any) => { data: any; widget?: AiWidget };
};

const TOOLS: Record<string, ToolDef> = {
  list_debtors: {
    schema: { type: 'function', function: { name: 'list_debtors', description: 'Customers who owe money (udhaar/credit pending). Use for "who owes me", baaki, pending dues.', parameters: { type: 'object', properties: {} } } },
    run: (_a, ctx) => ({ data: ctx.udhaar.customersWhoOwe, widget: ctx.udhaar.customersWhoOwe.length ? { kind: 'customers', title: 'Customers who owe you', items: ctx.udhaar.customersWhoOwe.slice(0, 12).map((c: any) => ({ name: c.name, metric: money(c.balance) })) } : undefined }),
  },
  list_low_stock: {
    schema: { type: 'function', function: { name: 'list_low_stock', description: 'Items at or below their low-stock threshold (need restock/reorder).', parameters: { type: 'object', properties: {} } } },
    run: (_a, ctx) => ({ data: ctx.inventory.lowStockItems, widget: ctx.inventory.lowStockItems.length ? { kind: 'stock', title: 'Low on stock', items: ctx.inventory.lowStockItems.slice(0, 12).map((p: any) => ({ name: p.name, metric: `${p.qty} left` })) } : undefined }),
  },
  list_expiring: {
    schema: { type: 'function', function: { name: 'list_expiring', description: 'Products expiring soon (within ~60 days), nearest first.', parameters: { type: 'object', properties: {} } } },
    run: (_a, ctx) => ({ data: ctx.expiringSoon, widget: ctx.expiringSoon.length ? { kind: 'expiring', title: 'Expiring soon', items: ctx.expiringSoon.slice(0, 12).map((p: any) => ({ name: p.name, metric: p.daysLeft <= 0 ? 'expired' : `${p.daysLeft}d left`, sub: p.expiry })) } : undefined }),
  },
  list_recent_bills: {
    schema: { type: 'function', function: { name: 'list_recent_bills', description: 'The most recent sales/bills/transactions.', parameters: { type: 'object', properties: {} } } },
    run: (_a, ctx) => ({ data: ctx.recentBills, widget: ctx.recentBills.length ? { kind: 'bills', title: 'Recent bills', items: ctx.recentBills.map((b: any) => ({ name: b.customer || b.when, metric: money(b.total), sub: b.customer ? `${b.mode} · ${b.when}` : b.mode })) } : undefined }),
  },
  list_expenses_by_category: {
    schema: { type: 'function', function: { name: 'list_expenses_by_category', description: 'This month\'s expenses broken down by category.', parameters: { type: 'object', properties: {} } } },
    run: (_a, ctx) => ({ data: ctx.expenses.byCategoryThisMonth, widget: ctx.expenses.byCategoryThisMonth.length ? { kind: 'expenses', title: 'Expenses this month', items: ctx.expenses.byCategoryThisMonth.map((e: any) => ({ name: e.category, metric: money(e.total) })) } : undefined }),
  },
  list_top_products: {
    schema: { type: 'function', function: { name: 'list_top_products', description: 'Best-selling products this month, by quantity sold.', parameters: { type: 'object', properties: {} } } },
    run: (_a, ctx) => ({ data: ctx.topProductsThisMonth, widget: ctx.topProductsThisMonth.length ? { kind: 'products', title: 'Top products this month', items: ctx.topProductsThisMonth.slice(0, 8).map((p: any) => ({ name: p.name, metric: `${p.qtySold} sold` })) } : undefined }),
  },
  list_all_products: {
    schema: { type: 'function', function: { name: 'list_all_products', description: 'Full inventory list with stock and price. Use for "show all products", "my inventory".', parameters: { type: 'object', properties: {} } } },
    run: (_a, _ctx) => {
      const products = useAppStore.getState().products;
      return { data: products.map(p => ({ name: p.name, stock: p.quantity, price: p.sellingPrice })), widget: products.length ? { kind: 'products', title: `All products (${products.length})`, items: products.slice(0, 80).map(p => ({ name: p.name, metric: `${p.quantity} ${p.unit || 'pcs'}`, sub: money(p.sellingPrice) })) } : undefined };
    },
  },
  get_product: {
    schema: { type: 'function', function: { name: 'get_product', description: 'Details for one product by name: stock, price, category, expiry.', parameters: { type: 'object', properties: { name: { type: 'string', description: 'Product name (partial match ok)' } }, required: ['name'] } } },
    run: (args, ctx) => {
      const q = String(args?.name || '').toLowerCase();
      const found = (ctx.productList as any[]).filter(p => p.name.toLowerCase().includes(q)).slice(0, 5);
      return { data: found.length ? found : 'No matching product found.', widget: found.length ? { kind: 'products', title: found.length === 1 ? found[0].name : 'Matching products', items: found.map((p: any) => ({ name: p.name, metric: `${p.stock} ${p.unit || 'pcs'}`, sub: [money(p.price), p.expiry ? `exp ${p.expiry}` : null].filter(Boolean).join(' · ') })) } : undefined };
    },
  },
};

type CallResult = { ok: true; text: string; widget?: AiWidget } | { ok: false; status?: number; error: string };

// Groq with function-calling: the model itself decides which list/detail tool to
// call; we run it on real data, feed results back, and it writes the final answer.
async function callGroqTools(system: string, history: ChatMsg[], question: string, ctx: any): Promise<CallResult> {
  const key = getGroqApiKey();
  if (!key) return { ok: false, error: 'no-groq-key' };
  const messages: any[] = [
    { role: 'system', content: system },
    ...history.slice(-6).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
    { role: 'user', content: question },
  ];
  const tools = Object.values(TOOLS).map(t => t.schema);
  const post = (body: any) => fetch(GROQ_CHAT_URL, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  try {
    let res = await post({ model: 'llama-3.3-70b-versatile', temperature: 0.2, messages, tools, tool_choice: 'auto' });
    if (!res.ok) return { ok: false, status: res.status, error: `Groq ${res.status}` };
    let msg = (await res.json())?.choices?.[0]?.message;
    if (!msg) return { ok: false, error: 'empty' };

    const calls = msg.tool_calls as any[] | undefined;
    if (calls?.length) {
      messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
      let widget: AiWidget | undefined;
      for (const c of calls) {
        const tool = TOOLS[c.function?.name];
        let out: { data: any; widget?: AiWidget } = { data: 'Unknown tool.' };
        if (tool) { try { out = tool.run(JSON.parse(c.function.arguments || '{}'), ctx); } catch { out = { data: 'Tool error.' }; } }
        if (!widget && out.widget) widget = out.widget;
        messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(out.data) });
      }
      res = await post({ model: 'llama-3.3-70b-versatile', temperature: 0.2, messages });
      if (!res.ok) return { ok: false, status: res.status, error: `Groq ${res.status}` };
      const text = (await res.json())?.choices?.[0]?.message?.content?.trim();
      return text ? { ok: true, text, widget } : { ok: false, error: 'empty' };
    }
    const text = msg.content?.trim();
    return text ? { ok: true, text } : { ok: false, error: 'empty' };
  } catch { return { ok: false, error: 'network' }; }
}

// Gemini — fallback provider.
async function callGemini(system: string, history: ChatMsg[], question: string): Promise<CallResult> {
  const key = getGeminiApiKey();
  if (!key) return { ok: false, error: 'no-gemini-key' };
  const contents = [
    ...history.slice(-6).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })),
    { role: 'user', parts: [{ text: question }] },
  ];
  try {
    const res = await fetch(`${URL}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0.2 } }),
    });
    if (!res.ok) return { ok: false, status: res.status, error: `Gemini ${res.status}` };
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text ? { ok: true, text } : { ok: false, error: 'empty' };
  } catch { return { ok: false, error: 'network' }; }
}

// Detect when a question wants a list, and build cards from the already-computed data.
function detectWidget(question: string, ctx: any): AiWidget | undefined {
  const q = question.toLowerCase();
  const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  if (/(owe|udhaar|udhar|credit|pending|baaki|baki|due from|to collect)/.test(q) && ctx.udhaar.customersWhoOwe.length) {
    return { kind: 'customers', title: 'Customers who owe you', items: ctx.udhaar.customersWhoOwe.slice(0, 8).map((c: any) => ({ name: c.name, metric: money(c.balance) })) };
  }
  if (/(low stock|running low|out of stock|reorder|re-order|restock|low on|finishing)/.test(q) && ctx.inventory.lowStockItems.length) {
    return { kind: 'stock', title: 'Low on stock', items: ctx.inventory.lowStockItems.slice(0, 10).map((p: any) => ({ name: p.name, metric: `${p.qty} left` })) };
  }
  if (/expir/.test(q) && /(soon|list|show|which|all|coming|next|expiring)/.test(q) && ctx.expiringSoon.length) {
    return { kind: 'expiring', title: 'Expiring soon', items: ctx.expiringSoon.slice(0, 12).map((p: any) => ({ name: p.name, metric: p.daysLeft <= 0 ? 'expired' : `${p.daysLeft}d left`, sub: p.expiry })) };
  }
  if (/(recent|last|latest|today'?s?)/.test(q) && /(bill|sale|transaction|order)/.test(q) && ctx.recentBills.length) {
    return { kind: 'bills', title: 'Recent bills', items: ctx.recentBills.map((b: any) => ({ name: b.customer || b.when, metric: money(b.total), sub: b.customer ? `${b.mode} · ${b.when}` : b.mode })) };
  }
  if (/(expense|spend|spent|kharch)/.test(q) && /(breakdown|categor|where|on what|list|show|how much|most)/.test(q) && ctx.expenses.byCategoryThisMonth.length) {
    return { kind: 'expenses', title: 'Expenses this month', items: ctx.expenses.byCategoryThisMonth.map((e: any) => ({ name: e.category, metric: money(e.total) })) };
  }
  if (/(top|best|most|highest|selling|sell|popular)/.test(q) && /(product|item|sell|seller)/.test(q) && ctx.topProductsThisMonth.length) {
    return { kind: 'products', title: 'Top products this month', items: ctx.topProductsThisMonth.slice(0, 5).map((p: any) => ({ name: p.name, metric: `${p.qtySold} sold` })) };
  }
  // "show all products" / "list my inventory" / "what products do I have"
  if (/(product|item|inventory|stock)/.test(q) && /(all|list|show|every|which|what|my|have|see|view)/.test(q)) {
    const products = useAppStore.getState().products;
    if (products.length) {
      return {
        kind: 'products',
        title: `All products (${products.length})`,
        items: products.slice(0, 60).map((p) => ({ name: p.name, metric: `${p.quantity} ${p.unit || 'pcs'}`, sub: money(p.sellingPrice) })),
      };
    }
  }
  return undefined;
}

export async function askAI(question: string, history: ChatMsg[] = []): Promise<AskResult> {
  if (!question.trim()) return { ok: false, error: 'Please type a question.' };
  if (!getGroqApiKey() && !getGeminiApiKey()) return { ok: false, error: 'Ask AI needs a Groq or Gemini API key in your build.' };

  let ctx;
  try { ctx = await buildContext(); } catch { return { ok: false, error: 'Could not read your shop data.' }; }

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Lean summary for the prompt (totals/counts only). Detailed lists live behind
  // tools, so the model calls a tool to fetch them — which also renders cards.
  const summary = {
    today: ctx.today, yesterday: ctx.yesterday, thisWeek: ctx.thisWeek, thisMonth: ctx.thisMonth,
    expenses: { today: ctx.expenses.today, thisMonth: ctx.expenses.thisMonth },
    paymentSplitToday: ctx.paymentSplitToday,
    inventory: { totalProducts: ctx.inventory.totalProducts, lowStockCount: ctx.inventory.lowStockItems.length, stockValueAtCost: ctx.inventory.stockValueAtCost, stockValueAtRetail: ctx.inventory.stockValueAtRetail },
    udhaar: { totalOutstanding: ctx.udhaar.totalOutstanding, debtorCount: ctx.udhaar.customersWhoOwe.length },
    suppliers: ctx.suppliers,
    expiringSoonCount: ctx.expiringSoon.length,
  };

  const system =
    'You are "Shopkeeper AI", a friendly assistant inside an Indian shop-management app. ' +
    'The SUMMARY JSON below has high-level totals. For any specific list or detail (debtors, low stock, expiring items, recent bills, expense breakdown, top/all products, or one product\'s details) you MUST call the matching tool — do not guess from the summary. ' +
    'All money is in Indian Rupees — write amounts like ₹1,250. ' +
    `Today is ${today}. Keep answers short (1–3 sentences) and concrete with actual numbers. ` +
    'When a tool returns a list, the app shows it as cards below your reply — so give only a short one-line summary and do NOT repeat the full list in text. ' +
    'For "how do I…" / "where is…" / usage questions about operating the app, answer from the APP GUIDE with clear step-by-step navigation (e.g. "More → Settings → Backup & Restore"). ' +
    'If neither the summary, a tool, nor the APP GUIDE has the answer, say you don\'t have that info yet — never invent numbers or features. ' +
    'You may reply in the language the user asks in.\n\n' + APP_GUIDE + '\n\nSUMMARY:\n' + JSON.stringify(summary);

  // Try Groq (with tools) first, then Gemini (plain text + regex widget fallback).
  let rateLimited = false;
  const groq = await callGroqTools(system, history, question, ctx);
  if (groq.ok) return { ok: true, text: groq.text, widget: groq.widget };
  if (groq.status === 429) rateLimited = true;

  const geminiSystem = system + '\n\nFULL DATA (for your reference):\n' + JSON.stringify(ctx);
  const widget = detectWidget(question, ctx);
  {
    const res = await callGemini(geminiSystem, history, question);
    if (res.ok) return { ok: true, text: res.text, widget };
    if (res.status === 429) rateLimited = true;
  }
  return {
    ok: false,
    error: rateLimited
      ? 'Ask AI is busy right now (rate limit reached). Please try again in a few seconds.'
      : 'Couldn’t reach the AI. Check your connection and try again.',
  };
}

export const SUGGESTED_QUESTIONS = [
  'How much did I sell this week?',
  'Who owes me money?',
  "What's my best-selling item this month?",
  'How much are my expenses this month?',
  'Which items are low on stock?',
  "What's my profit today?",
];
