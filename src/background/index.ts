import { chromeRuntime } from '../shared/browser-runtime';
import { isExtensionMessage, type ExtensionMessage, type RuntimeMessage, type SettingsPayload } from '../shared/messages';
import { AnalysisScheduler } from './analysis-scheduler';
import { OpenAITransport } from './transports/openai-transport';
import { GeminiTransport } from './transports/gemini-transport';
import { RequestRegistry, type RequestOwner } from './request-registry';
import { shouldRouteToContent } from './message-router';
import { resolveWritingProvider } from './provider-registry';
import { publicProviders } from './provider-registry';
import { normalizeThinkingMode } from '../shared/thinking';

const runtime = chromeRuntime();
void runtime.sidePanel.setActionBehavior?.().catch(() => undefined);
const requests = new RequestRegistry();
let settings: SettingsPayload = { providerId: '', modelId: '', invocationStrategy: 'batch', maxConcurrency: 3, activationMode: 'always', fullDocumentCharacterLimit: 20000, targetLanguage: 'EN', writingStyle: 'practical', disableThinking: true, constrainedDecoding: false };
let settingsUpdatedInThisLifetime = false;
const panelOpenTabs = new Set<number>();
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
  ) settings = { ...settings, ...saved };
}).catch(() => undefined);
const send = (tabId: number, message: RuntimeMessage, owner?: RequestOwner) =>
  runtime.tabs.send(tabId, message, owner ? { frameId: owner.frameId } : undefined);

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
    const explicitTabId = message.type === 'APPLY_ALL' || message.type === 'APPLY_ISSUE' ||
      message.type === 'PANEL_CONNECTION_CHANGED'
      ? message.payload.tabId
      : (message.type === 'RETRY_DETECTION' || message.type === 'REQUEST_FULL_ANALYSIS')
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
  const owner = tabId === undefined ? undefined : { tabId, frameId: sender.frameId ?? 0 };
  if (message.type === 'SETTINGS_UPDATED') {
    settingsUpdatedInThisLifetime = true;
    settings = { ...message.payload };
    void runtime.storage.set('writingAssistantSettings', settings).catch(() => undefined);
  }
  if (message.type === 'PANEL_CONNECTION_CHANGED') {
    if (message.payload.open) panelOpenTabs.add(message.payload.tabId);
    else panelOpenTabs.delete(message.payload.tabId);
  }
  if (shouldRouteToContent(message as ExtensionMessage, tabId)) void routePanelCommand(message as ExtensionMessage);
  if (message.type === 'CANCEL_ANALYSIS') {
    if (owner) requests.cancel(message.payload.requestId, owner);
    return;
  }
  if (message.type === 'OPEN_SIDE_PANEL') { void runtime.sidePanel.open(tabId).catch(() => undefined); return; }
  if (message.type === 'WRITING_MODEL_STATUS_REQUEST') {
    void provider().then(async config => {
      if (!owner) return;
      await send(owner.tabId, {
        v: 1,
        type: 'PANEL_CONNECTION_CHANGED',
        correlationId: message.correlationId,
        payload: { tabId: owner.tabId, open: panelOpenTabs.has(owner.tabId) },
      }, owner);
      await send(owner.tabId, {
        v: 1,
        type: 'WRITING_MODEL_STATUS',
        correlationId: message.correlationId,
        payload: { available: Boolean(config) },
      }, owner);
    }).catch(() => undefined);
    return;
  }
  if (message.type === 'ANALYSIS_REQUESTED') void analyze(message, owner);
  if (message.type === 'FULL_ANALYSIS_REQUESTED') void full(message, owner);
});

runtime.tabs.onUpdated?.((tabId, change) => {
  if (change.status === 'loading') requests.cancelForTab(tabId);
});
runtime.tabs.onRemoved?.((tabId) => {
  panelOpenTabs.delete(tabId);
  requests.cancelForTab(tabId);
});

async function provider(): Promise<OpenAITransport | GeminiTransport | undefined> { await settingsReady; const state = await runtime.storage.get<unknown>('sidebarState'); const selected = resolveWritingProvider(state, settings); const thinkingMode = normalizeThinkingMode(settings.thinkingMode, settings.disableThinking); return !selected ? undefined : selected.kind === 'gemini' ? new GeminiTransport(selected, undefined, thinkingMode, settings.constrainedDecoding) : new OpenAITransport(selected, undefined, thinkingMode, settings.constrainedDecoding); }
const failureCode = (error: unknown): string => {
  const status = (error as { status?: number }).status;
  if (status) return `HTTP_${status}`;
  const code = (error as { code?: string }).code;
  if (code === 'NETWORK') return 'NETWORK';
  if (code === 'TIMEOUT') return 'TIMEOUT';
  if (code === 'CANCELLED') return 'CANCELLED';
  if (code === 'INVALID_RESPONSE') return 'INVALID_RESPONSE';
  if (code === 'RESPONSE_DECODE') return 'RESPONSE_DECODE';
  if (code === 'EMPTY_RESPONSE') return 'EMPTY_RESPONSE';
  if (code === 'MODEL_TRUNCATED') return 'MODEL_TRUNCATED';
  if (code === 'TOOL_CALL_MISSING') return 'TOOL_CALL_MISSING';
  if (code === 'PARSE_ERROR') return 'PARSE_ERROR';
  if (error instanceof SyntaxError) return 'PARSE_ERROR';
  return 'NETWORK';
};

async function analyze(message: Extract<ExtensionMessage, { type: 'ANALYSIS_REQUESTED' }>, owner?: RequestOwner): Promise<void> {
  if (!owner) return;
  let lease: number | undefined;
  try {
    await requests.retry(
      message.payload.requestId,
      async (signal, nextLease) => {
        lease = nextLease;
        const transport = await provider();
        if (signal.aborted) return;
        if (!transport) {
          await sendFailure(message, owner, 'NO_MODEL', false, lease);
          return;
        }
        const uiLanguage = (await runtime.storage.get<string>('sidebarLanguage')) || 'zh-CN';
        const scheduler = new AnalysisScheduler((request, requestSignal) => transport.analyze(request, requestSignal, uiLanguage));
        await scheduler.schedule(
          { ...message.payload, writingStyle: message.payload.writingStyle ?? settings.writingStyle ?? 'practical' },
          { invocationStrategy: settings.invocationStrategy, maxConcurrency: settings.maxConcurrency },
          signal,
          async payload => {
            if (!requests.active(message.payload.requestId, owner, lease)) return;
            await send(owner.tabId, {
              v: 1,
              type: 'ANALYSIS_COMPLETED',
              correlationId: message.correlationId,
              payload,
            }, owner);
          },
        );
      },
      undefined,
      owner,
    );
  } catch (error) {
    const code = failureCode(error);
    if (code !== 'CANCELLED' && (error as { name?: string }).name !== 'AbortError') {
      await sendFailure(message, owner, code, ![401, 403, 408].includes((error as { status?: number }).status ?? 0) && code !== 'TIMEOUT', lease);
    }
  } finally {
    requests.complete(message.payload.requestId, owner, lease);
  }
}

async function full(message: Extract<ExtensionMessage, { type: 'FULL_ANALYSIS_REQUESTED' }>, owner?: RequestOwner): Promise<void> {
  if (!owner) return;
  let lease: number | undefined;
  try {
    await requests.retry(
      message.payload.requestId,
      async (signal, nextLease) => {
        lease = nextLease;
        if (message.payload.text.length > settings.fullDocumentCharacterLimit) {
          await sendFailure(message, owner, 'TEXT_TOO_LONG', false, lease);
          return;
        }
        const transport = await provider();
        if (signal.aborted) return;
        if (!transport) {
          await sendFailure(message, owner, 'NO_MODEL', false, lease);
          return;
        }
        const uiLanguage = (await runtime.storage.get<string>('sidebarLanguage')) || 'zh-CN';
        const payload = await transport.full({ ...message.payload, writingStyle: message.payload.writingStyle ?? settings.writingStyle ?? 'practical' }, signal, uiLanguage);
        if (!requests.active(message.payload.requestId, owner, lease)) return;
        await send(owner.tabId, {
          v: 1,
          type: 'ANALYSIS_COMPLETED',
          correlationId: message.correlationId,
          payload,
        }, owner);
      },
      undefined,
      owner,
    );
  } catch (error) {
    const code = failureCode(error);
    if (code !== 'CANCELLED' && (error as { name?: string }).name !== 'AbortError') {
      await sendFailure(message, owner, code, ![401, 403, 408].includes((error as { status?: number }).status ?? 0) && code !== 'TIMEOUT', lease);
    }
  } finally {
    requests.complete(message.payload.requestId, owner, lease);
  }
}

async function sendFailure(
  message: Extract<ExtensionMessage, { type: 'ANALYSIS_REQUESTED' | 'FULL_ANALYSIS_REQUESTED' }>,
  owner: RequestOwner,
  code: string,
  retryable: boolean,
  lease?: number,
): Promise<void> {
  if (!requests.active(message.payload.requestId, owner, lease)) return;
  await send(owner.tabId, {
    v: 1,
    type: 'ANALYSIS_FAILED',
    correlationId: message.correlationId,
    payload: { requestId: message.payload.requestId, code, retryable },
  }, owner).catch(() => undefined);
}
