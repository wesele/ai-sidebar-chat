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

  it('separates table cells into distinct paragraph boundaries without concatenation', () => {
    const editor = document.createElement('div');
    editor.innerHTML = [
      '<table>',
      '  <thead><tr><th>Item</th><th>Priority</th><th>Remark</th></tr></thead>',
      '  <tbody>',
      '    <tr><td>Plan</td><td>The</td><td>Life</td></tr>',
      '    <tr><td>Eat</td><td></td><td></td></tr>',
      '  </tbody>',
      '</table>',
    ].join('');
    const model = buildContenteditableTextModel(editor);
    expect(model.text).toBe('Item\n\nPriority\n\nRemark\n\nPlan\n\nThe\n\nLife\n\nEat');
    expect(segmentParagraphs(model.text)).toHaveLength(7);

    // Verify DOM point mapping inside a table cell
    const planIndex = model.text.indexOf('Plan');
    const point = contentOffsetToDomPoint(model, planIndex + 2)!;
    expect(point.node.textContent).toBe('Plan');
    expect(point.offset).toBe(2);
    expect(domPointToContentOffset(editor, model, point.node, point.offset)).toBe(planIndex + 2);
  });
});
