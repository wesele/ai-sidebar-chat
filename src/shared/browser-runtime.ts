import type { RuntimeMessage } from './messages';

type BrowserApi = typeof chrome & {
  sidebarAction?: {
    open(): Promise<void>;
  };
};

const api = (): BrowserApi => {
  const browserApi = (globalThis as typeof globalThis & { browser?: BrowserApi }).browser;
  return browserApi ?? chrome;
};

const runtimeApi = (): BrowserApi => api();

export interface SettingsStorage {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  onChanged?(listener: (key: string, value: unknown) => void): void;
}
export interface TypedMessaging { send(message: RuntimeMessage): Promise<unknown>; onMessage(listener: (message: RuntimeMessage, sender: chrome.runtime.MessageSender) => void): void; }
export interface SidePanelCapability { open(tabId?: number): Promise<void>; setActionBehavior?(): Promise<void>; }
export interface TabCapability { active(): Promise<{ id: number } | undefined>; send(tabId: number, message: RuntimeMessage): Promise<void>; onActivated?(listener: (tabId: number) => void): void; }
export interface BrowserRuntime { storage: SettingsStorage; messaging: TypedMessaging; sidePanel: SidePanelCapability; tabs: TabCapability; }
export function chromeRuntime(): BrowserRuntime {
  const browser = runtimeApi();
  const firefoxSidebar = browser.sidebarAction;
  return {
    storage: {
      async get<T>(key: string) { return (await browser.storage.local.get(key))[key] as T | undefined; },
      async set<T>(key: string, value: T) { await browser.storage.local.set({ [key]: value }); },
      onChanged(listener) {
        browser.storage.onChanged.addListener((changes, areaName) => {
          if (areaName !== 'local') return;
          for (const [key, change] of Object.entries(changes)) listener(key, change.newValue);
        });
      },
    },
    messaging: {
      send: message => browser.runtime.sendMessage(message),
      onMessage: listener => browser.runtime.onMessage.addListener((m, s) => {
        if ((m as RuntimeMessage).v === 1) listener(m as RuntimeMessage, s);
      }),
    },
    sidePanel: {
      async open(tabId) {
        if (firefoxSidebar) {
          await firefoxSidebar.open();
          return;
        }
        if (tabId !== undefined) {
          await browser.sidePanel.open({ tabId });
          return;
        }
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const windowId = tabs[0]?.windowId;
        if (windowId === undefined) throw new Error('No active window');
        await browser.sidePanel.open({ windowId });
      },
      async setActionBehavior() {
        if (!firefoxSidebar) await browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      },
    },
    tabs: {
      async active() {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        return tabs[0]?.id === undefined ? undefined : { id: tabs[0].id };
      },
      async send(tabId, message) { await browser.tabs.sendMessage(tabId, message); },
      onActivated(listener) { browser.tabs.onActivated.addListener(({ tabId }) => listener(tabId)); },
    },
  };
}
