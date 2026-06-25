import * as FileSystem from 'expo-file-system/legacy';

const OPENAI_API_URL = 'https://api.openai.com/v1/audio/transcriptions';

export function getWhisperApiKey(): string {
  return process.env.EXPO_PUBLIC_OPENAI_KEY || '';
}

export type WhisperResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export async function transcribeAudio(
  audioUri: string,
  language: string
): Promise<WhisperResult> {
  const apiKey = getWhisperApiKey();
  if (!apiKey) {
    return { ok: false, error: 'EXPO_PUBLIC_OPENAI_KEY not set in .env' };
  }

  // Only hint language for en/hi; Whisper doesn't support kn/gu so let it auto-detect
  const HINT_LANGS = new Set(['en', 'hi']);

  let fileInfo: any;
  try {
    fileInfo = await FileSystem.getInfoAsync(audioUri);
  } catch (e: any) {
    return { ok: false, error: `Could not access audio file: ${e.message}` };
  }

  if (!fileInfo.exists) {
    return { ok: false, error: 'Audio file not found. Try recording again.' };
  }

  if ((fileInfo.size ?? 0) < 1000) {
    return { ok: false, error: `Audio file too small (${fileInfo.size ?? 0} bytes) — likely empty recording.` };
  }

  const formData = new FormData();
  formData.append('file', {
    uri: audioUri,
    name: 'recording.mp4',
    type: 'audio/mp4',    // mp4 is the widely-accepted MIME for m4a containers
  } as any);
  formData.append('model', 'whisper-1');
  if (HINT_LANGS.has(language)) formData.append('language', language);
  formData.append('response_format', 'text');

  let response: Response;
  try {
    response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });
  } catch (e: any) {
    return { ok: false, error: `Network error: ${e.message}` };
  }

  if (!response.ok) {
    let body = '';
    try { body = await response.text(); } catch {}
    let parsed: any = {};
    try { parsed = JSON.parse(body); } catch {}
    const detail = parsed?.error?.message || body || `HTTP ${response.status}`;
    return { ok: false, error: `Whisper API error (${response.status}): ${detail}` };
  }

  let text = '';
  try {
    text = (await response.text()).trim();
  } catch (e: any) {
    return { ok: false, error: `Could not read transcription response: ${e.message}` };
  }

  if (!text) {
    return { ok: false, error: 'Whisper returned empty transcription.' };
  }

  return { ok: true, text };
}
