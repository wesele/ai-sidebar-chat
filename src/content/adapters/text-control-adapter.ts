import { applyPlan, type Replacement } from '../../domain/analysis/apply-plan';
import type { TextRange } from '../../domain/text/paragraph-segmenter';
import { createSnapshot, type SourceKind } from '../../domain/text/snapshot';
import type { ApplyResult, EditorAdapter } from './editor-adapter';

const copiedStyles = [
  'boxSizing',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'fontVariant',
  'letterSpacing',
  'lineHeight',
  'textAlign',
  'textIndent',
  'textTransform',
  'wordSpacing',
  'tabSize',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderTopStyle',
  'borderRightStyle',
  'borderBottomStyle',
  'borderLeftStyle',
  'overflowWrap',
  'wordBreak',
] as const;

export class TextControlAdapter implements EditorAdapter {
  readonly kind: SourceKind;
  private revision = 0;
  private mirror?: HTMLDivElement;
  private lastStyleCache?: string;

  constructor(
    readonly element: HTMLInputElement | HTMLTextAreaElement,
    private readonly editorId: string,
  ) {
    this.kind = element instanceof HTMLTextAreaElement ? 'textarea' : 'input';
  }

  private ensureMirror(): HTMLDivElement {
    if (this.mirror && this.mirror.isConnected) return this.mirror;
    const mirror = document.createElement('div');
    mirror.dataset.writingAssistant = 'text-mirror';
    Object.assign(mirror.style, {
      position: 'fixed',
      margin: '0',
      overflow: 'hidden',
      whiteSpace: this.kind === 'textarea' ? 'pre-wrap' : 'pre',
      visibility: 'hidden',
      pointerEvents: 'none',
      zIndex: '-1',
    });
    document.documentElement.append(mirror);
    this.mirror = mirror;
    this.lastStyleCache = undefined;
    return mirror;
  }

  readSnapshot() {
    return createSnapshot({
      editorId: this.editorId,
      documentRevision: ++this.revision,
      sourceKind: this.kind,
      source: this.element.value,
      selection: {
        start: this.element.selectionStart ?? 0,
        end: this.element.selectionEnd ?? 0,
      },
      composing: false,
      createdAt: Date.now(),
    });
  }

  getCaretGeometry(): DOMRect | null {
    const caret = this.element.selectionStart;
    if (caret === null) return null;
    return this.measureRange({ start: caret, end: caret })[0] ?? null;
  }

  getRangeGeometry(range: TextRange): DOMRect[] {
    return this.measureRange(range);
  }

  getRangesGeometry(ranges: TextRange[]): DOMRect[][] {
    // Measure all ranges with as few mirror DOM round-trips as possible.
    // Non-overlapping ranges share one mirror (one append/layout/remove);
    // overlapping ranges are split into the minimal number of mirrors since
    // flat marker spans cannot represent overlaps.
    const ordered = ranges
      .map((range, index) => ({ range, index }))
      .sort((a, b) => a.range.start - b.range.start || a.range.end - b.range.end);
    const batches: Array<typeof ordered> = [];
    for (const entry of ordered) {
      const current = batches[batches.length - 1];
      const last = current?.[current.length - 1];
      if (current && last && entry.range.start >= last.range.end) {
        current.push(entry);
      } else {
        batches.push([entry]);
      }
    }
    const results: DOMRect[][] = ranges.map(() => []);
    for (const batch of batches) {
      const measured = this.measureRanges(batch.map((entry) => entry.range));
      batch.forEach((entry, position) => {
        results[entry.index] = measured[position] ?? [];
      });
    }
    return results;
  }

  private measureRange(range: TextRange): DOMRect[] {
    return this.measureRanges([range])[0] ?? [];
  }

  private measureRanges(ranges: TextRange[]): DOMRect[][] {
    const value = this.element.value;
    const editorRect = this.element.getBoundingClientRect();
    const empty = ranges.map(() => [] as DOMRect[]);
    if (!editorRect.width || !editorRect.height) return empty;
    // Caller guarantees non-overlapping ranges sorted by start; validate
    // defensively and only measure the valid ones.
    const valid = ranges
      .map((range, index) => ({ range, index }))
      .filter(({ range }) => range.start >= 0 && range.end >= range.start && range.end <= value.length);
    if (!valid.length) return empty;
    const computed = getComputedStyle(this.element);
    const mirror = this.ensureMirror();
    mirror.style.left = `${editorRect.left}px`;
    mirror.style.top = `${editorRect.top}px`;
    mirror.style.width = `${editorRect.width}px`;
    mirror.style.height = `${editorRect.height}px`;

    // Only re-apply copied font and layout styles when font/padding/box sizing changes
    const currentStyleKey = `${computed.fontFamily}:${computed.fontSize}:${computed.lineHeight}:${computed.paddingTop}:${computed.paddingLeft}:${computed.boxSizing}`;
    if (this.lastStyleCache !== currentStyleKey) {
      for (const property of copiedStyles) {
        mirror.style[property] = computed[property];
      }
      this.lastStyleCache = currentStyleKey;
    }

    // One mirror for all ranges: text nodes between markers keep every marker
    // at exactly the position it would have in a single-range mirror.
    mirror.textContent = '';
    const markers = valid.map(({ range }) => {
      const marker = document.createElement('span');
      marker.textContent = range.start === range.end ? '\u200b' : value.slice(range.start, range.end);
      return marker;
    });
    let cursor = 0;
    valid.forEach(({ range }, position) => {
      mirror.append(document.createTextNode(value.slice(cursor, range.start)));
      mirror.append(markers[position]!);
      cursor = range.end;
    });
    mirror.append(document.createTextNode(value.slice(cursor) || '\u200b'));
    mirror.scrollTop = this.element.scrollTop;
    mirror.scrollLeft = this.element.scrollLeft;
    const results = empty;
    valid.forEach(({ index }, position) => {
      const rects = Array.from(markers[position]!.getClientRects(), (rect) => DOMRect.fromRect(rect));
      results[index] = rects.filter((rect) =>
        rect.bottom >= editorRect.top &&
        rect.top <= editorRect.bottom &&
        rect.right >= editorRect.left &&
        rect.left <= editorRect.right,
      );
    });
    mirror.textContent = '';
    return results;
  }

  replaceRanges(replacements: Replacement[]): ApplyResult {
    if (replacements.length > 1) {
      const planned = applyPlan(this.element.value, replacements);
      if (!planned.applied) return { applied: 0, skipped: planned.skipped };
      this.element.focus();
      this.element.setSelectionRange(0, this.element.value.length);
      const before = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertReplacementText',
        data: planned.text,
      });
      if (!this.element.dispatchEvent(before)) {
        return { applied: 0, skipped: replacements.length };
      }
      let inputObserved = false;
      this.element.addEventListener('input', () => { inputObserved = true; }, { once: true });
      if (!document.execCommand('insertText', false, planned.text)) {
        return { applied: 0, skipped: replacements.length };
      }
      if (!inputObserved) {
        this.element.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          inputType: 'insertReplacementText',
          data: planned.text,
        }));
      }
      return { applied: planned.applied, skipped: planned.skipped };
    }
    let applied = 0;
    let skipped = 0;
    for (const replacement of [...replacements].sort((a, b) => b.start - a.start)) {
      if (this.element.value.slice(replacement.start, replacement.end) !== replacement.original) {
        skipped += 1;
        continue;
      }
      this.element.focus();
      this.element.setSelectionRange(replacement.start, replacement.end);
      const before = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertReplacementText',
        data: replacement.replacement,
      });
      if (!this.element.dispatchEvent(before)) {
        skipped += 1;
        continue;
      }
      let inputObserved = false;
      this.element.addEventListener('input', () => { inputObserved = true; }, { once: true });
      if (!document.execCommand('insertText', false, replacement.replacement)) {
        skipped += 1;
        continue;
      }
      if (!inputObserved) {
        this.element.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          inputType: 'insertReplacementText',
          data: replacement.replacement,
        }));
      }
      applied += 1;
    }
    return { applied, skipped };
  }

  observe(callback: () => void): () => void {
    this.element.addEventListener('input', callback);
    return () => this.element.removeEventListener('input', callback);
  }
}
