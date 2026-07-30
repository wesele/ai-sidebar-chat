/**
 * ProseMirror-aware adapter for rich-text editors built on ProseMirror.
 *
 * Targets: Confluence Cloud (Atlassian Editor), and any other host that
 * renders a standard `div.ProseMirror[contenteditable="true"]` node.
 *
 * Write strategy (in priority order):
 *  1. Delegate to ContentEditableAdapter.replaceRanges() which uses
 *     document.execCommand().  ProseMirror's internal DOMObserver picks up the
 *     DOM mutation and converts it into a native Transaction, preserving the
 *     ProseMirror undo history.
 *  2. If beforeinput was cancelled by the host (all replacements skipped),
 *     attempt to dispatch a Transaction directly through ProseMirror's
 *     EditorView instance, which is attached to the DOM node as `.pmViewDesc.view`.
 *  3. If neither path succeeds, return { applied: 0, skipped: N } — safe failure
 *     per Spec §8.3: never silently corrupt content.
 *
 * Read / geometry operations are fully delegated to ContentEditableAdapter
 * because ProseMirror renders a standard contenteditable DOM tree.
 *
 * Self-registers with the adapter registry on module load (side-effect import).
 */

import type { Replacement } from '../../domain/analysis/apply-plan';
import type { TextRange } from '../../domain/text/paragraph-segmenter';
import type { EditorSnapshot } from '../../domain/text/snapshot';
import { ContentEditableAdapter } from './contenteditable-adapter';
import type { ApplyResult, EditorAdapter } from './editor-adapter';
import { registerSiteAdapter } from './adapter-registry';
import {
  buildContenteditableTextModel,
  contentOffsetToDomPoint,
} from './contenteditable-text';

// ---------------------------------------------------------------------------
// ProseMirrorAdapter
// ---------------------------------------------------------------------------

export class ProseMirrorAdapter implements EditorAdapter {
  readonly kind = 'contenteditable' as const;

  /** Handles all read / geometry operations. */
  private readonly delegate: ContentEditableAdapter;

  constructor(
    readonly element: HTMLElement,
    private readonly editorId: string,
  ) {
    this.delegate = new ContentEditableAdapter(element, editorId);
  }

  // -- read / geometry (fully delegated) ------------------------------------

  readSnapshot(): Readonly<EditorSnapshot> {
    return this.delegate.readSnapshot();
  }

  getCaretGeometry(): DOMRect | null {
    return this.delegate.getCaretGeometry();
  }

  getRangeGeometry(range: TextRange): DOMRect[] {
    return this.delegate.getRangeGeometry(range);
  }

  observe(callback: () => void): () => void {
    return this.delegate.observe(callback);
  }

  // -- write (ProseMirror-aware) --------------------------------------------

  replaceRanges(replacements: Replacement[]): ApplyResult {
    if (!replacements.length) return { applied: 0, skipped: 0 };

    // Path 1: standard execCommand path.
    // ProseMirror's DOMObserver detects the resulting DOM mutation and
    // creates a Transaction internally, so undo history is preserved.
    const result = this.delegate.replaceRanges(replacements);

    // Path 1 succeeded (at least partially) — return as-is.
    if (result.applied > 0) return result;

    // Path 1 was fully rejected (all skipped due to beforeinput cancellation
    // or execCommand returning false).  Try ProseMirror Transaction API.
    return this.replaceViaProseMirrorView(replacements);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Attempt to apply replacements by dispatching a ProseMirror Transaction
   * through the EditorView instance attached to the DOM.
   *
   * ProseMirror stores the view on the DOM node's `pmViewDesc.view` property
   * (an undocumented internal, but stable across all ProseMirror versions
   * since 1.0).  We feature-detect it defensively; if unavailable we safe-fail.
   */
  private replaceViaProseMirrorView(replacements: Replacement[]): ApplyResult {
    const view = getProseMirrorView(this.element);
    if (!view) return { applied: 0, skipped: replacements.length };

    const model = buildContenteditableTextModel(this.element);
    const text = model.text;

    // Validate and order replacements end-to-start (same logic as the domain
    // layer's planReplacements, mirrored here to avoid importing private fns).
    const valid: Replacement[] = [];
    let previousStart = Number.POSITIVE_INFINITY;

    for (const rep of [...replacements].sort((a, b) => b.start - a.start)) {
      const inBounds =
        Number.isInteger(rep.start) &&
        Number.isInteger(rep.end) &&
        rep.start >= 0 &&
        rep.end > rep.start &&
        rep.end <= text.length;
      if (
        !inBounds ||
        rep.end > previousStart ||
        text.slice(rep.start, rep.end) !== rep.original
      ) continue;
      valid.push(rep);
      previousStart = rep.start;
    }

    if (!valid.length) return { applied: 0, skipped: replacements.length };

    let applied = 0;
    let skipped = replacements.length - valid.length;

    try {
      // Build a single Transaction covering all replacements.
      // Replacements are already in end-to-start order so each step's
      // doc positions remain valid.
      let tr = view.state.tr as ProseMirrorTransaction;

      for (const rep of valid) {
        const fromPoint = contentOffsetToDomPoint(model, rep.start);
        const toPoint   = contentOffsetToDomPoint(model, rep.end);

        if (!fromPoint || !toPoint) { skipped++; continue; }

        // Translate DOM text-node positions to ProseMirror document positions.
        // posAtDOM(node, offset) returns -1 when the position is unresolvable.
        const from = view.posAtDOM(fromPoint.node, fromPoint.offset) as number;
        const to   = view.posAtDOM(toPoint.node,   toPoint.offset)   as number;

        if (from < 0 || to < 0 || from > to) { skipped++; continue; }

        const content = rep.replacement
          ? view.state.schema.text(rep.replacement) as ProseMirrorNode
          : null;

        tr = content
          ? (tr.replaceWith(from, to, content) as ProseMirrorTransaction)
          : (tr.delete(from, to) as ProseMirrorTransaction);

        applied++;
      }

      if (applied > 0) {
        // scrollIntoView() so the user can see the change.
        view.dispatch(tr.scrollIntoView());
      }
    } catch {
      // Any error from the undocumented PM API → safe failure.
      return { applied: 0, skipped: replacements.length };
    }

    return { applied, skipped };
  }
}

// ---------------------------------------------------------------------------
// ProseMirror view detection
// ---------------------------------------------------------------------------

/** Minimal structural type for what we access on ProseMirror EditorView. */
interface ProseMirrorView {
  state: {
    tr: ProseMirrorTransaction;
    schema: {
      text(text: string): ProseMirrorNode;
    };
  };
  dispatch(tr: ProseMirrorTransaction): void;
  posAtDOM(node: Node, offset: number): number;
}

interface ProseMirrorTransaction {
  replaceWith(from: number, to: number, content: ProseMirrorNode): ProseMirrorTransaction;
  delete(from: number, to: number): ProseMirrorTransaction;
  scrollIntoView(): ProseMirrorTransaction;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ProseMirrorNode {}

/**
 * Retrieve the ProseMirror EditorView instance attached to a DOM node.
 *
 * ProseMirror (prosemirror-view) stores the view on `node.pmViewDesc.view`
 * for the root `.ProseMirror` element.  This is an internal property but has
 * been consistent across all ProseMirror releases since v1.0.
 *
 * We validate the shape before use so a version change doesn't throw.
 */
function getProseMirrorView(element: HTMLElement): ProseMirrorView | undefined {
  const viewDesc = (element as unknown as Record<string, unknown>)['pmViewDesc'];
  if (!viewDesc || typeof viewDesc !== 'object') return undefined;
  const view = (viewDesc as Record<string, unknown>)['view'];
  if (
    !view ||
    typeof view !== 'object' ||
    typeof (view as Record<string, unknown>)['dispatch'] !== 'function' ||
    typeof (view as Record<string, unknown>)['posAtDOM'] !== 'function'
  ) return undefined;
  return view as ProseMirrorView;
}

// ---------------------------------------------------------------------------
// Confluence site adapter registration (self-registering side-effect)
// ---------------------------------------------------------------------------

/**
 * Detect whether an element is inside the Atlassian / Confluence ProseMirror
 * editor.  We check several signals in case Atlassian changes class names
 * between versions.
 *
 * Checked signals (any one is sufficient):
 *  - The element itself is `.ProseMirror[contenteditable]`
 *  - The element is inside `.ProseMirror`
 *  - The element carries `data-editor-type` (Atlassian Editor root)
 *  - The element is inside the Atlassian full-page editor content area
 *    (`[data-testid="ak-editor-fp-content-area"]`)
 *
 * Exported for unit testing; not part of the public adapter API.
 */
export function isConfluenceEditorElement(element: HTMLElement): boolean {
  // Accept both the standard property and the attribute value for compatibility
  // with jsdom (test env) where isContentEditable may not reflect attribute changes.
  const editable = element.isContentEditable || element.contentEditable === 'true';
  if (!editable) return false;
  if (element.classList.contains('ProseMirror')) return true;
  if (element.closest('.ProseMirror') !== null) return true;
  if (element.getAttribute('data-editor-type') !== null) return true;
  if (element.closest('[data-testid="ak-editor-fp-content-area"]') !== null) return true;
  return false;
}

/**
 * Resolve the actual `.ProseMirror` root element.
 * If the matched element is a child of `.ProseMirror`, walk up to the root.
 *
 * Exported for unit testing; not part of the public adapter API.
 */
export function resolveProseMirrorRoot(element: HTMLElement): HTMLElement {
  if (element.classList.contains('ProseMirror')) return element;
  const root = element.closest('.ProseMirror');
  return root instanceof HTMLElement ? root : element;
}

registerSiteAdapter({
  id: 'confluence-prosemirror',
  priority: 10,

  canHandle(element: HTMLElement): boolean {
    return isConfluenceEditorElement(element);
  },

  create(element: HTMLElement, editorId: string): EditorAdapter {
    return new ProseMirrorAdapter(resolveProseMirrorRoot(element), editorId);
  },
});
