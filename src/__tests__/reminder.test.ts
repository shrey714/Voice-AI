import {
  normalizePhone,
  whatsappUrl,
  buildReminderMessage,
  buildReorderMessage,
  remindedAgo,
} from '../utils/reminder';
import type { AppSettings } from '../types';

// ── normalizePhone ────────────────────────────────────────────────────────────

describe('normalizePhone', () => {
  test('10-digit number gets 91 prefix', () => {
    expect(normalizePhone('9876543210')).toBe('919876543210');
  });

  test('already prefixed 12-digit number is left as-is', () => {
    expect(normalizePhone('919876543210')).toBe('919876543210');
  });

  test('leading zeros are stripped before prefixing', () => {
    expect(normalizePhone('09876543210')).toBe('919876543210');
  });

  test('non-digit characters are stripped', () => {
    expect(normalizePhone('+91 98765-43210')).toBe('919876543210');
  });

  test('empty string returns empty', () => {
    expect(normalizePhone('')).toBe('');
  });

  test('undefined returns empty', () => {
    expect(normalizePhone(undefined)).toBe('');
  });

  test('too-short number returns empty', () => {
    expect(normalizePhone('12345')).toBe('');
  });
});

// ── whatsappUrl ───────────────────────────────────────────────────────────────

describe('whatsappUrl', () => {
  test('valid phone produces wa.me link with number', () => {
    const url = whatsappUrl('9876543210', 'hello');
    expect(url).toMatch(/^https:\/\/wa\.me\/91/);
    expect(url).toContain('9876543210');
  });

  test('message is URL-encoded', () => {
    const url = whatsappUrl('9876543210', 'hi there & you');
    expect(url).toContain(encodeURIComponent('hi there & you'));
  });

  test('missing phone produces numberless wa.me link', () => {
    const url = whatsappUrl(undefined, 'hello');
    expect(url).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });

  test('invalid phone falls back to numberless link', () => {
    const url = whatsappUrl('123', 'hello');
    expect(url).not.toContain('wa.me/91');
    expect(url).toMatch(/wa\.me\/\?text=/);
  });
});

// ── buildReminderMessage ──────────────────────────────────────────────────────

const baseSettings: AppSettings = {
  shopName: 'Ravi Store',
  currency: '₹',
  reminderLang: 'en',
  reminderTone: 'polite',
  reminderIncludeUpi: false,
  upiId: 'ravi@upi',
} as AppSettings;

describe('buildReminderMessage', () => {
  test('contains customer name', () => {
    const msg = buildReminderMessage({ name: 'Suresh', balance: 500, settings: baseSettings });
    expect(msg).toContain('Suresh');
  });

  test('contains formatted amount', () => {
    const msg = buildReminderMessage({ name: 'Suresh', balance: 500, settings: baseSettings });
    expect(msg).toContain('₹500');
  });

  test('contains shop name', () => {
    const msg = buildReminderMessage({ name: 'Suresh', balance: 500, settings: baseSettings });
    expect(msg).toContain('Ravi Store');
  });

  test('hindi preset works', () => {
    const msg = buildReminderMessage({ name: 'सुरेश', balance: 200, settings: { ...baseSettings, reminderLang: 'hi' } });
    expect(msg).toContain('सुरेश');
    expect(msg).toContain('₹200');
  });

  test('hinglish preset works', () => {
    const msg = buildReminderMessage({ name: 'Ravi', balance: 300, settings: { ...baseSettings, reminderLang: 'hinglish' } });
    expect(msg).toContain('Ravi');
    expect(msg).toContain('₹300');
  });

  test('firm tone is used when set', () => {
    const polite = buildReminderMessage({ name: 'X', balance: 100, settings: { ...baseSettings, reminderTone: 'polite' } });
    const firm   = buildReminderMessage({ name: 'X', balance: 100, settings: { ...baseSettings, reminderTone: 'firm' } });
    expect(polite).not.toBe(firm);
  });

  test('UPI line appended when reminderIncludeUpi is true', () => {
    const msg = buildReminderMessage({ name: 'X', balance: 100, settings: { ...baseSettings, reminderIncludeUpi: true } });
    expect(msg).toContain('ravi@upi');
  });

  test('UPI line not appended when reminderIncludeUpi is false', () => {
    const msg = buildReminderMessage({ name: 'X', balance: 100, settings: { ...baseSettings, reminderIncludeUpi: false } });
    expect(msg).not.toContain('ravi@upi');
  });

  test('custom template overrides preset', () => {
    const msg = buildReminderMessage({
      name: 'Raju', balance: 100,
      settings: { ...baseSettings, reminderTemplate: 'Hi {name}, pay {amount} to {shop}.' },
    });
    expect(msg).toBe('Hi Raju, pay ₹100 to Ravi Store.');
  });

  test('missing shop name falls back to "our shop"', () => {
    const msg = buildReminderMessage({ name: 'X', balance: 50, settings: { ...baseSettings, shopName: '' } });
    expect(msg).toContain('our shop');
  });
});

// ── buildReorderMessage ───────────────────────────────────────────────────────

describe('buildReorderMessage', () => {
  const items = [
    { name: 'Rice', qty: 10, unit: 'kg' },
    { name: 'Sugar', qty: 5 },
  ];

  test('contains all item names', () => {
    const msg = buildReorderMessage({ shop: 'My Shop', items, lang: 'en' });
    expect(msg).toContain('Rice');
    expect(msg).toContain('Sugar');
  });

  test('contains quantities', () => {
    const msg = buildReorderMessage({ shop: 'My Shop', items, lang: 'en' });
    expect(msg).toContain('10');
    expect(msg).toContain('5');
  });

  test('includes unit when provided', () => {
    const msg = buildReorderMessage({ shop: 'My Shop', items, lang: 'en' });
    expect(msg).toContain('kg');
  });

  test('custom template fills placeholders', () => {
    const msg = buildReorderMessage({
      shop: 'My Shop', items, lang: 'en', supplier: 'Ramesh',
      template: 'Hi {supplier}, send to {shop}:\n{items}',
    });
    expect(msg).toContain('Ramesh');
    expect(msg).toContain('My Shop');
    expect(msg).toContain('Rice');
  });

  test('hindi lang uses hindi header', () => {
    const msg = buildReorderMessage({ shop: 'My Shop', items, lang: 'hi' });
    expect(msg).toContain('नमस्ते');
  });
});

// ── remindedAgo ───────────────────────────────────────────────────────────────

describe('remindedAgo', () => {
  const now = Date.now();

  test('null/undefined returns null', () => {
    expect(remindedAgo(undefined)).toBeNull();
    expect(remindedAgo(0)).toBeNull();
  });

  test('less than 1 minute → "just now"', () => {
    expect(remindedAgo(now - 30_000)).toBe('just now');
  });

  test('minutes ago', () => {
    expect(remindedAgo(now - 5 * 60_000)).toBe('5m ago');
  });

  test('hours ago', () => {
    expect(remindedAgo(now - 3 * 60 * 60_000)).toBe('3h ago');
  });

  test('days ago', () => {
    expect(remindedAgo(now - 2 * 24 * 60 * 60_000)).toBe('2d ago');
  });
});
