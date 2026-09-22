import type { Issue } from '../../domain/analysis/issues';

export type DotState = 'hidden' | 'unavailable' | 'analyzing' | 'problem' | 'improvement' | 'ready';

const DOT_SIZE = 8;
const DOT_EDGE_GAP = 6;
const LABEL_FONT_SCALE = 0.8;
const LABEL_LINE_HEIGHT = 0.75;
const LABEL_PADDING_PX = 3;
const UNDERLINE_HEIGHT = 4;
const UNDERLINE_STROKE_WIDTH = 1.05;
const DEFAULT_LABEL_COLOR = '#b85000';
const DEFAULT_LABEL_BACKGROUND = '#fff3e680';
const DEFAULT_LABEL_FONT_FAMILY = 'Aptos';
const MIN_SEGMENT_WIDTH = 24;

export function splitAcrossRects(
  text: string,
  rects: ReadonlyArray<{ width: number }>,
  fitPrefix: (text: string, width: number) => number,
): string[] {
  const segments: string[] = [];
  let remaining = text;
  for (let index = 0; index < rects.length && remaining.length > 0; index++) {
    const width = Math.max(MIN_SEGMENT_WIDTH, rects[index].width);
    if (index === rects.length - 1) {
      segments.push(remaining);
      break;
    }
    const count = Math.max(1, fitPrefix(remaining, width));
    segments.push(remaining.slice(0, count));
    remaining = remaining.slice(count);
  }
  return segments;
}

export function dotState(
  active: boolean,
  hasModel: boolean,
  analyzing: boolean,
  severity?: 'problem' | 'improvement',
): DotState {
  if (!active) return 'hidden';
  if (!hasModel) return 'unavailable';
  if (analyzing) return 'analyzing';
  return severity ?? 'ready';
}

export class AnnotationRenderer {
  private host?: HTMLElement;
  private root?: ShadowRoot;
  private dot?: HTMLButtonElement;
  private measure?: HTMLDivElement;
  private pending = false;
  private renderFrame?: number;
  private queuedRender?: { issues: Issue[]; rectFor: (issue: Issue) => DOMRect[] };
  private editorFontSize = 16;
  private replacementFontScale = LABEL_FONT_SCALE;
  private editorFontFamily = DEFAULT_LABEL_FONT_FAMILY;
  /** Live annotation nodes keyed by issueId for reuse across renders. */
  private marks = new Map<string, HTMLElement[]>();
  /** Canvas fitPrefix results: text+width+font → char count. */
  private fitCache = new Map<string, number>();

  constructor(
    private readonly onDot: () => void,
    private readonly onIssue?: (issueId: string) => void,
  ) {}

  mount(): void {
    if (this.host) return;
    this.host = document.createElement('div');
    this.host.dataset.writingAssistant = 'overlay';
    this.host.dataset.issueCount = '0';
    this.host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    document.documentElement.append(this.host);
    this.root = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .dot,.mark{position:fixed;pointer-events:auto}
      .dot{display:block;box-sizing:border-box;appearance:none;padding:0;border:0;border-radius:50%;width:${DOT_SIZE}px;height:${DOT_SIZE}px}
      .ready,.analyzing{background:#159947}.unavailable{background:#777}
      .problem{background:#e57917}.improvement{background:#2878d4}
       .under{position:fixed;height:${UNDERLINE_HEIGHT}px;background-repeat:repeat-x;background-position:left bottom;background-size:8px ${UNDERLINE_HEIGHT}px}
       .under.problem{background-color:transparent;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='4' viewBox='0 0 8 4'%3E%3Cpath d='M0 2 Q2 0 4 2 T8 2' fill='none' stroke='%23e57917' stroke-width='${UNDERLINE_STROKE_WIDTH}'/%3E%3C/svg%3E")}
       .under.improvement{background-color:transparent;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='4' viewBox='0 0 8 4'%3E%3Cpath d='M0 2 Q2 0 4 2 T8 2' fill='none' stroke='%232878d4' stroke-width='${UNDERLINE_STROKE_WIDTH}'/%3E%3C/svg%3E")}
       .paragraph{position:fixed;width:3px}
       .mark{font-family:var(--writing-label-font-family,${DEFAULT_LABEL_FONT_FAMILY});font-size:var(--writing-label-font-size,80%);line-height:${LABEL_LINE_HEIGHT};
         color:var(--writing-label-color,${DEFAULT_LABEL_COLOR});background:var(--writing-label-background,${DEFAULT_LABEL_BACKGROUND});border:0;border-radius:2px;padding:${LABEL_PADDING_PX}px;white-space:normal;overflow-wrap:anywhere;max-width:calc(100vw - 16px);box-sizing:border-box;transform:translateY(calc(-100% + 5px))}
      .analyzing{animation:wa-pulse 1.5s infinite}
      @keyframes wa-pulse{
        0%{transform:scale(.95);opacity:1}
        70%{transform:scale(1.12);opacity:.65}
        100%{transform:scale(.95);opacity:1}
      }
      @media(prefers-reduced-motion:reduce){.analyzing{animation:none}}
    `;
    this.root.append(style);
    this.dot = document.createElement('button');
    this.dot.className = 'dot ready';
    this.dot.type = 'button';
    this.dot.setAttribute('aria-label', '打开写作助手：可用');
    this.dot.addEventListener('click', this.onDot);
    this.root.append(this.dot);
  }

  setEditorFontSize(fontSize: string): void {
    this.mount();
    const pixels = Number.parseFloat(fontSize);
    if (this.host && Number.isFinite(pixels) && pixels > 0) {
      this.editorFontSize = pixels;
      this.host.style.setProperty('--writing-label-font-size', `${pixels * this.replacementFontScale}px`);
    }
  }

  setEditorFontFamily(fontFamily: string): void {
    this.mount();
    const normalized = fontFamily.trim();
    this.editorFontFamily = normalized || DEFAULT_LABEL_FONT_FAMILY;
    this.host?.style.setProperty('--writing-label-font-family', this.editorFontFamily);
    if (this.measure) this.measure.style.fontFamily = this.editorFontFamily;
  }

  setReplacementAppearance(fontScale: number, textColor: string, backgroundColor: string): void {
    this.mount();
    this.replacementFontScale = Number.isFinite(fontScale)
      ? Math.min(2, Math.max(0.25, fontScale))
      : LABEL_FONT_SCALE;
    if (!this.host) return;
    this.host.style.setProperty('--writing-label-font-size', `${this.editorFontSize * this.replacementFontScale}px`);
    this.host.style.setProperty('--writing-label-color', validColor(textColor) ? textColor : DEFAULT_LABEL_COLOR);
    this.host.style.setProperty('--writing-label-background', validColor(backgroundColor) ? backgroundColor : DEFAULT_LABEL_BACKGROUND);
  }

  updateDot(rect: DOMRect | null, state: DotState, editorRect?: DOMRect | null): void {
    this.mount();
    if (!this.dot || !this.host) return;
    this.host.dataset.dotState = state;
    this.dot.hidden = !rect || state === 'hidden';
    this.dot.className = `dot ${state}`;
    const labels: Record<DotState, string> = {
      hidden: '未激活',
      unavailable: '等待配置模型',
      analyzing: '正在检测',
      problem: '发现明显问题',
      improvement: '发现可改进建议',
      ready: '可用',
    };
    this.dot.setAttribute('aria-label', `打开写作助手：${labels[state]}`);
    if (rect) {
      const rightEdge = editorRect
        ? editorRect.right - DOT_SIZE - DOT_EDGE_GAP
        : rect.right - DOT_SIZE - DOT_EDGE_GAP;
      const leftPos = Math.max(
        rect.left + 10,
        Math.min(innerWidth - DOT_SIZE - DOT_EDGE_GAP, rightEdge),
      );
      const topPos = rect.top + Math.max(0, (rect.height - DOT_SIZE) / 2);
      this.dot.style.left = `${leftPos}px`;
      this.dot.style.top = `${topPos}px`;
    }
  }

  render(issues: Issue[], rectFor: (issue: Issue) => DOMRect[]): void {
    this.mount();
    if (this.host) this.host.dataset.issueCount = String(issues.length);
    this.queuedRender = { issues, rectFor };
    if (this.pending) return;
    this.pending = true;
    const frame = requestAnimationFrame(() => {
      this.renderFrame = undefined;
      this.pending = false;
      if (!this.root) return;
      const render = this.queuedRender;
      if (!render) return;
      // Diff against the live node set instead of destroy-all/recreate-all:
      // analysis responses re-render on every batch while issue count grows,
      // and full teardown churned DOM + click listeners per publish.
      const keep = new Set<string>();
      const nextNodes = new Map<string, HTMLElement[]>();
      for (const issue of render.issues) {
        const rects = render.rectFor(issue)
          .filter((rect) => rect.bottom >= -100 && rect.top <= innerHeight + 100);
        keep.add(issue.issueId);
        const existing = this.marks.get(issue.issueId);
        const signature = rectsSignature(issue, rects);
        if (existing && existing.length > 0 && existing[0].dataset.sig === signature) {
          nextNodes.set(issue.issueId, existing);
          continue;
        }
        if (existing) {
          for (const node of existing) node.remove();
        }
        const created: HTMLElement[] = [];
        if (issue.scope === 'local') {
          this.renderLocalIssue(issue, rects, created);
        } else {
          for (const rect of rects) {
            const node = document.createElement('i');
            node.dataset.issueId = issue.issueId;
            node.dataset.issueScope = issue.scope;
            node.className = issue.scope === 'paragraph'
              ? `paragraph ${issue.severity}`
              : `under ${issue.severity}`;
            const left = issue.scope === 'paragraph' ? rect.left - 8 : rect.left;
            node.style.left = `${left}px`;
            node.style.top = `${issue.scope === 'paragraph' ? rect.top : rect.bottom}px`;
            node.style.width = `${issue.scope === 'paragraph' ? 3 : rect.width}px`;
            node.style.height = `${issue.scope === 'paragraph' ? rect.height : UNDERLINE_HEIGHT}px`;
            node.dataset.sig = signature;
            this.root.append(node);
            created.push(node);
          }
        }
        for (const node of created) {
          if (!node.dataset.sig) node.dataset.sig = signature;
        }
        if (created.length) nextNodes.set(issue.issueId, created);
      }
      for (const [issueId, nodes] of this.marks) {
        if (!keep.has(issueId)) {
          for (const node of nodes) node.remove();
        }
      }
      this.marks = nextNodes;
    });
    if (this.pending) this.renderFrame = frame;
  }

  private renderLocalIssue(issue: Issue, rects: DOMRect[], out: HTMLElement[]): void {
    if (!this.root || rects.length === 0) return;
    const labelFontSize = this.editorFontSize * this.replacementFontScale;
    const segments = splitAcrossRects(issue.replacement, rects, (text, width) =>
      this.fitPrefix(text, width, labelFontSize));
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      if (!segment) continue;
      const rect = rects[Math.min(index, rects.length - 1)];
      const node = document.createElement('button');
      node.dataset.issueId = issue.issueId;
      node.dataset.issueScope = issue.scope;
      node.className = 'mark';
      const left = rect.left - LABEL_PADDING_PX;
      node.style.left = `${left}px`;
      node.style.top = `${rect.top}px`;
      node.style.width = 'auto';
      node.style.height = 'auto';
      const isLastSegment = index === segments.length - 1;
      const maxWidth = segments.length > 1
        ? isLastSegment
          ? Math.max(rect.width, innerWidth - Math.max(0, left) - 8)
          : Math.max(MIN_SEGMENT_WIDTH, rect.width)
        : innerWidth - Math.max(0, left) - 8;
      node.style.maxWidth = `${Math.max(MIN_SEGMENT_WIDTH, maxWidth)}px`;
      node.textContent = segment;
      node.title = issue.reason;
      node.setAttribute('aria-label', `${segment}：${issue.reason}`);
      node.addEventListener('click', () => this.onIssue?.(issue.issueId));
      this.root.append(node);
      out.push(node);
    }
  }

  private canvasCtx?: CanvasRenderingContext2D | null;

  private getCanvasContext(): CanvasRenderingContext2D | null {
    if (this.canvasCtx !== undefined) return this.canvasCtx;
    try {
      const canvas = document.createElement('canvas');
      // In jsdom without node-canvas, getContext returns null or throws
      if (typeof canvas.getContext !== 'function') {
        this.canvasCtx = null;
        return null;
      }
      this.canvasCtx = canvas.getContext('2d');
    } catch {
      this.canvasCtx = null;
    }
    return this.canvasCtx;
  }

  private fitPrefix(text: string, width: number, fontSize: number): number {
    const ctx = this.getCanvasContext();
    if (ctx) {
      const cacheKey = `${fontSize}|${this.editorFontFamily}|${Math.round(width)}|${text}`;
      const cached = this.fitCache.get(cacheKey);
      if (cached !== undefined) return cached;
      ctx.font = `${fontSize}px ${this.editorFontFamily}`;
      // Usable content width discounting padding
      const maxTextWidth = Math.max(0, width - LABEL_PADDING_PX * 2);
      let result: number;
      if (ctx.measureText(text).width <= maxTextWidth) {
        result = text.length;
      } else {
        let low = 0;
        let high = text.length;
        while (low < high) {
          const mid = Math.ceil((low + high) / 2);
          const measured = ctx.measureText(text.slice(0, mid)).width;
          if (measured <= maxTextWidth) low = mid;
          else high = mid - 1;
        }
        result = Math.max(1, low);
      }
      if (this.fitCache.size > 512) this.fitCache.clear();
      this.fitCache.set(cacheKey, result);
      return result;
    }

    const measure = this.ensureMeasure();
    measure.style.width = `${width}px`;
    measure.style.fontSize = `${fontSize}px`;
    // Fast path: the whole replacement fits on one line — a single forced
    // layout instead of ~log2(n) binary-search layouts per label segment.
    // This is the common case and previously dominated annotation cost.
    measure.textContent = text;
    const whole = document.createRange();
    whole.selectNodeContents(measure);
    const wholeRects = typeof whole.getClientRects === 'function' ? whole.getClientRects() : undefined;
    if (wholeRects === undefined || wholeRects.length <= 1) return text.length;
    let low = 0;
    let high = text.length;
    // Binary search always converges, but cap iterations defensively so a
    // degenerate layout (e.g. zero-width measure) can never spin forever.
    for (let guard = 0; low < high && guard < 100; guard++) {
      const mid = Math.ceil((low + high) / 2);
      measure.textContent = text.slice(0, mid);
      const range = document.createRange();
      range.selectNodeContents(measure);
      const lineRects = typeof range.getClientRects === 'function' ? range.getClientRects() : undefined;
      if (lineRects === undefined || lineRects.length <= 1) low = mid;
      else high = mid - 1;
    }
    return low;
  }

  private ensureMeasure(): HTMLDivElement {
    if (this.measure) return this.measure;
    const measure = document.createElement('div');
     measure.style.cssText = `position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;font-family:${this.editorFontFamily};white-space:normal;overflow-wrap:anywhere;box-sizing:border-box;margin:0;border:0;padding:${LABEL_PADDING_PX}px`;
    document.documentElement.append(measure);
    this.measure = measure;
    return measure;
  }

  clear(): void {
    if (this.renderFrame) cancelAnimationFrame(this.renderFrame);
    this.renderFrame = undefined;
    this.pending = false;
    this.queuedRender = undefined;
    this.marks.clear();
    this.fitCache.clear();
    this.measure?.remove();
    this.measure = undefined;
    this.host?.remove();
    this.host = undefined;
    this.root = undefined;
    this.dot = undefined;
  }
}

/** Stable signature so unchanged issue geometry reuses existing nodes. */
function rectsSignature(issue: Issue, rects: ReadonlyArray<DOMRect>): string {
  const rectPart = rects
    .map((rect) => `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)}`)
    .join(';');
  return `${issue.scope}|${issue.severity}|${issue.original}|${issue.replacement}|${rectPart}`;
}

function validColor(value: string): boolean {
  return value === 'transparent' || /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value);
}
