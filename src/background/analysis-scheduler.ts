import type { AnalysisRequest, AnalysisResponse, FullDocumentRequest, FullDocumentResponse } from '../shared/schemas';

export interface SchedulerSettings { invocationStrategy: 'batch' | 'parallel'; maxConcurrency: number; }
export type Analyze = (request: AnalysisRequest, signal?: AbortSignal) => Promise<AnalysisResponse>;
export type AnalysisResponseHandler = (response: AnalysisResponse) => void | Promise<void>;

export class AnalysisScheduler {
  private readonly cancelled = new Set<string>();
  private readonly completedUnits = new Map<string, Set<string>>();

  constructor(
    private readonly analyze: Analyze,
    private readonly analyzeFull?: (request: FullDocumentRequest, signal?: AbortSignal) => Promise<FullDocumentResponse>,
  ) {}

  cancel(id: string) { this.cancelled.add(id); }

  async schedule(
    request: AnalysisRequest,
    settings: SchedulerSettings,
    signal?: AbortSignal,
    onResponse?: AnalysisResponseHandler,
  ): Promise<AnalysisResponse[]> {
    const report = async (response: AnalysisResponse): Promise<void> => {
      await onResponse?.(response);
    };
    const withMissingUnits = (response: AnalysisResponse, units: AnalysisRequest['units']): AnalysisResponse => {
      const returned = new Set(response.units.map((unit) => unit.unitId));
      const missing = units
        .filter((unit) => !returned.has(unit.unitId))
        .map((unit) => ({ unitId: unit.unitId, unitRevision: unit.unitRevision, issues: [] }));
      return missing.length ? { ...response, units: [...response.units, ...missing] } : response;
    };
    const completed = this.completedUnits.get(request.requestId) ?? new Set<string>();
    this.completedUnits.set(request.requestId, completed);
    const pendingUnits = request.units.filter((unit) => !completed.has(unit.unitId));

    // The per-request bookkeeping below is only needed while this schedule is
    // in flight: on success the request will never be retried, so both maps
    // are dropped to avoid leaking one entry per analysis round. On failure
    // the completed-unit set is intentionally KEPT so RequestRegistry.retry
    // resumes from already-reported units instead of redoing (and re-reporting)
    // them.
    const finish = (): void => {
      this.completedUnits.delete(request.requestId);
      this.cancelled.delete(request.requestId);
    };

    if (settings.invocationStrategy === 'batch') {
      const batches: AnalysisRequest[] = [];
      let current = { ...request, units: [] as AnalysisRequest['units'] };
      let size = 0;
      for (const unit of pendingUnits) {
        const unitSize = unit.text.length + (unit.contextBefore?.length ?? 0) + (unit.contextAfter?.length ?? 0);
        if (current.units.length > 0 && (current.units.length === 16 || size + unitSize > 12000)) {
          batches.push(current);
          current = { ...request, units: [] };
          size = 0;
        }
        current.units.push(unit);
        size += unitSize;
      }
      if (current.units.length) batches.push(current);

      const result: AnalysisResponse[] = [];
      for (const batch of batches) {
        if (signal?.aborted || this.cancelled.has(request.requestId)) break;
        const response = withMissingUnits(await this.analyze(batch, signal), batch.units);
        result.push(response);
        await report(response);
        for (const unit of batch.units) completed.add(unit.unitId);
      }
      finish();
      return result;
    }

    const queue = [...pendingUnits];
    const result: AnalysisResponse[] = [];
    const workers = Array.from({
      length: Math.min(Math.max(1, Math.min(6, settings.maxConcurrency || 3)), queue.length),
    }, async () => {
      while (queue.length && !signal?.aborted && !this.cancelled.has(request.requestId)) {
        const unit = queue.shift()!;
        const response = withMissingUnits(await this.analyze({ ...request, units: [unit] }, signal), [unit]);
        result.push(response);
        await report(response);
        completed.add(unit.unitId);
      }
    });
    await Promise.all(workers);
    finish();
    return result;
  }

  async scheduleFull(request: FullDocumentRequest, limit: number, signal?: AbortSignal): Promise<FullDocumentResponse | undefined> {
    return request.text.length > limit || !this.analyzeFull || signal?.aborted || this.cancelled.has(request.requestId)
      ? undefined
      : this.analyzeFull(request, signal);
  }
}
