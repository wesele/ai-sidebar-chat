import { describe, expect, it } from 'vitest';
import { canAnalyze, canAnalyzeParagraph } from '../../src/domain/analysis/eligibility';
import { canTransition, transition } from '../../src/domain/analysis/state-machine';
import { validateFullDocumentResponse, validateResponse } from '../../src/domain/analysis/response-validator';
import { overlapsProtected, protectedSpans } from '../../src/domain/text/protected-spans';
import { segmentSentences } from '../../src/domain/text/sentence-segmenter';
import { normalizeSnapshot } from '../../src/domain/text/snapshot';

describe('domain boundary behavior', () => {
  it('enforces sentence and paragraph eligibility state, IME, caret, idle, and completion rules', () => {
    expect(canAnalyze('dirty', 'Text.', false, true, 1499)).toBe(false);
    expect(canAnalyze('dirty', 'Text.', false, true, 1500)).toBe(true);
    expect(canAnalyze('error', 'Text.', false, false, 0)).toBe(true);
    expect(canAnalyze('analyzed', 'Text.', false, false, 2000)).toBe(false);
    expect(canAnalyze('dirty', ' ', false, false, 2000)).toBe(false);
    expect(canAnalyze('dirty', 'Text.', true, false, 2000)).toBe(false);
    expect(canAnalyzeParagraph('dirty', 'Text.', false, true)).toBe(true);
    expect(canAnalyzeParagraph('queued', 'Text.', false, true)).toBe(false);
    expect(canAnalyzeParagraph('dirty', 'Text.', false, false)).toBe(false);
  });

  it('handles punctuation, abbreviations, decimals, closers, and non-terminated tails', () => {
    expect(segmentSentences('Dr. Li paid 3.14. “Really?” 下一句！ Tail')).toEqual([
      { start: 0, end: 17 },
      { start: 18, end: 27 },
      { start: 28, end: 32 },
      { start: 33, end: 37 },
    ]);
    expect(segmentSentences('word.without boundary')).toEqual([{ start: 0, end: 21 }]);
    expect(segmentSentences('')).toEqual([]);
  });

  it('clamps offset maps and detects protected-range intersections', () => {
    const normalized = normalizeSnapshot('a\r\nb');
    expect(normalized.offsetMap.normalizedToSource(-10)).toBe(0);
    expect(normalized.offsetMap.normalizedToSource(99)).toBe(4);
    expect(normalized.offsetMap.sourceToNormalized(-1)).toBe(0);
    expect(normalized.offsetMap.sourceToNormalized(99)).toBe(3);
    const spans = protectedSpans('mail a@b.test and https://x.test and `code`');
    expect(overlapsProtected({ start: spans[0].start, end: spans[0].end }, spans)).toBe(true);
    expect(overlapsProtected({ start: 0, end: 2 }, spans)).toBe(false);
    expect(protectedSpans('plain text')).toEqual([]);
  });

  it('rejects illegal state transitions and accepts legal ones', () => {
    expect(canTransition('dirty', 'queued')).toBe(true);
    expect(canTransition('analyzed', 'queued')).toBe(false);
    expect(transition('analyzing', 'analyzed')).toBe('analyzed');
    expect(() => transition('never', 'analyzed')).toThrow(/Invalid detection transition/);
  });

  it('validates full results and rejects malformed unit fields without throwing', () => {
    const full = {
      schemaVersion: '1', requestId: 'r', documentRevision: 2, severity: 'improvement',
      summary: 'Mostly clear.', suggestions: [{ severity: 'improvement', title: 'Tone', reason: 'Be consistent.' }],
    };
    expect(validateFullDocumentResponse(full, { requestId: 'r', documentRevision: 2 })).toBeTruthy();
    expect(validateFullDocumentResponse({ ...full, replacement: 'rewrite' }, { requestId: 'r', documentRevision: 2 })).toBeUndefined();
    expect(validateFullDocumentResponse({ ...full, suggestions: [null] }, { requestId: 'r', documentRevision: 2 })).toBeUndefined();
    expect(validateFullDocumentResponse(null, { requestId: 'r', documentRevision: 2 })).toBeUndefined();

    const expected = { requestId: 'r', documentRevision: 1, units: [{ id: 's', revision: 1, type: 'sentence' as const, text: 'Bad text.' }] };
    expect(validateResponse({ schemaVersion: '1', requestId: 'wrong', documentRevision: 1, units: [] }, expected).rejected).toEqual(['response']);
    expect(validateResponse({ schemaVersion: '1', requestId: 'r', documentRevision: 1, units: [null] }, expected).rejected).toEqual(['unit']);
  });
});
