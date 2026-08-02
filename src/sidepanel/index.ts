import { chromeRuntime } from '../shared/browser-runtime';
import type { ExtensionMessage, RuntimeMessage } from '../shared/messages';
import { defaults, WritingAssistantPanel, type WritingSettings } from './app';

const runtime = chromeRuntime();

const send = (message: RuntimeMessage): void => {
  void runtime.messaging.send(message).catch(() => undefined);
};

function init(): void {
  const writing = document.getElementById('writing-assistant-panel');
  const tools = document.getElementById('app-container');
  if (!writing || !tools) return;
  const pendingBatch = new Map<string, { tabId: number; editorId: string; revision: number }>();
  const completedBatch = new Map<number, Extract<RuntimeMessage, { type: 'APPLY_RESULT' }>['payload']>();
  const notifyPanelConnection = (open: boolean): void => send({
    v: 1,
    type: 'PANEL_CONNECTION_CHANGED',
    correlationId: crypto.randomUUID(),
    payload: { open },
  });
  const panel = new WritingAssistantPanel(
    writing,
    async (settings) => {
      await runtime.storage.set('writingAssistantSettings', settings);
      send({
        v: 1,
        type: 'SETTINGS_UPDATED',
        correlationId: crypto.randomUUID(),
        payload: settings,
      });
      // The panel may have opened before the content script received the new mode.
      notifyPanelConnection(true);
    },
    (type, payload) => {
      if (type === 'RETRY_DETECTION' || type === 'REQUEST_FULL_ANALYSIS') {
        send({
          v: 1,
          type,
          correlationId: crypto.randomUUID(),
          payload: payload as Extract<ExtensionMessage, { type: 'RETRY_DETECTION' | 'REQUEST_FULL_ANALYSIS' }>['payload'],
        });
      } else if (type === 'APPLY_ISSUE') {
        send({
          v: 1,
          type,
          correlationId: crypto.randomUUID(),
          payload: payload as Extract<ExtensionMessage, { type: 'APPLY_ISSUE' }>['payload'],
        });
      } else {
        const command = payload as Extract<ExtensionMessage, { type: 'APPLY_ALL' }>['payload'];
        const correlationId = crypto.randomUUID();
        pendingBatch.set(correlationId, {
          tabId: command.tabId,
          editorId: command.editorId,
          revision: command.revision,
        });
        send({
          v: 1,
          type,
          correlationId,
          payload: command,
        });
      }
    },
  );

  const switchTab = (tab: 'writing' | 'tools'): void => {
    writing.hidden = tab !== 'writing';
    tools.hidden = tab !== 'tools';
    document.querySelectorAll<HTMLButtonElement>('[data-primary-tab]').forEach((button) => {
      button.setAttribute('aria-selected', String(button.dataset.primaryTab === tab));
    });
    void runtime.storage.set('activePrimaryTab', tab).catch(() => undefined);
  };

  document.querySelectorAll<HTMLButtonElement>('[data-primary-tab]').forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.primaryTab as 'writing' | 'tools'));
  });
  void runtime.storage.get<'writing' | 'tools'>('activePrimaryTab')
    .then((tab) => switchTab(tab ?? 'writing'))
    .catch(() => switchTab('writing'));
  void runtime.storage.get<WritingSettings>('writingAssistantSettings')
    .then((settings) => panel.setSettings(settings ?? defaults))
    .catch(() => panel.setSettings(defaults));
  void runtime.storage.get<{ language?: string }>('language')
    .then((res) => { if (res?.language) panel.setLanguage(res.language); })
    .catch(() => undefined);

  window.addEventListener('app-language-changed', (e: Event) => {
    const customEvent = e as CustomEvent<{ lang: string }>;
    if (customEvent.detail?.lang) {
      panel.setLanguage(customEvent.detail.lang);
    }
  });

  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.language?.newValue) {
        panel.setLanguage(changes.language.newValue as string);
      }
    });
  }

  runtime.messaging.onMessage((message, sender) => {
    if (message.type === 'EDITOR_STATE_CHANGED') {
      const sourceTabId = sender.tab?.id;
      if (sourceTabId !== undefined) void runtime.tabs.active()
        .then((active) => {
          if (active?.id === sourceTabId) {
            panel.setState(message.payload, sourceTabId);
            const completed = completedBatch.get(sourceTabId);
            if (completed?.editorId === message.payload.editorId) {
              completedBatch.delete(sourceTabId);
              panel.setApplyResult(completed);
            }
          }
        })
        .catch(() => undefined);
    }
    else if (message.type === 'PROVIDERS_PUBLIC') panel.setProviders(message.payload.providers);
    else if (message.type === 'APPLY_RESULT') {
      const pending = pendingBatch.get(message.correlationId);
      if (pending && sender.tab?.id === message.payload.tabId &&
        pending.tabId === message.payload.tabId && pending.editorId === message.payload.editorId &&
        pending.revision === message.payload.revision) {
        pendingBatch.delete(message.correlationId);
        void runtime.tabs.active()
          .then((active) => {
            if (active?.id === message.payload.tabId) panel.setApplyResult(message.payload);
            else completedBatch.set(message.payload.tabId, message.payload);
          })
          .catch(() => completedBatch.set(message.payload.tabId, message.payload));
      }
    }
  });
  runtime.tabs.onActivated?.((tabId) => {
    panel.clearState(tabId);
    notifyPanelConnection(true);
  });
  send({ v: 1, type: 'PROVIDERS_REQUEST', correlationId: crypto.randomUUID(), payload: {} });
  notifyPanelConnection(true);
  const reannouncePanel = (): void => notifyPanelConnection(true);
  window.addEventListener('focus', reannouncePanel);
  window.addEventListener('pageshow', reannouncePanel);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reannouncePanel();
  });
  window.addEventListener('pagehide', () => notifyPanelConnection(false));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
