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

  it('uses a permissive practical English instruction by default', () => {
    const prompt = unitAnalysisPrompt({
      schemaVersion: '1', requestId: 'request-2', documentRevision: 1, targetLanguage: 'EN', units: [],
    });
    expect(prompt).toContain('be relatively permissive');
    expect(prompt).toContain('Do not flag an issue merely because a more elegant alternative exists');
  });

  it('uses a more precise and polished instruction for elegant English', () => {
    const prompt = unitAnalysisPrompt({
      schemaVersion: '1', requestId: 'request-3', documentRevision: 1, targetLanguage: 'EN', writingStyle: 'elegant', units: [],
    });
    expect(prompt).toContain('accurate and polished expression');
    expect(prompt).not.toContain('be relatively permissive');
  });

  it('requires minimal local spans instead of sentence rewrites', () => {
    const prompt = unitAnalysisPrompt({
      schemaVersion: '1', requestId: 'request-4', documentRevision: 1, targetLanguage: 'EN', units: [],
    });

    expect(prompt).toContain('Use the smallest natural span that fixes the error');
    expect(prompt).toContain('Gave" -> "Who gave');
    expect(prompt).toContain('What" -> "What\'s');
    expect(prompt).toContain('do not replace an entire sentence when a local replacement can express the fix');
  });
});
