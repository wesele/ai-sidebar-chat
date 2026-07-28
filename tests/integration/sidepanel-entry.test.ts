import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { BrowserRuntime } from '../../src/shared/browser-runtime';
import type { EditorViewState, RuntimeMessage } from '../../src/shared/messages';

const sent: RuntimeMessage[] = [];
let activeTabId = 11;
let listener: ((message: RuntimeMessage, sender: chrome.runtime.MessageSender) => void) | undefined;
let activated: ((tabId: number) => void) | undefined;

const runtime: BrowserRuntime = {
  storage: {
    get: async () => undefined,
    set: async () => undefined,
  },
  messaging: {
    send: async (message) => { sent.push(message); },
    onMessage: (next) => { listener = next; },
  },
  sidePanel: { open: async () => undefined },
  tabs: {
    active: async () => ({ id: activeTabId }),
    send: async () => undefined,
    onActivated: (next) => { activated = next; },
  },
};

const state: EditorViewState = {
  editorId: 'editor-same',
  revision: 1,
  status: 'analyzed',
  counts: { local: 0, sentence: 1, paragraph: 0 },
  batchPreviews: {
    local: [],
    sentence: [{
      issueId: 'issue-1', severity: 'problem', original: 'bad', replacement: 'good', reason: 'grammar',
    }],
    paragraph: [],
  },
};

function dispatch(message: RuntimeMessage, tabId: number): void {
  listener?.(message, { tab: { id: tabId } } as chrome.runtime.MessageSender);
}

describe('side-panel tab and batch correlation binding', () => {
  beforeAll(async () => {
    document.body.innerHTML = `
      <button data-primary-tab="writing"></button>
      <button data-primary-tab="tools"></button>
      <div id="writing-assistant-panel"></div>
      <div id="app-container"></div>
    `;
    vi.doMock('../../src/shared/browser-runtime', () => ({ chromeRuntime: () => runtime }));
    await import('../../src/sidepanel/index');
    await vi.waitFor(() => expect(listener).toBeTypeOf('function'));
  });

  it('ignores inactive-tab state and binds commands/results to the source tab', async () => {
    dispatch({
      v: 1, type: 'EDITOR_STATE_CHANGED', correlationId: 'state-22', payload: state,
    }, 22);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.body.textContent).not.toContain('bad → good');

    dispatch({
      v: 1, type: 'EDITOR_STATE_CHANGED', correlationId: 'state-11', payload: state,
    }, 11);
    await vi.waitFor(() => expect(document.body.textContent).toContain('句子 1'));
    const count = Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent === '句子 1')!;
    count.click();
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent === '确认全部应用')!.click();
    const command = [...sent].reverse().find((message) => message.type === 'APPLY_ALL');
    expect(command).toMatchObject({
      type: 'APPLY_ALL',
      payload: { tabId: 11, editorId: 'editor-same', revision: 1, expectedCount: 1 },
    });
    if (!command || command.type !== 'APPLY_ALL') throw new Error('Missing APPLY_ALL command');

    dispatch({
      v: 1,
      type: 'APPLY_RESULT',
      correlationId: command.correlationId,
      payload: {
        tabId: 11, editorId: 'editor-same', revision: 1, scope: 'sentence',
        applied: 1, skipped: 0, stale: false,
      },
    }, 22);
    expect(document.querySelector('[data-apply-result]')).toBeNull();

    dispatch({
      v: 1,
      type: 'APPLY_RESULT',
      correlationId: command.correlationId,
      payload: {
        tabId: 11, editorId: 'editor-same', revision: 1, scope: 'sentence',
        applied: 1, skipped: 0, stale: false,
      },
    }, 11);
    await vi.waitFor(() => expect(document.querySelector('[data-apply-result]')?.textContent)
      .toContain('已应用 1 项'));

    count.click();
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent === '确认全部应用')!.click();
    const secondCommand = [...sent].reverse().find((message) => message.type === 'APPLY_ALL');
    if (!secondCommand || secondCommand.type !== 'APPLY_ALL') throw new Error('Missing second APPLY_ALL command');
    activeTabId = 22;
    activated?.(22);
    expect(document.body.textContent).toContain('聚焦一个英文编辑器以开始');
    expect(document.querySelector('[data-apply-result]')).toBeNull();
    dispatch({
      v: 1,
      type: 'APPLY_RESULT',
      correlationId: secondCommand.correlationId,
      payload: {
        tabId: 11, editorId: 'editor-same', revision: 1, scope: 'sentence',
        applied: 1, skipped: 0, stale: false,
      },
    }, 11);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('[data-apply-result]')).toBeNull();

    activeTabId = 11;
    activated?.(11);
    dispatch({
      v: 1, type: 'EDITOR_STATE_CHANGED', correlationId: 'state-11-return', payload: state,
    }, 11);
    await vi.waitFor(() => expect(document.querySelector('[data-apply-result]')?.textContent)
      .toContain('已应用 1 项'));
  });
});
