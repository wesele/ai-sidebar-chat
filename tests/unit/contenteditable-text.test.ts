import { describe, expect, it } from 'vitest';
import {
  buildContenteditableTextModel,
  contentOffsetToDomPoint,
  domPointToContentOffset,
} from '../../src/content/adapters/contenteditable-text';
import { segmentParagraphs } from '../../src/domain/text/paragraph-segmenter';

describe('contenteditable canonical text', () => {
  it('turns block elements and consecutive BRs into paragraph boundaries', () => {
    const editor = document.createElement('div');
    editor.innerHTML = '<p>First.</p><p>Second.</p><div>Third.<br><br>Fourth.</div>';
    const model = buildContenteditableTextModel(editor);
    expect(model.text).toBe('First.\n\nSecond.\n\nThird.\n\nFourth.');
    expect(segmentParagraphs(model.text)).toHaveLength(4);
  });

  it('maps canonical offsets to DOM text points in both directions', () => {
    const editor = document.createElement('div');
    editor.innerHTML = '<p>First.</p><p><strong>Second.</strong></p>';
    const model = buildContenteditableTextModel(editor);
    const second = model.text.indexOf('Second');
    const point = contentOffsetToDomPoint(model, second + 3)!;
    expect(point.node.textContent).toBe('Second.');
    expect(point.offset).toBe(3);
    expect(domPointToContentOffset(editor, model, point.node, point.offset)).toBe(second + 3);
  });
});
