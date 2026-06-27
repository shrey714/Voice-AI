import { Bill, BillReturn } from '../types';

// ── Single source of truth for sales metrics ────────────────────────────────
// Every screen (Dashboard, Analytics, More, Bill History…) should derive its
// revenue / profit / item / payment numbers from computeSalesStats so returns
// are netted consistently. Change the accounting in ONE place here.

export interface SalesStats {
  // Money
  grossRevenue: number;   // sum of bill totals (before returns)
  refunds: number;        // total refunded within the range
  revenue: number;        // grossRevenue − refunds  ← use this as "revenue/earnings"
  grossProfit: number;
  profitCut: number;      // P&L hit from returns (refund − recovered cost)
  profit: number;         // grossProfit − profitCut  ← use this as "profit"
  // Counts
  billCount: number;           // bills created in range (gross transaction count)
  fullyReturnedCount: number;  // of those, how many are now fully refunded
  netBillCount: number;        // billCount − fullyReturnedCount (effective sales)
  returnCount: number;
  itemsSold: number;      // net units sold (returns subtracted)
  returnedUnits: number;
  // Breakdowns
  topItems: { name: string; qty: number; revenue: number }[]; // net, qty-desc
  paymentSplit: { cash: number; upi: number; credit: number }; // net of refunds
}

type CostOf = (productId: string) => number;

// Compute netted sales metrics for bills/returns whose timestamp is in [from, to].
export function computeSalesStats(params: {
  bills: Bill[];
  returns: BillReturn[];
  from: number;
  to: number;
  costOf: CostOf;
}): SalesStats {
  const { bills, returns, from, to, costOf } = params;
  const inRange = (ts: number) => ts >= from && ts <= to;

  const periodBills = bills.filter(b => inRange(b.createdAt));
  const periodReturns = returns.filter(r => inRange(r.createdAt));
  const billById = new Map(bills.map(b => [b.id, b]));

  let grossRevenue = 0, grossProfit = 0, soldUnits = 0;
  const itemMap: Record<string, { qty: number; revenue: number }> = {};
  const paymentSplit = { cash: 0, upi: 0, credit: 0 };

  for (const b of periodBills) {
    grossRevenue += b.total;
    grossProfit += b.profit;
    if (paymentSplit[b.paymentMode] !== undefined) paymentSplit[b.paymentMode] += b.total;
    for (const i of b.items) {
      soldUnits += i.quantity;
      const m = (itemMap[i.productName] ||= { qty: 0, revenue: 0 });
      m.qty += i.quantity;
      m.revenue += i.sellingPrice * i.quantity;
    }
  }

  let refunds = 0, profitCut = 0, returnedUnits = 0;
  for (const r of periodReturns) {
    refunds += r.refundAmount;
    const costReturned = r.items.reduce((s, it) => s + it.quantity * (it.costPrice ?? costOf(it.productId)), 0);
    profitCut += r.refundAmount - costReturned;
    // Attribute the refund back to the original bill's payment mode.
    const mode = billById.get(r.billId)?.paymentMode;
    if (mode && paymentSplit[mode] !== undefined) paymentSplit[mode] -= r.refundAmount;
    for (const it of r.items) {
      returnedUnits += it.quantity;
      const m = itemMap[it.productName];
      if (m) { m.qty -= it.quantity; m.revenue -= it.sellingPrice * it.quantity; }
    }
  }

  const topItems = Object.entries(itemMap)
    .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
    .filter(x => x.qty > 0)
    .sort((a, b) => b.qty - a.qty);

  // Of the bills created in range, how many are now fully refunded (lifetime
  // refunds ≥ bill total) — these aren't "real" completed sales.
  const refundByBill: Record<string, number> = {};
  for (const r of returns) refundByBill[r.billId] = (refundByBill[r.billId] || 0) + r.refundAmount;
  let fullyReturnedCount = 0;
  for (const b of periodBills) if ((refundByBill[b.id] || 0) >= b.total - 0.01) fullyReturnedCount++;

  return {
    grossRevenue,
    refunds,
    revenue: grossRevenue - refunds,
    grossProfit,
    profitCut,
    profit: grossProfit - profitCut,
    billCount: periodBills.length,
    fullyReturnedCount,
    netBillCount: periodBills.length - fullyReturnedCount,
    returnCount: periodReturns.length,
    itemsSold: soldUnits - returnedUnits,
    returnedUnits,
    topItems,
    paymentSplit,
  };
}

// Aggregate the P&L impact of an arbitrary set of returns (e.g. for a filtered
// list of bills in Bill History, where the range model doesn't apply).
export function aggregateReturns(rets: BillReturn[], costOf: CostOf): {
  refunds: number; profitCut: number; units: number; count: number;
} {
  let refunds = 0, profitCut = 0, units = 0;
  for (const r of rets) {
    refunds += r.refundAmount;
    const cost = r.items.reduce((s, it) => s + it.quantity * (it.costPrice ?? costOf(it.productId)), 0);
    profitCut += r.refundAmount - cost;
    units += r.items.reduce((a, it) => a + it.quantity, 0);
  }
  return { refunds, profitCut, units, count: rets.length };
}

// GST to reverse for returns in [from, to], grouped by slab rate. sellingPrice is
// GST-inclusive, so taxable = gross / (1 + rate/100) and tax = gross − taxable.
// rateOf supplies each product's GST rate (%).
export function returnGstImpact(
  returns: BillReturn[],
  from: number,
  to: number,
  rateOf: (productId: string) => number,
): { totalTaxable: number; totalCgst: number; totalSgst: number; bySlab: Record<number, { taxableValue: number; cgst: number; sgst: number }> } {
  const bySlab: Record<number, { taxableValue: number; cgst: number; sgst: number }> = {};
  let totalTaxable = 0, totalCgst = 0, totalSgst = 0;
  for (const r of returns) {
    if (r.createdAt < from || r.createdAt > to) continue;
    for (const it of r.items) {
      const rate = rateOf(it.productId);
      if (!rate || rate <= 0) continue;
      const gross = it.sellingPrice * it.quantity;
      const taxable = gross / (1 + rate / 100);
      const gst = gross - taxable;
      const cgst = gst / 2, sgst = gst / 2;
      if (!bySlab[rate]) bySlab[rate] = { taxableValue: 0, cgst: 0, sgst: 0 };
      bySlab[rate].taxableValue += taxable;
      bySlab[rate].cgst += cgst;
      bySlab[rate].sgst += sgst;
      totalTaxable += taxable; totalCgst += cgst; totalSgst += sgst;
    }
  }
  return { totalTaxable, totalCgst, totalSgst, bySlab };
}

// Convenience: live cost lookup from the product list (fallback for old returns).
export const makeCostOf = (products: { id: string; costPrice: number }[]): CostOf => {
  const map = new Map(products.map(p => [p.id, p.costPrice]));
  return (id: string) => map.get(id) ?? 0;
};
