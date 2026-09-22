import { describe, expect, it, vi } from 'vitest';
import { ContentEditableAdapter } from '../../src/content/adapters/contenteditable-adapter';
import { TextControlAdapter } from '../../src/content/adapters/text-control-adapter';

const rect = { width: 400, height: 80, top: 0, left: 0, right: 400, bottom: 80 } as DOMRect;

describe('adapter batched geometry', () => {
  it('contenteditable batch matches single-range measurement positionally', () => {
    if (typeof Range !== 'undefined' && typeof Range.prototype.getClientRects !== 'function') {
      Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
    }
    document.body.innerHTML = '<div id="ed" contenteditable="true"><p>Hello world, this is a test.</p></div>';
    const element = document.querySelector<HTMLElement>('#ed')!;
    const adapter = new ContentEditableAdapter(element, 'e1');
    const ranges = [
      { start: 0, end: 5 },
      { start: 6, end: 11 },
      { start: 0, end: 29 },
      { start: 999, end: 1005 },
    ];
    const batched = adapter.getRangesGeometry!(ranges);
    expect(batched).toHaveLength(ranges.length);
    ranges.forEach((range, index) => {
      expect(batched[index]).toEqual(adapter.getRangeGeometry(range));
    });
    document.body.replaceChildren();
  });

  it('textarea batch measures non-overlapping ranges with a single mirror', () => {
    const editor = document.createElement('textarea');
    editor.value = 'First sentence here. Second sentence here. Third one.';
    vi.spyOn(editor, 'getBoundingClientRect').mockReturnValue(rect);
    document.body.append(editor);
    const adapter = new TextControlAdapter(editor, 'e2');
    const append = vi.spyOn(document.documentElement, 'append');
    const ranges = [
      { start: 0, end: 5 },
      { start: 21, end: 27 },
      { start: 44, end: 49 },
    ];
    const batched = adapter.getRangesGeometry!(ranges);
    // One shared mirror for the whole batch (previously one mirror per issue).
    const mirrors = append.mock.calls.filter((args) =>
      (args[0] as HTMLElement)?.dataset?.writingAssistant === 'text-mirror',
    );
    expect(mirrors).toHaveLength(1);
    append.mockRestore();
    expect(batched).toHaveLength(3);
    batched.forEach((rects, index) => {
      expect(rects).toEqual(adapter.getRangeGeometry(ranges[index]!));
    });
    document.body.replaceChildren();
  });

  it('textarea batch keeps positional mapping with overlapping ranges', () => {
    const editor = document.createElement('textarea');
    editor.value = 'First sentence here. Second sentence here.';
    vi.spyOn(editor, 'getBoundingClientRect').mockReturnValue(rect);
    document.body.append(editor);
    const adapter = new TextControlAdapter(editor, 'e3');
    const ranges = [
      { start: 0, end: 20 },
      { start: 6, end: 12 },
      { start: 21, end: 30 },
    ];
    const batched = adapter.getRangesGeometry!(ranges);
    expect(batched).toHaveLength(3);
    batched.forEach((rects, index) => {
      expect(rects).toEqual(adapter.getRangeGeometry(ranges[index]!));
    });
    document.body.replaceChildren();
  });

  it('textarea batch rejects out-of-bounds ranges', () => {
    const editor = document.createElement('textarea');
    editor.value = 'Short text.';
    vi.spyOn(editor, 'getBoundingClientRect').mockReturnValue(rect);
    document.body.append(editor);
    const adapter = new TextControlAdapter(editor, 'e4');
    expect(adapter.getRangesGeometry!([{ start: -1, end: 3 }])).toEqual([[]]);
    expect(adapter.getRangesGeometry!([{ start: 2, end: 500 }])).toEqual([[]]);
    document.body.replaceChildren();
  });
});
