import { describe, expect, it } from 'vitest';
import { validateResponse, validateFullDocumentResponse } from '../../src/domain/analysis/response-validator';
import { protectedSpans } from '../../src/domain/text/protected-spans';
import { applyPlan } from '../../src/domain/analysis/apply-plan';

describe('Spec.md Error Categories and Simulation Tests', () => {
  // 1. Spelling Errors (local scope)
  it('validates spelling error issue (local scope)', () => {
    const unitText = 'I recieved the email yesterday.';
    const start = unitText.indexOf('recieved');
    const end = start + 'recieved'.length;

    const response = {
      schemaVersion: '1',
      requestId: 'req-spelling-1',
      documentRevision: 1,
      units: [
        {
          unitId: 'unit-1',
          unitRevision: 1,
          issues: [
            {
              scope: 'local',
              severity: 'problem',
              start,
              end,
              original: 'recieved',
              replacement: 'received',
              reason: 'Use the correct spelling of received.',
              category: 'spelling',
            },
          ],
        },
      ],
    };

    const result = validateResponse(response, {
      requestId: 'req-spelling-1',
      documentRevision: 1,
      units: [{ id: 'unit-1', revision: 1, type: 'sentence', text: unitText }],
    });

    expect(result.valid).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
    expect(result.valid[0].issues[0].category).toBe('spelling');
    expect(result.valid[0].issues[0].replacement).toBe('received');
  });

  // 2. Grammar Errors (sentence scope vs local scope)
  it('validates grammar error issue (sentence scope)', () => {
    const unitText = 'He go to school yesterday.';

    const response = {
      schemaVersion: '1',
      requestId: 'req-grammar-1',
      documentRevision: 1,
      units: [
        {
          unitId: 'unit-2',
          unitRevision: 1,
          issues: [
            {
              scope: 'sentence',
              severity: 'problem',
              start: 0,
              end: unitText.length,
              original: unitText,
              replacement: 'He went to school yesterday.',
              reason: 'Use past tense "went" for past time reference.',
              category: 'grammar',
            },
          ],
        },
      ],
    };

    const result = validateResponse(response, {
      requestId: 'req-grammar-1',
      documentRevision: 1,
      units: [{ id: 'unit-2', revision: 1, type: 'sentence', text: unitText }],
    });

    expect(result.valid).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
    expect(result.valid[0].issues[0].category).toBe('grammar');
    expect(result.valid[0].issues[0].scope).toBe('sentence');
  });

  // 3. Word Choice Errors (local scope)
  it('validates word choice issue (local scope)', () => {
    const unitText = 'We need to make a decision quickly.';
    const start = unitText.indexOf('make a decision');
    const end = start + 'make a decision'.length;

    const response = {
      schemaVersion: '1',
      requestId: 'req-wc-1',
      documentRevision: 1,
      units: [
        {
          unitId: 'unit-3',
          unitRevision: 1,
          issues: [
            {
              scope: 'local',
              severity: 'improvement',
              start,
              end,
              original: 'make a decision',
              replacement: 'decide',
              reason: 'Use the concise verb "decide".',
              category: 'word_choice',
            },
          ],
        },
      ],
    };

    const result = validateResponse(response, {
      requestId: 'req-wc-1',
      documentRevision: 1,
      units: [{ id: 'unit-3', revision: 1, type: 'sentence', text: unitText }],
    });

    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].issues[0].category).toBe('word_choice');
  });

  // 4. Non-English Content
  it('validates short non-English phrase as local issue and full non-English sentence as sentence issue', () => {
    // 4a. Short non-English phrase -> local
    const phraseText = 'I ordered a croissant for breakfast.';
    const croissantStart = phraseText.indexOf('croissant');
    const croissantEnd = croissantStart + 'croissant'.length;

    const phraseResponse = {
      schemaVersion: '1',
      requestId: 'req-ne-1',
      documentRevision: 1,
      units: [
        {
          unitId: 'unit-ne-1',
          unitRevision: 1,
          issues: [
            {
              scope: 'local',
              severity: 'improvement',
              start: croissantStart,
              end: croissantEnd,
              original: 'croissant',
              replacement: 'crescent roll',
              reason: 'Suggest English translation for clarity.',
              category: 'non_english',
            },
          ],
        },
      ],
    };

    const phraseResult = validateResponse(phraseResponse, {
      requestId: 'req-ne-1',
      documentRevision: 1,
      units: [{ id: 'unit-ne-1', revision: 1, type: 'sentence', text: phraseText }],
    });

    expect(phraseResult.valid).toHaveLength(1);

    // 4b. Complete non-English sentence -> sentence issue
    const sentenceText = 'Cest la vie.';
    const sentenceResponse = {
      schemaVersion: '1',
      requestId: 'req-ne-2',
      documentRevision: 1,
      units: [
        {
          unitId: 'unit-ne-2',
          unitRevision: 1,
          issues: [
            {
              scope: 'sentence',
              severity: 'problem',
              start: 0,
              end: sentenceText.length,
              original: sentenceText,
              replacement: 'That is life.',
              reason: 'Translate French sentence into English.',
              category: 'non_english',
            },
          ],
        },
      ],
    };

    const sentenceResult = validateResponse(sentenceResponse, {
      requestId: 'req-ne-2',
      documentRevision: 1,
      units: [{ id: 'unit-ne-2', revision: 1, type: 'sentence', text: sentenceText }],
    });

    expect(sentenceResult.valid).toHaveLength(1);
    expect(sentenceResult.valid[0].issues[0].category).toBe('non_english');
    expect(sentenceResult.valid[0].issues[0].scope).toBe('sentence');
  });

  // 5. Protected Spans Validation (URLs, Emails, Code)
  it('protects URLs, emails, and code snippets from local issue overlap', () => {
    const textWithProtected = 'Contact info: user@example.com or visit https://example.com/test and code `const value = 42;`.';
    const spans = protectedSpans(textWithProtected);

    expect(spans).toContainEqual({ start: textWithProtected.indexOf('user@example.com'), end: textWithProtected.indexOf('user@example.com') + 'user@example.com'.length });
    expect(spans).toContainEqual({ start: textWithProtected.indexOf('https://example.com/test'), end: textWithProtected.indexOf('https://example.com/test') + 'https://example.com/test'.length });
    expect(spans).toContainEqual({ start: textWithProtected.indexOf('`const value = 42;`'), end: textWithProtected.indexOf('`const value = 42;`') + '`const value = 42;`'.length });

    // Attempting a local issue on protected span "https://example.com/test"
    const urlStart = textWithProtected.indexOf('https://example.com/test');
    const urlEnd = urlStart + 'https://example.com/test'.length;

    const invalidResponse = {
      schemaVersion: '1',
      requestId: 'req-protected-1',
      documentRevision: 1,
      units: [
        {
          unitId: 'unit-prot-1',
          unitRevision: 1,
          issues: [
            {
              scope: 'local',
              severity: 'problem',
              start: urlStart,
              end: urlEnd,
              original: 'https://example.com/test',
              replacement: 'example link',
              reason: 'Do not flag URLs',
              category: 'other',
            },
          ],
        },
      ],
    };

    const validation = validateResponse(invalidResponse, {
      requestId: 'req-protected-1',
      documentRevision: 1,
      units: [{ id: 'unit-prot-1', revision: 1, type: 'sentence', text: textWithProtected }],
    });

    expect(validation.valid).toHaveLength(0);
    expect(validation.rejected).toContain('unit-prot-1');
  });

  // 6. Schema Violation Isolations
  it('rejects invalid issues with bad offsets, HTML tags in reasons, or identical replacement', () => {
    const text = 'This is a test sentence.';
    const badResponse = {
      schemaVersion: '1',
      requestId: 'req-bad-1',
      documentRevision: 1,
      units: [
        {
          unitId: 'unit-bad-1',
          unitRevision: 1,
          issues: [
            {
              scope: 'local',
              severity: 'problem',
              start: 0,
              end: 4,
              original: 'This',
              replacement: 'This', // Identical replacement!
              reason: 'Same text',
              category: 'spelling',
            },
          ],
        },
        {
          unitId: 'unit-bad-2',
          unitRevision: 1,
          issues: [
            {
              scope: 'local',
              severity: 'problem',
              start: 0,
              end: 4,
              original: 'This',
              replacement: 'That',
              reason: 'Contains <b>HTML</b> tag', // HTML tag forbidden in reason!
              category: 'grammar',
            },
          ],
        },
      ],
    };

    const val = validateResponse(badResponse, {
      requestId: 'req-bad-1',
      documentRevision: 1,
      units: [
        { id: 'unit-bad-1', revision: 1, type: 'sentence', text },
        { id: 'unit-bad-2', revision: 1, type: 'sentence', text },
      ],
    });

    expect(val.valid).toHaveLength(0);
    expect(val.rejected).toEqual(['unit-bad-1', 'unit-bad-2']);
  });

  // 7. Full Document Analysis Response Validation
  it('validates full document response structure without replacement field', () => {
    const validFull = {
      schemaVersion: '1',
      requestId: 'req-full-1',
      documentRevision: 1,
      severity: 'improvement',
      summary: 'The document maintains a professional tone.',
      suggestions: [
        {
          severity: 'improvement',
          title: 'Tone consistency',
          reason: 'Consider using active voice in section 2.',
        },
      ],
    };

    const parsed = validateFullDocumentResponse(validFull, {
      requestId: 'req-full-1',
      documentRevision: 1,
    });

    expect(parsed).toBeDefined();
    expect(parsed?.severity).toBe('improvement');
    expect(parsed?.suggestions).toHaveLength(1);

    // Invalid full response with 'replacement' field (Forbidden by Spec.md 7.4)
    const invalidFullWithReplacement = {
      ...validFull,
      replacement: 'Rewrite whole document text.',
    };

    const invalidParsed = validateFullDocumentResponse(invalidFullWithReplacement, {
      requestId: 'req-full-1',
      documentRevision: 1,
    });

    expect(invalidParsed).toBeUndefined();
  });

  // 8. Single and Multiple Replacement Plan Application
  it('applies multiple replacements in reverse offset order to maintain text bounds', () => {
    const originalText = 'Teh quick brown foxx jumps over teh lazy dog.';
    const replacements = [
      { start: 0, end: 3, original: 'Teh', replacement: 'The' },
      { start: 16, end: 20, original: 'foxx', replacement: 'fox' },
      { start: 32, end: 35, original: 'teh', replacement: 'the' },
    ];

    const result = applyPlan(originalText, replacements);
    expect(result.text).toBe('The quick brown fox jumps over the lazy dog.');
    expect(result.applied).toBe(3);
    expect(result.skipped).toBe(0);
  });
});
