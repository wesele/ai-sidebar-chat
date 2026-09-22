export class RequestRegistry {
 private readonly controllers = new Map<string, { controller: AbortController; owner?: RequestOwner; lease: number }>();
 private nextLease = 0;
 begin(id: string, owner?: RequestOwner): AbortSignal {
  this.cancel(id);
  const controller = new AbortController();
  this.controllers.set(id, { controller, owner, lease: ++this.nextLease });
  return controller.signal;
 }
 cancel(id: string, owner?: RequestOwner): void {
  const entry = this.controllers.get(id);
  if (!entry || (owner && !sameOwner(entry.owner, owner))) return;
  entry.controller.abort();
  this.controllers.delete(id);
 }
 cancelForTab(tabId: number): void {
  for (const [id, entry] of this.controllers) {
   if (entry.owner?.tabId === tabId) this.cancel(id);
  }
 }
 active(id: string, owner?: RequestOwner, lease?: number): boolean {
  const entry = this.controllers.get(id);
  return Boolean(
   entry &&
   !entry.controller.signal.aborted &&
   (!owner || sameOwner(entry.owner, owner)) &&
   (lease === undefined || entry.lease === lease),
  );
 }
 complete(id: string, owner?: RequestOwner, lease?: number): void {
  if (this.active(id, owner, lease)) this.controllers.delete(id);
 }
 async retry<T>(id: string, run: (signal: AbortSignal, lease: number) => Promise<T>, delay: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)), owner?: RequestOwner): Promise<T> {
  const signal = this.begin(id, owner);
  const lease = this.controllers.get(id)!.lease;
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
   try {
    return await run(signal, lease);
   } catch (error) {
    last = error;
    const status = (error as { status?: number }).status;
    const code = (error as { code?: string }).code;
    const retryable = code === 'NETWORK' || status === 429 || (status !== undefined && status >= 500);
    if (signal.aborted || !retryable || attempt === 2) throw error;
    await delay(100 * 2 ** attempt);
   }
  }
  throw last;
 }
}

export interface RequestOwner { tabId: number; frameId: number; }

function sameOwner(left: RequestOwner | undefined, right: RequestOwner): boolean {
 return left?.tabId === right.tabId && left.frameId === right.frameId;
}
