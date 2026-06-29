import {
  formatCurrency,
  startOfDay,
  endOfDay,
  fuzzyMatch,
  fuzzyScore,
  parseVoiceOrder,
  generateBillText,
} from '../utils/helpers';
import type { Bill } from '../types';

// ── formatCurrency ────────────────────────────────────────────────────────────

describe('formatCurrency', () => {
  test('rounds to zero decimal places', () => {
    expect(formatCurrency(100)).toBe('₹100');
    expect(formatCurrency(99.9)).toBe('₹100');
    expect(formatCurrency(99.4)).toBe('₹99');
  });

  test('uses default ₹ symbol', () => {
    expect(formatCurrency(0)).toBe('₹0');
  });

  test('uses custom currency symbol', () => {
    expect(formatCurrency(250, '$')).toBe('$250');
  });

  test('handles zero', () => {
    expect(formatCurrency(0)).toBe('₹0');
  });

  test('handles large amounts', () => {
    expect(formatCurrency(100000)).toBe('₹100000');
  });

  test('handles negative amounts', () => {
    expect(formatCurrency(-50)).toBe('₹-50');
  });
});

// ── startOfDay / endOfDay ─────────────────────────────────────────────────────

describe('startOfDay', () => {
  test('returns midnight (00:00:00.000) of given date', () => {
    const d = new Date(2024, 5, 15, 14, 30, 45);
    const start = startOfDay(d);
    const result = new Date(start);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
    expect(result.getDate()).toBe(15);
  });

  test('does not mutate the passed date', () => {
    const d = new Date(2024, 5, 15, 14, 30);
    const original = d.getTime();
    startOfDay(d);
    expect(d.getTime()).toBe(original);
  });
});

describe('endOfDay', () => {
  test('returns 23:59:59.999 of given date', () => {
    const d = new Date(2024, 5, 15, 8, 0, 0);
    const end = endOfDay(d);
    const result = new Date(end);
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
    expect(result.getSeconds()).toBe(59);
    expect(result.getMilliseconds()).toBe(999);
    expect(result.getDate()).toBe(15);
  });

  test('startOfDay is always before endOfDay for same date', () => {
    const d = new Date(2024, 5, 15);
    expect(startOfDay(d)).toBeLessThan(endOfDay(d));
  });
});

// ── fuzzyMatch ────────────────────────────────────────────────────────────────

describe('fuzzyMatch', () => {
  test('exact match', () => expect(fuzzyMatch('rice', 'rice')).toBe(true));
  test('substring match', () => expect(fuzzyMatch('ric', 'basmati rice')).toBe(true));
  test('multi-word all present', () => expect(fuzzyMatch('basmati rice', 'basmati rice 5kg')).toBe(true));
  test('no match', () => expect(fuzzyMatch('sugar', 'rice')).toBe(false));
  test('case insensitive', () => expect(fuzzyMatch('RICE', 'basmati rice')).toBe(true));
});

// ── fuzzyScore ────────────────────────────────────────────────────────────────

describe('fuzzyScore', () => {
  test('exact match returns 1', () => expect(fuzzyScore('rice', 'rice')).toBe(1));
  test('substring returns 0.9', () => expect(fuzzyScore('ric', 'rice')).toBe(0.9));
  test('no match returns low score', () => expect(fuzzyScore('xyz', 'rice')).toBeLessThan(0.5));
  test('empty query returns 0', () => expect(fuzzyScore('', 'rice')).toBe(0));
  test('empty target returns 0', () => expect(fuzzyScore('rice', '')).toBe(0));
  test('word overlap returns 0.7', () => expect(fuzzyScore('basmati', 'basmati rice')).toBeGreaterThanOrEqual(0.7));
  test('score is higher for closer match', () => {
    expect(fuzzyScore('rice', 'rice bag')).toBeGreaterThan(fuzzyScore('rice', 'sugar'));
  });
});

// ── parseVoiceOrder ───────────────────────────────────────────────────────────

describe('parseVoiceOrder', () => {
  test('digit before item: "2 pens"', () => {
    const r = parseVoiceOrder('2 pens');
    expect(r).toContainEqual(expect.objectContaining({ item: 'pens', quantity: 2 }));
  });

  test('word number: "two notebooks"', () => {
    const r = parseVoiceOrder('two notebooks');
    expect(r).toContainEqual(expect.objectContaining({ quantity: 2 }));
  });

  test('Hindi number word: "do chai"', () => {
    const r = parseVoiceOrder('do chai');
    expect(r).toContainEqual(expect.objectContaining({ quantity: 2 }));
  });

  test('unrecognised input → single item qty 1', () => {
    const r = parseVoiceOrder('something random');
    expect(r).toHaveLength(1);
    expect(r[0].quantity).toBe(1);
  });

  test('multiple items', () => {
    const r = parseVoiceOrder('2 pens and 3 notebooks');
    const qtys = r.map(x => x.quantity);
    expect(qtys).toContain(2);
    expect(qtys).toContain(3);
  });
});

// ── generateBillText ──────────────────────────────────────────────────────────

describe('generateBillText', () => {
  const mockBill: Bill = {
    id: 'b1',
    createdAt: new Date(2024, 0, 15, 10, 30).getTime(),
    total: 150,
    subtotal: 160,
    discount: 10,
    profit: 40,
    paymentMode: 'cash',
    customerName: 'Ravi',
    customerPhone: '',
    items: [
      { productId: 'p1', productName: 'Rice', quantity: 2, sellingPrice: 60, costPrice: 40 },
      { productId: 'p2', productName: 'Sugar', quantity: 1, sellingPrice: 40, costPrice: 25 },
    ],
  } as Bill;

  test('includes shop name', () => {
    expect(generateBillText(mockBill, 'My Shop')).toContain('My Shop');
  });

  test('includes all product names', () => {
    const text = generateBillText(mockBill, 'Shop');
    expect(text).toContain('Rice');
    expect(text).toContain('Sugar');
  });

  test('includes total', () => {
    expect(generateBillText(mockBill, 'Shop')).toContain('150');
  });

  test('shows discount line when discount > 0', () => {
    expect(generateBillText(mockBill, 'Shop')).toContain('Discount');
  });

  test('no discount line when discount is 0', () => {
    const bill = { ...mockBill, discount: 0 };
    expect(generateBillText(bill, 'Shop')).not.toContain('Discount');
  });

  test('payment mode is uppercased', () => {
    expect(generateBillText(mockBill, 'Shop')).toContain('CASH');
  });
});
