import { chromeRuntime } from '../shared/browser-runtime';
import type { ExtensionMessage, RuntimeMessage } from '../shared/messages';
import { defaults, WritingAssistantPanel, type WritingSettings } from './app';

const runtime = chromeRuntime();

const send = (message: RuntimeMessage): void => {
  void runtime.messaging.send(message).catch(() => undefined);
};

async function init(): Promise<void> {
  const writing = document.getElementById('writing-assistant-panel');
  const tools = document.getElementById('app-container');
  if (!writing || !tools) return;
  const pendingBatch = new Map<string, { tabId: number; editorId: string; revision: number }>();
  const completedBatch = new Map<number, Extract<RuntimeMessage, { type: 'APPLY_RESULT' }>['payload']>();

  let isMainTab = false;
  let connectedTabId: number | undefined;
  try {
    const curTab = await runtime.tabs.current?.();
    if (curTab?.id !== undefined) {
      isMainTab = true;
    }
  } catch {
    isMainTab = false;
  }

  const notifyPanelConnection = (open: boolean, tabId = connectedTabId): void => {
    if (isMainTab) return;
    if (tabId === undefined) return;
    send({
      v: 1,
      type: 'PANEL_CONNECTION_CHANGED',
      correlationId: crypto.randomUUID(),
      payload: { tabId, open },
    });
  };
  const connectPanelToTab = (tabId: number): void => {
    if (connectedTabId === tabId) {
      notifyPanelConnection(true, tabId);
      return;
    }
    if (connectedTabId !== undefined) notifyPanelConnection(false, connectedTabId);
    connectedTabId = tabId;
    notifyPanelConnection(true, tabId);
  };
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
    const targetTab = isMainTab ? 'tools' : tab;
    writing.hidden = targetTab !== 'writing';
    tools.hidden = targetTab !== 'tools';
    document.querySelectorAll<HTMLButtonElement>('[data-primary-tab]').forEach((button) => {
      button.setAttribute('aria-selected', String(button.dataset.primaryTab === targetTab));
    });
    if (!isMainTab) {
      void runtime.storage.set('activePrimaryTab', targetTab).catch(() => undefined);
    }
  };

  document.querySelectorAll<HTMLButtonElement>('[data-primary-tab]').forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.primaryTab as 'writing' | 'tools'));
  });

  if (isMainTab) {
    document.body.classList.add('main-tab-mode');
    const writingTabBtn = document.querySelector<HTMLButtonElement>('[data-primary-tab="writing"]');
    if (writingTabBtn) {
      writingTabBtn.style.display = 'none';
      writingTabBtn.hidden = true;
    }
    switchTab('tools');
  } else {
    void runtime.storage.get<'writing' | 'tools'>('activePrimaryTab')
      .then((tab) => switchTab(tab ?? 'writing'))
      .catch(() => switchTab('writing'));
  }
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

  runtime.storage.onChanged?.((key, value) => {
    if (key === 'language' && value) panel.setLanguage(value as string);
  });

  runtime.messaging.onMessage((message, sender) => {
    if (message.type === 'EDITOR_STATE_CHANGED') {
      const sourceTabId = sender.tab?.id;
      const applyState = (tabId?: number): void => {
        panel.setState(message.payload, tabId);
        if (tabId !== undefined) {
          const completed = completedBatch.get(tabId);
          if (completed?.editorId === message.payload.editorId) {
            completedBatch.delete(tabId);
            panel.setApplyResult(completed);
          }
        }
      };
      if (sourceTabId !== undefined && sender.tab?.active) {
        applyState(sourceTabId);
      } else {
        void runtime.tabs.active()
          .then((active) => {
            if (sourceTabId === undefined || active?.id === sourceTabId || active === undefined) {
              applyState(sourceTabId ?? active?.id);
            }
          })
          .catch(() => undefined);
      }
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
    connectPanelToTab(tabId);
  });
  send({ v: 1, type: 'PROVIDERS_REQUEST', correlationId: crypto.randomUUID(), payload: {} });
  if (!isMainTab) {
    void runtime.tabs.active()
      .then((tab) => {
        if (tab) connectPanelToTab(tab.id);
      })
      .catch(() => undefined);
    const reannouncePanel = (): void => notifyPanelConnection(true);
    window.addEventListener('focus', reannouncePanel);
    window.addEventListener('pageshow', reannouncePanel);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reannouncePanel();
    });
    window.addEventListener('pagehide', () => notifyPanelConnection(false));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { void init(); });
} else {
  void init();
}
