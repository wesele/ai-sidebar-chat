import { describe, expect, it } from 'vitest';
import { isExtensionMessage } from '../../src/shared/messages';
describe('message contract', () => {
  it('accepts only complete versioned commands', () => {
    const payload = { tabId: 7, editorId: 'e', revision: 1, scope: 'sentence', expectedCount: 2 };
    expect(isExtensionMessage({ v: 1, type: 'APPLY_ALL', correlationId: 'x', payload })).toBe(true);
    expect(isExtensionMessage({ v: 1, type: 'APPLY_ALL', correlationId: 'x', payload: { ...payload, scope: 'oops' } })).toBe(false);
    expect(isExtensionMessage({ v: 2, type: 'APPLY_ALL', correlationId: 'x', payload })).toBe(false);
  });
  it('validates bounded writing settings', () => { const payload = { providerId: 'p', modelId: 'm', invocationStrategy: 'parallel' as const, maxConcurrency: 3, activationMode: 'always' as const, fullDocumentCharacterLimit: 20000, writingStyle: 'practical' as const }; expect(isExtensionMessage({ v: 1, type: 'SETTINGS_UPDATED', correlationId: 'x', payload })).toBe(true); expect(isExtensionMessage({ v: 1, type: 'SETTINGS_UPDATED', correlationId: 'x', payload: { ...payload, writingStyle: 'strict' as never } })).toBe(false); expect(isExtensionMessage({ v: 1, type: 'SETTINGS_UPDATED', correlationId: 'x', payload: { ...payload, maxConcurrency: 7 } })).toBe(false); });
  it('validates non-negative batch application results', () => {
    expect(isExtensionMessage({
      v: 1, type: 'APPLY_RESULT', correlationId: 'x',
      payload: { tabId: 7, editorId: 'e', revision: 1, scope: 'sentence', applied: 2, skipped: 1, stale: false },
    })).toBe(true);
    expect(isExtensionMessage({
      v: 1, type: 'APPLY_RESULT', correlationId: 'x',
      payload: { tabId: 7, editorId: 'e', revision: 1, scope: 'sentence', applied: 2, skipped: -1, stale: false },
    })).toBe(false);
  });
});
