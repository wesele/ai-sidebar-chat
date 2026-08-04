import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { BrowserRuntime } from '../../src/shared/browser-runtime';
import type { RuntimeMessage, SettingsPayload } from '../../src/shared/messages';

const settings: SettingsPayload = {
  providerId: 'provider-1',
  modelId: 'model-1',
  invocationStrategy: 'batch',
  maxConcurrency: 3,
  activationMode: 'always',
  fullDocumentCharacterLimit: 20_000,
  targetLanguage: 'EN',
};

const sent: RuntimeMessage[] = [];
let listener: ((message: RuntimeMessage, sender: chrome.runtime.MessageSender) => void) | undefined;

const runtime: BrowserRuntime = {
  storage: {
    get: async <T>() => settings as T,
    set: async () => undefined,
  },
  messaging: {
    send: async (message) => { sent.push(message); },
    onMessage: (next) => { listener = next; },
  },
  sidePanel: { open: async () => undefined },
  tabs: { active: async () => ({ id: 1 }), send: async () => undefined },
};

function dispatch(message: RuntimeMessage): void {
  listener?.(message, {} as chrome.runtime.MessageSender);
}

describe('content entry settings updates', () => {
  beforeAll(async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<textarea id="editor">A sentence to check.</textarea>';
    const editor = document.querySelector<HTMLTextAreaElement>('#editor')!;
    vi.spyOn(editor, 'getBoundingClientRect').mockReturnValue({
      width: 400, height: 80, top: 0, left: 0, right: 400, bottom: 80,
    } as DOMRect);
    editor.focus();
    vi.doMock('../../src/shared/browser-runtime', () => ({ chromeRuntime: () => runtime }));
    await import('../../src/content/index');
    await vi.waitFor(() => expect(listener).toBeTypeOf('function'));
  });

  afterEach(() => {
    sent.length = 0;
  });

  afterAll(async () => {
    document.body.replaceChildren();
    await Promise.resolve();
    vi.useRealTimers();
  });

  it('does not restart completed analysis when unrelated settings are saved', async () => {
    dispatch({
      v: 1,
      type: 'WRITING_MODEL_STATUS',
      correlationId: 'model-status',
      payload: { available: true },
    });
     dispatch({
       v: 1,
       type: 'SETTINGS_UPDATED',
       correlationId: 'initial-settings',
       payload: { ...settings, writingStyle: 'practical' },
     });
     await vi.waitFor(() => expect(sent.some((message) => message.type === 'ANALYSIS_REQUESTED')).toBe(true));

    const request = sent.find((message): message is Extract<RuntimeMessage, { type: 'ANALYSIS_REQUESTED' }> => message.type === 'ANALYSIS_REQUESTED');
    expect(request).toBeDefined();
    if (!request) return;

    dispatch({
      v: 1,
      type: 'ANALYSIS_COMPLETED',
      correlationId: request.correlationId,
      payload: {
        schemaVersion: '1',
        requestId: request.payload.requestId,
        documentRevision: request.payload.documentRevision,
        units: request.payload.units.map((unit) => ({
          unitId: unit.unitId,
          unitRevision: unit.unitRevision,
          issues: [],
        })),
      },
    });
    await Promise.resolve();
    const requestCount = sent.filter((message) => message.type === 'ANALYSIS_REQUESTED').length;
    const fullCount = sent.filter((message) => message.type === 'FULL_ANALYSIS_REQUESTED').length;

    dispatch({
      v: 1,
      type: 'SETTINGS_UPDATED',
      correlationId: 'settings-update',
       payload: { ...settings, targetLanguage: 'EN', invocationStrategy: 'parallel', writingStyle: 'practical', replacementFontScale: 0.9 },
    });
    await Promise.resolve();
    vi.runOnlyPendingTimers();

    expect(sent.filter((message) => message.type === 'ANALYSIS_REQUESTED')).toHaveLength(requestCount + 1);
    expect(sent.filter((message) => message.type === 'FULL_ANALYSIS_REQUESTED')).toHaveLength(fullCount + 1);
  });

  it('restarts full detection immediately when the target language changes', async () => {
    // The previous test left every unit analyzed; edit the text to produce a
    // fresh dirty set before verifying the language-switch re-detection.
    const editor = document.querySelector<HTMLTextAreaElement>('#editor')!;
    editor.value = 'A different sentence to check.';
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    vi.runOnlyPendingTimers();
    await vi.waitFor(() => expect(sent.some((message) => message.type === 'ANALYSIS_REQUESTED')).toBe(true));

    const request = sent.find((message): message is Extract<RuntimeMessage, { type: 'ANALYSIS_REQUESTED' }> => message.type === 'ANALYSIS_REQUESTED');
    expect(request).toBeDefined();
    if (!request) return;

    dispatch({
      v: 1,
      type: 'ANALYSIS_COMPLETED',
      correlationId: request.correlationId,
      payload: {
        schemaVersion: '1',
        requestId: request.payload.requestId,
        documentRevision: request.payload.documentRevision,
        units: request.payload.units.map((unit) => ({
          unitId: unit.unitId,
          unitRevision: unit.unitRevision,
          issues: [],
        })),
      },
    });
    await Promise.resolve();
    const requestCount = sent.filter((message) => message.type === 'ANALYSIS_REQUESTED').length;
    const fullCount = sent.filter((message) => message.type === 'FULL_ANALYSIS_REQUESTED').length;

    dispatch({
      v: 1,
      type: 'SETTINGS_UPDATED',
      correlationId: 'settings-language',
      payload: { ...settings, targetLanguage: 'ES' },
    });
    await Promise.resolve();
    vi.runOnlyPendingTimers();

    expect(sent.filter((message) => message.type === 'ANALYSIS_REQUESTED')).toHaveLength(requestCount + 1);
    expect(sent.filter((message) => message.type === 'FULL_ANALYSIS_REQUESTED')).toHaveLength(fullCount + 1);
  });
});
