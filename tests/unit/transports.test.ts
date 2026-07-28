import { describe, expect, it, vi } from 'vitest';
import { GeminiTransport } from '../../src/background/transports/gemini-transport';
import { OpenAITransport, type ProviderConfig } from '../../src/background/transports/openai-transport';

const provider: ProviderConfig = {
  id: 'p', baseUrl: 'https://example.test/v1/', apiKey: 'secret', modelId: 'model/a', kind: 'openai',
};

describe('analysis transport', () => {
  it('sends explicit schema instructions and forwards AbortSignal', async () => {
    const response = {
      schemaVersion: '1', requestId: 'r', documentRevision: 1, units: [],
    };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(response) } }],
    }), { status: 200 }));
    const transport = new OpenAITransport(provider, fetcher as typeof fetch);
    const controller = new AbortController();
    await expect(transport.analyze({
      schemaVersion: '1', requestId: 'r', documentRevision: 1, targetLanguage: 'en', units: [],
    }, controller.signal)).resolves.toEqual(response);
    const [, init] = (fetcher.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>)[0];
    const body = JSON.parse(init?.body as string);
    expect(body.messages[0].content).toContain('scope');
    expect(body.messages[0].content).toContain('UTF-16');
    expect(init?.signal).toBe(controller.signal);
  });

  it('sends full-document prompts and surfaces OpenAI HTTP/JSON errors', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          schemaVersion: '1', requestId: 'full', documentRevision: 1,
          severity: 'none', summary: 'Clear.', suggestions: [],
        }) } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    const transport = new OpenAITransport(provider, fetcher as typeof fetch);
    await expect(transport.full({
      schemaVersion: '1', requestId: 'full', documentRevision: 1, text: 'Document.',
    })).resolves.toMatchObject({ requestId: 'full', summary: 'Clear.' });
    const body = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(body.messages[0].content).toContain('Do not return rewritten document text');
    await expect(transport.analyze({
      schemaVersion: '1', requestId: 'http', documentRevision: 1, targetLanguage: 'en', units: [],
    })).rejects.toMatchObject({ status: 503 });
    await expect(transport.analyze({
      schemaVersion: '1', requestId: 'json', documentRevision: 1, targetLanguage: 'en', units: [],
    })).rejects.toBeInstanceOf(SyntaxError);
  });

  it('supports Gemini unit/full requests, URL encoding, abort, and provider errors', async () => {
    const unit = { schemaVersion: '1', requestId: 'u', documentRevision: 1, units: [] };
    const full = {
      schemaVersion: '1', requestId: 'f', documentRevision: 1,
      severity: 'none', summary: 'Fine.', suggestions: [],
    };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(unit) }] } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(full) }] } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [] }), { status: 200 }));
    const transport = new GeminiTransport({ ...provider, kind: 'gemini' }, fetcher as typeof fetch);
    const controller = new AbortController();
    await expect(transport.analyze({
      schemaVersion: '1', requestId: 'u', documentRevision: 1, targetLanguage: 'en', units: [],
    }, controller.signal)).resolves.toEqual(unit);
    expect(String(fetcher.mock.calls[0][0])).toBe(
      'https://example.test/v1/models/model%2Fa:generateContent?key=secret',
    );
    expect(fetcher.mock.calls[0][1].signal).toBe(controller.signal);
    await expect(transport.full({
      schemaVersion: '1', requestId: 'f', documentRevision: 1, text: 'Document.',
    })).resolves.toEqual(full);
    expect(JSON.parse(fetcher.mock.calls[1][1].body as string)
      .contents[0].parts[0].text).toContain('overall coherence');
    await expect(transport.analyze({
      schemaVersion: '1', requestId: 'http', documentRevision: 1, targetLanguage: 'en', units: [],
    })).rejects.toMatchObject({ status: 429 });
    await expect(transport.analyze({
      schemaVersion: '1', requestId: 'json', documentRevision: 1, targetLanguage: 'en', units: [],
    })).rejects.toBeInstanceOf(SyntaxError);
  });
});
