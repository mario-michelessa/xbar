import * as SecureStore from 'expo-secure-store';
import { GeminiProvider } from './llm/gemini';
import { SoCLaaSProvider } from './llm/soclaas';
import type { Language } from './languages';
import type { LLMProvider } from './llm/types';

export type ProviderId = 'gemini' | 'soclaas';

export const PROVIDERS: { id: ProviderId; name: string; defaultModel: string; keyHint: string }[] = [
  { id: 'gemini', name: 'Gemini', defaultModel: 'gemini-3.5-flash-lite', keyHint: 'AIza…' },
  { id: 'soclaas', name: 'SoCLaaS', defaultModel: 'qwen3.5:9b', keyHint: 'sk-…' },
];

export const DEFAULT_PROVIDER: ProviderId = 'gemini';
const MAX_HISTORY = 8;

export type ProviderSettings = {
  apiKey: string;
  model: string;
  // Models the user has saved before, most recent first.
  modelHistory: string[];
};

// Which parts of each sentence card are visible.
export type Display = { text: boolean; transliteration: boolean; translation: boolean; note: boolean };

export const DEFAULT_DISPLAY: Display = { text: true, transliteration: true, translation: true, note: true };

/**
 * Display for a given language: transliteration only exists for some
 * languages, and at least one of text/transliteration/translation is shown.
 */
export function effectiveDisplay(d: Display, lang: Language): Display {
  const transliteration = d.transliteration && !!lang.transliteration;
  const text = d.text || (!transliteration && !d.translation);
  return { ...d, text, transliteration };
}

// What the Learn flashcards show first.
export type LearnFront = 'text' | 'textTranslit' | 'translation';

export type Settings = {
  provider: ProviderId;
  providers: Record<ProviderId, ProviderSettings>;
  display: Display;
  learnFront: LearnFront;
};

export function providerInfo(id: ProviderId) {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

export function defaultSettings(): Settings {
  const providers = {} as Record<ProviderId, ProviderSettings>;
  for (const p of PROVIDERS) providers[p.id] = { apiKey: '', model: p.defaultModel, modelHistory: [] };
  return { provider: DEFAULT_PROVIDER, providers, display: DEFAULT_DISPLAY, learnFront: 'text' };
}

export function createProvider(s: Settings): LLMProvider {
  const { apiKey, model } = s.providers[s.provider];
  return s.provider === 'gemini' ? new GeminiProvider(apiKey, model) : new SoCLaaSProvider(apiKey, model);
}

// SecureStore keys. The soclaas_* keys predate multi-provider support; kept so
// existing installs keep their key and model.
const K = {
  provider: 'llm_provider',
  key: (p: ProviderId) => `${p}_api_key`,
  model: (p: ProviderId) => `${p}_model`,
  history: (p: ProviderId) => `${p}_model_history`,
  display: 'display',
  learnFront: 'learn_front',
};

function parseHistory(json: string | null): string[] {
  try {
    const v = JSON.parse(json ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function loadSettings(): Promise<Settings> {
  const s = defaultSettings();
  const provider = await SecureStore.getItemAsync(K.provider);
  if (provider && PROVIDERS.some((p) => p.id === provider)) s.provider = provider as ProviderId;
  try {
    s.display = { ...DEFAULT_DISPLAY, ...JSON.parse((await SecureStore.getItemAsync(K.display)) ?? '{}') };
  } catch {
    // keep defaults
  }
  const front = await SecureStore.getItemAsync(K.learnFront);
  if (front === 'text' || front === 'textTranslit' || front === 'translation') s.learnFront = front;
  for (const p of PROVIDERS) {
    const [apiKey, model, history] = await Promise.all([
      SecureStore.getItemAsync(K.key(p.id)),
      SecureStore.getItemAsync(K.model(p.id)),
      SecureStore.getItemAsync(K.history(p.id)),
    ]);
    s.providers[p.id] = { apiKey: apiKey ?? '', model: model || p.defaultModel, modelHistory: parseHistory(history) };
  }
  return s;
}

/** Adds `model` to the front of the history (deduplicated, capped). */
export function withModelInHistory(history: string[], model: string): string[] {
  return [model, ...history.filter((m) => m !== model)].slice(0, MAX_HISTORY);
}

export async function saveSettings(s: Settings): Promise<void> {
  await SecureStore.setItemAsync(K.provider, s.provider);
  await SecureStore.setItemAsync(K.display, JSON.stringify(s.display));
  await SecureStore.setItemAsync(K.learnFront, s.learnFront);
  for (const p of PROVIDERS) {
    const ps = s.providers[p.id];
    if (ps.apiKey) await SecureStore.setItemAsync(K.key(p.id), ps.apiKey);
    else await SecureStore.deleteItemAsync(K.key(p.id));
    await SecureStore.setItemAsync(K.model(p.id), ps.model || p.defaultModel);
    await SecureStore.setItemAsync(K.history(p.id), JSON.stringify(ps.modelHistory));
  }
}
