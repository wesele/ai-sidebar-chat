import { describe, expect, it, vi } from 'vitest';
import { WritingAssistantPanel } from '../../src/sidepanel/app';

const state = {
  editorId: 'e',
  revision: 1,
  status: 'analyzed',
  counts: { local: 1, sentence: 0, paragraph: 0 },
  batchPreviews: { local: [], sentence: [], paragraph: [] },
};

describe('writing side panel state dedup', () => {
  it('skips full re-render for identical consecutive states', () => {
    const root = document.createElement('div');
    const panel = new WritingAssistantPanel(root, vi.fn(async () => undefined), vi.fn());
    const replaceChildren = vi.spyOn(root, 'replaceChildren');
    panel.setState({ ...state }, 7);
    expect(replaceChildren).toHaveBeenCalledTimes(1);
    // Identical caret-move/scroll publishes must not rebuild the panel DOM.
    panel.setState({ ...state }, 7);
    panel.setState({ ...state }, 7);
    expect(replaceChildren).toHaveBeenCalledTimes(1);
    // A changed state still renders.
    panel.setState({ ...state, revision: 2 }, 7);
    expect(replaceChildren).toHaveBeenCalledTimes(2);
  });

  it('renders again after clearState even with equal content', () => {
    const root = document.createElement('div');
    const panel = new WritingAssistantPanel(root, vi.fn(async () => undefined), vi.fn());
    const replaceChildren = vi.spyOn(root, 'replaceChildren');
    panel.setState({ ...state }, 7);
    expect(replaceChildren).toHaveBeenCalledTimes(1);
    panel.clearState(7);
    panel.setState({ ...state }, 7);
    expect(replaceChildren).toHaveBeenCalledTimes(3);
  });

  it('re-renders when only currentParagraphIssues changes on caret move', () => {
    const root = document.createElement('div');
    const panel = new WritingAssistantPanel(root, vi.fn(async () => undefined), vi.fn());
    const replaceChildren = vi.spyOn(root, 'replaceChildren');
    const issueA = { issueId: 'l1', original: '表头 2', replacement: 'Header 2', reason: 'use English' };
    const issueB = { issueId: 'l2', original: 'you problem', replacement: 'your problem', reason: 'grammar' };
    // Caret in paragraph A: local issues only, no sentence/paragraph-scope
    // issue under the caret — all other fingerprint fields stay constant.
    panel.setState({ ...state, currentParagraphIssues: [issueA] }, 7);
    expect(replaceChildren).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain('表头 2 → Header 2');
    // Caret moved to paragraph B: same counts/revision/status, different list.
    panel.setState({ ...state, currentParagraphIssues: [issueB] }, 7);
    expect(replaceChildren).toHaveBeenCalledTimes(2);
    expect(root.textContent).toContain('you problem → your problem');
    expect(root.textContent).not.toContain('表头 2 → Header 2');
    // Identical paragraph issues must still dedup.
    panel.setState({ ...state, currentParagraphIssues: [issueB] }, 7);
    expect(replaceChildren).toHaveBeenCalledTimes(2);
    // Moving to a paragraph without issues clears the stale cards.
    panel.setState({ ...state, currentParagraphIssues: undefined }, 7);
    expect(replaceChildren).toHaveBeenCalledTimes(3);
    expect(root.textContent).not.toContain('you problem → your problem');
  });
});
