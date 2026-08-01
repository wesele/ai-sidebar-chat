import { describe, expect, it } from 'vitest';
import { normalizeSnapshot } from '../../src/domain/text/snapshot';
import { segmentParagraphs } from '../../src/domain/text/paragraph-segmenter';
import { segmentSentences } from '../../src/domain/text/sentence-segmenter';
import { protectedSpans } from '../../src/domain/text/protected-spans';
import { validateResponse } from '../../src/domain/analysis/response-validator';
import { applyPlan } from '../../src/domain/analysis/apply-plan';
import { createOrUpdateCache } from '../../src/domain/analysis/cache';

describe('writing domain', () => {
  it('normalizes CRLF without breaking UTF-16 mapping', () => { const s = normalizeSnapshot('a\r\n😀b'); expect(s.text).toBe('a\n😀b'); expect(s.offsetMap.normalizedToSource(2)).toBe(3); expect(s.offsetMap.sourceToNormalized(3)).toBe(2); });
  it('segments paragraphs and sentence edge cases deterministically', () => { expect(segmentParagraphs('One.\nTwo.\n\nThree.')).toEqual([{ start: 0, end: 9 }, { start: 11, end: 17 }]); expect(segmentSentences('Dr. Ada paid 3.14. “OK?” Next…')).toEqual([{ start: 0, end: 18 }, { start: 19, end: 24 }, { start: 25, end: 30 }]); });
  it('protects links, mail and inline code', () => { expect(protectedSpans('See https://a.test, a@b.test and `foo()`')).toEqual([{ start: 4, end: 18 }, { start: 20, end: 28 }, { start: 33, end: 40 }]); });
  it('isolates invalid issue independently but retains valid unit', () => { const result = validateResponse({ schemaVersion: '1', requestId: 'r', documentRevision: 1, units: [{ unitId: 'a', unitRevision: 1, issues: [{ scope: 'local', severity: 'problem', start: 2, end: 10, original: 'recieved', replacement: 'received', reason: 'spelling', category: 'spelling' }] }, { unitId: 'b', unitRevision: 1, issues: [{ scope: 'paragraph', severity: 'problem', start: 0, end: 1, original: 'x', replacement: 'x', reason: 'bad', category: 'other' }] }] }, { requestId: 'r', documentRevision: 1, units: [{ id: 'a', revision: 1, type: 'sentence', text: 'I recieved it.' }, { id: 'b', revision: 1, type: 'paragraph', text: 'x' }] }); expect(result.valid).toHaveLength(2); expect(result.valid[0].issues).toHaveLength(1); expect(result.valid[1].issues).toHaveLength(0); expect(result.rejected).toHaveLength(0); });
  it('isolates null and malformed model issues without throwing', () => {
    const expected = { requestId: 'r', documentRevision: 1, units: [{ id: 'a', revision: 1, type: 'sentence' as const, text: 'Text.' }] };
    expect(() => validateResponse({ schemaVersion: '1', requestId: 'r', documentRevision: 1, units: [{ unitId: 'a', unitRevision: 1, issues: [null] }] }, expected)).not.toThrow();
    expect(validateResponse({ schemaVersion: '1', requestId: 'r', documentRevision: 1, units: [{ unitId: 'a', unitRevision: 1, issues: [null] }] }, expected).rejected).toEqual([]);
  });
  it('applies reverse-order replacements and skips conflicts', () => { expect(applyPlan('bad bad', [{ start: 0, end: 3, original: 'bad', replacement: 'good' }, { start: 4, end: 7, original: 'bad', replacement: 'great' }]).text).toBe('good great'); expect(applyPlan('bad', [{ start: 0, end: 3, original: 'no', replacement: 'yes' }]).skipped).toBe(1); });
  it('keeps repeated units one-to-one when a duplicate is inserted', () => { const first = createOrUpdateCache(undefined, 'e', 'Same.\n\nSame.'); const second = createOrUpdateCache(first, 'e', 'Same.\n\nSame.\n\nSame.'); expect(new Set(second.paragraphs.map(p => p.id)).size).toBe(3); expect(second.paragraphs.slice(0, 2).map(p => p.id)).toEqual(first.paragraphs.map(p => p.id)); });
  it('preserves unchanged sentence analysis when another sentence in the paragraph changes', () => {
    const first = createOrUpdateCache(undefined, 'e', 'First bad. Second stable.');
    const [changed, stable] = first.paragraphs[0].sentences;
    stable.status = 'analyzed';
    stable.localIssues = [{
      issueId: 'stable-issue',
      scope: 'local',
      severity: 'improvement',
      start: stable.start,
      end: stable.start + 6,
      original: 'Second',
      replacement: 'Another',
      reason: 'Word choice.',
      category: 'word_choice',
    }];

    const second = createOrUpdateCache(first, 'e', 'First fixed. Second stable.');
    const [updated, preserved] = second.paragraphs[0].sentences;

    expect(second.paragraphs[0].id).toBe(first.paragraphs[0].id);
    expect(updated.id).toBe(changed.id);
    expect(updated.revision).toBe(changed.revision + 1);
    expect(updated.status).toBe('dirty');
    expect(preserved.id).toBe(stable.id);
    expect(preserved.status).toBe('analyzed');
    expect(preserved.localIssues).toHaveLength(1);
    expect(preserved.localIssues[0].start).toBe(13);
    expect(preserved.localIssues[0].end).toBe(19);
  });

  it('shifts issue offsets in subsequent sentences when preceding text length changes', () => {
    const first = createOrUpdateCache(undefined, 'e', 'I received your email on Monday. However I disagree. Thank you.');
    const sentence2 = first.paragraphs[0].sentences[1];
    sentence2.status = 'analyzed';
    sentence2.localIssues = [{
      issueId: 'however-issue',
      scope: 'local',
      severity: 'improvement',
      start: 33,
      end: 40,
      original: 'However',
      replacement: 'However,',
      reason: 'Punctuation.',
      category: 'grammar',
    }];

    // Preceding sentence length changes: "I received your email on Monday." (32 chars) -> "I received your email." (22 chars) -> delta = -10
    const second = createOrUpdateCache(first, 'e', 'I received your email. However I disagree. Thank you.');
    const preservedSentence2 = second.paragraphs[0].sentences[1];
    expect(preservedSentence2.localIssues[0].start).toBe(23);
    expect(preservedSentence2.localIssues[0].end).toBe(30);
  });

  it('preserves analyzed status and removes applied issue when fix is applied', () => {
    const first = createOrUpdateCache(undefined, 'e', 'I recieved your email.');
    const sentence = first.paragraphs[0].sentences[0];
    sentence.status = 'analyzed';
    sentence.localIssues = [{
      issueId: 'fix-1',
      scope: 'local',
      severity: 'problem',
      start: 2,
      end: 10,
      original: 'recieved',
      replacement: 'received',
      reason: 'Spelling.',
      category: 'spelling',
    }];

    const applied = [{ start: 2, end: 10, original: 'recieved', replacement: 'received' }];
    const second = createOrUpdateCache(first, 'e', 'I received your email.', applied);
    const updatedSentence = second.paragraphs[0].sentences[0];
    expect(updatedSentence.status).toBe('analyzed');
    expect(updatedSentence.localIssues).toHaveLength(0);
    expect(second.status).toBe('analyzed');
  });

  it('keeps absorbed sentence identities when a blank line is deleted (paragraph merge)', () => {
    const first = createOrUpdateCache(undefined, 'e', 'Alpha.\n\nBeta.');
    for (const p of first.paragraphs) {
      for (const s of p.sentences) s.status = 'analyzed';
    }
    const [oldAlpha, oldBeta] = first.paragraphs;

    const second = createOrUpdateCache(first, 'e', 'Alpha.\nBeta.');
    const [merged] = second.paragraphs;

    expect(second.paragraphs).toHaveLength(1);
    expect(merged.id).toBe(oldAlpha.id);
    expect(merged.sentences.map((s) => s.id)).toEqual([
      oldAlpha.sentences[0].id,
      oldBeta.sentences[0].id,
    ]);
    expect(merged.sentences.every((s) => s.status === 'analyzed')).toBe(true);
    expect(second.status).toBe('analyzed');
  });

  it('retains identities when paragraphs move without reusing an old identity twice', () => {
    const first = createOrUpdateCache(undefined, 'e', 'Alpha.\n\nBeta.\n\nAlpha.');
    const second = createOrUpdateCache(first, 'e', 'Beta.\n\nAlpha.\n\nAlpha.');

    expect(second.paragraphs[0].id).toBe(first.paragraphs[1].id);
    expect(new Set(second.paragraphs.map((paragraph) => paragraph.id)).size).toBe(3);
    expect(new Set(second.paragraphs.map((paragraph) => paragraph.id))).toEqual(
      new Set(first.paragraphs.map((paragraph) => paragraph.id)),
    );
  });
});
