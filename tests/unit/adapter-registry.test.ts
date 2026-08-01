import { afterEach, describe, expect, it } from 'vitest';
import {
  deregisterSiteAdapter,
  registerSiteAdapter,
  registeredAdapterIds,
  resolveAdapter,
} from '../../src/content/adapters/adapter-registry';
import type { SiteAdapterFactory } from '../../src/content/adapters/adapter-registry';
import type { EditorAdapter } from '../../src/content/adapters/editor-adapter';

// Minimal stub that satisfies EditorAdapter
function stubAdapter(element: HTMLElement): EditorAdapter {
  return {
    kind: 'contenteditable',
    element,
    readSnapshot: () => { throw new Error('stub'); },
    getCaretGeometry: () => null,
    getRangeGeometry: () => [],
    replaceRanges: () => ({ applied: 0, skipped: 0 }),
    observe: () => () => undefined,
  };
}

function makeFactory(
  id: string,
  priority: number,
  match: (el: HTMLElement) => boolean,
): SiteAdapterFactory {
  return {
    id,
    priority,
    canHandle: match,
    create: (el, _editorId) => stubAdapter(el),
  };
}

describe('adapter-registry', () => {
  const ids: string[] = [];

  // Clean up any factories registered during tests
  afterEach(() => {
    for (const id of ids) deregisterSiteAdapter(id);
    ids.length = 0;
  });

  function register(factory: SiteAdapterFactory): void {
    ids.push(factory.id);
    registerSiteAdapter(factory);
  }

  it('returns undefined when no factory is registered', () => {
    const el = document.createElement('div');
    expect(resolveAdapter(el, 'e1')).toBeUndefined();
  });

  it('returns an adapter when a factory matches', () => {
    const el = document.createElement('div');
    el.classList.add('target');
    register(makeFactory('test-a', 0, (e) => e.classList.contains('target')));
    const adapter = resolveAdapter(el, 'e2');
    expect(adapter).toBeDefined();
    expect(adapter?.element).toBe(el);
  });

  it('returns undefined when the factory does not match', () => {
    const el = document.createElement('div');
    register(makeFactory('test-b', 0, () => false));
    expect(resolveAdapter(el, 'e3')).toBeUndefined();
  });

  it('selects the highest-priority matching factory', () => {
    const el = document.createElement('div');
    const lowFactory: SiteAdapterFactory = {
      id: 'low',
      priority: 1,
      canHandle: () => true,
      create: (e) => ({ ...stubAdapter(e), kind: 'textarea' as const }),
    };
    const highFactory: SiteAdapterFactory = {
      id: 'high',
      priority: 10,
      canHandle: () => true,
      create: (e) => ({ ...stubAdapter(e), kind: 'input' as const }),
    };
    ids.push('low', 'high');
    registerSiteAdapter(lowFactory);
    registerSiteAdapter(highFactory);

    const adapter = resolveAdapter(el, 'e4');
    expect(adapter?.kind).toBe('input');
  });

  it('skips a non-matching high-priority factory and falls through to a matching lower one', () => {
    const el = document.createElement('div');
    el.classList.add('special');
    register(makeFactory('high-nomatch', 20, () => false));
    register(makeFactory('low-match', 5, (e) => e.classList.contains('special')));

    const adapter = resolveAdapter(el, 'e5');
    expect(adapter).toBeDefined();
    expect(adapter?.element).toBe(el);
  });

  it('is idempotent — re-registering the same id is a no-op', () => {
    register(makeFactory('dupe', 0, () => true));
    const before = registeredAdapterIds().filter((id) => id === 'dupe').length;
    registerSiteAdapter(makeFactory('dupe', 0, () => true)); // duplicate, no push
    const after = registeredAdapterIds().filter((id) => id === 'dupe').length;
    expect(before).toBe(1);
    expect(after).toBe(1);
  });

  it('deregisters a factory by id', () => {
    registerSiteAdapter(makeFactory('removable', 0, () => true));
    expect(registeredAdapterIds()).toContain('removable');
    deregisterSiteAdapter('removable');
    expect(registeredAdapterIds()).not.toContain('removable');
  });

  it('passes editorId to factory.create', () => {
    const received: string[] = [];
    const factory: SiteAdapterFactory = {
      id: 'editorid-check',
      priority: 0,
      canHandle: () => true,
      create: (el, editorId) => { received.push(editorId); return stubAdapter(el); },
    };
    ids.push('editorid-check');
    registerSiteAdapter(factory);
    resolveAdapter(document.createElement('div'), 'my-editor-uuid');
    expect(received).toEqual(['my-editor-uuid']);
  });

  it('registeredAdapterIds returns ids in priority order (highest first)', () => {
    register(makeFactory('z-low', 1, () => false));
    register(makeFactory('a-high', 100, () => false));
    register(makeFactory('m-mid', 50, () => false));
    const ids = registeredAdapterIds();
    const aIdx = ids.indexOf('a-high');
    const mIdx = ids.indexOf('m-mid');
    const zIdx = ids.indexOf('z-low');
    expect(aIdx).toBeLessThan(mIdx);
    expect(mIdx).toBeLessThan(zIdx);
  });
});
