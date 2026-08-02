import type {
  AnalysisRequest,
  AnalysisResponse,
  FullDocumentRequest,
  FullDocumentResponse,
} from './schemas';

export interface BatchPreviewItem {
  issueId: string;
  severity: 'improvement' | 'problem';
  original: string;
  replacement: string;
  reason: string;
}

export interface EditorViewState {
  editorId: string;
  revision: number;
  status: string;
  counts: Record<string, number>;
  /** Number of API calls that have completed so far in the current analysis batch */
  analysisDone?: number;
  /** Total number of API calls scheduled in the current analysis batch */
  analysisTotal?: number;
  currentSentence?: {
    issueId: string;
    original: string;
    replacement: string;
    reason: string;
  };
  currentParagraph?: {
    issueId: string;
    original: string;
    replacement: string;
    reason: string;
  };
  currentParagraphIssues?: Array<{
    issueId: string;
    original: string;
    replacement: string;
    reason: string;
  }>;
  batchPreviews?: Record<'local' | 'sentence' | 'paragraph', BatchPreviewItem[]>;
  fullResult?: {
    severity: string;
    summary: string;
    suggestions?: Array<{
      severity: 'improvement' | 'problem';
      title: string;
      reason: string;
    }>;
  };
  /** True while a full-document review request is in flight. */
  fullAnalysisPending?: boolean;
  noModel?: boolean;
  longText?: boolean;
  errorReason?: string;
}

export type TargetLanguage = 'EN' | 'ES' | 'CN';

export type SettingsPayload = {
  providerId: string;
  modelId: string;
  invocationStrategy: 'batch' | 'parallel';
  maxConcurrency: number;
  activationMode: 'always' | 'panel_open' | 'off';
  fullDocumentCharacterLimit: number;
  targetLanguage: TargetLanguage;
  /** Relative font scale and colors for replacement labels rendered above the editor text. */
  replacementFontScale?: number;
  replacementTextColor?: string;
  replacementBackgroundColor?: string;
  /** When true, sends thinking:disabled to OpenAI-compatible endpoints (mirrors AI Tools thinking toggle) */
  disableThinking?: boolean;
  /** When true, requests provider-side guided JSON decoding. */
  constrainedDecoding?: boolean;
};

export type ApplyResultPayload = {
  tabId: number;
  editorId: string;
  revision: number;
  scope: 'local' | 'sentence' | 'paragraph';
  applied: number;
  skipped: number;
  stale: boolean;
};

export type ExtensionMessage =
  | { v: 1; type: 'EDITOR_STATE_CHANGED'; correlationId: string; payload: EditorViewState }
  | { v: 1; type: 'SETTINGS_UPDATED'; correlationId: string; payload: SettingsPayload }
  | { v: 1; type: 'ANALYSIS_REQUESTED'; correlationId: string; payload: AnalysisRequest }
  | { v: 1; type: 'FULL_ANALYSIS_REQUESTED'; correlationId: string; payload: FullDocumentRequest }
  | { v: 1; type: 'CANCEL_ANALYSIS'; correlationId: string; payload: { requestId: string } }
  | { v: 1; type: 'ANALYSIS_COMPLETED'; correlationId: string; payload: AnalysisResponse | FullDocumentResponse }
  | { v: 1; type: 'ANALYSIS_FAILED'; correlationId: string; payload: { requestId: string; code: string; retryable: boolean } }
  | { v: 1; type: 'APPLY_ISSUE'; correlationId: string; payload: {
    tabId: number;
    editorId: string;
    revision: number;
    issueId: string;
  } }
  | { v: 1; type: 'APPLY_ALL'; correlationId: string; payload: {
    tabId: number;
    editorId: string;
    revision: number;
    scope: 'local' | 'sentence' | 'paragraph';
    expectedCount: number;
  } }
  | { v: 1; type: 'APPLY_RESULT'; correlationId: string; payload: ApplyResultPayload }
  | { v: 1; type: 'OPEN_SIDE_PANEL'; correlationId: string; payload: { tabId: number } }
  | { v: 1; type: 'PANEL_CONNECTION_CHANGED'; correlationId: string; payload: { open: boolean } }
  | { v: 1; type: 'RETRY_DETECTION'; correlationId: string; payload: { tabId?: number } }
  | { v: 1; type: 'REQUEST_FULL_ANALYSIS'; correlationId: string; payload: { tabId?: number } };

export type RuntimeMessage =
  | ExtensionMessage
  | { v: 1; type: 'WRITING_MODEL_STATUS_REQUEST'; correlationId: string; payload: Record<string, never> }
  | { v: 1; type: 'WRITING_MODEL_STATUS'; correlationId: string; payload: { available: boolean } }
  | { v: 1; type: 'PROVIDERS_REQUEST'; correlationId: string; payload: Record<string, never> }
  | { v: 1; type: 'PROVIDERS_PUBLIC'; correlationId: string; payload: { providers: Array<{ id: string; name: string; models: string[] }> } };

export function isExtensionMessage(value: unknown): value is RuntimeMessage {
  const message = value as Partial<RuntimeMessage>;
  if (!message || message.v !== 1 || typeof message.correlationId !== 'string' ||
    !message.payload || typeof message.payload !== 'object') return false;

  if (message.type === 'SETTINGS_UPDATED') {
    const settings = message.payload as Partial<SettingsPayload>;
    return typeof settings.providerId === 'string' && typeof settings.modelId === 'string' &&
      (settings.invocationStrategy === 'batch' || settings.invocationStrategy === 'parallel') &&
      Number.isInteger(settings.maxConcurrency) && (settings.maxConcurrency ?? 0) >= 1 &&
      (settings.maxConcurrency ?? 7) <= 6 &&
      (settings.activationMode === 'always' || settings.activationMode === 'panel_open' || settings.activationMode === 'off') &&
      Number.isInteger(settings.fullDocumentCharacterLimit) &&
      (settings.fullDocumentCharacterLimit ?? 0) > 0 &&
      (settings.targetLanguage === undefined || ['EN', 'ES', 'CN'].includes(settings.targetLanguage)) &&
      (settings.replacementFontScale === undefined || (typeof settings.replacementFontScale === 'number' && Number.isFinite(settings.replacementFontScale) && settings.replacementFontScale >= 0.25 && settings.replacementFontScale <= 2)) &&
      (settings.replacementTextColor === undefined || (typeof settings.replacementTextColor === 'string' && (settings.replacementTextColor === 'transparent' || /^#[0-9a-f]{6}$/i.test(settings.replacementTextColor)))) &&
      (settings.replacementBackgroundColor === undefined || (typeof settings.replacementBackgroundColor === 'string' && (settings.replacementBackgroundColor === 'transparent' || /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(settings.replacementBackgroundColor)))) &&
      (settings.disableThinking === undefined || typeof settings.disableThinking === 'boolean') &&
      (settings.constrainedDecoding === undefined || typeof settings.constrainedDecoding === 'boolean');
  }
  if (message.type === 'WRITING_MODEL_STATUS_REQUEST') return true;
  if (message.type === 'WRITING_MODEL_STATUS') {
    return typeof (message.payload as { available?: unknown }).available === 'boolean';
  }
  if (message.type === 'CANCEL_ANALYSIS') {
    return typeof (message.payload as { requestId?: unknown }).requestId === 'string';
  }
  if (message.type === 'FULL_ANALYSIS_REQUESTED') {
    return (message.payload as FullDocumentRequest).schemaVersion === '1' &&
      typeof (message.payload as FullDocumentRequest).text === 'string';
  }
  if (message.type === 'EDITOR_STATE_CHANGED') {
    return typeof (message.payload as EditorViewState).editorId === 'string';
  }
  if (message.type === 'ANALYSIS_REQUESTED') {
    return (message.payload as AnalysisRequest).schemaVersion === '1' &&
      Array.isArray((message.payload as AnalysisRequest).units);
  }
  if (message.type === 'ANALYSIS_COMPLETED') {
    return (message.payload as { schemaVersion?: string }).schemaVersion === '1';
  }
  if (message.type === 'ANALYSIS_FAILED') {
    return typeof (message.payload as { requestId?: unknown }).requestId === 'string';
  }
  if (message.type === 'APPLY_ISSUE') {
    const command = message.payload as {
      tabId?: unknown;
      editorId?: unknown;
      revision?: unknown;
      issueId?: unknown;
    };
    return Number.isInteger(command.tabId) && (command.tabId as number) >= 0 &&
      typeof command.editorId === 'string' && Number.isInteger(command.revision) &&
      (command.revision as number) >= 1 && typeof command.issueId === 'string';
  }
  if (message.type === 'APPLY_ALL') {
    const command = message.payload as {
      editorId?: unknown;
      tabId?: unknown;
      revision?: unknown;
      scope?: string;
      expectedCount?: unknown;
    };
    return Number.isInteger(command.tabId) && (command.tabId as number) >= 0 &&
      typeof command.editorId === 'string' && Number.isInteger(command.revision) &&
      (command.revision as number) >= 1 &&
      ['local', 'sentence', 'paragraph'].includes(command.scope ?? '') &&
      Number.isInteger(command.expectedCount) && (command.expectedCount as number) >= 0;
  }
  if (message.type === 'APPLY_RESULT') {
    const result = message.payload as Partial<ApplyResultPayload>;
    return Number.isInteger(result.tabId) && (result.tabId ?? -1) >= 0 &&
      typeof result.editorId === 'string' && Number.isInteger(result.revision) &&
      (result.revision ?? 0) >= 1 &&
      ['local', 'sentence', 'paragraph'].includes(result.scope ?? '') &&
      Number.isInteger(result.applied) && (result.applied ?? -1) >= 0 &&
      Number.isInteger(result.skipped) && (result.skipped ?? -1) >= 0 &&
      typeof result.stale === 'boolean';
  }
  if (message.type === 'OPEN_SIDE_PANEL') {
    return typeof (message.payload as { tabId?: unknown }).tabId === 'number';
  }
  if (message.type === 'RETRY_DETECTION' || message.type === 'REQUEST_FULL_ANALYSIS') return true;
  return message.type === 'PANEL_CONNECTION_CHANGED' &&
    typeof (message.payload as { open?: unknown }).open === 'boolean';
}
