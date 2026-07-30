import type {
  AnalysisRequest,
  AnalysisResponse,
  FullDocumentRequest,
  FullDocumentResponse,
} from '../../shared/schemas';
import type { ProviderConfig } from './openai-transport';
import { fullAnalysisPrompt, unitAnalysisPrompt } from '../analysis-prompt';

// ── Gemini responseSchema definitions ───────────────────────────────────────

const ANALYSIS_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    schemaVersion: { type: 'STRING' },
    requestId: { type: 'STRING' },
    documentRevision: { type: 'NUMBER' },
    units: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          unitId: { type: 'STRING' },
          unitRevision: { type: 'NUMBER' },
          issues: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                scope: { type: 'STRING', enum: ['local', 'sentence', 'paragraph'] },
                severity: { type: 'STRING', enum: ['improvement', 'problem'] },
                start: { type: 'NUMBER' },
                end: { type: 'NUMBER' },
                original: { type: 'STRING' },
                replacement: { type: 'STRING' },
                reason: { type: 'STRING' },
                category: {
                  type: 'STRING',
                  enum: ['spelling', 'grammar', 'word_choice', 'non_english', 'clarity', 'style', 'coherence', 'tone', 'other'],
                },
              },
              required: ['scope', 'severity', 'start', 'end', 'original', 'replacement', 'reason', 'category'],
            },
          },
        },
        required: ['unitId', 'unitRevision', 'issues'],
      },
    },
  },
  required: ['schemaVersion', 'requestId', 'documentRevision', 'units'],
} as const;

const FULL_DOCUMENT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    schemaVersion: { type: 'STRING' },
    requestId: { type: 'STRING' },
    documentRevision: { type: 'NUMBER' },
    severity: { type: 'STRING', enum: ['none', 'improvement', 'problem'] },
    summary: { type: 'STRING' },
    suggestions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          severity: { type: 'STRING', enum: ['improvement', 'problem'] },
          title: { type: 'STRING' },
          reason: { type: 'STRING' },
        },
        required: ['severity', 'title', 'reason'],
      },
    },
  },
  required: ['schemaVersion', 'requestId', 'documentRevision', 'severity', 'summary', 'suggestions'],
} as const;

// ── Transport ────────────────────────────────────────────────────────────────

export class GeminiTransport {
  constructor(
    private readonly provider: ProviderConfig,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly disableThinking = false,
    private readonly constrainedDecoding = false,
  ) {}

  async analyze(request: AnalysisRequest, signal?: AbortSignal, uiLanguage?: string): Promise<AnalysisResponse> {
    return this.post(
      unitAnalysisPrompt(request, uiLanguage),
      this.constrainedDecoding ? ANALYSIS_RESPONSE_SCHEMA : undefined,
      signal,
    );
  }

  async full(request: FullDocumentRequest, signal?: AbortSignal, uiLanguage?: string): Promise<FullDocumentResponse> {
    return this.post(
      fullAnalysisPrompt(request, uiLanguage),
      this.constrainedDecoding ? FULL_DOCUMENT_RESPONSE_SCHEMA : undefined,
      signal,
    );
  }

  private async post<T>(payload: unknown, responseSchema: unknown, signal?: AbortSignal): Promise<T> {
    const url = `${this.provider.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(this.provider.modelId)}:generateContent?key=${encodeURIComponent(this.provider.apiKey)}`;

    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: String(payload) }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            ...(responseSchema ? { responseSchema } : {}),
            ...(this.disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        }),
        signal,
      });
    } catch (cause) {
      const err = new Error(`Network error: ${(cause as Error).message ?? cause}`);
      (err as { code: string; cause: unknown }).code = 'NETWORK';
      (err as { cause: unknown }).cause = cause;
      throw err;
    }

    if (!response.ok) {
      let apiMessage = '';
      try {
        const errBody = await response.json() as { error?: { message?: string } };
        apiMessage = errBody?.error?.message ?? '';
      } catch { /* ignore */ }
      throw Object.assign(
        new Error(`API error ${response.status}${apiMessage ? `: ${apiMessage}` : ''}`),
        { status: response.status, apiMessage },
      );
    }

    let json: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    try {
      json = await response.json() as typeof json;
    } catch (cause) {
      const err = new Error(`Failed to decode API response body as JSON: ${(cause as Error).message ?? cause}`);
      (err as { code: string; cause: unknown }).code = 'RESPONSE_DECODE';
      (err as { cause: unknown }).cause = cause;
      throw err;
    }

    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!rawText) {
      const err = new Error('Gemini returned an empty response text');
      (err as { code: string }).code = 'EMPTY_RESPONSE';
      throw err;
    }

    try {
      return JSON.parse(rawText) as T;
    } catch (cause) {
      const err = new Error(`Failed to parse Gemini output as JSON: ${(cause as Error).message ?? cause}`);
      (err as { code: string; cause: unknown }).code = 'PARSE_ERROR';
      (err as { cause: unknown }).cause = cause;
      throw err;
    }
  }
}
