const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export function getGeminiApiKey(): string {
  return process.env.EXPO_PUBLIC_GEMINI_KEY || '';
}

export interface ExtractedItem {
  product_name: string;
  quantity?: number;
  unit?: string;
}

export interface ExtractionResult {
  intent: 'inventory_request' | 'general_chat';
  items: ExtractedItem[];
}

export type GeminiResult = { ok: true; data: ExtractionResult } | { ok: false; error: string };

const SYSTEM_PROMPT =
  'You are an inventory assistant for a small Indian shop. Extract product requests from the customer transcript. ' +
  'The customer may speak in English, Hindi (हिन्दी), Kannada (ಕನ್ನಡ), Gujarati (ગુજરાતી), or a mix (code-switching). ' +
  'ALWAYS output product_name in English regardless of the input language (e.g. "pen" not "पेन", "rice" not "चावल", "soap" not "ಸಾಬೂನು", "oil" not "તેલ"). ' +
  'Normalize product names to their singular base form (e.g. "pens" → "pen", "notebooks" → "notebook"). ' +
  'For non-transactional conversation (greetings, questions, etc.), set intent to "general_chat" with an empty items array.';

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['inventory_request', 'general_chat'],
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          product_name: { type: 'string' },
          quantity: { type: 'number' },
          unit: {
            type: 'string',
            enum: ['mg', 'g', 'kg', 'ml', 'L', 'pcs', 'pack', 'strip', 'dozen', 'box'],
          },
        },
        required: ['product_name'],
      },
    },
  },
  required: ['intent', 'items'],
};

export async function extractInventoryItems(transcript: string): Promise<GeminiResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return { ok: false, error: 'EXPO_PUBLIC_GEMINI_KEY not set in .env' };
  if (!transcript.trim()) return { ok: false, error: 'Empty transcript.' };

  const payload = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: `Customer said: "${transcript}"` }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  };

  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 400) return { ok: false, error: 'Invalid Gemini request.' };
      if (res.status === 429) return { ok: false, error: 'Gemini quota exceeded.' };
      return { ok: false, error: `Gemini API error (${res.status}): ${body}` };
    }
    const json = await res.json();
    const rawText: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return { ok: false, error: 'No content in Gemini response.' };
    const data: ExtractionResult = JSON.parse(rawText);
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: `Extraction error: ${e.message}` };
  }
}
