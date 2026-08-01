import { describe, expect, it } from 'vitest';
import { unitAnalysisPrompt } from '../../src/background/analysis-prompt';

describe('unit analysis prompt', () => {
  it('requires non-target-language issues to include a target-language translation', () => {
    const prompt = unitAnalysisPrompt({
      schemaVersion: '1',
      requestId: 'request-1',
      documentRevision: 2,
      targetLanguage: 'EN',
      units: [{
        unitId: 'unit-1',
        unitRevision: 1,
        unitType: 'sentence',
        text: 'Cest la vie.',
        absoluteStart: 0,
      }],
    }, 'zh-CN');

    expect(prompt).toContain('For every issue with category "non_english"');
    expect(prompt).toContain('"replacement" must translate the exact "original" span into English');
    expect(prompt).toContain('provide its full English translation as "replacement"');
  });
});
