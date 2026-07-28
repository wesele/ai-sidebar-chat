export class RequestRegistry {
 private readonly controllers = new Map<string, AbortController>();
 begin(id: string): AbortSignal { this.cancel(id); const controller = new AbortController(); this.controllers.set(id, controller); return controller.signal; }
 cancel(id: string): void { this.controllers.get(id)?.abort(); this.controllers.delete(id); }
 complete(id: string): void { this.controllers.delete(id); }
 async retry<T>(id: string, run: (signal: AbortSignal) => Promise<T>, delay: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): Promise<T> { const signal = this.begin(id); let last: unknown; for (let attempt = 0; attempt < 3; attempt += 1) try { return await run(signal); } catch (error) { last = error; const status = (error as { status?: number }).status; if (signal.aborted || status === 401 || status === 403 || (status !== undefined && status < 500 && status !== 429) || attempt === 2) throw error; await delay(100 * 2 ** attempt); } finally { if (attempt === 2) this.complete(id); } throw last; }
}
