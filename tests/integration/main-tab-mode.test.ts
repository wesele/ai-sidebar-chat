import { describe, expect, it, vi } from 'vitest';
import type { BrowserRuntime } from '../../src/shared/browser-runtime';

describe('main window tab mode', () => {
  it('hides the writing assistant tab and forces tools tab when opened in a main tab', async () => {
    document.body.innerHTML = `
      <header id="top-nav-bar">
        <nav id="primary-tabs">
          <button data-primary-tab="writing"></button>
          <button data-primary-tab="tools"></button>
        </nav>
      </header>
      <div id="writing-assistant-panel"></div>
      <div id="app-container"></div>
    `;

    const sent: unknown[] = [];
    const runtime: BrowserRuntime = {
      storage: {
        get: async () => 'writing',
        set: async () => undefined,
      },
      messaging: {
        send: async (message) => { sent.push(message); },
        onMessage: () => undefined,
      },
      sidePanel: { open: async () => undefined },
      tabs: {
        active: async () => ({ id: 123 }),
        current: async () => ({ id: 123 }),
        send: async () => undefined,
      },
    };

    vi.doMock('../../src/shared/browser-runtime', () => ({ chromeRuntime: () => runtime }));
    await import('../../src/sidepanel/index?main-tab-test');

    await vi.waitFor(() => {
      expect(document.body.classList.contains('main-tab-mode')).toBe(true);
      const writingBtn = document.querySelector<HTMLButtonElement>('[data-primary-tab="writing"]');
      expect(writingBtn?.hidden).toBe(true);
      const tools = document.getElementById('app-container');
      expect(tools?.hidden).toBe(false);
      const writing = document.getElementById('writing-assistant-panel');
      expect(writing?.hidden).toBe(true);
    });

    const panelOpened = sent.some((msg) => (msg as { type?: string; payload?: { open?: boolean } }).type === 'PANEL_CONNECTION_CHANGED' && (msg as { payload?: { open?: boolean } }).payload?.open);
    expect(panelOpened).toBe(false);
  });
});
