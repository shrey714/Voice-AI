import { computeSalesStats, aggregateReturns, returnGstImpact, salesHeat, makeCostOf } from '../utils/stats';
import type { Bill, BillReturn } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

const T = 1_000_000; // arbitrary base timestamp inside the range
const RANGE = { from: T - 1, to: T + 1_000_000 };

function bill(overrides: Partial<Bill> & { id: string }): Bill {
  return {
    createdAt: T,
    total: 100,
    profit: 30,
    paymentMode: 'cash',
    items: [],
    customerName: '',
    customerPhone: '',
    discount: 0,
    ...overrides,
  } as Bill;
}

function ret(overrides: Partial<BillReturn> & { id: string; billId: string }): BillReturn {
  return {
    createdAt: T,
    refundAmount: 0,
    items: [],
    reason: '',
    ...overrides,
  } as BillReturn;
}

const noCost = () => 0;

// ── computeSalesStats ─────────────────────────────────────────────────────────

describe('computeSalesStats', () => {

  test('empty input returns all zeros', () => {
    const s = computeSalesStats({ bills: [], returns: [], ...RANGE, costOf: noCost });
    expect(s.revenue).toBe(0);
    expect(s.profit).toBe(0);
    expect(s.billCount).toBe(0);
    expect(s.itemsSold).toBe(0);
    expect(s.paymentSplit).toEqual({ cash: 0, upi: 0, credit: 0 });
  });

  test('single bill with no returns', () => {
    const b = bill({ id: 'b1', total: 500, profit: 150, paymentMode: 'upi' });
    const s = computeSalesStats({ bills: [b], returns: [], ...RANGE, costOf: noCost });
    expect(s.grossRevenue).toBe(500);
    expect(s.revenue).toBe(500);
    expect(s.refunds).toBe(0);
    expect(s.grossProfit).toBe(150);
    expect(s.profit).toBe(150);
    expect(s.billCount).toBe(1);
    expect(s.netBillCount).toBe(1);
    expect(s.paymentSplit.upi).toBe(500);
    expect(s.paymentSplit.cash).toBe(0);
  });

  test('partial return reduces revenue and payment split', () => {
    const b = bill({ id: 'b1', total: 200, profit: 60, paymentMode: 'cash',
      items: [{ productId: 'p1', productName: 'Rice', quantity: 4, sellingPrice: 50, costPrice: 35, gstRate: 0, taxableValue: 0 }] });
    const r = ret({ id: 'r1', billId: 'b1', refundAmount: 100,
      items: [{ productId: 'p1', productName: 'Rice', quantity: 2, sellingPrice: 50, costPrice: 35 }] });

    const s = computeSalesStats({ bills: [b], returns: [r], ...RANGE, costOf: noCost });
    expect(s.revenue).toBe(100);          // 200 - 100
    expect(s.refunds).toBe(100);
    expect(s.itemsSold).toBe(2);          // 4 sold - 2 returned
    expect(s.returnedUnits).toBe(2);
    expect(s.paymentSplit.cash).toBe(100); // 200 - 100 refund
    expect(s.netBillCount).toBe(1);       // partial return, bill is NOT fully returned
  });

  test('full return marks bill as fullyReturned', () => {
    const b = bill({ id: 'b1', total: 100, profit: 30, paymentMode: 'cash' });
    const r = ret({ id: 'r1', billId: 'b1', refundAmount: 100, items: [] });

    const s = computeSalesStats({ bills: [b], returns: [r], ...RANGE, costOf: noCost });
    expect(s.revenue).toBe(0);
    expect(s.fullyReturnedCount).toBe(1);
    expect(s.netBillCount).toBe(0);
  });

  test('bills outside range are excluded', () => {
    const inside  = bill({ id: 'b1', total: 100, profit: 20, createdAt: T });
    const outside = bill({ id: 'b2', total: 999, profit: 99, createdAt: T - 100 });
    const s = computeSalesStats({ bills: [inside, outside], returns: [], ...RANGE, costOf: noCost });
    expect(s.billCount).toBe(1);
    expect(s.grossRevenue).toBe(100);
  });

  test('returns outside range are excluded', () => {
    const b = bill({ id: 'b1', total: 200, profit: 60, paymentMode: 'cash' });
    const r = ret({ id: 'r1', billId: 'b1', refundAmount: 100, items: [], createdAt: T - 100 });
    const s = computeSalesStats({ bills: [b], returns: [r], ...RANGE, costOf: noCost });
    expect(s.refunds).toBe(0);
    expect(s.revenue).toBe(200);
  });

  test('topItems sorted by qty descending, returned items excluded', () => {
    const b = bill({ id: 'b1', total: 300, profit: 90, items: [
      { productId: 'p1', productName: 'Rice',  quantity: 5, sellingPrice: 30, costPrice: 20, gstRate: 0, taxableValue: 0 },
      { productId: 'p2', productName: 'Sugar', quantity: 3, sellingPrice: 40, costPrice: 25, gstRate: 0, taxableValue: 0 },
    ]});
    const r = ret({ id: 'r1', billId: 'b1', refundAmount: 60, items: [
      { productId: 'p1', productName: 'Rice', quantity: 3, sellingPrice: 30, costPrice: 20 },
    ]});
    const s = computeSalesStats({ bills: [b], returns: [r], ...RANGE, costOf: noCost });
    // Rice: 5-3=2, Sugar: 3 → Sugar should be first
    expect(s.topItems[0].name).toBe('Sugar');
    expect(s.topItems[0].qty).toBe(3);
    expect(s.topItems[1].name).toBe('Rice');
    expect(s.topItems[1].qty).toBe(2);
  });

  test('topItems filters out items with zero or negative net qty', () => {
    const b = bill({ id: 'b1', total: 100, profit: 30, items: [
      { productId: 'p1', productName: 'Rice', quantity: 2, sellingPrice: 50, costPrice: 35, gstRate: 0, taxableValue: 0 },
    ]});
    const r = ret({ id: 'r1', billId: 'b1', refundAmount: 100, items: [
      { productId: 'p1', productName: 'Rice', quantity: 2, sellingPrice: 50, costPrice: 35, gstRate: 0 },
    ]});
    const s = computeSalesStats({ bills: [b], returns: [r], ...RANGE, costOf: noCost });
    expect(s.topItems).toHaveLength(0);
  });

  test('paymentSplit across cash / upi / credit', () => {
    const bills = [
      bill({ id: 'b1', total: 100, profit: 10, paymentMode: 'cash' }),
      bill({ id: 'b2', total: 200, profit: 20, paymentMode: 'upi' }),
      bill({ id: 'b3', total: 300, profit: 30, paymentMode: 'credit' }),
    ];
    const s = computeSalesStats({ bills, returns: [], ...RANGE, costOf: noCost });
    expect(s.paymentSplit).toEqual({ cash: 100, upi: 200, credit: 300 });
  });

  test('profit calculation uses costOf fallback when return item has no costPrice', () => {
    const b = bill({ id: 'b1', total: 200, profit: 80, paymentMode: 'cash' });
    const r = ret({ id: 'r1', billId: 'b1', refundAmount: 100,
      items: [{ productId: 'p1', productName: 'Rice', quantity: 1, sellingPrice: 100, costPrice: undefined as any }] });
    const costOf = (id: string) => id === 'p1' ? 60 : 0;
    const s = computeSalesStats({ bills: [b], returns: [r], ...RANGE, costOf });
    // profitCut = refundAmount(100) - costReturned(60) = 40
    expect(s.profitCut).toBeCloseTo(40);
    expect(s.profit).toBeCloseTo(80 - 40); // 40
  });

  test('multiple bills accumulate correctly', () => {
    const bills = [
      bill({ id: 'b1', total: 100, profit: 20 }),
      bill({ id: 'b2', total: 150, profit: 40 }),
      bill({ id: 'b3', total: 250, profit: 80 }),
    ];
    const s = computeSalesStats({ bills, returns: [], ...RANGE, costOf: noCost });
    expect(s.grossRevenue).toBe(500);
    expect(s.grossProfit).toBe(140);
    expect(s.billCount).toBe(3);
  });
});

// ── aggregateReturns ──────────────────────────────────────────────────────────

describe('aggregateReturns', () => {

  test('empty returns', () => {
    const r = aggregateReturns([], noCost);
    expect(r).toEqual({ refunds: 0, profitCut: 0, units: 0, count: 0 });
  });

  test('single return with costPrice on item', () => {
    const r = ret({ id: 'r1', billId: 'b1', refundAmount: 100,
      items: [{ productId: 'p1', productName: 'Rice', quantity: 2, sellingPrice: 50, costPrice: 30 }] });
    const result = aggregateReturns([r], noCost);
    expect(result.refunds).toBe(100);
    expect(result.units).toBe(2);
    // profitCut = refund(100) - cost(2*30=60) = 40
    expect(result.profitCut).toBeCloseTo(40);
    expect(result.count).toBe(1);
  });

  test('multiple returns sum correctly', () => {
    const r1 = ret({ id: 'r1', billId: 'b1', refundAmount: 50, items: [
      { productId: 'p1', productName: 'Rice', quantity: 1, sellingPrice: 50, costPrice: 30 },
    ]});
    const r2 = ret({ id: 'r2', billId: 'b2', refundAmount: 80, items: [
      { productId: 'p2', productName: 'Sugar', quantity: 2, sellingPrice: 40, costPrice: 25 },
    ]});
    const result = aggregateReturns([r1, r2], noCost);
    expect(result.refunds).toBe(130);
    expect(result.units).toBe(3);
    expect(result.count).toBe(2);
  });
});

// ── returnGstImpact ───────────────────────────────────────────────────────────

describe('returnGstImpact', () => {

  test('no returns → all zero', () => {
    const r = returnGstImpact([], T, T + 1000, () => 0);
    expect(r.totalCgst).toBe(0);
    expect(r.totalSgst).toBe(0);
    expect(r.totalTaxable).toBe(0);
  });

  test('18% GST split into CGST + SGST correctly', () => {
    const r = ret({ id: 'r1', billId: 'b1', refundAmount: 118,
      items: [{ productId: 'p1', productName: 'Rice', quantity: 1, sellingPrice: 118, costPrice: 80, gstRate: 18 }] });
    const result = returnGstImpact([r], T, T + 1000, () => 18);
    // taxable = 118 / 1.18 ≈ 100, gst = 18, cgst = sgst = 9
    expect(result.totalTaxable).toBeCloseTo(100, 1);
    expect(result.totalCgst).toBeCloseTo(9, 1);
    expect(result.totalSgst).toBeCloseTo(9, 1);
    expect(result.bySlab[18]).toBeDefined();
  });

  test('items with zero GST rate are skipped', () => {
    const r = ret({ id: 'r1', billId: 'b1', refundAmount: 100,
      items: [{ productId: 'p1', productName: 'Rice', quantity: 1, sellingPrice: 100, costPrice: 70, gstRate: 0 }] });
    const result = returnGstImpact([r], T, T + 1000, () => 0);
    expect(result.totalCgst).toBe(0);
    expect(Object.keys(result.bySlab)).toHaveLength(0);
  });

  test('returns outside range are excluded', () => {
    const r = ret({ id: 'r1', billId: 'b1', refundAmount: 118, createdAt: T - 100,
      items: [{ productId: 'p1', productName: 'Rice', quantity: 1, sellingPrice: 118, costPrice: 80, gstRate: 18 }] });
    const result = returnGstImpact([r], T, T + 1000, () => 18);
    expect(result.totalCgst).toBe(0);
  });

  test('multiple slabs tracked separately in bySlab', () => {
    const r = ret({ id: 'r1', billId: 'b1', refundAmount: 230,
      items: [
        { productId: 'p1', productName: 'A', quantity: 1, sellingPrice: 118, costPrice: 80, gstRate: 18 },
        { productId: 'p2', productName: 'B', quantity: 1, sellingPrice: 112, costPrice: 80, gstRate: 12 },
      ]});
    const result = returnGstImpact([r], T, T + 1000, () => 0);
    expect(result.bySlab[18]).toBeDefined();
    expect(result.bySlab[12]).toBeDefined();
    expect(result.bySlab[18].cgst).toBeCloseTo(result.bySlab[18].sgst, 5);
  });
});

// ── salesHeat ────────────────────────────────────────────────────────────────

describe('salesHeat', () => {

  test('empty bills → zero grid', () => {
    const h = salesHeat([], T, T + 1000);
    expect(h.total).toBe(0);
    expect(h.billCount).toBe(0);
    expect(h.max).toBe(0);
    expect(h.grid).toHaveLength(7);
    expect(h.grid[0]).toHaveLength(24);
  });

  test('bill within range is counted', () => {
    const b = bill({ id: 'b1', total: 300, profit: 0, createdAt: T });
    const h = salesHeat([b], T - 1, T + 1);
    expect(h.total).toBe(300);
    expect(h.billCount).toBe(1);
  });

  test('bill outside range is excluded', () => {
    const b = bill({ id: 'b1', total: 300, profit: 0, createdAt: T - 100 });
    const h = salesHeat([b], T, T + 1000);
    expect(h.total).toBe(0);
    expect(h.billCount).toBe(0);
  });

  test('peakHour reflects hour with most revenue', () => {
    const morning = bill({ id: 'b1', total: 100, profit: 0, createdAt: new Date(2024, 0, 1, 9, 0).getTime() });
    const evening = bill({ id: 'b2', total: 500, profit: 0, createdAt: new Date(2024, 0, 1, 18, 0).getTime() });
    const from = new Date(2024, 0, 1, 0, 0).getTime();
    const to   = new Date(2024, 0, 1, 23, 59).getTime();
    const h = salesHeat([morning, evening], from, to);
    expect(h.peakHour).toBe(18);
  });
});

// ── makeCostOf ────────────────────────────────────────────────────────────────

describe('makeCostOf', () => {

  test('returns cost for known product', () => {
    const costOf = makeCostOf([{ id: 'p1', costPrice: 45 }]);
    expect(costOf('p1')).toBe(45);
  });

  test('returns 0 for unknown product', () => {
    const costOf = makeCostOf([{ id: 'p1', costPrice: 45 }]);
    expect(costOf('unknown')).toBe(0);
  });

  test('handles empty product list', () => {
    const costOf = makeCostOf([]);
    expect(costOf('p1')).toBe(0);
  });
});
