import { describe, expect, it } from 'vitest';
import { createOrUpdateCache } from '../../src/domain/analysis/cache';

/**
 * Incremental cache rebuild: editing one paragraph must not re-segment every
 * sentence of every unchanged paragraph (O(document) per keystroke froze
 * typing in long documents). Unchanged paragraphs reuse their sentences with
 * a pure offset shift and keep unit identities.
 */
describe('incremental cache rebuild', () => {
  const text = [
    'First paragraph opens here. It continues a bit.',
    'Second paragraph is edited below. Nothing else changes.',
    'Third paragraph closes the document. The end follows.',
  ].join('\n\n');

  it('preserves sentence identity, status and shifts offsets for untouched paragraphs', () => {
    const before = createOrUpdateCache(undefined, 'e', text);
    const para1 = before.paragraphs[0]!;
    const para3 = before.paragraphs[2]!;
    const para1SentenceIds = para1.sentences.map((s) => s.id);
    const para3SentenceIds = para3.sentences.map((s) => s.id);

    expect(para1.sentences).toHaveLength(2);
    expect(para3.sentences).toHaveLength(2);

    // Single edit (+1 char) inside paragraph 2.

    const edited = text.replace('Second paragraph is edited below.', 'Second paragraph was edited below!');
    const after = createOrUpdateCache(before, 'e', edited);

    // Untouched paragraphs: same sentence ids, same statuses, shifted offsets.
    expect(after.paragraphs[0]!.sentences.map((s) => s.id)).toEqual(para1SentenceIds);
    expect(after.paragraphs[2]!.sentences.map((s) => s.id)).toEqual(para3SentenceIds);
    expect(after.paragraphs[0]!.sentences.map((s) => s.status))
      .toEqual(para1.sentences.map((s) => s.status));
    // Paragraph 1 starts at 0 in both: offsets identical (referential reuse).
    expect(after.paragraphs[0]!.sentences).toBe(para1.sentences);
    // Paragraph 3 shifted by the +1 length delta of the paragraph 2 edit.
    expect(after.paragraphs[2]!.start).toBe(para3.start + 1);
    expect(after.paragraphs[2]!.sentences[0]!.start).toBe(para3.sentences[0]!.start + 1);
    expect(after.paragraphs[2]!.sentences).not.toBe(para3.sentences);
    // Edited paragraph was re-segmented and marked dirty.
    expect(after.paragraphs[1]!.status).toBe('dirty');
    expect(after.paragraphs[1]!.sentences.some((s) => s.status === 'dirty')).toBe(true);
  });

  it('still takes the slow path when applied replacements are present', () => {
    const before = createOrUpdateCache(undefined, 'e', text);
    // Same visible text, but an applied replacement forces the full
    // updateSentences path (which handles applied-issue bookkeeping).
    const paraText = text.slice(before.paragraphs[0]!.start, before.paragraphs[0]!.end);
    const word = paraText.slice(0, 5);
    const after = createOrUpdateCache(before, 'e', text, [{
      start: before.paragraphs[0]!.start,
      end: before.paragraphs[0]!.start + 5,
      original: word,
      replacement: `${word}!`,
    }]);
    // Paragraph 1 went through updateSentences: re-segmented objects, not
    // the referentially-reused fast-path arrays.
    expect(after.paragraphs[0]!.sentences).not.toBe(before.paragraphs[0]!.sentences);
    expect(after.revision).toBe(before.revision);
  });

  it('rebuilds a 2000-paragraph document after a single edit within budget', () => {
    const sentence = 'The quick brown fox jumps over the lazy dog near the river bank. ';
    const para = (i: number): string => `Paragraph ${i} begins. ${sentence.repeat(6)}It ends here.`;
    const big = Array.from({ length: 2000 }, (_, i) => para(i)).join('\n\n');
    const cache = createOrUpdateCache(undefined, 'e', big);
    const edited = `${big.slice(0, 50000)}X${big.slice(50001)}`;
    const start = performance.now();
    const updated = createOrUpdateCache(cache, 'e', edited);
    const elapsed = performance.now() - start;
    expect(updated.revision).toBe(2);
    // Was ~90ms before the incremental fast path; keep a generous bound so
    // the test documents the budget without being flaky.
    expect(elapsed).toBeLessThan(2000);
  });
});
