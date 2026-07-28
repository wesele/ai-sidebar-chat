import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnnotationRenderer } from '../../src/content/annotations/annotation-renderer';
import type { Issue } from '../../src/domain/analysis/issues';

const issue: Issue = {
  issueId: 'issue-1',
  scope: 'local',
  severity: 'problem',
  start: 2,
  end: 10,
  original: 'recieved',
  replacement: 'received',
  reason: 'Use the correct spelling.',
  category: 'spelling',
};

describe('AnnotationRenderer local issue', () => {
  afterEach(() => {
    document.body.replaceChildren();
    document.querySelectorAll('[data-writing-assistant="overlay"]').forEach((node) => node.remove());
    vi.unstubAllGlobals();
  });

  it('renders an accessible, clickable label at 80% of the editor font size', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const open = vi.fn();
    const apply = vi.fn();
    const renderer = new AnnotationRenderer(open, apply);
    renderer.setEditorFontSize('20px');
    renderer.updateDot(new DOMRect(20, 30, 100, 20), 'problem');
    renderer.render([issue], () => [new DOMRect(25, 35, 60, 18)]);

    const host = document.querySelector<HTMLElement>('[data-writing-assistant="overlay"]')!;
    const mark = host.shadowRoot!.querySelector<HTMLButtonElement>('.mark')!;
    expect(host.style.getPropertyValue('--writing-label-font-size')).toBe('16px');
    expect(host.dataset.issueCount).toBe('1');
    expect(mark.textContent).toBe('received');
    expect(mark.title).toBe('Use the correct spelling.');
    expect(mark.getAttribute('aria-label')).toContain('Use the correct spelling.');
    expect(mark.style.height).toBe('auto');
    mark.click();
    expect(apply).toHaveBeenCalledWith('issue-1');

    host.shadowRoot!.querySelector<HTMLButtonElement>('.dot')!.click();
    expect(open).toHaveBeenCalledOnce();
    renderer.clear();
    expect(document.querySelector('[data-writing-assistant="overlay"]')).toBeNull();
  });
});
