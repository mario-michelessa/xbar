import { parseLLMOutput } from './parse';
import {
  fetchWithTimeout,
  LLMError,
  sleep,
  stripThinking,
  type ChatRequest,
  type LLMProvider,
  type LLMResponse,
} from './types';

export const SOCLAAS_BASE_URL = 'https://soclaas-api.comp.nus.edu.sg/v1';
const TIMEOUT_MS = 90_000;

function statusMessage(status: number, body: string): string {
  if (status === 401) return 'Invalid API key (401). Check Settings.';
  if (status === 403) return 'Model unavailable or access denied (403). Check the model name in Settings.';
  if (status === 429) return 'Rate or quota limit reached (429). Try again later.';
  if (status >= 500) return `SoCLaaS temporary problem (${status}). Try again shortly.`;
  return `Request failed (${status}): ${body.slice(0, 200)}`;
}

export class SoCLaaSProvider implements LLMProvider {
  constructor(private apiKey: string, private model: string) {}

  private async post(body: object): Promise<string> {
    if (!this.apiKey) throw new LLMError('No API key set. Open Settings to add your SoCLaaS key.');

    for (let attempt = 0; ; attempt++) {
      const res = await fetchWithTimeout(
        `${SOCLAAS_BASE_URL}/chat/completions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify(body),
        },
        TIMEOUT_MS,
      );

      if (res.ok) {
        const json = await res.json().catch(() => null);
        const content = json?.choices?.[0]?.message?.content;
        if (typeof content !== 'string') throw new LLMError('Unexpected response from SoCLaaS.');
        return content;
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
    const content = await this.post({ model: this.model, messages: request.messages, temperature: 0.7 });
    return parseLLMOutput(content);
  }

  async test(): Promise<string> {
    const content = await this.post({
      model: this.model,
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      max_tokens: 20,
    });
    return stripThinking(content);
  }
}
