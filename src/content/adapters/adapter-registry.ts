import type { EditorAdapter } from './editor-adapter';

/**
 * Factory descriptor registered by a site-specific adapter module.
 *
 * Site adapters live in dedicated files and self-register by calling
 * `registerSiteAdapter()` as a side-effect of being imported.
 * The content-script entry point (`content/index.ts`) imports them
 * explicitly so tree-shaking keeps only the adapters actually bundled.
 *
 * Invariants:
 *  - `canHandle` must be synchronous and cheap (no layout thrash, no async).
 *  - `create` is called only when `canHandle` returned true.
 *  - `editorId` supplied to `create` is globally unique (UUID-based).
 */
export interface SiteAdapterFactory {
  /** Human-readable identifier used in debug logs. */
  readonly id: string;

  /**
   * Matching priority. Higher value wins when multiple factories
   * would match the same element.  Defaults to 0.
   */
  readonly priority: number;

  /**
   * Return true if this factory should own the given element.
   * Must not mutate the DOM, trigger layout, or perform async work.
   */
  canHandle(element: HTMLElement): boolean;

  /**
   * Create and return an adapter for an element that passed `canHandle`.
   * The returned adapter must fully implement `EditorAdapter`.
   */
  create(element: HTMLElement, editorId: string): EditorAdapter;
}

/** Sorted (descending priority) list of registered factories. */
const factories: SiteAdapterFactory[] = [];

/**
 * Register a site adapter factory.
 * Call this as a module-level side-effect inside adapter files.
 * Re-registering the same id is a no-op (idempotent for hot-reload safety).
 */
export function registerSiteAdapter(factory: SiteAdapterFactory): void {
  if (factories.some((f) => f.id === factory.id)) return;
  factories.push(factory);
  factories.sort((a, b) => b.priority - a.priority);
}

/**
 * Deregister a factory by id.
 * Primarily used in unit tests to restore a clean registry state.
 */
export function deregisterSiteAdapter(id: string): void {
  const idx = factories.findIndex((f) => f.id === id);
  if (idx !== -1) factories.splice(idx, 1);
}

/**
 * Find the highest-priority factory that can handle `element` and return
 * the adapter it creates.  Returns `undefined` when no factory matches,
 * signalling the caller to fall back to the generic adapters.
 */
export function resolveAdapter(
  element: HTMLElement,
  editorId: string,
): EditorAdapter | undefined {
  for (const factory of factories) {
    if (factory.canHandle(element)) {
      return factory.create(element, editorId);
    }
  }
  return undefined;
}

/** Return a snapshot of all registered factory ids (for diagnostics). */
export function registeredAdapterIds(): readonly string[] {
  return factories.map((f) => f.id);
}
