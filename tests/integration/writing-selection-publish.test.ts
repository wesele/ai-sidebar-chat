import { describe, expect, it, vi } from 'vitest';
import { WritingSession } from '../../src/content/writing-session';
import type { EditorAdapter } from '../../src/content/adapters/editor-adapter';
import { createSnapshot } from '../../src/domain/text/snapshot';

/**
 * Regression tests for sustained-CPU caused by selection handling:
 * every `selectionchange` (plus click/pointerup/keyup) used to trigger a full
 * publish — snapshot rebuild + per-issue geometry + panel re-render — even
 * when the caret never left its sentence. After analysis produces issues this
 * kept the CPU busy indefinitely on selection-heavy pages.
 */
function makeAdapter(text: string, caret: () => number, counts: { snapshots: number }) {
    const adapter = {
    element: document.createElement('textarea'),
    kind: 'textarea',
    readSnapshot: vi.fn(() => {
      counts.snapshots += 1;
      const pos = caret();
      return createSnapshot({
        editorId: 'e', documentRevision: 1, sourceKind: 'textarea', source: text,
        selection: { start: pos, end: pos }, composing: false, createdAt: 0,
      });
    }),
    getCaretGeometry: () => null,
    getRangeGeometry: () => [],
    replaceRanges: () => ({ applied: 0, skipped: 0 }),
      observe: () => () => undefined,
    } as unknown as EditorAdapter;
    document.body.append(adapter.element);
    adapter.element.focus();
    return adapter;
}

describe('WritingSession selection publish', () => {
  it('skips full publish (dot-only refresh) when caret stays in the same unit', () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    const text = 'First sentence here. Second sentence here.';
    let caretPos = 5;
    const counts = { snapshots: 0 };
    let publishes = 0;
    let caretRefreshes = 0;
    const session = new WritingSession(
      makeAdapter(text, () => caretPos, counts),
      () => undefined,
      () => undefined,
      () => undefined,
      () => { publishes += 1; },
      () => ({ hasModel: false, fullDocumentCharacterLimit: 20000, targetLanguage: 'EN' }),
      () => { caretRefreshes += 1; },
    );
    session.start();
    const basePublishes = publishes;
    const baseSnapshots = counts.snapshots;
    for (let i = 0; i < 5; i += 1) {
      document.dispatchEvent(new Event('selectionchange'));
    }
    frame?.(0);
    // A burst of overlapping selection events is coalesced to one snapshot and
    // one caret-only refresh instead of repeating full annotation work.
    expect(counts.snapshots - baseSnapshots).toBe(1);
    expect(publishes - basePublishes).toBe(0);
    expect(caretRefreshes).toBe(1);
    session.stop();
    vi.unstubAllGlobals();
  });

  it('publishes fully when caret moves to another sentence', () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    const text = 'First sentence here. Second sentence here.';
    let caretPos = 5;
    const counts = { snapshots: 0 };
    let publishes = 0;
    let caretRefreshes = 0;
    const session = new WritingSession(
      makeAdapter(text, () => caretPos, counts),
      () => undefined,
      () => undefined,
      () => undefined,
      () => {
        publishes += 1;
        // Simulate the production publish path: viewState() must reuse the
        // already-read snapshot instead of rebuilding the model again.
        session.viewState();
      },
      () => ({ hasModel: false, fullDocumentCharacterLimit: 20000, targetLanguage: 'EN' }),
      () => { caretRefreshes += 1; },
    );
    session.start();
    caretPos = 30; // second sentence
    const baseSnapshots = counts.snapshots;
    const basePublishes = publishes;
    document.dispatchEvent(new Event('selectionchange'));
    frame?.(0);
    expect(publishes - basePublishes).toBe(1);
    expect(caretRefreshes).toBe(0);
    // 1 snapshot for the event; viewState() inside publish reuses it.
    expect(counts.snapshots - baseSnapshots).toBe(1);
    session.stop();
    vi.unstubAllGlobals();
  });

  it('still dispatches dirty work when leaving a dirty sentence', () => {
    vi.useFakeTimers();
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    try {
      const text = 'First sentence here. Second sentence here.';
      let caretPos = 5;
      const counts = { snapshots: 0 };
      const requests: unknown[] = [];
      let publishes = 0;
      const session = new WritingSession(
        makeAdapter(text, () => caretPos, counts),
        (r) => { requests.push(r); },
        () => undefined,
        () => undefined,
        () => { publishes += 1; },
        () => ({ hasModel: true, fullDocumentCharacterLimit: 20000, targetLanguage: 'EN' }),
      );
      session.start();
      vi.advanceTimersByTime(1500);
      expect(requests).toHaveLength(1);
      const basePublishes = publishes;
      // Move to the second sentence: previous sentence is queued (work in
      // flight), so no re-dispatch, but the unit moved -> full publish.
      caretPos = 30;
      document.dispatchEvent(new Event('selectionchange'));
      frame?.(0);
      expect(publishes - basePublishes).toBe(1);
      session.stop();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
