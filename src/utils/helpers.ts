import { Bill, BillItem } from '../types';

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function formatCurrency(amount: number, currency = '₹'): string {
  return `${currency}${amount.toFixed(2)}`;
}

export function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function startOfDay(date: Date = new Date()): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(date: Date = new Date()): number {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function startOfWeek(): number {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function startOfMonth(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function generateBillText(bill: Bill, shopName: string, currency = '₹'): string {
  const lines = [
    `🏪 ${shopName}`,
    `📅 ${formatDate(bill.createdAt)} ${formatTime(bill.createdAt)}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ...bill.items.map(
      i => `${i.productName} x${i.quantity}  ${currency}${(i.sellingPrice * i.quantity).toFixed(2)}`
    ),
    `━━━━━━━━━━━━━━━━━━━━`,
    bill.discount > 0 ? `Subtotal: ${currency}${bill.subtotal.toFixed(2)}` : '',
    bill.discount > 0 ? `Discount: -${currency}${bill.discount.toFixed(2)}` : '',
    `*Total: ${currency}${bill.total.toFixed(2)}*`,
    `Payment: ${bill.paymentMode.toUpperCase()}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Thank you! 🙏`,
  ].filter(Boolean);

  return lines.join('\n');
}

export function parseVoiceOrder(text: string): { item: string; quantity: number }[] {
  const result: { item: string; quantity: number }[] = [];

  const numberWords: Record<string, number> = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'ek': 1, 'do': 2, 'teen': 3, 'char': 4, 'paanch': 5,
    'chhe': 6, 'saat': 7, 'aath': 8, 'nau': 9, 'das': 10,
    'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5,
  };

  // Patterns: "2 pens", "two notebooks", "pen 2"
  const patterns = [
    /(\d+)\s+([a-zA-Zऀ-ॿ઀-૿ಀ-೿]+(?:\s+[a-zA-Zऀ-ॿ઀-૿ಀ-೿]+)*)/gi,
    /([a-zA-Zऀ-ॿ઀-૿ಀ-೿]+(?:\s+[a-zA-Zऀ-ॿ઀-૿ಀ-೿]+)*)\s+(\d+)/gi,
  ];

  const cleaned = text.toLowerCase().trim();

  // Try number-word patterns
  for (const [word, num] of Object.entries(numberWords)) {
    const regex = new RegExp(`${word}\\s+([\\w\\s]+?)(?:,|and|और|ane|$)`, 'gi');
    let match;
    while ((match = regex.exec(cleaned)) !== null) {
      result.push({ item: match[1].trim(), quantity: num });
    }
  }

  // Try digit patterns
  const digitRegex = /(\d+)\s+([\w\sऀ-ॿ઀-૿ಀ-೿]+?)(?:,|and|और|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = digitRegex.exec(cleaned)) !== null) {
    const alreadyAdded = result.find(r => r.item === m![2].trim());
    if (!alreadyAdded) {
      result.push({ item: m[2].trim(), quantity: parseInt(m[1]) });
    }
  }

  return result.length > 0 ? result : [{ item: cleaned, quantity: 1 }];
}

export function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();
  return t.includes(q) || q.split(' ').every(w => t.includes(w));
}

export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase().trim();
  if (!q || !t) return 0;
  if (t === q) return 1;
  if (t.includes(q) || q.includes(t)) return 0.9;
  const qWords = q.split(/\s+/);
  const tWords = t.split(/\s+/);
  if (qWords.some(qw => tWords.some(tw => tw.includes(qw) || qw.includes(tw)))) return 0.7;
  const dist = levenshteinDistance(q, t);
  return 1 - dist / Math.max(q.length, t.length);
}

function levenshteinDistance(a: string, b: string): number {
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}
