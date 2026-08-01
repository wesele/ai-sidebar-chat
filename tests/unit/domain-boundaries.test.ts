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

  it('repairs miscounted CJK/full-width offsets from reasoning models', () => {
    const text = 'How can I 直到？';
    const result = validateResponse({
      schemaVersion: '1', requestId: 'r', documentRevision: 1,
      units: [{
        unitId: 's', unitRevision: 1,
        issues: [
          { scope: 'sentence', severity: 'problem', start: 0, end: 14, original: 'How can I 直到？', replacement: 'How can I find out?', reason: 'Non-English sentence.', category: 'non_english' },
          { scope: 'local', severity: 'problem', start: 8, end: 10, original: '直到', replacement: 'find out', reason: 'Non-English phrase.', category: 'non_english' },
        ],
      }],
    }, { requestId: 'r', documentRevision: 1, units: [{ id: 's', revision: 1, type: 'sentence' as const, text }] });
    expect(result.rejected).toEqual([]);
    expect(result.valid).toHaveLength(1);
    const [sentence, local] = result.valid[0].issues;
    expect([sentence.start, sentence.end]).toEqual([0, text.length]);
    expect(text.slice(local.start, local.end)).toBe('直到');
  });

  it('isolates invalid single items while keeping the rest of the unit valid', () => {
    const text = 'Hiw can I tell you it is the frist 狒狒。';
    const result = validateResponse({
      schemaVersion: '1', requestId: 'r', documentRevision: 1,
      units: [{
        unitId: 's', unitRevision: 1,
        issues: [
          { scope: 'local', severity: 'problem', start: 0, end: 3, original: 'Hiw', replacement: 'How', reason: 'Misspelling.', category: 'spelling' },
          { scope: 'local', severity: 'problem', start: 23, end: 28, original: 'frist', replacement: 'first', reason: 'Misspelling.', category: 'spelling' },
          { scope: 'local', severity: 'problem', start: 34, end: 37, original: '狒狒。', replacement: '', reason: 'Non-English.', category: 'non_english' },
        ],
      }],
    }, { requestId: 'r', documentRevision: 1, units: [{ id: 's', revision: 1, type: 'sentence' as const, text }] });
    expect(result.rejected).toEqual([]);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].issues.map((issue) => issue.original)).toEqual(['Hiw', 'frist']);
  });

  it('isolates empty replacements and normalizes out-of-enum categories', () => {
    const text = 'This is ont good 狒狒。';
    const result = validateResponse({
      schemaVersion: '1', requestId: 'r', documentRevision: 1,
      units: [{
        unitId: 's', unitRevision: 1,
        issues: [
          { scope: 'local', severity: 'problem', start: 8, end: 11, original: 'ont', replacement: 'not', reason: 'Misspelling.', category: 'spelling' },
          { scope: 'local', severity: 'problem', start: 12, end: 17, original: ' good', replacement: '', reason: 'Junk.', category: 'punctuation' },
          { scope: 'local', severity: 'problem', start: 18, end: 21, original: '狒狒。', replacement: 'thing.', reason: 'Non-English.', category: 'punctuation' },
        ],
      }],
    }, { requestId: 'r', documentRevision: 1, units: [{ id: 's', revision: 1, type: 'sentence' as const, text }] });
    expect(result.rejected).toEqual([]);
    expect(result.valid).toHaveLength(1);
    const issues = result.valid[0].issues;
    expect(issues.map((issue) => issue.original)).toEqual(['ont', '狒狒。']);
    expect(issues[1].category).toBe('other');
  });

  it('accepts a unit whose every issue is invalid as analyzed with no findings', () => {
    const result = validateResponse({
      schemaVersion: '1', requestId: 'r', documentRevision: 1,
      units: [{
        unitId: 's', unitRevision: 1,
        issues: [
          { scope: 'local', severity: 'problem', start: 0, end: 3, original: 'Bad', replacement: 'Bad', reason: 'No-op.', category: 'spelling' },
          { scope: 'local', severity: 'problem', start: 4, end: 8, original: 'text', replacement: '', reason: 'Empty replacement.', category: 'spelling' },
        ],
      }],
    }, { requestId: 'r', documentRevision: 1, units: [{ id: 's', revision: 1, type: 'sentence' as const, text: 'Bad text.' }] });
    expect(result.rejected).toEqual([]);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].issues).toEqual([]);
  });

  it('drops hallucinated originals that are absent from the unit without failing it', () => {
    const result = validateResponse({
      schemaVersion: '1', requestId: 'r', documentRevision: 1,
      units: [{
        unitId: 's', unitRevision: 1,
        issues: [{ scope: 'local', severity: 'problem', start: 2, end: 8, original: 'notthere', replacement: 'something', reason: 'Nope.', category: 'spelling' }],
      }],
    }, { requestId: 'r', documentRevision: 1, units: [{ id: 's', revision: 1, type: 'sentence' as const, text: 'A plain text.' }] });
    expect(result.rejected).toEqual([]);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].issues).toEqual([]);
  });

  it('resolves duplicate local spans to the occurrence nearest the reported offset', () => {
    const text = 'bad good bad';
    const result = validateResponse({
      schemaVersion: '1', requestId: 'r', documentRevision: 1,
      units: [{
        unitId: 's', unitRevision: 1,
        issues: [{ scope: 'local', severity: 'problem', start: 9, end: 12, original: 'bad', replacement: 'fine', reason: 'Word choice.', category: 'word_choice' }],
      }],
    }, { requestId: 'r', documentRevision: 1, units: [{ id: 's', revision: 1, type: 'sentence' as const, text }] });
    expect(result.rejected).toEqual([]);
    expect(result.valid[0].issues[0].start).toBe(9);
    expect(result.valid[0].issues[0].end).toBe(12);
  });

  it('downgrades an over-scoped sentence finding to a local issue', () => {
    const text = 'Hiw can I tell you it is the frist 狒狒。';
    const result = validateResponse({
      schemaVersion: '1', requestId: 'r', documentRevision: 1,
      units: [{
        unitId: 's', unitRevision: 1,
        issues: [{ scope: 'sentence', severity: 'problem', start: 34, end: 39, original: '狒狒。', replacement: 'thing.', reason: 'Non-English.', category: 'non_english' }],
      }],
    }, { requestId: 'r', documentRevision: 1, units: [{ id: 's', revision: 1, type: 'sentence' as const, text }] });
    expect(result.rejected).toEqual([]);
    expect(result.valid).toHaveLength(1);
    const [issue] = result.valid[0].issues;
    expect(issue.scope).toBe('local');
    expect(text.slice(issue.start, issue.end)).toBe('狒狒。');
  });

  it('drops repaired local issues that overlap protected spans without failing the unit', () => {
    const text = 'See https://a.test for info.';
    const urlStart = text.indexOf('https://a.test');
    const result = validateResponse({
      schemaVersion: '1', requestId: 'r', documentRevision: 1,
      units: [{
        unitId: 's', unitRevision: 1,
        issues: [{ scope: 'local', severity: 'problem', start: urlStart + 3, end: urlStart + 18, original: 'https://a.test', replacement: 'the link', reason: 'Do not flag URLs.', category: 'other' }],
      }],
    }, { requestId: 'r', documentRevision: 1, units: [{ id: 's', revision: 1, type: 'sentence' as const, text }] });
    expect(result.rejected).toEqual([]);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].issues).toEqual([]);
  });
});
