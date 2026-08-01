import type {
  AnalysisRequest,
  AnalysisResponse,
  FullDocumentRequest,
  FullDocumentResponse,
  RawIssue,
} from '../../shared/schemas';
import { fullAnalysisPrompt, unitAnalysisPrompt } from '../analysis-prompt';

export interface ProviderConfig {
  id: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  kind: 'openai' | 'gemini';
}

// ── Structured tool schemas ──────────────────────────────────────────────────

// The unit-analysis tool deliberately keeps the requested shape shallow: the
// model only locates errors and copies verbatim text spans, while character
// offsets, scope and severity are derived by the client. Reasoning models
// reliably miscount UTF-16 offsets, so asking for them directly makes results
// unstable (see AGENTS.md / UI-test.md constraints).
const ANALYSIS_RESPONSE_SCHEMA = {
  name: 'analysis_response',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      schemaVersion: { type: 'string' },
      requestId: { type: 'string' },
      documentRevision: { type: 'number' },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            unitId: { type: 'string', description: 'The unitId of the unit this issue belongs to, copied from the request.' },
            original: { type: 'string', description: 'The exact substring copied character-for-character from the unit text.' },
            replacement: { type: 'string' },
            reason: { type: 'string' },
            category: {
              type: 'string',
              enum: ['spelling', 'grammar', 'word_choice', 'non_english', 'clarity', 'style', 'coherence', 'tone', 'other'],
            },
          },
          required: ['unitId', 'original', 'replacement', 'reason', 'category'],
          additionalProperties: false,
        },
      },
    },
    required: ['schemaVersion', 'requestId', 'documentRevision', 'issues'],
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

export const WRITING_REQUEST_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_TOKENS = 16_000;
const problemCategories = new Set(['spelling', 'grammar', 'non_english']);
const validCategories = new Set([
  'spelling', 'grammar', 'word_choice', 'non_english', 'clarity', 'style',
  'coherence', 'tone', 'other',
]);

/**
 * Reassembles the flat constrained/JSON shape returned by the model into the internal
 * AnalysisResponse. The model supplies only unitId + verbatim text spans;
 * scope/severity are inferred and offsets are located later by the response
 * validator (which relocates `original` in the unit text via findSpan).
 */
export function normalizeAnalysisResponse(data: unknown, request: AnalysisRequest): AnalysisResponse {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw codedError('INVALID_RESPONSE', 'Model response is not a JSON object');
  }
  const record = (data ?? {}) as {
    schemaVersion?: string;
    requestId?: string;
    documentRevision?: number;
    issues?: Array<{
      unitId?: unknown;
      original?: unknown;
      replacement?: unknown;
      reason?: unknown;
      category?: unknown;
    }>;
    units?: unknown;
  };
  if (
    record.schemaVersion !== '1' ||
    record.requestId !== request.requestId ||
    record.documentRevision !== request.documentRevision
  ) {
    throw codedError('INVALID_RESPONSE', 'Model response envelope does not match the analysis request');
  }
  // Keep accepting the original nested response shape from older providers;
  // the domain validator still checks every nested unit and issue.
  if (!Array.isArray(record.issues)) {
    if (!Array.isArray(record.units)) throw codedError('INVALID_RESPONSE', 'Model response has neither issues nor units');
    return data as AnalysisResponse;
  }
  const byUnit = new Map<string, RawIssue[]>();
  for (const raw of record.issues) {
    if (
      typeof raw.unitId !== 'string' ||
      typeof raw.original !== 'string' ||
      typeof raw.replacement !== 'string' ||
      typeof raw.reason !== 'string'
    ) continue;
    const category: RawIssue['category'] = typeof raw.category === 'string' && validCategories.has(raw.category)
      ? raw.category as RawIssue['category']
      : 'other';
    const issues = byUnit.get(raw.unitId) ?? [];
    issues.push({
      scope: 'local',
      severity: problemCategories.has(category) ? 'problem' : 'improvement',
      start: 0,
      end: 0,
      original: raw.original,
      replacement: raw.replacement,
      reason: raw.reason,
      category,
    });
    byUnit.set(raw.unitId, issues);
  }
  // A replacement that covers the whole unit is a sentence/paragraph rewrite.
  for (const unit of request.units) {
    const issues = byUnit.get(unit.unitId);
    if (!issues) continue;
    for (const issue of issues) {
      if (issue.original === unit.text) issue.scope = unit.unitType;
    }
  }
  return {
    schemaVersion: '1',
    requestId: record.requestId,
    documentRevision: record.documentRevision,
    units: [...byUnit.entries()].map(([unitId, issues]) => ({
      unitId,
      unitRevision: request.units.find((unit) => unit.unitId === unitId)?.unitRevision ?? 1,
      issues,
    })),
  };
}

export class OpenAITransport {
  constructor(
    private readonly provider: ProviderConfig,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly disableThinking = false,
    private readonly constrainedDecoding = false,
  ) {}

  async analyze(request: AnalysisRequest, signal?: AbortSignal, uiLanguage?: string): Promise<AnalysisResponse> {
    const data = await this.post<unknown>('/chat/completions', this.body(
      unitAnalysisPrompt(request, uiLanguage, this.constrainedDecoding),
      this.constrainedDecoding ? ANALYSIS_RESPONSE_SCHEMA : undefined,
    ), signal);
    return normalizeAnalysisResponse(data, request);
  }

  async full(request: FullDocumentRequest, signal?: AbortSignal, uiLanguage?: string): Promise<FullDocumentResponse> {
    return this.post('/chat/completions', this.body(
      fullAnalysisPrompt(request, uiLanguage, this.constrainedDecoding),
      this.constrainedDecoding ? FULL_DOCUMENT_RESPONSE_SCHEMA : undefined,
    ), signal);
  }

  private body(prompt: string, schema?: { schema: unknown }): Record<string, unknown> {
    const qwen = /qwen/i.test(this.provider.modelId);
    return {
      model: this.provider.modelId,
      stream: false,
      max_tokens: MAX_OUTPUT_TOKENS,
      // Keep JSON mode enabled for every Qwen combination. Without it, the
      // thinking path can spend the entire output budget on reasoning and
      // non-thinking responses are prone to drifting from the envelope.
      ...(qwen || this.constrainedDecoding || this.disableThinking
        ? { response_format: { type: 'json_object' } }
        : {}),
      ...(schema ? { guided_json: schema.schema } : {}),
      messages: [{ role: 'user', content: prompt }],
      // Qwen uses the chat-template switch. The old `thinking` field is not
      // understood by vLLM and leaves a thinking request running indefinitely.
      ...(qwen
        ? { chat_template_kwargs: { enable_thinking: !this.disableThinking } }
        : this.disableThinking ? { thinking: { type: 'disabled' } } : {}),
      ...(qwen
        ? this.disableThinking
          ? { temperature: 0.7, top_p: 0.8, top_k: 20 }
          : { temperature: 0.6, top_p: 0.95, top_k: 20 }
        : {}),
      ...(qwen
        ? { max_completion_tokens: MAX_OUTPUT_TOKENS }
        : {}),
    };
  }

  private async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const deadline = createDeadline(signal);
    try {
      const response = await this.fetcher(`${this.provider.baseUrl.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.provider.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: deadline.signal,
      });

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
        choices?: Array<{
          finish_reason?: string;
          message?: {
            content?: string;
            reasoning_content?: string;
            tool_calls?: Array<{ function?: { arguments?: string | Record<string, unknown> } }>;
          };
        }>;
      };
      try {
        json = await response.json() as typeof json;
      } catch (cause) {
        throw codedError('RESPONSE_DECODE', `Failed to decode API response body as JSON: ${(cause as Error).message ?? cause}`, cause);
      }

      const message = json.choices?.[0]?.message;
      const finishReason = json.choices?.[0]?.finish_reason;
      const toolArguments = message?.tool_calls?.[0]?.function?.arguments;
      const rawContent = toolArguments === undefined
        ? message?.content ?? ''
        : typeof toolArguments === 'string' ? toolArguments : JSON.stringify(toolArguments);
      const cleanedContent = extractJsonContent(rawContent);
      if (!cleanedContent) {
        if (message?.reasoning_content || finishReason === 'length') {
          throw codedError('MODEL_TRUNCATED', 'Model exhausted its output budget during reasoning before returning JSON');
        }
        throw codedError('EMPTY_RESPONSE', 'API returned an empty response content');
      }
      try {
        return JSON.parse(cleanedContent) as T;
      } catch (cause) {
        throw codedError('PARSE_ERROR', `Failed to parse model output as JSON: ${(cause as Error).message ?? cause}`, cause);
      }
    } catch (cause) {
      if (deadline.timedOut) throw codedError('TIMEOUT', `Model request exceeded ${WRITING_REQUEST_TIMEOUT_MS}ms`, cause);
      if (signal?.aborted) throw codedError('CANCELLED', 'Model request was cancelled', cause);
      if (isAbortError(cause)) throw codedError('NETWORK', `Network error: ${(cause as Error).message ?? cause}`, cause);
      throw cause;
    } finally {
      deadline.dispose();
    }
  }
}

function createDeadline(parent?: AbortSignal): {
  signal: AbortSignal;
  timedOut: boolean;
  dispose: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  if (parent?.aborted) onAbort();
  else parent?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, WRITING_REQUEST_TIMEOUT_MS);
  return {
    signal: controller.signal,
    get timedOut() { return timedOut; },
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onAbort);
    },
  };
}

function isAbortError(value: unknown): boolean {
  return value instanceof DOMException && value.name === 'AbortError' ||
    (typeof value === 'object' && value !== null && (value as { name?: unknown }).name === 'AbortError');
}

function codedError(code: string, message: string, cause?: unknown): Error & { code: string; cause?: unknown } {
  const error = new Error(message) as Error & { code: string; cause?: unknown };
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}

function extractJsonContent(raw: string): string {
  const normalized = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const afterThinking = normalized.lastIndexOf('</think>');
  const candidates = afterThinking >= 0
    ? [normalized.slice(afterThinking + '</think>'.length).trim(), normalized]
    : [normalized];
  for (const candidate of candidates) {
    try {
      JSON.parse(candidate);
      return candidate;
    } catch { /* try the object portion below */ }
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const object = candidate.slice(start, end + 1);
      try {
        JSON.parse(object);
        return object;
      } catch { /* let the caller report a parse error */ }
    }
  }
  return normalized;
}
