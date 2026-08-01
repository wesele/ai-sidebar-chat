import { describe, expect, it, vi } from 'vitest';
import { isEligibleEditor } from '../../src/content/sensitive-field-policy';
import { AnalysisScheduler } from '../../src/background/analysis-scheduler';
describe('policy and scheduler', () => {
  it('never reads sensitive inputs and only permits natural language input', () => { const password = document.createElement('input'); password.type = 'password'; Object.defineProperty(password, 'value', { get: () => { throw new Error('must not read sensitive value'); } }); const search = document.createElement('input'); search.type = 'search'; const text = document.createElement('input'); text.value = 'this is natural prose'; for (const el of [password, search, text]) vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 20 } as DOMRect); expect(isEligibleEditor(password)).toBe(false); expect(isEligibleEditor(search)).toBe(false); expect(isEligibleEditor(text)).toBe(true); });
  it('batches limits and enforces parallel concurrency', async () => { const call = vi.fn(async () => ({ schemaVersion: '1' as const, requestId: 'x', documentRevision: 1, units: [] })); const scheduler = new AnalysisScheduler(call); const units = Array.from({ length: 17 }, (_, i) => ({ unitId: String(i), unitRevision: 1, unitType: 'sentence' as const, text: 'x', absoluteStart: i })); await scheduler.schedule({ schemaVersion: '1', requestId: 'x', documentRevision: 1, targetLanguage: 'en', units }, { invocationStrategy: 'batch', maxConcurrency: 3 }); expect(call).toHaveBeenCalledTimes(2); });
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
