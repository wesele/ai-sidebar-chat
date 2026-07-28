import { describe, expect, it, vi } from 'vitest';
import { applyAllForSession } from '../../src/content/apply-command';
import type { WritingSession } from '../../src/content/writing-session';

const command = {
  tabId: 7,
  editorId: 'editor-a',
  revision: 3,
  scope: 'sentence' as const,
  expectedCount: 2,
};

describe('revision-bound batch application', () => {
  it('does not write when the active editor or revision changed', () => {
    const applyAll = vi.fn(() => ({ applied: 2, skipped: 0 }));
    for (const current of [
      { editorId: 'editor-b', revision: 3 },
      { editorId: 'editor-a', revision: 4 },
    ]) {
      const session = {
        current: () => current,
        applyAll,
      } as unknown as Pick<WritingSession, 'current' | 'applyAll'>;
      expect(applyAllForSession(session, command)).toEqual({
        tabId: 7, editorId: 'editor-a', revision: 3, scope: 'sentence',
        applied: 0, skipped: 2, stale: true,
      });
    }
    expect(applyAll).not.toHaveBeenCalled();
  });

  it('applies only the matching session and binds the result to the command', () => {
    const applyAll = vi.fn(() => ({ applied: 1, skipped: 1 }));
    const session = {
      current: () => ({ editorId: 'editor-a', revision: 3 }),
      applyAll,
    } as unknown as Pick<WritingSession, 'current' | 'applyAll'>;
    expect(applyAllForSession(session, command)).toEqual({
      tabId: 7, editorId: 'editor-a', revision: 3, scope: 'sentence',
      applied: 1, skipped: 1, stale: false,
    });
    expect(applyAll).toHaveBeenCalledWith('sentence');
  });
});
