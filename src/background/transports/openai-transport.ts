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

// ── Structured Output schemas ────────────────────────────────────────────────

const ANALYSIS_RESPONSE_SCHEMA = {
  name: 'analysis_response',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      schemaVersion: { type: 'string' },
      requestId: { type: 'string' },
      documentRevision: { type: 'number' },
      units: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            unitId: { type: 'string' },
            unitRevision: { type: 'number' },
            issues: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  scope: { type: 'string', enum: ['local', 'sentence', 'paragraph'] },
                  severity: { type: 'string', enum: ['improvement', 'problem'] },
                  start: { type: 'number' },
                  end: { type: 'number' },
                  original: { type: 'string' },
                  replacement: { type: 'string' },
                  reason: { type: 'string' },
                  category: {
                    type: 'string',
                    enum: ['spelling', 'grammar', 'word_choice', 'non_english', 'clarity', 'style', 'coherence', 'tone', 'other'],
                  },
                },
                required: ['scope', 'severity', 'start', 'end', 'original', 'replacement', 'reason', 'category'],
                additionalProperties: false,
              },
            },
          },
          required: ['unitId', 'unitRevision', 'issues'],
          additionalProperties: false,
        },
      },
    },
    required: ['schemaVersion', 'requestId', 'documentRevision', 'units'],
    additionalProperties: false,
  },
} as const;

const FULL_DOCUMENT_RESPONSE_SCHEMA = {
  name: 'full_document_response',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      schemaVersion: { type: 'string' },
      requestId: { type: 'string' },
      documentRevision: { type: 'number' },
      severity: { type: 'string', enum: ['none', 'improvement', 'problem'] },
      summary: { type: 'string' },
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            severity: { type: 'string', enum: ['improvement', 'problem'] },
            title: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['severity', 'title', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['schemaVersion', 'requestId', 'documentRevision', 'severity', 'summary', 'suggestions'],
    additionalProperties: false,
  },
} as const;

// ── Transport ────────────────────────────────────────────────────────────────

export class OpenAITransport {
  constructor(
    private readonly provider: ProviderConfig,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly disableThinking = false,
    private readonly constrainedDecoding = false,
  ) {}

  async analyze(request: AnalysisRequest, signal?: AbortSignal, uiLanguage?: string): Promise<AnalysisResponse> {
    const responseFormat = this.constrainedDecoding
      ? { type: 'json_schema', json_schema: ANALYSIS_RESPONSE_SCHEMA }
      : { type: 'json_object' };
    return this.post('/chat/completions', {
      model: this.provider.modelId,
      response_format: responseFormat,
      stream: false,
      messages: [{ role: 'user', content: unitAnalysisPrompt(request, uiLanguage) }],
      ...(this.disableThinking ? { thinking: { type: 'disabled' } } : {}),
    }, signal);
  }

  async full(request: FullDocumentRequest, signal?: AbortSignal, uiLanguage?: string): Promise<FullDocumentResponse> {
    const responseFormat = this.constrainedDecoding
      ? { type: 'json_schema', json_schema: FULL_DOCUMENT_RESPONSE_SCHEMA }
      : { type: 'json_object' };
    return this.post('/chat/completions', {
      model: this.provider.modelId,
      response_format: responseFormat,
      stream: false,
      messages: [{ role: 'user', content: fullAnalysisPrompt(request, uiLanguage) }],
      ...(this.disableThinking ? { thinking: { type: 'disabled' } } : {}),
    }, signal);
  }

  private async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.provider.baseUrl.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.provider.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (cause) {
      // Network-level failure (DNS, connection refused, timeout, etc.)
      const err = new Error(`Network error: ${(cause as Error).message ?? cause}`);
      (err as NodeJS.ErrnoException & { code: string; cause: unknown }).code = 'NETWORK';
      (err as { cause: unknown }).cause = cause;
      throw err;
    }

    if (!response.ok) {
      let apiMessage = '';
      try {
        const errBody = await response.json() as { error?: { message?: string } };
        apiMessage = errBody?.error?.message ?? '';
      } catch { /* ignore */ }
      const err = Object.assign(
        new Error(`API error ${response.status}${apiMessage ? `: ${apiMessage}` : ''}`),
        { status: response.status, apiMessage },
      );
      throw err;
    }

    let json: { choices?: Array<{ message?: { content?: string } }> };
    try {
      json = await response.json() as typeof json;
    } catch (cause) {
      const err = new Error(`Failed to decode API response body as JSON: ${(cause as Error).message ?? cause}`);
      (err as { code: string; cause: unknown }).code = 'RESPONSE_DECODE';
      (err as { cause: unknown }).cause = cause;
      throw err;
    }

    const rawContent = json.choices?.[0]?.message?.content ?? '';
    // When constrained decoding is active the model returns clean JSON; still
    // strip accidental markdown fences for robustness.
    const cleanedContent = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    if (!cleanedContent) {
      const err = new Error('API returned an empty response content');
      (err as { code: string }).code = 'EMPTY_RESPONSE';
      throw err;
    }
    try {
      return JSON.parse(cleanedContent) as T;
    } catch (cause) {
      const err = new Error(`Failed to parse model output as JSON: ${(cause as Error).message ?? cause}`);
      (err as { code: string; cause: unknown }).code = 'PARSE_ERROR';
      (err as { cause: unknown }).cause = cause;
      throw err;
    }
  }
}
