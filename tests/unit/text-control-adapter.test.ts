import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextControlAdapter } from '../../src/content/adapters/text-control-adapter';

describe('TextControlAdapter batch apply', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses one native edit command for all safe replacements', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'bad bad';
    document.body.append(textarea);
    const exec = vi.fn((_command: string, _showUi: boolean, value: string) => {
      textarea.setRangeText(value, textarea.selectionStart, textarea.selectionEnd, 'end');
      return true;
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: exec });
    const adapter = new TextControlAdapter(textarea, 'e');
    const result = adapter.replaceRanges([
      { start: 0, end: 3, original: 'bad', replacement: 'good' },
      { start: 4, end: 7, original: 'bad', replacement: 'great' },
    ]);
    expect(result).toEqual({ applied: 2, skipped: 0 });
    expect(textarea.value).toBe('good great');
    expect(exec).toHaveBeenCalledTimes(1);
  });
});
