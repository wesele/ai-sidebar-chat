export class RequestRegistry {
 private readonly controllers = new Map<string, AbortController>();
 begin(id: string): AbortSignal { this.cancel(id); const controller = new AbortController(); this.controllers.set(id, controller); return controller.signal; }
 cancel(id: string): void { this.controllers.get(id)?.abort(); this.controllers.delete(id); }
 complete(id: string): void { this.controllers.delete(id); }
 async retry<T>(id: string, run: (signal: AbortSignal) => Promise<T>, delay: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): Promise<T> { const signal = this.begin(id); let last: unknown; for (let attempt = 0; attempt < 3; attempt += 1) try { return await run(signal); } catch (error) { last = error; const status = (error as { status?: number }).status; const code = (error as { code?: string }).code; const retryable = code === 'NETWORK' || status === 429 || (status !== undefined && status >= 500); if (signal.aborted || !retryable || attempt === 2) throw error; await delay(100 * 2 ** attempt); } finally { if (attempt === 2) this.complete(id); } throw last; }
}
