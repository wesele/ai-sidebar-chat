import { afterEach, describe, expect, it, vi } from 'vitest';
import { WritingSession } from '../../src/content/writing-session';
import type { EditorAdapter } from '../../src/content/adapters/editor-adapter';
import { createSnapshot } from '../../src/domain/text/snapshot';
import type { AnalysisRequest, FullDocumentResponse } from '../../src/shared/schemas';

describe('WritingSession projected detection status', () => {
  afterEach(() => vi.useRealTimers());

  it('stays detecting until both unit and full-document work finish', () => {
    vi.useFakeTimers();
    const text = 'A sentence that should be analyzed.';
    const unitRequests: AnalysisRequest[] = [];
    const fullRequests: Array<{ requestId: string; revision: number }> = [];
    const element = document.createElement('textarea');
    const adapter: EditorAdapter = {
      element,
      kind: 'textarea',
      readSnapshot: () => createSnapshot({
        editorId: 'editor-1', documentRevision: 1, sourceKind: 'textarea', source: text,
        selection: { start: 2, end: 2 }, composing: false, createdAt: Date.now(),
      }),
      getCaretGeometry: () => null,
      getRangeGeometry: () => [],
      replaceRanges: () => ({ applied: 0, skipped: 0 }),
      observe: () => () => undefined,
    };
    const session = new WritingSession(
      adapter,
      (request) => unitRequests.push(request),
      (requestId, revision) => fullRequests.push({ requestId, revision }),
      () => undefined,
      () => undefined,
      () => ({ hasModel: true, fullDocumentCharacterLimit: 20_000, targetLanguage: 'EN' }),
    );

    session.start();
    session.leaveParagraph();
    session.requestFullDoc();
    expect(unitRequests).toHaveLength(1);
    expect(fullRequests).toHaveLength(1);
    expect(session.viewState()?.status).toBe('queued');
    expect(session.viewState()?.fullAnalysisPending).toBe(true);

    const unitRequest = unitRequests[0];
    session.accept({
      schemaVersion: '1',
      requestId: unitRequest.requestId,
      documentRevision: unitRequest.documentRevision,
      units: unitRequest.units.map((unit) => ({
        unitId: unit.unitId,
        unitRevision: unit.unitRevision,
        issues: [],
      })),
    });
    expect(session.viewState()?.status).toBe('queued');

    const fullResponse: FullDocumentResponse = {
      schemaVersion: '1',
      requestId: fullRequests[0].requestId,
      documentRevision: fullRequests[0].revision,
      severity: 'none',
      summary: 'Clear.',
      suggestions: [],
    };
    session.acceptFull(fullResponse);
    expect(session.viewState()?.status).toBe('analyzed');
    expect(session.viewState()?.fullAnalysisPending).toBe(false);
    session.stop();
  });

  it('projects a failed unit as error instead of completed', () => {
    vi.useFakeTimers();
    const text = 'A sentence that should be analyzed.';
    const requests: AnalysisRequest[] = [];
    const adapter = {
      element: document.createElement('textarea'),
      kind: 'textarea',
      readSnapshot: () => createSnapshot({
        editorId: 'editor-1', documentRevision: 1, sourceKind: 'textarea', source: text,
        selection: { start: 2, end: 2 }, composing: false, createdAt: Date.now(),
      }),
      getCaretGeometry: () => null,
      getRangeGeometry: () => [],
      replaceRanges: () => ({ applied: 0, skipped: 0 }),
      observe: () => () => undefined,
    } as EditorAdapter;
    const session = new WritingSession(
      adapter, (request) => requests.push(request), () => undefined, () => undefined,
      () => undefined, () => ({ hasModel: true, fullDocumentCharacterLimit: 20_000, targetLanguage: 'EN' }),
    );
    session.start();
    vi.advanceTimersByTime(1500);
    expect(session.viewState()?.status).toBe('queued');
    session.fail(requests[0].requestId);
    expect(session.viewState()?.status).toBe('error');
    session.stop();
  });
});
