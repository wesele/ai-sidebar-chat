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

  constructor(
    readonly element: HTMLInputElement | HTMLTextAreaElement,
    private readonly editorId: string,
  ) {
    this.kind = element instanceof HTMLTextAreaElement ? 'textarea' : 'input';
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

  private measureRange(range: TextRange): DOMRect[] {
    const value = this.element.value;
    if (range.start < 0 || range.end < range.start || range.end > value.length) return [];
    const editorRect = this.element.getBoundingClientRect();
    if (!editorRect.width || !editorRect.height) return [];
    const computed = getComputedStyle(this.element);
    const mirror = document.createElement('div');
    mirror.dataset.writingAssistant = 'text-mirror';
    Object.assign(mirror.style, {
      position: 'fixed',
      left: `${editorRect.left}px`,
      top: `${editorRect.top}px`,
      width: `${editorRect.width}px`,
      height: `${editorRect.height}px`,
      margin: '0',
      overflow: 'hidden',
      whiteSpace: this.kind === 'textarea' ? 'pre-wrap' : 'pre',
      visibility: 'hidden',
      pointerEvents: 'none',
      zIndex: '-1',
    });
    for (const property of copiedStyles) {
      mirror.style[property] = computed[property];
    }

    mirror.append(document.createTextNode(value.slice(0, range.start)));
    const marker = document.createElement('span');
    marker.textContent = range.start === range.end ? '\u200b' : value.slice(range.start, range.end);
    mirror.append(marker, document.createTextNode(value.slice(range.end) || '\u200b'));
    document.documentElement.append(mirror);
    mirror.scrollTop = this.element.scrollTop;
    mirror.scrollLeft = this.element.scrollLeft;
    const rects = Array.from(marker.getClientRects(), (rect) => DOMRect.fromRect(rect));
    mirror.remove();
    return rects.filter((rect) =>
      rect.bottom >= editorRect.top &&
      rect.top <= editorRect.bottom &&
      rect.right >= editorRect.left &&
      rect.left <= editorRect.right,
    );
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
