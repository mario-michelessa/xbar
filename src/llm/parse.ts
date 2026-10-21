import { PARTS_OF_SPEECH, stripThinking, type GeneratedSentence, type LLMResponse, type PartOfSpeech } from './types';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function normalizePos(v: unknown): PartOfSpeech | undefined {
  const s = str(v)?.toLowerCase();
  if (!s) return undefined;
  if ((PARTS_OF_SPEECH as readonly string[]).includes(s)) return s as PartOfSpeech;
  if (/preposition|postposition|adposition/.test(s)) return 'adposition';
  if (/verb/.test(s) && !/adverb/.test(s)) return 'verb';
  if (/adverb/.test(s)) return 'adverb';
  if (/adjective/.test(s)) return 'adjective';
  if (/noun|pronoun/.test(s)) return 'noun';
  if (/particle|suffix|prefix|affix|case|marker|grammar|conjunction|morpheme/.test(s)) return 'grammar';
  return 'other';
}

function normalize(obj: unknown): LLMResponse | null {
  if (Array.isArray(obj)) obj = { sentences: obj };
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const list = Array.isArray(o.sentences) ? o.sentences : Array.isArray(o.examples) ? o.examples : [];
  const sentences: GeneratedSentence[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    const text = str(s.text) ?? str(s.sentence);
    if (!text) continue;
    sentences.push({
      text,
      translation: str(s.translation) ?? '',
      transliteration: str(s.transliteration) ?? str(s.romanization) ?? str(s.pinyin),
      note: str(s.note),
      pos: normalizePos(s.pos ?? s.partOfSpeech),
    });
  }
  const explanation = str(o.explanation);
  if (!explanation && sentences.length === 0) return null;
  return { explanation, sentences };
}

/** Parse model output into LLMResponse. Never throws; falls back to `raw`. */
export function parseLLMOutput(content: string): LLMResponse {
  const text = stripThinking(content); // reasoning models

  const candidates: string[] = [];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1]);
  candidates.push(text);
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));

  for (const c of candidates) {
    try {
      const parsed = normalize(JSON.parse(c.trim()));
      if (parsed) return parsed;
    } catch {
      // try next candidate
    }
  }
  return { sentences: [], raw: text || content };
}
