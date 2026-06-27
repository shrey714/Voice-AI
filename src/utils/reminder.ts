import { AppSettings, Customer, ReminderLang, ReminderTone } from '../types';
import { formatCurrency } from './helpers';

// Preset templates by language + tone. Placeholders: {name} {shop} {amount}.
const PRESETS: Record<ReminderLang, Record<ReminderTone, string>> = {
  hi: {
    polite: 'नमस्ते {name} जी 🙏\n\n{shop} से आपका {amount} बकाया है। कृपया सुविधानुसार भुगतान कर दें।\n\nधन्यवाद 🙏',
    firm: 'नमस्ते {name} जी,\n\n{shop} से आपका {amount} बकाया है। कृपया जल्द से जल्द भुगतान करें।\n\nधन्यवाद',
  },
  en: {
    polite: 'Hello {name},\n\nA gentle reminder that {amount} is pending at {shop}. Please pay whenever convenient.\n\nThank you!',
    firm: 'Hello {name},\n\nAmount {amount} is pending at {shop}. Kindly clear it at the earliest.\n\nThanks.',
  },
  hinglish: {
    polite: 'Namaste {name} ji 🙏\n\n{shop} se aapka {amount} baaki hai. Jab time mile please pay kar dijiye.\n\nDhanyavaad 🙏',
    firm: 'Namaste {name} ji,\n\n{shop} se aapka {amount} baaki hai. Please jaldi payment kar dijiye.\n\nThanks.',
  },
};

const UPI_LINE: Record<ReminderLang, string> = {
  hi: '\n\nUPI से भुगतान करें: {upi}',
  en: '\n\nPay via UPI: {upi}',
  hinglish: '\n\nUPI se pay karein: {upi}',
};

function fill(tpl: string, vars: { name: string; shop: string; amount: string; upi: string }): string {
  return tpl
    .replace(/\{name\}/g, vars.name)
    .replace(/\{shop\}/g, vars.shop)
    .replace(/\{amount\}/g, vars.amount)
    .replace(/\{upi\}/g, vars.upi);
}

// Build the reminder text for a customer's outstanding balance.
export function buildReminderMessage(
  opts: { name: string; balance: number; settings: AppSettings }
): string {
  const { name, balance, settings } = opts;
  const lang = settings.reminderLang || 'hinglish';
  const tone = settings.reminderTone || 'polite';
  const amount = formatCurrency(balance, settings.currency);
  const shop = settings.shopName || 'our shop';
  const upi = settings.upiId || '';

  let body = settings.reminderTemplate?.trim() ? settings.reminderTemplate : PRESETS[lang][tone];
  if (settings.reminderIncludeUpi && upi) body += UPI_LINE[lang];

  return fill(body, { name, shop, amount, upi });
}

// ── Supplier reorder message ────────────────────────────────────────────────
type ReorderItem = { name: string; qty: number; unit?: string };

const REORDER_HEADER: Record<ReminderLang, (shop: string) => string> = {
  hi: (shop) => `नमस्ते 🙏\n\n${shop} के लिए कृपया ये सामान भेज दें:`,
  en: (shop) => `Hello,\n\nPlease send the following stock for ${shop}:`,
  hinglish: (shop) => `Namaste 🙏\n\n${shop} ke liye ye items bhej dijiye:`,
};
const REORDER_FOOTER: Record<ReminderLang, string> = {
  hi: '\n\nधन्यवाद 🙏',
  en: '\n\nThank you!',
  hinglish: '\n\nDhanyavaad 🙏',
};

// Build a supplier reorder list message. Uses the custom template when set
// (placeholders {shop} {supplier} {items}), otherwise the language preset.
export function buildReorderMessage(opts: {
  shop: string; items: ReorderItem[]; lang: ReminderLang; template?: string; supplier?: string;
}): string {
  const { shop, items, lang, template, supplier } = opts;
  const lines = items.map((it) => `• ${it.name} — ${it.qty}${it.unit ? ' ' + it.unit : ''}`).join('\n');
  if (template?.trim()) {
    return template
      .replace(/\{shop\}/g, shop)
      .replace(/\{supplier\}/g, supplier || '')
      .replace(/\{items\}/g, lines);
  }
  return `${REORDER_HEADER[lang](shop)}\n\n${lines}${REORDER_FOOTER[lang]}`;
}

// Normalize an Indian phone number to wa.me form (country code 91, digits only).
// Returns '' when there aren't enough digits to dial.
export function normalizePhone(raw?: string): string {
  let d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length === 10) d = '91' + d;          // bare 10-digit → prefix 91
  else if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  // 12 digits starting 91, or other already-prefixed forms, are left as-is
  return d.length >= 11 ? d : '';
}

// wa.me link (works whether or not WhatsApp app scheme is registered).
export function whatsappUrl(phone: string | undefined, message: string): string {
  const p = normalizePhone(phone);
  const text = encodeURIComponent(message);
  return p ? `https://wa.me/${p}?text=${text}` : `https://wa.me/?text=${text}`;
}

// "just now" / "2d ago" style relative label for lastRemindedAt.
export function remindedAgo(ts?: number): string | null {
  if (!ts) return null;
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
