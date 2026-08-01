import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnnotationRenderer, splitAcrossRects } from '../../src/content/annotations/annotation-renderer';
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
const sentenceIssue: Issue = {
  ...issue,
  issueId: 'sentence-1',
  scope: 'sentence',
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
    expect(mark.style.left).toBe('23px');
    expect(mark.style.top).toBe('35px');
    mark.click();
    expect(apply).toHaveBeenCalledWith('issue-1');

    host.shadowRoot!.querySelector<HTMLButtonElement>('.dot')!.click();
    expect(open).toHaveBeenCalledOnce();
    renderer.clear();
    expect(document.querySelector('[data-writing-assistant="overlay"]')).toBeNull();
  });

  it('places wavy sentence underlines below the text range', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const renderer = new AnnotationRenderer(vi.fn(), vi.fn());
    renderer.render([sentenceIssue], () => [new DOMRect(25, 35, 60, 18)]);

    const host = document.querySelector<HTMLElement>('[data-writing-assistant="overlay"]')!;
    const underline = host.shadowRoot!.querySelector<HTMLElement>('.under')!;
    expect(underline.style.top).toBe('53px');
    expect(underline.style.height).toBe('4px');
    expect(host.shadowRoot!.querySelector('style')?.textContent).toContain("stroke-width='1.05'");
  });

  it('renders one wrapped replacement label for a range with multiple rectangles', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const renderer = new AnnotationRenderer(vi.fn(), vi.fn());
    renderer.render([{ ...issue, replacement: 'a much longer replacement that can wrap' }], () => [
      new DOMRect(25, 35, 60, 18),
      new DOMRect(25, 53, 60, 18),
    ]);

    const host = document.querySelector<HTMLElement>('[data-writing-assistant="overlay"]')!;
    const marks = host.shadowRoot!.querySelectorAll<HTMLButtonElement>('.mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('a much longer replacement that can wrap');
    expect(host.shadowRoot!.querySelector('style')?.textContent).toContain('white-space:normal');
  });

  it('splits replacement text across original line rectangles', () => {
    const fitPrefix = (text: string, width: number): number =>
      Math.min(text.length, Math.floor(width / 10) * 2);
    const rects = [new DOMRect(0, 0, 100, 18), new DOMRect(0, 18, 80, 18), new DOMRect(0, 36, 40, 18)];
    expect(splitAcrossRects('abcdefghijklmnopqrstuvwxyz0123456789', rects, fitPrefix)).toEqual([
      'abcdefghijklmnopqrst',
      'uvwxyz0123456789',
    ]);
    expect(splitAcrossRects('abcdef', rects, fitPrefix)).toEqual(['abcdef']);
    expect(splitAcrossRects('abcdefghijklmnopqrstuvwxyz0123456789', rects, () => 4)).toEqual([
      'abcd',
      'efgh',
      'ijklmnopqrstuvwxyz0123456789',
    ]);
    expect(splitAcrossRects('', rects, fitPrefix)).toEqual([]);
  });

  it('applies configured replacement label appearance', () => {
    const renderer = new AnnotationRenderer(vi.fn(), vi.fn());
    renderer.setEditorFontSize('20px');
    renderer.setReplacementAppearance(0.7, '#123456', '#abcdef');

    const host = document.querySelector<HTMLElement>('[data-writing-assistant="overlay"]')!;
    expect(host.style.getPropertyValue('--writing-label-font-size')).toBe('14px');
    expect(host.style.getPropertyValue('--writing-label-color')).toBe('#123456');
    expect(host.style.getPropertyValue('--writing-label-background')).toBe('#abcdef');
  });

  it('renders the latest issue set when updates arrive in the same frame', () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    const renderer = new AnnotationRenderer(vi.fn(), vi.fn());
    const secondIssue = { ...issue, issueId: 'issue-2', replacement: 'better' };

    renderer.render([issue], () => [new DOMRect(10, 10, 20, 10)]);
    renderer.render([issue, secondIssue], () => [new DOMRect(10, 10, 20, 10)]);
    frame?.(0);

    const host = document.querySelector<HTMLElement>('[data-writing-assistant="overlay"]')!;
    expect(host.shadowRoot!.querySelectorAll('.mark')).toHaveLength(2);
    expect(host.dataset.issueCount).toBe('2');
  });
});
