export const PARTS_OF_SPEECH = ['verb', 'noun', 'adposition', 'adverb', 'adjective', 'grammar', 'other'] as const;
export type PartOfSpeech = (typeof PARTS_OF_SPEECH)[number];

export const POS_LABELS: Record<PartOfSpeech, string> = {
  verb: 'verb',
  noun: 'noun',
  adposition: 'prep./postp.',
  adverb: 'adverb',
  adjective: 'adjective',
  grammar: 'grammar',
  other: 'other',
};

export type GeneratedSentence = {
  text: string;
  translation: string;
  // Latin-script reading (pinyin, romanized Arabic/Tamil) for non-Latin scripts.
  transliteration?: string;
  note?: string;
  pos?: PartOfSpeech; // only asked for vocabulary lookups
};

export type LLMResponse = {
  explanation?: string;
  sentences: GeneratedSentence[];
  // Set when the model's output could not be parsed as the expected JSON.
  raw?: string;
};

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ChatRequest = { messages: ChatMessage[] };

// Swap implementations here (local model, SSH server, other API).
export interface LLMProvider {
  chat(request: ChatRequest): Promise<LLMResponse>;
  /** Minimal request used by the Settings "Test connection" button. */
  test(): Promise<string>;
}

export class LLMError extends Error {}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with a timeout; network failures become LLMError. */
export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    throw new LLMError(aborted ? 'Request timed out.' : 'Network error. Check your connection.');
  } finally {
    clearTimeout(timer);
  }
}

export function stripThinking(s: string): string {
  return s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}
