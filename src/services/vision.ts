import * as FileSystem from 'expo-file-system/legacy';

export function getVisionApiKey(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_VISION_KEY || '';
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Stationery: ['pen', 'pencil', 'notebook', 'paper', 'stapler', 'eraser', 'ruler', 'marker', 'stationery', 'ink', 'scissors', 'tape', 'glue'],
  Books: ['book', 'textbook', 'novel', 'magazine', 'comic', 'publication'],
  Food: ['food', 'snack', 'drink', 'beverage', 'biscuit', 'chips', 'candy', 'chocolate', 'fruit', 'vegetable', 'bread', 'water'],
  Electronics: ['phone', 'charger', 'cable', 'electronic', 'battery', 'earphone', 'gadget', 'device', 'screen', 'keyboard', 'mouse'],
  Clothing: ['shirt', 'pant', 'dress', 'clothing', 'garment', 'fabric', 'shoe', 'sock', 'hat', 'cap'],
};

export type VisionResult =
  | { ok: true; name: string; category: string; labels: string[]; rawTexts: string[] }
  | { ok: false; error: string; status?: number };

export async function identifyProductFromImage(
  imageUri: string,
  apiKey: string
): Promise<VisionResult> {
  let base64: string;
  try {
    base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (e: any) {
    return { ok: false, error: `Could not read image file: ${e.message}` };
  }

  let response: Response;
  try {
    response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64 },
            features: [
              { type: 'LABEL_DETECTION', maxResults: 10 },
              { type: 'TEXT_DETECTION', maxResults: 5 },
            ],
          }],
        }),
      }
    );
  } catch (e: any) {
    return { ok: false, error: `Network error: ${e.message}. Check your internet connection.` };
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    return { ok: false, error: `Invalid response from Google Vision (HTTP ${response.status})`, status: response.status };
  }

  if (!response.ok) {
    const msg = data?.error?.message || `HTTP ${response.status}`;
    const status = response.status;
    if (status === 400) return { ok: false, error: `Bad request: ${msg}`, status };
    if (status === 403) return { ok: false, error: `API key invalid or Vision API not enabled.\n\nFix: console.cloud.google.com → Enable "Cloud Vision API".\n\nDetails: ${msg}`, status };
    if (status === 429) return { ok: false, error: `Quota exceeded. Free tier limit reached.`, status };
    return { ok: false, error: `Google Vision error: ${msg}`, status };
  }

  const responseError = data?.responses?.[0]?.error;
  if (responseError) {
    return { ok: false, error: `Vision API error: ${responseError.message}` };
  }

  const labels: string[] = (data.responses?.[0]?.labelAnnotations || []).map((l: any) => l.description.toLowerCase());
  const allTexts: string[] = (data.responses?.[0]?.textAnnotations || []).map((t: any) => t.description as string);
  const rawTexts = allTexts.slice(1).length > 0 ? allTexts.slice(1) : allTexts;
  const fullText = allTexts[0] || '';
  const firstLine = fullText.split('\n')[0]?.trim() || '';

  const name = (firstLine.length >= 3 && firstLine.length <= 60)
    ? firstLine
    : labels.length > 0
      ? labels[0].charAt(0).toUpperCase() + labels[0].slice(1)
      : '';

  let category = 'General';
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (labels.some(l => keywords.some(k => l.includes(k)))) {
      category = cat;
      break;
    }
  }

  return { ok: true, name, category, labels, rawTexts };
}
