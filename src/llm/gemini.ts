// Google Gemini API (generateContent, REST). Docs: https://ai.google.dev/api/generate-content
import { parseLLMOutput } from './parse';
import {
  fetchWithTimeout,
  LLMError,
  sleep,
  type ChatMessage,
  type ChatRequest,
  type LLMProvider,
  type LLMResponse,
} from './types';

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 60_000;

type Part = { text?: string; thought?: boolean };

function statusMessage(status: number, body: string): string {
  // Gemini error bodies are { error: { message } }.
  let detail = body.slice(0, 200);
  try {
    detail = JSON.parse(body)?.error?.message ?? detail;
  } catch {
    // keep raw body
  }
  if (status === 400 && /api key/i.test(detail)) return 'Invalid Gemini API key. Check Settings.';
  if (status === 403) return `Access denied (403): ${detail}`;
  if (status === 404) return `Model not found (404). Check the model name in Settings. ${detail}`;
  if (status === 429) return 'Rate or quota limit reached (429). Try again later.';
  if (status >= 500) return `Gemini temporary problem (${status}). Try again shortly.`;
  return `Request failed (${status}): ${detail}`;
}

export class GeminiProvider implements LLMProvider {
  constructor(private apiKey: string, private model: string) {}

  private async generate(messages: ChatMessage[], generationConfig: object): Promise<string> {
    if (!this.apiKey) throw new LLMError('No API key set. Open Settings to add your Gemini key.');

    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const body = {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      generationConfig,
    };
    const url = `${GEMINI_BASE_URL}/models/${encodeURIComponent(this.model)}:generateContent`;

    for (let attempt = 0; ; attempt++) {
      const res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
          body: JSON.stringify(body),
        },
        TIMEOUT_MS,
      );

      if (res.ok) {
        const json = await res.json().catch(() => null);
        const parts: Part[] | undefined = json?.candidates?.[0]?.content?.parts;
        const text = parts?.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
        if (!text) {
          const reason = json?.promptFeedback?.blockReason ?? json?.candidates?.[0]?.finishReason;
          throw new LLMError(reason ? `Gemini returned no text (${reason}).` : 'Unexpected response from Gemini.');
        }
        return text;
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt === 0) {
        await sleep(2000);
        continue;
      }
      throw new LLMError(statusMessage(res.status, await res.text().catch(() => '')));
    }
  }

  async chat(request: ChatRequest): Promise<LLMResponse> {
    const content = await this.generate(request.messages, {
      temperature: 0.7,
      responseMimeType: 'application/json',
    });
    return parseLLMOutput(content);
  }

  async test(): Promise<string> {
    const content = await this.generate([{ role: 'user', content: 'Reply with the single word: ok' }], {});
    return content.trim();
  }
}
