import { chromeRuntime } from '../shared/browser-runtime';
import { isExtensionMessage, type ExtensionMessage, type SettingsPayload } from '../shared/messages';
import { AnalysisScheduler } from './analysis-scheduler';
import { OpenAITransport } from './transports/openai-transport';
import { GeminiTransport } from './transports/gemini-transport';
import { RequestRegistry } from './request-registry';
import { shouldRouteToContent } from './message-router';
import { resolveWritingProvider } from './provider-registry';
import { publicProviders } from './provider-registry';

const runtime = chromeRuntime();
void runtime.sidePanel.setActionBehavior?.().catch(() => undefined);
const requests = new RequestRegistry();
let settings: SettingsPayload = { providerId: '', modelId: '', invocationStrategy: 'batch', maxConcurrency: 3, activationMode: 'always', fullDocumentCharacterLimit: 20000, targetLanguage: 'EN', disableThinking: false, constrainedDecoding: false };
let settingsUpdatedInThisLifetime = false;
const settingsReady = runtime.storage.get<SettingsPayload>('writingAssistantSettings').then((saved) => {
  if (
    !settingsUpdatedInThisLifetime &&
    saved &&
    isExtensionMessage({
      v: 1,
      type: 'SETTINGS_UPDATED',
      correlationId: 'storage-restore',
      payload: saved,
    })
  ) settings = saved;
}).catch(() => undefined);
const send = (tabId: number, message: ExtensionMessage) => runtime.tabs.send(tabId, message);

runtime.storage.onChanged?.((key, value) => {
  if (key !== 'sidebarState') return;
  void runtime.messaging.send({
    v: 1,
    type: 'PROVIDERS_PUBLIC',
    correlationId: crypto.randomUUID(),
    payload: { providers: publicProviders(value) },
  }).catch(() => undefined);
});

async function routePanelCommand(message: ExtensionMessage): Promise<void> {
  try {
    const explicitTabId = message.type === 'APPLY_ALL' || message.type === 'APPLY_ISSUE'
      ? message.payload.tabId
      : undefined;
    const tab = explicitTabId === undefined ? await runtime.tabs.active() : { id: explicitTabId };
    if (tab) await send(tab.id, message);
  } catch { /* a closed tab/content script must not create an unhandled rejection */ }
}

runtime.messaging.onMessage((message, sender) => {
  if ((message as { type?: string }).type === 'PROVIDERS_REQUEST') { void runtime.storage.get<unknown>('sidebarState').then(state => runtime.messaging.send({ v: 1, type: 'PROVIDERS_PUBLIC', correlationId: (message as { correlationId: string }).correlationId, payload: { providers: publicProviders(state) } })).catch(() => undefined); return; }
  if (!isExtensionMessage(message)) return;
  const tabId = sender.tab?.id;
  if (message.type === 'SETTINGS_UPDATED') {
    settingsUpdatedInThisLifetime = true;
    settings = message.payload;
    void runtime.storage.set('writingAssistantSettings', settings).catch(() => undefined);
  }
  if (shouldRouteToContent(message as ExtensionMessage, tabId)) void routePanelCommand(message as ExtensionMessage);
  if (message.type === 'CANCEL_ANALYSIS') { requests.cancel(message.payload.requestId); return; }
  if (message.type === 'OPEN_SIDE_PANEL') { void runtime.sidePanel.open(tabId).catch(() => undefined); return; }
  if (message.type === 'WRITING_MODEL_STATUS_REQUEST') { void provider().then(config => tabId === undefined ? undefined : runtime.tabs.send(tabId, { v: 1, type: 'WRITING_MODEL_STATUS', correlationId: message.correlationId, payload: { available: Boolean(config) } })).catch(() => undefined); return; }
  if (message.type === 'ANALYSIS_REQUESTED') void analyze(message, tabId);
  if (message.type === 'FULL_ANALYSIS_REQUESTED') void full(message, tabId);
});

async function provider(): Promise<OpenAITransport | GeminiTransport | undefined> { await settingsReady; const state = await runtime.storage.get<unknown>('sidebarState'); const selected = resolveWritingProvider(state, settings); return !selected ? undefined : selected.kind === 'gemini' ? new GeminiTransport(selected, undefined, settings.disableThinking, settings.constrainedDecoding) : new OpenAITransport(selected, undefined, settings.disableThinking, settings.constrainedDecoding); }
const failureCode = (error: unknown): string => {
  const status = (error as { status?: number }).status;
  if (status) return `HTTP_${status}`;
  const code = (error as { code?: string }).code;
  if (code === 'NETWORK') return 'NETWORK';
  if (code === 'RESPONSE_DECODE') return 'RESPONSE_DECODE';
  if (code === 'EMPTY_RESPONSE') return 'EMPTY_RESPONSE';
  if (code === 'PARSE_ERROR') return 'PARSE_ERROR';
  if (error instanceof SyntaxError) return 'PARSE_ERROR';
  return 'NETWORK';
};

async function analyze(message: Extract<ExtensionMessage, { type: 'ANALYSIS_REQUESTED' }>, tabId?: number): Promise<void> { try { const transport = await provider(); if (!transport) { if (tabId !== undefined) await send(tabId, { v: 1, type: 'ANALYSIS_FAILED', correlationId: message.correlationId, payload: { requestId: message.payload.requestId, code: 'NO_MODEL', retryable: false } }); return; } if (tabId === undefined) return; const uiLanguage = (await runtime.storage.get<string>('sidebarLanguage')) || 'zh-CN'; const scheduler = new AnalysisScheduler((r, signal) => transport.analyze(r, signal, uiLanguage)); for (const payload of await requests.retry(message.payload.requestId, signal => scheduler.schedule(message.payload, { invocationStrategy: settings.invocationStrategy, maxConcurrency: settings.maxConcurrency }, signal))) await send(tabId, { v: 1, type: 'ANALYSIS_COMPLETED', correlationId: message.correlationId, payload }); } catch (error) { if ((error as { name?: string }).name !== 'AbortError' && tabId !== undefined) await send(tabId, { v: 1, type: 'ANALYSIS_FAILED', correlationId: message.correlationId, payload: { requestId: message.payload.requestId, code: failureCode(error), retryable: ![401, 403].includes((error as { status?: number }).status ?? 0) } }).catch(() => undefined); } finally { requests.complete(message.payload.requestId); } }
async function full(message: Extract<ExtensionMessage, { type: 'FULL_ANALYSIS_REQUESTED' }>, tabId?: number): Promise<void> { try { const transport = await provider(); if (!transport) { if (tabId !== undefined) await send(tabId, { v: 1, type: 'ANALYSIS_FAILED', correlationId: message.correlationId, payload: { requestId: message.payload.requestId, code: 'NO_MODEL', retryable: false } }); return; } if (tabId === undefined) return; const uiLanguage = (await runtime.storage.get<string>('sidebarLanguage')) || 'zh-CN'; const payload = await requests.retry(message.payload.requestId, signal => transport.full(message.payload, signal, uiLanguage)); await send(tabId, { v: 1, type: 'ANALYSIS_COMPLETED', correlationId: message.correlationId, payload }); } catch (error) { if ((error as { name?: string }).name !== 'AbortError' && tabId !== undefined) await send(tabId, { v: 1, type: 'ANALYSIS_FAILED', correlationId: message.correlationId, payload: { requestId: message.payload.requestId, code: failureCode(error), retryable: ![401, 403].includes((error as { status?: number }).status ?? 0) } }).catch(() => undefined); } finally { requests.complete(message.payload.requestId); } }
