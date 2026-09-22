import type { EditorSnapshot, SourceKind } from '../../domain/text/snapshot'; import type { Replacement } from '../../domain/analysis/apply-plan'; import type { TextRange } from '../../domain/text/paragraph-segmenter';
export interface ApplyResult { applied: number; skipped: number; }
export interface EditorAdapter {
  readonly kind: SourceKind; readonly element: HTMLElement; readSnapshot(): Readonly<EditorSnapshot>; getCaretGeometry(): DOMRect | null; getRangeGeometry(range: TextRange): DOMRect[];
  /**
   * Batched variant of getRangeGeometry: measures all ranges while building
   * the underlying text model / mirror DOM only once. Falls back to repeated
   * getRangeGeometry calls when not implemented. The returned array aligns
   * positionally with the input ranges.
   */
  getRangesGeometry?(ranges: TextRange[]): DOMRect[][];
  replaceRanges(replacements: Replacement[]): ApplyResult; observe(callback: () => void): () => void;
}
