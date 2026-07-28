const blocks = new Set([
  'ADDRESS', 'ARTICLE', 'BLOCKQUOTE', 'DIV', 'FIGCAPTION', 'H1', 'H2', 'H3',
  'H4', 'H5', 'H6', 'LI', 'P', 'PRE', 'SECTION',
]);

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
    return segment ? segment.start + Math.max(0, Math.min(offset, segment.end - segment.start)) : undefined;
  }
  const container = node as Element;
  if (offset >= container.childNodes.length) {
    const contained = model.segments.filter((segment) => container.contains(segment.node));
    return contained.at(-1)?.end ?? model.text.length;
  }
  const child = container.childNodes[Math.max(0, offset)];
  if (child) {
    const next = model.segments.find((segment) => child === segment.node || child.contains(segment.node));
    if (next) return next.start;
  }
  return model.text.length;
}
