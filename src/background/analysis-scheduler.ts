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
    const completed = this.completedUnits.get(request.requestId) ?? new Set<string>();
    this.completedUnits.set(request.requestId, completed);
    const pendingUnits = request.units.filter((unit) => !completed.has(unit.unitId));

    if (settings.invocationStrategy === 'batch') {
      const batches: AnalysisRequest[] = [];
      let current = { ...request, units: [] as AnalysisRequest['units'] };
      let size = 0;
      for (const unit of pendingUnits) {
        if (current.units.length === 16 || size + unit.text.length > 12000) {
          batches.push(current);
          current = { ...request, units: [] };
          size = 0;
        }
        current.units.push(unit);
        size += unit.text.length;
      }
      if (current.units.length) batches.push(current);

      const result: AnalysisResponse[] = [];
      for (const batch of batches) {
        if (signal?.aborted || this.cancelled.has(request.requestId)) break;
        const response = await this.analyze(batch, signal);
        result.push(response);
        await report(response);
        for (const unit of batch.units) completed.add(unit.unitId);
      }
      return result;
    }

    const queue = [...pendingUnits];
    const result: AnalysisResponse[] = [];
    const workers = Array.from({
      length: Math.min(Math.max(1, Math.min(6, settings.maxConcurrency || 3)), queue.length),
    }, async () => {
      while (queue.length && !signal?.aborted && !this.cancelled.has(request.requestId)) {
        const unit = queue.shift()!;
        const response = await this.analyze({ ...request, units: [unit] }, signal);
        result.push(response);
        await report(response);
        completed.add(unit.unitId);
      }
    });
    await Promise.all(workers);
    return result;
  }

  async scheduleFull(request: FullDocumentRequest, limit: number, signal?: AbortSignal): Promise<FullDocumentResponse | undefined> {
    return request.text.length > limit || !this.analyzeFull || signal?.aborted || this.cancelled.has(request.requestId)
      ? undefined
      : this.analyzeFull(request, signal);
  }
}
