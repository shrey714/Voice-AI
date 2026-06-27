import { create } from 'zustand';
import type { ChatModelAdapter } from '@assistant-ui/react-native';
import { askAI, ChatMsg, AiWidget } from './askAi';

// Widgets (product/customer cards) keyed by the assistant message id they belong to.
// The chat bubble reads its widget reactively from here.
export const useAiWidgets = create<{
  widgets: Record<string, AiWidget>;
  setWidget: (id: string, w: AiWidget) => void;
  clear: () => void;
}>((set) => ({
  widgets: {},
  setWidget: (id, w) => set((s) => ({ widgets: { ...s.widgets, [id]: w } })),
  clear: () => set({ widgets: {} }),
}));

// The live runtime, captured by AiProvider so the header "New chat" button can reach it.
let _runtime: any = null;
export const setAiRuntime = (r: any) => { _runtime = r; };
export const startNewAiChat = () => {
  const r = _runtime;
  if (r?.switchToNewThread) r.switchToNewThread();
  else r?.threads?.switchToNewThread?.();
  useAiWidgets.getState().clear();
};

// Bridges assistant-ui's runtime to our grounded Groq/Gemini answer + data widgets.
// run() is an async generator → assistant-ui streams the text in as it arrives.
export const shopAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal, unstable_assistantMessageId }) {
    const textOf = (m: any) => (m.content || []).filter((p: any) => p?.type === 'text').map((p: any) => p.text).join(' ').trim();
    const arr = messages as any[];

    const lastUser = [...arr].reverse().find((m) => m.role === 'user');
    const question = lastUser ? textOf(lastUser) : '';
    const history: ChatMsg[] = arr
      .slice(0, -1)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role === 'assistant' ? 'ai' : 'user', text: textOf(m) }) as ChatMsg)
      .filter((m) => m.text);

    const res = await askAI(question, history);

    // Attach a data widget (cards) to this assistant message, if any.
    if (res.ok && res.widget && unstable_assistantMessageId) {
      useAiWidgets.getState().setWidget(unstable_assistantMessageId, res.widget);
    }

    const full = res.ok ? res.text : `⚠️ ${res.error}`;

    // Reveal whole words (ChatGPT-style). Each yielded text ends on a word boundary
    // so the UI can fade in complete words. Cadence scales with length so short
    // answers feel deliberate and long ones stay quick (never draggy).
    const tokens = full.split(/(\s+)/); // words + the whitespace between them
    const wordCount = tokens.filter((t) => t.trim()).length || 1;
    const delay = Math.min(55, Math.max(16, Math.round(900 / wordCount)));
    let acc = '';
    for (const tok of tokens) {
      if (abortSignal.aborted) return;
      acc += tok;
      if (!tok.trim()) continue; // attach whitespace instantly; only pause on words
      yield { content: [{ type: 'text', text: acc }] };
      await new Promise((r) => setTimeout(r, delay));
    }
    if (acc !== full) yield { content: [{ type: 'text', text: full }] };
  },
};
