import type {
  AnalysisRequest,
  AnalysisResponse,
  FullDocumentRequest,
  FullDocumentResponse,
} from '../../shared/schemas';
import type { ProviderConfig } from './openai-transport';
import { fullAnalysisPrompt, unitAnalysisPrompt } from '../analysis-prompt';

export class GeminiTransport {
  constructor(
    private readonly provider: ProviderConfig,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  async analyze(request: AnalysisRequest, signal?: AbortSignal): Promise<AnalysisResponse> {
    return this.post(unitAnalysisPrompt(request), signal);
  }

  async full(request: FullDocumentRequest, signal?: AbortSignal): Promise<FullDocumentResponse> {
    return this.post(fullAnalysisPrompt(request), signal);
  }

  private async post<T>(payload: unknown, signal?: AbortSignal): Promise<T> {
    const url = `${this.provider.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(this.provider.modelId)}:generateContent?key=${encodeURIComponent(this.provider.apiKey)}`;
    const response = await this.fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: String(payload) }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
      signal,
    });
    if (!response.ok) {
      throw Object.assign(new Error(`Provider ${response.status}`), { status: response.status });
    }
    const json = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return JSON.parse(json.candidates?.[0]?.content?.parts?.[0]?.text ?? '') as T;
  }
}
