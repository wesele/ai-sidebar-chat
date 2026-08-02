import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';

describe('legacy AI tools regression', () => {
  const requestBodies: Array<Record<string, unknown>> = [];

  beforeAll(async () => {
    localStorage.clear();
    const html = readFileSync('sidepanel.html', 'utf8');
    const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '';
    document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/gi, '');
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/chat/completions')) {
        if (init?.body) requestBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return new Response('data: {"choices":[{"delta":{"content":"Hello from fake model"}}]}\n\ndata: [DONE]\n\n', {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }
      return new Response(JSON.stringify({ data: [{ id: 'fake-model' }] }), { status: 200 });
    }));
    // The legacy entry remains JavaScript while the new architecture migrates to TypeScript.
    // @ts-expect-error Vite test query intentionally imports the untyped legacy entry once.
    await import('../../script.js?legacy-regression');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('keeps contexts, chat streaming, language controls, toggles, and provider configuration usable', async () => {
    const addContext = document.getElementById('add-context-btn') as HTMLButtonElement;
    addContext.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelectorAll('.context-btn').length).toBeGreaterThan(0);

    const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
    const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
    if (!modelSelect.value && modelSelect.options.length > 1) {
      modelSelect.selectedIndex = 1;
      modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    chatInput.value = 'Hello';
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
    (document.getElementById('send-btn') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.getElementById('chat-container')?.textContent).toContain('Hello from fake model'));

    const contextButton = document.querySelector('.context-btn') as HTMLButtonElement;
    contextButton.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
    (document.querySelector('[data-action="edit"]') as HTMLElement).click();
    const contextName = document.getElementById('ctx-name') as HTMLInputElement;
    contextName.value = 'Regression context';
    (document.getElementById('save-context-config-btn') as HTMLButtonElement).click();

    const langBtn = document.getElementById('language-btn') as HTMLButtonElement;
    expect(langBtn.closest('#top-nav-bar')).not.toBeNull();
    expect(document.querySelector('#top-nav-bar #primary-tabs')).not.toBeNull();

    langBtn.click();
    expect(document.getElementById('language-modal')?.classList.contains('hidden')).toBe(false);
    (document.querySelector('[data-lang="en"]') as HTMLButtonElement).click();

    expect(document.querySelector('[data-primary-tab="writing"]')?.textContent).toBe('Writing Assistant');
    expect(document.querySelector('[data-primary-tab="tools"]')?.textContent).toBe('AI Tools');
    expect(document.getElementById('image-btn')?.title).toBe('Send image');

    langBtn.click();
    (document.querySelector('[data-lang="es"]') as HTMLButtonElement).click();
    expect(document.querySelector('[data-primary-tab="writing"]')?.textContent).toBe('Asistente de Escritura');
    expect(document.querySelector('[data-primary-tab="tools"]')?.textContent).toBe('Herramientas de IA');

    langBtn.click();
    (document.querySelector('[data-lang="en"]') as HTMLButtonElement).click();

    const moreButton = document.getElementById('more-btn') as HTMLButtonElement;
    moreButton.click();
    expect(document.getElementById('more-menu')?.classList.contains('hidden')).toBe(false);
    (document.getElementById('stats-toggle-btn') as HTMLButtonElement).click();
    moreButton.click();
    (document.getElementById('align-toggle-btn') as HTMLButtonElement).click();
    const thinkingButton = document.getElementById('thinking-toggle-btn') as HTMLButtonElement;
    thinkingButton.click();
    const thinkingMenu = document.getElementById('thinking-menu') as HTMLElement;
    expect(thinkingMenu.classList.contains('hidden')).toBe(false);
    (thinkingMenu.querySelector('[data-thinking-mode="deepseek-off"]') as HTMLButtonElement).click();
    expect(thinkingButton.textContent).toBe('DeepSeek off');
    expect(thinkingMenu.classList.contains('hidden')).toBe(true);

    chatInput.value = 'DeepSeek off';
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
    (document.getElementById('send-btn') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(requestBodies.at(-1)?.thinking).toEqual({ type: 'disabled' }));
    await vi.waitFor(() => expect((document.getElementById('send-btn') as HTMLButtonElement).title).toBe('Send'));

    thinkingButton.click();
    (thinkingMenu.querySelector('[data-thinking-mode="nvidia-off"]') as HTMLButtonElement).click();
    chatInput.value = 'NVIDIA off';
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
    (document.getElementById('send-btn') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(requestBodies.at(-1)?.chat_template_kwargs).toEqual({ enable_thinking: false }));

    moreButton.click();
    (document.getElementById('config-btn') as HTMLButtonElement).click();
    expect(document.getElementById('api-config-modal')?.classList.contains('hidden')).toBe(false);
    (document.getElementById('add-provider-btn') as HTMLButtonElement).click();
    const name = document.getElementById('p-edit-name') as HTMLInputElement;
    name.value = '<img src=x onerror=alert(1)>';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelector('#providers-list img')).toBeNull();
    expect(document.getElementById('p-edit-key')?.getAttribute('value')).toBe('');
    const fetchModels = document.getElementById('test-fetch-btn') as HTMLButtonElement | null;
    fetchModels?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.getElementById('model-selection-modal')?.classList.contains('hidden')).toBe(false);

    (document.getElementById('mic-btn') as HTMLButtonElement).click();
    expect(document.getElementById('speech-config-modal')?.classList.contains('hidden')).toBe(false);
  });
});
