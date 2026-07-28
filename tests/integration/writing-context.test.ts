import { afterEach, describe, expect, it, vi } from 'vitest';
import { WritingSession } from '../../src/content/writing-session';
import type { EditorAdapter } from '../../src/content/adapters/editor-adapter';
import { createSnapshot } from '../../src/domain/text/snapshot';
import type { AnalysisRequest } from '../../src/shared/schemas';

function sessionFor(text: string, caret: number, requests: AnalysisRequest[]): WritingSession {
  const element = document.createElement('textarea');
  const adapter: EditorAdapter = {
    element,
    kind: 'textarea',
    readSnapshot: () => createSnapshot({
      editorId: 'editor-1',
      documentRevision: 1,
      sourceKind: 'textarea',
      source: text,
      selection: { start: caret, end: caret },
      composing: false,
      createdAt: Date.now(),
    }),
    getCaretGeometry: () => null,
    getRangeGeometry: () => [],
    replaceRanges: () => ({ applied: 0, skipped: 0 }),
    observe: () => () => undefined,
  };
  return new WritingSession(
    adapter,
    (request) => requests.push(request),
    () => undefined,
    () => undefined,
    () => undefined,
    () => ({ hasModel: true, fullDocumentCharacterLimit: 20_000 }),
  );
}

describe('WritingSession minimized model context', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the rest of the containing paragraph around a sentence target', () => {
    vi.useFakeTimers();
    const text = 'Alpha first. Beta target. Gamma last.';
    const requests: AnalysisRequest[] = [];
    const session = sessionFor(text, text.indexOf('Beta') + 2, requests);
    session.start();
    vi.advanceTimersByTime(1500);

    const target = requests[0].units.find((unit) => unit.text === 'Beta target.');
    expect(target).toMatchObject({
      unitType: 'sentence',
      text: 'Beta target.',
      absoluteStart: text.indexOf('Beta'),
      contextBefore: 'Alpha first.',
      contextAfter: 'Gamma last.',
    });
    expect(`${target?.contextBefore}${target?.contextAfter}`).not.toContain('Beta target.');
    session.stop();
  });

  it('uses adjacent sentences across paragraph boundaries and omits empty edge context', () => {
    vi.useFakeTimers();
    const text = 'Previous only.\n\nTarget only.\n\nNext only.';
    const requests: AnalysisRequest[] = [];
    const session = sessionFor(text, text.indexOf('Target') + 2, requests);
    session.start();
    vi.advanceTimersByTime(1500);

    const sentenceUnits = requests[0].units.filter((unit) => unit.unitType === 'sentence');
    expect(sentenceUnits.find((unit) => unit.text === 'Previous only.')).toMatchObject({
      contextAfter: 'Target only.',
    });
    expect(sentenceUnits.find((unit) => unit.text === 'Previous only.')).not.toHaveProperty('contextBefore');
    expect(sentenceUnits.find((unit) => unit.text === 'Target only.')).toMatchObject({
      contextBefore: 'Previous only.',
      contextAfter: 'Next only.',
    });
    expect(sentenceUnits.find((unit) => unit.text === 'Next only.')).toMatchObject({
      contextBefore: 'Target only.',
    });
    expect(sentenceUnits.find((unit) => unit.text === 'Next only.')).not.toHaveProperty('contextAfter');

    session.leaveParagraph();
    const paragraph = requests.at(-1)?.units.find((unit) => unit.unitType === 'paragraph');
    expect(paragraph).toMatchObject({
      text: 'Target only.',
      absoluteStart: text.indexOf('Target'),
      contextBefore: 'Previous only.',
      contextAfter: 'Next only.',
    });
    session.stop();
  });
});
