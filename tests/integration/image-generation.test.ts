import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';

describe('image generation API integration', () => {
  const imageRequests: Array<{ url: string; body: Record<string, unknown> }> = [];

  beforeAll(async () => {
    localStorage.clear();
    const html = readFileSync('sidepanel.html', 'utf8');
    const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '';
    document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/gi, '');
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('confirm', vi.fn(() => true));

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/images/generations')) {
        const bodyObj = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
        imageRequests.push({ url, body: bodyObj });
        return new Response(JSON.stringify({
          created: Date.now(),
          data: [
            { url: 'https://example.com/generated-cat.png' }
          ]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/chat/completions')) {
        return new Response('data: {"choices":[{"delta":{"content":"chat reply"}}]}\n\ndata: [DONE]\n\n', {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }
      return new Response(JSON.stringify({ data: [{ id: 'fake-model' }] }), { status: 200 });
    }));

    // @ts-expect-error Vite test query intentionally imports the untyped legacy entry
    await import('../../script.js?image-generation-test');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('calls /images/generations and renders image card when image model is selected', async () => {
    // Open API config modal
    const apiConfigBtn = document.getElementById('api-config-btn') as HTMLButtonElement;
    apiConfigBtn.click();

    // Add dall-e-3 model to current provider
    const addModelInput = document.getElementById('p-add-model-input') as HTMLInputElement;
    const addModelBtn = document.getElementById('add-model-btn') as HTMLButtonElement;
    addModelInput.value = 'dall-e-3';
    addModelBtn.click();

    // Verify model list shows 'image' type for dall-e-3
    const typeSelect = document.querySelector('.model-type-select[data-model="dall-e-3"]') as HTMLSelectElement;
    expect(typeSelect).not.toBeNull();
    expect(typeSelect.value).toBe('image');

    // Save API config
    const saveApiBtn = document.getElementById('save-api-config-btn') as HTMLButtonElement;
    saveApiBtn.click();

    // Switch model select to dall-e-3
    const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
    await vi.waitFor(() => {
      const dalleOpt = Array.from(modelSelect.options).find(opt => opt.value.includes('dall-e-3'));
      expect(dalleOpt).toBeDefined();
      if (dalleOpt) {
        modelSelect.value = dalleOpt.value;
        modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // Input prompt and send
    const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
    chatInput.value = 'A cute cyberpunk kitten';
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));

    const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
    sendBtn.click();

    // Wait for the image generation request and response
    await vi.waitFor(() => expect(imageRequests.length).toBe(1));
    expect(imageRequests[0].url).toContain('/images/generations');
    expect(imageRequests[0].body.model).toBe('dall-e-3');
    expect(imageRequests[0].body.prompt).toBe('A cute cyberpunk kitten');

    // Verify image rendered in chat container
    await vi.waitFor(() => {
      const generatedImg = document.querySelector('.generated-image') as HTMLImageElement;
      expect(generatedImg).not.toBeNull();
      expect(generatedImg.src).toBe('https://example.com/generated-cat.png');
    });

    // Verify download link exists
    const downloadLink = document.querySelector('.image-download-btn') as HTMLAnchorElement;
    expect(downloadLink).not.toBeNull();
    expect(downloadLink.href).toBe('https://example.com/generated-cat.png');
  });
});
