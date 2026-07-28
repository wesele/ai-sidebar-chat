import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserRuntime } from '../../src/shared/browser-runtime';
import type { RuntimeMessage, SettingsPayload } from '../../src/shared/messages';

const settings: SettingsPayload = {
  providerId: 'provider-1',
  modelId: 'model-1',
  invocationStrategy: 'batch',
  maxConcurrency: 3,
  activationMode: 'always',
  fullDocumentCharacterLimit: 20_000,
};

const storage = new Map<string, unknown>([
  ['writingAssistantSettings', settings],
  ['sidebarState', {
    providers: [{
      id: 'provider-1',
      name: 'Provider One',
      baseUrl: 'https://provider.test/v1/',
      apiKey: 'secret-key',
      models: ['model-1'],
      apiType: 'openai',
    }],
  }],
]);
const runtimeMessages: RuntimeMessage[] = [];
const tabMessages: Array<{ tabId: number; message: RuntimeMessage }> = [];
const openedPanels: Array<number | undefined> = [];
let listener: ((message: RuntimeMessage, sender: chrome.runtime.MessageSender) => void) | undefined;
let storageChangeListener: ((key: string, value: unknown) => void) | undefined;
let providerReply: unknown;

const runtime: BrowserRuntime = {
  storage: {
    get: async <T>(key: string) => storage.get(key) as T | undefined,
    set: async <T>(key: string, value: T) => { storage.set(key, value); },
    onChanged: (next) => { storageChangeListener = next; },
  },
  messaging: {
    send: vi.fn(async (message) => { runtimeMessages.push(message); }),
    onMessage: vi.fn((callback) => { listener = callback; }),
  },
  sidePanel: {
    open: vi.fn(async (tabId) => { openedPanels.push(tabId); }),
  },
  tabs: {
    active: vi.fn(async () => ({ id: 41 })),
    send: vi.fn(async (tabId, message) => { tabMessages.push({ tabId, message }); }),
  },
};

const dispatch = (message: RuntimeMessage, tabId?: number): void => {
  listener?.(message, (tabId === undefined ? {} : { tab: { id: tabId } }) as chrome.runtime.MessageSender);
};

const unitRequest = (requestId: string): Extract<RuntimeMessage, { type: 'ANALYSIS_REQUESTED' }> => ({
  v: 1,
  type: 'ANALYSIS_REQUESTED',
  correlationId: requestId,
  payload: {
    schemaVersion: '1',
    requestId,
    documentRevision: 2,
    targetLanguage: 'en',
    units: [{
      unitId: 'sentence-1',
      unitRevision: 1,
      unitType: 'sentence',
      text: 'Bad sentence.',
      absoluteStart: 0,
    }],
  },
});

describe('background service-worker entry', () => {
  beforeAll(async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(providerReply), { status: 200 })));
    vi.doMock('../../src/shared/browser-runtime', () => ({ chromeRuntime: () => runtime }));
    await import('../../src/background/index');
    await vi.waitFor(() => expect(listener).toBeTypeOf('function'));
  });

  beforeEach(() => {
    runtimeMessages.length = 0;
    tabMessages.length = 0;
    openedPanels.length = 0;
    vi.mocked(fetch).mockClear();
    storage.set('writingAssistantSettings', settings);
    storage.set('sidebarState', {
      providers: [{
        id: 'provider-1', name: 'Provider One', baseUrl: 'https://provider.test/v1/',
        apiKey: 'secret-key', models: ['model-1'], apiType: 'openai',
      }],
    });
  });

  it('publishes redacted providers and model availability', async () => {
    dispatch({ v: 1, type: 'PROVIDERS_REQUEST', correlationId: 'providers', payload: {} });
    await vi.waitFor(() => expect(runtimeMessages).toHaveLength(1));
    expect(runtimeMessages[0]).toEqual({
      v: 1,
      type: 'PROVIDERS_PUBLIC',
      correlationId: 'providers',
      payload: { providers: [{ id: 'provider-1', name: 'Provider One', models: ['model-1'] }] },
    });
    expect(JSON.stringify(runtimeMessages[0])).not.toContain('secret-key');

    dispatch({ v: 1, type: 'WRITING_MODEL_STATUS_REQUEST', correlationId: 'status', payload: {} }, 7);
    await vi.waitFor(() => expect(tabMessages.some(({ message }) => message.type === 'WRITING_MODEL_STATUS')).toBe(true));
    expect(tabMessages.at(-1)).toMatchObject({
      tabId: 7,
      message: { type: 'WRITING_MODEL_STATUS', payload: { available: true } },
    });
  });

  it('publishes providers again when AI Tools saves a new configuration', async () => {
    const updatedState = {
      providers: [{
        id: 'real-provider', name: 'Real Provider', baseUrl: 'https://provider.test/v1/',
        apiKey: 'secret-key', models: ['model-a', 'model-b'], apiType: 'openai',
      }],
    };
    storage.set('sidebarState', updatedState);
    storageChangeListener?.('sidebarState', updatedState);

    await vi.waitFor(() => expect(runtimeMessages).toHaveLength(1));
    expect(runtimeMessages[0]).toMatchObject({
      type: 'PROVIDERS_PUBLIC',
      payload: { providers: [{ id: 'real-provider', name: 'Real Provider', models: ['model-a', 'model-b'] }] },
    });
    expect(JSON.stringify(runtimeMessages[0])).not.toContain('secret-key');
  });

  it('persists settings and routes side-panel commands only to the active content script', async () => {
    const updated = { ...settings, activationMode: 'panel_open' as const, maxConcurrency: 5 };
    dispatch({ v: 1, type: 'SETTINGS_UPDATED', correlationId: 'settings', payload: updated });
    await vi.waitFor(() => expect(tabMessages).toHaveLength(1));
    expect(storage.get('writingAssistantSettings')).toEqual(updated);
    expect(tabMessages[0]).toMatchObject({ tabId: 41, message: { type: 'SETTINGS_UPDATED' } });

    dispatch({
      v: 1,
      type: 'APPLY_ALL',
      correlationId: 'apply',
      payload: { tabId: 77, editorId: 'editor-1', revision: 1, scope: 'paragraph', expectedCount: 2 },
    });
    await vi.waitFor(() => expect(tabMessages).toHaveLength(2));
    expect(tabMessages[1].tabId).toBe(77);
    dispatch({
      v: 1,
      type: 'OPEN_SIDE_PANEL',
      correlationId: 'open',
      payload: { tabId: 7 },
    }, 7);
    await vi.waitFor(() => expect(openedPanels).toEqual([7]));
  });

  it('runs unit and full-document requests through the configured provider', async () => {
    const unitResponse = {
      schemaVersion: '1', requestId: 'unit', documentRevision: 2,
      units: [{ unitId: 'sentence-1', unitRevision: 1, issues: [] }],
    };
    providerReply = { choices: [{ message: { content: JSON.stringify(unitResponse) } }] };
    dispatch(unitRequest('unit'), 9);
    await vi.waitFor(() => expect(tabMessages.some(({ message }) =>
      message.type === 'ANALYSIS_COMPLETED' && message.payload.requestId === 'unit')).toBe(true));
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe('https://provider.test/v1/chat/completions');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret-key');

    const fullResponse = {
      schemaVersion: '1', requestId: 'full', documentRevision: 2,
      severity: 'none', summary: 'Clear.', suggestions: [],
    };
    providerReply = { choices: [{ message: { content: JSON.stringify(fullResponse) } }] };
    dispatch({
      v: 1,
      type: 'FULL_ANALYSIS_REQUESTED',
      correlationId: 'full',
      payload: { schemaVersion: '1', requestId: 'full', documentRevision: 2, text: 'Document.' },
    }, 9);
    await vi.waitFor(() => expect(tabMessages.some(({ message }) =>
      message.type === 'ANALYSIS_COMPLETED' && message.payload.requestId === 'full')).toBe(true));
  });

  it('reports no-model and provider authorization failures without leaking errors', async () => {
    storage.set('sidebarState', { providers: [] });
    dispatch(unitRequest('no-model'), 3);
    await vi.waitFor(() => expect(tabMessages.some(({ message }) =>
      message.type === 'ANALYSIS_FAILED' && message.payload.requestId === 'no-model')).toBe(true));
    expect(tabMessages.at(-1)?.message).toMatchObject({
      type: 'ANALYSIS_FAILED',
      payload: { code: 'NO_MODEL', retryable: false },
    });

    storage.set('sidebarState', {
      providers: [{
        id: 'provider-1', baseUrl: 'https://provider.test/v1', apiKey: 'secret-key',
        models: ['model-1'], apiType: 'openai',
      }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 401 }));
    dispatch(unitRequest('unauthorized'), 3);
    await vi.waitFor(() => expect(tabMessages.some(({ message }) =>
      message.type === 'ANALYSIS_FAILED' && message.payload.requestId === 'unauthorized')).toBe(true));
    expect(tabMessages.at(-1)?.message).toMatchObject({
      type: 'ANALYSIS_FAILED',
      payload: { code: 'HTTP_401', retryable: false },
    });
  });

  it('ignores invalid messages and content-originated panel routing', async () => {
    listener?.({ type: 'SETTINGS_UPDATED' } as RuntimeMessage, {});
    dispatch({
      v: 1,
      type: 'APPLY_ISSUE',
      correlationId: 'content-origin',
      payload: { tabId: 8, editorId: 'editor-1', revision: 1, issueId: 'issue-1' },
    }, 8);
    dispatch({ v: 1, type: 'CANCEL_ANALYSIS', correlationId: 'cancel', payload: { requestId: 'missing' } }, 8);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(tabMessages).toEqual([]);
  });
});
