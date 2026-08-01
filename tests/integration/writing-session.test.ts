import { describe, expect, it, vi } from 'vitest'; import { WritingSession } from '../../src/content/writing-session'; import type { EditorAdapter } from '../../src/content/adapters/editor-adapter'; import { createSnapshot } from '../../src/domain/text/snapshot';
describe('WritingSession races', () => {
  it('cancels old work on input and discards its late response', () => {
    vi.useFakeTimers();
    let text = 'I recieved it.';
    const requests: Array<{ requestId: string; documentRevision: number }> = [];
    const cancelled: string[] = [];
    const adapter = {
      element: document.createElement('textarea'),
      kind: 'textarea',
      readSnapshot: vi.fn(() => createSnapshot({
        editorId: 'e', documentRevision: 1, sourceKind: 'textarea', source: text,
        selection: { start: text.length, end: text.length }, composing: false, createdAt: 0,
      })),
      getCaretGeometry: () => null,
      getRangeGeometry: () => [],
      replaceRanges: () => ({ applied: 0, skipped: 0 }),
      observe: (cb: () => void) => { (adapter as { input?: () => void }).input = cb; return () => undefined; },
    } as unknown as EditorAdapter & { input?: () => void };
    const session = new WritingSession(adapter, r => requests.push(r), () => undefined, id => cancelled.push(id), () => undefined, () => ({ hasModel: true, fullDocumentCharacterLimit: 20000, targetLanguage: 'EN' }));
    session.start();
    vi.advanceTimersByTime(1500);
    expect(requests).toHaveLength(1);
    text = 'I received it.';
    adapter.input!();
    expect(cancelled).toContain(requests[0].requestId);
    session.accept({ schemaVersion: '1', requestId: requests[0].requestId, documentRevision: 1, units: [] });
    expect(session.issues()).toEqual([]);
    session.stop();
    vi.useRealTimers();
  });

  it('does not trigger detection when moving cursor up and down without entering text', () => {
    vi.useFakeTimers();
    const text = 'First line.\nSecond line.';
    const unitRequests: Array<{ requestId: string; units: Array<{ unitId: string; unitRevision: number }> }> = [];
    const fullRequests: Array<{ requestId: string }> = [];
    let caretPos = 2; // In first paragraph

    const adapter = {
      element: document.createElement('textarea'),
      kind: 'textarea',
      readSnapshot: vi.fn(() => createSnapshot({
        editorId: 'e', documentRevision: 1, sourceKind: 'textarea', source: text,
        selection: { start: caretPos, end: caretPos }, composing: false, createdAt: 0,
      })),
      getCaretGeometry: () => null,
      getRangeGeometry: () => [],
      replaceRanges: () => ({ applied: 0, skipped: 0 }),
      observe: () => () => undefined,
    } as unknown as EditorAdapter;

    const session = new WritingSession(
      adapter,
      (r) => unitRequests.push(r),
      (id) => fullRequests.push({ requestId: id }),
      () => undefined,
      () => undefined,
      () => ({ hasModel: true, fullDocumentCharacterLimit: 20000, targetLanguage: 'EN' }),
    );

    session.start();
    vi.advanceTimersByTime(1500);
    expect(unitRequests).toHaveLength(1);

    // Complete initial analysis
    session.accept({
      schemaVersion: '1',
      requestId: unitRequests[0].requestId,
      documentRevision: 1,
      units: unitRequests[0].units.map((u) => ({ unitId: u.unitId, unitRevision: u.unitRevision, issues: [] })),
    });

    // Verify paragraph and cache status updated to 'analyzed'
    expect(session.current()?.status).toBe('analyzed');
    expect(session.current()?.paragraphs.every((p) => p.status === 'analyzed')).toBe(true);

    const initialUnitCount = unitRequests.length;
    const initialFullCount = fullRequests.length;

    // Move cursor down to second line (Paragraph 2)
    caretPos = 14;
    document.dispatchEvent(new Event('selectionchange'));

    // Move cursor back up to first line (Paragraph 1)
    caretPos = 2;
    document.dispatchEvent(new Event('selectionchange'));

    // Trigger explicit leaveParagraph (e.g. focusout / paragraph exit)
    session.leaveParagraph();

    // Verify no new detection requests were triggered
    expect(unitRequests).toHaveLength(initialUnitCount);
    expect(fullRequests).toHaveLength(initialFullCount);

    session.stop();
    vi.useRealTimers();
  });

  it('does not trigger unit or full document detection when input is completely empty', () => {
    vi.useFakeTimers();
    const unitRequests: Array<{ requestId: string }> = [];
    const fullRequests: Array<{ requestId: string }> = [];

    const adapter = {
      element: document.createElement('textarea'),
      kind: 'textarea',
      readSnapshot: vi.fn(() => createSnapshot({
        editorId: 'e', documentRevision: 1, sourceKind: 'textarea', source: '',
        selection: { start: 0, end: 0 }, composing: false, createdAt: 0,
      })),
      getCaretGeometry: () => null,
      getRangeGeometry: () => [],
      replaceRanges: () => ({ applied: 0, skipped: 0 }),
      observe: () => () => undefined,
    } as unknown as EditorAdapter;

    const session = new WritingSession(
      adapter,
      (r) => unitRequests.push(r),
      (id) => fullRequests.push({ requestId: id }),
      () => undefined,
      () => undefined,
      () => ({ hasModel: true, fullDocumentCharacterLimit: 20000, targetLanguage: 'EN' }),
    );

    session.start();
    session.leaveParagraph();
    vi.advanceTimersByTime(1500);

    expect(unitRequests).toHaveLength(0);
    expect(fullRequests).toHaveLength(0);

    session.stop();
    vi.useRealTimers();
  });
});
