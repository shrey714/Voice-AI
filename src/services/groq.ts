const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

export function getGroqApiKey(): string {
  return process.env.EXPO_PUBLIC_GROQ_KEY || '';
}

export type GroqTranscribeResult = { ok: true; text: string } | { ok: false; error: string };

export async function transcribeWithGroq(
  audioUri: string,
  language: string
): Promise<GroqTranscribeResult> {
  const apiKey = getGroqApiKey();
  if (!apiKey) return { ok: false, error: 'EXPO_PUBLIC_GROQ_KEY not set in .env' };

  // Only hint language for en/hi — Whisper auto-detect handles code-switching better
  // for Kannada and Gujarati (explicit hint hurts mixed-script speech)
  const HINT_LANGS = new Set(['en', 'hi']);

  const formData = new FormData();
  formData.append('file', { uri: audioUri, name: 'recording.mp4', type: 'audio/mp4' } as any);
  formData.append('model', 'whisper-large-v3-turbo');
  if (HINT_LANGS.has(language)) formData.append('language', language);
  formData.append('response_format', 'text');

  try {
    const res = await fetch(GROQ_STT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 401) return { ok: false, error: 'Invalid Groq API key.' };
      if (res.status === 429) return { ok: false, error: 'Groq rate limit hit. Try again shortly.' };
      return { ok: false, error: `Groq STT error (${res.status}): ${body}` };
    }
    const text = (await res.text()).trim();
    if (!text) return { ok: false, error: 'Groq returned empty transcription.' };
    return { ok: true, text };
  } catch (e: any) {
    return { ok: false, error: `Network error: ${e.message}` };
  }
}
