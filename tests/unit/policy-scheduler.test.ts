import { describe, expect, it, vi } from 'vitest';
import { isEligibleEditor } from '../../src/content/sensitive-field-policy';
import { AnalysisScheduler } from '../../src/background/analysis-scheduler';
describe('policy and scheduler', () => {
  it('never reads sensitive inputs and only permits natural language input', () => { const password = document.createElement('input'); password.type = 'password'; Object.defineProperty(password, 'value', { get: () => { throw new Error('must not read sensitive value'); } }); const search = document.createElement('input'); search.type = 'search'; const text = document.createElement('input'); text.value = 'this is natural prose'; for (const el of [password, search, text]) vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 20 } as DOMRect); expect(isEligibleEditor(password)).toBe(false); expect(isEligibleEditor(search)).toBe(false); expect(isEligibleEditor(text)).toBe(true); });
  it('batches limits and enforces parallel concurrency', async () => { const call = vi.fn(async () => ({ schemaVersion: '1' as const, requestId: 'x', documentRevision: 1, units: [] })); const scheduler = new AnalysisScheduler(call); const units = Array.from({ length: 17 }, (_, i) => ({ unitId: String(i), unitRevision: 1, unitType: 'sentence' as const, text: 'x', absoluteStart: i })); await scheduler.schedule({ schemaVersion: '1', requestId: 'x', documentRevision: 1, targetLanguage: 'en', units }, { invocationStrategy: 'batch', maxConcurrency: 3 }); expect(call).toHaveBeenCalledTimes(2); });
  it('includes context in batch limits and completes omitted units as clean', async () => {
    const call = vi.fn(async (request) => ({
      schemaVersion: '1' as const,
      requestId: request.requestId,
      documentRevision: request.documentRevision,
      units: request.units.slice(0, 1).map((unit: { unitId: string; unitRevision: number }) => ({
        unitId: unit.unitId,
        unitRevision: unit.unitRevision,
        issues: [],
      })),
    }));
    const scheduler = new AnalysisScheduler(call);
    const units = [
      { unitId: 'large', unitRevision: 1, unitType: 'sentence' as const, text: 'x'.repeat(12_001), absoluteStart: 0 },
      { unitId: 'context', unitRevision: 1, unitType: 'sentence' as const, text: 'x', absoluteStart: 1, contextBefore: 'x'.repeat(12_000) },
    ];
    const reported: string[][] = [];
    await scheduler.schedule(
      { schemaVersion: '1', requestId: 'sized', documentRevision: 1, targetLanguage: 'en', units },
      { invocationStrategy: 'batch', maxConcurrency: 3 },
      undefined,
      response => { reported.push(response.units.map((unit) => unit.unitId)); },
    );

    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls.every(([request]) => request.units.length > 0)).toBe(true);
    expect(reported).toEqual([['large'], ['context']]);
  });
  it('drops per-request bookkeeping after success but resumes reported units on retry', async () => {
    const unit = (id: string) => ({ unitId: id, unitRevision: 1, unitType: 'sentence' as const, text: 'x', absoluteStart: 0 });
    const responseFor = (request: { units: Array<{ unitId: string; unitRevision: number }> }) => ({
      schemaVersion: '1' as const,
      requestId: 'resume',
      documentRevision: 1,
      units: request.units.map((u) => ({ unitId: u.unitId, unitRevision: u.unitRevision, issues: [] })),
    });
    // First attempt: first batch succeeds, second batch fails retryably.
    let attempts = 0;
    const flaky = vi.fn(async (request: { units: Array<{ unitId: string }> }) => {
      attempts += 1;
      if (attempts === 2) throw Object.assign(new Error('busy'), { status: 429 });
      return responseFor(request as { units: Array<{ unitId: string; unitRevision: number }> });
    });
    const scheduler = new AnalysisScheduler(flaky);
    const reported: string[][] = [];
    const request = {
      schemaVersion: '1' as const, requestId: 'resume', documentRevision: 1, targetLanguage: 'en',
      units: Array.from({ length: 20 }, (_, i) => unit(String(i))),
    };
    // 20 units -> batches of 16 + 4. Batch 1 reported, batch 2 throws.
    await expect(scheduler.schedule(request, { invocationStrategy: 'batch', maxConcurrency: 3 },
      undefined, (r) => { reported.push(r.units.map((u) => u.unitId)); })).rejects.toMatchObject({ status: 429 });
    expect(reported).toHaveLength(1);
    expect(reported[0]).toHaveLength(16);
    // Retry with the same requestId resumes after the reported units instead
    // of re-analyzing (and re-reporting) them.
    flaky.mockClear();
    reported.length = 0;
    const resumed = await scheduler.schedule(request, { invocationStrategy: 'batch', maxConcurrency: 3 },
      undefined, (r) => { reported.push(r.units.map((u) => u.unitId)); });
    expect(flaky).toHaveBeenCalledTimes(1);
    expect(flaky.mock.calls[0][0].units.map((u: { unitId: string }) => u.unitId))
      .toEqual(['16', '17', '18', '19']);
    expect(resumed).toHaveLength(1);
    // After success no per-request state is retained (no unbounded growth).
    const internals = scheduler as unknown as { completedUnits: Map<string, unknown>; cancelled: Set<string> };
    expect(internals.completedUnits.size).toBe(0);
    expect(internals.cancelled.size).toBe(0);
  });
  it('reports parallel responses before the full schedule completes', async () => {
    const completed: string[] = [];
    let releaseSecond: (() => void) | undefined;
    const second = new Promise<void>((resolve) => { releaseSecond = resolve; });
    const call = vi.fn(async (request) => {
      if (request.units[0].unitId === 'second') await second;
      return {
        schemaVersion: '1' as const,
        requestId: 'x',
        documentRevision: 1,
        units: [{ unitId: request.units[0].unitId, unitRevision: 1, issues: [] }],
      };
    });
    const scheduler = new AnalysisScheduler(call);
    const schedule = scheduler.schedule(
      {
        schemaVersion: '1',
        requestId: 'x',
        documentRevision: 1,
        targetLanguage: 'en',
        units: [
          { unitId: 'first', unitRevision: 1, unitType: 'sentence' as const, text: 'x', absoluteStart: 0 },
          { unitId: 'second', unitRevision: 1, unitType: 'sentence' as const, text: 'x', absoluteStart: 1 },
        ],
      },
      { invocationStrategy: 'parallel', maxConcurrency: 2 },
      undefined,
      (response) => { completed.push(response.units[0].unitId); },
    );

    await vi.waitFor(() => expect(completed).toEqual(['first']));
    expect(completed).toHaveLength(1);
    releaseSecond?.();
    await schedule;
    expect(completed).toEqual(['first', 'second']);
  });
});
