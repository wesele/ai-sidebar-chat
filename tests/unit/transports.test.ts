import { describe, expect, it, vi } from 'vitest';
import { GeminiTransport } from '../../src/background/transports/gemini-transport';
import { OpenAITransport, type ProviderConfig, WRITING_REQUEST_TIMEOUT_MS } from '../../src/background/transports/openai-transport';

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
    expect(body.messages[0].content).toContain('character-for-character');
    expect(body.messages[0].content).toContain('written in Chinese');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.signal).not.toBe(controller.signal);
  });

  it('customizes prompt explanation language according to uiLanguage parameter', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const prompt = JSON.parse(init?.body as string).messages[0].content as string;
      const requestId = /"requestId":"(r\d*)"/.exec(prompt)?.[1] ?? 'r';
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ schemaVersion: '1', requestId, documentRevision: 1, units: [] }) } }],
      }), { status: 200 });
    });
    const transport = new OpenAITransport(provider, fetcher as typeof fetch);
    await transport.analyze({
      schemaVersion: '1', requestId: 'r', documentRevision: 1, targetLanguage: 'en', units: [],
    }, undefined, 'es');
    const [, init] = (fetcher.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>)[0];
    const body = JSON.parse(init?.body as string);
    expect(body.messages[0].content).toContain('written in Spanish');

    // Spanish target language test
    await transport.analyze({
      schemaVersion: '1', requestId: 'r2', documentRevision: 1, targetLanguage: 'ES', units: [],
    });
    const [, init2] = (fetcher.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>)[1];
    const body2 = JSON.parse(init2?.body as string);
    expect(body2.messages[0].content).toContain('as a Spanish writing tutor');

    // Chinese target language test
    await transport.analyze({
      schemaVersion: '1', requestId: 'r3', documentRevision: 1, targetLanguage: 'CN', units: [],
    });
    const [, init3] = (fetcher.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>)[2];
    const body3 = JSON.parse(init3?.body as string);
    expect(body3.messages[0].content).toContain('as a Chinese writing tutor');
  });

  it('uses guided JSON instead of optional tool calling when constrained decoding is enabled', async () => {
    const response = { schemaVersion: '1', requestId: 'tool', documentRevision: 1, units: [] };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(response) } }],
    }), { status: 200 }));
    const transport = new OpenAITransport(provider, fetcher as typeof fetch, false, true);
    await expect(transport.analyze({
      schemaVersion: '1', requestId: 'tool', documentRevision: 1, targetLanguage: 'EN', units: [],
    })).resolves.toEqual(response);
    const [, init] = (fetcher.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>)[0];
    const body = JSON.parse(init.body as string);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.guided_json).toMatchObject({ type: 'object', properties: expect.any(Object) });
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
    expect(body.thinking).toBeUndefined();
  });

  it.each([
    { disableThinking: false, constrainedDecoding: false },
    { disableThinking: true, constrainedDecoding: false },
    { disableThinking: false, constrainedDecoding: true },
    { disableThinking: true, constrainedDecoding: true },
  ])('sends the exact Qwen request flags for thinking=$disableThinking constrained=$constrainedDecoding', async ({ disableThinking, constrainedDecoding }) => {
    const response = { schemaVersion: '1', requestId: 'matrix', documentRevision: 1, units: [] };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(response) } }],
    }), { status: 200 }));
    const transport = new OpenAITransport({
      ...provider,
      modelId: 'ModelScope.Qwen/Qwen3.5-35B-A3B',
    }, fetcher as typeof fetch, disableThinking, constrainedDecoding);
    await transport.analyze({
      schemaVersion: '1', requestId: 'matrix', documentRevision: 1, targetLanguage: 'EN', units: [],
    });
    const [, init] = (fetcher.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>)[0];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('ModelScope.Qwen/Qwen3.5-35B-A3B');
    expect(body.max_tokens).toBe(16_000);
    expect(body.max_completion_tokens).toBe(16_000);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: !disableThinking });
    expect(body.guided_json).toEqual(constrainedDecoding ? expect.any(Object) : undefined);
  });

  it('aborts a request at the 60-second deadline and exposes TIMEOUT', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        if (init?.signal?.aborted) abort();
        else init?.signal?.addEventListener('abort', abort, { once: true });
      }));
      const transport = new OpenAITransport(provider, fetcher as typeof fetch);
      const pending = transport.analyze({
        schemaVersion: '1', requestId: 'timeout', documentRevision: 1, targetLanguage: 'EN', units: [],
      });
      const assertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
      await vi.advanceTimersByTimeAsync(WRITING_REQUEST_TIMEOUT_MS);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects an incomplete model envelope instead of synthesizing request metadata', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 }));
    const transport = new OpenAITransport(provider, fetcher as typeof fetch);
    await expect(transport.analyze({
      schemaVersion: '1', requestId: 'invalid', documentRevision: 1, targetLanguage: 'EN', units: [],
    })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('distinguishes a reasoning-only truncation from an empty provider response', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'unfinished thought' } }],
    }), { status: 200 }));
    const transport = new OpenAITransport(provider, fetcher as typeof fetch);
    await expect(transport.analyze({
      schemaVersion: '1', requestId: 'truncated', documentRevision: 1, targetLanguage: 'EN', units: [],
    })).rejects.toMatchObject({ code: 'MODEL_TRUNCATED' });
  });

  it('keeps thinking disabled only when requested with structured output enabled', async () => {
    const response = { schemaVersion: '1', requestId: 'thinking', documentRevision: 1, units: [] };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(response) } }],
    }), { status: 200 }));
    const transport = new OpenAITransport(provider, fetcher as typeof fetch, true, true);
    await transport.analyze({
      schemaVersion: '1', requestId: 'thinking', documentRevision: 1, targetLanguage: 'EN', units: [],
    });
    const [, init] = (fetcher.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>)[0];
    const body = JSON.parse(init.body as string);
    expect(body.chat_template_kwargs).toEqual(undefined);
    expect(body.thinking).toEqual({ type: 'disabled' });
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
    const [, init] = (fetcher.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>)[0];
    const body = JSON.parse(init.body as string);
    expect(body.messages[0].content).toContain('Do not return rewritten document text');
    await expect(transport.analyze({
      schemaVersion: '1', requestId: 'http', documentRevision: 1, targetLanguage: 'en', units: [],
    })).rejects.toMatchObject({ status: 503 });
    await expect(transport.analyze({
      schemaVersion: '1', requestId: 'json', documentRevision: 1, targetLanguage: 'en', units: [],
    })).rejects.toMatchObject({ code: 'EMPTY_RESPONSE' });
  });

  it('includes full-document envelope fields in constrained decoding schema', async () => {
    const request = {
      schemaVersion: '1' as const,
      requestId: 'full-envelope-id',
      documentRevision: 7,
      text: 'Document.',
    };
    const response = {
      schemaVersion: '1' as const,
      requestId: 'full-envelope-id',
      documentRevision: 7,
      severity: 'none' as const,
      summary: 'Clear.',
      suggestions: [],
    };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(response) } }],
    }), { status: 200 }));
    const transport = new OpenAITransport(provider, fetcher as typeof fetch, false, true);

    await expect(transport.full(request)).resolves.toEqual(response);
    const [, init] = (fetcher.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>)[0];
    const body = JSON.parse(init.body as string);
    expect(body.guided_json.properties.schemaVersion).toEqual({ type: 'string' });
    expect(body.guided_json.properties.requestId).toEqual({ type: 'string' });
    expect(body.guided_json.properties.documentRevision).toEqual({ type: 'number' });
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
      .contents[0].parts[0].text).toContain('Logical coherence');
    await expect(transport.analyze({
      schemaVersion: '1', requestId: 'http', documentRevision: 1, targetLanguage: 'en', units: [],
    })).rejects.toMatchObject({ status: 429 });
    await expect(transport.analyze({
      schemaVersion: '1', requestId: 'json', documentRevision: 1, targetLanguage: 'en', units: [],
    })).rejects.toMatchObject({ code: 'EMPTY_RESPONSE' });
  });

  it('uses a Gemini function call when structured output is enabled', async () => {
    const unit = { schemaVersion: '1', requestId: 'gemini-tool', documentRevision: 1, units: [] };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{
        functionCall: { name: 'report_writing_analysis', args: unit },
      }] } }],
    }), { status: 200 }));
    const transport = new GeminiTransport({ ...provider, kind: 'gemini' }, fetcher as typeof fetch, undefined, true);
    await expect(transport.analyze({
      schemaVersion: '1', requestId: 'gemini-tool', documentRevision: 1, targetLanguage: 'EN', units: [],
    })).resolves.toEqual(unit);
    const [, init] = (fetcher.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>)[0];
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig).toEqual({});
    expect(body.tools[0].functionDeclarations[0].name).toBe('report_writing_analysis');
    expect(body.toolConfig.functionCallingConfig).toEqual({
      mode: 'AUTO',
    });
  });

  it('sends a Gemini thinking budget only when thinking is disabled with structured output', async () => {
    const unit = { schemaVersion: '1', requestId: 'gemini-thinking', documentRevision: 1, units: [] };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ functionCall: { name: 'report_writing_analysis', args: unit } }] } }],
    }), { status: 200 }));
    const transport = new GeminiTransport({ ...provider, kind: 'gemini' }, fetcher as typeof fetch, true, true);
    await transport.analyze({
      schemaVersion: '1', requestId: 'gemini-thinking', documentRevision: 1, targetLanguage: 'EN', units: [],
    });
    const [, init] = (fetcher.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>)[0];
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig).toEqual({ thinkingConfig: { thinkingBudget: 0 } });
  });

  it('normalizes the flat tool shape into units with derived scope/severity', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: {
        tool_calls: [{
          type: 'function',
          function: { name: 'report_writing_analysis', arguments: JSON.stringify({
            schemaVersion: '1', requestId: 'norm', documentRevision: 3,
            issues: [
              { unitId: 'u1', original: 'Hiw', replacement: 'How', reason: 'typo', category: 'spelling' },
              { unitId: 'u1', original: 'the whole sentence', replacement: 'rewrite', reason: 'restructure', category: 'clarity' },
              { unitId: 'u2', original: 'I', replacement: 'i', reason: 'cap', category: 'grammar' },
            ],
          }) },
        }],
      } }],
    }), { status: 200 }));
    const transport = new OpenAITransport(provider, fetcher as typeof fetch, false, true);
    const request = {
      schemaVersion: '1' as const, requestId: 'norm', documentRevision: 3, targetLanguage: 'EN',
      units: [
        { unitId: 'u1', unitRevision: 1, unitType: 'sentence' as const, text: 'Hiw can I fix the whole sentence?', absoluteStart: 0, contextBefore: '', contextAfter: '' },
        { unitId: 'u2', unitRevision: 2, unitType: 'sentence' as const, text: 'I like you.', absoluteStart: 40, contextBefore: '', contextAfter: '' },
      ],
    };
    const result = await transport.analyze(request);
    expect(result.schemaVersion).toBe('1');
    expect(result.requestId).toBe('norm');
    expect(result.documentRevision).toBe(3);
    const u1 = result.units.find((u) => u.unitId === 'u1');
    expect(u1?.unitRevision).toBe(1);
    const typo = u1?.issues.find((i) => i.original === 'Hiw');
    expect(typo).toMatchObject({ scope: 'local', severity: 'problem', category: 'spelling', start: 0, end: 0 });
    const rewrite = u1?.issues.find((i) => i.original === 'the whole sentence');
    expect(rewrite?.scope).toBe('local'); // not the full unit text -> stays local
    const u2 = result.units.find((u) => u.unitId === 'u2');
    expect(u2?.unitRevision).toBe(2);
    expect(u2?.issues[0]).toMatchObject({ severity: 'problem', category: 'grammar' });
  });

  it('promotes a full-unit original to sentence scope during normalization', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        schemaVersion: '1', requestId: 'fullunit', documentRevision: 1,
        issues: [{ unitId: 'u1', original: 'Hiw can I tell you it is the frist.', replacement: 'How can I tell you it is the first.', reason: 'rewrite', category: 'grammar' }],
      }) } }],
    }), { status: 200 }));
    const transport = new OpenAITransport(provider, fetcher as typeof fetch);
    const request = {
      schemaVersion: '1' as const, requestId: 'fullunit', documentRevision: 1, targetLanguage: 'EN',
      units: [{ unitId: 'u1', unitRevision: 1, unitType: 'sentence' as const, text: 'Hiw can I tell you it is the frist.', absoluteStart: 0, contextBefore: '', contextAfter: '' }],
    };
    const result = await transport.analyze(request);
    const issue = result.units[0]?.issues[0];
    expect(issue?.scope).toBe('sentence');
    expect(issue?.severity).toBe('problem');
  });
});
