import { describe, expect, it } from 'vitest';
import type { DocumentCache } from '../../src/domain/analysis/cache';
import { createSnapshot } from '../../src/domain/text/snapshot';
import type { EditorAdapter } from '../../src/content/adapters/editor-adapter';
import { WritingSession } from '../../src/content/writing-session';

const issue = (scope: 'local' | 'sentence' | 'paragraph', start: number, end: number, id: string) => ({
  issueId: id,
  scope,
  severity: 'problem' as const,
  start,
  end,
  original: 'bad',
  replacement: 'good',
  reason: `${scope} reason`,
  category: 'grammar' as const,
});

describe('EditorViewState projection', () => {
  it('projects caret sentence then paragraph, full state and only analyzed valid counts', () => {
    let caret = 2;
    const adapter = {
      element: document.createElement('textarea'),
      kind: 'textarea',
      readSnapshot: () => createSnapshot({
        editorId: 'e', documentRevision: 1, sourceKind: 'textarea', source: 'bad text',
        selection: { start: caret, end: caret }, composing: false, createdAt: 0,
      }),
      getCaretGeometry: () => null,
      getRangeGeometry: () => [],
      replaceRanges: () => ({ applied: 0, skipped: 0 }),
      observe: () => () => undefined,
    } as unknown as EditorAdapter;
    const session = new WritingSession(
      adapter,
      () => undefined,
      () => undefined,
      () => undefined,
      () => undefined,
      () => ({ hasModel: false, fullDocumentCharacterLimit: 3, targetLanguage: 'EN' }),
    );
    const sentence = issue('sentence', 0, 8, 's');
    const paragraph = issue('paragraph', 0, 2, 'p');
    const local = issue('local', 4, 7, 'l');
    const cache: DocumentCache = {
      editorId: 'e', revision: 1, textHash: 'x', textLength: 8, status: 'analyzed',
      fullResult: { severity: 'problem', summary: 'Global coherence', suggestions: [] },
      paragraphs: [{
        id: 'p', revision: 1, start: 0, end: 8, textHash: 'x', status: 'analyzed', issue: paragraph,
        sentences: [{
          id: 's', revision: 1, start: 0, end: 8, textHash: 'x', status: 'analyzed',
          localIssues: [local], sentenceIssue: sentence,
        }],
      }],
    };
    (session as unknown as { cache: DocumentCache }).cache = cache;
    const view = session.viewState()!;
    expect(view.currentSentence?.issueId).toBe('s');
    expect(view.currentParagraph?.issueId).toBe('p');
    expect(view.currentParagraphIssues?.map((item) => item.issueId)).toEqual(['p', 'l', 's']);
    expect(view.fullResult).toEqual({
      severity: 'problem', summary: 'Global coherence', suggestions: [],
    });
    expect(view.longText).toBe(true);
    expect(view.noModel).toBe(true);
    expect(view.counts).toEqual({ local: 1, sentence: 1, paragraph: 1 });
    expect(view.batchPreviews).toEqual({
      local: [{
        issueId: 'l', severity: 'problem', original: 'bad', replacement: 'good', reason: 'local reason',
      }],
      sentence: [{
        issueId: 's', severity: 'problem', original: 'bad', replacement: 'good',
        reason: 'sentence reason',
      }],
      paragraph: [{
        issueId: 'p', severity: 'problem', original: 'bad', replacement: 'good',
        reason: 'paragraph reason',
      }],
    });
    caret = 7;
    expect(session.viewState()?.currentParagraph?.issueId).toBe('p');
    expect(session.viewState()?.currentParagraphIssues?.map((item) => item.issueId)).toEqual(['p', 'l', 's']);
    caret = 99;
    expect(session.viewState()?.currentSentence).toBeUndefined();
    expect(session.viewState()?.currentParagraph).toBeUndefined();
    expect(session.viewState()?.currentParagraphIssues).toBeUndefined();
  });
});
