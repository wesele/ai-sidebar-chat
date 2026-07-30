import { afterEach, describe, expect, it, vi } from 'vitest';
// Import everything from the same module so all names share one module instance.
import {
  ProseMirrorAdapter,
  isConfluenceEditorElement,
  resolveProseMirrorRoot,
} from '../../src/content/adapters/prosemirror-adapter';
// The registry import must come from the SAME module instance that
// prosemirror-adapter.ts writes into (they share the same module graph
// because we import from the exact same specifier).
import { resolveAdapter } from '../../src/content/adapters/adapter-registry';

// ---------------------------------------------------------------------------
// Helper: build a minimal .ProseMirror contenteditable DOM structure
// ---------------------------------------------------------------------------

function buildPMElement(innerHTML = '<p>Hello world</p>'): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'ProseMirror';
  el.contentEditable = 'true';
  el.innerHTML = innerHTML;
  document.body.append(el);
  return el;
}

function cleanup(el: HTMLElement): void {
  el.remove();
}

// ---------------------------------------------------------------------------
// Helper: attach a mock ProseMirror view to a DOM element
// ---------------------------------------------------------------------------

interface MockTransaction {
  ops: Array<{ type: 'replaceWith' | 'delete'; from: number; to: number; text?: string }>;
  replaceWith(from: number, to: number, node: unknown): MockTransaction;
  delete(from: number, to: number): MockTransaction;
  scrollIntoView(): MockTransaction;
}

function attachMockView(
  element: HTMLElement,
  options: { posAtDOM?: (node: Node, offset: number) => number } = {},
): { dispatched: MockTransaction | null; view: unknown } {
  let dispatched: MockTransaction | null = null;

  const makeTr = (): MockTransaction => {
    const ops: MockTransaction['ops'] = [];
    const tr: MockTransaction = {
      ops,
      replaceWith(from, to, node: unknown) {
        ops.push({ type: 'replaceWith', from, to, text: (node as any)?.textContent ?? '' });
        return tr;
      },
      delete(from, to) {
        ops.push({ type: 'delete', from, to });
        return tr;
      },
      scrollIntoView() { return tr; },
    };
    return tr;
  };

  const view = {
    state: {
      tr: makeTr(),
      schema: {
        text: (t: string) => ({ textContent: t }),
      },
    },
    dispatch(tr: MockTransaction) {
      dispatched = tr;
    },
    posAtDOM: options.posAtDOM ?? ((_node: Node, _offset: number) => 0),
  };

  (element as any).pmViewDesc = { view };
  return { get dispatched() { return dispatched; }, view };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProseMirrorAdapter', () => {
  afterEach(() => {
    // Remove any leftover DOM nodes
    document.querySelectorAll('.ProseMirror').forEach((n) => n.remove());
  });

  // -------------------------------------------------------------------------
  // kind & delegation
  // -------------------------------------------------------------------------

  it('has kind "contenteditable"', () => {
    const el = buildPMElement();
    const adapter = new ProseMirrorAdapter(el, 'e1');
    expect(adapter.kind).toBe('contenteditable');
    cleanup(el);
  });

  it('exposes the underlying element', () => {
    const el = buildPMElement();
    const adapter = new ProseMirrorAdapter(el, 'e1');
    expect(adapter.element).toBe(el);
    cleanup(el);
  });

  it('readSnapshot returns a snapshot with the element text', () => {
    const el = buildPMElement('<p>Test text here.</p>');
    const adapter = new ProseMirrorAdapter(el, 'e1');
    const snap = adapter.readSnapshot();
    expect(snap.text).toContain('Test text here.');
    cleanup(el);
  });

  it('getCaretGeometry returns null when no selection exists', () => {
    const el = buildPMElement();
    const adapter = new ProseMirrorAdapter(el, 'e1');
    window.getSelection()?.removeAllRanges();
    expect(adapter.getCaretGeometry()).toBeNull();
    cleanup(el);
  });

  it('getRangeGeometry returns an array (may be empty in jsdom)', () => {
    const el = buildPMElement('<p>Some text</p>');
    const adapter = new ProseMirrorAdapter(el, 'e1');

    // jsdom does not implement Range.getClientRects — stub it to return an empty DOMRectList
    const origCreate = document.createRange.bind(document);
    vi.spyOn(document, 'createRange').mockImplementation(() => {
      const r = origCreate();
      r.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
      return r;
    });

    const rects = adapter.getRangeGeometry({ start: 0, end: 4 });
    expect(Array.isArray(rects)).toBe(true);
    vi.restoreAllMocks();
    cleanup(el);
  });

  it('observe attaches an input listener and returns a dispose function', () => {
    const el = buildPMElement();
    const adapter = new ProseMirrorAdapter(el, 'e1');
    const cb = vi.fn();
    const dispose = adapter.observe(cb);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cb).toHaveBeenCalledTimes(1);
    dispose();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cb).toHaveBeenCalledTimes(1); // no second call after dispose
    cleanup(el);
  });

  // -------------------------------------------------------------------------
  // replaceRanges — path 1: execCommand (ContentEditableAdapter delegate)
  // -------------------------------------------------------------------------

  it('returns {applied:0, skipped:0} for an empty replacements array', () => {
    const el = buildPMElement();
    const adapter = new ProseMirrorAdapter(el, 'e1');
    expect(adapter.replaceRanges([])).toEqual({ applied: 0, skipped: 0 });
    cleanup(el);
  });

  it('applies a single replacement via execCommand when beforeinput is not cancelled', () => {
    const el = buildPMElement('<p>bad text</p>');
    document.body.append(el);
    const adapter = new ProseMirrorAdapter(el, 'e1');

    Object.assign(document, {
      execCommand: vi.fn((_name: string, _ui: boolean, value: string) => {
        // Simulate execCommand applying the change
        el.textContent = value;
        return true;
      }),
    });

    const result = adapter.replaceRanges([
      { start: 0, end: 3, original: 'bad', replacement: 'good' },
    ]);
    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);
    cleanup(el);
  });

  it('falls back to ProseMirror view when beforeinput is cancelled', () => {
    const el = buildPMElement('<p>bad text</p>');
    const adapter = new ProseMirrorAdapter(el, 'e1');

    // Cancel beforeinput so execCommand path returns {applied:0}
    el.addEventListener('beforeinput', (e) => e.preventDefault());

    // Attach mock ProseMirror view
    let posCallCount = 0;
    const mock = attachMockView(el, {
      posAtDOM: () => { posCallCount++; return posCallCount; },
    });

    const result = adapter.replaceRanges([
      { start: 0, end: 3, original: 'bad', replacement: 'good' },
    ]);

    // ProseMirror dispatch should have been called
    expect(mock.dispatched).not.toBeNull();
    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);
    cleanup(el);
  });

  it('safe-fails when no ProseMirror view is available and beforeinput is cancelled', () => {
    const el = buildPMElement('<p>bad text</p>');
    const adapter = new ProseMirrorAdapter(el, 'e1');

    el.addEventListener('beforeinput', (e) => e.preventDefault());
    // No pmViewDesc attached

    const result = adapter.replaceRanges([
      { start: 0, end: 3, original: 'bad', replacement: 'good' },
    ]);

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    cleanup(el);
  });

  it('skips a stale replacement (original text does not match) in PM view path', () => {
    const el = buildPMElement('<p>good text</p>');
    const adapter = new ProseMirrorAdapter(el, 'e1');

    el.addEventListener('beforeinput', (e) => e.preventDefault());
    attachMockView(el);

    const result = adapter.replaceRanges([
      { start: 0, end: 3, original: 'bad', replacement: 'great' }, // "bad" !== "goo"
    ]);

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    cleanup(el);
  });
});

// ---------------------------------------------------------------------------
// Confluence detection logic (isConfluenceEditorElement / resolveProseMirrorRoot)
// Tests the canHandle and root-resolution logic exported from the module.
// This avoids cross-module registry isolation issues in vitest.
// ---------------------------------------------------------------------------

describe('isConfluenceEditorElement', () => {
  afterEach(() => {
    document.querySelectorAll('[contenteditable],.ProseMirror,[data-editor-type],[data-testid]')
      .forEach((n) => n.remove());
  });

  it('returns true for .ProseMirror[contenteditable]', () => {
    const el = document.createElement('div');
    el.className = 'ProseMirror';
    el.contentEditable = 'true';
    document.body.append(el);
    expect(isConfluenceEditorElement(el)).toBe(true);
    el.remove();
  });

  it('returns true for a contenteditable child of .ProseMirror', () => {
    const root = document.createElement('div');
    root.className = 'ProseMirror';
    const child = document.createElement('p');
    child.contentEditable = 'true';
    root.append(child);
    document.body.append(root);
    expect(isConfluenceEditorElement(child)).toBe(true);
    root.remove();
  });

  it('returns true for [data-editor-type][contenteditable]', () => {
    const el = document.createElement('div');
    el.setAttribute('data-editor-type', 'full-page');
    el.contentEditable = 'true';
    document.body.append(el);
    expect(isConfluenceEditorElement(el)).toBe(true);
    el.remove();
  });

  it('returns true for contenteditable inside [data-testid="ak-editor-fp-content-area"]', () => {
    const container = document.createElement('div');
    container.setAttribute('data-testid', 'ak-editor-fp-content-area');
    const inner = document.createElement('div');
    inner.contentEditable = 'true';
    container.append(inner);
    document.body.append(container);
    expect(isConfluenceEditorElement(inner)).toBe(true);
    container.remove();
  });

  it('returns false for a plain contenteditable div with no Confluence markers', () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    document.body.append(el);
    expect(isConfluenceEditorElement(el)).toBe(false);
    el.remove();
  });

  it('returns false for a non-contenteditable .ProseMirror element', () => {
    const el = document.createElement('div');
    el.className = 'ProseMirror';
    // contentEditable NOT set
    document.body.append(el);
    expect(isConfluenceEditorElement(el)).toBe(false);
    el.remove();
  });
});

describe('resolveProseMirrorRoot', () => {
  it('returns the element itself when it is .ProseMirror', () => {
    const el = document.createElement('div');
    el.className = 'ProseMirror';
    document.body.append(el);
    expect(resolveProseMirrorRoot(el)).toBe(el);
    el.remove();
  });

  it('walks up to the .ProseMirror ancestor when called with a child', () => {
    const root = document.createElement('div');
    root.className = 'ProseMirror';
    const child = document.createElement('p');
    root.append(child);
    document.body.append(root);
    expect(resolveProseMirrorRoot(child)).toBe(root);
    root.remove();
  });

  it('returns the element itself when there is no .ProseMirror ancestor', () => {
    const el = document.createElement('div');
    document.body.append(el);
    expect(resolveProseMirrorRoot(el)).toBe(el);
    el.remove();
  });
});

describe('Confluence site adapter factory wires canHandle → ProseMirrorAdapter', () => {
  it('resolveAdapter returns a ProseMirrorAdapter for a .ProseMirror element', () => {
    // Both prosemirror-adapter and adapter-registry are imported at the top of
    // this file from the same module graph, so registerSiteAdapter() and
    // resolveAdapter() share the same registry array.
    const el = document.createElement('div');
    el.className = 'ProseMirror';
    el.contentEditable = 'true';
    document.body.append(el);

    const adapter = resolveAdapter(el, 'e-pm');
    expect(adapter).toBeInstanceOf(ProseMirrorAdapter);
    el.remove();
  });

  it('resolveAdapter returns undefined for a plain div[contenteditable]', () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    document.body.append(el);

    const adapter = resolveAdapter(el, 'e-plain');
    expect(adapter).toBeUndefined();
    el.remove();
  });
});
