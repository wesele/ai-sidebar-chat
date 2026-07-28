import { describe, expect, it, vi } from 'vitest';
import { ContentEditableAdapter } from '../../src/content/adapters/contenteditable-adapter';

describe('ContentEditableAdapter safety', () => {
  it('plans a rich-text batch offline and commits it with one native command', () => {
    const element = document.createElement('div');
    element.contentEditable = 'true';
    element.innerHTML = '<p><strong>bad</strong> one</p><p><em>bad</em> two</p>';
    document.body.append(element);
    const adapter = new ContentEditableAdapter(element, 'e');
    const command = vi.fn((name: string, _showUi: boolean, value: string) => {
      expect(name).toBe('insertHTML');
      element.innerHTML = value;
      return true;
    });
    Object.assign(document, { execCommand: command });
    const input = vi.fn();
    element.addEventListener('input', input);
    expect(adapter.replaceRanges([
      { start: 0, end: 3, original: 'bad', replacement: 'good' },
      { start: 9, end: 12, original: 'bad', replacement: 'great' },
    ])).toEqual({ applied: 2, skipped: 0 });
    expect(command).toHaveBeenCalledTimes(1);
    expect(element.innerHTML).toBe('<p><strong>good</strong> one</p><p><em>great</em> two</p>');
    expect(input).toHaveBeenCalledTimes(1);
  });

  it('skips stale and overlapping items before committing valid items', () => {
    const element = document.createElement('div');
    element.contentEditable = 'true';
    element.innerHTML = '<p><strong>bad</strong> one</p><p><em>bad</em> two</p>';
    document.body.append(element);
    const adapter = new ContentEditableAdapter(element, 'e');
    Object.assign(document, { execCommand: vi.fn((_name: string, _showUi: boolean, value: string) => {
      element.innerHTML = value;
      return true;
    }) });
    expect(adapter.replaceRanges([
      { start: 0, end: 3, original: 'bad', replacement: 'good' },
      { start: 1, end: 3, original: 'ad', replacement: 'x' },
      { start: 9, end: 12, original: 'old', replacement: 'great' },
      { start: 9, end: 12, original: 'bad', replacement: 'great' },
    ])).toEqual({ applied: 2, skipped: 2 });
    expect(element.innerHTML).toContain('<strong>bx</strong>');
    expect(element.innerHTML).toContain('<em>great</em>');
  });

  it('does not write when beforeinput cancels the batch', () => {
    const element = document.createElement('div');
    element.contentEditable = 'true';
    element.innerHTML = '<p>bad one</p><p>bad two</p>';
    document.body.append(element);
    const adapter = new ContentEditableAdapter(element, 'e');
    const command = vi.fn(() => true);
    Object.assign(document, { execCommand: command });
    element.addEventListener('beforeinput', (event) => event.preventDefault());
    expect(adapter.replaceRanges([
      { start: 0, end: 3, original: 'bad', replacement: 'good' },
      { start: 9, end: 12, original: 'bad', replacement: 'great' },
    ])).toEqual({ applied: 0, skipped: 2 });
    expect(command).not.toHaveBeenCalled();
    expect(element.innerHTML).toBe('<p>bad one</p><p>bad two</p>');
  });
});
