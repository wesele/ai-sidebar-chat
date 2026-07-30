import type {
  AnalysisRequest,
  AnalysisResponse,
  FullDocumentRequest,
  FullDocumentResponse,
} from '../../shared/schemas';
import { fullAnalysisPrompt, unitAnalysisPrompt } from '../analysis-prompt';

export interface ProviderConfig {
  id: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  kind: 'openai' | 'gemini';
}

export class OpenAITransport {
  constructor(
    private readonly provider: ProviderConfig,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly disableThinking = false,
  ) {}

  async analyze(request: AnalysisRequest, signal?: AbortSignal, uiLanguage?: string): Promise<AnalysisResponse> {
    return this.post('/chat/completions', {
      model: this.provider.modelId,
      response_format: { type: 'json_object' },
      stream: false,
      messages: [{ role: 'user', content: unitAnalysisPrompt(request, uiLanguage) }],
      ...(this.disableThinking ? { thinking: { type: 'disabled' } } : {}),
    }, signal);
  }

  async full(request: FullDocumentRequest, signal?: AbortSignal, uiLanguage?: string): Promise<FullDocumentResponse> {
    return this.post('/chat/completions', {
      model: this.provider.modelId,
      response_format: { type: 'json_object' },
      stream: false,
      messages: [{ role: 'user', content: fullAnalysisPrompt(request, uiLanguage) }],
      ...(this.disableThinking ? { thinking: { type: 'disabled' } } : {}),
    }, signal);
  }

  private async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const response = await this.fetcher(`${this.provider.baseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.provider.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      throw Object.assign(new Error(`Provider ${response.status}`), { status: response.status });
    }
    const json = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = json.choices?.[0]?.message?.content ?? '';
    const cleanedContent = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(cleanedContent) as T;
  }
}
