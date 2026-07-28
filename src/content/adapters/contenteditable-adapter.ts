import type { Replacement } from '../../domain/analysis/apply-plan';
import type { TextRange } from '../../domain/text/paragraph-segmenter';
import { createSnapshot } from '../../domain/text/snapshot';
import type { ApplyResult, EditorAdapter } from './editor-adapter';
import {
  buildContenteditableTextModel,
  contentOffsetToDomPoint,
  domPointToContentOffset,
} from './contenteditable-text';

export class ContentEditableAdapter implements EditorAdapter {
  readonly kind = 'contenteditable' as const;
  private revision = 0;

  constructor(readonly element: HTMLElement, private readonly editorId: string) {}

  readSnapshot() {
    const model = buildContenteditableTextModel(this.element);
    const selection = window.getSelection();
    let normalizedSelection: { start: number; end: number } | null = null;
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      const start = domPointToContentOffset(this.element, model, range.startContainer, range.startOffset);
      const end = domPointToContentOffset(this.element, model, range.endContainer, range.endOffset);
      if (start !== undefined && end !== undefined) {
        normalizedSelection = { start: Math.min(start, end), end: Math.max(start, end) };
      }
    }
    return createSnapshot({
      editorId: this.editorId,
      documentRevision: ++this.revision,
      sourceKind: this.kind,
      source: model.text,
      selection: normalizedSelection,
      composing: false,
      createdAt: Date.now(),
    });
  }

  getCaretGeometry(): DOMRect | null {
    const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : undefined;
    if (!range || !this.element.contains(range.startContainer)) return null;
    return range.getClientRects()[0] ?? range.getBoundingClientRect() ?? null;
  }

  getRangeGeometry(textRange: TextRange): DOMRect[] {
    const model = buildContenteditableTextModel(this.element);
    const start = contentOffsetToDomPoint(model, textRange.start);
    const end = contentOffsetToDomPoint(model, textRange.end);
    if (!start || !end) return [];
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return Array.from(range.getClientRects(), (rect) => DOMRect.fromRect(rect));
  }

  replaceRanges(replacements: Replacement[]): ApplyResult {
    const initialModel = buildContenteditableTextModel(this.element);
    const { valid, skipped, text } = planReplacements(initialModel.text, replacements);
    if (!valid.length) return { applied: 0, skipped };

    if (valid.length === 1) {
      return this.replaceSingle(valid[0], skipped);
    }

    const plannedRoot = this.element.cloneNode(true) as HTMLElement;
    for (const replacement of valid) {
      const model = buildContenteditableTextModel(plannedRoot);
      const start = contentOffsetToDomPoint(model, replacement.start);
      const end = contentOffsetToDomPoint(model, replacement.end);
      if (!start || !end) return { applied: 0, skipped: replacements.length };
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      range.deleteContents();
      range.insertNode(document.createTextNode(replacement.replacement));
    }

    // The real editor is untouched until the complete detached plan has the exact
    // canonical text expected from the accepted replacement set.
    if (buildContenteditableTextModel(plannedRoot).text !== text) {
      return { applied: 0, skipped: replacements.length };
    }

    const selectionOffsets = this.captureSelection(initialModel);
    const selection = window.getSelection();
    const transactionRange = document.createRange();
    transactionRange.selectNodeContents(this.element);
    this.element.focus();
    selection?.removeAllRanges();
    selection?.addRange(transactionRange);

    const before = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertReplacementText',
      data: text,
    });
    if (!this.element.dispatchEvent(before)) {
      this.restoreSelection(selectionOffsets, []);
      return { applied: 0, skipped: replacements.length };
    }

    let inputObserved = false;
    const observeInput = (): void => { inputObserved = true; };
    this.element.addEventListener('input', observeInput, { once: true });
    if (!document.execCommand('insertHTML', false, plannedRoot.innerHTML)) {
      this.element.removeEventListener('input', observeInput);
      this.restoreSelection(selectionOffsets, []);
      return { applied: 0, skipped: replacements.length };
    }
    if (!inputObserved) {
      this.element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertReplacementText',
        data: text,
      }));
    }
    this.restoreSelection(selectionOffsets, valid);
    return { applied: valid.length, skipped };
  }

  private replaceSingle(replacement: Replacement, skipped: number): ApplyResult {
    const model = buildContenteditableTextModel(this.element);
    const start = contentOffsetToDomPoint(model, replacement.start);
    const end = contentOffsetToDomPoint(model, replacement.end);
    if (!start || !end) return { applied: 0, skipped: skipped + 1 };
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const before = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertReplacementText',
      data: replacement.replacement,
    });
    if (!this.element.dispatchEvent(before)) return { applied: 0, skipped: skipped + 1 };
    let inputObserved = false;
    const observeInput = (): void => { inputObserved = true; };
    this.element.addEventListener('input', observeInput, { once: true });
    if (!document.execCommand('insertText', false, replacement.replacement)) {
      this.element.removeEventListener('input', observeInput);
      return { applied: 0, skipped: skipped + 1 };
    }
    if (!inputObserved) {
      this.element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertReplacementText',
        data: replacement.replacement,
      }));
    }
    return { applied: 1, skipped };
  }

  private captureSelection(model: ReturnType<typeof buildContenteditableTextModel>): SelectionOffsets | undefined {
    const selection = window.getSelection();
    if (!selection?.anchorNode || !selection.focusNode) return undefined;
    const anchor = domPointToContentOffset(this.element, model, selection.anchorNode, selection.anchorOffset);
    const focus = domPointToContentOffset(this.element, model, selection.focusNode, selection.focusOffset);
    return anchor === undefined || focus === undefined ? undefined : { anchor, focus };
  }

  private restoreSelection(offsets: SelectionOffsets | undefined, replacements: Replacement[]): void {
    if (!offsets) return;
    const model = buildContenteditableTextModel(this.element);
    const anchor = contentOffsetToDomPoint(model, translateOffset(offsets.anchor, replacements));
    const focus = contentOffsetToDomPoint(model, translateOffset(offsets.focus, replacements));
    const selection = window.getSelection();
    if (!selection || !anchor || !focus) return;
    selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
  }

  observe(callback: () => void): () => void {
    this.element.addEventListener('input', callback);
    return () => this.element.removeEventListener('input', callback);
  }
}

interface SelectionOffsets {
  anchor: number;
  focus: number;
}

function planReplacements(text: string, replacements: Replacement[]): {
  valid: Replacement[];
  skipped: number;
  text: string;
} {
  const valid: Replacement[] = [];
  let output = text;
  let previousStart = Number.POSITIVE_INFINITY;
  for (const replacement of [...replacements].sort((a, b) => b.start - a.start)) {
    const inBounds = Number.isInteger(replacement.start) && Number.isInteger(replacement.end) &&
      replacement.start >= 0 && replacement.end > replacement.start && replacement.end <= text.length;
    if (!inBounds || replacement.end > previousStart ||
      text.slice(replacement.start, replacement.end) !== replacement.original) continue;
    valid.push(replacement);
    output = output.slice(0, replacement.start) + replacement.replacement + output.slice(replacement.end);
    previousStart = replacement.start;
  }
  return { valid, skipped: replacements.length - valid.length, text: output };
}

function translateOffset(offset: number, replacements: Replacement[]): number {
  let translated = offset;
  for (const replacement of [...replacements].sort((a, b) => a.start - b.start)) {
    if (offset < replacement.start) break;
    if (offset <= replacement.end) {
      return replacement.start + replacement.replacement.length;
    }
    translated += replacement.replacement.length - (replacement.end - replacement.start);
  }
  return translated;
}
