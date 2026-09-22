const blocks = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'CAPTION', 'DD', 'DETAILS', 'DIV',
  'DL', 'DT', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5',
  'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION',
  'SUMMARY', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
]);

const structuralContainers = new Set([
  'COLGROUP', 'DL', 'OL', 'TABLE', 'TBODY', 'TFOOT', 'THEAD', 'TR', 'UL',
]);

function isIgnorableWhitespace(node: Node): boolean {
  if (node.nodeType !== Node.TEXT_NODE || (node.textContent ?? '').trim() !== '') {
    return false;
  }
  const parent = node.parentElement;
  if (!parent) return false;
  if (structuralContainers.has(parent.tagName)) {
    return true;
  }
  const prev = node.previousSibling;
  const next = node.nextSibling;
  const isBlock = (n: Node | null): boolean => n instanceof HTMLElement && blocks.has(n.tagName);
  return isBlock(prev) || isBlock(next);
}

export interface ContenteditableTextSegment {
  node: Text;
  start: number;
  end: number;
}

export interface ContenteditableTextModel {
  text: string;
  segments: ContenteditableTextSegment[];
}

/** Converts standard block and BR boundaries to canonical newlines and keeps
 * enough DOM mapping data to create safe Ranges without mutating the editor. */
export function buildContenteditableTextModel(root: HTMLElement): ContenteditableTextModel {
  let output = '';
  const segments: ContenteditableTextSegment[] = [];
  const appendLineBreak = (): void => {
    output += '\n';
  };
  const appendParagraphBreak = (): void => {
    if (!output) return;
    if (!output.endsWith('\n')) output += '\n';
    if (!output.endsWith('\n\n')) output += '\n';
  };
  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (isIgnorableWhitespace(node)) return;
      const value = node.textContent ?? '';
      const start = output.length;
      output += value;
      if (value) segments.push({ node: node as Text, start, end: output.length });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === 'BR') {
      appendLineBreak();
      return;
    }
    const block = blocks.has(node.tagName);
    if (block) appendParagraphBreak();
    node.childNodes.forEach(visit);
    if (block) appendParagraphBreak();
  };
  root.childNodes.forEach(visit);
  return { text: output.replace(/\n+$/, ''), segments };
}

export function readContenteditableText(root: HTMLElement): string {
  return buildContenteditableTextModel(root).text;
}

export function contentOffsetToDomPoint(
  model: ContenteditableTextModel,
  offset: number,
): { node: Text; offset: number } | undefined {
  if (!Number.isInteger(offset) || offset < 0 || offset > model.text.length) return undefined;
  for (const segment of model.segments) {
    if (offset >= segment.start && offset <= segment.end) {
      return { node: segment.node, offset: offset - segment.start };
    }
  }
  return undefined;
}

export function domPointToContentOffset(
  root: HTMLElement,
  model: ContenteditableTextModel,
  node: Node,
  offset: number,
): number | undefined {
  if (!root.contains(node) && node !== root) return undefined;
  if (node.nodeType === Node.TEXT_NODE) {
    const segment = model.segments.find((item) => item.node === node);
    if (segment) return segment.start + Math.max(0, Math.min(offset, segment.node.textContent?.length ?? 0));
    const following = model.segments.find((item) => (node.compareDocumentPosition(item.node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
    if (following) return following.start;
    const preceding = model.segments.filter((item) => (node.compareDocumentPosition(item.node) & Node.DOCUMENT_POSITION_PRECEDING) !== 0);
    if (preceding.length > 0) return preceding.at(-1)!.end;
    return model.text.length;
  }
  const container = node as Element;
  if (offset >= container.childNodes.length) {
    const contained = model.segments.filter((segment) => container.contains(segment.node));
    if (contained.length > 0) return contained.at(-1)!.end;
    const next = model.segments.find((segment) => (container.compareDocumentPosition(segment.node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
    return next ? next.start : model.text.length;
  }
  const child = container.childNodes[Math.max(0, offset)];
  if (child) {
    const next = model.segments.find((segment) => child === segment.node || child.contains(segment.node));
    if (next) return next.start;
    const following = model.segments.find((segment) => (child.compareDocumentPosition(segment.node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
    return following ? following.start : model.text.length;
  }
  return model.text.length;
}
