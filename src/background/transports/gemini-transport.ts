import type {
  AnalysisRequest,
  AnalysisResponse,
  FullDocumentRequest,
  FullDocumentResponse,
} from '../../shared/schemas';
import type { ProviderConfig } from './openai-transport';
import { normalizeAnalysisResponse } from './openai-transport';
import { fullAnalysisPrompt, unitAnalysisPrompt } from '../analysis-prompt';

// ── Gemini responseSchema definitions ───────────────────────────────────────

// Same shallow shape as the OpenAI tool: the model locates errors and copies
// verbatim spans; offsets/scope/severity are derived client-side because
// reasoning models miscount UTF-16 offsets.
const ANALYSIS_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    schemaVersion: { type: 'STRING' },
    requestId: { type: 'STRING' },
    documentRevision: { type: 'NUMBER' },
    issues: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          unitId: { type: 'STRING' },
          original: { type: 'STRING' },
          replacement: { type: 'STRING' },
          reason: { type: 'STRING' },
          category: {
            type: 'STRING',
            enum: ['spelling', 'grammar', 'word_choice', 'non_english', 'clarity', 'style', 'coherence', 'tone', 'other'],
          },
        },
        required: ['unitId', 'original', 'replacement', 'reason', 'category'],
      },
    },
  },
  required: ['schemaVersion', 'requestId', 'documentRevision', 'issues'],
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

const ANALYSIS_TOOL_NAME = 'report_writing_analysis';
const FULL_DOCUMENT_TOOL_NAME = 'report_full_document_analysis';

const ANALYSIS_TOOL = {
  name: ANALYSIS_TOOL_NAME,
  description: 'Return the validated writing-analysis result.',
  parameters: ANALYSIS_RESPONSE_SCHEMA,
} as const;

const FULL_DOCUMENT_TOOL = {
  name: FULL_DOCUMENT_TOOL_NAME,
  description: 'Return the validated full-document writing-analysis result.',
  parameters: FULL_DOCUMENT_RESPONSE_SCHEMA,
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
    const data = await this.post<unknown>(
      unitAnalysisPrompt(request, uiLanguage, this.constrainedDecoding),
      this.constrainedDecoding ? ANALYSIS_TOOL : undefined,
      signal,
      this.constrainedDecoding ? ANALYSIS_TOOL_NAME : undefined,
    );
    return normalizeAnalysisResponse(data, request);
  }

  async full(request: FullDocumentRequest, signal?: AbortSignal, uiLanguage?: string): Promise<FullDocumentResponse> {
    return this.post(
      fullAnalysisPrompt(request, uiLanguage, this.constrainedDecoding),
      this.constrainedDecoding ? FULL_DOCUMENT_TOOL : undefined,
      signal,
      this.constrainedDecoding ? FULL_DOCUMENT_TOOL_NAME : undefined,
    );
  }

  private async post<T>(payload: unknown, tool?: { name: string; description: string; parameters: unknown }, signal?: AbortSignal, toolName?: string): Promise<T> {
    const url = `${this.provider.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(this.provider.modelId)}:generateContent?key=${encodeURIComponent(this.provider.apiKey)}`;

    const requestBody = {
      contents: [{ role: 'user', parts: [{ text: String(payload) }] }],
      ...(tool
        ? {
          tools: [{ functionDeclarations: [tool] }],
          toolConfig: {
            functionCallingConfig: {
              mode: 'AUTO',
            },
          },
          generationConfig: { ...(this.disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
        }
        : {
          generationConfig: {
            responseMimeType: 'application/json',
            ...(this.disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        }),
    };

    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal,
      });
    } catch (cause) {
      const err = new Error(`Network error: ${(cause as Error).message ?? cause}`);
      (err as unknown as { code: string; cause: unknown }).code = 'NETWORK';
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

    let json: {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            functionCall?: { name?: string; args?: unknown };
            function_call?: { name?: string; args?: unknown };
          }>;
        };
      }>;
    };
    try {
      json = await response.json() as typeof json;
    } catch (cause) {
      const err = new Error(`Failed to decode API response body as JSON: ${(cause as Error).message ?? cause}`);
      (err as unknown as { code: string; cause: unknown }).code = 'RESPONSE_DECODE';
      (err as { cause: unknown }).cause = cause;
      throw err;
    }

    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const functionCallPart = toolName
      ? parts.find((part) => part.functionCall?.name === toolName || part.function_call?.name === toolName)
      : undefined;
    if (toolName && !functionCallPart) {
      const err = new Error(`Gemini returned no tool call: ${toolName}`);
      (err as unknown as { code: string }).code = 'TOOL_CALL_MISSING';
      throw err;
    }
    const functionCall = functionCallPart?.functionCall ?? functionCallPart?.function_call;
    const rawText = functionCall?.args === undefined
      ? parts.find((part) => typeof part.text === 'string')?.text ?? ''
      : typeof functionCall.args === 'string' ? functionCall.args : JSON.stringify(functionCall.args);
    if (!rawText) {
      const err = new Error('Gemini returned an empty response text');
      (err as unknown as { code: string }).code = 'EMPTY_RESPONSE';
      throw err;
    }

    try {
      return JSON.parse(rawText) as T;
    } catch (cause) {
      const err = new Error(`Failed to parse Gemini output as JSON: ${(cause as Error).message ?? cause}`);
      (err as unknown as { code: string; cause: unknown }).code = 'PARSE_ERROR';
      (err as { cause: unknown }).cause = cause;
      throw err;
    }
  }
}
